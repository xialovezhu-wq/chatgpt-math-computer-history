import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const [sourcePath, outputPath] = process.argv.slice(2);
const expectedSource = "/Users/USER_NAME/Documents/Codex/2026-07-20/t-0-f-x-f-1/work/build/app.asar.26.814.41407-user-bubble-and-annotations-math";
const expectedOutput = "/Users/USER_NAME/Documents/Codex/2026-07-20/t-0-f-x-f-1/work/build/app.asar.26.814.41407-math-history-proxy";
const expectedSourceHash = "31c9e00595d3836611632541492711be9d7b4f2a5085ae519ffb16cc4c1f795a";
const targetFile = ".vite/build/main-DkjTIhil.js";

if (sourcePath !== expectedSource || outputPath !== expectedOutput) {
  throw new Error(`Unexpected paths: source=${sourcePath} output=${outputPath}`);
}

const helper = "async function codexMathHistoryCall(e,t={}){let{execFile:n}=await import(`node:child_process`);return await new Promise((r,i)=>n(`/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node`,[`/Users/USER_NAME/Library/Application Support/Codex Math History Companion/mcp-call.mjs`,e,JSON.stringify(t)],{timeout:15e3,maxBuffer:1048576},(e,t)=>{if(e){i(e);return}try{r(JSON.parse(t))}catch(e){i(e)}}))}";
const classAnchor = "var bue=class";
const replacements = [
  [
    "async getState(){let e=this.#i(),[t,n]=await Promise.all([this.appServerConnection.isChronicleFeatureConfigured(),e.status()]);return this.#t(t,n.state)}",
    "async getState(){let[e,t]=await Promise.all([this.appServerConnection.isChronicleFeatureConfigured(),codexMathHistoryCall(`computer_history_status`)]);return this.#t(e,t.state)}",
  ],
  [
    "async pause(){let e=await this.#i().pause();return this.#t(!0,e.state)}",
    "async pause(){let e=await codexMathHistoryCall(`computer_history_pause`);return this.#t(!0,e.state)}",
  ],
  [
    "async resume(){this.#r();let e=await this.appServerConnection.resumeChronicleSidecar();return this.#t(e.enabled,e.running?`running`:`stopped`)}",
    "async resume(){this.#r();let e=await codexMathHistoryCall(`computer_history_resume`);return this.#t(!0,e.state)}",
  ],
  [
    "async getSettings(){return this.#i().getSettings()}",
    "async getSettings(){return codexMathHistoryCall(`computer_history_get_settings`)}",
  ],
  [
    "async updateSettings(e){return this.#i().updateSettings(e)}",
    "async updateSettings(e){return codexMathHistoryCall(`computer_history_update_settings`,e)}",
  ],
];

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function count(source, needle) {
  let total = 0;
  let offset = 0;
  while ((offset = source.indexOf(needle, offset)) !== -1) {
    total += 1;
    offset += needle.length;
  }
  return total;
}

function replaceOnce(source, oldText, newText) {
  if (count(source, oldText) !== 1) throw new Error(`Anchor count mismatch: ${oldText}`);
  return source.replace(oldText, newText);
}

function parseArchive(archive) {
  const headerSize = archive.readUInt32LE(4);
  const jsonLength = archive.readUInt32LE(12);
  const headerText = archive.subarray(16, 16 + jsonLength).toString("utf8");
  return { dataStart: 8 + headerSize, header: JSON.parse(headerText), headerText };
}

function buildHeader(header) {
  const headerText = JSON.stringify(header);
  const json = Buffer.from(headerText);
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

function nodeAt(header, path) {
  let node = header;
  for (const part of path.split("/")) node = node.files?.[part];
  if (!node) throw new Error(`Missing entry: ${path}`);
  return node;
}

function entryBytes(archive, dataStart, node) {
  const start = dataStart + Number(node.offset);
  return archive.subarray(start, start + node.size);
}

function setIntegrity(node, bytes) {
  if (node.integrity?.algorithm !== "SHA256") throw new Error("Missing SHA256 integrity");
  node.integrity.hash = sha256(bytes);
  node.integrity.blocks = [];
  for (let offset = 0; offset < bytes.length; offset += node.integrity.blockSize) {
    node.integrity.blocks.push(sha256(bytes.subarray(offset, offset + node.integrity.blockSize)));
  }
}

const sourceStat = await stat(sourcePath);
const source = await readFile(sourcePath);
if (sha256(source) !== expectedSourceHash) throw new Error("Source hash mismatch");
const parsed = parseArchive(source);
if (JSON.stringify(parsed.header) !== parsed.headerText) throw new Error("Header round-trip mismatch");
const targetNode = nodeAt(parsed.header, targetFile);
const original = entryBytes(source, parsed.dataStart, targetNode);
if (sha256(original) !== targetNode.integrity.hash) throw new Error("Original entry integrity mismatch");

let modified = original.toString("utf8");
modified = replaceOnce(modified, classAnchor, `${helper};${classAnchor}`);
for (const [oldText, newText] of replacements) modified = replaceOnce(modified, oldText, newText);
if (count(modified, "codexMathHistoryCall") !== 6) throw new Error("Unexpected proxy marker count");
const modifiedBytes = Buffer.from(modified);
const originalData = source.subarray(parsed.dataStart);
targetNode.offset = String(originalData.length);
targetNode.size = modifiedBytes.length;
setIntegrity(targetNode, modifiedBytes);

const rebuiltHeader = buildHeader(parsed.header);
const output = Buffer.concat([rebuiltHeader.bytes, originalData, modifiedBytes]);
const verified = parseArchive(output);
const verifiedNode = nodeAt(verified.header, targetFile);
const verifiedEntry = entryBytes(output, verified.dataStart, verifiedNode);
if (!verifiedEntry.equals(modifiedBytes)) throw new Error("Rebuilt target mismatch");
if (sha256(verifiedEntry) !== verifiedNode.integrity.hash) throw new Error("Rebuilt integrity mismatch");
if (!output.subarray(verified.dataStart, verified.dataStart + originalData.length).equals(originalData)) {
  throw new Error("Original data prefix changed");
}

await mkdir(dirname(outputPath), { recursive: true });
const temporary = `${outputPath}.tmp`;
await writeFile(temporary, output, { mode: sourceStat.mode });
await rename(temporary, outputPath);

console.log(JSON.stringify({
  sourceHash: sha256(source),
  outputHash: sha256(output),
  outputHeaderHash: sha256(Buffer.from(rebuiltHeader.headerText)),
  targetFile,
  originalSize: original.length,
  modifiedSize: modifiedBytes.length,
  targetHash: verifiedNode.integrity.hash,
  markerCount: count(modified, "codexMathHistoryCall"),
}, null, 2));
