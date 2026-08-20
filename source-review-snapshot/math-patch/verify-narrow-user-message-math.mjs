import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const sourcePath = "/Applications/ChatGPT.app/Contents/Resources/app.asar";
const candidatePath =
  "/Users/USER_NAME/Documents/Codex/2026-07-20/t-0-f-x-f-1/work/build/app.asar.26.814.41407-math-history-proxy";
const extensionTargetFile = "webview/assets/user-formatted-text-Bp-XdAPx.js";
const bubbleTargetFile =
  "webview/assets/subagent-activity-chip-group-BMNUltzO.js";
const annotationTargetFile = "webview/assets/app-initial-BCLYDefw.js";
const historyTargetFile = ".vite/build/main-DkjTIhil.js";
const targetFiles = new Set([
  extensionTargetFile,
  bubbleTargetFile,
  annotationTargetFile,
  historyTargetFile,
]);
const expectedSourceHash =
  "8fba32f8baa6d984b0f0f4149d3da46221e3adb3b52836f85fe65e31e655a8c0";
const expectedCandidateHash =
  "76295b39f44d2eb53b30f41de63d1b5a548524ef4a687ff35c514e2d3c993922";
const expectedHeaderHash =
  "632f5db2cea66426102e2e054aa1ac3adefd2b26360819ea9f9cd0c9b094fad9";
const expectedExtensionTargetHash =
  "a9020cd19a6e156065ebba4cced3869df02dd53e48cb95bb33631ceb99bc1c97";
const expectedBubbleTargetHash =
  "2a2fddb0a1d8279c15ccfebb6c5aeb6cc1a102a277b9cb74215cd9c293b73a19";
const expectedAnnotationTargetHash =
  "077112d4aff6f9c35f02fc3c3ddde68c1bfaca6b1375339e0cdda9eb373121de";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseArchive(archive) {
  const headerSize = archive.readUInt32LE(4);
  const jsonLength = archive.readUInt32LE(12);
  const dataStart = 8 + headerSize;
  const headerText = archive.subarray(16, 16 + jsonLength).toString("utf8");
  const header = JSON.parse(headerText);
  if (JSON.stringify(header) !== headerText) {
    throw new Error("ASAR header does not round-trip exactly");
  }
  return { dataStart, header, headerText };
}

function nodeAt(header, filePath) {
  let node = header;
  for (const part of filePath.split("/")) {
    node = node.files?.[part];
    if (node == null) throw new Error(`Missing ASAR entry: ${filePath}`);
  }
  return node;
}

function entryBytes(archive, dataStart, node) {
  const start = dataStart + Number(node.offset);
  return archive.subarray(start, start + node.size);
}

function walkFiles(node, prefix = "", output = []) {
  for (const [name, child] of Object.entries(node.files ?? {})) {
    const filePath = prefix ? `${prefix}/${name}` : name;
    if (child.files) walkFiles(child, filePath, output);
    else output.push([filePath, child]);
  }
  return output;
}

function findAll(bytes, needleText) {
  const needle = Buffer.from(needleText, "utf8");
  let cursor = 0;
  let count = 0;
  while (cursor <= bytes.length - needle.length) {
    const offset = bytes.indexOf(needle, cursor);
    if (offset === -1) break;
    count += 1;
    cursor = offset + needle.length;
  }
  return count;
}

const [source, candidate] = await Promise.all([
  readFile(sourcePath),
  readFile(candidatePath),
]);
if (sha256(source) !== expectedSourceHash) throw new Error("Source hash mismatch");
if (sha256(candidate) !== expectedCandidateHash) {
  throw new Error("Candidate hash mismatch");
}

const parsedSource = parseArchive(source);
const parsedCandidate = parseArchive(candidate);
if (sha256(Buffer.from(parsedCandidate.headerText, "utf8")) !== expectedHeaderHash) {
  throw new Error("Candidate header hash mismatch");
}
const sourceData = source.subarray(parsedSource.dataStart);
const candidatePrefix = candidate.subarray(
  parsedCandidate.dataStart,
  parsedCandidate.dataStart + sourceData.length,
);
if (!candidatePrefix.equals(sourceData)) {
  throw new Error("Original ASAR data prefix changed");
}

const sourceFiles = new Map(walkFiles(parsedSource.header));
const candidateFiles = new Map(walkFiles(parsedCandidate.header));
if (sourceFiles.size !== candidateFiles.size) {
  throw new Error("Active ASAR file count changed");
}

let metadataChangeCount = 0;
let integrityCount = 0;
const ranges = [];
for (const [filePath, candidateNode] of candidateFiles) {
  const sourceNode = sourceFiles.get(filePath);
  if (sourceNode == null) throw new Error(`Unexpected candidate entry: ${filePath}`);
  if (JSON.stringify(sourceNode) !== JSON.stringify(candidateNode)) {
    metadataChangeCount += 1;
    if (!targetFiles.has(filePath)) {
      throw new Error(`Unexpected metadata change: ${filePath}`);
    }
  }
  if (candidateNode.unpacked) continue;
  const bytes = entryBytes(candidate, parsedCandidate.dataStart, candidateNode);
  if (bytes.length !== candidateNode.size) {
    throw new Error(`Truncated ASAR entry: ${filePath}`);
  }
  if (candidateNode.size > 0) {
    const start = Number(candidateNode.offset);
    ranges.push([start, start + candidateNode.size, filePath]);
  }
  if (candidateNode.integrity?.algorithm !== "SHA256") continue;
  integrityCount += 1;
  if (sha256(bytes) !== candidateNode.integrity.hash) {
    throw new Error(`Whole-entry integrity mismatch: ${filePath}`);
  }
  const blocks = [];
  if (bytes.length === 0) blocks.push(sha256(bytes));
  for (
    let offset = 0;
    offset < bytes.length;
    offset += candidateNode.integrity.blockSize
  ) {
    blocks.push(
      sha256(bytes.subarray(offset, offset + candidateNode.integrity.blockSize)),
    );
  }
  if (JSON.stringify(blocks) !== JSON.stringify(candidateNode.integrity.blocks)) {
    throw new Error(`Block integrity mismatch: ${filePath}`);
  }
}
if (metadataChangeCount !== 4) {
  throw new Error(`Expected four metadata changes, found ${metadataChangeCount}`);
}

ranges.sort((left, right) => left[0] - right[0] || left[1] - right[1]);
for (let index = 1; index < ranges.length; index += 1) {
  const previous = ranges[index - 1];
  const current = ranges[index];
  if (current[0] < previous[1]) {
    throw new Error(`Active ASAR ranges overlap: ${previous[2]} and ${current[2]}`);
  }
}

const extensionTargetNode = nodeAt(parsedCandidate.header, extensionTargetFile);
const bubbleTargetNode = nodeAt(parsedCandidate.header, bubbleTargetFile);
const annotationTargetNode = nodeAt(parsedCandidate.header, annotationTargetFile);
const historyTargetNode = nodeAt(parsedCandidate.header, historyTargetFile);
const extensionTarget = entryBytes(
  candidate,
  parsedCandidate.dataStart,
  extensionTargetNode,
);
const bubbleTarget = entryBytes(
  candidate,
  parsedCandidate.dataStart,
  bubbleTargetNode,
);
const annotationTarget = entryBytes(
  candidate,
  parsedCandidate.dataStart,
  annotationTargetNode,
);
const historyTarget = entryBytes(
  candidate,
  parsedCandidate.dataStart,
  historyTargetNode,
);
if (extensionTargetNode.integrity.hash !== expectedExtensionTargetHash) {
  throw new Error("Extension target entry hash mismatch");
}
if (bubbleTargetNode.integrity.hash !== expectedBubbleTargetHash) {
  throw new Error("Bubble target entry hash mismatch");
}
if (annotationTargetNode.integrity.hash !== expectedAnnotationTargetHash) {
  throw new Error("Annotation target entry hash mismatch");
}
if (Number(extensionTargetNode.offset) !== sourceData.length) {
  throw new Error("Extension target is not appended after source data");
}
if (
  Number(bubbleTargetNode.offset) !==
  sourceData.length + extensionTarget.length
) {
  throw new Error("Bubble target is not appended after extension target");
}
if (
  Number(annotationTargetNode.offset) !==
  sourceData.length + extensionTarget.length + bubbleTarget.length
) {
  throw new Error("Annotation target is not appended after bubble target");
}
if (
  candidate.length !==
  parsedCandidate.dataStart +
    sourceData.length +
    extensionTarget.length +
    bubbleTarget.length +
    annotationTarget.length +
    historyTarget.length
) {
  throw new Error("Candidate contains unexpected trailing data");
}
if (
  Number(historyTargetNode.offset) !==
  sourceData.length +
    extensionTarget.length +
    bubbleTarget.length +
    annotationTarget.length
) {
  throw new Error("History target is not appended after annotation target");
}
if (historyTargetNode.integrity.hash !== "ed19424ed076e1240b44197eec59b53275d530820e50fc2152f671af87250206") {
  throw new Error("History target entry hash mismatch");
}
if (findAll(historyTarget, "codexMathHistoryCall") !== 6) {
  throw new Error("History proxy marker count mismatch");
}

function verifyCounts(target, label, expectedCounts) {
  for (const [marker, expectedCount] of expectedCounts) {
    const actualCount = findAll(target, marker);
    if (actualCount !== expectedCount) {
      throw new Error(
        `${label}: unexpected marker count for ${marker}: ${actualCount} != ${expectedCount}`,
      );
    }
  }
}

verifyCounts(
  extensionTarget,
  "Extension target",
  new Map([
    ["codex-single-dollar-math", 1],
    ["codex-annotation-math", 2],
    ["codexMathExtensionOptions", 3],
    ["codexUserMessageExtensions", 3],
    ["extensions:s===`codex-single-dollar-math`||s===`codex-annotation-math`?codexUserMessageExtensions:g", 1],
    ["extensions:c===`codex-single-dollar-math`||c===`codex-annotation-math`?codexUserMessageExtensions:g", 0],
    ["function v(e){let t=(0,x.c)(21)", 1],
    [
      "t[0]===n&&t[20]===s?h=t[1]:(h=s===`codex-annotation-math`?n.replace(/[ \\t]*\\\\\\[[ \\t]*(?:\\r?\\n)?/g,()=>`\\n\\n$$\\n`).replace(/(?:\\r?\\n)?[ \\t]*\\\\\\][ \\t]*/g,()=>`\\n$$\\n\\n`).replace(/[ \\t]*\\\\\\(((?:(?!\\\\\\))[\\s\\S])*?\\r?\\n(?:(?!\\\\\\))[\\s\\S])*?)\\\\\\)[ \\t]*/g,(e,t)=>`\\n\\n$$\\n${t.trim()}\\n$$\\n\\n`):y(n),t[0]=n,t[20]=s,t[1]=h);",
      1,
    ],
    ["markdownClassName:`codex-single-dollar-math`", 0],
  ]),
);
verifyCounts(
  bubbleTarget,
  "Bubble target",
  new Map([
    ["codex-single-dollar-math", 1],
    ["codex-annotation-math", 2],
    ["codexMathExtensionOptions", 0],
    ["codexUserMessageExtensions", 0],
    ["extensions:s===`codex-single-dollar-math`?codexUserMessageExtensions:g", 0],
    ["markdownClassName:`codex-single-dollar-math`", 1],
    ["markdownClassName:`codex-annotation-math`", 2],
    [
      "(0,GS.jsx)(fh,{className:`mt-0.5 max-h-48 overflow-auto break-words select-text`,markdownClassName:`codex-annotation-math`,text:l.text})",
      1,
    ],
    [
      "(0,GS.jsx)(fh,{className:`mt-0.5 max-h-48 overflow-auto break-words select-text`,markdownClassName:`codex-annotation-math`,text:l.annotation})",
      1,
    ],
    [
      "d?(0,GS.jsx)(`pre`,{className:`mt-0.5 max-h-48 overflow-auto rounded-md bg-primary-soft px-3 py-2 font-mono text-xs whitespace-pre text-default select-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset`",
      0,
    ],
    [
      "(0,GS.jsx)(`div`,{className:`mt-0.5 break-words whitespace-pre-wrap select-text`,children:l.annotation})",
      0,
    ],
    [
      "var WS,GS,KS,qS=e((()=>{Fi(),WS=t(Yd(),1),Ja(),Ef(),Wc(),dh(),GS=Y(),KS=`codex-annotation`}));",
      1,
    ],
  ]),
);
verifyCounts(
  annotationTarget,
  "Annotation target",
  new Map([
    ["codexAnnotationMathExtensions", 2],
    ["codexNormalizeAnnotationMath", 2],
    ["extensions:codexAnnotationMathExtensions", 1],
    ["function jhc(e){let t=(0,Mhc.c)(7)", 1],
    [
      "(0,f2.jsx)(CV,{className:`mt-0.5 break-words`,extensions:codexAnnotationMathExtensions,children:codexNormalizeAnnotationMath(r)})",
      1,
    ],
    [
      "(0,f2.jsx)(`div`,{className:`mt-0.5 break-words whitespace-pre-wrap`,children:r})",
      0,
    ],
    [
      "var Mhc,f2,Nhc=n((()=>{Mhc=l(),Ed(),vX(),Kz(),qE(),xGs(),Woa(),f2=J()}));",
      1,
    ],
  ]),
);

console.log(
  JSON.stringify(
    {
      sourceHash: sha256(source),
      candidateHash: sha256(candidate),
      candidateHeaderHash: sha256(
        Buffer.from(parsedCandidate.headerText, "utf8"),
      ),
      activeFileCount: candidateFiles.size,
      integrityCheckedCount: integrityCount,
      metadataChangeCount,
      extensionTargetSize: extensionTarget.length,
      extensionTargetHash: extensionTargetNode.integrity.hash,
      extensionTargetOffset: extensionTargetNode.offset,
      bubbleTargetSize: bubbleTarget.length,
      bubbleTargetHash: bubbleTargetNode.integrity.hash,
      bubbleTargetOffset: bubbleTargetNode.offset,
      annotationTargetSize: annotationTarget.length,
      annotationTargetHash: annotationTargetNode.integrity.hash,
      annotationTargetOffset: annotationTargetNode.offset,
      verification: "passed",
    },
    null,
    2,
  ),
);
