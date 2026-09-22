import { createHash } from "node:crypto";
import { lstat, readFile, readlink, readdir } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const officialApp = "/Applications/ChatGPT.app";
const oldMathApp = "/Applications/ChatGPT-Math-26.814.41407-History.app";
const stagingApp = join(repoRoot, "build/26.818.32112/ChatGPT-Math-26.818.32112-History.app");
const installedApp = "/Applications/ChatGPT-Math-26.818.32112-History.app";
const expectedAsarHash = "6ea7daa520796a215485fc2872b32da4c68a20ae3bc8295f2c758caa006c18e4";
const expectedHeaderHash = "07ce9b81581b9858f11cded2224d50550c9702e9fa62bbfd48f7e6f69eb48eaa";
const expectedEntitlements = new Set([
  "com.apple.security.automation.apple-events",
  "com.apple.security.cs.allow-jit",
  "com.apple.security.cs.allow-unsigned-executable-memory",
  "com.apple.security.cs.disable-library-validation",
  "com.apple.security.device.audio-input",
  "com.apple.security.device.camera",
]);

const mode = process.argv[2] ?? "staging";
if (!new Set(["staging", "installed"]).has(mode) || process.argv.length > 3) {
  throw new Error("Usage: node verify-candidate-app-26.818.32112.mjs [staging|installed]");
}
const candidateApp = mode === "installed" ? installedApp : stagingApp;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function plistValue(app, key) {
  return execFileSync("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, join(app, "Contents/Info.plist")], { encoding: "utf8" }).trim();
}

function plistJson(path) {
  return JSON.parse(execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", path], { encoding: "utf8" }));
}

function entitlements(app) {
  const xml = execFileSync("/usr/bin/codesign", ["-d", "--entitlements", ":-", app], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return JSON.parse(execFileSync("/usr/bin/plutil", ["-convert", "json", "-o", "-", "-"], {
    encoding: "utf8",
    input: xml,
  }));
}

function designatedRequirement(app) {
  const result = spawnSync("/usr/bin/codesign", ["-d", "-r-", app], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Unable to read designated requirement: ${app}`);
  const line = `${result.stdout}${result.stderr}`
    .split(/\r?\n/u)
    .find((value) => value.startsWith("designated => "));
  if (line == null) throw new Error(`Missing designated requirement: ${app}`);
  return line;
}

async function manifest(root) {
  const output = new Map();
  async function walk(path) {
    const stat = await lstat(path);
    const name = relative(root, path);
    if (stat.isSymbolicLink()) {
      output.set(name, { type: "symlink", target: await readlink(path) });
      return;
    }
    if (stat.isDirectory()) {
      for (const child of await readdir(path)) await walk(join(path, child));
      return;
    }
    if (stat.isFile()) output.set(name, { type: "file", size: stat.size, hash: sha256(await readFile(path)) });
  }
  await walk(root);
  return output;
}

const officialInfo = plistJson(join(officialApp, "Contents/Info.plist"));
const candidateInfo = plistJson(join(candidateApp, "Contents/Info.plist"));
const oldBundleId = plistValue(oldMathApp, "CFBundleIdentifier");
if (candidateInfo.CFBundleIdentifier !== oldBundleId) throw new Error("Bundle ID mismatch");
if (candidateInfo.CFBundleIdentifier === officialInfo.CFBundleIdentifier) throw new Error("Candidate is not identity-isolated");
if (candidateInfo.CFBundleDisplayName !== "ChatGPT Math 26.818.32112 History") throw new Error("Display name mismatch");
if (candidateInfo.CFBundleShortVersionString !== "26.818.32112" || candidateInfo.CFBundleVersion !== "6933") throw new Error("Version mismatch");
if (candidateInfo.ElectronAsarIntegrity?.["Resources/app.asar"]?.hash !== expectedHeaderHash) throw new Error("ElectronAsarIntegrity mismatch");
if (sha256(await readFile(join(candidateApp, "Contents/Resources/app.asar"))) !== expectedAsarHash) throw new Error("Candidate ASAR mismatch");

const allowedInfoDiffs = new Set(["CFBundleDisplayName", "CFBundleIdentifier", "ElectronAsarIntegrity"]);
const infoDiffs = [...new Set([...Object.keys(officialInfo), ...Object.keys(candidateInfo)])]
  .filter((key) => JSON.stringify(officialInfo[key]) !== JSON.stringify(candidateInfo[key]));
if (infoDiffs.some((key) => !allowedInfoDiffs.has(key)) || infoDiffs.length !== allowedInfoDiffs.size) {
  throw new Error(`Unexpected Info.plist diff: ${infoDiffs.join(",")}`);
}

const actualEntitlements = entitlements(candidateApp);
const actualEntitlementKeys = new Set(Object.keys(actualEntitlements));
if (
  actualEntitlementKeys.size !== expectedEntitlements.size ||
  [...expectedEntitlements].some((key) => actualEntitlements[key] !== true)
) throw new Error("Entitlement set mismatch");
for (const forbidden of [
  "com.apple.security.application-groups",
  "keychain-access-groups",
  "com.apple.developer.team-identifier",
  "com.apple.security.app-sandbox",
]) {
  if (forbidden in actualEntitlements) throw new Error(`Forbidden entitlement: ${forbidden}`);
}

const oldDesignatedRequirement = designatedRequirement(oldMathApp);
const candidateDesignatedRequirement = designatedRequirement(candidateApp);
if (candidateDesignatedRequirement !== oldDesignatedRequirement) {
  throw new Error("Designated requirement mismatch");
}

const officialManifest = await manifest(officialApp);
const candidateManifest = await manifest(candidateApp);
const allPaths = new Set([...officialManifest.keys(), ...candidateManifest.keys()]);
const diffs = [];
for (const path of allPaths) {
  if (JSON.stringify(officialManifest.get(path)) !== JSON.stringify(candidateManifest.get(path))) diffs.push(path);
}
const approvedDiffs = new Set([
  "Contents/Info.plist",
  "Contents/MacOS/ChatGPT",
  "Contents/Resources/app.asar",
  "Contents/_CodeSignature/CodeResources",
]);
if (diffs.some((path) => !approvedDiffs.has(path)) || [...approvedDiffs].some((path) => !diffs.includes(path))) {
  throw new Error(`BLOCKED_SCOPE_EXPANSION: ${diffs.join(",")}`);
}

console.log(JSON.stringify({
  status: "PASS_SIGNING_PAYLOAD_STATIC",
  mode,
  appPath: candidateApp,
  bundleId: candidateInfo.CFBundleIdentifier,
  displayName: candidateInfo.CFBundleDisplayName,
  version: candidateInfo.CFBundleShortVersionString,
  build: candidateInfo.CFBundleVersion,
  asarHash: expectedAsarHash,
  headerHash: expectedHeaderHash,
  infoDiffs: infoDiffs.sort(),
  payloadDiffs: diffs.sort(),
  entitlementKeys: [...actualEntitlementKeys].sort(),
  designatedRequirement: candidateDesignatedRequirement,
}, null, 2));
