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
  new URL("../build/26.818.41509/app.asar.math-static.asar", import.meta.url),
);
const finalPath = fileURLToPath(
  new URL("../build/26.818.41509/app.asar.math-history-static.asar", import.meta.url),
);
const locks = {
  sourceHash: "8eb91bd9efbf9a4dd04b9b0afdbfcb4e0bab5da18c1919ad74ca327c00c7e791",
  sourceHeaderHash: "2923afd2f7a6bab88f30ff809919d83919f4ba3e61a1883303de6a9568ed3699",
  mathHash: "d7b57f6994404c7c2184d6268242c678817a5203fe67093c0cf61c0cedeed9bc",
  mathHeaderHash: "f0a14ed38be4acb8a2ab2fabe67c292840fb929794827b41270c34db6d4e683c",
  finalHash: "19095005e8ea6862aa5d04ddf92f60ef605ea38fb34e3dac4f05653a6c9b8a48",
  finalHeaderHash: "a2eabc8f1dcb8a4e75abdfb64935e6e083b3d99e47efc261b1796046460ae14b",
};
const targets = {
  extension: "webview/assets/user-formatted-text-BjT0CYhd.js",
  bubble: "webview/assets/subagent-activity-chip-group-fTxFK4Q1.js",
  annotation: "webview/assets/app-initial-DwVrCWuo.js",
  history: ".vite/build/main-u1nlBt5g.js",
};
const sharedMathConfig = "webview/assets/register-BqqwIOLc-CK1ALd49.js";
const sharedMathConfigHash =
  "d58eb8e02723da2395f21ecae1a5c8ee8ef104c4978f3332ca09269b721e4366";
const expectedOriginalEntryHashes = {
  [targets.extension]: "75227f94b2d8ce694184ccfefa7d47dd5d1158cae09f14a6b4b40c022abb3f81",
  [targets.bubble]: "89d10cec5fd942e5a9d024d282f1d5dfe9fc7cd8a16ef85355307f772481addb",
  [targets.annotation]: "563c6f6a40eb0ff7a7abaa61e212018c6427c1df4f512ace654d4b1038800691",
  [targets.history]: "d460cbd76aa5589593674c67cac7ab4a70071e0793ef0fc821031e1924f67e34",
};
const expectedCandidateEntryHashes = {
  [targets.extension]: "43013c0e8084f110d2538c07eacf0def0362a29957e38201bc8807e3e6fdf70d",
  [targets.bubble]: "8697dcd791d623ef64756dd7cf348b0dc214a02ec4e649e5c06ee94b63830038",
  [targets.annotation]: "99264f7788024ca3e962c02cfb198671badeec8abe22a94a6fb139d3d0a1e667",
  [targets.history]: "420042f30535bfc9cf8c03607623ff7056178df6a875139f931913b5337d2db4",
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
  if (count(extensionText, "function v(e){let n=(0,x.c)(21)") !== 1) {
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

const sourceSharedMath = entryBytes(
  source,
  sourceParsed.dataStart,
  nodeAt(sourceParsed.header, sharedMathConfig),
);
const finalSharedMath = entryBytes(
  final,
  finalParsed.dataStart,
  nodeAt(finalParsed.header, sharedMathConfig),
);
if (
  sha256(sourceSharedMath) !== sharedMathConfigHash ||
  sha256(finalSharedMath) !== sharedMathConfigHash ||
  !sourceSharedMath.equals(finalSharedMath)
) {
  throw new Error("Global shared math configuration changed");
}
if (
  count(finalSharedMath, "singleDollarTextMath:!1") !== 1 ||
  count(finalSharedMath, "singleDollarTextMath:!0") !== 0 ||
  count(final, "singleDollarTextMath:!0") !== 0
) {
  throw new Error("Global single-dollar configuration is not safely disabled");
}
if (count(final, "codex-single-dollar-math") !== 3) {
  throw new Error("User-only single-dollar surface count mismatch");
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
const originalAnnotation = entryBytes(
  source,
  sourceParsed.dataStart,
  nodeAt(sourceParsed.header, targets.annotation),
);
const originalBubble = entryBytes(
  source,
  sourceParsed.dataStart,
  nodeAt(sourceParsed.header, targets.bubble),
);

function windowAround(bytes, marker, radius = 4096) {
  const index = bytes.indexOf(Buffer.from(marker, "utf8"));
  if (index === -1) throw new Error(`Missing protected marker: ${marker}`);
  return bytes.subarray(Math.max(0, index - radius), Math.min(bytes.length, index + marker.length + radius));
}

if (
  !windowAround(originalBubble, "codex.conversation.roleHeading.assistant").equals(
    windowAround(bubble, "codex.conversation.roleHeading.assistant"),
  )
) {
  throw new Error("Assistant renderer protected window changed");
}
if (
  !windowAround(originalAnnotation, "throwOnError:!1").equals(
    windowAround(annotation, "throwOnError:!1"),
  )
) {
  throw new Error("KaTeX protected window changed");
}
verifyTokenizerAndNormalizer(extension, annotation);

const sentinelChecks = new Map([
  ["extension single-dollar", count(extension, "codex-single-dollar-math") === 1],
  ["extension annotation", count(extension, "codex-annotation-math") === 2],
  ["extension cache slot", count(extension, "n[20]===l") === 1],
  ["bubble single-dollar", count(bubble, "markdownClassName:`codex-single-dollar-math`") === 1],
  ["bubble annotation", count(bubble, "markdownClassName:`codex-annotation-math`") === 2],
  ["bubble dependency", count(bubble, "jc(),Dh(),OS=Z()") === 1],
  ["annotation extensions", count(annotation, "codexAnnotationMathExtensions") === 2],
  ["annotation normalizer", count(annotation, "codexNormalizeAnnotationMath") === 2],
  ["annotation dependency", count(annotation, "e5s(),qfa(),g4=J()") === 1],
  ["preview helper", count(annotation, "function codexMathComposerPreview(e)") === 1],
  ["preview button", count(annotation, "function codexMathPreviewButton(e)") === 1],
  [
    "preview dynamic same-component import",
    count(annotation, "import(`./user-formatted-text-BjT0CYhd.js`)") === 1,
  ],
  ["preview initializer", count(annotation, "return e.n(),{default:e.t}") === 1],
  ["Codex preview normalized raw text", count(annotation, "text:codexMathPreviewText") === 1],
  [
    "Codex preview setting gate",
    count(annotation, "codexPlainTextMode=JY(Ju.composerPlainTextMode)") === 1,
  ],
  [
    "Codex preview actual composer path",
    count(annotation, "function IGc(e){let t=(0,GGc.c)(197)") === 1,
  ],
  ["preview user class", count(annotation, "markdownClassName:`codex-single-dollar-math`") === 1],
  ["preview loading fallback", count(annotation, "data-codex-math-preview-loading") === 1],
  ["preview load-error fallback", count(annotation, "data-codex-math-preview-load-error") === 1],
  ["preview does not duplicate user extension", count(annotation, "codexMathExtensionOptions") === 0],
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
  [
    "assistant renderer marker unchanged",
    count(bubble, "codex.conversation.roleHeading.assistant") ===
      count(originalBubble, "codex.conversation.roleHeading.assistant"),
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
    globalSingleDollarDisabled: "passed",
    sharedMathConfigByteIdentical: "passed",
    assistantRendererMarkerUnchanged: "passed",
    composerPreviewDynamicSameComponent: "passed",
    composerPreviewNormalizedInputBinding: "passed",
    composerPreviewNoDuplicateExtension: "passed",
    historyMethods: "7 exactly-once replacements passed",
    mcpOperations: "5 mapped operations passed",
    nonTargetHistoryMethods: "unchanged sentinels passed",
  },
}, null, 2));
