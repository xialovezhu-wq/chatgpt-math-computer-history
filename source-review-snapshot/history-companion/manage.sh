#!/bin/zsh

set -u

readonly app_binary="/Applications/ChatGPT.app/Contents/MacOS/ChatGPT"
readonly profile_dir="/Users/USER_NAME/Library/Application Support/Codex Math Official Companion Shared Config"
readonly node_binary="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node"
readonly state_dir="/Users/USER_NAME/Library/Application Support/Codex Math History Companion"
readonly mcp_call="${state_dir}/mcp-call.mjs"
readonly pid_file="${state_dir}/official-main.pid"
readonly log_file="${state_dir}/official-main.log"
readonly pause_latch="${state_dir}/manual-pause.latch"
readonly recovery_stamp="${state_dir}/last-recovery-at"
readonly recovery_cooldown_seconds=1800

mkdir -p "${state_dir}"

history_state() {
  "${node_binary}" "${mcp_call}" computer_history_status 2>/dev/null | \
    /usr/bin/sed -n 's/.*"state"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | \
    /usr/bin/head -n 1
}

saved_pid() {
  if [[ -f "${pid_file}" ]]; then
    /bin/cat "${pid_file}"
  fi
}

is_expected_main() {
  local pid="$1"
  [[ -n "${pid}" ]] || return 1
  /bin/ps -p "${pid}" -o command= 2>/dev/null | \
    /usr/bin/grep -Fq "${app_binary} --user-data-dir=${profile_dir}"
}

lower_priority() {
  local pid="$1"
  local child
  is_expected_main "${pid}" || return 1
  /usr/bin/renice 10 -p "${pid}" >/dev/null 2>&1 || true
  for child in $(/usr/bin/pgrep -P "${pid}" 2>/dev/null); do
    /usr/bin/renice 10 -p "${child}" >/dev/null 2>&1 || true
  done
}

log_event() {
  /bin/echo "$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ') $*"
}

record_manual_pause() {
  local state="$1"
  /bin/echo "$(/bin/date -u '+%Y-%m-%dT%H:%M:%SZ') ${state}" >"${pause_latch}"
  log_event "history state=${state}; manual pause respected"
}

recovery_is_cooling_down() {
  local now last
  [[ -f "${recovery_stamp}" ]] || return 1
  now=$(/bin/date +%s)
  last=$(/bin/cat "${recovery_stamp}" 2>/dev/null || /bin/echo 0)
  [[ "${last}" == <-> ]] || return 1
  (( now - last < recovery_cooldown_seconds ))
}

state=$(history_state)
pid=$(saved_pid)

case "${state}" in
  running)
    /bin/rm -f "${pause_latch}"
    if is_expected_main "${pid}"; then
      lower_priority "${pid}" || true
    fi
    exit 0
    ;;
  paused|stopped|disabled)
    record_manual_pause "${state}"
    exit 0
    ;;
esac

if [[ -f "${pause_latch}" ]]; then
  log_event "history state=${state:-unavailable}; recovery suppressed by manual pause latch"
  exit 0
fi

if is_expected_main "${pid}"; then
  lower_priority "${pid}" || true
  log_event "history state=${state:-unavailable}; companion is alive, refusing destructive restart"
  exit 1
fi

if recovery_is_cooling_down; then
  log_event "history state=${state:-unavailable}; recovery suppressed by cooldown"
  exit 0
fi

/bin/date +%s >"${recovery_stamp}"
log_event "history state=${state:-unavailable}; companion absent, starting one recovery attempt"
HOME=/Users/USER_NAME /usr/bin/open -j -n -a /Applications/ChatGPT.app --args "--user-data-dir=${profile_dir}" >>"${log_file}" 2>&1
for _ in {1..15}; do
  pid=$(/usr/bin/pgrep -f "^${app_binary} --user-data-dir=${profile_dir}$" | /usr/bin/head -n 1)
  [[ -n "${pid}" ]] && break
  /bin/sleep 1
done
[[ -n "${pid}" ]] || exit 1
/bin/echo "${pid}" >"${pid_file}"

for _ in {1..45}; do
  /bin/sleep 1
  state=$(history_state)
  if [[ "${state}" == "running" ]]; then
    /bin/rm -f "${pause_latch}"
    lower_priority "${pid}" || true
    exit 0
  fi
  if [[ "${state}" == "paused" || "${state}" == "stopped" || "${state}" == "disabled" ]]; then
    record_manual_pause "${state}"
    exit 0
  fi
done

log_event "recovery attempt did not reach a terminal history state"
exit 1
