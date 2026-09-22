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
const infoPath = "/Applications/ChatGPT.app/Contents/Info.plist";
const mathPath = fileURLToPath(
  new URL("../build/26.818.61809/app.asar.math-static.asar", import.meta.url),
);
const finalPath = fileURLToPath(
  new URL("../build/26.818.61809/app.asar.math-history-static.asar", import.meta.url),
);
const locks = {
  sourceHash: "76bbcdc2a4a2d77cfe03904a6537d0a655f9892f27a8925e3a6c7b613801d4cf",
  sourceHeaderHash: "b39c87c9fb4ccfbe0fec76c4e6e8e354ee8a105d28f7f8694421cc817c86d112",
  mathHash: "5eed54c90e683e2beb7c28de8770d57117ae5e694804563f13d9bcd89ce4efb6",
  mathHeaderHash: "940ad99700829aa669627b76f58ac4963bad85b46bb0eb454222680d15258dab",
  finalHash: "20af3332ab0fbf396eee9be3cde8e61e61025eca8287a1f0388fab03aa5c8e29",
  finalHeaderHash: "624b1fe2cd85d9a2d3877f9b275112e9e35e718abbb9e500231e736350876f3e",
};
const targets = {
  extension: "webview/assets/user-formatted-text-CaMb4KJx.js",
  bubble: "webview/assets/subagent-activity-chip-group-BjYM1hkl.js",
  annotation: "webview/assets/app-initial-q5My48Y-.js",
  history: ".vite/build/main-Io6iABGI.js",
};
const sharedMathConfig = "webview/assets/register-BqqwIOLc-DWSUxGip.js";
const sharedMathConfigHash =
  "ac294209fa6e51ffc1bb0eb6c14e8bc55b7e061c32cfe2552be632cda55ed6b1";
const expectedOriginalEntryHashes = {
  [targets.extension]: "3fd414fe28a945111cecf97580f201304e8414c4c820d917b3fbf7f181e2d999",
  [targets.bubble]: "6d2e3fa5310166ee9fb2f82ef32f85a6727e7ad1bcdeb8e3944a008bed805fe4",
  [targets.annotation]: "25eea9a386dfb47563a89086f4f4a32e569def5c36780805a46856d4d3448eb8",
  [targets.history]: "f616c93139e5b77f51f53ca8d774c06cfc90be7192b4ce373ed4755dfede4d07",
};
const expectedCandidateEntryHashes = {
  [targets.extension]: "7a88afe2570539f785fd703f7686ff235dbe5fce92d3855298d8caff251aeaf9",
  [targets.bubble]: "03477f65a350132fe68df7a37f7f1a60839e8de6f373832ba05df2ae24934b4a",
  [targets.annotation]: "027e94df00740ed2b99d882c1cf3b84f20494231a5fdaa79d187c1177bcbf1bc",
  [targets.history]: "c209cdccabfb6044e889d499f3a92d844ea5fd9be6095e1ba92b07bfd764ef6e",
};
const expectedIntegrityCounts = {
  packedCount: 8160,
  unpackedCount: 401,
  zeroByteCount: 1,
};

if (process.argv.length !== 2) throw new Error("Verifier accepts no path overrides");

function plistString(plist, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = plist.match(
    new RegExp(`<key>${escaped}</key>\\s*<string>([^<]+)</string>`),
  );
  if (match == null) throw new Error(`BLOCKED_SOURCE_DRIFT: missing plist key ${key}`);
  return match[1];
}

function verifyOfficialInfo(info) {
  if (
    plistString(info, "CFBundleShortVersionString") !== "26.818.61809" ||
    plistString(info, "CFBundleVersion") !== "7019" ||
    plistString(info, "CFBundleIdentifier") !== "com.openai.codex"
  ) {
    throw new Error("BLOCKED_SOURCE_DRIFT: official version, build, or identity");
  }
  const integrityMatch = info.match(
    /<key>ElectronAsarIntegrity<\/key>\s*<dict>\s*<key>Resources\/app\.asar<\/key>\s*<dict>\s*<key>algorithm<\/key>\s*<string>([^<]+)<\/string>\s*<key>hash<\/key>\s*<string>([0-9a-f]+)<\/string>/u,
  );
  if (
    integrityMatch == null ||
    integrityMatch[1] !== "SHA256" ||
    integrityMatch[2] !== locks.sourceHeaderHash
  ) {
    throw new Error("BLOCKED_SOURCE_DRIFT: ElectronAsarIntegrity lock");
  }
}

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

function verifyIntegrityCounts(actual, label) {
  if (JSON.stringify(actual) !== JSON.stringify(expectedIntegrityCounts)) {
    throw new Error(`${label}: ASAR entry counts changed`);
  }
  if (actual.packedCount + actual.unpackedCount !== 8561) {
    throw new Error(`${label}: total ASAR entry count changed`);
  }
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

const [info, source, math, final] = await Promise.all([
  readFile(infoPath, "utf8"),
  readFile(sourcePath),
  readFile(mathPath),
  readFile(finalPath),
]);
verifyOfficialInfo(info);
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
verifyIntegrityCounts(sourceIntegrity, "source");
verifyIntegrityCounts(mathIntegrity, "math");
verifyIntegrityCounts(finalIntegrity, "final");
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
  const bytes = entryBytes(source, sourceParsed.dataStart, node);
  if (
    node.integrity?.algorithm !== "SHA256" ||
    node.integrity.hash !== expectedHash ||
    sha256(bytes) !== expectedHash
  ) throw new Error(`Original lock mismatch: ${filePath}`);
}
for (const [filePath, expectedHash] of Object.entries(expectedCandidateEntryHashes)) {
  const node = nodeAt(finalParsed.header, filePath);
  const bytes = entryBytes(final, finalParsed.dataStart, node);
  if (
    node.integrity?.algorithm !== "SHA256" ||
    node.integrity.hash !== expectedHash ||
    sha256(bytes) !== expectedHash
  ) {
    throw new Error(`Candidate entry lock mismatch: ${filePath}`);
  }
}

for (const filePath of [targets.extension, targets.bubble, targets.annotation]) {
  const mathBytes = entryBytes(math, mathParsed.dataStart, nodeAt(mathParsed.header, filePath));
  const finalBytes = entryBytes(final, finalParsed.dataStart, nodeAt(finalParsed.header, filePath));
  if (!mathBytes.equals(finalBytes)) throw new Error(`Math target changed during History append: ${filePath}`);
}
const sourceHistoryBytes = entryBytes(
  source,
  sourceParsed.dataStart,
  nodeAt(sourceParsed.header, targets.history),
);
const mathHistoryBytes = entryBytes(
  math,
  mathParsed.dataStart,
  nodeAt(mathParsed.header, targets.history),
);
if (!sourceHistoryBytes.equals(mathHistoryBytes)) {
  throw new Error("History entry changed before the History build stage");
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
  count(originalBubble, "codex.conversation.roleHeading.assistant") !== 1 ||
  count(bubble, "codex.conversation.roleHeading.assistant") !== 1 ||
  !windowAround(originalBubble, "codex.conversation.roleHeading.assistant").equals(
    windowAround(bubble, "codex.conversation.roleHeading.assistant"),
  )
) {
  throw new Error("Assistant renderer protected window changed");
}
if (
  count(originalAnnotation, "throwOnError:!1") !== 1 ||
  count(annotation, "throwOnError:!1") !== 1 ||
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
  ["annotation dependency", count(annotation, "n5s(),Yfa(),g4=J()") === 1],
  [
    "annotation base Markdown initializer",
    count(annotation, "Yfa=n((()=>{qfa=l(),bx(),_R(),Eaa(),Aaa(),Zaa(),Wfa(),XS(),Jfa=J()}));") === 1,
  ],
  ["annotation renderer", count(annotation, "extensions:codexAnnotationMathExtensions") === 1],
  ["preview insertion anchor", count(annotation, "function xEc(e){let t=(0,w2.c)(84)") === 1],
  ["preview helper", count(annotation, "function codexMathComposerPreview(e)") === 1],
  [
    "preview selected-cwd atom",
    count(annotation, "function codexMathComposerPreview(e){let t=gs(Bj,e.conversationId),n=Y(bb),") === 1,
  ],
  [
    "preview rejects drifted LOCAL_PROJECTS atom",
    count(annotation, "function codexMathComposerPreview(e){let t=gs(Bj,e.conversationId),n=Y(Sb),") === 0,
  ],
  ["preview intl binding", count(annotation, "i=codexMathGetUserFormatted(),a=gd()") === 1],
  ["preview host fallback", count(annotation, "hostId:e.hostId??Zg") === 1],
  ["preview button", count(annotation, "function codexMathPreviewButton(e)") === 1],
  [
    "preview dynamic same-component import",
    count(annotation, "import(`./user-formatted-text-CaMb4KJx.js`)") === 1,
  ],
  ["preview initializer", count(annotation, "return e.n(),{default:e.t}") === 1],
  ["preview component exports", count(extension, "export{E as n,v as t}") === 1],
  ["preview get-text helper", count(annotation, "function jEc(e){return e.getText()}") === 1],
  ["preview get-text subscription", count(annotation, "codexMathText=cU(W,jEc,`document`)") === 1],
  ["Codex preview normalized raw text", count(annotation, "text:codexMathPreviewText") === 1],
  [
    "Codex preview setting gate",
    count(annotation, "codexPlainTextMode=JY(qu.composerPlainTextMode)") === 1,
  ],
  [
    "Codex preview actual composer path",
    count(annotation, "function RGc(e){let t=(0,qGc.c)(197)") === 1,
  ],
  ["preview user class", count(annotation, "markdownClassName:`codex-single-dollar-math`") === 1],
  ["preview loading fallback", count(annotation, "data-codex-math-preview-loading") === 1],
  ["preview load-error fallback", count(annotation, "data-codex-math-preview-load-error") === 1],
  ["preview composition guard", count(annotation, "W.view.composing") === 2],
  ["preview focus restoration", count(annotation, "window.requestAnimationFrame(()=>W.focus())") === 1],
  ["preview does not duplicate user extension", count(annotation, "codexMathExtensionOptions") === 0],
  [
    "bubble imports same formatted component",
    count(bubble, 'from"./user-formatted-text-CaMb4KJx.js"') === 1,
  ],
  [
    "annotation reverse bubble dependency",
    count(annotation, '"./subagent-activity-chip-group-BjYM1hkl.js"') === 1,
  ],
  [
    "annotation reverse formatted dependency",
    count(annotation, '"./user-formatted-text-CaMb4KJx.js"') === 1,
  ],
  ["History proxy", count(history, "codexMathHistoryCall") === 6],
  ["History ensure", count(history, "codexMathEnsureHistoryCompanion") === 3],
  [
    "History controller class",
    count(history, "var hue=class extends n.wt{appServerConnection;getController;isEligible;loadApplications;loadApplicationsByBundleIdentifier;history;constructor(e,t,n,r,i,a){super(),this.appServerConnection=e,this.getController=t,this.isEligible=n,this.loadApplications=r,this.loadApplicationsByBundleIdentifier=i,this.history=a}async getState()") === 1,
  ],
  ["History activation", count(history, "--user-activate") === 1],
  ["History tray resume remains", count(history, "resumeChronicleSidecar") === 1],
  ["History tray toggle unchanged", count(history, "toggleChronicleSidecar:async()=>") === 1],
  ["History enable-false boundary", count(history, "async setEnabled(e){if(!e)return this.#e();") === 1],
  ["History applications unchanged", count(history, "async listApplications(){return this.#r(),this.loadApplications()}") === 1],
  ["History list unchanged", count(history, "async listHistory(){return this.#r(),this.history.list()}") === 1],
  ["History clear unchanged", count(history, "async clearHistory(e,t){await this.#i().clearHistory(e,t)}") === 1],
  ["History status operation", count(history, "computer_history_status") === 1],
  ["History pause operation", count(history, "computer_history_pause") === 1],
  ["History resume operation", count(history, "computer_history_resume") === 1],
  ["History get-settings operation", count(history, "computer_history_get_settings") === 1],
  ["History update-settings operation", count(history, "computer_history_update_settings") === 1],
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

for (const marker of [
  "codex-single-dollar-math",
  "codex-annotation-math",
  "codexAnnotationMathExtensions",
  "codexNormalizeAnnotationMath",
  "codexMathComposerPreview",
  "codexMathHistoryCall",
  "codexMathEnsureHistoryCompanion",
  "--user-activate",
]) {
  if (count(source, marker) !== 0) throw new Error(`Official source already contains patch marker: ${marker}`);
}

const annotationText = annotation.toString("utf8");
const dependencyMapMatch = annotationText.match(/m\.f\|\|\(m\.f=(\[[^\]]*\])\)/u);
if (dependencyMapMatch == null) throw new Error("Preview Vite dependency map missing");
const dependencyMap = JSON.parse(dependencyMapMatch[1]);
const bubbleDependencyIndex = dependencyMap.indexOf("./subagent-activity-chip-group-BjYM1hkl.js");
const formattedTextDependencyIndex = dependencyMap.indexOf("./user-formatted-text-CaMb4KJx.js");
if (bubbleDependencyIndex !== 589 || formattedTextDependencyIndex !== 592) {
  throw new Error("Preview reverse dependency indices drifted");
}
const localImportMatch = annotationText.match(
  /await import\(`\.\/local-conversation-page-DVTe9xjA\.js`\)[\s\S]{0,900}__vite__mapDeps\(\[([^\]]+)\]\)/u,
);
if (localImportMatch == null) throw new Error("LocalConversation dynamic import closure missing");
const localDependencies = localImportMatch[1].split(",").map(Number);
if (
  !localDependencies.includes(bubbleDependencyIndex) ||
  !localDependencies.includes(formattedTextDependencyIndex)
) {
  throw new Error("Preview dependencies are absent from LocalConversation closure");
}

const oldHistoryMethods = [
  "async retryActivation(){this.#r();try{await this.appServerConnection.reconcileSkysightChronicle()}catch{}return this.getState()}",
  "async setEnabled(e){if(!e)return this.#e();let t=this.#i();try{let e=await this.appServerConnection.enableSkysightChronicle();return await this.#n(!0),this.#t(!0,e.state)}catch(e){let r=n.Wn(e);if(r===`pending`)return await this.#n(!0),{enabled:!0,recorderState:`stopped`,activationState:`waiting_for_permissions`};let i=[()=>t.disable(),()=>this.#n(!1)];return r===`denied`?(await dw(e,`Failed to enable Chronicle and roll back`,i),{enabled:!1,recorderState:`stopped`,activationState:`idle`}):uw(e,`Failed to enable Chronicle and roll back`,i)}}",
  "async getState(){let e=this.#i(),[t,n]=await Promise.all([this.appServerConnection.isChronicleFeatureConfigured(),e.status()]);return this.#t(t,n.state)}",
  "async pause(){let e=await this.#i().pause();return this.#t(!0,e.state)}",
  "async resume(){this.#r();let e=await this.appServerConnection.resumeChronicleSidecar();return this.#t(e.enabled,e.running?`running`:`stopped`)}",
  "async getSettings(){return this.#i().getSettings()}",
  "async updateSettings(e){return this.#i().updateSettings(e)}",
];
for (const method of oldHistoryMethods) {
  if (count(history, method) !== 0) throw new Error("An old History target method remains");
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
    path: "build/26.818.61809/app.asar.math-static.asar",
    hash: locks.mathHash,
    headerHash: locks.mathHeaderHash,
    size: math.length,
    metadataChangeCount: mathChanges.length,
    changedEntries: mathChanges,
  },
  finalCandidate: {
    path: "build/26.818.61809/app.asar.math-history-static.asar",
    hash: locks.finalHash,
    headerHash: locks.finalHeaderHash,
    size: final.length,
    metadataChangeCount: finalChanges.length,
    changedEntries: finalChanges,
  },
  integrity: {
    totalEntryCount: 8561,
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
    composerPreviewSelectedCwdAtom: "passed",
    composerPreviewRejectsLocalProjectsAtom: "passed",
    composerPreviewDependencyClosure: "passed",
    composerPreviewNormalizedInputBinding: "passed",
    composerPreviewNoDuplicateExtension: "passed",
    historyMethods: "7 exactly-once replacements passed",
    mcpOperations: "5 mapped operations passed",
    nonTargetHistoryMethods: "unchanged sentinels passed",
  },
}, null, 2));
