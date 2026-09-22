import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import {
  count,
  entryBytes,
  nodeAt,
  parseArchive,
  sha256,
  walkFiles,
} from "./asar-static-utils.mjs";

const execFileAsync = promisify(execFile);

const appPath = "/Applications/ChatGPT.app";
const infoPath = `${appPath}/Contents/Info.plist`;
const sourcePath = `${appPath}/Contents/Resources/app.asar`;
const expectedVersion = "26.818.61809";
const expectedBuild = "7019";
const expectedBundleId = "com.openai.codex";
const expectedSourceHash =
  "76bbcdc2a4a2d77cfe03904a6537d0a655f9892f27a8925e3a6c7b613801d4cf";
const expectedHeaderHash =
  "b39c87c9fb4ccfbe0fec76c4e6e8e354ee8a105d28f7f8694421cc817c86d112";

const expectedArchiveShape = {
  totalCount: 8561,
  packedCount: 8160,
  unpackedCount: 401,
  zeroByteCount: 1,
};

const entries = {
  extension: {
    path: "webview/assets/user-formatted-text-CaMb4KJx.js",
    hash: "3fd414fe28a945111cecf97580f201304e8414c4c820d917b3fbf7f181e2d999",
  },
  bubble: {
    path: "webview/assets/subagent-activity-chip-group-BjYM1hkl.js",
    hash: "6d2e3fa5310166ee9fb2f82ef32f85a6727e7ad1bcdeb8e3944a008bed805fe4",
  },
  annotation: {
    path: "webview/assets/app-initial-q5My48Y-.js",
    hash: "25eea9a386dfb47563a89086f4f4a32e569def5c36780805a46856d4d3448eb8",
  },
  history: {
    path: ".vite/build/main-Io6iABGI.js",
    hash: "f616c93139e5b77f51f53ca8d774c06cfc90be7192b4ce373ed4755dfede4d07",
  },
};

const dependencyEntries = {
  localConversation: {
    path: "webview/assets/local-conversation-page-DVTe9xjA.js",
    hash: "25578649c29e9dc1e543b5e45ad808f30a12ccd915f9eabbc8bc6b14b918f782",
  },
  sharedMathConfig: {
    path: "webview/assets/register-BqqwIOLc-DWSUxGip.js",
    hash: "ac294209fa6e51ffc1bb0eb6c14e8bc55b7e061c32cfe2552be632cda55ed6b1",
  },
};

if (process.argv.length !== 2) {
  throw new Error("This version-locked checker accepts no arguments");
}

function plistString(plist, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = plist.match(
    new RegExp(`<key>${escaped}</key>\\s*<string>([^<]+)</string>`),
  );
  if (match == null) {
    throw new Error(`BLOCKED_SOURCE_DRIFT: missing plist key ${key}`);
  }
  return match[1];
}

function expectCount(bytes, marker, expected, label) {
  const actual = count(bytes, marker);
  if (actual !== expected) {
    throw new Error(`BLOCKED_BINDING: ${label} count=${actual}, expected=${expected}`);
  }
  return actual;
}

function lockPackedEntry(source, parsed, target, label) {
  const node = nodeAt(parsed.header, target.path);
  const bytes = entryBytes(source, parsed.dataStart, node);
  const actualHash = sha256(bytes);
  if (
    actualHash !== target.hash ||
    node.integrity?.algorithm !== "SHA256" ||
    node.integrity.hash !== target.hash
  ) {
    throw new Error(`BLOCKED_SOURCE_DRIFT: ${label} entry`);
  }
  return {
    bytes,
    lock: { path: target.path, size: bytes.length, sha256: actualHash },
  };
}

async function verifyOfficialSignature() {
  try {
    await execFileAsync("/usr/bin/codesign", [
      "--verify",
      "--deep",
      "--strict",
      appPath,
    ]);
    const { stdout, stderr } = await execFileAsync("/usr/bin/codesign", [
      "-d",
      "-r-",
      appPath,
    ], { maxBuffer: 1024 * 1024 });
    const requirement = `${stdout}${stderr}`;
    expectCount(
      requirement,
      `identifier "${expectedBundleId}"`,
      1,
      "official designated requirement bundle identifier",
    );
    expectCount(
      requirement,
      "anchor apple generic",
      1,
      "official designated requirement Apple anchor",
    );
    if (!/designated\s*=>/.test(requirement) || !/certificate leaf\[/.test(requirement)) {
      throw new Error("BLOCKED_SOURCE_DRIFT: official designated requirement structure");
    }
    return {
      deepStrictVerification: true,
      designatedRequirementBundleIdBound: true,
      designatedRequirementAppleAnchor: true,
      designatedRequirementCertificateConstraint: true,
    };
  } catch (error) {
    if (String(error?.message).startsWith("BLOCKED_")) throw error;
    throw new Error("BLOCKED_SOURCE_DRIFT: official signature verification");
  }
}

const [info, source, signatureChecks, asarIntegrityResult] = await Promise.all([
  readFile(infoPath, "utf8"),
  readFile(sourcePath),
  verifyOfficialSignature(),
  execFileAsync("/usr/bin/plutil", [
    "-extract",
    "ElectronAsarIntegrity",
    "json",
    "-o",
    "-",
    infoPath,
  ], { maxBuffer: 1024 * 1024 }),
]);

const version = plistString(info, "CFBundleShortVersionString");
const build = plistString(info, "CFBundleVersion");
const bundleId = plistString(info, "CFBundleIdentifier");
if (
  version !== expectedVersion ||
  build !== expectedBuild ||
  bundleId !== expectedBundleId
) {
  throw new Error(
    `BLOCKED_SOURCE_DRIFT: version=${version}, build=${build}, bundleId=${bundleId}`,
  );
}
if (sha256(source) !== expectedSourceHash) {
  throw new Error("BLOCKED_SOURCE_DRIFT: ASAR hash");
}

const parsed = parseArchive(source);
const headerHash = sha256(Buffer.from(parsed.headerText, "utf8"));
if (headerHash !== expectedHeaderHash) {
  throw new Error("BLOCKED_SOURCE_DRIFT: header hash");
}

const asarIntegrity = JSON.parse(asarIntegrityResult.stdout)["Resources/app.asar"];
if (
  asarIntegrity?.algorithm !== "SHA256" ||
  asarIntegrity?.hash !== expectedHeaderHash
) {
  throw new Error("BLOCKED_SOURCE_DRIFT: ElectronAsarIntegrity");
}

let packedCount = 0;
let unpackedCount = 0;
let zeroByteCount = 0;
const allFiles = walkFiles(parsed.header);
for (const [, node] of allFiles) {
  if (node.unpacked) {
    unpackedCount += 1;
  } else {
    packedCount += 1;
    if (node.size === 0) zeroByteCount += 1;
  }
}
const archiveShape = {
  totalCount: allFiles.length,
  packedCount,
  unpackedCount,
  zeroByteCount,
};
if (JSON.stringify(archiveShape) !== JSON.stringify(expectedArchiveShape)) {
  throw new Error("BLOCKED_SOURCE_DRIFT: ASAR entry shape");
}

const chunks = {};
const entryLocks = {};
for (const [role, target] of Object.entries(entries)) {
  const locked = lockPackedEntry(source, parsed, target, role);
  chunks[role] = locked.bytes;
  entryLocks[role] = locked.lock;
}
const dependencyLocks = {};
const dependencyChunks = {};
for (const [role, target] of Object.entries(dependencyEntries)) {
  const locked = lockPackedEntry(source, parsed, target, role);
  dependencyChunks[role] = locked.bytes;
  dependencyLocks[role] = locked.lock;
}

const retainedAnchors = {
  extensionInitializer: "}}}]}]}));function v",
  extensionVariables: "var g,_=",
  extensionSelection: "extensions:g",
  extensionCache: "function v(e){let n=(0,x.c)(20)",
  extensionNormalization: "n[0]===i?h=n[1]:(h=y(i),n[0]=i,n[1]=h);",
  userBubble:
    "(0,n_.jsx)(Oh,{cwd:r,externalLinkContextMenuConversationId:u,hostId:i,text:n})",
  selectedAnnotation:
    "l?(0,OS.jsx)(`pre`,{className:`mt-0.5 max-h-48 overflow-auto rounded-md bg-primary-soft px-3 py-2 font-mono text-xs whitespace-pre text-default select-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset`,role:`region`,\"aria-label\":n.formatMessage({id:`assistantMessage.responseAnnotation.multilineSelectionAriaLabel`,defaultMessage:`Selected annotation text, {lineCount} lines`,description:`Accessible label for a scrollable multiline response annotation selection`},{lineCount:c}),children:s.text}):(0,OS.jsx)(`div`,{className:`mt-0.5 break-words whitespace-pre-wrap select-text`,children:s.text})",
  annotationComment:
    "(0,OS.jsx)(`div`,{className:`mt-0.5 break-words whitespace-pre-wrap select-text`,children:s.annotation})",
  bubbleDependency:
    "var DS,OS,kS,AS=e((()=>{Am(),DS=t(Io(),1),Qo(),Ai(),jc(),OS=Z(),kS=`codex-annotation`}));",
  savedRenderer:
    "(0,g4.jsx)(`div`,{className:`mt-0.5 break-words whitespace-pre-wrap`,children:r})",
  retryActivation:
    "async retryActivation(){this.#r();try{await this.appServerConnection.reconcileSkysightChronicle()}catch{}return this.getState()}",
  setEnabled:
    "async setEnabled(e){if(!e)return this.#e();let t=this.#i();try{let e=await this.appServerConnection.enableSkysightChronicle();return await this.#n(!0),this.#t(!0,e.state)}catch(e){let r=n.Wn(e);if(r===`pending`)return await this.#n(!0),{enabled:!0,recorderState:`stopped`,activationState:`waiting_for_permissions`};let i=[()=>t.disable(),()=>this.#n(!1)];return r===`denied`?(await dw(e,`Failed to enable Chronicle and roll back`,i),{enabled:!1,recorderState:`stopped`,activationState:`idle`}):uw(e,`Failed to enable Chronicle and roll back`,i)}}",
  getState:
    "async getState(){let e=this.#i(),[t,n]=await Promise.all([this.appServerConnection.isChronicleFeatureConfigured(),e.status()]);return this.#t(t,n.state)}",
  pause: "async pause(){let e=await this.#i().pause();return this.#t(!0,e.state)}",
  resume:
    "async resume(){this.#r();let e=await this.appServerConnection.resumeChronicleSidecar();return this.#t(e.enabled,e.running?`running`:`stopped`)}",
  getSettings: "async getSettings(){return this.#i().getSettings()}",
  updateSettings: "async updateSettings(e){return this.#i().updateSettings(e)}",
  historyClass:
    "var hue=class extends n.wt{appServerConnection;getController;isEligible;loadApplications;loadApplicationsByBundleIdentifier;history;constructor(e,t,n,r,i,a){super(),this.appServerConnection=e,this.getController=t,this.isEligible=n,this.loadApplications=r,this.loadApplicationsByBundleIdentifier=i,this.history=a}async getState()",
};

const reboundAnchors = {
  savedInitializerOld: "function xRc(e){let t=(0,SRc.c)(7)",
  savedInitializerNew: "function CRc(e){let t=(0,wRc.c)(7)",
  savedDependencyOld:
    "var SRc,g4,CRc=n((()=>{SRc=l(),xd(),oX(),lz(),zE(),e5s(),g4=J()}));",
  savedDependencyNew:
    "var wRc,g4,TRc=n((()=>{wRc=l(),bd(),oX(),uz(),LE(),n5s(),g4=J()}));",
  previewHelperOld: "function yEc(e){",
  previewHelperNew: "function xEc(e){let t=(0,w2.c)(84)",
  previewStateOld:
    "let ie=re,ae=cU(W,RGc,`document`),oe=cU(W,LGc,`document`),se=_d(),ce=Y(KGc),",
  previewStateNew:
    "let ie=re,ae=cU(W,BGc,`document`),oe=cU(W,zGc,`document`),se=gd(),ce=Y(JGc),",
  previewActionsOld:
    "let tt=et,nt;t[90]!==Ye||t[91]!==ye.thread?(nt=Ye==null?null:(0,W4.jsx)(oUc,{action:`speaker`,isMuted:ye.thread.isMuted,phase:Ye,onClick:ye.thread.toggleMute}),t[90]=Ye,t[91]=ye.thread,t[92]=nt):nt=t[92];let rt=nt,it;",
  previewActionsNew:
    "let tt=et,nt;t[90]!==Ye||t[91]!==ye.thread?(nt=Ye==null?null:(0,W4.jsx)(cUc,{action:`speaker`,isMuted:ye.thread.isMuted,phase:Ye,onClick:ye.thread.toggleMute}),t[90]=Ye,t[91]=ye.thread,t[92]=nt):nt=t[92];let rt=nt,it;",
};

const migrationAnchors = [
  ["extension", "initializer", retainedAnchors.extensionInitializer, retainedAnchors.extensionInitializer, "retained"],
  ["extension", "variables", retainedAnchors.extensionVariables, retainedAnchors.extensionVariables, "retained"],
  ["extension", "extension selection", retainedAnchors.extensionSelection, retainedAnchors.extensionSelection, "retained"],
  ["extension", "cache size", retainedAnchors.extensionCache, retainedAnchors.extensionCache, "retained"],
  ["extension", "normalization cache", retainedAnchors.extensionNormalization, retainedAnchors.extensionNormalization, "retained"],
  ["bubble", "user bubble Markdown call", retainedAnchors.userBubble, retainedAnchors.userBubble, "retained"],
  ["bubble", "selected annotation renderer", retainedAnchors.selectedAnnotation, retainedAnchors.selectedAnnotation, "retained"],
  ["bubble", "user comment renderer", retainedAnchors.annotationComment, retainedAnchors.annotationComment, "retained"],
  ["bubble", "formatted text dependency", retainedAnchors.bubbleDependency, retainedAnchors.bubbleDependency, "retained"],
  ["annotation", "saved initializer", reboundAnchors.savedInitializerOld, reboundAnchors.savedInitializerNew, "rebound"],
  ["annotation", "saved renderer", retainedAnchors.savedRenderer, retainedAnchors.savedRenderer, "retained"],
  ["annotation", "base Markdown dependency", reboundAnchors.savedDependencyOld, reboundAnchors.savedDependencyNew, "rebound"],
  ["history", "retry activation", retainedAnchors.retryActivation, retainedAnchors.retryActivation, "retained"],
  ["history", "set enabled", retainedAnchors.setEnabled, retainedAnchors.setEnabled, "retained"],
  ["history", "get state", retainedAnchors.getState, retainedAnchors.getState, "retained"],
  ["history", "pause", retainedAnchors.pause, retainedAnchors.pause, "retained"],
  ["history", "resume", retainedAnchors.resume, retainedAnchors.resume, "retained"],
  ["history", "get settings", retainedAnchors.getSettings, retainedAnchors.getSettings, "retained"],
  ["history", "update settings", retainedAnchors.updateSettings, retainedAnchors.updateSettings, "retained"],
  ["history", "helper insertion", retainedAnchors.historyClass, retainedAnchors.historyClass, "retained"],
];

function evaluateBindingMatrix(definitions, label, expectedRetained, expectedRebound) {
  const matrix = definitions.map(([role, name, oldMarker, bindingMarker, binding]) => {
    const oldEntryCount = count(chunks[role], oldMarker);
    const bindingEntryCount = expectCount(
      chunks[role],
      bindingMarker,
      1,
      `${label}/${role}/${name}`,
    );
    if (binding === "retained" && oldEntryCount !== 1) {
      throw new Error(`BLOCKED_BINDING: ${label}/${role}/${name} retained old count=${oldEntryCount}`);
    }
    if (binding === "rebound" && oldEntryCount !== 0) {
      throw new Error(`BLOCKED_BINDING: ${label}/${role}/${name} rebound old count=${oldEntryCount}`);
    }
    return {
      role,
      name,
      binding,
      oldEntryCount,
      bindingEntryCount,
      bindingArchiveCount: count(source, bindingMarker),
    };
  });
  const retainedCount = matrix.filter((row) => row.binding === "retained").length;
  const reboundCount = matrix.filter((row) => row.binding === "rebound").length;
  if (
    matrix.length !== expectedRetained + expectedRebound ||
    retainedCount !== expectedRetained ||
    reboundCount !== expectedRebound
  ) {
    throw new Error(
      `BLOCKED_BINDING: ${label} matrix retained=${retainedCount}, rebound=${reboundCount}`,
    );
  }
  return { matrix, retainedCount, reboundCount };
}

const migrationMatrix = evaluateBindingMatrix(
  migrationAnchors,
  "migration-20",
  18,
  2,
);

const patchAnchors = [
  ["extension", "extension initializer", retainedAnchors.extensionInitializer, retainedAnchors.extensionInitializer, "retained"],
  ["extension", "extension variables", retainedAnchors.extensionVariables, retainedAnchors.extensionVariables, "retained"],
  ["extension", "gated extension selection", retainedAnchors.extensionSelection, retainedAnchors.extensionSelection, "retained"],
  ["extension", "formatter cache size", retainedAnchors.extensionCache, retainedAnchors.extensionCache, "retained"],
  ["extension", "annotation normalization cache", retainedAnchors.extensionNormalization, retainedAnchors.extensionNormalization, "retained"],
  ["bubble", "user bubble renderer", retainedAnchors.userBubble, retainedAnchors.userBubble, "retained"],
  ["bubble", "selected annotation renderer", retainedAnchors.selectedAnnotation, retainedAnchors.selectedAnnotation, "retained"],
  ["bubble", "annotation comment renderer", retainedAnchors.annotationComment, retainedAnchors.annotationComment, "retained"],
  ["bubble", "formatted text dependency", retainedAnchors.bubbleDependency, retainedAnchors.bubbleDependency, "retained"],
  ["annotation", "saved annotation initializer", reboundAnchors.savedInitializerOld, reboundAnchors.savedInitializerNew, "rebound"],
  ["annotation", "saved annotation renderer", retainedAnchors.savedRenderer, retainedAnchors.savedRenderer, "retained"],
  ["annotation", "saved annotation dependency", reboundAnchors.savedDependencyOld, reboundAnchors.savedDependencyNew, "rebound"],
  ["annotation", "composer preview helper insertion", reboundAnchors.previewHelperOld, reboundAnchors.previewHelperNew, "rebound"],
  ["annotation", "Codex composer preview state", reboundAnchors.previewStateOld, reboundAnchors.previewStateNew, "rebound"],
  ["annotation", "Codex composer preview action", reboundAnchors.previewActionsOld, reboundAnchors.previewActionsNew, "rebound"],
];
const patchMatrix = evaluateBindingMatrix(patchAnchors, "actual-patch-15", 10, 5);

const semanticMarkers = {
  bubbleExternalLinkContextCount: [chunks.bubble, "externalLinkContextMenuConversationId", 1],
  bubbleAnnotationAriaCount: [
    chunks.bubble,
    "assistantMessage.responseAnnotation.multilineSelectionAriaLabel",
    1,
  ],
  bubbleFormattedTextImportCount: [
    chunks.bubble,
    'from"./user-formatted-text-CaMb4KJx.js"',
    1,
  ],
  bubbleAppInitialImportCount: [chunks.bubble, 'from"./app-initial-q5My48Y-.js"', 1],
  annotationTargetFunctionCount: [chunks.annotation, "function CRc(e)", 1],
  annotationResponseTargetCount: [chunks.annotation, "responseAnnotationTargetId", 1],
  baseMarkdownRendererCount: [chunks.annotation, "function GB(e){let t=(0,qfa.c)(5)", 1],
  baseMarkdownInitializerCount: [
    chunks.annotation,
    "Yfa=n((()=>{qfa=l(),bx(),_R(),Eaa(),Aaa(),Zaa(),Wfa(),XS(),Jfa=J()}));",
    1,
  ],
  actualCodexComposerCount: [
    chunks.annotation,
    "function RGc(e){let t=(0,qGc.c)(197)",
    1,
  ],
  getTextSnapshotCount: [chunks.annotation, "function jEc(e){return e.getText()}", 1],
  existingGetTextSubscriptionCount: [chunks.annotation, "cU(Je,jEc,`document`)", 1],
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
  composerPlainTextSettingAccessCount: [
    chunks.annotation,
    "JY(qu.composerPlainTextMode)",
    4,
  ],
  selectedProjectRootAtomDefinitionCount: [
    chunks.annotation,
    "bb=Za(Q,({get:e})=>{if(e(yb))return null;let t=Zp(e,ql.SELECTED_PROJECT);return t?.type===`local`?Zp(e,ql.LOCAL_PROJECTS)?.[t.projectId]?.rootPaths[0]??null:null})",
    1,
  ],
  localProjectsMapAtomDefinitionCount: [
    chunks.annotation,
    "Sb=Za(Q,({get:e})=>Zp(e,ql.LOCAL_PROJECTS)??{})",
    1,
  ],
  selectedProjectRootAtomAccessCount: [chunks.annotation, "Y(bb)", 9],
  localProjectsMapAtomAccessCount: [chunks.annotation, "Y(Sb)", 1],
  viewSourceMessageCount: [chunks.annotation, "id:`markdownFileEditor.mode.viewSource`", 1],
  viewPreviewMessageCount: [chunks.annotation, "id:`markdownFileEditor.mode.viewPreview`", 1],
  localConversationDynamicImportCount: [
    chunks.annotation,
    "await import(`./local-conversation-page-DVTe9xjA.js`)",
    1,
  ],
  formattedTextExportCount: [chunks.extension, "export{E as n,v as t}", 1],
  appInitialReverseBubbleDependencyCount: [
    chunks.annotation,
    '"./subagent-activity-chip-group-BjYM1hkl.js"',
    1,
  ],
  appInitialReverseFormattedTextDependencyCount: [
    chunks.annotation,
    '"./user-formatted-text-CaMb4KJx.js"',
    1,
  ],
  assistantProtectionMarkerCount: [
    chunks.bubble,
    "codex.conversation.roleHeading.assistant",
    1,
  ],
  katexProtectionMarkerCount: [chunks.annotation, "throwOnError:!1", 1],
};
const semanticChecks = Object.fromEntries(
  Object.entries(semanticMarkers).map(([name, [bytes, marker, expected]]) => [
    name,
    expectCount(bytes, marker, expected, name),
  ]),
);

const annotationText = chunks.annotation.toString("utf8");
const dependencyMapMatch = annotationText.match(/m\.f\|\|\(m\.f=(\[[^\]]*\])\)/);
if (dependencyMapMatch == null) {
  throw new Error("BLOCKED_BINDING: Vite dependency map");
}
const dependencyMap = JSON.parse(dependencyMapMatch[1]);
const bubbleDependencyIndex = dependencyMap.indexOf(
  `./${entries.bubble.path.split("/").at(-1)}`,
);
const formattedTextDependencyIndex = dependencyMap.indexOf(
  `./${entries.extension.path.split("/").at(-1)}`,
);
if (bubbleDependencyIndex !== 589 || formattedTextDependencyIndex !== 592) {
  throw new Error("BLOCKED_BINDING: reverse dependency indices");
}
const localImportMatch = annotationText.match(
  /await import\(`\.\/local-conversation-page-DVTe9xjA\.js`\)[\s\S]{0,1200}__vite__mapDeps\(\[([^\]]+)\]\)/,
);
if (localImportMatch == null) {
  throw new Error("BLOCKED_BINDING: LocalConversation dynamic import");
}
const localDependencies = localImportMatch[1].split(",").map(Number);
if (
  !localDependencies.includes(bubbleDependencyIndex) ||
  !localDependencies.includes(formattedTextDependencyIndex)
) {
  throw new Error("BLOCKED_BINDING: LocalConversation reverse dependency closure");
}
const previewDependencyChecks = {
  dependencyMapLength: dependencyMap.length,
  bubbleDependencyIndex,
  formattedTextDependencyIndex,
  localConversationDependencyCount: localDependencies.length,
  localConversationHasBubbleDependency: true,
  localConversationHasFormattedTextDependency: true,
};
if (
  previewDependencyChecks.dependencyMapLength !== 875 ||
  previewDependencyChecks.localConversationDependencyCount !== 70
) {
  throw new Error("BLOCKED_BINDING: dependency map shape");
}

const sharedMathConfig = {
  path: dependencyEntries.sharedMathConfig.path,
  sha256: dependencyLocks.sharedMathConfig.sha256,
  singleDollarTextMathFalseCount: expectCount(
    dependencyChunks.sharedMathConfig,
    "singleDollarTextMath:!1",
    1,
    "shared math config false",
  ),
  singleDollarTextMathTrueCount: expectCount(
    dependencyChunks.sharedMathConfig,
    "singleDollarTextMath:!0",
    0,
    "shared math config true",
  ),
  archiveSingleDollarTextMathFalseCount: expectCount(
    source,
    "singleDollarTextMath:!1",
    1,
    "archive shared math config false",
  ),
  archiveSingleDollarTextMathTrueCount: expectCount(
    source,
    "singleDollarTextMath:!0",
    0,
    "archive shared math config true",
  ),
};

const historyMarkers = {
  controllerClassCount: [chunks.history, retainedAnchors.historyClass, 1],
  retryActivationCount: [chunks.history, retainedAnchors.retryActivation, 1],
  setEnabledCount: [chunks.history, retainedAnchors.setEnabled, 1],
  setEnabledFalseBoundaryCount: [
    chunks.history,
    "async setEnabled(e){if(!e)return this.#e();",
    1,
  ],
  getStateCount: [chunks.history, retainedAnchors.getState, 1],
  pauseCount: [chunks.history, retainedAnchors.pause, 1],
  resumeCount: [chunks.history, retainedAnchors.resume, 1],
  getSettingsCount: [chunks.history, retainedAnchors.getSettings, 1],
  updateSettingsCount: [chunks.history, retainedAnchors.updateSettings, 1],
  reconcileCount: [chunks.history, "reconcileSkysightChronicle", 1],
  enableCount: [chunks.history, "enableSkysightChronicle", 1],
  resumeChronicleSidecarCount: [chunks.history, "resumeChronicleSidecar", 2],
  targetResumeMethodCount: [
    chunks.history,
    "async resume(){this.#r();let e=await this.appServerConnection.resumeChronicleSidecar()",
    1,
  ],
  trayToggleCount: [chunks.history, "toggleChronicleSidecar:async()=>", 1],
  listApplicationsCount: [
    chunks.history,
    "async listApplications(){return this.#r(),this.loadApplications()}",
    1,
  ],
  listHistoryCount: [
    chunks.history,
    "async listHistory(){return this.#r(),this.history.list()}",
    1,
  ],
  clearHistoryCount: [
    chunks.history,
    "async clearHistory(e,t){await this.#i().clearHistory(e,t)}",
    1,
  ],
};
const historyBoundaryChecks = Object.fromEntries(
  Object.entries(historyMarkers).map(([name, [bytes, marker, expected]]) => [
    name,
    expectCount(bytes, marker, expected, name),
  ]),
);

const officialPatchMarkers = [
  "codex-single-dollar-math",
  "codex-annotation-math",
  "codexAnnotationMathExtensions",
  "codexNormalizeAnnotationMath",
  "codexMathComposerPreview",
  "codexMathHistoryCall",
  "codexMathEnsureHistoryCompanion",
  "--user-activate",
];
const officialPatchMarkerCounts = Object.fromEntries(
  officialPatchMarkers.map((marker) => [
    marker,
    expectCount(source, marker, 0, `official ${marker}`),
  ]),
);
const officialHistoryMcpOperationCounts = Object.fromEntries(
  [
    "computer_history_status",
    "computer_history_pause",
    "computer_history_resume",
    "computer_history_get_settings",
    "computer_history_update_settings",
  ].map((marker) => [
    marker,
    expectCount(chunks.history, marker, 0, `official History entry ${marker}`),
  ]),
);

const sourceHashAfterAudit = sha256(await readFile(sourcePath));
if (sourceHashAfterAudit !== expectedSourceHash) {
  throw new Error("BLOCKED_SOURCE_DRIFT: ASAR changed during audit");
}

console.log(
  JSON.stringify(
    {
      status: "PASS_REBINDING",
      classification: "MIGRATION_FEASIBLE_WITH_REBINDING",
      appPath,
      version,
      build,
      bundleId,
      sourceHash: expectedSourceHash,
      sourceHashAfterAudit,
      sourceHeaderHash: headerHash,
      electronAsarIntegrityMatch: true,
      signatureChecks,
      archiveShape,
      entryLocks,
      dependencyLocks,
      migrationAnchors: {
        totalCount: migrationMatrix.matrix.length,
        retainedCount: migrationMatrix.retainedCount,
        reboundCount: migrationMatrix.reboundCount,
        matrix: migrationMatrix.matrix,
      },
      actualPatchAnchors: {
        totalCount: patchMatrix.matrix.length,
        retainedCount: patchMatrix.retainedCount,
        reboundCount: patchMatrix.reboundCount,
        matrix: patchMatrix.matrix,
      },
      semanticChecks,
      previewCwdBinding: {
        requiredAtomAlias: "bb",
        requiredSemanticRole: "selected local project first root path",
        prohibitedAtomAlias: "Sb",
        prohibitedSemanticRole: "local projects map",
        requiredCandidateHelperAccess: "Y(bb)",
        prohibitedCandidateHelperAccess: "Y(Sb)",
      },
      previewDependencyChecks,
      sharedMathConfig,
      historyBoundaryChecks: {
        ...historyBoundaryChecks,
        plannedMethodReplacementCount: 7,
        plannedMcpOperationCount: 5,
        unrelatedHistoryMethodsRemainOutsideProxy: true,
      },
      officialPatchMarkerCounts,
      officialHistoryMcpOperationCounts,
    },
    null,
    2,
  ),
);
