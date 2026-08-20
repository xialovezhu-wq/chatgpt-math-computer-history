#!/bin/zsh

set -u

official_app="/Applications/ChatGPT.app"
history_companion="${HOME}/Library/Application Support/Codex Math History Companion"
launch_label="com.example.codex.math.history-companion"

echo "Official app"
if [[ -d "${official_app}" ]]; then
  /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "${official_app}/Contents/Info.plist" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "${official_app}/Contents/Info.plist" 2>/dev/null || true
  /usr/bin/shasum -a 256 "${official_app}/Contents/Resources/app.asar" 2>/dev/null || true
  /usr/bin/codesign --verify --deep --strict "${official_app}" 2>&1 || true
else
  echo "not found"
fi

echo
echo "Math copies"
/usr/bin/find /Applications -maxdepth 1 -type d -name 'ChatGPT-Math*.app' -print

echo
echo "Main processes"
/bin/ps ax -o pid=,ppid=,command= | /usr/bin/grep -E '/Applications/(ChatGPT|ChatGPT-Math)[^/]*/Contents/MacOS/ChatGPT' | /usr/bin/grep -v grep || true

echo
echo "Companion profile processes"
/bin/ps ax -o pid=,ppid=,command= | /usr/bin/grep -F 'Codex Math Official Companion Shared Config' | /usr/bin/grep -v grep || true

echo
echo "Companion PID file"
if [[ -f "${history_companion}/official-main.pid" ]]; then
  /bin/cat "${history_companion}/official-main.pid"
else
  echo "not found"
fi

echo
echo "LaunchAgent"
/bin/launchctl print "gui/$(/usr/bin/id -u)/${launch_label}" 2>/dev/null | /usr/bin/grep -E 'state =|runs =|last exit code|run interval' || true

echo
echo "Installed math sentinels"
for app in /Applications/ChatGPT-Math*.app; do
  asar="${app}/Contents/Resources/app.asar"
  [[ -f "${asar}" ]] || continue
  echo "${asar}"
  /usr/bin/grep -aEo 'codex-single-dollar-math|codex-annotation-math|codexMathHistoryCall' "${asar}" | /usr/bin/sort | /usr/bin/uniq -c || true
done

echo
echo "This script is read-only. It does not call pause, resume, enable, disable, open, kill, or launchctl mutation commands."

