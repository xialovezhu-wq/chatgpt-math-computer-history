#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
repo_root=${script_dir:h}
staging_app=${repo_root}/build/26.818.32112/ChatGPT-Math-26.818.32112-History.app
target_app=/Applications/ChatGPT-Math-26.818.32112-History.app
deploying_app=/Applications/.ChatGPT-Math-26.818.32112-History.deploying.app
rollback_dir=${repo_root}/build/26.818.32112/rollback
failed_app=${rollback_dir}/failed-after-requirement-fix-ChatGPT-Math-26.818.32112-History.app
manifest=${rollback_dir}/pre-deployment-state-after-requirement-fix.txt

[[ -d ${staging_app} ]] || { print -u2 'BLOCKED_DEPLOYMENT: staging app missing'; exit 1; }
[[ ! -e ${target_app} ]] || { print -u2 'BLOCKED_DEPLOYMENT: target already exists'; exit 1; }
[[ ! -e ${deploying_app} ]] || { print -u2 'BLOCKED_DEPLOYMENT: temporary target already exists'; exit 1; }
[[ ! -e ${failed_app} ]] || { print -u2 'BLOCKED_ROLLBACK_READINESS: failed-app slot occupied'; exit 1; }

/bin/mkdir -p ${rollback_dir}
{
  print -r -- 'target_before=absent'
  print -r -- "official_asar_sha256=$(/usr/bin/shasum -a 256 /Applications/ChatGPT.app/Contents/Resources/app.asar | /usr/bin/awk '{print $1}')"
  print -r -- "old_math_bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' /Applications/ChatGPT-Math-26.814.41407-History.app/Contents/Info.plist)"
  print -r -- "old_math_version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' /Applications/ChatGPT-Math-26.814.41407-History.app/Contents/Info.plist)"
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

print -r -- "{\"status\":\"PASS_DEPLOYMENT\",\"target\":\"${target_app}\",\"rollbackManifest\":\"${manifest}\",\"targetBefore\":\"absent\"}"
