local script = debug.getinfo(1, "S").source
local scriptPath = script:sub(1, 1) == "@" and script:sub(2) or script
local testsDirectory = scriptPath:match("^(.*[/\\])") or "./"
local formatterPath = testsDirectory .. "../codex_math_formatter.lua"
local testPath = testsDirectory .. "test_formatter.lua"

local previousFormatterPath = rawget(_G, "CODEX_MATH_FORMATTER_PATH")
_G.CODEX_MATH_FORMATTER_PATH = formatterPath
local ok, result = pcall(dofile, testPath)
_G.CODEX_MATH_FORMATTER_PATH = previousFormatterPath
if not ok then
  error(result, 0)
end
print("PASS formatter tests: " .. tostring(result.testsRun))
return result
