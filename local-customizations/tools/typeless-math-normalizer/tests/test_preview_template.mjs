import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildPreviewBundle } from "../build_preview_bundle.mjs";

const testsDirectory = path.dirname(fileURLToPath(import.meta.url));
const toolDirectory = path.resolve(testsDirectory, "..");
const templatePath = path.join(toolDirectory, "preview-template.html");
const bundlePath = path.join(toolDirectory, "preview-bundle.html");
const DATA_PLACEHOLDER = "__CODEX_MATH_PREVIEW_DATA_JSON__";
const STATIC_PLACEHOLDERS = ["__CSP__", "__PREVIEW_STYLE__", "__KATEX_JS__", "__AUTO_RENDER_JS__", "__PREVIEW_JS__"];

function occurrences(source, needle) {
  return source.split(needle).length - 1;
}

function sha256Base64(source) {
  return createHash("sha256").update(source, "utf8").digest("base64");
}

function withoutInlinePayloads(source) {
  return source
    .replace(/<style>[^]*?<\/style>/g, "<style></style>")
    .replace(/<script(?:\s+[^>]*)?>[^]*?<\/script>/g, "<script></script>");
}

export function serializePreviewData(data) {
  return JSON.stringify(data)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}

function assertJsonInjectionSafety(bundle) {
  const hostile = {
    output: "</script><script src=https://attacker.invalid/payload.js></script><img src=x onerror=alert(1)>",
    replacementCount: 1,
    preservedCount: 2,
  };
  const serialized = serializePreviewData(hostile);
  assert.equal(serialized.includes("</script>"), false);
  const rendered = bundle.replace(DATA_PLACEHOLDER, serialized);
  const dataMatch = rendered.match(/<script type="application\/json" id="preview-data">([^]*?)<\/script>/);
  assert.ok(dataMatch, "preview data script remains intact after hostile JSON insertion");
  assert.deepEqual(JSON.parse(dataMatch[1]), hostile);
  assert.equal([...rendered.matchAll(/<script>([^]*?)<\/script>/g)].length, 3);
}

function assertCspHashes(bundle) {
  const csp = bundle.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp, "generated CSP is required");
  assert.doesNotMatch(csp, /unsafe-eval|(?:^|[ ;])(?:file|https?|wss?):/i);
  assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/i);
  for (const directive of ["default-src 'none'", "connect-src 'none'", "object-src 'none'", "frame-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
    assert.ok(csp.includes(directive), `missing CSP directive ${directive}`);
  }
  assert.ok(csp.includes("font-src data:"));
  assert.ok(csp.includes("img-src data:"));

  const style = bundle.match(/<style>([^]*?)<\/style>/)?.[1];
  assert.ok(style, "one embedded style is required");
  const scripts = [...bundle.matchAll(/<script>([^]*?)<\/script>/g)].map((match) => match[1]);
  assert.equal(scripts.length, 3, "three executable inline scripts are required");
  const styleTokens = csp.match(/(?:^|; )style-src ([^;]+)/)?.[1].split(/\s+/);
  assert.deepEqual(styleTokens, ["'unsafe-inline'"]);
  const scriptTokens = csp.match(/(?:^|; )script-src ([^;]+)/)?.[1].split(/\s+/);
  assert.deepEqual(scriptTokens, scripts.map((script) => `'sha256-${sha256Base64(script)}'`));
}

export async function runPreviewTemplateTests() {
  const template = await readFile(templatePath, "utf8");
  const previewModule = await readFile(path.join(toolDirectory, "codex_math_preview_hotkey.lua"), "utf8");
  for (const placeholder of [...STATIC_PLACEHOLDERS, DATA_PLACEHOLDER]) {
    assert.equal(occurrences(template, placeholder), 1, `${placeholder} must occur exactly once`);
  }
  assert.match(template, /<style>__PREVIEW_STYLE__<\/style>/);
  assert.match(template, /<script>__KATEX_JS__<\/script>/);
  assert.match(template, /<script>__AUTO_RENDER_JS__<\/script>/);
  assert.match(template, /<script>__PREVIEW_JS__<\/script>/);
  assert.doesNotMatch(template, /<(?:script|link|img|iframe|source)\b[^>]*\b(?:src|href)\s*=/i);

  const first = await buildPreviewBundle();
  const firstBytes = await readFile(bundlePath);
  const second = await buildPreviewBundle();
  const secondBytes = await readFile(bundlePath);
  assert.equal(first.sha256, second.sha256, "two builds must report the same hash");
  assert.deepEqual(firstBytes, secondBytes, "two builds must be byte-for-byte identical");
  assert.equal(first.fontCount, 20);
  const expectedRuntimeHash = previewModule.match(/EXPECTED_PREVIEW_BUNDLE_SHA256 = "([0-9a-f]{64})"/)?.[1];
  assert.equal(expectedRuntimeHash, second.sha256, "runtime must pin the deterministic bundle hash");

  const bundle = secondBytes.toString("utf8");
  for (const placeholder of STATIC_PLACEHOLDERS) {
    assert.equal(bundle.includes(placeholder), false, `${placeholder} must be resolved`);
  }
  assert.equal(occurrences(bundle, DATA_PLACEHOLDER), 1, "dynamic JSON placeholder remains unique");
  assert.equal(occurrences(bundle, "data:font/woff2;base64,"), 20, "all 20 fonts are embedded");
  const style = bundle.match(/<style>([^]*?)<\/style>/)?.[1] || "";
  assert.doesNotMatch(style, /url\((?!data:font\/woff2;base64,)/i);
  assert.doesNotMatch(style, /(?:file|https?|wss?):/i);
  assert.doesNotMatch(withoutInlinePayloads(bundle), /<(?:script|link|img|iframe|source)\b[^>]*\b(?:src|href)\s*=/i);

  assert.match(bundle, /version:"0\.18\.4"/);
  assert.match(bundle, /exports\.renderMathInElement|e\.renderMathInElement/);
  assert.match(bundle, /const CLOSE_URL = "codex-math-preview:\/\/close"/);
  assert.match(bundle, /window\.codexMathPreview = Object\.freeze\(\{ render \}\)/);
  assert.match(bundle, /content\.replaceChildren\(\)/);
  assert.match(bundle, /dataNode\.textContent = ""/);
  assert.match(bundle, /event\.ctrlKey[^]*event\.key\.toLowerCase\(\) === "q"/);
  assert.match(bundle, /document\.createTextNode\(/);
  assert.match(bundle, /document\.createElement\("pre"\)/);
  assert.match(bundle, /document\.createElement\("code"\)/);
  assert.doesNotMatch(bundle, /\.innerHTML\b|\.outerHTML\b|insertAdjacentHTML|document\.write|\beval\s*\(|new\s+Function/i);

  assertCspHashes(bundle);
  assertJsonInjectionSafety(bundle);
  return { byteLength: second.byteLength, sha256: second.sha256 };
}
