local source = debug.getinfo(1, "S").source
local script = source:sub(1, 1) == "@" and source:sub(2) or source
local testsDirectory = script:match("^(.*)/[^/]+$") or "."
local moduleDirectory = testsDirectory:match("^(.*)/tests$") or "."
package.path = moduleDirectory .. "/?.lua;" .. testsDirectory .. "/?.lua;" .. package.path

local previous = package.loaded.codex_math_preview_hotkey
if previous and type(previous.stop) == "function" then pcall(previous.stop) end
package.loaded.codex_math_preview_hotkey = nil
package.loaded.codex_math_formatter = nil
package.loaded.test_preview_hotkey = nil

local tests = require("test_preview_hotkey")
local names = {}
for name in pairs(tests) do names[#names + 1] = name end
table.sort(names)
local failures = {}
for _, name in ipairs(names) do
  local ok, err = pcall(tests[name])
  if not ok then failures[#failures + 1] = "FAIL " .. name .. ": " .. tostring(err) end
end
if #failures > 0 then error(table.concat(failures, "\n"), 0) end
return string.format("PASS preview hotkey tests: %d", #names)
