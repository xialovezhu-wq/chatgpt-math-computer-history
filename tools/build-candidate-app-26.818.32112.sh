#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
repo_root=${script_dir:h}
official_app=/Applications/ChatGPT.app
old_math_app=/Applications/ChatGPT-Math-26.814.41407-History.app
candidate_asar=${repo_root}/build/26.818.32112/app.asar.math-history-static.asar
staging_app=${repo_root}/build/26.818.32112/ChatGPT-Math-26.818.32112-History.app
entitlements=${script_dir}/math-local-runtime-entitlements.plist
expected_official_hash=128c748e313a7a630d689f9fa215724eb44fbea6e0a5d7990867370cf73d88d3
expected_candidate_hash=6ea7daa520796a215485fc2872b32da4c68a20ae3bc8295f2c758caa006c18e4
candidate_header_hash=07ce9b81581b9858f11cded2224d50550c9702e9fa62bbfd48f7e6f69eb48eaa

[[ -d ${official_app} ]] || { print -u2 'BLOCKED_SOURCE_DRIFT: official app missing'; exit 1; }
[[ -d ${old_math_app} ]] || { print -u2 'BLOCKED_ROLLBACK_READINESS: old math app missing'; exit 1; }
[[ -f ${candidate_asar} ]] || { print -u2 'BLOCKED_BUILD: candidate ASAR missing'; exit 1; }
[[ ! -e ${staging_app} ]] || { print -u2 'BLOCKED_BUILD: staging app already exists'; exit 1; }

official_hash=$(/usr/bin/shasum -a 256 ${official_app}/Contents/Resources/app.asar | /usr/bin/awk '{print $1}')
candidate_hash=$(/usr/bin/shasum -a 256 ${candidate_asar} | /usr/bin/awk '{print $1}')
[[ ${official_hash} == ${expected_official_hash} ]] || { print -u2 'BLOCKED_SOURCE_DRIFT'; exit 1; }
[[ ${candidate_hash} == ${expected_candidate_hash} ]] || { print -u2 'BLOCKED_VALIDATION: candidate hash'; exit 1; }

official_version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' ${official_app}/Contents/Info.plist)
official_build=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' ${official_app}/Contents/Info.plist)
old_bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' ${old_math_app}/Contents/Info.plist)
[[ ${official_version} == 26.818.32112 && ${official_build} == 6933 ]] || {
  print -u2 'BLOCKED_SOURCE_DRIFT: version or build'
  exit 1
}
[[ ${old_bundle_id} != com.openai.codex ]] || { print -u2 'BLOCKED_BUILD: old math identity not distinct'; exit 1; }

old_team=$(codesign -dvvvv ${old_math_app} 2>&1 | /usr/bin/sed -n 's/^TeamIdentifier=//p' | /usr/bin/head -n 1)
signing_identity=$(codesign -dvvvv ${old_math_app} 2>&1 | /usr/bin/sed -n 's/^Authority=//p' | /usr/bin/head -n 1)
[[ ${old_team} == 'not set' && -n ${signing_identity} ]] || {
  print -u2 'BLOCKED_SIGNING: old local signing topology unavailable'
  exit 1
}

/usr/bin/ditto ${official_app} ${staging_app}
/usr/bin/ditto ${candidate_asar} ${staging_app}/Contents/Resources/app.asar
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier ${old_bundle_id}" ${staging_app}/Contents/Info.plist
/usr/libexec/PlistBuddy -c 'Set :CFBundleDisplayName ChatGPT Math 26.818.32112 History' ${staging_app}/Contents/Info.plist
/usr/libexec/PlistBuddy -c "Set :ElectronAsarIntegrity:Resources/app.asar:hash ${candidate_header_hash}" ${staging_app}/Contents/Info.plist
/usr/libexec/PlistBuddy -c 'Set :ElectronAsarIntegrity:Resources/app.asar:algorithm SHA256' ${staging_app}/Contents/Info.plist

/usr/bin/codesign --force --sign ${signing_identity} --entitlements ${entitlements} --timestamp=none ${staging_app}

print -r -- "{\"status\":\"PASS_CANDIDATE_APP_BUILD\",\"path\":\"${staging_app}\",\"bundleId\":\"${old_bundle_id}\",\"version\":\"${official_version}\",\"build\":\"${official_build}\",\"asarHash\":\"${candidate_hash}\",\"headerHash\":\"${candidate_header_hash}\"}"
