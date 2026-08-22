import { fileURLToPath } from "node:url";
import {
  appendReplacements,
  count,
  entryBytes,
  nodeAt,
  parseArchive,
  readArchiveWithStat,
  replaceExactlyOnce,
  sha256,
  writeAtomic,
} from "./asar-static-utils.mjs";

const sourcePath = fileURLToPath(
  new URL("../build/26.818.32112/app.asar.math-static.asar", import.meta.url),
);
const outputPath = fileURLToPath(
  new URL("../build/26.818.32112/app.asar.math-history-static.asar", import.meta.url),
);
const expectedSourceHash =
  "78d7c4e4e6bda4c2c37c05b9e0183b91f14bed1b1c343cb2dba846a25ad1dffb";
const expectedOutputHash =
  "6ea7daa520796a215485fc2872b32da4c68a20ae3bc8295f2c758caa006c18e4";
const targetFile = ".vite/build/main-B2sRTTQY.js";
const expectedTargetHash =
  "a38a92eaac29e375fa843e3e7c0c2016bd8f28f7e0f6143c75a079359da4ddcd";

if (process.argv.length !== 2) {
  throw new Error("This version-locked builder accepts no path overrides");
}

const proxyHelper =
  "async function codexMathHistoryCall(e,t={}){let{execFile:n}=await import(`node:child_process`),r=process.env.HOME;if(!r)throw Error(`Missing HOME for History companion`);return await new Promise((i,a)=>n(`/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node`,[r+`/Library/Application Support/Codex Math History Companion/mcp-call.mjs`,e,JSON.stringify(t)],{timeout:15e3,maxBuffer:1048576},(e,t)=>{if(e){a(e);return}try{i(JSON.parse(t))}catch(e){a(e)}}))}";
const ensureHelper =
  "async function codexMathEnsureHistoryCompanion(){let{execFile:e}=await import(`node:child_process`),t=process.env.HOME;if(!t)throw Error(`Missing HOME for History companion`);return await new Promise((n,r)=>e(`/bin/zsh`,[t+`/Library/Application Support/Codex Math History Companion/manage.sh`,`--user-activate`],{timeout:6e4,maxBuffer:1048576},(e,t)=>{if(e){r(e);return}try{let e=JSON.parse(t);if(!e||e.ok!==!0)throw Error(`History companion activation failed`);n(e)}catch(e){r(e)}}))}";
const classAnchor =
  "var gue=class extends n.wt{appServerConnection;getController;isEligible;loadApplications;loadApplicationsByBundleIdentifier;history;constructor(e,t,n,r,i,a){super(),this.appServerConnection=e,this.getController=t,this.isEligible=n,this.loadApplications=r,this.loadApplicationsByBundleIdentifier=i,this.history=a}async getState()";

const replacements = [
  [
    "retryActivation",
    "async retryActivation(){this.#r();try{await this.appServerConnection.reconcileSkysightChronicle()}catch{}return this.getState()}",
    "async retryActivation(){this.#r();await codexMathEnsureHistoryCompanion();try{await this.appServerConnection.reconcileSkysightChronicle()}catch{}return this.getState()}",
  ],
  [
    "setEnabled",
    "async setEnabled(e){if(!e)return this.#e();let t=this.#i();try{let e=await this.appServerConnection.enableSkysightChronicle();return await this.#n(!0),this.#t(!0,e.state)}catch(e){let r=n.Wn(e);if(r===`pending`)return await this.#n(!0),{enabled:!0,recorderState:`stopped`,activationState:`waiting_for_permissions`};let i=[()=>t.disable(),()=>this.#n(!1)];return r===`denied`?(await uw(e,`Failed to enable Chronicle and roll back`,i),{enabled:!1,recorderState:`stopped`,activationState:`idle`}):lw(e,`Failed to enable Chronicle and roll back`,i)}}",
    "async setEnabled(e){if(!e)return this.#e();let t=this.#i();await codexMathEnsureHistoryCompanion();try{let e=await this.appServerConnection.enableSkysightChronicle();return await this.#n(!0),this.#t(!0,e.state)}catch(e){let r=n.Wn(e);if(r===`pending`)return await this.#n(!0),{enabled:!0,recorderState:`stopped`,activationState:`waiting_for_permissions`};let i=[()=>t.disable(),()=>this.#n(!1)];return r===`denied`?(await uw(e,`Failed to enable Chronicle and roll back`,i),{enabled:!1,recorderState:`stopped`,activationState:`idle`}):lw(e,`Failed to enable Chronicle and roll back`,i)}}",
  ],
  [
    "getState",
    "async getState(){let e=this.#i(),[t,n]=await Promise.all([this.appServerConnection.isChronicleFeatureConfigured(),e.status()]);return this.#t(t,n.state)}",
    "async getState(){let[e,t]=await Promise.all([this.appServerConnection.isChronicleFeatureConfigured(),codexMathHistoryCall(`computer_history_status`)]);return this.#t(e,t.state)}",
  ],
  [
    "pause",
    "async pause(){let e=await this.#i().pause();return this.#t(!0,e.state)}",
    "async pause(){let e=await codexMathHistoryCall(`computer_history_pause`);return this.#t(!0,e.state)}",
  ],
  [
    "resume",
    "async resume(){this.#r();let e=await this.appServerConnection.resumeChronicleSidecar();return this.#t(e.enabled,e.running?`running`:`stopped`)}",
    "async resume(){this.#r();let e=await codexMathHistoryCall(`computer_history_resume`);return this.#t(!0,e.state)}",
  ],
  [
    "getSettings",
    "async getSettings(){return this.#i().getSettings()}",
    "async getSettings(){return codexMathHistoryCall(`computer_history_get_settings`)}",
  ],
  [
    "updateSettings",
    "async updateSettings(e){return this.#i().updateSettings(e)}",
    "async updateSettings(e){return codexMathHistoryCall(`computer_history_update_settings`,e)}",
  ],
];

const { bytes: source, fileStat } = await readArchiveWithStat(sourcePath);
if (sha256(source) !== expectedSourceHash) throw new Error("Math candidate hash mismatch");
const parsed = parseArchive(source);
const targetNode = nodeAt(parsed.header, targetFile);
const original = entryBytes(source, parsed.dataStart, targetNode);
if (sha256(original) !== expectedTargetHash || targetNode.integrity.hash !== expectedTargetHash) {
  throw new Error("Original History entry hash mismatch");
}
if (count(original, classAnchor) !== 1) throw new Error("BLOCKED_BINDING: History class");
if (count(original, "resumeChronicleSidecar") !== 2) {
  throw new Error("BLOCKED_BINDING: History resume disambiguation");
}
if (count(original, "toggleChronicleSidecar:async()=>") !== 1) {
  throw new Error("BLOCKED_BINDING: tray toggle");
}

let modified = replaceExactlyOnce(
  original,
  classAnchor,
  `${proxyHelper};${ensureHelper};${classAnchor}`,
  "History helper insertion",
);
for (const [label, oldValue, newValue] of replacements) {
  modified = replaceExactlyOnce(modified, oldValue, newValue, label);
}

const expectedCounts = [
  ["codexMathHistoryCall", 6],
  ["codexMathEnsureHistoryCompanion", 3],
  ["--user-activate", 1],
  ["computer_history_status", 1],
  ["computer_history_pause", 1],
  ["computer_history_resume", 1],
  ["computer_history_get_settings", 1],
  ["computer_history_update_settings", 1],
  ["toggleChronicleSidecar:async()=>", 1],
  ["async setEnabled(e){if(!e)return this.#e();", 1],
  ["async listApplications(){return this.#r(),this.loadApplications()}", 1],
  ["async clearHistory(e,t){await this.#i().clearHistory(e,t)}", 1],
];
for (const [marker, expected] of expectedCounts) {
  const actual = count(modified, marker);
  if (actual !== expected) throw new Error(`History sentinel mismatch: ${marker}`);
}
for (const [, oldValue] of replacements) {
  if (count(modified, oldValue) !== 0) throw new Error("An old History method remains");
}
if (count(modified, "resumeChronicleSidecar") !== 1) {
  throw new Error("Only the unrelated tray resume call should remain");
}

const built = appendReplacements(source, new Map([[targetFile, modified]]));
if (sha256(built.output) !== expectedOutputHash) {
  throw new Error("Version-locked History candidate hash mismatch");
}
await writeAtomic(outputPath, built.output, fileStat.mode);

console.log(JSON.stringify({
  status: "PASS_HISTORY_CANDIDATE",
  sourcePath,
  outputPath,
  sourceHash: sha256(source),
  sourceHashAfterBuild: sha256((await readArchiveWithStat(sourcePath)).bytes),
  outputHash: sha256(built.output),
  outputHeaderHash: built.outputHeaderHash,
  sourceSize: source.length,
  outputSize: built.output.length,
  historyTargetHash: sha256(modified),
  methodReplacementCount: replacements.length,
  mcpOperationCount: 5,
  helperInsertionCount: 1,
  tests: {
    exactlyOnceMethods: "passed",
    structuredClassAnchor: "passed",
    trayResumeExcluded: "passed",
    setEnabledFalseBoundaryPreserved: "passed",
    listAndClearCoverageUnchanged: "passed",
  },
}, null, 2));
