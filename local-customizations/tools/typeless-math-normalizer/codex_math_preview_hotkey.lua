local M = {}

local activeHotkey = nil
local activeRuntime = nil
local activeOptions = nil
local activeAssets = nil
local activePreview = nil
local warmPreview = nil
local warmGeneration = 0
local controllerStopped = true
local previewGeneration = 0
local lastResult = "not_started"

local DEFAULT_BUNDLE_ID = "com.openai.codex"
local CHROME_BUNDLE_ID = "com.google.Chrome"
local SUPPORTED_BUNDLE_IDS = { DEFAULT_BUNDLE_ID, CHROME_BUNDLE_ID }
local DEFAULT_MODIFIERS = { "ctrl" }
local DEFAULT_KEY = "q"
local DEFAULT_PLACEHOLDER = "__CODEX_MATH_PREVIEW_DATA_JSON__"
local EXPECTED_PREVIEW_BUNDLE_SHA256 = "621673c45d7486e5b1eaf092493776eabd6a62ee6c696a732c72c2e1d5684783"

local function normalizePolicyURL(raw)
  if raw == nil then
    return nil, false
  end
  local current = raw
  local seen = {}
  for _ = 1, 4 do
    if type(current) == "string" then
      return current, true
    end
    if type(current) ~= "table" or seen[current] then
      return nil, false
    end
    seen[current] = true
    local nextValue = current.url
    if nextValue == nil then
      nextValue = current.URL
    end
    if nextValue == nil then
      return nil, false
    end
    current = nextValue
  end
  return nil, false
end

local function warningCount(warnings)
  if type(warnings) ~= "table" then
    return warnings == nil and 0 or 1
  end
  local total = 0
  for _, value in pairs(warnings) do
    total = total + (type(value) == "number" and math.max(0, value) or 1)
  end
  return total
end

local function safeCall(fn, ...)
  if type(fn) ~= "function" then
    return false, nil
  end
  return pcall(fn, ...)
end

local function safeAttribute(element, name)
  if not element then
    return nil
  end
  local ok, value = pcall(function()
    return element:attributeValue(name)
  end)
  if not ok then
    return nil
  end
  return value
end

local function hasClass(classes, wanted)
  if type(classes) ~= "table" then
    return false
  end
  for _, value in ipairs(classes) do
    if value == wanted then
      return true
    end
  end
  return false
end

local function hasClassPrefix(classes, prefix)
  if type(classes) ~= "table" then
    return false
  end
  for _, value in ipairs(classes) do
    if type(value) == "string" and value:sub(1, #prefix) == prefix then
      return true
    end
  end
  return false
end

local function defaultComposerMatcher(element, _context)
  if safeAttribute(element, "AXRole") ~= "AXTextArea"
    or safeAttribute(element, "AXFocused") ~= true
    or not hasClass(safeAttribute(element, "AXDOMClassList"), "ProseMirror") then
    return false
  end
  local parent = safeAttribute(element, "AXParent")
  if safeAttribute(parent, "AXRole") ~= "AXGroup"
    or not hasClassPrefix(safeAttribute(parent, "AXDOMClassList"), "_ComposerLayoutBody_") then
    return false
  end
  local ok, settable = pcall(function()
    return element:isAttributeSettable("AXSelectedTextRange")
  end)
  return ok and settable == true
end

local function attributeNameSet(element)
  if not element then
    return nil
  end
  local ok, names, axError = pcall(function()
    return element:attributeNames()
  end)
  if not ok or axError ~= nil or type(names) ~= "table" then
    return nil
  end
  local result = {}
  for _, name in ipairs(names) do
    if type(name) ~= "string" then
      return nil
    end
    result[name] = true
  end
  return result
end

local function readListedAttribute(element, names, name)
  if not names[name] then
    return true, nil, false
  end
  local ok, value, axError = pcall(function()
    return element:attributeValue(name)
  end)
  if not ok or axError ~= nil then
    return false, nil, true
  end
  return true, value, true
end

local function protectedString(value)
  local lowered = value:lower()
  return lowered:find("password", 1, true) ~= nil
    or lowered:find("secure", 1, true) ~= nil
    or lowered:find("protected", 1, true) ~= nil
    or lowered:find("密码", 1, true) ~= nil
    or lowered:find("口令", 1, true) ~= nil
    or lowered:find("安全文本", 1, true) ~= nil
end

local function chromeProtectionState(element, names)
  local booleanAttributes = {
    "AXProtectedContent", "AXPasswordField", "AXSecure", "AXPrivate",
  }
  for _, name in ipairs(booleanAttributes) do
    local ok, value = readListedAttribute(element, names, name)
    if not ok or (value ~= nil and type(value) ~= "boolean") then
      return nil
    end
    if value == true then
      return true
    end
  end
  local stringAttributes = {
    "AXSubrole", "AXRoleDescription", "AXDescription", "AXAutocompleteValue",
    "AXTitle", "AXHelp", "AXPlaceholderValue", "AXIdentifier", "AXDOMIdentifier",
  }
  for _, name in ipairs(stringAttributes) do
    local ok, value = readListedAttribute(element, names, name)
    if not ok or (value ~= nil and type(value) ~= "string") then
      return nil
    end
    if type(value) == "string" and protectedString(value) then
      return true
    end
  end
  return false
end

local function chromeEditableMatcher(element)
  if not element or safeAttribute(element, "AXFocused") ~= true
    or safeAttribute(element, "AXEnabled") ~= true then
    return false, "unsupported_text_field"
  end
  local role = safeAttribute(element, "AXRole")
  if role == "AXSecureTextField" then
    return false, "protected_text_field"
  end
  local names = attributeNameSet(element)
  if not names then
    return false, "unsupported_text_field"
  end
  local protectionState = chromeProtectionState(element, names)
  if protectionState == nil then
    return false, "unsupported_text_field"
  elseif protectionState == true then
    return false, "protected_text_field"
  end
  local okReadOnly, readOnly = readListedAttribute(element, names, "AXReadOnly")
  if not okReadOnly or (readOnly ~= nil and type(readOnly) ~= "boolean")
    or readOnly == true then
    return false, "unsupported_text_field"
  end
  local standardEditable = role == "AXTextArea" or role == "AXTextField"
  if standardEditable then
    return true
  end
  local okContentEditable, contentEditable = readListedAttribute(
    element, names, "AXContentEditable"
  )
  if not okContentEditable or contentEditable ~= true then
    return false, "unsupported_text_field"
  end
  return true
end

local function jsonForHtml(json)
  return json
    :gsub("&", "\\u0026")
    :gsub("<", "\\u003c")
    :gsub(">", "\\u003e")
    :gsub("\226\128\168", "\\u2028")
    :gsub("\226\128\169", "\\u2029")
end

local function injectData(template, placeholder, json)
  local first = template:find(placeholder, 1, true)
  if not first then
    return nil
  end
  if template:find(placeholder, first + #placeholder, true) then
    return nil
  end
  return template:sub(1, first - 1) .. json .. template:sub(first + #placeholder)
end

local function hasParentTraversal(path)
  return type(path) ~= "string" or path == ".." or path:sub(1, 3) == "../"
    or path:sub(-3) == "/.." or path:find("/../", 1, true) ~= nil
end

local function safeResolvedAssets(assets)
  if type(assets) ~= "table" or type(assets.directory) ~= "string"
    or type(assets.bundlePath) ~= "string" then
    return false
  end
  if assets.directory:sub(1, 1) ~= "/" or hasParentTraversal(assets.directory)
    or assets.bundlePath ~= assets.directory .. "/preview-bundle.html" then
    return false
  end
  return true
end

local function defaultRuntime(hsObject)
  local hs = hsObject or rawget(_G, "hs")
  if not hs then
    return nil, "hammerspoon_unavailable"
  end
  local runtime = {}
  local warmFrames = {}

  local function middleScreenFrame()
    local screens = hs.screen.allScreens()
    for _, screen in ipairs(screens) do
      if screen:name() == "Redmi 27 NU" then
        return screen:frame()
      end
    end
    for _, screen in ipairs(screens) do
      local candidate = screen:frame()
      if candidate.x == 0 then
        return candidate
      end
    end
    return hs.screen.mainScreen():frame()
  end

  function runtime.resolveAssetsDirectory(requested)
    local directory = hs.configdir .. "/codex_math_preview_assets"
    if directory:sub(1, 1) ~= "/" or hasParentTraversal(directory)
      or (requested ~= nil and requested ~= directory) then
      return nil
    end
    local directoryAttributes = hs.fs.attributes(directory)
    if not directoryAttributes or directoryAttributes.mode ~= "directory" then
      return nil
    end
    local requiredFiles = {
      "preview-bundle.html",
      "preview-template.html",
      "preview.js",
      "preview.css",
      "vendor/katex/VERSION",
      "vendor/katex/LICENSE",
    }
    for _, relative in ipairs(requiredFiles) do
      local attributes = hs.fs.attributes(directory .. "/" .. relative)
      if not attributes or attributes.mode ~= "file" then
        return nil
      end
    end
    local bundleHandle = io.open(directory .. "/preview-bundle.html", "rb")
    if not bundleHandle then
      return nil
    end
    local bundleBytes = bundleHandle:read("*a")
    bundleHandle:close()
    if hs.hash.SHA256(bundleBytes) ~= EXPECTED_PREVIEW_BUNDLE_SHA256 then
      return nil
    end
    return {
      directory = directory,
      bundlePath = directory .. "/preview-bundle.html",
    }
  end

  function runtime.bindHotkey(modifiers, key, callback, bundleIDs)
    local hotkey = hs.hotkey.new(modifiers, key, callback)
    if not hotkey then
      return nil
    end
    local watcher
    local deleted = false
    local allowed = {}
    for _, bundleID in ipairs(bundleIDs) do
      allowed[bundleID] = true
    end
    local function sync(app)
      if deleted then
        return
      end
      local bundleID = app and app:bundleID() or nil
      if bundleID and (allowed[bundleID]
        or (bundleID == "org.hammerspoon.Hammerspoon" and activePreview ~= nil)) then
        hotkey:enable()
      else
        hotkey:disable()
      end
    end
    watcher = hs.application.watcher.new(function(_, eventType, app)
      if eventType == hs.application.watcher.activated then
        sync(app)
      elseif eventType == hs.application.watcher.terminated
        and app and allowed[app:bundleID()] then
        sync(hs.application.frontmostApplication())
      end
    end)
    watcher:start()
    sync(hs.application.frontmostApplication())
    return {
      sync = function()
        sync(hs.application.frontmostApplication())
      end,
      delete = function()
        if deleted then
          return
        end
        deleted = true
        watcher:stop()
        hotkey:disable()
        hotkey:delete()
      end,
    }
  end

  function runtime.context()
    local app = hs.application.frontmostApplication()
    local window = app and app:focusedWindow() or nil
    local system = hs.axuielement.systemWideElement()
    local element = system and system:attributeValue("AXFocusedUIElement") or nil
    if not app or not window then
      return nil
    end
    return {
      bundleID = app:bundleID(),
      pid = app:pid(),
      windowID = window:id(),
      element = element,
    }
  end

  function runtime.readDraft(element)
    local ok, value = pcall(function()
      return element:attributeValue("AXValue")
    end)
    if not ok or type(value) ~= "string" then
      return nil
    end
    return value
  end

  function runtime.readTemplate(path)
    local handle = io.open(path, "rb")
    if not handle then
      return nil
    end
    local contents = handle:read("*a")
    handle:close()
    return contents
  end

  function runtime.encodeJSON(value)
    return hs.json.encode(value, false)
  end

  local function installCallbacks(view, callbacks)
    view:navigationCallback(function(action)
      callbacks.navigation(action)
    end)
    view:policyCallback(function(kind, _, action)
      local request = type(action) == "table" and (action.request or action.response) or nil
      local rawURL = type(request) == "table" and (request.URL or request.url) or nil
      return callbacks.policy(kind, rawURL)
    end)
    view:windowCallback(function(action, _, state)
      callbacks.window(action, state)
    end)
  end

  local function createPreview(html, callbacks, frame)
    local screenFrame = middleScreenFrame()
    local desired = frame or {
      x = screenFrame.x + math.floor(screenFrame.w * 0.01),
      y = screenFrame.y + math.floor(screenFrame.h * 0.01),
      w = math.floor(screenFrame.w * 0.28),
      h = math.floor(screenFrame.h * 0.96),
    }
    local view = hs.webview.new(desired, {
      developerExtrasEnabled = false,
      javaScriptCanOpenWindowsAutomatically = false,
      privateBrowsing = true,
    })
    if not view then
      return nil
    end
    view:allowNewWindows(false)
    -- Hammerspoon 1.1.1 only emits webview focusChange events when text-entry
    -- focus is enabled. The bundled document contains no editable element;
    -- this setting exists only so Escape and focus-loss closure are reliable.
    view:allowTextEntry(true)
    view:allowGestures(false)
    view:windowStyle({ "titled", "closable", "resizable" })
    view:windowTitle("数学格式只读预览")
    view:deleteOnClose(true)
    view:closeOnEscape(true)
    installCallbacks(view, callbacks)
    view:html(html)
    return view, desired
  end

  function runtime.showPreview(view, desiredFrame)
    local desired = warmFrames[view] or desiredFrame
    if desired then
      view:allowTextEntry(true)
      view:alpha(0)
      view:frame(desired)
      view:level(hs.drawing.windowLevels.screenSaver)
      warmFrames[view] = nil
      view:alpha(1)
    end
    view:level(hs.drawing.windowLevels.screenSaver)
    view:show():bringToFront(true)
    local previewHosts = hs.application.applicationsForBundleID("org.hammerspoon.Hammerspoon")
    if type(previewHosts) == "table" and previewHosts[1] then
      previewHosts[1]:activate(true)
    end
    -- bringToFront plus application activation focuses the WebView
    -- asynchronously. Forcing native window focus blocks Hammerspoon 1.1.1 for about
    -- 1.7 seconds, so the generation-bound focus arm timer remains the
    -- fail-closed authority instead of forcing focus synchronously.
    return true
  end

  function runtime.openPreview(html, callbacks, frame)
    local view, desired = createPreview(html, callbacks, frame)
    if not view then
      return nil
    end
    runtime.showPreview(view, desired)
    return view
  end

  function runtime.createWarmPreview(html, callbacks, frame)
    local view, desired = createPreview(html, callbacks, frame)
    if not view then
      return nil
    end
    local screenFrame = middleScreenFrame()
    warmFrames[view] = desired
    view:allowTextEntry(false)
    view:alpha(0)
    view:level(hs.drawing.windowLevels.desktop)
    view:frame({
      x = screenFrame.x - desired.w - 10000,
      y = screenFrame.y - desired.h - 10000,
      w = desired.w,
      h = desired.h,
    })
    view:show()
    return view
  end

  function runtime.setPreviewCallbacks(view, callbacks)
    installCallbacks(view, callbacks)
    return true
  end

  function runtime.renderPreview(view, json, callback)
    local script = "window.codexMathPreview.render(" .. jsonForHtml(json) .. ")"
    view:evaluateJavaScript(script, function(result, error)
      local errorCode = type(error) == "table" and tonumber(error.code) or nil
      if error ~= nil and errorCode ~= 0 then
        callback(nil, true)
        return
      end
      if type(result) == "string" then
        local okDecode, decoded = pcall(hs.json.decode, result)
        if okDecode then
          result = decoded
        end
      end
      callback(result, false)
    end)
    return true
  end

  function runtime.after(seconds, callback)
    return hs.timer.doAfter(seconds, callback)
  end

  function runtime.originalWindowValid(frozen)
    local originalApp = hs.application.applicationForPID(frozen.pid)
    if not originalApp or originalApp:bundleID() ~= frozen.bundleID then
      return false
    end
    for _, window in ipairs(originalApp:allWindows()) do
      if window:id() == frozen.windowID then
        return true
      end
    end
    return false
  end

  function runtime.watchApplications(callback)
    local watcher = hs.application.watcher.new(function(_, eventType, app)
      if eventType == hs.application.watcher.activated and app then
        callback({ bundleID = app:bundleID(), pid = app:pid() })
      end
    end)
    watcher:start()
    return watcher
  end

  function runtime.cancelWatcher(watcher)
    if watcher then
      watcher:stop()
    end
    return true
  end

  function runtime.closeView(view)
    warmFrames[view] = nil
    view:delete()
    return true
  end

  function runtime.inspectPreview(view, callback)
    local script = [[
      (() => {
        const resources = performance.getEntriesByType("resource");
        let localResources = 0;
        let externalResources = 0;
        for (const resource of resources) {
          try {
            if (new URL(resource.name).protocol === "file:") localResources += 1;
            else externalResources += 1;
          } catch (_error) {
            externalResources += 1;
          }
        }
        return {
          ready: document.readyState === "complete",
          katexAvailable: typeof window.katex === "object",
          autoRenderAvailable: typeof window.renderMathInElement === "function",
          katexNodeCount: document.querySelectorAll(".katex").length,
          editableNodeCount: document.querySelectorAll("input, textarea, [contenteditable=true]").length,
          previewTextLength: document.getElementById("preview-content").textContent.length,
          payloadTextLength: document.getElementById("preview-data").textContent.length,
          previewFontSize: getComputedStyle(document.getElementById("preview-content")).fontSize,
          katexFontSize: document.querySelector(".katex")
            ? getComputedStyle(document.querySelector(".katex")).fontSize : null,
          localResources,
          externalResources
        };
      })()
    ]]
    view:evaluateJavaScript(script, function(result, error)
      local errorCode = type(error) == "table" and tonumber(error.code) or nil
      if error ~= nil and errorCode ~= 0 then
        callback({
          inspectionError = true,
          errorDomain = type(error) == "table" and error.domain or nil,
          errorCode = errorCode,
          errorDescription = type(error) == "table"
            and (error.localizedDescription or error.description or error.reason) or nil,
        })
        return
      end
      if type(result) == "table" then
        local okLevel, level = pcall(function() return view:level() end)
        if okLevel then
          result.windowLevel = level
        end
        callback(result)
        return
      end
      if type(result) == "string" then
        local ok, decoded = pcall(hs.json.decode, result)
        if ok and type(decoded) == "table" then
          callback(decoded)
          return
        end
      end
      callback({ inspectionError = true, resultType = type(result) })
    end)
    return true
  end

  function runtime.cancelTimer(timer)
    if timer then
      timer:stop()
    end
    return true
  end

  function runtime.restoreOriginalWindow(frozen)
    local app = hs.application.applicationForPID(frozen.pid)
    if not app or app:bundleID() ~= frozen.bundleID then
      return false
    end
    local window = nil
    for _, candidate in ipairs(app:allWindows()) do
      if candidate:id() == frozen.windowID then
        window = candidate
        break
      end
    end
    if not window then
      return false
    end
    app:activate(true)
    window:focus()
    return true
  end

  return runtime
end

local function destroyWarmPreview(slot)
  if not slot or warmPreview ~= slot then
    return
  end
  warmPreview = nil
  warmGeneration = warmGeneration + 1
  safeCall(slot.runtime.cancelTimer, slot.timeoutTimer)
  slot.timeoutTimer = nil
  if slot.view then
    safeCall(slot.runtime.closeView, slot.view)
  end
end

local function requestWarmPreview()
  if controllerStopped or warmPreview or not activeRuntime or not activeOptions or not activeAssets then
    return false
  end
  local okBundle, bundle = safeCall(activeRuntime.readTemplate, activeAssets.bundlePath)
  local okJSON, emptyJSON = safeCall(activeRuntime.encodeJSON, {
    output = "", replacementCount = 0, preservedCount = 0,
  })
  if not okBundle or type(bundle) ~= "string" or not okJSON or type(emptyJSON) ~= "string" then
    return false
  end
  local html = injectData(
    bundle,
    activeOptions.placeholder or DEFAULT_PLACEHOLDER,
    jsonForHtml(emptyJSON)
  )
  if not html then
    return false
  end

  warmGeneration = warmGeneration + 1
  local generation = warmGeneration
  local slot = {
    runtime = activeRuntime,
    generation = generation,
    state = "loading",
    view = nil,
  }
  warmPreview = slot
  local callbacks = {}
  local function validate()
    if controllerStopped or warmPreview ~= slot or generation ~= warmGeneration then
      return
    end
    if not slot.view then
      safeCall(slot.runtime.after, 0, validate)
      return
    end
    local okInspect, started = safeCall(slot.runtime.inspectPreview, slot.view, function(result)
      if controllerStopped or warmPreview ~= slot or generation ~= warmGeneration then
        return
      end
      local valid = type(result) == "table"
        and result.ready == true
        and result.katexAvailable == true
        and result.autoRenderAvailable == true
        and result.editableNodeCount == 0
        and result.externalResources == 0
        and result.previewTextLength == 0
        and result.payloadTextLength == 0
      if valid then
        safeCall(slot.runtime.cancelTimer, slot.timeoutTimer)
        slot.timeoutTimer = nil
        slot.state = "ready"
        if not activePreview and lastResult == "registered" then
          lastResult = "warm_ready"
        end
      else
        destroyWarmPreview(slot)
        if not activePreview then
          lastResult = "warm_validation_failed"
        end
      end
    end)
    if not okInspect or started == false then
      destroyWarmPreview(slot)
      if not activePreview then
        lastResult = "warm_validation_failed"
      end
    end
  end
  function callbacks.navigation(status)
    if controllerStopped or warmPreview ~= slot or generation ~= warmGeneration then
      return
    end
    if status == "didFinishNavigation" then
      validate()
    elseif status == "didFailNavigation" or status == "didFailProvisionalNavigation" then
      destroyWarmPreview(slot)
      if not activePreview then
        lastResult = "warm_load_failed"
      end
    end
  end
  function callbacks.policy(kind, rawURL)
    local url, known = normalizePolicyURL(rawURL)
    return not controllerStopped and warmPreview == slot and generation == warmGeneration
      and known and (kind == "navigationAction" or kind == "navigationResponse")
      and url == "about:blank"
  end
  function callbacks.window(action)
    if action == "closing" and warmPreview == slot and generation == warmGeneration then
      destroyWarmPreview(slot)
    end
  end
  local okView, view = safeCall(activeRuntime.createWarmPreview, html, callbacks, activeOptions.frame)
  if not okView or not view then
    if warmPreview == slot then
      warmPreview = nil
    end
    return false
  end
  if controllerStopped or warmPreview ~= slot or generation ~= warmGeneration then
    safeCall(slot.runtime.closeView, view)
    return false
  end
  slot.view = view
  if slot.state == "loading" then
    local timeoutTimer
    local okTimeout
    okTimeout, timeoutTimer = safeCall(activeRuntime.after, 5, function()
      if controllerStopped or warmPreview ~= slot or generation ~= warmGeneration
        or slot.state ~= "loading" or slot.timeoutTimer ~= timeoutTimer then
        return
      end
      destroyWarmPreview(slot)
      if not activePreview then
        lastResult = "warm_timeout"
      end
    end)
    if not okTimeout or not timeoutTimer then
      destroyWarmPreview(slot)
      return false
    end
    slot.timeoutTimer = timeoutTimer
  end
  return true
end

local function takeWarmPreview()
  local slot = warmPreview
  if not slot or slot.state ~= "ready" then
    return nil
  end
  warmPreview = nil
  return slot
end

local function closePreview(reason, restoreOriginal)
  local preview = activePreview
  if not preview then
    return true
  end
  activePreview = nil
  if activeHotkey and type(activeHotkey.sync) == "function" then
    safeCall(activeHotkey.sync)
  end
  previewGeneration = previewGeneration + 1
  safeCall(preview.runtime.cancelTimer, preview.timer)
  safeCall(preview.runtime.cancelTimer, preview.focusLossTimer)
  safeCall(preview.runtime.cancelTimer, preview.focusArmTimer)
  safeCall(preview.runtime.cancelWatcher, preview.watcher)
  safeCall(preview.runtime.closeView, preview.view)
  if restoreOriginal then
    safeCall(preview.runtime.restoreOriginalWindow, preview.frozen)
  end
  lastResult = reason or "closed"
  requestWarmPreview()
  return true
end

local function openPreview(options, runtime, assets)
  if activePreview then
    closePreview("closed_by_toggle", true)
    return
  end
  local okContext, frozen = safeCall(runtime.context)
  if not okContext or not frozen then
    lastResult = "unsupported_text_field"
    return
  end
  if frozen.bundleID == DEFAULT_BUNDLE_ID then
    local matcher = options.composerMatcher or defaultComposerMatcher
    local okMatch, matched = safeCall(matcher, frozen.element, frozen)
    if not okMatch or matched ~= true then
      lastResult = "not_composer"
      return
    end
  elseif frozen.bundleID == CHROME_BUNDLE_ID then
    local okMatch, matched, reason = pcall(chromeEditableMatcher, frozen.element)
    if not okMatch or matched ~= true then
      lastResult = okMatch and reason or "unsupported_text_field"
      return
    end
  else
    lastResult = "ignored_other_app"
    return
  end
  local okDraft, draft = safeCall(runtime.readDraft, frozen.element)
  if not okDraft or type(draft) ~= "string" then
    lastResult = "unsupported_text_field"
    return
  end
  if draft:match("^%s*$") then
    lastResult = "empty_draft"
    return
  end

  local formatter = options.formatter
  if not formatter then
    local ok, loaded = pcall(require, "codex_math_formatter")
    if ok then
      formatter = loaded
    end
  end
  if type(formatter) ~= "table" or type(formatter.transform) ~= "function" then
    lastResult = "formatter_unavailable"
    return
  end
  local okTransform, result = pcall(formatter.transform, draft)
  if not okTransform or type(result) ~= "table" or type(result.output) ~= "string" then
    lastResult = "format_failed"
    return
  end

  local payload = {
    output = result.output,
    replacementCount = tonumber(result.replacementCount) or 0,
    preservedCount = warningCount(result.warnings),
  }
  local okJSON, json = safeCall(runtime.encodeJSON, payload)
  if not okJSON or type(json) ~= "string" then
    lastResult = "json_failed"
    return
  end
  local warmSlot = takeWarmPreview()
  local html = nil
  if not warmSlot then
    local okTemplate, template = safeCall(runtime.readTemplate, assets.bundlePath)
    if not okTemplate or type(template) ~= "string" then
      lastResult = "template_unavailable"
      return
    end
    html = injectData(template, options.placeholder or DEFAULT_PLACEHOLDER, jsonForHtml(json))
    if not html then
      lastResult = "template_placeholder_invalid"
      return
    end
  end

  previewGeneration = previewGeneration + 1
  local generation = previewGeneration
  local preview = {
    runtime = runtime,
    frozen = frozen,
    view = nil,
    timer = nil,
    watcher = nil,
    generation = generation,
    focusArmed = false,
    focusLossTimer = nil,
    focusArmTimer = nil,
  }
  local callbacks = {}
  local function cancelFocusLossTimer()
    if preview.focusLossTimer then
      safeCall(runtime.cancelTimer, preview.focusLossTimer)
      preview.focusLossTimer = nil
    end
  end
  local function scheduleFocusLossClose()
    if preview.focusLossTimer then
      return
    end
    local timer
    local okTimer
    okTimer, timer = safeCall(runtime.after, 0.1, function()
      if generation ~= previewGeneration or activePreview ~= preview then
        return
      end
      if preview.focusLossTimer ~= timer then
        return
      end
      preview.focusLossTimer = nil
      closePreview("preview_unfocused", false)
    end)
    if not okTimer or not timer then
      closePreview("timer_failed", false)
      return
    end
    preview.focusLossTimer = timer
  end
  function callbacks.navigation(status)
    if generation ~= previewGeneration or activePreview ~= preview then
      return
    end
    if status == "didFailNavigation" or status == "didFailProvisionalNavigation" then
      closePreview("navigation_failed", false)
    end
  end
  function callbacks.policy(kind, rawURL)
    if generation ~= previewGeneration or activePreview ~= preview then
      return false
    end
    local url, urlKnown = normalizePolicyURL(rawURL)
    if not urlKnown then
      return false
    end
    if url == "codex-math-preview://close" or url == "codex-math-preview://close/" then
      closePreview("closed_by_navigation", true)
      return false
    end
    if kind == "newWindow" or kind == "authenticationChallenge" then
      return false
    end
    return (kind == "navigationAction" or kind == "navigationResponse")
      and url == "about:blank"
  end
  function callbacks.window(action, state)
    if generation ~= previewGeneration or activePreview ~= preview then
      return
    end
    if action == "closing" then
      closePreview("closed_by_window", true)
    elseif action == "focusChange" and state == true then
      preview.focusArmed = true
      cancelFocusLossTimer()
      if preview.focusArmTimer then
        safeCall(runtime.cancelTimer, preview.focusArmTimer)
        preview.focusArmTimer = nil
      end
    elseif action == "focusChange" and state == false and preview.focusArmed then
      scheduleFocusLossClose()
    end
  end
  activePreview = preview
  local function activateView(view, needsShow)
    if generation ~= previewGeneration or activePreview ~= preview or preview.view ~= view then
      return false
    end
    if needsShow then
      local okShow, shown = safeCall(runtime.showPreview, view)
      if not okShow or shown == false then
        closePreview("preview_open_failed", false)
        return false
      end
    end
    lastResult = warmSlot and "open_warm" or "open_cold"
    if not preview.focusArmed then
      local armTimer
      local okArmTimer
      okArmTimer, armTimer = safeCall(runtime.after, 0.75, function()
        if generation ~= previewGeneration or activePreview ~= preview
          or preview.focusArmTimer ~= armTimer then
          return
        end
        preview.focusArmTimer = nil
        if not preview.focusArmed then
          closePreview("preview_focus_timeout", false)
        end
      end)
      if not okArmTimer or not armTimer then
        closePreview("timer_failed", false)
        return false
      end
      preview.focusArmTimer = armTimer
    end

    local okWatcher, watcher = safeCall(runtime.watchApplications, function(app)
      if generation ~= previewGeneration or activePreview ~= preview then
        return
      end
      if app and app.bundleID == "org.hammerspoon.Hammerspoon" then
        return
      end
      local sameSourceReason = frozen.bundleID == CHROME_BUNDLE_ID
        and "chrome_activated" or "codex_activated"
      closePreview(app and app.bundleID == frozen.bundleID
        and sameSourceReason or "other_app_activated", false)
    end)
    if not okWatcher or not watcher then
      closePreview("watcher_failed", false)
      return false
    end
    preview.watcher = watcher

    local function poll()
      if generation ~= previewGeneration or activePreview ~= preview then
        return
      end
      local okWindow, windowValid = safeCall(runtime.originalWindowValid, frozen)
      if not okWindow or windowValid ~= true then
        closePreview("window_missing", false)
        return
      end
      local okTimer, timer = safeCall(runtime.after, options.pollInterval or 0.25, poll)
      if not okTimer or not timer then
        closePreview("timer_failed", false)
        return
      end
      preview.timer = timer
    end
    local okTimer, timer = safeCall(runtime.after, options.pollInterval or 0.25, poll)
    if not okTimer or not timer then
      closePreview("timer_failed", false)
      return false
    end
    preview.timer = timer
    return true
  end

  if warmSlot then
    local view = warmSlot.view
    preview.view = view
    local okCallbacks, installed = safeCall(runtime.setPreviewCallbacks, view, callbacks)
    if not okCallbacks or installed == false then
      closePreview("warm_render_failed", false)
      return
    end
    lastResult = "warm_rendering"
    local okRender, started = safeCall(runtime.renderPreview, view, json, function(metadata, failed)
      if generation ~= previewGeneration or activePreview ~= preview or preview.view ~= view then
        return
      end
      local valid = failed ~= true and type(metadata) == "table"
        and metadata.rendered == true
        and metadata.editableNodeCount == 0
        and metadata.externalResourceCount == 0
      local okWindow, windowValid = safeCall(runtime.originalWindowValid, frozen)
      local okContext, current = safeCall(runtime.context)
      local sourceUnchanged = okContext and type(current) == "table"
        and current.bundleID == frozen.bundleID
        and current.pid == frozen.pid
        and current.windowID == frozen.windowID
        and current.element == frozen.element
      if not valid then
        closePreview("warm_render_failed", false)
        return
      end
      if not okWindow or windowValid ~= true then
        closePreview("warm_window_missing", false)
        return
      end
      if not sourceUnchanged then
        closePreview("warm_source_changed", false)
        return
      end
      activateView(view, true)
    end)
    if not okRender or started == false then
      closePreview("warm_render_failed", false)
    end
    return
  end

  local okView, view = safeCall(runtime.openPreview, html, callbacks, options.frame)
  if not okView or not view then
    if activePreview == preview then
      activePreview = nil
      previewGeneration = previewGeneration + 1
    end
    lastResult = "preview_open_failed"
    return
  end
  if activePreview ~= preview then
    safeCall(runtime.closeView, view)
    return
  end
  preview.view = view
  activateView(view, false)
end

function M.start(options)
  options = options or {}
  if activeHotkey then
    return true
  end
  local runtime = options.runtime
  if not runtime then
    local built, err = defaultRuntime(options.hs)
    if not built then
      return false, err
    end
    runtime = built
  end
  local required = {
    "resolveAssetsDirectory", "bindHotkey", "context", "readDraft", "readTemplate", "encodeJSON",
    "openPreview", "createWarmPreview", "setPreviewCallbacks", "renderPreview", "showPreview",
    "after", "originalWindowValid", "watchApplications",
    "cancelWatcher", "closeView", "inspectPreview", "cancelTimer", "restoreOriginalWindow",
  }
  for _, name in ipairs(required) do
    if type(runtime[name]) ~= "function" then
      return false, "runtime_missing_" .. name
    end
  end
  local okAssets, assets = safeCall(runtime.resolveAssetsDirectory, options.assetsDirectory)
  if not okAssets or not safeResolvedAssets(assets) then
    return false, "assets_directory_invalid"
  end
  local ok, hotkey = safeCall(
    runtime.bindHotkey,
    options.modifiers or DEFAULT_MODIFIERS,
    options.key or DEFAULT_KEY,
    function() openPreview(options, runtime, assets) end,
    SUPPORTED_BUNDLE_IDS
  )
  if not ok or not hotkey then
    return false, "hotkey_bind_failed"
  end
  activeRuntime = runtime
  activeOptions = options
  activeAssets = assets
  activeHotkey = hotkey
  controllerStopped = false
  lastResult = "registered"
  requestWarmPreview()
  return true
end

function M.stop()
  controllerStopped = true
  closePreview("stopped", false)
  destroyWarmPreview(warmPreview)
  if not activeHotkey then
    return true
  end
  local hotkey = activeHotkey
  activeHotkey = nil
  activeRuntime = nil
  activeOptions = nil
  activeAssets = nil
  if type(hotkey.delete) == "function" then
    local ok = pcall(function() hotkey:delete() end)
    lastResult = "stopped"
    return ok
  end
  lastResult = "stopped"
  return true
end

function M.isEnabled()
  return activeHotkey ~= nil
end

function M.isOpen()
  return activePreview ~= nil
end

function M.showNow()
  if not activeRuntime or not activeOptions or not activeAssets then
    return false
  end
  openPreview(activeOptions, activeRuntime, activeAssets)
  return activePreview ~= nil
end

function M.inspectOpenPreview(callback)
  if not activePreview or type(callback) ~= "function" then
    return false
  end
  local ok, started = safeCall(
    activePreview.runtime.inspectPreview,
    activePreview.view,
    callback
  )
  return ok and started ~= false
end

function M.lastResultCode()
  return lastResult
end

function M.matchesCurrentComposer(element, context)
  return defaultComposerMatcher(element, context)
end

return M
