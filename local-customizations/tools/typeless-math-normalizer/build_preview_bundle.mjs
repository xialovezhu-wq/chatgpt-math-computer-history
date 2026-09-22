import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const toolDirectory = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(toolDirectory, "preview-template.html");
const outputPath = path.join(toolDirectory, "preview-bundle.html");
const vendorDirectory = path.join(toolDirectory, "vendor", "katex");
const fontsDirectory = path.join(vendorDirectory, "fonts");
const EXPECTED_VERSION = "0.18.4";
const EXPECTED_FONT_COUNT = 20;
const DATA_PLACEHOLDER = "__CODEX_MATH_PREVIEW_DATA_JSON__";

function occurrences(source, needle) {
  return source.split(needle).length - 1;
}

function replaceExactlyOnce(source, placeholder, value) {
  if (occurrences(source, placeholder) !== 1) {
    throw new Error(`expected exactly one ${placeholder} placeholder`);
  }
  return source.replace(placeholder, () => value);
}

function sha256Base64(source) {
  return createHash("sha256").update(source, "utf8").digest("base64");
}

function sha256Hex(source) {
  return createHash("sha256").update(source, "utf8").digest("hex");
}

function assertSafeInlineContent(label, source, closingTag) {
  if (source.toLowerCase().includes(closingTag)) {
    throw new Error(`${label} contains forbidden ${closingTag}`);
  }
}

function withoutInlinePayloads(source) {
  return source
    .replace(/<style>[^]*?<\/style>/g, "<style></style>")
    .replace(/<script(?:\s+[^>]*)?>[^]*?<\/script>/g, "<script></script>");
}

async function embedFonts(katexCss) {
  const fontFiles = (await readdir(fontsDirectory))
    .filter((name) => name.endsWith(".woff2"))
    .sort();
  if (fontFiles.length !== EXPECTED_FONT_COUNT) {
    throw new Error(`expected ${EXPECTED_FONT_COUNT} woff2 fonts, found ${fontFiles.length}`);
  }

  const fontData = new Map();
  for (const fontFile of fontFiles) {
    const bytes = await readFile(path.join(fontsDirectory, fontFile));
    fontData.set(fontFile, bytes.toString("base64"));
  }

  const sourcePattern = /src:url\(fonts\/([^()]+\.woff2)\) format\("woff2"\),url\(fonts\/([^()]+\.woff)\) format\("woff"\),url\(fonts\/([^()]+\.ttf)\) format\("truetype"\)/g;
  const embedded = new Set();
  const rewritten = katexCss.replace(sourcePattern, (_match, woff2, woff, ttf) => {
    const stem = woff2.slice(0, -".woff2".length);
    if (woff !== `${stem}.woff` || ttf !== `${stem}.ttf`) {
      throw new Error(`font fallback names do not match ${woff2}`);
    }
    const base64 = fontData.get(woff2);
    if (!base64) {
      throw new Error(`missing local font ${woff2}`);
    }
    embedded.add(woff2);
    return `src:url(data:font/woff2;base64,${base64}) format("woff2")`;
  });

  if (embedded.size !== EXPECTED_FONT_COUNT) {
    throw new Error(`expected ${EXPECTED_FONT_COUNT} rewritten font sources, found ${embedded.size}`);
  }
  const dataFontCount = occurrences(rewritten, "url(data:font/woff2;base64,");
  if (dataFontCount !== EXPECTED_FONT_COUNT) {
    throw new Error(`expected ${EXPECTED_FONT_COUNT} embedded data fonts, found ${dataFontCount}`);
  }
  if (/url\((?!data:font\/woff2;base64,)/i.test(rewritten)) {
    throw new Error("rewritten CSS retains a non-data URL");
  }
  return rewritten;
}

export async function buildPreviewBundle() {
  const [template, version, katexCss, previewCss, katexJs, autoRenderJs, previewJs] = await Promise.all([
    readFile(templatePath, "utf8"),
    readFile(path.join(vendorDirectory, "VERSION"), "utf8"),
    readFile(path.join(vendorDirectory, "katex.min.css"), "utf8"),
    readFile(path.join(toolDirectory, "preview.css"), "utf8"),
    readFile(path.join(vendorDirectory, "katex.min.js"), "utf8"),
    readFile(path.join(vendorDirectory, "contrib", "auto-render.min.js"), "utf8"),
    readFile(path.join(toolDirectory, "preview.js"), "utf8"),
  ]);

  if (version.trim() !== EXPECTED_VERSION) {
    throw new Error(`expected KaTeX ${EXPECTED_VERSION}, found ${version.trim()}`);
  }

  const style = `${await embedFonts(katexCss)}\n${previewCss}`;
  const scripts = [katexJs, autoRenderJs, previewJs];
  for (const requiredSnippet of [
    "content.replaceChildren()",
    "window.codexMathPreview = Object.freeze({ render })",
    'dataNode.textContent = ""',
    'event.key.toLowerCase() === "q"',
  ]) {
    if (!previewJs.includes(requiredSnippet)) {
      throw new Error(`preview runtime missing controlled API: ${requiredSnippet}`);
    }
  }
  assertSafeInlineContent("combined style", style, "</style>");
  scripts.forEach((script, index) => assertSafeInlineContent(`script ${index + 1}`, script, "</script>"));

  const styleHash = sha256Base64(style);
  const scriptHashes = scripts.map(sha256Base64);
  const csp = [
    "default-src 'none'",
    `script-src ${scriptHashes.map((hash) => `'sha256-${hash}'`).join(" ")}`,
    "style-src 'unsafe-inline'",
    "font-src data:",
    "img-src data:",
    "connect-src 'none'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
  if (/unsafe-eval|(?:^|[ ;])(?:file|https?|wss?):/i.test(csp)
    || /script-src[^;]*unsafe-inline/i.test(csp)) {
    throw new Error("generated CSP contains a forbidden source");
  }

  let bundle = template;
  bundle = replaceExactlyOnce(bundle, "__CSP__", csp);
  bundle = replaceExactlyOnce(bundle, "__PREVIEW_STYLE__", style);
  bundle = replaceExactlyOnce(bundle, "__KATEX_JS__", katexJs);
  bundle = replaceExactlyOnce(bundle, "__AUTO_RENDER_JS__", autoRenderJs);
  bundle = replaceExactlyOnce(bundle, "__PREVIEW_JS__", previewJs);
  if (occurrences(bundle, DATA_PLACEHOLDER) !== 1) {
    throw new Error("bundle must retain exactly one dynamic JSON placeholder");
  }
  if (/<(?:script|link|img|iframe|source)\b[^>]*\b(?:src|href)\s*=/i.test(withoutInlinePayloads(bundle))) {
    throw new Error("bundle retains an external resource attribute");
  }

  await writeFile(outputPath, bundle, "utf8");
  return {
    outputPath,
    byteLength: Buffer.byteLength(bundle, "utf8"),
    sha256: sha256Hex(bundle),
    styleHash,
    scriptHashes,
    fontCount: EXPECTED_FONT_COUNT,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildPreviewBundle();
  console.log(`built ${path.basename(result.outputPath)} bytes=${result.byteLength} sha256=${result.sha256} fonts=${result.fontCount}`);
}
