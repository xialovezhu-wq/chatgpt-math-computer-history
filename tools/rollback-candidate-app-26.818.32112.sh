#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
repo_root=${script_dir:h}
target_app=/Applications/ChatGPT-Math-26.818.32112-History.app
rollback_dir=${repo_root}/build/26.818.32112/rollback
failed_app=${rollback_dir}/failed-ChatGPT-Math-26.818.32112-History.app
manifest=${rollback_dir}/pre-deployment-state.txt

[[ -f ${manifest} ]] || { print -u2 'BLOCKED_ROLLBACK: manifest missing'; exit 1; }
[[ $(/usr/bin/sed -n 's/^target_before=//p' ${manifest}) == absent ]] || {
  print -u2 'BLOCKED_ROLLBACK: unsupported pre-deployment state'
  exit 1
}
[[ ! -e ${failed_app} ]] || { print -u2 'BLOCKED_ROLLBACK: failed-app slot occupied'; exit 1; }

if [[ -e ${target_app} ]]; then /bin/mv ${target_app} ${failed_app}; fi
[[ ! -e ${target_app} ]] || { print -u2 'BLOCKED_ROLLBACK: target remains'; exit 1; }
[[ -d /Applications/ChatGPT.app ]] || { print -u2 'BLOCKED_ROLLBACK: official app missing'; exit 1; }
[[ -d /Applications/ChatGPT-Math-26.814.41407-History.app ]] || { print -u2 'BLOCKED_ROLLBACK: old math app missing'; exit 1; }

print -r -- "{\"status\":\"PASS_ROLLBACK\",\"targetRestoredTo\":\"absent\",\"failedCandidate\":\"${failed_app}\"}"
