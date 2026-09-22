#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
repo_root=${script_dir:h}
official_app=/Applications/ChatGPT.app
old_math_app=/Applications/ChatGPT-Math-26.818.32112-History.app
candidate_asar=${repo_root}/build/26.818.41509/app.asar.math-history-static.asar
staging_app=${repo_root}/build/26.818.41509/ChatGPT-Math-26.818.41509-History.app
candidate_receipt=${repo_root}/receipts/26.818.41509-candidate-static-receipt.json
entitlements=${script_dir}/math-local-runtime-entitlements.plist
expected_official_hash=8eb91bd9efbf9a4dd04b9b0afdbfcb4e0bab5da18c1919ad74ca327c00c7e791

[[ -d ${official_app} ]] || { print -u2 'BLOCKED_SOURCE_DRIFT: official app missing'; exit 1; }
[[ -d ${old_math_app} ]] || { print -u2 'BLOCKED_ROLLBACK_READINESS: old math app missing'; exit 1; }
[[ -f ${candidate_receipt} ]] || { print -u2 'BLOCKED_VALIDATION: versioned candidate receipt missing'; exit 1; }
[[ -f ${candidate_asar} ]] || { print -u2 'BLOCKED_BUILD: candidate ASAR missing'; exit 1; }
[[ ! -e ${staging_app} ]] || { print -u2 'BLOCKED_BUILD: staging app already exists'; exit 1; }

receipt_values=$(/usr/bin/env node --input-type=module -e '
  import { readFileSync } from "node:fs";
  const receiptPath = process.argv[1];
  const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  const expectedPath = "build/26.818.41509/app.asar.math-history-static.asar";
  const sha256 = /^[0-9a-f]{64}$/u;
  if (receipt.schema_version !== 1) throw new Error("unsupported receipt schema");
  if (receipt.official_version !== "26.818.41509" || receipt.official_build !== "6962") throw new Error("receipt version or build mismatch");
  if (!Array.isArray(receipt.status) || !receipt.status.includes("PASS_STATIC_CANDIDATE")) throw new Error("receipt is not a passed static candidate");
  if (receipt.source?.sha256 !== "8eb91bd9efbf9a4dd04b9b0afdbfcb4e0bab5da18c1919ad74ca327c00c7e791") throw new Error("receipt source hash mismatch");
  if (receipt.final_candidate?.path !== expectedPath) throw new Error("receipt candidate path mismatch");
  if (!sha256.test(receipt.final_candidate?.sha256 ?? "") || !sha256.test(receipt.final_candidate?.header_sha256 ?? "")) throw new Error("receipt candidate locks missing or invalid");
  process.stdout.write(`${receipt.final_candidate.sha256}\n${receipt.final_candidate.header_sha256}`);
' ${candidate_receipt}) || { print -u2 'BLOCKED_VALIDATION: invalid versioned candidate receipt'; exit 1; }
receipt_lines=("${(@f)receipt_values}")
[[ ${#receipt_lines} == 2 ]] || { print -u2 'BLOCKED_VALIDATION: incomplete candidate locks'; exit 1; }
expected_candidate_hash=${receipt_lines[1]}
candidate_header_hash=${receipt_lines[2]}

official_hash=$(/usr/bin/shasum -a 256 ${official_app}/Contents/Resources/app.asar | /usr/bin/awk '{print $1}')
candidate_hash=$(/usr/bin/shasum -a 256 ${candidate_asar} | /usr/bin/awk '{print $1}')
[[ ${official_hash} == ${expected_official_hash} ]] || { print -u2 'BLOCKED_SOURCE_DRIFT'; exit 1; }
[[ ${candidate_hash} == ${expected_candidate_hash} ]] || { print -u2 'BLOCKED_VALIDATION: candidate hash'; exit 1; }

official_version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' ${official_app}/Contents/Info.plist)
official_build=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' ${official_app}/Contents/Info.plist)
old_bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' ${old_math_app}/Contents/Info.plist)
[[ ${official_version} == 26.818.41509 && ${official_build} == 6962 ]] || {
  print -u2 'BLOCKED_SOURCE_DRIFT: version or build'
  exit 1
}
[[ ${old_bundle_id} != com.openai.codex ]] || { print -u2 'BLOCKED_BUILD: old math identity not distinct'; exit 1; }

old_team=$(codesign -dvvvv ${old_math_app} 2>&1 | /usr/bin/sed -n 's/^TeamIdentifier=//p' | /usr/bin/head -n 1)
signing_identity=$(codesign -dvvvv ${old_math_app} 2>&1 | /usr/bin/sed -n 's/^Authority=//p' | /usr/bin/head -n 1)
old_requirement=$(codesign -d -r- ${old_math_app} 2>&1 | /usr/bin/sed -n '/^designated => /p' | /usr/bin/head -n 1)
[[ ${old_team} == 'not set' && -n ${signing_identity} && -n ${old_requirement} ]] || {
  print -u2 'BLOCKED_SIGNING: old local signing topology unavailable'
  exit 1
}

/usr/bin/ditto ${official_app} ${staging_app}
/usr/bin/ditto ${candidate_asar} ${staging_app}/Contents/Resources/app.asar
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier ${old_bundle_id}" ${staging_app}/Contents/Info.plist
/usr/libexec/PlistBuddy -c 'Set :CFBundleDisplayName ChatGPT Math 26.818.41509 History' ${staging_app}/Contents/Info.plist
/usr/libexec/PlistBuddy -c "Set :ElectronAsarIntegrity:Resources/app.asar:hash ${candidate_header_hash}" ${staging_app}/Contents/Info.plist
/usr/libexec/PlistBuddy -c 'Set :ElectronAsarIntegrity:Resources/app.asar:algorithm SHA256' ${staging_app}/Contents/Info.plist

/usr/bin/codesign --force --sign ${signing_identity} --requirements "=${old_requirement}" --entitlements ${entitlements} --timestamp=none ${staging_app}

print -r -- "{\"status\":\"PASS_CANDIDATE_APP_BUILD\",\"path\":\"${staging_app}\",\"bundleId\":\"${old_bundle_id}\",\"version\":\"${official_version}\",\"build\":\"${official_build}\",\"asarHash\":\"${candidate_hash}\",\"headerHash\":\"${candidate_header_hash}\",\"lockReceipt\":\"${candidate_receipt}\"}"
