(() => {
  "use strict";

  const CLOSE_URL = "codex-math-preview://close";
  const content = document.getElementById("preview-content");
  const status = document.getElementById("preview-status");

  function appendText(parent, value) {
    if (value) {
      parent.appendChild(document.createTextNode(value));
    }
  }

  function lineFinish(source, start) {
    const newline = source.indexOf("\n", start);
    return newline === -1 ? source.length : newline + 1;
  }

  function fenceAtLine(source, lineStart) {
    let cursor = lineStart;
    let spaces = 0;
    while (cursor < source.length && source[cursor] === " " && spaces < 4) {
      cursor += 1;
      spaces += 1;
    }
    if (spaces > 3 || (source[cursor] !== "`" && source[cursor] !== "~")) {
      return null;
    }
    const marker = source[cursor];
    let length = 0;
    while (source[cursor + length] === marker) {
      length += 1;
    }
    if (length < 3) {
      return null;
    }
    return { marker, length, afterRun: cursor + length };
  }

  function closingFenceAtLine(source, lineStart, opening) {
    const candidate = fenceAtLine(source, lineStart);
    if (!candidate || candidate.marker !== opening.marker || candidate.length < opening.length) {
      return false;
    }
    const finish = lineFinish(source, lineStart);
    const contentFinish = source[finish - 1] === "\n" ? finish - 1 : finish;
    const tail = source.slice(candidate.afterRun, contentFinish).replace(/\r$/, "");
    return /^[ \t]*$/.test(tail);
  }

  function findInlineClose(source, start, runLength) {
    let cursor = start;
    while (cursor < source.length) {
      const found = source.indexOf("`", cursor);
      if (found === -1) {
        return -1;
      }
      let length = 0;
      while (source[found + length] === "`") {
        length += 1;
      }
      if (length === runLength) {
        return found;
      }
      cursor = found + length;
    }
    return -1;
  }

  function appendMarkdown(parent, source) {
    let cursor = 0;
    while (cursor < source.length) {
      const atLineStart = cursor === 0 || source[cursor - 1] === "\n";
      const opening = atLineStart ? fenceAtLine(source, cursor) : null;
      if (opening) {
        const bodyStart = lineFinish(source, cursor);
        let lineStart = bodyStart;
        let closingStart = -1;
        let closingFinish = source.length;
        while (lineStart < source.length) {
          if (closingFenceAtLine(source, lineStart, opening)) {
            closingStart = lineStart;
            closingFinish = lineFinish(source, lineStart);
            break;
          }
          lineStart = lineFinish(source, lineStart);
        }
        const codeText = source.slice(bodyStart, closingStart === -1 ? source.length : closingStart);
        const pre = document.createElement("pre");
        const code = document.createElement("code");
        code.textContent = codeText;
        pre.appendChild(code);
        parent.appendChild(pre);
        cursor = closingStart === -1 ? source.length : closingFinish;
        continue;
      }

      if (source[cursor] === "`") {
        let runLength = 1;
        while (source[cursor + runLength] === "`") {
          runLength += 1;
        }
        const close = findInlineClose(source, cursor + runLength, runLength);
        if (close !== -1) {
          const code = document.createElement("code");
          code.textContent = source.slice(cursor + runLength, close);
          parent.appendChild(code);
          cursor = close + runLength;
          continue;
        }
      }

      let finish = cursor + 1;
      while (finish < source.length && source[finish] !== "`" && source[finish - 1] !== "\n") {
        finish += 1;
      }
      appendText(parent, source.slice(cursor, finish));
      cursor = finish;
    }
  }

  function render(payload) {
    content.replaceChildren();
    const output = payload && typeof payload.output === "string" ? payload.output : "";
    const replacementCount = payload && Number.isSafeInteger(payload.replacementCount)
      && payload.replacementCount >= 0 ? payload.replacementCount : 0;
    const preservedCount = payload && Number.isSafeInteger(payload.preservedCount)
      && payload.preservedCount >= 0 ? payload.preservedCount : 0;

    status.textContent = `替换 ${replacementCount} 处 · 保留 ${preservedCount} 处`;
    appendMarkdown(content, output);
    renderMathInElement(content, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false }
      ],
      throwOnError: false,
      ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code"]
    });
    return {
      rendered: true,
      outputLength: output.length,
      katexNodeCount: content.querySelectorAll(".katex").length,
      editableNodeCount: document.querySelectorAll("input, textarea, [contenteditable=true]").length,
      externalResourceCount: performance.getEntriesByType("resource").filter((entry) => {
        try {
          return new URL(entry.name).protocol !== "data:";
        } catch (_error) {
          return true;
        }
      }).length
    };
  }

  window.codexMathPreview = Object.freeze({ render });
  const dataNode = document.getElementById("preview-data");
  let initialData;
  try {
    initialData = JSON.parse(dataNode.textContent);
  } catch (_error) {
    initialData = { output: "", replacementCount: 0, preservedCount: 0 };
  }
  dataNode.textContent = "";
  render(initialData);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape"
      || (event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey
        && event.key.toLowerCase() === "q")) {
      event.preventDefault();
      window.location.href = CLOSE_URL;
    }
  });
})();
