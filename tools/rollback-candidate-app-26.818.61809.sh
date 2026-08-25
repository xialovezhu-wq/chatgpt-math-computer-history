#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
repo_root=${script_dir:h}
target_app=/Applications/ChatGPT-Math-26.818.61809-History.app
old_math_app=/Applications/ChatGPT-Math-26.818.41509-History.app
rollback_dir=${repo_root}/build/26.818.61809/rollback
failed_app=${rollback_dir}/failed-after-rollback-ChatGPT-Math-26.818.61809-History.app
manifest=${rollback_dir}/pre-deployment-state.txt

[[ -f ${manifest} ]] || { print -u2 'BLOCKED_ROLLBACK: manifest missing'; exit 1; }
[[ $(/usr/bin/sed -n 's/^target_before=//p' ${manifest}) == absent ]] || {
  print -u2 'BLOCKED_ROLLBACK: unsupported pre-deployment state'
  exit 1
}
[[ ! -e ${failed_app} ]] || { print -u2 'BLOCKED_ROLLBACK: failed-app slot occupied'; exit 1; }
[[ -d /Applications/ChatGPT.app ]] || { print -u2 'BLOCKED_ROLLBACK: official app missing'; exit 1; }
[[ -d ${old_math_app} ]] || { print -u2 'BLOCKED_ROLLBACK: 26.818.41509 math copy missing'; exit 1; }

manifest_official_hash=$(/usr/bin/sed -n 's/^official_asar_sha256=//p' ${manifest})
current_official_hash=$(/usr/bin/shasum -a 256 /Applications/ChatGPT.app/Contents/Resources/app.asar | /usr/bin/awk '{print $1}')
[[ -n ${manifest_official_hash} && ${current_official_hash} == ${manifest_official_hash} ]] || {
  print -u2 'BLOCKED_ROLLBACK: official source no longer matches deployment manifest'
  exit 1
}

manifest_old_bundle_id=$(/usr/bin/sed -n 's/^old_math_bundle_id=//p' ${manifest})
manifest_old_version=$(/usr/bin/sed -n 's/^old_math_version=//p' ${manifest})
manifest_old_hash=$(/usr/bin/sed -n 's/^old_math_asar_sha256=//p' ${manifest})
current_old_bundle_id=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' ${old_math_app}/Contents/Info.plist)
current_old_version=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' ${old_math_app}/Contents/Info.plist)
current_old_hash=$(/usr/bin/shasum -a 256 ${old_math_app}/Contents/Resources/app.asar | /usr/bin/awk '{print $1}')
[[ -n ${manifest_old_bundle_id} && -n ${manifest_old_version} && -n ${manifest_old_hash} && ${current_old_bundle_id} == ${manifest_old_bundle_id} && ${current_old_version} == ${manifest_old_version} && ${current_old_hash} == ${manifest_old_hash} ]] || {
  print -u2 'BLOCKED_ROLLBACK: 26.818.41509 math copy no longer matches deployment manifest'
  exit 1
}

if [[ -e ${target_app} ]]; then
  manifest_target_hash=$(/usr/bin/sed -n 's/^staging_asar_sha256=//p' ${manifest})
  current_target_hash=$(/usr/bin/shasum -a 256 ${target_app}/Contents/Resources/app.asar | /usr/bin/awk '{print $1}')
  [[ -n ${manifest_target_hash} && ${current_target_hash} == ${manifest_target_hash} ]] || {
    print -u2 'BLOCKED_ROLLBACK: target no longer matches deployed candidate'
    exit 1
  }
  /bin/mv ${target_app} ${failed_app}
fi
[[ ! -e ${target_app} ]] || { print -u2 'BLOCKED_ROLLBACK: target remains'; exit 1; }

print -r -- "{\"status\":\"PASS_ROLLBACK\",\"targetRestoredTo\":\"absent\",\"failedCandidate\":\"${failed_app}\",\"oldMathPreserved\":\"${old_math_app}\"}"
