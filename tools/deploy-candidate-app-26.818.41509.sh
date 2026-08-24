#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
repo_root=${script_dir:h}
staging_app=${repo_root}/build/26.818.41509/ChatGPT-Math-26.818.41509-History.app
target_app=/Applications/ChatGPT-Math-26.818.41509-History.app
deploying_app=/Applications/.ChatGPT-Math-26.818.41509-History.deploying.app
old_math_app=/Applications/ChatGPT-Math-26.818.32112-History.app
rollback_dir=${repo_root}/build/26.818.41509/rollback
failed_app=${rollback_dir}/failed-during-deployment-ChatGPT-Math-26.818.41509-History.app
manifest=${rollback_dir}/pre-deployment-state.txt

[[ -d ${staging_app} ]] || { print -u2 'BLOCKED_DEPLOYMENT: staging app missing'; exit 1; }
[[ -d ${old_math_app} ]] || { print -u2 'BLOCKED_ROLLBACK_READINESS: old math app missing'; exit 1; }
[[ ! -e ${target_app} ]] || { print -u2 'BLOCKED_DEPLOYMENT: target already exists'; exit 1; }
[[ ! -e ${deploying_app} ]] || { print -u2 'BLOCKED_DEPLOYMENT: temporary target already exists'; exit 1; }
[[ ! -e ${failed_app} ]] || { print -u2 'BLOCKED_ROLLBACK_READINESS: failed-app slot occupied'; exit 1; }
[[ ! -e ${manifest} ]] || { print -u2 'BLOCKED_ROLLBACK_READINESS: rollback manifest already exists'; exit 1; }

/usr/bin/env node ${script_dir}/verify-candidate-app-26.818.41509.mjs staging >/dev/null || {
  print -u2 'BLOCKED_VALIDATION: staging candidate failed versioned verification'
  exit 1
}

/bin/mkdir -p ${rollback_dir}
{
  print -r -- 'target_before=absent'
  print -r -- "official_asar_sha256=$(/usr/bin/shasum -a 256 /Applications/ChatGPT.app/Contents/Resources/app.asar | /usr/bin/awk '{print $1}')"
  print -r -- "old_math_bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' ${old_math_app}/Contents/Info.plist)"
  print -r -- "old_math_version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' ${old_math_app}/Contents/Info.plist)"
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
trap - ERR INT TERM

print -r -- "{\"status\":\"PASS_DEPLOYMENT\",\"target\":\"${target_app}\",\"rollbackManifest\":\"${manifest}\",\"targetBefore\":\"absent\",\"oldMathPreserved\":\"${old_math_app}\"}"
