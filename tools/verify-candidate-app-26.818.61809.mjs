import { createHash } from "node:crypto";
import { lstat, readFile, readlink, readdir } from "node:fs/promises";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const officialApp = "/Applications/ChatGPT.app";
const oldMathApp = "/Applications/ChatGPT-Math-26.818.41509-History.app";
const stagingApp = join(repoRoot, "build/26.818.61809/ChatGPT-Math-26.818.61809-History.app");
const installedApp = "/Applications/ChatGPT-Math-26.818.61809-History.app";
const candidateReceipt = join(repoRoot, "receipts/26.818.61809-candidate-static-receipt.json");
const expectedOfficialHash = "76bbcdc2a4a2d77cfe03904a6537d0a655f9892f27a8925e3a6c7b613801d4cf";
const expectedOfficialHeaderHash = "b39c87c9fb4ccfbe0fec76c4e6e8e354ee8a105d28f7f8694421cc817c86d112";
const expectedOldMathHash = "19095005e8ea6862aa5d04ddf92f60ef605ea38fb34e3dac4f05653a6c9b8a48";
const expectedCandidateHash = "20af3332ab0fbf396eee9be3cde8e61e61025eca8287a1f0388fab03aa5c8e29";
const expectedCandidateHeaderHash = "624b1fe2cd85d9a2d3877f9b275112e9e35e718abbb9e500231e736350876f3e";
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
  throw new Error("Usage: node verify-candidate-app-26.818.61809.mjs [staging|installed]");
}
const candidateApp = mode === "installed" ? installedApp : stagingApp;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function candidateLocks() {
  const receipt = JSON.parse(await readFile(candidateReceipt, "utf8"));
  const expectedPath = "build/26.818.61809/app.asar.math-history-static.asar";
  const hashPattern = /^[0-9a-f]{64}$/u;
  const requiredStatuses = ["PASS_REBINDING", "PASS_MATH_CANDIDATE", "PASS_HISTORY_CANDIDATE", "PASS_STATIC_CANDIDATE"];
  if (receipt.schema_version !== 1) throw new Error("BLOCKED_VALIDATION: unsupported receipt schema");
  if (receipt.official_version !== "26.818.61809" || receipt.official_build !== "7019") {
    throw new Error("BLOCKED_VALIDATION: receipt version or build mismatch");
  }
  if (!Array.isArray(receipt.status) || requiredStatuses.some((status) => !receipt.status.includes(status))) {
    throw new Error("BLOCKED_VALIDATION: receipt is not a passed static candidate chain");
  }
  if (receipt.source?.sha256 !== expectedOfficialHash || receipt.source?.header_sha256 !== expectedOfficialHeaderHash) {
    throw new Error("BLOCKED_VALIDATION: receipt source lock mismatch");
  }
  if (receipt.final_candidate?.path !== expectedPath) throw new Error("BLOCKED_VALIDATION: receipt candidate path mismatch");
  if (!hashPattern.test(receipt.final_candidate?.sha256 ?? "") || !hashPattern.test(receipt.final_candidate?.header_sha256 ?? "")) {
    throw new Error("BLOCKED_VALIDATION: receipt candidate locks missing or invalid");
  }
  if (
    receipt.final_candidate.sha256 !== expectedCandidateHash ||
    receipt.final_candidate.header_sha256 !== expectedCandidateHeaderHash
  ) {
    throw new Error("BLOCKED_VALIDATION: receipt candidate locks differ from frozen locks");
  }
  return {
    asarHash: receipt.final_candidate.sha256,
    headerHash: receipt.final_candidate.header_sha256,
  };
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

function verifyCodeSignature(app) {
  const result = spawnSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", "--verbose=2", app], {
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(`Code signature verification failed: ${app}`);
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

const locks = await candidateLocks();
const officialInfo = plistJson(join(officialApp, "Contents/Info.plist"));
const candidateInfo = plistJson(join(candidateApp, "Contents/Info.plist"));
if (sha256(await readFile(join(officialApp, "Contents/Resources/app.asar"))) !== expectedOfficialHash) {
  throw new Error("BLOCKED_SOURCE_DRIFT: official ASAR hash");
}
if (officialInfo.ElectronAsarIntegrity?.["Resources/app.asar"]?.hash !== expectedOfficialHeaderHash) {
  throw new Error("BLOCKED_SOURCE_DRIFT: official ASAR header hash");
}
if (officialInfo.CFBundleShortVersionString !== "26.818.61809" || officialInfo.CFBundleVersion !== "7019") {
  throw new Error("BLOCKED_SOURCE_DRIFT: official version or build");
}
if (plistValue(oldMathApp, "CFBundleShortVersionString") !== "26.818.41509") {
  throw new Error("BLOCKED_ROLLBACK_READINESS: old math version");
}
if (sha256(await readFile(join(oldMathApp, "Contents/Resources/app.asar"))) !== expectedOldMathHash) {
  throw new Error("BLOCKED_ROLLBACK_READINESS: old math ASAR hash");
}
const oldBundleId = plistValue(oldMathApp, "CFBundleIdentifier");
if (candidateInfo.CFBundleIdentifier !== oldBundleId) throw new Error("Bundle ID mismatch");
if (candidateInfo.CFBundleIdentifier === officialInfo.CFBundleIdentifier) throw new Error("Candidate is not identity-isolated");
if (candidateInfo.CFBundleDisplayName !== "ChatGPT Math 26.818.61809 History") throw new Error("Display name mismatch");
if (candidateInfo.CFBundleShortVersionString !== "26.818.61809" || candidateInfo.CFBundleVersion !== "7019") throw new Error("Version mismatch");
if (candidateInfo.ElectronAsarIntegrity?.["Resources/app.asar"]?.algorithm !== "SHA256") throw new Error("ElectronAsarIntegrity algorithm mismatch");
if (candidateInfo.ElectronAsarIntegrity?.["Resources/app.asar"]?.hash !== locks.headerHash) throw new Error("ElectronAsarIntegrity mismatch");
if (sha256(await readFile(join(candidateApp, "Contents/Resources/app.asar"))) !== locks.asarHash) throw new Error("Candidate ASAR mismatch");

const allowedInfoDiffs = new Set(["CFBundleDisplayName", "CFBundleIdentifier", "ElectronAsarIntegrity"]);
const infoDiffs = [...new Set([...Object.keys(officialInfo), ...Object.keys(candidateInfo)])]
  .filter((key) => JSON.stringify(officialInfo[key]) !== JSON.stringify(candidateInfo[key]));
if (infoDiffs.some((key) => !allowedInfoDiffs.has(key)) || infoDiffs.length !== allowedInfoDiffs.size) {
  throw new Error(`Unexpected Info.plist diff: ${infoDiffs.join(",")}`);
}

verifyCodeSignature(candidateApp);
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
  asarHash: locks.asarHash,
  headerHash: locks.headerHash,
  lockReceipt: candidateReceipt,
  infoDiffs: infoDiffs.sort(),
  payloadDiffs: diffs.sort(),
  entitlementKeys: [...actualEntitlementKeys].sort(),
  codeSignatureDeepStrict: "passed",
  designatedRequirementMatchesOld: true,
  rollbackCopyVersion: "26.818.41509",
  rollbackCopyAsarHash: expectedOldMathHash,
}, null, 2));
