#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
repo_root=${script_dir:h}
staging_app=${repo_root}/build/26.818.61809/ChatGPT-Math-26.818.61809-History.app
target_app=/Applications/ChatGPT-Math-26.818.61809-History.app
deploying_app=/Applications/.ChatGPT-Math-26.818.61809-History.deploying.app
old_math_app=/Applications/ChatGPT-Math-26.818.41509-History.app
rollback_dir=${repo_root}/build/26.818.61809/rollback
failed_app=${rollback_dir}/failed-during-deployment-ChatGPT-Math-26.818.61809-History.app
manifest=${rollback_dir}/pre-deployment-state.txt
expected_official_hash=76bbcdc2a4a2d77cfe03904a6537d0a655f9892f27a8925e3a6c7b613801d4cf
expected_old_math_hash=19095005e8ea6862aa5d04ddf92f60ef605ea38fb34e3dac4f05653a6c9b8a48

[[ -d ${staging_app} ]] || { print -u2 'BLOCKED_DEPLOYMENT: staging app missing'; exit 1; }
[[ -d ${old_math_app} ]] || { print -u2 'BLOCKED_ROLLBACK_READINESS: 26.818.41509 math copy missing'; exit 1; }
[[ ! -e ${target_app} ]] || { print -u2 'BLOCKED_DEPLOYMENT: target already exists'; exit 1; }
[[ ! -e ${deploying_app} ]] || { print -u2 'BLOCKED_DEPLOYMENT: temporary target already exists'; exit 1; }
[[ ! -e ${failed_app} ]] || { print -u2 'BLOCKED_ROLLBACK_READINESS: failed-app slot occupied'; exit 1; }
[[ ! -e ${manifest} ]] || { print -u2 'BLOCKED_ROLLBACK_READINESS: rollback manifest already exists'; exit 1; }

current_official_hash=$(/usr/bin/shasum -a 256 /Applications/ChatGPT.app/Contents/Resources/app.asar | /usr/bin/awk '{print $1}')
current_old_math_hash=$(/usr/bin/shasum -a 256 ${old_math_app}/Contents/Resources/app.asar | /usr/bin/awk '{print $1}')
[[ ${current_official_hash} == ${expected_official_hash} ]] || { print -u2 'BLOCKED_SOURCE_DRIFT'; exit 1; }
[[ ${current_old_math_hash} == ${expected_old_math_hash} ]] || { print -u2 'BLOCKED_ROLLBACK_READINESS: 26.818.41509 ASAR hash'; exit 1; }

/usr/bin/env node ${script_dir}/verify-candidate-app-26.818.61809.mjs staging >/dev/null || {
  print -u2 'BLOCKED_VALIDATION: staging candidate failed versioned verification'
  exit 1
}

/bin/mkdir -p ${rollback_dir}
{
  print -r -- 'target_before=absent'
  print -r -- "official_asar_sha256=${current_official_hash}"
  print -r -- "old_math_bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' ${old_math_app}/Contents/Info.plist)"
  print -r -- "old_math_version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' ${old_math_app}/Contents/Info.plist)"
  print -r -- "old_math_asar_sha256=${current_old_math_hash}"
  print -r -- "staging_asar_sha256=$(/usr/bin/shasum -a 256 ${staging_app}/Contents/Resources/app.asar | /usr/bin/awk '{print $1}')"
} > ${manifest}

rollback_deployment() {
  set +e
  if [[ -e ${target_app} ]]; then /bin/mv ${target_app} ${failed_app}; fi
  if [[ -e ${deploying_app} ]]; then /bin/mv ${deploying_app} ${failed_app}; fi
}
trap rollback_deployment ERR INT TERM

/usr/bin/ditto ${staging_app} ${deploying_app}
/usr/bin/codesign --verify --deep --strict --verbose=2 ${deploying_app}
/bin/mv ${deploying_app} ${target_app}
/usr/bin/codesign --verify --deep --strict --verbose=2 ${target_app}
/usr/bin/env node ${script_dir}/verify-candidate-app-26.818.61809.mjs installed >/dev/null
trap - ERR INT TERM

print -r -- "{\"status\":\"PASS_DEPLOYMENT\",\"target\":\"${target_app}\",\"rollbackManifest\":\"${manifest}\",\"targetBefore\":\"absent\",\"oldMathPreserved\":\"${old_math_app}\"}"
