local formatterPath = rawget(_G, "CODEX_MATH_FORMATTER_PATH") or "../codex_math_formatter.lua"
local formatter = dofile(formatterPath)

local testsRun = 0

local function fail(message)
  error(message, 2)
end

local function equal(actual, expected, label)
  if actual ~= expected then
    fail((label or "values differ") .. "\nexpected: " .. tostring(expected) .. "\nactual:   " .. tostring(actual))
  end
end

local function truthy(value, label)
  if not value then
    fail(label or "expected truthy value")
  end
end

local function test(name, body)
  local ok, reason = pcall(body)
  if not ok then
    error("FAIL " .. name .. ": " .. tostring(reason), 0)
  end
  testsRun = testsRun + 1
end

local function assertUnchanged(source, warning)
  local result = formatter.transform(source)
  equal(result.output, source, "unchanged output")
  equal(result.replacementCount, 0, "replacement count")
  equal(result.changed, false, "changed flag")
  equal(#result.changes, 0, "change records")
  if warning then
    truthy((result.warnings[warning] or 0) > 0, "missing warning " .. warning)
  end
end

test("positive conversion and metadata", function()
  local result = formatter.transform("before $x^2 + y^2$ after")
  equal(result.output, "before \\(x^2 + y^2\\) after")
  equal(result.replacementCount, 1)
  equal(result.changed, true)
  equal(#result.changes, 1)
  equal(result.changes[1].offset, 7)
  equal(result.changes[1].type, "single_dollar_inline")
  equal(result.changes[1].source, nil, "metadata must not contain source text")
end)

test("multiple formulas and Unicode bytes", function()
  local source = "中文 $\\alpha+β$ 与 $f(x)$ 保留。"
  local result = formatter.transform(source)
  equal(result.output, "中文 \\(\\alpha+β\\) 与 \\(f(x)\\) 保留。")
  equal(result.replacementCount, 2)
end)

test("interior bytes are preserved exactly", function()
  local interior = "x  +\tβ\\,=  值"
  local result = formatter.transform("A $" .. interior .. "$ Z")
  equal(result.output, "A \\(x  +\tβ\\,=  值\\) Z")
  equal(result.output:sub(5, 4 + #interior), interior)
end)

test("LF and CRLF are conserved", function()
  local lf = "a $x$\nb $y$\n"
  local crlf = "a $x$\r\nb $y$\r\n"
  equal(formatter.transform(lf).output, "a \\(x\\)\nb \\(y\\)\n")
  equal(formatter.transform(crlf).output, "a \\(x\\)\r\nb \\(y\\)\r\n")
end)

test("protected code contexts", function()
  assertUnchanged("`echo $HOME$` and ``$x$``")
  assertUnchanged("```sh\necho $HOME$\n```\n~~~\n$x$\n~~~")
end)

test("protected native and display math", function()
  assertUnchanged("already \\(x+y\\) and \\[z\\]")
  assertUnchanged("display $$x+y$$ stays", "double_dollar")
  assertUnchanged("ambiguous $$$x$$$ stays", "ambiguous_dollar_run")
end)

test("protected links URLs emails and HTML", function()
  local source = "[label]($target$) <https://e.test/$x$> https://e.test/$y$ a+$z$@example.com <span data-x='$q$'>"
  assertUnchanged(source)
  assertUnchanged("<!-- $hidden$ -->")
end)

test("link label remains eligible", function()
  equal(formatter.transform("[$x$](https://e.test/$path$)").output, "[\\(x\\)](https://e.test/$path$)")
end)

test("escaped dollars are rejected", function()
  assertUnchanged("escaped \\$x\\$", "escaped_dollar")
end)

test("whitespace boundaries are rejected", function()
  assertUnchanged("$ x$", "boundary_whitespace")
  assertUnchanged("$x $", "boundary_whitespace")
  assertUnchanged("$　x$", "boundary_whitespace")
end)

test("currency and shell variables are rejected while math subscripts render", function()
  local currency = formatter.transform("price $12.50$ only")
  equal(currency.output, "price $12.50$ only")
  equal(currency.warnings.currency, 1)
  equal(currency.warnings.unclosed, nil, "closed currency must not add an unclosed warning")

  local shell = formatter.transform("shell $HOME$ here")
  equal(shell.output, "shell $HOME$ here")
  equal(shell.warnings.shell_or_template_variable, 1)
  equal(shell.warnings.unclosed, nil, "closed shell token must not add an unclosed warning")
  assertUnchanged("template ${{name}}$ here", "shell_or_template_variable")

  local math = formatter.transform("方向 $S_1$、$S_2$、$L_2$、$L_1$，以及 $S1$。环境变量 $HOME$。")
  equal(math.output, "方向 \\(S_1\\)、\\(S_2\\)、\\(L_2\\)、\\(L_1\\)，以及 \\(S1\\)。环境变量 $HOME$。")
  equal(math.replacementCount, 5)
  equal(math.warnings.shell_or_template_variable, 1)
end)

test("numeric coordinate tuples render while command substitutions stay protected", function()
  local source = "点 $(-2,0,-2)$、$(-5, 2, -5)$、$(1, -4, -8)$。"
  local result = formatter.transform(source)
  equal(result.output, "点 \\((-2,0,-2)\\)、\\((-5, 2, -5)\\)、\\((1, -4, -8)\\)。")
  equal(result.replacementCount, 3)
  equal(result.warnings.shell_or_template_variable, nil)

  local shell = formatter.transform("shell $((echo hi))$ and $(printf %s)$ here")
  equal(shell.output, "shell $((echo hi))$ and $(printf %s)$ here")
  equal(shell.replacementCount, 0)
  equal(shell.warnings.shell_or_template_variable, 2)
end)

test("subscripted variable tuples render while command substitutions stay protected", function()
  local source = "一个 $M_1$ 对应了 $(x_1,y_1)$，并与 $(x,y)$ 比较。"
  local result = formatter.transform(source)
  equal(result.output, "一个 \\(M_1\\) 对应了 \\((x_1,y_1)\\)，并与 \\((x,y)\\) 比较。")
  equal(result.replacementCount, 3)
  equal(result.warnings.shell_or_template_variable, nil)

  local shell = formatter.transform("shell $((echo hi))$ and $(printf %s)$ here")
  equal(shell.output, "shell $((echo hi))$ and $(printf %s)$ here")
  equal(shell.replacementCount, 0)
  equal(shell.warnings.shell_or_template_variable, 2)
end)

test("parenthesized math expressions render while command substitutions stay protected", function()
  local source = "分母是 $(1 + \\cos xy)^2$，分子是 $\\sin xy$ 乘 $y$。"
  local result = formatter.transform(source)
  equal(result.output, "分母是 \\((1 + \\cos xy)^2\\)，分子是 \\(\\sin xy\\) 乘 \\(y\\)。")
  equal(result.replacementCount, 3)
  equal(result.warnings.shell_or_template_variable, nil)

  local powers = formatter.transform("结果 $(a+b)^2$ 与 $(x^2)$。")
  equal(powers.output, "结果 \\((a+b)^2\\) 与 \\((x^2)\\)。")
  equal(powers.replacementCount, 2)
  equal(powers.warnings.shell_or_template_variable, nil)

  local shell = formatter.transform("shell $(pwd)$ and $(git status)$ here")
  equal(shell.output, "shell $(pwd)$ and $(git status)$ here")
  equal(shell.replacementCount, 0)
  equal(shell.warnings.shell_or_template_variable, 2)
end)

test("cross-line and unclosed are rejected", function()
  assertUnchanged("$x\ny$", "cross_line")
  assertUnchanged("an unmatched $x", "unclosed")
end)

test("closing word character is rejected", function()
  assertUnchanged("$x$tail", "closing_word_character")
  assertUnchanged("$x$_tail", "closing_word_character")
end)

test("mixed text changes only safe candidates", function()
  local source = "safe $x+1$, code `$no$`, money $20$, link [x]($dest$), native \\(z\\), and $q$."
  local result = formatter.transform(source)
  equal(result.output, "safe \\(x+1\\), code `$no$`, money $20$, link [x]($dest$), native \\(z\\), and \\(q\\).")
  equal(result.replacementCount, 2)
  equal(result.warnings.currency, 1)
end)

test("failed opener does not consume a later formula", function()
  local source = "cost $100, formula $x$"
  local result = formatter.transform(source)
  equal(result.output, "cost $100, formula \\(x\\)")
  equal(result.replacementCount, 1)
  truthy((result.warnings.closing_word_character or 0) > 0)
end)

test("three single dollars cannot share a delimiter", function()
  assertUnchanged("$x$y$", "closing_word_character")
end)

test("unclosed native math protects its uncertain region", function()
  assertUnchanged("native \\(x + $y$ remains uncertain")
  assertUnchanged("native \\[x + $y$ remains uncertain")
end)

test("transform is idempotent", function()
  local once = formatter.transform("保留 $x + β$ and `$code$`")
  local twice = formatter.transform(once.output)
  equal(twice.output, once.output)
  equal(twice.replacementCount, 0)
  equal(twice.changed, false)
end)

test("deterministic fuzz preserves line endings and idempotency", function()
  math.randomseed(20260826)
  local alphabet = {
    "a", "Z", "0", "_", " ", "\t", "\n", "\r", "$", "\\", "`",
    "<", ">", "[", "]", "(", ")", "{", "}", "/", ":", "?", "=",
    "+", "-", "^", "β", "中",
  }
  for _ = 1, 500 do
    local parts = {}
    for _ = 1, math.random(0, 128) do
      parts[#parts + 1] = alphabet[math.random(1, #alphabet)]
    end
    local source = table.concat(parts)
    local first = formatter.transform(source)
    local second = formatter.transform(first.output)
    equal(second.output, first.output, "fuzz idempotency")
    local _, sourceLf = source:gsub("\n", "")
    local _, outputLf = first.output:gsub("\n", "")
    local _, sourceCr = source:gsub("\r", "")
    local _, outputCr = first.output:gsub("\r", "")
    equal(outputLf, sourceLf, "LF count")
    equal(outputCr, sourceCr, "CR count")
  end
end)

test("empty input", function()
  local result = formatter.transform("")
  equal(result.output, "")
  equal(result.replacementCount, 0)
  equal(result.changed, false)
end)

return { testsRun = testsRun }
