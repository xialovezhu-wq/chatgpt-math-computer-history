import { fileURLToPath } from "node:url";
import {
  appendReplacements,
  count,
  entryBytes,
  nodeAt,
  parseArchive,
  readArchiveWithStat,
  replaceExactlyOnce,
  sha256,
  writeAtomic,
} from "./asar-static-utils.mjs";

const sourcePath = "/Applications/ChatGPT.app/Contents/Resources/app.asar";
const outputPath = fileURLToPath(
  new URL("../build/26.818.32112/app.asar.math-static.asar", import.meta.url),
);
const expectedSourceHash =
  "128c748e313a7a630d689f9fa215724eb44fbea6e0a5d7990867370cf73d88d3";
const expectedOutputHash =
  "78d7c4e4e6bda4c2c37c05b9e0183b91f14bed1b1c343cb2dba846a25ad1dffb";
const targets = {
  extension: {
    path: "webview/assets/user-formatted-text-BtKDcaQ7.js",
    hash: "165905ef043e51618af9483670ef09653b014bd623ff6fab1c9b07b4aaa0ce91",
  },
  bubble: {
    path: "webview/assets/subagent-activity-chip-group-BL5rmF0-.js",
    hash: "d4c5a3f52b45c59bf0533ca73b63418434bbb699c3a96ddd2af4b74ef80e837d",
  },
  annotation: {
    path: "webview/assets/app-initial-CanCbU9v.js",
    hash: "364e244fdb6b17e4d3a1de0413402284e62595456cc973cf15d35bb21fc11a76",
  },
};

if (process.argv.length !== 2) {
  throw new Error("This version-locked builder accepts no path overrides");
}

const mathExtension = Buffer.from(
  "{name:`math`,level:`inline`,start(e){let t=e.search(/(?<![\\\\$])\\$(?![$\\s])[^\\n$]*?[^\\s$](?<!\\\\)\\$(?![$A-Za-z0-9_])/);return~t?t:void 0},tokenizer(e){let t=e.match(/^\\$(?![$\\s])([^\\n$]*?[^\\s$])(?<!\\\\)\\$(?![$A-Za-z0-9_])/);if(t)return{type:`math`,raw:t[0],text:t[1],display:!1}}}",
  "utf8",
);
const annotationNormalizer = Buffer.from(
  "function codexNormalizeAnnotationMath(e){return e.replace(/[ \\t]*\\\\\\[[ \\t]*(?:\\r?\\n)?/g,()=>`\\n\\n$$\\n`).replace(/(?:\\r?\\n)?[ \\t]*\\\\\\][ \\t]*/g,()=>`\\n$$\\n\\n`).replace(/[ \\t]*\\\\\\(((?:(?!\\\\\\))[\\s\\S])*?\\r?\\n(?:(?!\\\\\\))[\\s\\S])*?)\\\\\\)[ \\t]*/g,(e,t)=>`\\n\\n$$\\n${t.trim()}\\n$$\\n\\n`)}",
  "utf8",
);

const extensionAnchors = {
  initializerOld: "}}}]}]}));function v",
  initializerNew: Buffer.concat([
    Buffer.from("}}}]}],codexMathExtensionOptions={extensions:[", "utf8"),
    mathExtension,
    Buffer.from("]},codexUserMessageExtensions=[...g,codexMathExtensionOptions]}));function v", "utf8"),
  ]),
  variablesOld: "var g,_=",
  variablesNew: "var g,codexMathExtensionOptions,codexUserMessageExtensions,_=",
  selectionOld: "extensions:g",
  selectionNew:
    "extensions:s===`codex-single-dollar-math`||s===`codex-annotation-math`?codexUserMessageExtensions:g",
  cacheOld: "function v(e){let t=(0,x.c)(20)",
  cacheNew: "function v(e){let t=(0,x.c)(21)",
  normalizationOld: "t[0]===n?h=t[1]:(h=y(n),t[0]=n,t[1]=h);",
  normalizationNew:
    "t[0]===n&&t[20]===s?h=t[1]:(h=s===`codex-annotation-math`?n.replace(/[ \\t]*\\\\\\[[ \\t]*(?:\\r?\\n)?/g,()=>`\\n\\n$$\\n`).replace(/(?:\\r?\\n)?[ \\t]*\\\\\\][ \\t]*/g,()=>`\\n$$\\n\\n`).replace(/[ \\t]*\\\\\\(((?:(?!\\\\\\))[\\s\\S])*?\\r?\\n(?:(?!\\\\\\))[\\s\\S])*?)\\\\\\)[ \\t]*/g,(e,t)=>`\\n\\n$$\\n${t.trim()}\\n$$\\n\\n`):y(n),t[0]=n,t[20]=s,t[1]=h);",
};

const bubbleAnchors = {
  userOld:
    "(0,n_.jsx)(Oh,{cwd:r,externalLinkContextMenuConversationId:u,hostId:i,text:n})",
  userNew:
    "(0,n_.jsx)(Oh,{cwd:r,externalLinkContextMenuConversationId:u,hostId:i,markdownClassName:`codex-single-dollar-math`,text:n})",
  selectionOld:
    "l?(0,OS.jsx)(`pre`,{className:`mt-0.5 max-h-48 overflow-auto rounded-md bg-primary-soft px-3 py-2 font-mono text-xs whitespace-pre text-default select-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset`,role:`region`,\"aria-label\":n.formatMessage({id:`assistantMessage.responseAnnotation.multilineSelectionAriaLabel`,defaultMessage:`Selected annotation text, {lineCount} lines`,description:`Accessible label for a scrollable multiline response annotation selection`},{lineCount:c}),children:s.text}):(0,OS.jsx)(`div`,{className:`mt-0.5 break-words whitespace-pre-wrap select-text`,children:s.text})",
  selectionNew:
    "(0,OS.jsx)(Oh,{className:`mt-0.5 max-h-48 overflow-auto break-words select-text`,markdownClassName:`codex-annotation-math`,text:s.text})",
  commentOld:
    "(0,OS.jsx)(`div`,{className:`mt-0.5 break-words whitespace-pre-wrap select-text`,children:s.annotation})",
  commentNew:
    "(0,OS.jsx)(Oh,{className:`mt-0.5 max-h-48 overflow-auto break-words select-text`,markdownClassName:`codex-annotation-math`,text:s.annotation})",
  dependencyOld:
    "var DS,OS,kS,AS=e((()=>{Js(),DS=t(Lm(),1),si(),pl(),Cc(),OS=v(),kS=`codex-annotation`}));",
  dependencyNew:
    "var DS,OS,kS,AS=e((()=>{Js(),DS=t(Lm(),1),si(),pl(),Cc(),Dh(),OS=v(),kS=`codex-annotation`}));",
};

const annotationAnchors = {
  initializerOld: "function TAc(e){let t=(0,EAc.c)(7)",
  initializerNew: Buffer.concat([
    Buffer.from("var codexAnnotationMathExtensions=[{extensions:[", "utf8"),
    mathExtension,
    Buffer.from("]}];", "utf8"),
    annotationNormalizer,
    Buffer.from(";function TAc(e){let t=(0,EAc.c)(7)", "utf8"),
  ]),
  rendererOld:
    "(0,G2.jsx)(`div`,{className:`mt-0.5 break-words whitespace-pre-wrap`,children:r})",
  rendererNew:
    "(0,G2.jsx)(zB,{className:`mt-0.5 break-words`,extensions:codexAnnotationMathExtensions,children:codexNormalizeAnnotationMath(r)})",
  dependencyOld:
    "var EAc,G2,DAc=n((()=>{EAc=l(),xd(),KY(),iz(),zE(),M6s(),G2=J()}));",
  dependencyNew:
    "var EAc,G2,DAc=n((()=>{EAc=l(),xd(),KY(),iz(),zE(),M6s(),Dda(),G2=J()}));",
};

function evaluateMathExtension() {
  return (0, eval)(`(${mathExtension.toString("utf8")})`);
}

function verifyTokenizer() {
  const extension = evaluateMathExtension();
  const positives = [
    [String.raw`$t \to 0$`, String.raw`t \to 0`],
    [String.raw`$f'(x)$`, "f'(x)"],
    [String.raw`$x$ and $y$`, "x"],
    [String.raw`$\alpha+\beta$`, String.raw`\alpha+\beta`],
  ];
  for (const [input, expectedText] of positives) {
    const token = extension.tokenizer(input);
    if (token?.type !== "math" || token.text !== expectedText || token.display !== false) {
      throw new Error(`Tokenizer positive case failed: ${JSON.stringify(input)}`);
    }
  }
  for (const input of [
    "$$x$$",
    "$ 100 $",
    "$x\n+y$",
    "$100 and $200",
    "$5-$10",
    "$HOME/$PATH",
    "${VAR}",
    "`$x$`",
    "```text\n$x$\n```",
    String.raw`\$x$`,
    "https://example.com/$x$",
    "https://example.com?q=$x$",
    "$unpaired",
  ]) {
    if (extension.tokenizer(input) !== undefined) {
      throw new Error(`Tokenizer protected case failed: ${JSON.stringify(input)}`);
    }
  }
  if (extension.start(String.raw`price \$100`) !== undefined) {
    throw new Error("Tokenizer start matched escaped currency");
  }
  if (extension.start("$$x$$") !== undefined) {
    throw new Error("Tokenizer start matched double-dollar math");
  }
  if (extension.start(String.raw`text $x$`) !== 5) {
    throw new Error("Tokenizer start failed paired inline math");
  }
  const mixed = String.raw`cost $100, formula $x$`;
  if (extension.start(mixed) !== mixed.indexOf("$x$")) {
    throw new Error("Tokenizer start did not skip currency before math");
  }
}

function verifyAnnotationNormalizer() {
  const normalize = (0, eval)(
    `${annotationNormalizer.toString("utf8")};codexNormalizeAnnotationMath`,
  );
  const display = String.raw`before\[
x+y,
\]after`;
  const expected = "before\n\n$$\nx+y,\n$$\n\nafter";
  if (normalize(display) !== expected) throw new Error("Display normalizer failed");
  const multilineInline = String.raw`\(x+
y\)`;
  if (normalize(multilineInline) !== "\n\n$$\nx+\ny\n$$\n\n") {
    throw new Error("Multiline inline normalizer failed");
  }
  for (const protectedText of [
    "区间 [0,1]",
    "数组 [a,b]",
    "[link](https://example.com)",
    String.raw`inline \(dx\) and $x$`,
  ]) {
    if (normalize(protectedText) !== protectedText) {
      throw new Error(`Normalizer changed protected text: ${protectedText}`);
    }
  }
}

verifyTokenizer();
verifyAnnotationNormalizer();

const { bytes: source, fileStat } = await readArchiveWithStat(sourcePath);
if (sha256(source) !== expectedSourceHash) throw new Error("BLOCKED_SOURCE_DRIFT");
const parsed = parseArchive(source);
const original = {};
for (const [role, target] of Object.entries(targets)) {
  const node = nodeAt(parsed.header, target.path);
  const bytes = entryBytes(source, parsed.dataStart, node);
  if (sha256(bytes) !== target.hash || node.integrity.hash !== target.hash) {
    throw new Error(`Original entry hash mismatch: ${target.path}`);
  }
  if (count(bytes, "codex-single-dollar-math") !== 0 || count(bytes, "codexAnnotationMathExtensions") !== 0) {
    throw new Error(`Math sentinel already present: ${target.path}`);
  }
  original[role] = bytes;
}

let extension = original.extension;
for (const [label, oldValue, newValue] of [
  ["extension initializer", extensionAnchors.initializerOld, extensionAnchors.initializerNew],
  ["extension variables", extensionAnchors.variablesOld, extensionAnchors.variablesNew],
  ["extension selection", extensionAnchors.selectionOld, extensionAnchors.selectionNew],
  ["extension cache", extensionAnchors.cacheOld, extensionAnchors.cacheNew],
  ["extension normalization", extensionAnchors.normalizationOld, extensionAnchors.normalizationNew],
]) extension = replaceExactlyOnce(extension, oldValue, newValue, label);

let bubble = original.bubble;
for (const [label, oldValue, newValue] of [
  ["user bubble", bubbleAnchors.userOld, bubbleAnchors.userNew],
  ["selected annotation", bubbleAnchors.selectionOld, bubbleAnchors.selectionNew],
  ["annotation comment", bubbleAnchors.commentOld, bubbleAnchors.commentNew],
  ["annotation dependency", bubbleAnchors.dependencyOld, bubbleAnchors.dependencyNew],
]) bubble = replaceExactlyOnce(bubble, oldValue, newValue, label);

let annotation = original.annotation;
for (const [label, oldValue, newValue] of [
  ["saved annotation initializer", annotationAnchors.initializerOld, annotationAnchors.initializerNew],
  ["saved annotation renderer", annotationAnchors.rendererOld, annotationAnchors.rendererNew],
  ["saved annotation dependency", annotationAnchors.dependencyOld, annotationAnchors.dependencyNew],
]) annotation = replaceExactlyOnce(annotation, oldValue, newValue, label);

const expectedCounts = [
  [extension, "codex-single-dollar-math", 1],
  [extension, "codex-annotation-math", 2],
  [extension, extensionAnchors.selectionNew, 1],
  [extension, extensionAnchors.cacheNew, 1],
  [extension, extensionAnchors.normalizationNew, 1],
  [bubble, "codex-single-dollar-math", 1],
  [bubble, "codex-annotation-math", 2],
  [bubble, bubbleAnchors.userNew, 1],
  [bubble, bubbleAnchors.selectionNew, 1],
  [bubble, bubbleAnchors.commentNew, 1],
  [bubble, bubbleAnchors.dependencyNew, 1],
  [annotation, "codexAnnotationMathExtensions", 2],
  [annotation, "codexNormalizeAnnotationMath", 2],
  [annotation, annotationAnchors.rendererNew, 1],
  [annotation, annotationAnchors.dependencyNew, 1],
];
for (const [bytes, marker, expected] of expectedCounts) {
  const actual = count(bytes, marker);
  if (actual !== expected) throw new Error(`Sentinel count mismatch: ${actual} != ${expected}`);
}
for (const [bytes, oldMarker] of [
  [bubble, bubbleAnchors.userOld],
  [bubble, bubbleAnchors.selectionOld],
  [bubble, bubbleAnchors.commentOld],
  [annotation, annotationAnchors.rendererOld],
]) {
  if (count(bytes, oldMarker) !== 0) throw new Error("A replaced plain renderer remains");
}
if (count(bubble, "codex.conversation.roleHeading.assistant") !== count(original.bubble, "codex.conversation.roleHeading.assistant")) {
  throw new Error("Assistant surface marker changed unexpectedly");
}

const built = appendReplacements(source, new Map([
  [targets.extension.path, extension],
  [targets.bubble.path, bubble],
  [targets.annotation.path, annotation],
]));
if (sha256(built.output) !== expectedOutputHash) {
  throw new Error("Version-locked math candidate hash mismatch");
}
await writeAtomic(outputPath, built.output, fileStat.mode);

console.log(JSON.stringify({
  status: "PASS_MATH_CANDIDATE",
  sourcePath,
  outputPath,
  sourceHash: sha256(source),
  sourceHashAfterBuild: sha256((await readArchiveWithStat(sourcePath)).bytes),
  outputHash: sha256(built.output),
  outputHeaderHash: built.outputHeaderHash,
  sourceSize: source.length,
  outputSize: built.output.length,
  targetHashes: {
    extension: sha256(extension),
    bubble: sha256(bubble),
    annotation: sha256(annotation),
  },
  tests: {
    tokenizer: "passed",
    annotationNormalizer: "passed",
    reactCacheSlot: "passed",
    dependencyInitialization: "passed",
    assistantSurfaceMarkerUnchanged: "passed",
  },
}, null, 2));
