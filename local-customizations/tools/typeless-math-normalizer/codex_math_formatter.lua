local M = {}

local function increment(counts, name, amount)
  counts[name] = (counts[name] or 0) + (amount or 1)
end

local function mark(mask, first, last)
  for index = first, last do
    mask[index] = true
  end
end

local function isEscaped(source, index)
  local backslashes = 0
  index = index - 1
  while index >= 1 and source:byte(index) == 92 do
    backslashes = backslashes + 1
    index = index - 1
  end
  return backslashes % 2 == 1
end

local function lineEnd(source, first)
  local newline = source:find("\n", first, true)
  if newline then
    return newline - 1, newline
  end
  return #source, #source + 1
end

local function fenceAt(source, first, last)
  local index = first
  local spaces = 0
  while index <= last and source:byte(index) == 32 and spaces < 4 do
    spaces = spaces + 1
    index = index + 1
  end
  if spaces > 3 then
    return nil
  end

  local marker = source:sub(index, index)
  if marker ~= "`" and marker ~= "~" then
    return nil
  end

  local run = 0
  while index + run <= last and source:sub(index + run, index + run) == marker do
    run = run + 1
  end
  if run < 3 then
    return nil
  end
  return marker, run, index + run
end

local function protectFencedCode(source, mask)
  local first = 1
  local openMarker = nil
  local openLength = nil

  while first <= #source do
    local last, nextLine = lineEnd(source, first)
    local contentLast = last
    if contentLast >= first and source:byte(contentLast) == 13 then
      contentLast = contentLast - 1
    end
    local marker, runLength, afterRun = fenceAt(source, first, contentLast)

    if openMarker then
      mark(mask, first, math.min(nextLine, #source))
      if marker == openMarker and runLength >= openLength then
        local tail = source:sub(afterRun, contentLast)
        if tail:match("^[ \t]*$") then
          openMarker = nil
          openLength = nil
        end
      end
    elseif marker then
      openMarker = marker
      openLength = runLength
      mark(mask, first, math.min(nextLine, #source))
    end
    first = nextLine + 1
  end
end

local function protectHtml(source, mask)
  local index = 1
  while index <= #source do
    if not mask[index] and source:sub(index, index + 3) == "<!--" then
      local close = source:find("-->", index + 4, true)
      local last = close and (close + 2) or #source
      mark(mask, index, last)
      index = last + 1
    elseif not mask[index] and source:byte(index) == 60 then
      local nextByte = source:byte(index + 1)
      local looksLikeTag = nextByte == 33 or nextByte == 47 or nextByte == 63
        or (nextByte and ((nextByte >= 65 and nextByte <= 90) or (nextByte >= 97 and nextByte <= 122)))
      if looksLikeTag then
        local quote = nil
        local cursor = index + 1
        local last = nil
        while cursor <= #source do
          local byte = source:byte(cursor)
          if byte == 10 or byte == 13 then
            break
          elseif quote then
            if byte == quote and not isEscaped(source, cursor) then
              quote = nil
            end
          elseif byte == 34 or byte == 39 then
            quote = byte
          elseif byte == 62 then
            last = cursor
            break
          end
          cursor = cursor + 1
        end
        if last then
          mark(mask, index, last)
          index = last + 1
        else
          index = index + 1
        end
      else
        index = index + 1
      end
    else
      index = index + 1
    end
  end
end

local function protectInlineCode(source, mask)
  local first = 1
  while first <= #source do
    local last, nextLine = lineEnd(source, first)
    local index = first
    while index <= last do
      if not mask[index] and source:byte(index) == 96 then
        local runLength = 1
        while index + runLength <= last and source:byte(index + runLength) == 96 do
          runLength = runLength + 1
        end
        local needle = string.rep("`", runLength)
        local close = source:find(needle, index + runLength, true)
        if close and close <= last then
          mark(mask, index, close + runLength - 1)
          index = close + runLength
        else
          mark(mask, index, last)
          break
        end
      else
        index = index + 1
      end
    end
    first = nextLine + 1
  end
end

local function protectNativeMath(source, mask)
  local index = 1
  while index < #source do
    local opener = source:sub(index, index + 1)
    if not mask[index] and not isEscaped(source, index)
      and (opener == "\\(" or opener == "\\[") then
      local closer = opener == "\\(" and "\\)" or "\\]"
      local cursor = index + 2
      local close = nil
      while cursor < #source do
        local found = source:find(closer, cursor, true)
        if not found then
          break
        end
        if not isEscaped(source, found) then
          close = found
          break
        end
        cursor = found + 2
      end
      if close then
        mark(mask, index, close + 1)
        index = close + 2
      else
        mark(mask, index, #source)
        index = #source + 1
      end
    else
      index = index + 1
    end
  end
end

local function dollarRun(source, index)
  local length = 0
  while index + length <= #source and source:byte(index + length) == 36 do
    length = length + 1
  end
  return length
end

local function protectMultiDollar(source, mask, warnings)
  local index = 1
  while index <= #source do
    if not mask[index] and source:byte(index) == 36 and not isEscaped(source, index) then
      local runLength = dollarRun(source, index)
      if runLength >= 2 then
        increment(warnings, runLength == 2 and "double_dollar" or "ambiguous_dollar_run")
        local cursor = index + runLength
        local closeFirst = nil
        local closeLength = nil
        while cursor <= #source do
          if not mask[cursor] and source:byte(cursor) == 36 and not isEscaped(source, cursor) then
            local candidateLength = dollarRun(source, cursor)
            if candidateLength >= 2 then
              closeFirst = cursor
              closeLength = candidateLength
              break
            end
            cursor = cursor + 1
          else
            cursor = cursor + 1
          end
        end
        if closeFirst then
          if closeLength >= 3 then
            increment(warnings, "ambiguous_dollar_run")
          end
          mark(mask, index, closeFirst + closeLength - 1)
          index = closeFirst + closeLength
        else
          mark(mask, index, index + runLength - 1)
          index = index + runLength
        end
      else
        index = index + 1
      end
    else
      index = index + 1
    end
  end
end

local function protectLinkDestinations(source, mask)
  local index = 1
  while index < #source do
    if not mask[index] and source:sub(index, index + 1) == "](" and not isEscaped(source, index) then
      local cursor = index + 2
      local depth = 1
      local quote = nil
      while cursor <= #source do
        local byte = source:byte(cursor)
        if byte == 10 or byte == 13 then
          break
        elseif quote then
          if byte == quote and not isEscaped(source, cursor) then
            quote = nil
          end
        elseif byte == 34 or byte == 39 then
          quote = byte
        elseif byte == 40 and not isEscaped(source, cursor) then
          depth = depth + 1
        elseif byte == 41 and not isEscaped(source, cursor) then
          depth = depth - 1
          if depth == 0 then
            mark(mask, index + 1, cursor)
            index = cursor
            break
          end
        end
        cursor = cursor + 1
      end
    end
    index = index + 1
  end
end

local function protectUrlsAndEmails(source, mask)
  local index = 1
  while index <= #source do
    local byte = source:byte(index)
    if not mask[index] and byte and byte > 32 then
      local last = index
      while last + 1 <= #source do
        local nextByte = source:byte(last + 1)
        if mask[last + 1] or not nextByte or nextByte <= 32 then
          break
        end
        last = last + 1
      end
      local token = source:sub(index, last)
      local lower = token:lower()
      local isUrl = lower:find("^[%p]*https?://") or lower:find("^[%p]*www%.")
      local isEmail = token:find("[%w%._%%+%$%-]+@[%w.%-]+%.[A-Za-z][A-Za-z]+") ~= nil
      if isUrl or isEmail then
        mark(mask, index, last)
      end
      index = last + 1
    else
      index = index + 1
    end
  end
end

local function isBoundaryWhitespace(source, index, fromEnd)
  local byte = source:byte(index)
  if not byte then
    return true
  end
  if byte == 9 or byte == 10 or byte == 11 or byte == 12 or byte == 13 or byte == 32 then
    return true
  end
  if not fromEnd then
    return source:sub(index, index + 1) == "\194\160"
      or source:sub(index, index + 2) == "\227\128\128"
  end
  return source:sub(index - 1, index) == "\194\160"
    or source:sub(index - 2, index) == "\227\128\128"
end

local function isAsciiWord(byte)
  return byte and ((byte >= 48 and byte <= 57)
    or (byte >= 65 and byte <= 90)
    or (byte >= 97 and byte <= 122)
    or byte == 95)
end

local function isMathUppercaseIdentifier(content)
  return content:match("^[A-Z]$") ~= nil
    or content:match("^[A-Z][0-9]+$") ~= nil
    or content:match("^[A-Z]_[0-9]+$") ~= nil
end

local function isCoordinateNumber(token)
  return token:match("^[%+%-]?%d+$") ~= nil
    or token:match("^[%+%-]?%d+%.%d+$") ~= nil
    or token:match("^[%+%-]?%.%d+$") ~= nil
end

local function isCoordinateIdentifier(token)
  return token:match("^[A-Za-z]$") ~= nil
    or token:match("^[A-Za-z]_[A-Za-z0-9]+$") ~= nil
end

local function isMathCoordinate(content)
  local body = content:match("^%((.*)%)$")
  if not body
    or body:match("^%s*$")
    or body:match("^%s*,")
    or body:match(",%s*$")
    or body:match(",%s*,") then
    return false
  end

  local components = 0
  for component in body:gmatch("[^,]+") do
    local token = component:match("^%s*(.-)%s*$")
    if not token or (not isCoordinateNumber(token) and not isCoordinateIdentifier(token)) then
      return false
    end
    components = components + 1
  end
  return components >= 2 and components <= 4
end

local function hasParenthesizedMathSignal(content)
  -- $（...）只有出现明确数学信号时才按数学处理，避免把 shell 命令替换误转成公式。
  if content:find("\\", 1, true) then
    return true
  end
  if content:find("^", 1, true) then
    return true
  end
  return content:find("%s[%+%-=%*/]%s") ~= nil
end

local function rejectionReason(source, open, close)
  if close <= open + 1 then
    return "boundary_whitespace"
  end

  if isAsciiWord(source:byte(open - 1)) then
    return "opening_word_character"
  end
  if isAsciiWord(source:byte(close + 1)) then
    return "closing_word_character"
  end
  if isBoundaryWhitespace(source, open + 1, false)
    or isBoundaryWhitespace(source, close - 1, true) then
    return "boundary_whitespace"
  end

  local content = source:sub(open + 1, close - 1)
  if content:match("^[%+%-]?[%d][%d,.]*$") then
    return "currency"
  end
  local coordinate = isMathCoordinate(content)
  if content:match("^{{.-}}$") or content:sub(1, 1) == "{"
    or (content:sub(1, 1) == "(" and not coordinate
      and not hasParenthesizedMathSignal(content))
    or (content:match("^[A-Z_][A-Z0-9_]*$") and not isMathUppercaseIdentifier(content))
    or content:match("^[A-Z_][A-Z0-9_]*/") then
    return "shell_or_template_variable"
  end
  return nil
end

local function collectCandidates(source, mask, warnings)
  local replacements = {}
  local unmatched = {}
  local first = 1

  while first <= #source do
    local last, nextLine = lineEnd(source, first)
    local dollars = {}
    local index = first
    while index <= last do
      if source:byte(index) == 36 then
        if isEscaped(source, index) then
          increment(warnings, "escaped_dollar")
        elseif not mask[index] then
          dollars[#dollars + 1] = index
        end
      end
      index = index + 1
    end

    local candidate = 1
    while candidate + 1 <= #dollars do
      local open = dollars[candidate]
      local close = dollars[candidate + 1]
      local reason = rejectionReason(source, open, close)
      if reason then
        increment(warnings, reason)
        if reason == "boundary_whitespace" or reason == "currency"
          or reason == "shell_or_template_variable" then
          candidate = candidate + 2
        else
          candidate = candidate + 1
        end
      else
        replacements[#replacements + 1] = { open = open, close = close }
        candidate = candidate + 2
      end
    end
    if candidate <= #dollars then
      unmatched[#unmatched + 1] = dollars[candidate]
    end
    first = nextLine + 1
  end

  local crossLine = math.floor(#unmatched / 2)
  if crossLine > 0 then
    increment(warnings, "cross_line", crossLine)
  end
  if #unmatched % 2 == 1 then
    increment(warnings, "unclosed")
  end
  return replacements
end

local function render(source, replacements)
  if #replacements == 0 then
    return source
  end
  local parts = {}
  local cursor = 1
  for _, replacement in ipairs(replacements) do
    parts[#parts + 1] = source:sub(cursor, replacement.open - 1)
    parts[#parts + 1] = "\\("
    parts[#parts + 1] = source:sub(replacement.open + 1, replacement.close - 1)
    parts[#parts + 1] = "\\)"
    cursor = replacement.close + 1
  end
  parts[#parts + 1] = source:sub(cursor)
  return table.concat(parts)
end

function M.transform(source)
  assert(type(source) == "string", "source must be a string")

  local mask = {}
  local warnings = {}
  protectFencedCode(source, mask)
  protectHtml(source, mask)
  protectInlineCode(source, mask)
  protectNativeMath(source, mask)
  protectMultiDollar(source, mask, warnings)
  protectLinkDestinations(source, mask)
  protectUrlsAndEmails(source, mask)

  local replacements = collectCandidates(source, mask, warnings)
  local changes = {}
  for _, replacement in ipairs(replacements) do
    changes[#changes + 1] = {
      offset = replacement.open - 1,
      type = "single_dollar_inline",
    }
  end

  return {
    output = render(source, replacements),
    replacementCount = #replacements,
    warnings = warnings,
    changed = #replacements > 0,
    changes = changes,
  }
end

return M
