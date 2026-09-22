import { readFile } from "node:fs/promises";
import {
  count,
  entryBytes,
  nodeAt,
  parseArchive,
  sha256,
} from "./asar-static-utils.mjs";

const appPath = "/Applications/ChatGPT.app";
const infoPath = `${appPath}/Contents/Info.plist`;
const sourcePath = `${appPath}/Contents/Resources/app.asar`;
const expectedVersion = "26.818.41509";
const expectedBuild = "6962";
const expectedSourceHash =
  "8eb91bd9efbf9a4dd04b9b0afdbfcb4e0bab5da18c1919ad74ca327c00c7e791";
const expectedHeaderHash =
  "2923afd2f7a6bab88f30ff809919d83919f4ba3e61a1883303de6a9568ed3699";

const entries = {
  extension: {
    path: "webview/assets/user-formatted-text-BjT0CYhd.js",
    hash: "75227f94b2d8ce694184ccfefa7d47dd5d1158cae09f14a6b4b40c022abb3f81",
  },
  bubble: {
    path: "webview/assets/subagent-activity-chip-group-fTxFK4Q1.js",
    hash: "89d10cec5fd942e5a9d024d282f1d5dfe9fc7cd8a16ef85355307f772481addb",
  },
  annotation: {
    path: "webview/assets/app-initial-DwVrCWuo.js",
    hash: "563c6f6a40eb0ff7a7abaa61e212018c6427c1df4f512ace654d4b1038800691",
  },
  history: {
    path: ".vite/build/main-u1nlBt5g.js",
    hash: "d460cbd76aa5589593674c67cac7ab4a70071e0793ef0fc821031e1924f67e34",
  },
};

const registerEntry = {
  path: "webview/assets/register-BqqwIOLc-CK1ALd49.js",
  hash: "d58eb8e02723da2395f21ecae1a5c8ee8ef104c4978f3332ca09269b721e4366",
};

if (process.argv.length !== 2) {
  throw new Error("This version-locked checker accepts no arguments");
}

function plistString(plist, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = plist.match(
    new RegExp(`<key>${escaped}</key>\\s*<string>([^<]+)</string>`),
  );
  if (match == null) throw new Error(`BLOCKED_SOURCE_DRIFT: missing plist key ${key}`);
  return match[1];
}

function expectCount(bytes, marker, expected, label) {
  const actual = count(bytes, marker);
  if (actual !== expected) {
    throw new Error(`BLOCKED_BINDING: ${label} count=${actual}, expected=${expected}`);
  }
  return actual;
}

const [info, source] = await Promise.all([
  readFile(infoPath, "utf8"),
  readFile(sourcePath),
]);
const version = plistString(info, "CFBundleShortVersionString");
const build = plistString(info, "CFBundleVersion");
if (version !== expectedVersion || build !== expectedBuild) {
  throw new Error(`BLOCKED_SOURCE_DRIFT: version=${version}, build=${build}`);
}
if (sha256(source) !== expectedSourceHash) throw new Error("BLOCKED_SOURCE_DRIFT: ASAR hash");

const parsed = parseArchive(source);
const headerHash = sha256(Buffer.from(parsed.headerText, "utf8"));
if (headerHash !== expectedHeaderHash) throw new Error("BLOCKED_SOURCE_DRIFT: header hash");

const chunks = {};
const entryLocks = {};
for (const [role, target] of Object.entries(entries)) {
  const node = nodeAt(parsed.header, target.path);
  const bytes = entryBytes(source, parsed.dataStart, node);
  const actualHash = sha256(bytes);
  if (
    actualHash !== target.hash ||
    node.integrity?.algorithm !== "SHA256" ||
    node.integrity.hash !== target.hash
  ) {
    throw new Error(`BLOCKED_SOURCE_DRIFT: entry ${target.path}`);
  }
  chunks[role] = bytes;
  entryLocks[role] = { path: target.path, size: bytes.length, sha256: actualHash };
}

const anchors = [
  ["extension", "initializer", "}}}]}]}));function v", "retained"],
  ["extension", "variables", "var g,_=", "retained"],
  ["extension", "extension selection", "extensions:g", "retained"],
  ["extension", "cache size", "function v(e){let n=(0,x.c)(20)", "retained"],
  [
    "extension",
    "normalization cache",
    "n[0]===i?h=n[1]:(h=y(i),n[0]=i,n[1]=h);",
    "retained",
  ],
  [
    "bubble",
    "user bubble Markdown call",
    "(0,n_.jsx)(Oh,{cwd:r,externalLinkContextMenuConversationId:u,hostId:i,text:n})",
    "rebound",
  ],
  [
    "bubble",
    "selected annotation renderer",
    "l?(0,OS.jsx)(`pre`,{className:`mt-0.5 max-h-48 overflow-auto rounded-md bg-primary-soft px-3 py-2 font-mono text-xs whitespace-pre text-default select-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset`,role:`region`,\"aria-label\":n.formatMessage({id:`assistantMessage.responseAnnotation.multilineSelectionAriaLabel`,defaultMessage:`Selected annotation text, {lineCount} lines`,description:`Accessible label for a scrollable multiline response annotation selection`},{lineCount:c}),children:s.text}):(0,OS.jsx)(`div`,{className:`mt-0.5 break-words whitespace-pre-wrap select-text`,children:s.text})",
    "retained",
  ],
  [
    "bubble",
    "user comment renderer",
    "(0,OS.jsx)(`div`,{className:`mt-0.5 break-words whitespace-pre-wrap select-text`,children:s.annotation})",
    "rebound",
  ],
  [
    "bubble",
    "formatted text dependency",
    "var DS,OS,kS,AS=e((()=>{Am(),DS=t(Io(),1),Qo(),Ai(),jc(),OS=Z(),kS=`codex-annotation`}));",
    "rebound",
  ],
  ["annotation", "saved initializer", "function xRc(e){let t=(0,SRc.c)(7)", "rebound"],
  [
    "annotation",
    "saved renderer",
    "(0,g4.jsx)(`div`,{className:`mt-0.5 break-words whitespace-pre-wrap`,children:r})",
    "rebound",
  ],
  [
    "annotation",
    "base Markdown dependency",
    "var SRc,g4,CRc=n((()=>{SRc=l(),xd(),oX(),lz(),zE(),e5s(),g4=J()}));",
    "rebound",
  ],
  [
    "history",
    "retry activation",
    "async retryActivation(){this.#r();try{await this.appServerConnection.reconcileSkysightChronicle()}catch{}return this.getState()}",
    "retained",
  ],
  [
    "history",
    "set enabled",
    "async setEnabled(e){if(!e)return this.#e();let t=this.#i();try{let e=await this.appServerConnection.enableSkysightChronicle();return await this.#n(!0),this.#t(!0,e.state)}catch(e){let r=n.Wn(e);if(r===`pending`)return await this.#n(!0),{enabled:!0,recorderState:`stopped`,activationState:`waiting_for_permissions`};let i=[()=>t.disable(),()=>this.#n(!1)];return r===`denied`?(await dw(e,`Failed to enable Chronicle and roll back`,i),{enabled:!1,recorderState:`stopped`,activationState:`idle`}):uw(e,`Failed to enable Chronicle and roll back`,i)}}",
    "rebound",
  ],
  [
    "history",
    "get state",
    "async getState(){let e=this.#i(),[t,n]=await Promise.all([this.appServerConnection.isChronicleFeatureConfigured(),e.status()]);return this.#t(t,n.state)}",
    "retained",
  ],
  [
    "history",
    "pause",
    "async pause(){let e=await this.#i().pause();return this.#t(!0,e.state)}",
    "retained",
  ],
  [
    "history",
    "resume",
    "async resume(){this.#r();let e=await this.appServerConnection.resumeChronicleSidecar();return this.#t(e.enabled,e.running?`running`:`stopped`)}",
    "retained",
  ],
  [
    "history",
    "get settings",
    "async getSettings(){return this.#i().getSettings()}",
    "retained",
  ],
  [
    "history",
    "update settings",
    "async updateSettings(e){return this.#i().updateSettings(e)}",
    "retained",
  ],
  [
    "history",
    "helper insertion",
    "var hue=class extends n.wt{appServerConnection;getController;isEligible;loadApplications;loadApplicationsByBundleIdentifier;history;constructor(e,t,n,r,i,a){super(),this.appServerConnection=e,this.getController=t,this.isEligible=n,this.loadApplications=r,this.loadApplicationsByBundleIdentifier=i,this.history=a}async getState()",
    "rebound",
  ],
];

const matrix = anchors.map(([role, name, marker, binding]) => ({
  role,
  name,
  binding,
  entryCount: expectCount(chunks[role], marker, 1, `${role}/${name}`),
  archiveCount: count(source, marker),
}));
const retainedCount = matrix.filter((row) => row.binding === "retained").length;
const reboundCount = matrix.filter((row) => row.binding === "rebound").length;
if (retainedCount !== 12 || reboundCount !== 8) {
  throw new Error(`BLOCKED_BINDING: matrix ${retainedCount}/20 retained, ${reboundCount}/20 rebound`);
}

const semanticMarkers = {
  bubbleExternalLinkContextCount: [chunks.bubble, "externalLinkContextMenuConversationId", 1],
  bubbleAnnotationAriaCount: [
    chunks.bubble,
    "assistantMessage.responseAnnotation.multilineSelectionAriaLabel",
    1,
  ],
  bubbleFormattedTextImportCount: [
    chunks.bubble,
    'from"./user-formatted-text-BjT0CYhd.js"',
    1,
  ],
  annotationTargetFunctionCount: [chunks.annotation, "function xRc(e)", 1],
  annotationResponseTargetCount: [chunks.annotation, "responseAnnotationTargetId", 1],
  historyControllerClassCount: [
    chunks.history,
    "var hue=class extends n.wt{appServerConnection;getController;isEligible;loadApplications;loadApplicationsByBundleIdentifier;history;",
    1,
  ],
  historyReconcileCount: [chunks.history, "reconcileSkysightChronicle", 1],
  historyEnableCount: [chunks.history, "enableSkysightChronicle", 1],
  historyResumeCount: [chunks.history, "resumeChronicleSidecar", 2],
  historyTargetResumeMethodCount: [
    chunks.history,
    "async resume(){this.#r();let e=await this.appServerConnection.resumeChronicleSidecar()",
    1,
  ],
  historyTrayToggleCount: [chunks.history, "toggleChronicleSidecar:async()=>", 1],
};
const semanticChecks = Object.fromEntries(
  Object.entries(semanticMarkers).map(([name, [bytes, marker, expected]]) => [
    name,
    expectCount(bytes, marker, expected, name),
  ]),
);

const previewMarkers = {
  mainComposerCount: [chunks.annotation, "function bEc(e){let t=(0,w2.c)(488)", 1],
  getTextSnapshotCount: [chunks.annotation, "function kEc(e){return e.getText()}", 1],
  getTextSubscriptionCount: [chunks.annotation, "cU(Je,kEc,`document`)", 1],
  composerInputCount: [
    chunks.annotation,
    "Zn=(0,E2.jsx)(cV.Input,{ref:Wn,layout:Un,children:Xn})",
    1,
  ],
  composerFooterActionsCount: [
    chunks.annotation,
    "yr=(0,E2.jsxs)(cV.FooterActions,{children:[_r,vr]})",
    1,
  ],
  viewSourceMessageCount: [
    chunks.annotation,
    "id:`markdownFileEditor.mode.viewSource`",
    1,
  ],
  viewPreviewMessageCount: [
    chunks.annotation,
    "id:`markdownFileEditor.mode.viewPreview`",
    1,
  ],
  localConversationDynamicImportCount: [
    chunks.annotation,
    "await import(`./local-conversation-page-B5LUHmAw.js`)",
    1,
  ],
  formattedTextExportCount: [chunks.extension, "export{E as n,v as t}", 1],
  bubbleImportsAppInitialCount: [
    chunks.bubble,
    'from"./app-initial-DwVrCWuo.js"',
    1,
  ],
  bubbleImportsFormattedTextCount: [
    chunks.bubble,
    'from"./user-formatted-text-BjT0CYhd.js"',
    1,
  ],
  appInitialReverseBubbleDependencyCount: [
    chunks.annotation,
    '"./subagent-activity-chip-group-fTxFK4Q1.js"',
    1,
  ],
  appInitialReverseFormattedTextDependencyCount: [
    chunks.annotation,
    '"./user-formatted-text-BjT0CYhd.js"',
    1,
  ],
  assistantProtectionMarkerCount: [
    chunks.bubble,
    "codex.conversation.roleHeading.assistant",
    1,
  ],
};
const previewChecks = Object.fromEntries(
  Object.entries(previewMarkers).map(([name, [bytes, marker, expected]]) => [
    name,
    expectCount(bytes, marker, expected, name),
  ]),
);

const annotationText = chunks.annotation.toString("utf8");
const dependencyMapMatch = annotationText.match(/m\.f\|\|\(m\.f=(\[[^\]]*\])\)/);
if (dependencyMapMatch == null) throw new Error("BLOCKED_BINDING: Vite dependency map");
const dependencyMap = JSON.parse(dependencyMapMatch[1]);
const bubbleDependencyIndex = dependencyMap.indexOf(`./${entries.bubble.path.split("/").at(-1)}`);
const formattedTextDependencyIndex = dependencyMap.indexOf(
  `./${entries.extension.path.split("/").at(-1)}`,
);
if (bubbleDependencyIndex < 0 || formattedTextDependencyIndex < 0) {
  throw new Error("BLOCKED_BINDING: reverse dependency indices");
}
const localImportMatch = annotationText.match(
  /await import\(`\.\/local-conversation-page-B5LUHmAw\.js`\)[\s\S]{0,900}__vite__mapDeps\(\[([^\]]+)\]\)/,
);
if (localImportMatch == null) throw new Error("BLOCKED_BINDING: LocalConversation dynamic import");
const localDependencies = localImportMatch[1].split(",").map(Number);
if (
  !localDependencies.includes(bubbleDependencyIndex) ||
  !localDependencies.includes(formattedTextDependencyIndex)
) {
  throw new Error("BLOCKED_BINDING: LocalConversation reverse dependency closure");
}

const registerNode = nodeAt(parsed.header, registerEntry.path);
const registerBytes = entryBytes(source, parsed.dataStart, registerNode);
const registerHash = sha256(registerBytes);
if (
  registerHash !== registerEntry.hash ||
  registerNode.integrity?.algorithm !== "SHA256" ||
  registerNode.integrity.hash !== registerEntry.hash
) {
  throw new Error("BLOCKED_SOURCE_DRIFT: shared math config entry");
}
const sharedMathConfig = {
  path: registerEntry.path,
  sha256: registerHash,
  singleDollarTextMathFalseCount: expectCount(
    registerBytes,
    "singleDollarTextMath:!1",
    1,
    "shared math config false",
  ),
  singleDollarTextMathTrueCount: expectCount(
    registerBytes,
    "singleDollarTextMath:!0",
    0,
    "shared math config true",
  ),
};

const officialPatchMarkers = [
  "codex-single-dollar-math",
  "codex-annotation-math",
  "codexAnnotationMathExtensions",
  "codexNormalizeAnnotationMath",
  "codexMathHistoryCall",
  "codexMathEnsureHistoryCompanion",
  "--user-activate",
];
const officialPatchMarkerCounts = Object.fromEntries(
  officialPatchMarkers.map((marker) => [marker, expectCount(source, marker, 0, `official ${marker}`)]),
);

console.log(
  JSON.stringify(
    {
      status: "PASS_REBINDING",
      appPath,
      version,
      build,
      sourceHash: sha256(source),
      sourceHeaderHash: headerHash,
      entryLocks,
      retainedCount,
      reboundCount,
      matrix,
      semanticChecks,
      previewChecks: {
        ...previewChecks,
        bubbleDependencyIndex,
        formattedTextDependencyIndex,
        localConversationHasBubbleDependency: true,
        localConversationHasFormattedTextDependency: true,
      },
      sharedMathConfig,
      officialPatchMarkerCounts,
    },
    null,
    2,
  ),
);
