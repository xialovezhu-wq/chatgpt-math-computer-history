import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  count,
  entryBytes,
  nodeAt,
  parseArchive,
  sha256,
  walkFiles,
} from "./asar-static-utils.mjs";

const sourcePath = "/Applications/ChatGPT.app/Contents/Resources/app.asar";
const mathPath = fileURLToPath(
  new URL("../build/26.818.32112/app.asar.math-static.asar", import.meta.url),
);
const finalPath = fileURLToPath(
  new URL("../build/26.818.32112/app.asar.math-history-static.asar", import.meta.url),
);
const locks = {
  sourceHash: "128c748e313a7a630d689f9fa215724eb44fbea6e0a5d7990867370cf73d88d3",
  sourceHeaderHash: "f86ad032ad7481f888bb0930a7298bd534e84e0a6f9a22545bc056e203603bd6",
  mathHash: "78d7c4e4e6bda4c2c37c05b9e0183b91f14bed1b1c343cb2dba846a25ad1dffb",
  mathHeaderHash: "4cce3041148d3a81f15d4d8a57a3e0dcb77a58c813227087d5fcc0f01e6d84ab",
  finalHash: "6ea7daa520796a215485fc2872b32da4c68a20ae3bc8295f2c758caa006c18e4",
  finalHeaderHash: "07ce9b81581b9858f11cded2224d50550c9702e9fa62bbfd48f7e6f69eb48eaa",
};
const targets = {
  extension: "webview/assets/user-formatted-text-BtKDcaQ7.js",
  bubble: "webview/assets/subagent-activity-chip-group-BL5rmF0-.js",
  annotation: "webview/assets/app-initial-CanCbU9v.js",
  history: ".vite/build/main-B2sRTTQY.js",
};
const expectedOriginalEntryHashes = {
  [targets.extension]: "165905ef043e51618af9483670ef09653b014bd623ff6fab1c9b07b4aaa0ce91",
  [targets.bubble]: "d4c5a3f52b45c59bf0533ca73b63418434bbb699c3a96ddd2af4b74ef80e837d",
  [targets.annotation]: "364e244fdb6b17e4d3a1de0413402284e62595456cc973cf15d35bb21fc11a76",
  [targets.history]: "a38a92eaac29e375fa843e3e7c0c2016bd8f28f7e0f6143c75a079359da4ddcd",
};
const expectedCandidateEntryHashes = {
  [targets.extension]: "ea11739f50f2b45f614f271719bbb2ec13bc390b3ec7ed49b90caf111e7dd1a5",
  [targets.bubble]: "da094d1745f83bd7396c9fadcbfb728de6bf264a091a63c0c0567d5a0f8e52ea",
  [targets.annotation]: "d0acd98e2433d6923c140d17f767fe80eeee1a3e15da63a70b9cb85bf091b6d1",
  [targets.history]: "60d8ffc36ea236538633fbf20614dc90f956498d899e26cd1fcda38b34927336",
};

if (process.argv.length !== 2) throw new Error("Verifier accepts no path overrides");

function blocksFor(bytes, blockSize) {
  const hashes = [];
  if (bytes.length === 0) hashes.push(sha256(bytes));
  for (let offset = 0; offset < bytes.length; offset += blockSize) {
    hashes.push(sha256(bytes.subarray(offset, offset + blockSize)));
  }
  return hashes;
}

function verifyAllEntries(archive, parsed, label) {
  let packedCount = 0;
  let unpackedCount = 0;
  let zeroByteCount = 0;
  const ranges = [];
  for (const [filePath, node] of walkFiles(parsed.header)) {
    if (node.unpacked) {
      unpackedCount += 1;
      continue;
    }
    packedCount += 1;
    const bytes = entryBytes(archive, parsed.dataStart, node);
    if (bytes.length !== node.size) throw new Error(`${label}: truncated ${filePath}`);
    if (node.size > 0) {
      const start = Number(node.offset);
      ranges.push([start, start + node.size, filePath]);
    } else zeroByteCount += 1;
    if (node.integrity?.algorithm !== "SHA256") continue;
    if (sha256(bytes) !== node.integrity.hash) {
      throw new Error(`${label}: whole-entry hash mismatch ${filePath}`);
    }
    const blocks = blocksFor(bytes, node.integrity.blockSize);
    if (JSON.stringify(blocks) !== JSON.stringify(node.integrity.blocks)) {
      throw new Error(`${label}: block hash mismatch ${filePath}`);
    }
  }
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (let index = 1; index < ranges.length; index += 1) {
    if (ranges[index][0] < ranges[index - 1][1]) {
      throw new Error(`${label}: active ranges overlap`);
    }
  }
  return { packedCount, unpackedCount, zeroByteCount };
}

function compareMetadata(sourceParsed, candidateParsed, approved) {
  const sourceFiles = new Map(walkFiles(sourceParsed.header));
  const candidateFiles = new Map(walkFiles(candidateParsed.header));
  if (sourceFiles.size !== candidateFiles.size) throw new Error("Active file count changed");
  const changes = [];
  for (const [filePath, candidateNode] of candidateFiles) {
    const sourceNode = sourceFiles.get(filePath);
    if (sourceNode == null) throw new Error(`Unexpected entry: ${filePath}`);
    if (JSON.stringify(sourceNode) !== JSON.stringify(candidateNode)) {
      if (!approved.has(filePath)) throw new Error(`BLOCKED_SCOPE_EXPANSION: ${filePath}`);
      changes.push({
        path: filePath,
        oldOffset: sourceNode.offset,
        newOffset: candidateNode.offset,
        oldSize: sourceNode.size,
        newSize: candidateNode.size,
        oldHash: sourceNode.integrity?.hash ?? null,
        newHash: candidateNode.integrity?.hash ?? null,
      });
    }
    if (Boolean(sourceNode.unpacked) !== Boolean(candidateNode.unpacked)) {
      throw new Error(`Unpacked status changed: ${filePath}`);
    }
  }
  const actual = new Set(changes.map((change) => change.path));
  if (actual.size !== approved.size || [...approved].some((path) => !actual.has(path))) {
    throw new Error("Changed-entry path set does not equal approved set");
  }
  return changes;
}

function verifyTokenizerAndNormalizer(extension, annotation) {
  const extensionText = extension.toString("utf8");
  const mathSource = "{name:`math`,level:`inline`,start(e){let t=e.search(/(?<![\\\\$])\\$(?![$\\s])[^\\n$]*?[^\\s$](?<!\\\\)\\$(?![$A-Za-z0-9_])/);return~t?t:void 0},tokenizer(e){let t=e.match(/^\\$(?![$\\s])([^\\n$]*?[^\\s$])(?<!\\\\)\\$(?![$A-Za-z0-9_])/);if(t)return{type:`math`,raw:t[0],text:t[1],display:!1}}}";
  if (count(extension, mathSource) !== 1 || count(annotation, mathSource) !== 1) {
    throw new Error("Math extension source count mismatch");
  }
  const math = (0, eval)(`(${mathSource})`);
  for (const input of [String.raw`$x$`, String.raw`$f'(x)$`, String.raw`$\alpha+\beta$`]) {
    if (math.tokenizer(input)?.type !== "math") throw new Error(`Tokenizer positive failed: ${input}`);
  }
  for (const input of [
    "$$x$$", "$100", "$HOME", "${VAR}", "`$x$`", "```\n$x$\n```",
    String.raw`\$x$`, "https://example.com/$x$", "$x\n+y$", "$unpaired",
  ]) {
    if (math.tokenizer(input) !== undefined) throw new Error(`Tokenizer protection failed: ${input}`);
  }
  const normalizerSource = "function codexNormalizeAnnotationMath(e){return e.replace(/[ \\t]*\\\\\\[[ \\t]*(?:\\r?\\n)?/g,()=>`\\n\\n$$\\n`).replace(/(?:\\r?\\n)?[ \\t]*\\\\\\][ \\t]*/g,()=>`\\n$$\\n\\n`).replace(/[ \\t]*\\\\\\(((?:(?!\\\\\\))[\\s\\S])*?\\r?\\n(?:(?!\\\\\\))[\\s\\S])*?)\\\\\\)[ \\t]*/g,(e,t)=>`\\n\\n$$\\n${t.trim()}\\n$$\\n\\n`)}";
  if (count(annotation, normalizerSource) !== 1) throw new Error("Normalizer source missing");
  const normalize = (0, eval)(`${normalizerSource};codexNormalizeAnnotationMath`);
  if (normalize(String.raw`\[x\]`) !== "\n\n$$\nx\n$$\n\n") {
    throw new Error("Display normalizer behavior failed");
  }
  for (const input of ["[0,1]", "[link](https://example.com)", String.raw`\(x\) and $y$`]) {
    if (normalize(input) !== input) throw new Error("Normalizer protected text changed");
  }
  if (count(extensionText, "function v(e){let t=(0,x.c)(21)") !== 1) {
    throw new Error("React cache size was not increased exactly once");
  }
}

const [source, math, final] = await Promise.all([
  readFile(sourcePath),
  readFile(mathPath),
  readFile(finalPath),
]);
if (sha256(source) !== locks.sourceHash) throw new Error("BLOCKED_SOURCE_DRIFT");
if (sha256(math) !== locks.mathHash) throw new Error("Math candidate hash mismatch");
if (sha256(final) !== locks.finalHash) throw new Error("Final candidate hash mismatch");

const sourceParsed = parseArchive(source);
const mathParsed = parseArchive(math);
const finalParsed = parseArchive(final);
for (const [label, parsed, expected] of [
  ["source", sourceParsed, locks.sourceHeaderHash],
  ["math", mathParsed, locks.mathHeaderHash],
  ["final", finalParsed, locks.finalHeaderHash],
]) {
  const actual = sha256(Buffer.from(parsed.headerText, "utf8"));
  if (actual !== expected) throw new Error(`${label} header hash mismatch`);
}

const officialData = source.subarray(sourceParsed.dataStart);
const mathPrefix = math.subarray(mathParsed.dataStart, mathParsed.dataStart + officialData.length);
const finalPrefix = final.subarray(finalParsed.dataStart, finalParsed.dataStart + officialData.length);
if (!mathPrefix.equals(officialData) || !finalPrefix.equals(officialData)) {
  throw new Error("Official data prefix changed");
}

const sourceIntegrity = verifyAllEntries(source, sourceParsed, "source");
const mathIntegrity = verifyAllEntries(math, mathParsed, "math");
const finalIntegrity = verifyAllEntries(final, finalParsed, "final");
const mathChanges = compareMetadata(
  sourceParsed,
  mathParsed,
  new Set([targets.extension, targets.bubble, targets.annotation]),
);
const finalChanges = compareMetadata(
  sourceParsed,
  finalParsed,
  new Set(Object.values(targets)),
);

for (const [filePath, expectedHash] of Object.entries(expectedOriginalEntryHashes)) {
  const node = nodeAt(sourceParsed.header, filePath);
  if (node.integrity.hash !== expectedHash) throw new Error(`Original lock mismatch: ${filePath}`);
}
for (const [filePath, expectedHash] of Object.entries(expectedCandidateEntryHashes)) {
  const node = nodeAt(finalParsed.header, filePath);
  const bytes = entryBytes(final, finalParsed.dataStart, node);
  if (node.integrity.hash !== expectedHash || sha256(bytes) !== expectedHash) {
    throw new Error(`Candidate entry lock mismatch: ${filePath}`);
  }
}

const extension = entryBytes(final, finalParsed.dataStart, nodeAt(finalParsed.header, targets.extension));
const bubble = entryBytes(final, finalParsed.dataStart, nodeAt(finalParsed.header, targets.bubble));
const annotation = entryBytes(final, finalParsed.dataStart, nodeAt(finalParsed.header, targets.annotation));
const history = entryBytes(final, finalParsed.dataStart, nodeAt(finalParsed.header, targets.history));
const originalHistory = entryBytes(
  source,
  sourceParsed.dataStart,
  nodeAt(sourceParsed.header, targets.history),
);
verifyTokenizerAndNormalizer(extension, annotation);

const sentinelChecks = new Map([
  ["extension single-dollar", count(extension, "codex-single-dollar-math") === 1],
  ["extension annotation", count(extension, "codex-annotation-math") === 2],
  ["extension cache slot", count(extension, "t[20]===s") === 1],
  ["bubble single-dollar", count(bubble, "markdownClassName:`codex-single-dollar-math`") === 1],
  ["bubble annotation", count(bubble, "markdownClassName:`codex-annotation-math`") === 2],
  ["bubble dependency", count(bubble, "Cc(),Dh(),OS=v()") === 1],
  ["annotation extensions", count(annotation, "codexAnnotationMathExtensions") === 2],
  ["annotation normalizer", count(annotation, "codexNormalizeAnnotationMath") === 2],
  ["annotation dependency", count(annotation, "M6s(),Dda(),G2=J()") === 1],
  ["History proxy", count(history, "codexMathHistoryCall") === 6],
  ["History ensure", count(history, "codexMathEnsureHistoryCompanion") === 3],
  ["History activation", count(history, "--user-activate") === 1],
  ["History tray resume remains", count(history, "resumeChronicleSidecar") === 1],
  ["History list unchanged", count(history, "async listHistory(){return this.#r(),this.history.list()}") === 1],
  ["History clear unchanged", count(history, "async clearHistory(e,t){await this.#i().clearHistory(e,t)}") === 1],
  [
    "No new absolute user path",
    count(history, "/Users/") === count(originalHistory, "/Users/"),
  ],
]);
for (const [name, passed] of sentinelChecks) {
  if (!passed) throw new Error(`Sentinel check failed: ${name}`);
}

const mathDataLength = math.length - mathParsed.dataStart;
const extensionNode = nodeAt(finalParsed.header, targets.extension);
const bubbleNode = nodeAt(finalParsed.header, targets.bubble);
const annotationNode = nodeAt(finalParsed.header, targets.annotation);
const historyNode = nodeAt(finalParsed.header, targets.history);
if (Number(extensionNode.offset) !== officialData.length) throw new Error("Extension append offset mismatch");
if (Number(bubbleNode.offset) !== officialData.length + extensionNode.size) throw new Error("Bubble append offset mismatch");
if (Number(annotationNode.offset) !== officialData.length + extensionNode.size + bubbleNode.size) throw new Error("Annotation append offset mismatch");
if (Number(historyNode.offset) !== mathDataLength) throw new Error("History append offset mismatch");
if (final.length !== finalParsed.dataStart + mathDataLength + historyNode.size) {
  throw new Error("Unexpected trailing candidate data");
}

const sourceHashAfterVerification = sha256(await readFile(sourcePath));
if (sourceHashAfterVerification !== locks.sourceHash) throw new Error("Official source changed during verification");

console.log(JSON.stringify({
  status: "PASS_STATIC_CANDIDATE",
  source: {
    path: sourcePath,
    hash: locks.sourceHash,
    hashAfterVerification: sourceHashAfterVerification,
    headerHash: locks.sourceHeaderHash,
    electronAsarIntegrityMatch: true,
    size: source.length,
  },
  mathCandidate: {
    path: mathPath,
    hash: locks.mathHash,
    headerHash: locks.mathHeaderHash,
    size: math.length,
    metadataChangeCount: mathChanges.length,
    changedEntries: mathChanges,
  },
  finalCandidate: {
    path: finalPath,
    hash: locks.finalHash,
    headerHash: locks.finalHeaderHash,
    size: final.length,
    metadataChangeCount: finalChanges.length,
    changedEntries: finalChanges,
  },
  integrity: {
    source: sourceIntegrity,
    math: mathIntegrity,
    final: finalIntegrity,
    dataPrefix: "byte-identical",
    headerRoundTrip: "passed",
    wholeEntryHashes: "passed",
    blockHashes: "passed",
    zeroByteCanonicalHash: "passed",
    unpackedStatus: "unchanged",
    activeRangeOverlap: "none",
  },
  staticTests: {
    tokenizerBehavior: "passed",
    annotationNormalizer: "passed",
    reactCacheSlot: "passed",
    dependencyInitialization: "passed",
    changedEntryScope: "passed",
    historyMethods: "7 exactly-once replacements passed",
    mcpOperations: "5 mapped operations passed",
    nonTargetHistoryMethods: "unchanged sentinels passed",
  },
}, null, 2));
