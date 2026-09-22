import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function parseArchive(archive) {
  const headerSize = archive.readUInt32LE(4);
  const jsonLength = archive.readUInt32LE(12);
  const headerText = archive.subarray(16, 16 + jsonLength).toString("utf8");
  const header = JSON.parse(headerText);
  if (JSON.stringify(header) !== headerText) {
    throw new Error("ASAR header does not round-trip exactly");
  }
  return { dataStart: 8 + headerSize, header, headerSize, headerText, jsonLength };
}

export function buildArchiveHeader(header) {
  const headerText = JSON.stringify(header);
  const json = Buffer.from(headerText, "utf8");
  const stringPayloadSize = Math.ceil((4 + json.length + 1) / 4) * 4;
  const headerSize = 4 + stringPayloadSize;
  const bytes = Buffer.alloc(8 + headerSize);
  bytes.writeUInt32LE(4, 0);
  bytes.writeUInt32LE(headerSize, 4);
  bytes.writeUInt32LE(stringPayloadSize, 8);
  bytes.writeUInt32LE(json.length, 12);
  json.copy(bytes, 16);
  return { bytes, headerText };
}

export function nodeAt(header, filePath) {
  let node = header;
  for (const part of filePath.split("/")) {
    node = node.files?.[part];
    if (node == null) throw new Error(`Missing ASAR entry: ${filePath}`);
  }
  return node;
}

export function entryBytes(archive, dataStart, node) {
  if (node.unpacked) throw new Error("Cannot read an unpacked entry from the archive body");
  const start = dataStart + Number(node.offset);
  return archive.subarray(start, start + node.size);
}

export function findOffsets(source, needle) {
  const wanted = Buffer.isBuffer(needle) ? needle : Buffer.from(needle, "utf8");
  const offsets = [];
  let cursor = 0;
  while (cursor <= source.length - wanted.length) {
    const offset = source.indexOf(wanted, cursor);
    if (offset === -1) break;
    offsets.push(offset);
    cursor = offset + wanted.length;
  }
  return offsets;
}

export function count(source, needle) {
  return findOffsets(source, needle).length;
}

export function replaceExactlyOnce(source, oldValue, newValue, label) {
  const oldBytes = Buffer.isBuffer(oldValue) ? oldValue : Buffer.from(oldValue, "utf8");
  const newBytes = Buffer.isBuffer(newValue) ? newValue : Buffer.from(newValue, "utf8");
  const offsets = findOffsets(source, oldBytes);
  if (offsets.length !== 1) {
    throw new Error(`${label}: expected one match, found ${offsets.length}`);
  }
  return Buffer.concat([
    source.subarray(0, offsets[0]),
    newBytes,
    source.subarray(offsets[0] + oldBytes.length),
  ]);
}

export function setIntegrity(node, bytes) {
  if (node.integrity?.algorithm !== "SHA256") {
    throw new Error("Expected SHA256 entry integrity metadata");
  }
  node.integrity.hash = sha256(bytes);
  node.integrity.blocks = [];
  if (bytes.length === 0) node.integrity.blocks.push(sha256(bytes));
  for (let offset = 0; offset < bytes.length; offset += node.integrity.blockSize) {
    node.integrity.blocks.push(
      sha256(bytes.subarray(offset, offset + node.integrity.blockSize)),
    );
  }
}

export function walkFiles(node, prefix = "", output = []) {
  for (const [name, child] of Object.entries(node.files ?? {})) {
    const filePath = prefix ? `${prefix}/${name}` : name;
    if (child.files) walkFiles(child, filePath, output);
    else output.push([filePath, child]);
  }
  return output;
}

export function appendReplacements(sourceArchive, replacements) {
  const parsed = parseArchive(sourceArchive);
  const originalData = sourceArchive.subarray(parsed.dataStart);
  const appended = [];
  let nextOffset = originalData.length;
  for (const [filePath, bytes] of replacements) {
    const node = nodeAt(parsed.header, filePath);
    node.offset = String(nextOffset);
    node.size = bytes.length;
    setIntegrity(node, bytes);
    appended.push(bytes);
    nextOffset += bytes.length;
  }
  const rebuilt = buildArchiveHeader(parsed.header);
  const output = Buffer.concat([rebuilt.bytes, originalData, ...appended]);
  const verified = parseArchive(output);
  if (verified.headerText !== rebuilt.headerText) {
    throw new Error("Rebuilt ASAR header does not round-trip exactly");
  }
  if (
    !output
      .subarray(verified.dataStart, verified.dataStart + originalData.length)
      .equals(originalData)
  ) {
    throw new Error("Original ASAR data prefix changed");
  }
  for (const [filePath, expected] of replacements) {
    const node = nodeAt(verified.header, filePath);
    const actual = entryBytes(output, verified.dataStart, node);
    if (!actual.equals(expected) || sha256(actual) !== node.integrity.hash) {
      throw new Error(`Rebuilt target mismatch: ${filePath}`);
    }
  }
  return { output, outputHeaderHash: sha256(Buffer.from(rebuilt.headerText, "utf8")) };
}

export async function writeAtomic(outputPath, bytes, mode) {
  await mkdir(dirname(outputPath), { recursive: true });
  const temporaryPath = `${outputPath}.tmp`;
  await writeFile(temporaryPath, bytes, { mode });
  const handle = await open(temporaryPath, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, outputPath);
  const written = await readFile(outputPath);
  if (sha256(written) !== sha256(bytes)) throw new Error("Atomic write hash mismatch");
}

export async function readArchiveWithStat(path) {
  const [bytes, fileStat] = await Promise.all([readFile(path), stat(path)]);
  return { bytes, fileStat };
}
