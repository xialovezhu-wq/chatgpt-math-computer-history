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

if /usr/bin/grep -RIEq --exclude='self-check.sh' -- '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|Bearer[[:space:]]+[A-Za-z0-9._-]{20,}|sk-[A-Za-z0-9_-]{20,}' "${root}"; then
  echo "Potential credential material found" >&2
  exit 1
fi

if /usr/bin/grep -RIFq --exclude='self-check.sh' '/Users/xiazhibin' "${root}"; then
  echo "Unsanitized home path found" >&2
  exit 1
fi

if [[ -f "${root}/MANIFEST.sha256" ]]; then
  (
    cd "${root}"
    /usr/bin/shasum -a 256 -c MANIFEST.sha256
  )
fi

echo "Shareability checks passed"
