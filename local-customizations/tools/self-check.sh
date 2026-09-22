#!/bin/zsh

set -euo pipefail

root="${0:A:h:h}"

forbidden_names=(
  'ChatGPT.app'
  'app.asar'
  'manager.out.log'
  'manager.err.log'
  'official-main.log'
  'official-main.pid'
  'manual-pause.latch'
)

for name in "${forbidden_names[@]}"; do
  if /usr/bin/find "${root}" -name "${name}" -print -quit | /usr/bin/grep -q .; then
    echo "Forbidden material found: ${name}" >&2
    exit 1
  fi
done

private_key_prefix='-----BEGIN '
private_key_suffix='PRIVATE KEY-----'
bearer_prefix='Bear'
bearer_suffix='er'
api_key_prefix='s'
api_key_suffix='k-'
credential_pattern="${private_key_prefix}(RSA |EC |OPENSSH )?${private_key_suffix}|${bearer_prefix}${bearer_suffix}[[:space:]]+[A-Za-z0-9._-]{20,}|${api_key_prefix}${api_key_suffix}[A-Za-z0-9_-]{20,}"

while IFS= read -r -d '' repo_file; do
  if /usr/bin/grep -IEq -- "${credential_pattern}" "${repo_file}"; then
    echo "Potential credential material found" >&2
    exit 1
  else
    grep_status=$?
    if (( grep_status > 1 )); then
      echo "Credential scan failed" >&2
      exit 1
    fi
  fi

  if /usr/bin/grep -IFq -- "${HOME}" "${repo_file}"; then
    echo "Unsanitized home path found" >&2
    exit 1
  else
    grep_status=$?
    if (( grep_status > 1 )); then
      echo "Home-path scan failed" >&2
      exit 1
    fi
  fi
done < <(
  /usr/bin/find "${root}" \
    -path "${root}/.git" -prune -o \
    -type f -print0
)

if [[ -f "${root}/MANIFEST.sha256" ]]; then
  (
    cd "${root}"
    /usr/bin/shasum -a 256 -c MANIFEST.sha256
  )
fi

echo "Shareability checks passed"
