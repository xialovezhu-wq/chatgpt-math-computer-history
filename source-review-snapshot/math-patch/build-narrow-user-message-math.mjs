import { createHash } from "node:crypto";
import { mkdir, open, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const [sourcePath, outputPath] = process.argv.slice(2);

const expectedSource =
  "/Applications/ChatGPT.app/Contents/Resources/app.asar";
const expectedOutput =
  "/Users/USER_NAME/Documents/Codex/2026-07-20/t-0-f-x-f-1/work/build/app.asar.26.814.41407-user-bubble-and-annotations-math";
const expectedSourceHash =
  "8fba32f8baa6d984b0f0f4149d3da46221e3adb3b52836f85fe65e31e655a8c0";

if (sourcePath !== expectedSource || outputPath !== expectedOutput) {
  throw new Error(
    `Refusing unexpected paths: source=${sourcePath ?? "<missing>"} output=${outputPath ?? "<missing>"}`,
  );
}

const extensionTargetFile = "webview/assets/user-formatted-text-Bp-XdAPx.js";
const bubbleTargetFile =
  "webview/assets/subagent-activity-chip-group-BMNUltzO.js";
const annotationTargetFile = "webview/assets/app-initial-BCLYDefw.js";
const initializerTailOld = Buffer.from("}}}]}]}));function v", "utf8");
const variablesOld = Buffer.from("var g,_=", "utf8");
const variablesNew = Buffer.from(
  "var g,codexMathExtensionOptions,codexUserMessageExtensions,_=",
  "utf8",
);
const extensionSelectionOld = Buffer.from("extensions:g", "utf8");
const extensionSelectionNew = Buffer.from(
  "extensions:s===`codex-single-dollar-math`||s===`codex-annotation-math`?codexUserMessageExtensions:g",
  "utf8",
);
const formatterCacheSizeOld = Buffer.from(
  "function v(e){let t=(0,x.c)(20)",
  "utf8",
);
const formatterCacheSizeNew = Buffer.from(
  "function v(e){let t=(0,x.c)(21)",
  "utf8",
);
const formatterNormalizationOld = Buffer.from(
  "t[0]===n?h=t[1]:(h=y(n),t[0]=n,t[1]=h);",
  "utf8",
);
const formatterNormalizationNew = Buffer.from(
  "t[0]===n&&t[20]===s?h=t[1]:(h=s===`codex-annotation-math`?n.replace(/[ \\t]*\\\\\\[[ \\t]*(?:\\r?\\n)?/g,()=>`\\n\\n$$\\n`).replace(/(?:\\r?\\n)?[ \\t]*\\\\\\][ \\t]*/g,()=>`\\n$$\\n\\n`).replace(/[ \\t]*\\\\\\(((?:(?!\\\\\\))[\\s\\S])*?\\r?\\n(?:(?!\\\\\\))[\\s\\S])*?)\\\\\\)[ \\t]*/g,(e,t)=>`\\n\\n$$\\n${t.trim()}\\n$$\\n\\n`):y(n),t[0]=n,t[20]=s,t[1]=h);",
  "utf8",
);
const userBubbleCallOld = Buffer.from(
  "(0,h_.jsx)(fh,{cwd:r,externalLinkContextMenuConversationId:u,hostId:i,text:n})",
  "utf8",
);
const userBubbleCallNew = Buffer.from(
  "(0,h_.jsx)(fh,{cwd:r,externalLinkContextMenuConversationId:u,hostId:i,markdownClassName:`codex-single-dollar-math`,text:n})",
  "utf8",
);
const inlineAnnotationSelectionOld = Buffer.from(
  "d?(0,GS.jsx)(`pre`,{className:`mt-0.5 max-h-48 overflow-auto rounded-md bg-primary-soft px-3 py-2 font-mono text-xs whitespace-pre text-default select-text focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset`,role:`region`,\"aria-label\":n.formatMessage({id:`assistantMessage.responseAnnotation.multilineSelectionAriaLabel`,defaultMessage:`Selected annotation text, {lineCount} lines`,description:`Accessible label for a scrollable multiline response annotation selection`},{lineCount:u}),children:l.text}):(0,GS.jsx)(`div`,{className:`mt-0.5 break-words whitespace-pre-wrap select-text`,children:l.text})",
  "utf8",
);
const inlineAnnotationSelectionNew = Buffer.from(
  "(0,GS.jsx)(fh,{className:`mt-0.5 max-h-48 overflow-auto break-words select-text`,markdownClassName:`codex-annotation-math`,text:l.text})",
  "utf8",
);
const inlineAnnotationCommentOld = Buffer.from(
  "(0,GS.jsx)(`div`,{className:`mt-0.5 break-words whitespace-pre-wrap select-text`,children:l.annotation})",
  "utf8",
);
const inlineAnnotationCommentNew = Buffer.from(
  "(0,GS.jsx)(fh,{className:`mt-0.5 max-h-48 overflow-auto break-words select-text`,markdownClassName:`codex-annotation-math`,text:l.annotation})",
  "utf8",
);
const inlineAnnotationDependencyOld = Buffer.from(
  "var WS,GS,KS,qS=e((()=>{Fi(),WS=t(Yd(),1),Ja(),Ef(),Wc(),GS=Y(),KS=`codex-annotation`}));",
  "utf8",
);
const inlineAnnotationDependencyNew = Buffer.from(
  "var WS,GS,KS,qS=e((()=>{Fi(),WS=t(Yd(),1),Ja(),Ef(),Wc(),dh(),GS=Y(),KS=`codex-annotation`}));",
  "utf8",
);
const mathExtension = Buffer.from(
  "{name:`math`,level:`inline`,start(e){let t=e.search(/(?<![\\\\$])\\$(?![$\\s])[^\\n$]*?[^\\s$](?<!\\\\)\\$(?![$A-Za-z0-9_])/);return~t?t:void 0},tokenizer(e){let t=e.match(/^\\$(?![$\\s])([^\\n$]*?[^\\s$])(?<!\\\\)\\$(?![$A-Za-z0-9_])/);if(t)return{type:`math`,raw:t[0],text:t[1],display:!1}}}",
  "utf8",
);
const annotationNormalizer = Buffer.from(
  "function codexNormalizeAnnotationMath(e){return e.replace(/[ \\t]*\\\\\\[[ \\t]*(?:\\r?\\n)?/g,()=>`\\n\\n$$\\n`).replace(/(?:\\r?\\n)?[ \\t]*\\\\\\][ \\t]*/g,()=>`\\n$$\\n\\n`).replace(/[ \\t]*\\\\\\(((?:(?!\\\\\\))[\\s\\S])*?\\r?\\n(?:(?!\\\\\\))[\\s\\S])*?)\\\\\\)[ \\t]*/g,(e,t)=>`\\n\\n$$\\n${t.trim()}\\n$$\\n\\n`)}",
  "utf8",
);
const annotationRendererOld = Buffer.from(
  "(0,f2.jsx)(`div`,{className:`mt-0.5 break-words whitespace-pre-wrap`,children:r})",
  "utf8",
);
const annotationRendererNew = Buffer.from(
  "(0,f2.jsx)(CV,{className:`mt-0.5 break-words`,extensions:codexAnnotationMathExtensions,children:codexNormalizeAnnotationMath(r)})",
  "utf8",
);
const annotationInitializerOld = Buffer.from(
  "function jhc(e){let t=(0,Mhc.c)(7)",
  "utf8",
);
const annotationInitializerNew = Buffer.concat([
  Buffer.from("var codexAnnotationMathExtensions=[{extensions:[", "utf8"),
  mathExtension,
  Buffer.from("]}];", "utf8"),
  annotationNormalizer,
  Buffer.from(";function jhc(e){let t=(0,Mhc.c)(7)", "utf8"),
]);
const annotationDependencyOld = Buffer.from(
  "var Mhc,f2,Nhc=n((()=>{Mhc=l(),Ed(),vX(),Kz(),qE(),xGs(),f2=J()}));",
  "utf8",
);
const annotationDependencyNew = Buffer.from(
  "var Mhc,f2,Nhc=n((()=>{Mhc=l(),Ed(),vX(),Kz(),qE(),xGs(),Woa(),f2=J()}));",
  "utf8",
);
const initializerTailNew = Buffer.concat([
  Buffer.from("}}}]}],codexMathExtensionOptions={extensions:[", "utf8"),
  mathExtension,
  Buffer.from(
    "]},codexUserMessageExtensions=[...g,codexMathExtensionOptions]}));function v",
    "utf8",
  ),
]);

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function findAll(haystack, needle) {
  const offsets = [];
  let cursor = 0;
  while (cursor <= haystack.length - needle.length) {
    const offset = haystack.indexOf(needle, cursor);
    if (offset === -1) break;
    offsets.push(offset);
    cursor = offset + needle.length;
  }
  return offsets;
}

function parseArchive(archive) {
  const headerSize = archive.readUInt32LE(4);
  const jsonLength = archive.readUInt32LE(12);
  const jsonStart = 16;
  const jsonEnd = jsonStart + jsonLength;
  const headerText = archive.subarray(jsonStart, jsonEnd).toString("utf8");
  return {
    dataStart: 8 + headerSize,
    header: JSON.parse(headerText),
    headerText,
    jsonLength,
    jsonStart,
    jsonEnd,
  };
}

function buildArchiveHeader(header) {
  const headerText = JSON.stringify(header);
  const json = Buffer.from(headerText, "utf8");
  const stringPayloadSize = Math.ceil((4 + json.length + 1) / 4) * 4;
  const headerSize = 4 + stringPayloadSize;
  const archiveHeader = Buffer.alloc(8 + headerSize);
  archiveHeader.writeUInt32LE(4, 0);
  archiveHeader.writeUInt32LE(headerSize, 4);
  archiveHeader.writeUInt32LE(stringPayloadSize, 8);
  archiveHeader.writeUInt32LE(json.length, 12);
  json.copy(archiveHeader, 16);
  return { archiveHeader, headerText };
}

function archiveNode(header, filePath) {
  let node = header;
  for (const part of filePath.split("/")) {
    node = node.files?.[part];
    if (node == null) throw new Error(`ASAR entry not found: ${filePath}`);
  }
  return node;
}

function entryBytes(archive, dataStart, node) {
  const start = dataStart + Number(node.offset);
  return archive.subarray(start, start + node.size);
}

function setIntegrity(node, bytes) {
  if (node.integrity?.algorithm !== "SHA256") {
    throw new Error("Expected SHA256 integrity metadata");
  }
  node.integrity.hash = sha256(bytes);
  node.integrity.blocks = [];
  for (let offset = 0; offset < bytes.length; offset += node.integrity.blockSize) {
    node.integrity.blocks.push(
      sha256(bytes.subarray(offset, offset + node.integrity.blockSize)),
    );
  }
}

function replaceExactlyOnce(source, oldBytes, newBytes, label) {
  const offsets = findAll(source, oldBytes);
  if (offsets.length !== 1) {
    throw new Error(`${label}: expected one match, found ${offsets.length}`);
  }
  return Buffer.concat([
    source.subarray(0, offsets[0]),
    newBytes,
    source.subarray(offsets[0] + oldBytes.length),
  ]);
}

function verifyExtension(source) {
  const extension = (0, eval)(`(${source})`);
  const positives = [
    [String.raw`$t \to 0$`, String.raw`t \to 0`],
    [String.raw`$f'(x)$`, "f'(x)"],
    [
      String.raw`$f(x) = \text{某个函数} + C$`,
      String.raw`f(x) = \text{某个函数} + C`,
    ],
    [String.raw`$x$ and $y$`, "x"],
  ];
  for (const [input, expectedText] of positives) {
    const token = extension.tokenizer(input);
    if (
      token?.type !== "math" ||
      token.text !== expectedText ||
      token.display !== false
    ) {
      throw new Error(`Extension failed positive case: ${JSON.stringify(input)}`);
    }
  }
  for (const input of [
    "$$x$$",
    "$ 100 $",
    "$x\n+y$",
    "$100 and $200",
    "$5-$10",
    "$HOME/$PATH",
    "$FOO $BAR",
    "$100, formula $x$",
    "`$x$`",
    "```text\n$x$\n```",
    String.raw`\(x\)`,
  ]) {
    if (extension.tokenizer(input) !== undefined) {
      throw new Error(`Extension accepted protected case: ${JSON.stringify(input)}`);
    }
  }
  if (extension.start(String.raw`price \$100`) !== undefined) {
    throw new Error("Extension start matched an escaped dollar sign");
  }
  if (extension.start("$$x$$") !== undefined) {
    throw new Error("Extension start matched a double-dollar delimiter");
  }
  if (extension.start(String.raw`text $x$`) !== 5) {
    throw new Error("Extension start failed to locate a paired-dollar candidate");
  }
  const mixedCurrencyAndMath = String.raw`cost $100, formula $x$`;
  if (
    extension.start(mixedCurrencyAndMath) !==
    mixedCurrencyAndMath.indexOf(String.raw`$x$`)
  ) {
    throw new Error("Extension start did not skip currency before valid math");
  }
  if (extension.start(String.raw`echo $HOME and $PATH`) !== undefined) {
    throw new Error("Extension start matched shell-style variables");
  }
}

function verifyAnnotationDisplayMathNormalization() {
  const normalize = (0, eval)(
    `${annotationNormalizer.toString("utf8")};codexNormalizeAnnotationMath`,
  );
  const input = String.raw`杆的线密度为\[
\rho=\frac{m}{l},
\]所以长度为 \(dx\) 的微元质量为\[
dm=\rho\,dx=\frac{m}{l}\,dx.
\]`;
  const normalized = normalize(input);
  const expected = String.raw`杆的线密度为

$$
\rho=\frac{m}{l},
$$

所以长度为 \(dx\) 的微元质量为

$$
dm=\rho\,dx=\frac{m}{l}\,dx.
$$

`;
  if (normalized !== expected) {
    throw new Error("Annotation display-math normalization failed");
  }
  const multilineInline = String.raw`\(dF=\frac{G\cdot1\cdot dm}{r^2}
=\frac{Gm}{l(x^2+a^2)}\,dx.\)`;
  const multilineExpected = String.raw`

$$
dF=\frac{G\cdot1\cdot dm}{r^2}
=\frac{Gm}{l(x^2+a^2)}\,dx.
$$

`;
  if (normalize(multilineInline) !== multilineExpected) {
    throw new Error("Annotation multiline inline-math promotion failed");
  }
  for (const protectedText of [
    "区间 [0,1]",
    "数组 [a,b]",
    "链接 [标题](https://example.com)",
    String.raw`行内 \(dx\) 与美元公式 $x$`,
  ]) {
    const actual = normalize(protectedText);
    if (actual !== protectedText) {
      throw new Error(`Annotation normalization changed protected text: ${protectedText}`);
    }
  }
}

verifyExtension(mathExtension.toString("utf8"));
verifyAnnotationDisplayMathNormalization();

const sourceStat = await stat(sourcePath);
const sourceArchive = await readFile(sourcePath);
const sourceHash = sha256(sourceArchive);
if (sourceHash !== expectedSourceHash) {
  throw new Error(`Unexpected source archive hash: ${sourceHash}`);
}

const parsed = parseArchive(sourceArchive);
if (JSON.stringify(parsed.header) !== parsed.headerText) {
  throw new Error("ASAR header does not round-trip exactly");
}

const extensionTargetNode = archiveNode(parsed.header, extensionTargetFile);
const bubbleTargetNode = archiveNode(parsed.header, bubbleTargetFile);
const annotationTargetNode = archiveNode(parsed.header, annotationTargetFile);
const originalExtensionChunk = entryBytes(
  sourceArchive,
  parsed.dataStart,
  extensionTargetNode,
);
const originalBubbleChunk = entryBytes(
  sourceArchive,
  parsed.dataStart,
  bubbleTargetNode,
);
const originalAnnotationChunk = entryBytes(
  sourceArchive,
  parsed.dataStart,
  annotationTargetNode,
);
for (const [filePath, node, bytes] of [
  [extensionTargetFile, extensionTargetNode, originalExtensionChunk],
  [bubbleTargetFile, bubbleTargetNode, originalBubbleChunk],
  [annotationTargetFile, annotationTargetNode, originalAnnotationChunk],
]) {
  if (sha256(bytes) !== node.integrity.hash) {
    throw new Error(`Original target chunk integrity mismatch: ${filePath}`);
  }
  if (findAll(bytes, mathExtension).length !== 0) {
    throw new Error(`Math extension is already present: ${filePath}`);
  }
}

let modifiedExtensionChunk = replaceExactlyOnce(
  originalExtensionChunk,
  initializerTailOld,
  initializerTailNew,
  "Math extension initializer",
);
modifiedExtensionChunk = replaceExactlyOnce(
  modifiedExtensionChunk,
  variablesOld,
  variablesNew,
  "Math extension variables",
);
modifiedExtensionChunk = replaceExactlyOnce(
  modifiedExtensionChunk,
  extensionSelectionOld,
  extensionSelectionNew,
  "User-bubble extension selection",
);
modifiedExtensionChunk = replaceExactlyOnce(
  modifiedExtensionChunk,
  formatterCacheSizeOld,
  formatterCacheSizeNew,
  "Formatted-text cache size",
);
modifiedExtensionChunk = replaceExactlyOnce(
  modifiedExtensionChunk,
  formatterNormalizationOld,
  formatterNormalizationNew,
  "Annotation raw-text normalization bypass",
);
let modifiedBubbleChunk = replaceExactlyOnce(
  originalBubbleChunk,
  userBubbleCallOld,
  userBubbleCallNew,
  "User-bubble Markdown call",
);
modifiedBubbleChunk = replaceExactlyOnce(
  modifiedBubbleChunk,
  inlineAnnotationSelectionOld,
  inlineAnnotationSelectionNew,
  "Inline annotation selected-text Markdown renderer",
);
modifiedBubbleChunk = replaceExactlyOnce(
  modifiedBubbleChunk,
  inlineAnnotationCommentOld,
  inlineAnnotationCommentNew,
  "Inline annotation comment Markdown renderer",
);
modifiedBubbleChunk = replaceExactlyOnce(
  modifiedBubbleChunk,
  inlineAnnotationDependencyOld,
  inlineAnnotationDependencyNew,
  "Inline annotation Markdown dependency",
);
let modifiedAnnotationChunk = replaceExactlyOnce(
  originalAnnotationChunk,
  annotationInitializerOld,
  annotationInitializerNew,
  "Annotation math extension initializer",
);
modifiedAnnotationChunk = replaceExactlyOnce(
  modifiedAnnotationChunk,
  annotationRendererOld,
  annotationRendererNew,
  "Saved annotation Markdown renderer",
);
modifiedAnnotationChunk = replaceExactlyOnce(
  modifiedAnnotationChunk,
  annotationDependencyOld,
  annotationDependencyNew,
  "Saved annotation Markdown dependency",
);

if (findAll(modifiedExtensionChunk, mathExtension).length !== 1) {
  throw new Error("Extension target does not contain one math extension");
}
if (findAll(modifiedExtensionChunk, extensionSelectionNew).length !== 1) {
  throw new Error("Extension target does not contain the gated selection");
}
if (
  findAll(modifiedExtensionChunk, formatterCacheSizeNew).length !== 1 ||
  findAll(modifiedExtensionChunk, formatterNormalizationNew).length !== 1
) {
  throw new Error("Extension target does not contain the annotation raw-text path");
}
if (findAll(modifiedBubbleChunk, userBubbleCallNew).length !== 1) {
  throw new Error("Bubble target does not contain the gated call");
}
if (
  findAll(modifiedBubbleChunk, inlineAnnotationSelectionNew).length !== 1 ||
  findAll(modifiedBubbleChunk, inlineAnnotationCommentNew).length !== 1
) {
  throw new Error("Bubble target does not contain both inline annotation Markdown renderers");
}
if (
  findAll(modifiedBubbleChunk, inlineAnnotationSelectionOld).length !== 0 ||
  findAll(modifiedBubbleChunk, inlineAnnotationCommentOld).length !== 0
) {
  throw new Error("Bubble target still contains an inline annotation plain-text renderer");
}
if (findAll(modifiedBubbleChunk, inlineAnnotationDependencyNew).length !== 1) {
  throw new Error("Bubble target does not initialize the inline annotation Markdown dependency");
}
if (findAll(modifiedAnnotationChunk, mathExtension).length !== 1) {
  throw new Error("Annotation target does not contain one math extension");
}
if (findAll(modifiedAnnotationChunk, annotationRendererNew).length !== 1) {
  throw new Error("Annotation target does not contain the Markdown renderer");
}
if (findAll(modifiedAnnotationChunk, annotationRendererOld).length !== 0) {
  throw new Error("Annotation target still contains the plain-text renderer");
}
if (findAll(modifiedAnnotationChunk, annotationDependencyNew).length !== 1) {
  throw new Error("Annotation target does not initialize the Markdown dependency");
}
if (
  findAll(
    modifiedExtensionChunk,
    Buffer.from("codex-single-dollar-math", "utf8"),
  ).length !== 1 ||
  findAll(
    modifiedBubbleChunk,
    Buffer.from("codex-single-dollar-math", "utf8"),
  ).length !== 1 ||
  findAll(
    modifiedExtensionChunk,
    Buffer.from("codex-annotation-math", "utf8"),
  ).length !== 2 ||
  findAll(
    modifiedBubbleChunk,
    Buffer.from("codex-annotation-math", "utf8"),
  ).length !== 2
) {
  throw new Error("Unexpected math sentinel count in a target chunk");
}
if (
  findAll(
    modifiedAnnotationChunk,
    Buffer.from("codexAnnotationMathExtensions", "utf8"),
  ).length !== 2
) {
  throw new Error("Expected two annotation math sentinels");
}

const originalData = sourceArchive.subarray(parsed.dataStart);
const extensionAppendOffset = originalData.length;
const bubbleAppendOffset = extensionAppendOffset + modifiedExtensionChunk.length;
const annotationAppendOffset = bubbleAppendOffset + modifiedBubbleChunk.length;
extensionTargetNode.offset = String(extensionAppendOffset);
extensionTargetNode.size = modifiedExtensionChunk.length;
setIntegrity(extensionTargetNode, modifiedExtensionChunk);
bubbleTargetNode.offset = String(bubbleAppendOffset);
bubbleTargetNode.size = modifiedBubbleChunk.length;
setIntegrity(bubbleTargetNode, modifiedBubbleChunk);
annotationTargetNode.offset = String(annotationAppendOffset);
annotationTargetNode.size = modifiedAnnotationChunk.length;
setIntegrity(annotationTargetNode, modifiedAnnotationChunk);

const { archiveHeader, headerText: updatedHeaderText } = buildArchiveHeader(
  parsed.header,
);
const outputArchive = Buffer.concat([
  archiveHeader,
  originalData,
  modifiedExtensionChunk,
  modifiedBubbleChunk,
  modifiedAnnotationChunk,
]);
const verified = parseArchive(outputArchive);
if (verified.headerText !== updatedHeaderText) {
  throw new Error("Updated ASAR header does not round-trip exactly");
}
if (!outputArchive.subarray(verified.dataStart, verified.dataStart + originalData.length).equals(originalData)) {
  throw new Error("Original ASAR data region changed unexpectedly");
}
const verifiedExtensionNode = archiveNode(
  verified.header,
  extensionTargetFile,
);
const verifiedBubbleNode = archiveNode(verified.header, bubbleTargetFile);
const verifiedAnnotationNode = archiveNode(
  verified.header,
  annotationTargetFile,
);
const verifiedExtensionChunk = entryBytes(
  outputArchive,
  verified.dataStart,
  verifiedExtensionNode,
);
const verifiedBubbleChunk = entryBytes(
  outputArchive,
  verified.dataStart,
  verifiedBubbleNode,
);
const verifiedAnnotationChunk = entryBytes(
  outputArchive,
  verified.dataStart,
  verifiedAnnotationNode,
);
for (const [filePath, node, actual, expected] of [
  [
    extensionTargetFile,
    verifiedExtensionNode,
    verifiedExtensionChunk,
    modifiedExtensionChunk,
  ],
  [bubbleTargetFile, verifiedBubbleNode, verifiedBubbleChunk, modifiedBubbleChunk],
  [
    annotationTargetFile,
    verifiedAnnotationNode,
    verifiedAnnotationChunk,
    modifiedAnnotationChunk,
  ],
]) {
  if (!actual.equals(expected)) {
    throw new Error(`Updated ASAR entry points to wrong bytes: ${filePath}`);
  }
  if (sha256(actual) !== node.integrity.hash) {
    throw new Error(`Updated ASAR entry integrity mismatch: ${filePath}`);
  }
}

await mkdir(dirname(outputPath), { recursive: true });
const temporaryPath = `${outputPath}.tmp`;
await writeFile(temporaryPath, outputArchive, { mode: sourceStat.mode });
const handle = await open(temporaryPath, "r");
try {
  await handle.sync();
} finally {
  await handle.close();
}
await rename(temporaryPath, outputPath);

const written = await readFile(outputPath);
if (sha256(written) !== sha256(outputArchive)) {
  throw new Error("Written archive hash does not match prepared archive");
}

console.log(
  JSON.stringify(
    {
      sourcePath,
      outputPath,
      sourceHash,
      outputHash: sha256(outputArchive),
      sourceSize: sourceArchive.length,
      outputSize: outputArchive.length,
      sourceHeaderSize: parsed.dataStart,
      outputHeaderSize: verified.dataStart,
      sourceHeaderHash: sha256(Buffer.from(parsed.headerText, "utf8")),
      outputHeaderHash: sha256(Buffer.from(updatedHeaderText, "utf8")),
      extensionTargetFile,
      bubbleTargetFile,
      annotationTargetFile,
      originalExtensionChunkSize: originalExtensionChunk.length,
      modifiedExtensionChunkSize: modifiedExtensionChunk.length,
      originalBubbleChunkSize: originalBubbleChunk.length,
      modifiedBubbleChunkSize: modifiedBubbleChunk.length,
      originalAnnotationChunkSize: originalAnnotationChunk.length,
      modifiedAnnotationChunkSize: modifiedAnnotationChunk.length,
      extensionAppendOffset: String(extensionAppendOffset),
      bubbleAppendOffset: String(bubbleAppendOffset),
      annotationAppendOffset: String(annotationAppendOffset),
      extensionEntryHash: verifiedExtensionNode.integrity.hash,
      bubbleEntryHash: verifiedBubbleNode.integrity.hash,
      annotationEntryHash: verifiedAnnotationNode.integrity.hash,
      extensionBlockSize: verifiedExtensionNode.integrity.blockSize,
      bubbleBlockSize: verifiedBubbleNode.integrity.blockSize,
      annotationBlockSize: verifiedAnnotationNode.integrity.blockSize,
      extensionTests: "passed",
    },
    null,
    2,
  ),
);
