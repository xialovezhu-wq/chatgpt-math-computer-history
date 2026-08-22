import { readFile } from "node:fs/promises";
import {
  count,
  entryBytes,
  nodeAt,
  parseArchive,
  sha256,
} from "./asar-static-utils.mjs";

const sourcePath = "/Applications/ChatGPT.app/Contents/Resources/app.asar";
const expectedSourceHash =
  "128c748e313a7a630d689f9fa215724eb44fbea6e0a5d7990867370cf73d88d3";
const entries = {
  extension: "webview/assets/user-formatted-text-BtKDcaQ7.js",
  bubble: "webview/assets/subagent-activity-chip-group-BL5rmF0-.js",
  annotation: "webview/assets/app-initial-CanCbU9v.js",
  history: ".vite/build/main-B2sRTTQY.js",
};
const expectedEntryHashes = {
  extension: "165905ef043e51618af9483670ef09653b014bd623ff6fab1c9b07b4aaa0ce91",
  bubble: "d4c5a3f52b45c59bf0533ca73b63418434bbb699c3a96ddd2af4b74ef80e837d",
  annotation: "364e244fdb6b17e4d3a1de0413402284e62595456cc973cf15d35bb21fc11a76",
  history: "a38a92eaac29e375fa843e3e7c0c2016bd8f28f7e0f6143c75a079359da4ddcd",
};

const anchors = [
  ["extension", "initializer", "}}}]}]}));function v", "retained"],
  ["extension", "variables", "var g,_=", "retained"],
  ["extension", "extension selection", "extensions:g", "retained"],
  ["extension", "cache size", "function v(e){let t=(0,x.c)(20)", "retained"],
  ["extension", "normalization cache", "t[0]===n?h=t[1]:(h=y(n),t[0]=n,t[1]=h);", "retained"],
  ["bubble", "user bubble Markdown call", "(0,n_.jsx)(Oh,{cwd:r,externalLinkContextMenuConversationId:u,hostId:i,text:n})", "rebound"],
  ["bubble", "selected annotation renderer", "l?(0,OS.jsx)(`pre`,{className:`mt-0.5 max-h-48 overflow-auto rounded-md bg-primary-soft px-3 py-2 font-mono text-xs whitespace-pre text-default select-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset`,role:`region`,\"aria-label\":n.formatMessage({id:`assistantMessage.responseAnnotation.multilineSelectionAriaLabel`,defaultMessage:`Selected annotation text, {lineCount} lines`,description:`Accessible label for a scrollable multiline response annotation selection`},{lineCount:c}),children:s.text}):(0,OS.jsx)(`div`,{className:`mt-0.5 break-words whitespace-pre-wrap select-text`,children:s.text})", "retained"],
  ["bubble", "user comment renderer", "(0,OS.jsx)(`div`,{className:`mt-0.5 break-words whitespace-pre-wrap select-text`,children:s.annotation})", "rebound"],
  ["bubble", "formatted text dependency", "var DS,OS,kS,AS=e((()=>{Js(),DS=t(Lm(),1),si(),pl(),Cc(),OS=v(),kS=`codex-annotation`}));", "rebound"],
  ["annotation", "saved initializer", "function TAc(e){let t=(0,EAc.c)(7)", "rebound"],
  ["annotation", "saved renderer", "(0,G2.jsx)(`div`,{className:`mt-0.5 break-words whitespace-pre-wrap`,children:r})", "rebound"],
  ["annotation", "base Markdown dependency", "var EAc,G2,DAc=n((()=>{EAc=l(),xd(),KY(),iz(),zE(),M6s(),G2=J()}));", "rebound"],
  ["history", "retry activation", "async retryActivation(){this.#r();try{await this.appServerConnection.reconcileSkysightChronicle()}catch{}return this.getState()}", "retained"],
  ["history", "set enabled", "async setEnabled(e){if(!e)return this.#e();let t=this.#i();try{let e=await this.appServerConnection.enableSkysightChronicle();return await this.#n(!0),this.#t(!0,e.state)}catch(e){let r=n.Wn(e);if(r===`pending`)return await this.#n(!0),{enabled:!0,recorderState:`stopped`,activationState:`waiting_for_permissions`};let i=[()=>t.disable(),()=>this.#n(!1)];return r===`denied`?(await uw(e,`Failed to enable Chronicle and roll back`,i),{enabled:!1,recorderState:`stopped`,activationState:`idle`}):lw(e,`Failed to enable Chronicle and roll back`,i)}}", "rebound"],
  ["history", "get state", "async getState(){let e=this.#i(),[t,n]=await Promise.all([this.appServerConnection.isChronicleFeatureConfigured(),e.status()]);return this.#t(t,n.state)}", "retained"],
  ["history", "pause", "async pause(){let e=await this.#i().pause();return this.#t(!0,e.state)}", "retained"],
  ["history", "resume", "async resume(){this.#r();let e=await this.appServerConnection.resumeChronicleSidecar();return this.#t(e.enabled,e.running?`running`:`stopped`)}", "retained"],
  ["history", "get settings", "async getSettings(){return this.#i().getSettings()}", "retained"],
  ["history", "update settings", "async updateSettings(e){return this.#i().updateSettings(e)}", "retained"],
  ["history", "helper insertion", "var gue=class extends n.wt{appServerConnection;getController;isEligible;loadApplications;loadApplicationsByBundleIdentifier;history;constructor(e,t,n,r,i,a){super(),this.appServerConnection=e,this.getController=t,this.isEligible=n,this.loadApplications=r,this.loadApplicationsByBundleIdentifier=i,this.history=a}async getState()", "rebound"],
];

const source = await readFile(sourcePath);
if (sha256(source) !== expectedSourceHash) throw new Error("BLOCKED_SOURCE_DRIFT");
const parsed = parseArchive(source);
const chunks = {};
for (const [role, filePath] of Object.entries(entries)) {
  const node = nodeAt(parsed.header, filePath);
  const bytes = entryBytes(source, parsed.dataStart, node);
  const actualHash = sha256(bytes);
  if (actualHash !== expectedEntryHashes[role] || actualHash !== node.integrity.hash) {
    throw new Error(`Entry hash mismatch: ${filePath}`);
  }
  chunks[role] = bytes;
}

const matrix = anchors.map(([role, name, marker, binding]) => ({
  role,
  name,
  binding,
  entryCount: count(chunks[role], marker),
  archiveCount: count(source, marker),
}));
for (const row of matrix) {
  if (row.entryCount !== 1) {
    throw new Error(`BLOCKED_BINDING: ${row.role}/${row.name} count=${row.entryCount}`);
  }
}

const semanticChecks = {
  bubbleExternalLinkContextCount: count(chunks.bubble, "externalLinkContextMenuConversationId"),
  bubbleAnnotationAriaCount: count(chunks.bubble, "assistantMessage.responseAnnotation.multilineSelectionAriaLabel"),
  bubbleFormattedTextImportCount: count(chunks.bubble, 'from"./user-formatted-text-BtKDcaQ7.js"'),
  annotationTargetFunctionCount: count(chunks.annotation, "function TAc(e)"),
  annotationResponseTargetCount: count(chunks.annotation, "responseAnnotationTargetId"),
  annotationBaseRendererDefinitionCount: count(chunks.annotation, "function zB(e){let t=(0,Tda.c)(5)"),
  annotationBaseRendererInitializerCount: count(chunks.annotation, "var Tda,Eda,Dda=n((()=>{"),
  historyControllerClassCount: count(chunks.history, "var gue=class extends n.wt{appServerConnection;getController;isEligible;loadApplications;loadApplicationsByBundleIdentifier;history;"),
  historyReconcileCount: count(chunks.history, "reconcileSkysightChronicle"),
  historyEnableCount: count(chunks.history, "enableSkysightChronicle"),
  historyResumeCount: count(chunks.history, "resumeChronicleSidecar"),
  historyTargetResumeMethodCount: count(chunks.history, "async resume(){this.#r();let e=await this.appServerConnection.resumeChronicleSidecar()"),
  historyTrayToggleCount: count(chunks.history, "toggleChronicleSidecar:async()=>"),
};
for (const [name, actual] of Object.entries(semanticChecks)) {
  const expected = name === "historyResumeCount" ? 2 : 1;
  if (actual !== expected) throw new Error(`BLOCKED_BINDING: ${name}=${actual}`);
}

console.log(JSON.stringify({
  status: "PASS_REBINDING",
  sourceHash: sha256(source),
  sourceHeaderHash: sha256(Buffer.from(parsed.headerText, "utf8")),
  retainedCount: matrix.filter((row) => row.binding === "retained").length,
  reboundCount: matrix.filter((row) => row.binding === "rebound").length,
  matrix,
  semanticChecks,
}, null, 2));
