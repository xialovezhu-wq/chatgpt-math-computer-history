import { createHash } from "node:crypto";
import { chmod, open, readFile, rename, stat, writeFile } from "node:fs/promises";

const [asarPath] = process.argv.slice(2);

const expectedPath =
  "/Applications/ChatGPT-Math-Test-26.715.61943.app/Contents/Resources/app.asar";

if (asarPath !== expectedPath) {
  throw new Error(`Refusing to patch unexpected path: ${asarPath ?? "<missing>"}`);
}

const bgOld = Buffer.from(
  "ZnVuY3Rpb24gQkcoZSl7aWYoIWUuc3RhcnRzV2l0aChgXFwoYCkpcmV0dXJuO2xldCB0PWUuaW5kZXhPZihgXFwpYCwyKTtpZih0PT09LTEpcmV0dXJuO2xldCBuPWUuc2xpY2UoMCx0KzIpO2lmKCFuLmluY2x1ZGVzKGAKYCkpcmV0dXJue3R5cGU6YG1hdGhgLHJhdzpuLHRleHQ6ZS5zbGljZSgyLHQpLnRyaW0oKSxkaXNwbGF5OiExfX0=",
  "base64",
);
const bgNew = Buffer.from(
  "ZnVuY3Rpb24gQkcoZSl7bGV0IHQ9ZS5tYXRjaCgvXlwkKD8hWyRcc10pKFteXG5dKj9cUykoPzwhXFwpXCQoPyFcZCl8XlxcXCgoW15cbl0qPylcXFwpLyk7aWYodClyZXR1cm57dHlwZTpgbWF0aGAscmF3OnRbMF0sdGV4dDoodFsxXT8/dFsyXSkudHJpbSgpLGRpc3BsYXk6MH19ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA=",
  "base64",
);
const inlineOld = Buffer.from(
  "e25hbWU6YG1hdGhgLGxldmVsOmBpbmxpbmVgLHN0YXJ0KGUpe2xldCB0PWUuaW5kZXhPZihgXFwoYCk7cmV0dXJuIHQ9PT0tMT92b2lkIDA6dH0sdG9rZW5pemVyKGUpe3JldHVybiBCRyhlKX19",
  "base64",
);
const inlineNew = Buffer.from(
  "e25hbWU6YG1hdGhgLGxldmVsOmBpbmxpbmVgLHN0YXJ0KGUpe2xldCB0PWUuc2VhcmNoKC8oPzwhW1xcJF0pXCQoPyFcJCl8XFxcKC8pO3JldHVybn50P3Q6dm9pZCAwfSx0b2tlbml6ZXI6Qkd9",
  "base64",
);

const targetFile =
  "webview/assets/app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-BfxY_MI9.js";
const previouslyPatchedFile = "webview/assets/register-BqqwIOLc-CCd22j6C.js";

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function findAll(haystack, needle) {
  const offsets = [];
  let cursor = 0;
  while (cursor <= haystack.length - needle.length) {
    const offset = haystack.indexOf(needle, cursor);
    if (offset === -1) break;
    offsets.push(offset);
    cursor = offset + needle.length;
  }
  return offsets;
}

function parseArchive(archive) {
  const headerSize = archive.readUInt32LE(4);
  const jsonLength = archive.readUInt32LE(12);
  const jsonStart = 16;
  const jsonEnd = jsonStart + jsonLength;
  const headerText = archive.subarray(jsonStart, jsonEnd).toString("utf8");
  return {
    dataStart: 8 + headerSize,
    header: JSON.parse(headerText),
    headerText,
    jsonStart,
    jsonEnd,
  };
}

function archiveNode(header, filePath) {
  let node = header;
  for (const part of filePath.split("/")) {
    node = node.files?.[part];
    if (node == null) throw new Error(`ASAR entry not found: ${filePath}`);
  }
  return node;
}

function entryBytes(archive, dataStart, node) {
  const start = dataStart + Number(node.offset);
  return archive.subarray(start, start + node.size);
}

function refreshIntegrity(archive, dataStart, node) {
  if (node.integrity?.algorithm !== "SHA256") {
    throw new Error("Expected SHA256 integrity metadata");
  }
  const bytes = entryBytes(archive, dataStart, node);
  const blockSize = node.integrity.blockSize;
  node.integrity.hash = sha256(bytes);
  node.integrity.blocks = [];
  for (let offset = 0; offset < bytes.length; offset += blockSize) {
    node.integrity.blocks.push(sha256(bytes.subarray(offset, offset + blockSize)));
  }
}

function replaceOnce(archive, oldBytes, newBytes, label) {
  if (oldBytes.length !== newBytes.length) {
    throw new Error(`${label} replacement changes byte length`);
  }
  const oldOffsets = findAll(archive, oldBytes);
  const newOffsets = findAll(archive, newBytes);
  if (oldOffsets.length !== 1 || newOffsets.length !== 0) {
    throw new Error(
      `${label}: expected old=1 and new=0, found old=${oldOffsets.length}, new=${newOffsets.length}`,
    );
  }
  newBytes.copy(archive, oldOffsets[0]);
  return oldOffsets[0];
}

function verifyTokenizer(bgSource, inlineSource) {
  const BG = (0, eval)(`(${bgSource.trim()})`);
  globalThis.BG = BG;
  let extension;
  try {
    extension = (0, eval)(`(${inlineSource})`);
  } finally {
    delete globalThis.BG;
  }

  const cases = [
    [String.raw`$t \to 0$`, "t \\to 0"],
    [String.raw`$f'(x)$`, "f'(x)"],
    [String.raw`$f(x) = \text{某个函数} + C$`, String.raw`f(x) = \text{某个函数} + C`],
    [String.raw`\(x+1\)`, "x+1"],
  ];
  for (const [source, expectedText] of cases) {
    const token = BG(source);
    if (token?.type !== "math" || token.text !== expectedText || token.display !== 0) {
      throw new Error(`Tokenizer failed positive case: ${JSON.stringify(source)}`);
    }
  }

  for (const source of ["$$x$$", "$ 100 $", "$x\n+y$", "$100 and $200"]) {
    if (BG(source) !== undefined) {
      throw new Error(`Tokenizer accepted protected case: ${JSON.stringify(source)}`);
    }
  }
  if (extension.start(String.raw`price \$100`) !== undefined) {
    throw new Error("Inline start matched an escaped dollar sign");
  }
  if (extension.start("$$x$$") !== undefined) {
    throw new Error("Inline start matched a double-dollar delimiter");
  }
  if (extension.start(String.raw`text $x$`) !== 5) {
    throw new Error("Inline start failed to locate a paired-dollar candidate");
  }
}

verifyTokenizer(bgNew.toString("utf8"), inlineNew.toString("utf8"));

const beforeStat = await stat(asarPath);
const archive = await readFile(asarPath);
const beforeHash = sha256(archive);
const beforeSize = archive.length;
const parsed = parseArchive(archive);
const targetNode = archiveNode(parsed.header, targetFile);
const targetStart = parsed.dataStart + Number(targetNode.offset);
const targetEnd = targetStart + targetNode.size;

const bgOffset = replaceOnce(archive, bgOld, bgNew, "inline tokenizer");
const inlineOffset = replaceOnce(archive, inlineOld, inlineNew, "inline extension");

for (const [label, offset] of [
  ["inline tokenizer", bgOffset],
  ["inline extension", inlineOffset],
]) {
  if (offset < targetStart || offset >= targetEnd) {
    throw new Error(`${label} was found outside the expected renderer chunk`);
  }
}

refreshIntegrity(archive, parsed.dataStart, targetNode);
refreshIntegrity(
  archive,
  parsed.dataStart,
  archiveNode(parsed.header, previouslyPatchedFile),
);

const updatedHeaderText = JSON.stringify(parsed.header);
if (Buffer.byteLength(updatedHeaderText) !== Buffer.byteLength(parsed.headerText)) {
  throw new Error("Updated ASAR header changed byte length");
}
archive.write(updatedHeaderText, parsed.jsonStart, "utf8");

if (archive.length !== beforeSize) throw new Error("Patched archive changed size");
if (findAll(archive, bgOld).length !== 0 || findAll(archive, bgNew).length !== 1) {
  throw new Error("Inline tokenizer post-patch verification failed");
}
if (findAll(archive, inlineOld).length !== 0 || findAll(archive, inlineNew).length !== 1) {
  throw new Error("Inline extension post-patch verification failed");
}

const reparsed = parseArchive(archive);
for (const filePath of [targetFile, previouslyPatchedFile]) {
  const node = archiveNode(reparsed.header, filePath);
  const actualHash = sha256(entryBytes(archive, reparsed.dataStart, node));
  if (actualHash !== node.integrity.hash) {
    throw new Error(`Integrity mismatch after patch: ${filePath}`);
  }
}

const temporaryPath = `${asarPath}.math-render.tmp`;
await writeFile(temporaryPath, archive, { mode: beforeStat.mode });
await chmod(temporaryPath, beforeStat.mode);
const temporaryHandle = await open(temporaryPath, "r");
try {
  await temporaryHandle.sync();
} finally {
  await temporaryHandle.close();
}
await rename(temporaryPath, asarPath);

const written = await readFile(asarPath);
if (sha256(written) !== sha256(archive)) {
  throw new Error("Written archive hash does not match prepared archive");
}

console.log(
  JSON.stringify(
    {
      asarPath,
      size: archive.length,
      beforeHash,
      afterHash: sha256(archive),
      bgOffset,
      inlineOffset,
      targetEntryHash: archiveNode(reparsed.header, targetFile).integrity.hash,
      tokenizerTests: "passed",
      archiveIntegrity: "refreshed",
    },
    null,
    2,
  ),
);
