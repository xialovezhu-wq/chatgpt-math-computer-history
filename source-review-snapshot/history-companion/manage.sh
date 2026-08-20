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
readonly mode="${1:-}"

if (( $# > 1 )) || [[ -n "${mode}" && "${mode}" != "--user-activate" ]]; then
  /usr/bin/printf '%s\n' '{"ok":false,"state":"unavailable","reason":"invalid_arguments"}'
  exit 64
fi

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

typeset -a companion_pids

refresh_companion_pids() {
  local pid_lines
  pid_lines=$(
    /bin/ps -axo pid=,command= | /usr/bin/awk \
      -v expected="${app_binary} --user-data-dir=${profile_dir}" '
        {
          pid = $1
          $1 = ""
          sub(/^[[:space:]]+/, "", $0)
          if ($0 == expected) print pid
        }
      '
  )
  if [[ -n "${pid_lines}" ]]; then
    companion_pids=("${(@f)pid_lines}")
  else
    companion_pids=()
  fi
}

normalized_history_state() {
  case "$1" in
    running|paused|stopped|disabled|unavailable)
      /usr/bin/printf '%s\n' "$1"
      ;;
    *)
      /usr/bin/printf '%s\n' unavailable
      ;;
  esac
}

user_activate_success() {
  local companion="$1"
  /usr/bin/printf \
    '{"ok":true,"state":"running","companion":"%s"}\n' \
    "${companion}"
}

user_activate_failure() {
  local state="$1"
  local reason="$2"
  /usr/bin/printf \
    '{"ok":false,"state":"%s","reason":"%s"}\n' \
    "${state}" "${reason}"
}

user_activate() {
  local companion=reused
  local deadline
  local pid
  local state=unavailable

  refresh_companion_pids
  if (( ${#companion_pids[@]} > 1 )); then
    user_activate_failure unavailable multiple_companion_instances
    return 73
  fi

  if (( ${#companion_pids[@]} == 0 )); then
    refresh_companion_pids
    if (( ${#companion_pids[@]} > 1 )); then
      user_activate_failure unavailable multiple_companion_instances
      return 73
    fi
    if (( ${#companion_pids[@]} == 0 )); then
      companion=started
      HOME=/Users/USER_NAME /usr/bin/open -g -j -n -a /Applications/ChatGPT.app \
        --args "--user-data-dir=${profile_dir}" >>"${log_file}" 2>&1
      if (( $? != 0 )); then
        user_activate_failure unavailable launch_failed
        return 70
      fi
    fi
  fi

  deadline=$(( $(/bin/date +%s) + 45 ))
  while (( $(/bin/date +%s) <= deadline )); do
    refresh_companion_pids
    if (( ${#companion_pids[@]} > 1 )); then
      user_activate_failure "${state}" multiple_companion_instances
      return 73
    fi
    state=$(normalized_history_state "$(history_state)")
    if [[ "${state}" == "running" ]] && (( ${#companion_pids[@]} == 1 )); then
      pid="${companion_pids[1]}"
      /bin/echo "${pid}" >"${pid_file}"
      /bin/rm -f "${pause_latch}"
      lower_priority "${pid}" || true
      user_activate_success "${companion}"
      return 0
    fi
    /bin/sleep 1
  done

  user_activate_failure "${state}" activation_timeout
  return 74
}

if [[ "${mode}" == "--user-activate" ]]; then
  user_activate
  exit $?
fi

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
