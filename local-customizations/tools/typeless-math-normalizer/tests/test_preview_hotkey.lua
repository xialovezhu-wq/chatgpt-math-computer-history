local preview = require("codex_math_preview_hotkey")

local function clone(value)
  if type(value) ~= "table" then return value end
  local result = {}
  for key, item in pairs(value) do result[key] = clone(item) end
  return result
end

local function same(left, right)
  if type(left) ~= type(right) then return false end
  if type(left) ~= "table" then return left == right end
  for key, value in pairs(left) do
    if not same(value, right[key]) then return false end
  end
  for key in pairs(right) do
    if left[key] == nil then return false end
  end
  return true
end

local function assertEqual(expected, actual, message)
  if not same(expected, actual) then
    error((message or "values differ") .. ": expected " .. tostring(expected) .. ", got " .. tostring(actual), 2)
  end
end

local function assertTrue(value, message)
  if not value then error(message or "expected true", 2) end
end

local function axElement(attributes)
  return {
    attributeValue = function(_, name)
      if attributes.throwAttributes and attributes.throwAttributes[name] then
        error("synthetic AX read failure")
      end
      if attributes.errorAttributes and attributes.errorAttributes[name] then
        return nil, "synthetic AX native error"
      end
      return attributes[name]
    end,
    attributeNames = function()
      if attributes.throwAttributeNames then
        error("synthetic AX attributeNames failure")
      end
      if attributes.attributeNamesError then
        return nil, "synthetic AX attributeNames native error"
      end
      local found = {}
      local names = {}
      local function add(name)
        if type(name) == "string" and name:sub(1, 2) == "AX" and not found[name] then
          found[name] = true
          table.insert(names, name)
        end
      end
      for name in pairs(attributes) do add(name) end
      for name in pairs(attributes.throwAttributes or {}) do add(name) end
      for name in pairs(attributes.errorAttributes or {}) do add(name) end
      return names
    end,
    isAttributeSettable = function(_, name)
      return name == "AXSelectedTextRange" and attributes.selectedRangeSettable == true
    end,
  }
end

local formatter = {
  transform = function(text)
    return {
      output = text:gsub("%$x%$", "\\(x\\)"),
      replacementCount = 1,
      warnings = {},
      changed = true,
      changes = {},
    }
  end,
}

local function newRuntime(config)
  config = config or {}
  local element = config.element or { id = "composer" }
  local runtime = {
    bindCount = 0,
    deleteCount = 0,
    closeCount = 0,
    cancelTimerCount = 0,
    cancelWatcherCount = 0,
    restoreCount = 0,
    readCount = 0,
    draft = config.draft == nil and "Before $x$ after" or config.draft,
    template = config.template or "<script type=application/json>__CODEX_MATH_PREVIEW_DATA_JSON__</script>",
    contextValue = {
      bundleID = config.bundleID or "com.openai.codex",
      pid = 101,
      windowID = 202,
      element = element,
    },
    windowValid = config.windowValid ~= false,
    timers = {},
    nextViewID = 0,
    coldOpenCount = 0,
    warmCreateCount = 0,
    warmShowCount = 0,
    renderCount = 0,
  }

  function runtime.bindHotkey(modifiers, key, callback, bundleIDs)
    runtime.bindCount = runtime.bindCount + 1
    runtime.modifiers = clone(modifiers)
    runtime.key = key
    runtime.bundleIDs = clone(bundleIDs)
    runtime.trigger = callback
    return {
      sync = function() runtime.syncCount = (runtime.syncCount or 0) + 1 end,
      delete = function() runtime.deleteCount = runtime.deleteCount + 1 end,
    }
  end

  function runtime.resolveAssetsDirectory(requested)
    runtime.requestedAssetsDirectory = requested
    local canonical = "/local/preview-assets"
    if config.missingAssets or (requested ~= nil and requested ~= canonical) then
      return nil
    end
    if config.resolvedAssets then
      return clone(config.resolvedAssets)
    end
    return {
      directory = canonical,
      bundlePath = canonical .. "/preview-bundle.html",
    }
  end

  function runtime.context()
    return {
      bundleID = runtime.contextValue.bundleID,
      pid = runtime.contextValue.pid,
      windowID = runtime.contextValue.windowID,
      element = runtime.contextValue.element,
    }
  end
  function runtime.readDraft(elementArg)
    runtime.readCount = runtime.readCount + 1
    runtime.readElement = elementArg
    if config.draftValueMissing then return nil end
    return runtime.draft
  end
  function runtime.readTemplate(path)
    runtime.readPath = path
    return runtime.template
  end
  function runtime.encodeJSON(value)
    runtime.payload = clone(value)
    return '{"output":"' .. value.output:gsub('"', '\\"') .. '"}'
  end
  function runtime.openPreview(html, callbacks, _frame)
    runtime.coldOpenCount = runtime.coldOpenCount + 1
    runtime.html = html
    runtime.callbacks = callbacks
    runtime.nextViewID = runtime.nextViewID + 1
    runtime.view = { id = runtime.nextViewID, callbacks = callbacks, kind = "cold" }
    if config.autoFocusCallback ~= false then
      callbacks.window("focusChange", true)
    end
    return runtime.view
  end
  function runtime.createWarmPreview(html, callbacks, _frame)
    runtime.warmCreateCount = runtime.warmCreateCount + 1
    if not config.enableWarm then return nil end
    runtime.nextViewID = runtime.nextViewID + 1
    local view = { id = runtime.nextViewID, callbacks = callbacks, kind = "warm" }
    runtime.latestWarmView = view
    runtime.warmCallbacks = callbacks
    runtime.warmHTML = html
    if config.syncWarmNavigation then
      callbacks.navigation(config.syncWarmNavigation)
    elseif config.syncWarmClosing then
      callbacks.window("closing")
    elseif config.syncWarmStop then
      preview.stop()
    end
    return view
  end
  function runtime.setPreviewCallbacks(view, callbacks)
    view.callbacks = callbacks
    runtime.callbacks = callbacks
    return config.installCallbacksFails ~= true
  end
  function runtime.renderPreview(view, json, callback)
    runtime.renderCount = runtime.renderCount + 1
    runtime.renderedView = view
    runtime.renderJSON = json
    runtime.renderCallback = callback
    if config.deferRender then return true end
    if config.renderFails then
      callback(nil, true)
    else
      callback({ rendered = true, editableNodeCount = 0, externalResourceCount = 0 }, false)
    end
    return true
  end
  function runtime.showPreview(view)
    runtime.warmShowCount = runtime.warmShowCount + 1
    runtime.view = view
    if config.autoFocusCallback ~= false then
      view.callbacks.window("focusChange", true)
    end
    return config.showFails ~= true
  end
  function runtime.after(_seconds, callback)
    local timer = { callback = callback, stopped = false }
    function timer:run()
      if not self.stopped then self.callback() end
    end
    table.insert(runtime.timers, timer)
    return timer
  end
  function runtime.originalWindowValid(_frozen) return runtime.windowValid end
  function runtime.watchApplications(callback)
    runtime.applicationCallback = callback
    runtime.watcher = { stopped = false }
    return runtime.watcher
  end
  function runtime.cancelWatcher(watcher)
    runtime.cancelWatcherCount = runtime.cancelWatcherCount + 1
    if watcher then watcher.stopped = true end
    return true
  end
  function runtime.closeView(_view)
    runtime.closeCount = runtime.closeCount + 1
    return true
  end
  function runtime.inspectPreview(view, callback)
    runtime.inspectCount = (runtime.inspectCount or 0) + 1
    if view and view.kind == "warm" then
      callback(config.warmInspection or {
        ready = true,
        katexAvailable = true,
        autoRenderAvailable = true,
        katexNodeCount = 0,
        editableNodeCount = 0,
        externalResources = 0,
        previewTextLength = 0,
        payloadTextLength = 0,
      })
    else
      callback({
        ready = true,
        katexAvailable = true,
        autoRenderAvailable = true,
        katexNodeCount = 1,
        editableNodeCount = 0,
        localResources = 23,
        externalResources = 0,
      })
    end
    return true
  end
  function runtime.cancelTimer(timer)
    runtime.cancelTimerCount = runtime.cancelTimerCount + 1
    if timer then timer.stopped = true end
    return true
  end
  function runtime.restoreOriginalWindow(_frozen)
    runtime.restoreCount = runtime.restoreCount + 1
    return runtime.windowValid
  end
  function runtime.runTimer(index)
    local timer = runtime.timers[index or #runtime.timers]
    if timer then timer:run() end
  end
  function runtime.finishWarm()
    if runtime.latestWarmView then
      runtime.latestWarmView.callbacks.navigation("didFinishNavigation")
    end
  end
  function runtime.finishRender(metadata, failed)
    if runtime.renderCallback then runtime.renderCallback(metadata, failed) end
  end
  return runtime
end

local function startRuntime(config, matcher, formatterOverride)
  preview.stop()
  local runtime = newRuntime(config)
  local suppliedMatcher
  if matcher ~= false then
    suppliedMatcher = matcher or function(element) return element and element.id == "composer" end
  end
  local ok = preview.start({
    runtime = runtime,
    formatter = formatterOverride or formatter,
    assetsDirectory = config and config.assetsDirectory or nil,
    composerMatcher = suppliedMatcher,
  })
  assertTrue(ok)
  return runtime
end

local tests = {}

function tests.require_has_no_side_effect_and_start_stop_are_idempotent()
  preview.stop()
  assertEqual(false, preview.isEnabled())
  assertEqual(false, preview.showNow())
  local runtime = startRuntime()
  assertTrue(preview.start({ runtime = runtime }))
  assertEqual(1, runtime.bindCount)
  assertEqual({ "ctrl" }, runtime.modifiers)
  assertEqual("q", runtime.key)
  assertEqual({ "com.openai.codex", "com.google.Chrome" }, runtime.bundleIDs)
  preview.stop()
  preview.stop()
  assertEqual(1, runtime.deleteCount)
end

function tests.explicit_show_now_uses_registered_read_only_context()
  local runtime = startRuntime()
  assertEqual(true, preview.showNow())
  assertEqual(true, preview.isOpen())
  assertEqual(1, runtime.readCount)
end

function tests.safe_runtime_inspection_returns_metadata_only()
  local runtime = startRuntime()
  assertEqual(true, preview.showNow())
  local received = nil
  assertEqual(true, preview.inspectOpenPreview(function(value) received = value end))
  assertEqual(1, runtime.inspectCount)
  assertEqual(true, received.ready)
  assertEqual(0, received.externalResources)
  assertEqual(nil, received.text)
end

function tests.assets_directory_is_resolved_and_bound_fail_closed()
  preview.stop()
  local rejected = {
    "https://invalid.example/assets",
    "/other/assets",
    "/local/preview-assets/../other",
  }
  for _, requested in ipairs(rejected) do
    local runtime = newRuntime()
    local ok = preview.start({
      runtime = runtime,
      formatter = formatter,
      assetsDirectory = requested,
    })
    assertEqual(false, ok, "unbound assets directory must be rejected")
  end

  local missingRuntime = newRuntime({ missingAssets = true })
  assertEqual(false, preview.start({ runtime = missingRuntime, formatter = formatter }))

  local remoteResultRuntime = newRuntime({
    resolvedAssets = {
      directory = "/local/preview-assets",
      bundlePath = "/other/assets/preview-bundle.html",
    },
  })
  assertEqual(false, preview.start({ runtime = remoteResultRuntime, formatter = formatter }))

  local runtime = startRuntime({ assetsDirectory = "/local/preview-assets" })
  runtime.trigger()
  assertEqual("/local/preview-assets", runtime.requestedAssetsDirectory)
  assertEqual("/local/preview-assets/preview-bundle.html", runtime.readPath)
end

function tests.preview_is_memory_only_and_json_is_html_safe()
  local runtime = startRuntime({ draft = "Before $x$ </script> after" })
  local original = runtime.draft
  runtime.trigger()
  assertEqual(true, preview.isOpen())
  assertEqual(original, runtime.draft, "draft must remain byte-identical in memory")
  assertEqual(runtime.contextValue.element, runtime.readElement)
  assertEqual("Before \\(x\\) </script> after", runtime.payload.output)
  assertTrue(runtime.html:find("\\u003c/script\\u003e", 1, true) ~= nil, "script terminator must be escaped")
  assertEqual(nil, runtime.clipboardCalls)
  assertEqual(nil, runtime.keyCalls)
  assertEqual(nil, runtime.axWriteCalls)
end

function tests.real_formatter_table_api_integrates_read_only()
  local realFormatter = require("codex_math_formatter")
  local runtime = startRuntime({ draft = "Use $x+1$ here" }, nil, realFormatter)
  runtime.trigger()
  assertEqual("Use \\(x+1\\) here", runtime.payload.output)
  assertEqual("Use $x+1$ here", runtime.draft)
end

function tests.real_formatter_table_api_renders_subscript_identifiers_read_only()
  local realFormatter = require("codex_math_formatter")
  local draft = "方向 $S_1$、$S_2$、$L_2$、$L_1$，环境变量 $HOME$。"
  local runtime = startRuntime({ draft = draft }, nil, realFormatter)
  runtime.trigger()
  assertEqual("方向 \\(S_1\\)、\\(S_2\\)、\\(L_2\\)、\\(L_1\\)，环境变量 $HOME$。", runtime.payload.output)
  assertEqual(draft, runtime.draft)
end

function tests.real_formatter_table_api_renders_coordinate_tuples_read_only()
  local realFormatter = require("codex_math_formatter")
  local draft = "点 $(-2,0,-2)$、$(-5, 2, -5)$。"
  local runtime = startRuntime({ draft = draft }, nil, realFormatter)
  runtime.trigger()
  assertEqual("点 \\((-2,0,-2)\\)、\\((-5, 2, -5)\\)。", runtime.payload.output)
  assertEqual(draft, runtime.draft)
end

function tests.non_composer_and_empty_draft_are_rejected()
  local runtime = startRuntime({}, function() return false end)
  runtime.trigger()
  assertEqual(false, preview.isOpen())
  assertEqual("not_composer", preview.lastResultCode())

  runtime = startRuntime({ draft = "   \n" })
  runtime.trigger()
  assertEqual(false, preview.isOpen())
  assertEqual("empty_draft", preview.lastResultCode())
end

function tests.chrome_textarea_textfield_and_confirmed_contenteditable_preview_once()
  local cases = {
    { AXRole = "AXTextArea", AXFocused = true, AXEnabled = true },
    { AXRole = "AXTextField", AXFocused = true, AXEnabled = true },
    { AXRole = "AXGroup", AXFocused = true, AXEnabled = true, AXContentEditable = true },
  }
  for _, attributes in ipairs(cases) do
    local runtime = startRuntime({
      bundleID = "com.google.Chrome",
      element = axElement(attributes),
      draft = "Chrome $x$ draft",
    })
    runtime.trigger()
    assertEqual(true, preview.isOpen())
    assertEqual(1, runtime.readCount, "Chrome focused value must be read exactly once")
    assertEqual("Chrome \\(x\\) draft", runtime.payload.output)
  end
end

function tests.chrome_password_and_protected_fields_are_rejected_without_read()
  local cases = {
    { AXRole = "AXSecureTextField", AXFocused = true, AXEnabled = true },
    { AXRole = "AXTextField", AXFocused = true, AXEnabled = true, AXPasswordField = true },
    { AXRole = "AXTextField", AXFocused = true, AXEnabled = true, AXAutocompleteValue = "current-password" },
    { AXRole = "AXTextArea", AXFocused = true, AXEnabled = true, AXProtectedContent = true },
    { AXRole = "AXTextField", AXFocused = true, AXEnabled = true, AXPlaceholderValue = "Password" },
  }
  for _, attributes in ipairs(cases) do
    local runtime = startRuntime({ bundleID = "com.google.Chrome", element = axElement(attributes) })
    runtime.trigger()
    assertEqual(false, preview.isOpen())
    assertEqual("protected_text_field", preview.lastResultCode())
    assertEqual(0, runtime.readCount, "protected values must never be read")
  end
end

function tests.chrome_unknown_protection_state_is_rejected_before_read()
  local cases = {
    { AXRole = "AXTextField", AXFocused = true, AXEnabled = true,
      throwAttributes = { AXProtectedContent = true } },
    { AXRole = "AXTextField", AXFocused = true, AXEnabled = true,
      AXProtectedContent = {} },
    { AXRole = "AXTextField", AXFocused = true, AXEnabled = true,
      AXSubrole = 7 },
    { AXRole = "AXTextField", AXFocused = true, AXEnabled = true,
      AXAutocompleteValue = {} },
    { AXRole = "AXTextField", AXFocused = true, AXEnabled = true,
      AXReadOnly = "false" },
    { AXRole = "AXTextField", AXFocused = true, AXEnabled = true,
      errorAttributes = { AXProtectedContent = true } },
    { AXRole = "AXTextField", AXFocused = true, AXEnabled = true,
      errorAttributes = { AXSubrole = true } },
    { AXRole = "AXTextField", AXFocused = true, AXEnabled = true,
      throwAttributeNames = true },
    { AXRole = "AXTextField", AXFocused = true, AXEnabled = true,
      attributeNamesError = true },
  }
  for _, attributes in ipairs(cases) do
    local runtime = startRuntime({ bundleID = "com.google.Chrome", element = axElement(attributes) })
    runtime.trigger()
    assertEqual(false, preview.isOpen())
    assertEqual("unsupported_text_field", preview.lastResultCode())
    assertEqual(0, runtime.readCount, "unknown protection state must stop before AXValue")
  end
end

function tests.chrome_localized_password_metadata_is_rejected_before_read()
  local runtime = startRuntime({
    bundleID = "com.google.Chrome",
    element = axElement({
      AXRole = "AXTextField", AXFocused = true, AXEnabled = true,
      AXRoleDescription = "安全文本栏",
    }),
  })
  runtime.trigger()
  assertEqual(false, preview.isOpen())
  assertEqual("protected_text_field", preview.lastResultCode())
  assertEqual(0, runtime.readCount)
end

function tests.chrome_missing_enabled_state_is_rejected_before_read()
  local runtime = startRuntime({
    bundleID = "com.google.Chrome",
    element = axElement({ AXRole = "AXTextField", AXFocused = true }),
  })
  runtime.trigger()
  assertEqual(false, preview.isOpen())
  assertEqual("unsupported_text_field", preview.lastResultCode())
  assertEqual(0, runtime.readCount)
end

function tests.chrome_no_focus_unsupported_role_and_non_string_value_are_rejected()
  local runtime = startRuntime({ bundleID = "com.google.Chrome", element = false })
  runtime.contextValue.element = nil
  runtime.trigger()
  assertEqual("unsupported_text_field", preview.lastResultCode())
  assertEqual(0, runtime.readCount)

  runtime = startRuntime({
    bundleID = "com.google.Chrome",
    element = axElement({ AXRole = "AXButton", AXFocused = true, AXEnabled = true }),
  })
  runtime.trigger()
  assertEqual("unsupported_text_field", preview.lastResultCode())
  assertEqual(0, runtime.readCount)

  runtime = startRuntime({
    bundleID = "com.google.Chrome",
    element = axElement({ AXRole = "AXTextArea", AXFocused = true, AXEnabled = true }),
    draftValueMissing = true,
  })
  runtime.trigger()
  assertEqual("unsupported_text_field", preview.lastResultCode())
  assertEqual(1, runtime.readCount)
end

function tests.other_application_is_ignored_without_reading_focused_value()
  local runtime = startRuntime({
    bundleID = "com.example.other",
    element = axElement({ AXRole = "AXTextArea", AXFocused = true, AXEnabled = true }),
  })
  runtime.trigger()
  assertEqual(false, preview.isOpen())
  assertEqual("ignored_other_app", preview.lastResultCode())
  assertEqual(0, runtime.readCount)
end

function tests.toggle_close_is_idempotent_and_restores_source_window()
  local runtime = startRuntime()
  runtime.trigger()
  runtime.trigger()
  assertEqual(false, preview.isOpen())
  assertEqual(1, runtime.closeCount)
  assertEqual(1, runtime.restoreCount)
end

function tests.explicit_close_navigation_restores_original_window()
  local runtime = startRuntime()
  runtime.trigger()
  assertEqual(false, runtime.callbacks.policy("navigationAction", "codex-math-preview://close"))
  assertEqual(false, preview.isOpen())
  assertEqual(1, runtime.restoreCount)
end

function tests.normalized_explicit_close_navigation_restores_original_window()
  local runtime = startRuntime()
  runtime.trigger()
  assertEqual(false, runtime.callbacks.policy("navigationAction", "codex-math-preview://close/"))
  assertEqual(false, preview.isOpen())
  assertEqual(1, runtime.restoreCount)
end

function tests.native_nsurl_table_is_normalized_fail_closed()
  local runtime = startRuntime()
  runtime.trigger()
  assertEqual(true, runtime.callbacks.policy("navigationAction", {
    __luaSkinType = "NSURL",
    url = "about:blank",
  }))
  assertEqual(false, runtime.callbacks.policy("navigationAction", {
    __luaSkinType = "NSURL",
    url = "https://invalid.example",
  }))
  assertEqual(false, runtime.callbacks.policy("navigationAction", {
    __luaSkinType = "NSURL",
  }))
  assertEqual(false, runtime.callbacks.policy("navigationAction", {
    url = { url = { url = { url = { url = "about:blank" } } } },
  }))
end

function tests.native_nsurl_close_route_restores_original_window()
  local runtime = startRuntime()
  runtime.trigger()
  assertEqual(false, runtime.callbacks.policy("navigationAction", {
    __luaSkinType = "NSURL",
    url = "codex-math-preview://close/",
  }))
  assertEqual(false, preview.isOpen())
  assertEqual(1, runtime.restoreCount)
end

function tests.policy_denies_external_unknown_and_new_window()
  local runtime = startRuntime()
  runtime.trigger()
  assertEqual(true, runtime.callbacks.policy("navigationAction", "about:blank"))
  assertEqual(false, runtime.callbacks.policy("navigationAction", ""))
  assertEqual(false, runtime.callbacks.policy("navigationAction", nil))
  assertEqual(false, runtime.callbacks.policy("navigationAction", "https://invalid.example"))
  assertEqual(false, runtime.callbacks.policy("newWindow", "about:blank"))
  assertEqual(false, runtime.callbacks.policy("authenticationChallenge", nil))
end

function tests.focus_false_after_focus_true_closes_without_restore()
  local runtime = startRuntime()
  runtime.trigger()
  runtime.callbacks.window("focusChange", true)
  runtime.callbacks.window("focusChange", false)
  assertEqual(true, preview.isOpen(), "focus loss must wait for the grace timer")
  runtime.runTimer(2)
  assertEqual(false, preview.isOpen())
  assertEqual(0, runtime.restoreCount)
end

function tests.focus_false_then_closing_restores_once()
  local runtime = startRuntime()
  runtime.trigger()
  runtime.callbacks.window("focusChange", true)
  runtime.callbacks.window("focusChange", false)
  local focusTimer = runtime.timers[2]
  runtime.callbacks.window("closing")
  assertEqual(false, preview.isOpen())
  assertEqual(1, runtime.restoreCount)
  focusTimer:run()
  assertEqual(1, runtime.restoreCount, "stale focus timer must not close twice")
end

function tests.closing_then_focus_false_restores_once()
  local runtime = startRuntime()
  runtime.trigger()
  runtime.callbacks.window("focusChange", true)
  runtime.callbacks.window("closing")
  runtime.callbacks.window("focusChange", false)
  assertEqual(false, preview.isOpen())
  assertEqual(1, runtime.restoreCount)
end

function tests.window_close_button_restores_original_window()
  local runtime = startRuntime()
  runtime.trigger()
  runtime.callbacks.window("closing")
  assertEqual(false, preview.isOpen())
  assertEqual(1, runtime.restoreCount)
end

function tests.codex_and_other_app_activation_close_without_focus_theft()
  local runtime = startRuntime()
  runtime.trigger()
  runtime.applicationCallback({ bundleID = "com.openai.codex", pid = 101 })
  assertEqual(false, preview.isOpen())
  assertEqual(0, runtime.restoreCount)

  runtime = startRuntime()
  runtime.trigger()
  runtime.callbacks.window("focusChange", true)
  runtime.callbacks.window("focusChange", false)
  runtime.applicationCallback({ bundleID = "com.example.other", pid = 303 })
  assertEqual(false, preview.isOpen())
  assertEqual(0, runtime.restoreCount)
end

function tests.chrome_activation_closes_with_source_specific_result()
  local runtime = startRuntime({
    bundleID = "com.google.Chrome",
    element = axElement({ AXRole = "AXTextField", AXFocused = true, AXEnabled = true }),
  })
  runtime.trigger()
  runtime.applicationCallback({ bundleID = "com.google.Chrome", pid = 101 })
  assertEqual(false, preview.isOpen())
  assertEqual("chrome_activated", preview.lastResultCode())
  assertEqual(0, runtime.restoreCount)
end

function tests.hammerspoon_activation_is_allowed_but_does_not_arm_focus()
  local runtime = startRuntime()
  runtime.trigger()
  runtime.applicationCallback({ bundleID = "org.hammerspoon.Hammerspoon", pid = 404 })
  assertEqual(true, preview.isOpen())
end

function tests.hammerspoon_activation_before_preview_focus_is_not_closed()
  local runtime = startRuntime({ autoFocusCallback = false })
  runtime.trigger()
  runtime.applicationCallback({ bundleID = "org.hammerspoon.Hammerspoon", pid = 404 })
  assertEqual(true, preview.isOpen())
  runtime.runTimer(1)
  assertEqual(false, preview.isOpen(), "host activation must not arm preview focus")
end

function tests.timer_closes_missing_window_and_stale_generation_is_inert()
  local runtime = startRuntime()
  runtime.trigger()
  local firstTimer = runtime.timers[1]
  runtime.windowValid = false
  firstTimer:run()
  assertEqual(false, preview.isOpen())
  assertEqual(0, runtime.restoreCount)

  runtime.windowValid = true
  runtime.trigger()
  firstTimer:run()
  assertEqual(true, preview.isOpen(), "old generation callback must be inert")
end

function tests.focus_false_grace_timer_closes_after_callback_arming()
  local runtime = startRuntime()
  runtime.trigger()
  runtime.callbacks.window("focusChange", false)
  assertEqual(true, preview.isOpen())
  runtime.runTimer(2)
  assertEqual(false, preview.isOpen())
end

function tests.never_focused_preview_closes_on_arm_timeout()
  local runtime = startRuntime({ autoFocusCallback = false })
  runtime.trigger()
  assertEqual(true, preview.isOpen())
  runtime.runTimer(1)
  assertEqual(false, preview.isOpen())
  assertEqual(0, runtime.restoreCount)
end

function tests.stale_focus_arm_timer_does_not_close_new_preview()
  local runtime = startRuntime({ autoFocusCallback = false })
  runtime.trigger()
  local stale = runtime.timers[1]
  runtime.callbacks.window("closing")
  runtime.trigger()
  runtime.callbacks.window("focusChange", true)
  stale.callback()
  assertEqual(true, preview.isOpen())
end

function tests.stale_focus_loss_timer_does_not_close_new_preview()
  local runtime = startRuntime()
  runtime.trigger()
  runtime.callbacks.window("focusChange", true)
  runtime.callbacks.window("focusChange", false)
  local stale = runtime.timers[2]
  runtime.callbacks.window("closing")
  runtime.trigger()
  stale.callback()
  assertEqual(true, preview.isOpen())
end

function tests.stop_closes_view_timer_and_watcher_without_restore()
  local runtime = startRuntime()
  runtime.trigger()
  preview.stop()
  assertEqual(false, preview.isOpen())
  assertEqual(1, runtime.closeCount)
  assertEqual(3, runtime.cancelTimerCount)
  assertEqual(1, runtime.cancelWatcherCount)
  assertEqual(0, runtime.restoreCount)
end

function tests.default_matcher_is_structural_and_fail_closed()
  local function element(attributes, settable)
    return {
      attributeValue = function(_, name) return attributes[name] end,
      isAttributeSettable = function(_, name)
        return name == "AXSelectedTextRange" and settable == true
      end,
    }
  end
  local parent = element({ AXRole = "AXGroup", AXDOMClassList = { "_ComposerLayoutBody_test" } })
  local composer = element({
    AXRole = "AXTextArea", AXFocused = true,
    AXDOMClassList = { "ProseMirror" }, AXParent = parent,
  }, true)
  assertEqual(true, preview.matchesCurrentComposer(composer))
  assertEqual(false, preview.matchesCurrentComposer(element({ AXRole = "AXTextArea" }, true)))
end

function tests.codex_open_path_keeps_the_structural_matcher_unchanged()
  local generic = axElement({ AXRole = "AXTextArea", AXFocused = true, AXDOMClassList = { "ProseMirror" } })
  local runtime = startRuntime({ element = generic }, false)
  runtime.trigger()
  assertEqual(false, preview.isOpen())
  assertEqual("not_composer", preview.lastResultCode())

  local parent = axElement({ AXRole = "AXGroup", AXDOMClassList = { "_ComposerLayoutBody_test" } })
  local composer = axElement({
    AXRole = "AXTextArea",
    AXFocused = true,
    AXDOMClassList = { "ProseMirror" },
    AXParent = parent,
    selectedRangeSettable = true,
  })
  runtime = startRuntime({ element = composer }, false)
  runtime.trigger()
  assertEqual(true, preview.isOpen())
end

function tests.warm_view_validates_empty_then_is_consumed_once()
  local runtime = startRuntime({ enableWarm = true })
  assertEqual(1, runtime.warmCreateCount)
  runtime.finishWarm()
  assertEqual("warm_ready", preview.lastResultCode())
  local firstWarm = runtime.latestWarmView
  runtime.trigger()
  assertEqual(true, preview.isOpen())
  assertEqual(0, runtime.coldOpenCount)
  assertEqual(1, runtime.renderCount)
  assertEqual(1, runtime.warmShowCount)
  assertEqual(firstWarm, runtime.renderedView)
  assertEqual("open_warm", preview.lastResultCode())
end

function tests.no_ready_warm_view_uses_cold_path_without_queueing_draft()
  local runtime = startRuntime({ enableWarm = true })
  runtime.trigger()
  assertEqual(1, runtime.coldOpenCount)
  assertEqual(0, runtime.renderCount)
  assertEqual("open_cold", preview.lastResultCode())
  assertEqual(1, runtime.readCount)
end

function tests.warm_render_failure_deletes_view_and_replenishes_empty_pool()
  local runtime = startRuntime({ enableWarm = true, renderFails = true })
  runtime.finishWarm()
  runtime.trigger()
  assertEqual(false, preview.isOpen())
  assertEqual(0, runtime.warmShowCount)
  assertEqual(1, runtime.closeCount)
  assertEqual(2, runtime.warmCreateCount)
  assertEqual("warm_render_failed", preview.lastResultCode())
end

function tests.stale_warm_render_callback_has_no_effect()
  local runtime = startRuntime({ enableWarm = true, deferRender = true })
  runtime.finishWarm()
  runtime.trigger()
  assertEqual("warm_rendering", preview.lastResultCode())
  assertEqual(false, preview.showNow(), "second trigger closes the rendering generation")
  runtime.finishRender({ rendered = true, editableNodeCount = 0, externalResourceCount = 0 }, false)
  assertEqual(false, preview.isOpen())
  assertEqual(0, runtime.warmShowCount)
end

function tests.consumed_warm_navigation_callback_cannot_close_active_preview()
  local runtime = startRuntime({ enableWarm = true })
  runtime.finishWarm()
  local staleCallbacks = runtime.warmCallbacks
  runtime.trigger()
  assertEqual(true, preview.isOpen())
  staleCallbacks.navigation("didFailNavigation")
  assertEqual(true, preview.isOpen())
  assertEqual("open_warm", preview.lastResultCode())
end

function tests.warm_render_does_not_show_after_source_context_changes()
  local runtime = startRuntime({ enableWarm = true, deferRender = true })
  runtime.finishWarm()
  runtime.trigger()
  runtime.contextValue.windowID = 999
  runtime.finishRender({ rendered = true, editableNodeCount = 0, externalResourceCount = 0 }, false)
  assertEqual(false, preview.isOpen())
  assertEqual(0, runtime.warmShowCount)
  assertEqual("warm_source_changed", preview.lastResultCode())
end

function tests.closed_draft_view_is_never_reused_for_next_draft()
  local runtime = startRuntime({ enableWarm = true })
  runtime.finishWarm()
  runtime.trigger()
  local firstView = runtime.view
  runtime.callbacks.window("closing")
  assertEqual(2, runtime.warmCreateCount, "close must replenish a new empty view")
  runtime.finishWarm()
  assertEqual("closed_by_window", preview.lastResultCode(), "background readiness must preserve close result")
  runtime.draft = "Second $x$ draft"
  runtime.trigger()
  assertTrue(runtime.view ~= firstView, "a draft-bearing view must never be reused")
  assertEqual(2, runtime.renderCount)
end

function tests.stop_deletes_warm_pool_and_prevents_replenishment()
  local runtime = startRuntime({ enableWarm = true })
  assertEqual(1, runtime.warmCreateCount)
  preview.stop()
  assertEqual(1, runtime.closeCount)
  assertEqual(1, runtime.warmCreateCount)
  runtime.finishWarm()
  assertEqual(false, preview.isOpen())
end

function tests.invalid_warm_metadata_is_deleted_and_cold_fallback_remains_available()
  local runtime = startRuntime({
    enableWarm = true,
    warmInspection = {
      ready = true, katexAvailable = true, autoRenderAvailable = true,
      editableNodeCount = 0, externalResources = 0, previewTextLength = 1,
      payloadTextLength = 0,
    },
  })
  runtime.finishWarm()
  assertEqual("warm_validation_failed", preview.lastResultCode())
  runtime.trigger()
  assertEqual(1, runtime.coldOpenCount)
end

function tests.warm_timeout_deletes_loading_shell_and_keeps_cold_fallback()
  local runtime = startRuntime({ enableWarm = true })
  runtime.runTimer(1)
  assertEqual("warm_timeout", preview.lastResultCode())
  assertEqual(1, runtime.closeCount)
  runtime.trigger()
  assertEqual(true, preview.isOpen())
  assertEqual(1, runtime.coldOpenCount)
end

function tests.synchronous_warm_invalidation_always_deletes_returned_view()
  local cases = {
    { syncWarmNavigation = "didFailNavigation" },
    { syncWarmNavigation = "didFailProvisionalNavigation" },
    { syncWarmClosing = true },
    { syncWarmStop = true },
  }
  for _, config in ipairs(cases) do
    config.enableWarm = true
    local runtime = startRuntime(config)
    assertEqual(1, runtime.closeCount, "orphaned synchronous warm view must be deleted")
    assertEqual(false, preview.isOpen())
    preview.stop()
    assertEqual(1, runtime.closeCount, "stop must not rediscover or duplicate-close the orphan")
  end
end

return tests
