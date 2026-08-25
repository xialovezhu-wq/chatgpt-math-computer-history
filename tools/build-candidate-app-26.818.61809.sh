#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
repo_root=${script_dir:h}
official_app=/Applications/ChatGPT.app
old_math_app=/Applications/ChatGPT-Math-26.818.41509-History.app
candidate_asar=${repo_root}/build/26.818.61809/app.asar.math-history-static.asar
staging_app=${repo_root}/build/26.818.61809/ChatGPT-Math-26.818.61809-History.app
candidate_receipt=${repo_root}/receipts/26.818.61809-candidate-static-receipt.json
entitlements=${script_dir}/math-local-runtime-entitlements.plist
expected_official_hash=76bbcdc2a4a2d77cfe03904a6537d0a655f9892f27a8925e3a6c7b613801d4cf
expected_official_header_hash=b39c87c9fb4ccfbe0fec76c4e6e8e354ee8a105d28f7f8694421cc817c86d112
expected_old_math_hash=19095005e8ea6862aa5d04ddf92f60ef605ea38fb34e3dac4f05653a6c9b8a48
locked_candidate_hash=20af3332ab0fbf396eee9be3cde8e61e61025eca8287a1f0388fab03aa5c8e29
locked_candidate_header_hash=624b1fe2cd85d9a2d3877f9b275112e9e35e718abbb9e500231e736350876f3e

[[ -d ${official_app} ]] || { print -u2 'BLOCKED_SOURCE_DRIFT: official app missing'; exit 1; }
[[ -d ${old_math_app} ]] || { print -u2 'BLOCKED_ROLLBACK_READINESS: 26.818.41509 math copy missing'; exit 1; }
[[ -f ${candidate_receipt} ]] || { print -u2 'BLOCKED_VALIDATION: versioned candidate receipt missing'; exit 1; }
[[ -f ${candidate_asar} ]] || { print -u2 'BLOCKED_BUILD: candidate ASAR missing'; exit 1; }
[[ -f ${entitlements} ]] || { print -u2 'BLOCKED_SIGNING: entitlements file missing'; exit 1; }
[[ ! -e ${staging_app} ]] || { print -u2 'BLOCKED_BUILD: staging app already exists'; exit 1; }

receipt_values=$(/usr/bin/env node --input-type=module -e '
  import { readFileSync } from "node:fs";
  const receiptPath = process.argv[1];
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  const expectedPath = "build/26.818.61809/app.asar.math-history-static.asar";
  const sha256 = /^[0-9a-f]{64}$/u;
  const requiredStatuses = ["PASS_REBINDING", "PASS_MATH_CANDIDATE", "PASS_HISTORY_CANDIDATE", "PASS_STATIC_CANDIDATE"];
  if (receipt.schema_version !== 1) throw new Error("unsupported receipt schema");
  if (receipt.official_version !== "26.818.61809" || receipt.official_build !== "7019") throw new Error("receipt version or build mismatch");
  if (!Array.isArray(receipt.status) || requiredStatuses.some((status) => !receipt.status.includes(status))) throw new Error("receipt is not a passed static candidate chain");
  if (receipt.source?.sha256 !== "76bbcdc2a4a2d77cfe03904a6537d0a655f9892f27a8925e3a6c7b613801d4cf") throw new Error("receipt source hash mismatch");
  if (receipt.source?.header_sha256 !== "b39c87c9fb4ccfbe0fec76c4e6e8e354ee8a105d28f7f8694421cc817c86d112") throw new Error("receipt source header hash mismatch");
  if (receipt.final_candidate?.path !== expectedPath) throw new Error("receipt candidate path mismatch");
  if (!sha256.test(receipt.final_candidate?.sha256 ?? "") || !sha256.test(receipt.final_candidate?.header_sha256 ?? "")) throw new Error("receipt candidate locks missing or invalid");
  if (receipt.final_candidate.sha256 !== "20af3332ab0fbf396eee9be3cde8e61e61025eca8287a1f0388fab03aa5c8e29") throw new Error("receipt candidate SHA-256 does not match frozen lock");
  if (receipt.final_candidate.header_sha256 !== "624b1fe2cd85d9a2d3877f9b275112e9e35e718abbb9e500231e736350876f3e") throw new Error("receipt candidate header does not match frozen lock");
  process.stdout.write(`${receipt.final_candidate.sha256}\n${receipt.final_candidate.header_sha256}`);
' ${candidate_receipt}) || { print -u2 'BLOCKED_VALIDATION: invalid versioned candidate receipt'; exit 1; }
receipt_lines=("${(@f)receipt_values}")
[[ ${#receipt_lines} == 2 ]] || { print -u2 'BLOCKED_VALIDATION: incomplete candidate locks'; exit 1; }
expected_candidate_hash=${receipt_lines[1]}
candidate_header_hash=${receipt_lines[2]}
[[ ${expected_candidate_hash} == ${locked_candidate_hash} && ${candidate_header_hash} == ${locked_candidate_header_hash} ]] || {
  print -u2 'BLOCKED_VALIDATION: receipt candidate locks differ from frozen locks'
  exit 1
}

official_hash=$(/usr/bin/shasum -a 256 ${official_app}/Contents/Resources/app.asar | /usr/bin/awk '{print $1}')
candidate_hash=$(/usr/bin/shasum -a 256 ${candidate_asar} | /usr/bin/awk '{print $1}')
old_math_hash=$(/usr/bin/shasum -a 256 ${old_math_app}/Contents/Resources/app.asar | /usr/bin/awk '{print $1}')
official_header_hash=$(/usr/libexec/PlistBuddy -c 'Print :ElectronAsarIntegrity:Resources/app.asar:hash' ${official_app}/Contents/Info.plist)
[[ ${official_hash} == ${expected_official_hash} ]] || { print -u2 'BLOCKED_SOURCE_DRIFT: official ASAR hash'; exit 1; }
[[ ${official_header_hash} == ${expected_official_header_hash} ]] || { print -u2 'BLOCKED_SOURCE_DRIFT: official ASAR header hash'; exit 1; }
[[ ${candidate_hash} == ${expected_candidate_hash} ]] || { print -u2 'BLOCKED_VALIDATION: candidate hash'; exit 1; }
[[ ${old_math_hash} == ${expected_old_math_hash} ]] || { print -u2 'BLOCKED_ROLLBACK_READINESS: 26.818.41509 ASAR hash'; exit 1; }

official_version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' ${official_app}/Contents/Info.plist)
official_build=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' ${official_app}/Contents/Info.plist)
old_version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' ${old_math_app}/Contents/Info.plist)
old_bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' ${old_math_app}/Contents/Info.plist)
[[ ${official_version} == 26.818.61809 && ${official_build} == 7019 ]] || {
  print -u2 'BLOCKED_SOURCE_DRIFT: version or build'
  exit 1
}
[[ ${old_version} == 26.818.41509 ]] || { print -u2 'BLOCKED_ROLLBACK_READINESS: old math version'; exit 1; }
[[ ${old_bundle_id} != com.openai.codex ]] || { print -u2 'BLOCKED_BUILD: old math identity not distinct'; exit 1; }

old_team=$(/usr/bin/codesign -dvvvv ${old_math_app} 2>&1 | /usr/bin/sed -n 's/^TeamIdentifier=//p' | /usr/bin/head -n 1)
signing_identity=$(/usr/bin/codesign -dvvvv ${old_math_app} 2>&1 | /usr/bin/sed -n 's/^Authority=//p' | /usr/bin/head -n 1)
old_requirement=$(/usr/bin/codesign -d -r- ${old_math_app} 2>&1 | /usr/bin/sed -n '/^designated => /p' | /usr/bin/head -n 1)
[[ ${old_team} == 'not set' && -n ${signing_identity} && -n ${old_requirement} ]] || {
  print -u2 'BLOCKED_SIGNING: old local signing topology unavailable'
  exit 1
}

/usr/bin/ditto ${official_app} ${staging_app}
/usr/bin/ditto ${candidate_asar} ${staging_app}/Contents/Resources/app.asar
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier ${old_bundle_id}" ${staging_app}/Contents/Info.plist
/usr/libexec/PlistBuddy -c 'Set :CFBundleDisplayName ChatGPT Math 26.818.61809 History' ${staging_app}/Contents/Info.plist
/usr/libexec/PlistBuddy -c "Set :ElectronAsarIntegrity:Resources/app.asar:hash ${candidate_header_hash}" ${staging_app}/Contents/Info.plist
/usr/libexec/PlistBuddy -c 'Set :ElectronAsarIntegrity:Resources/app.asar:algorithm SHA256' ${staging_app}/Contents/Info.plist

/usr/bin/codesign --force --sign ${signing_identity} --requirements "=${old_requirement}" --entitlements ${entitlements} --timestamp=none ${staging_app}
/usr/bin/codesign --verify --deep --strict --verbose=2 ${staging_app}

print -r -- "{\"status\":\"PASS_CANDIDATE_APP_BUILD\",\"path\":\"${staging_app}\",\"bundleId\":\"${old_bundle_id}\",\"version\":\"${official_version}\",\"build\":\"${official_build}\",\"asarHash\":\"${candidate_hash}\",\"headerHash\":\"${candidate_header_hash}\",\"lockReceipt\":\"${candidate_receipt}\",\"rollbackCopy\":\"${old_math_app}\"}"
