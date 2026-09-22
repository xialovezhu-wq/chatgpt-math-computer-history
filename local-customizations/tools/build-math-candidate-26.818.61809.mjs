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
  new URL("../build/26.818.61809/app.asar.math-static.asar", import.meta.url),
);
const expectedSourceHash =
  "76bbcdc2a4a2d77cfe03904a6537d0a655f9892f27a8925e3a6c7b613801d4cf";
const expectedOutputHash =
  "5eed54c90e683e2beb7c28de8770d57117ae5e694804563f13d9bcd89ce4efb6";
const targets = {
  extension: {
    path: "webview/assets/user-formatted-text-CaMb4KJx.js",
    hash: "3fd414fe28a945111cecf97580f201304e8414c4c820d917b3fbf7f181e2d999",
  },
  bubble: {
    path: "webview/assets/subagent-activity-chip-group-BjYM1hkl.js",
    hash: "6d2e3fa5310166ee9fb2f82ef32f85a6727e7ad1bcdeb8e3944a008bed805fe4",
  },
  annotation: {
    path: "webview/assets/app-initial-q5My48Y-.js",
    hash: "25eea9a386dfb47563a89086f4f4a32e569def5c36780805a46856d4d3448eb8",
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
    "extensions:l===`codex-single-dollar-math`||l===`codex-annotation-math`?codexUserMessageExtensions:g",
  cacheOld: "function v(e){let n=(0,x.c)(20)",
  cacheNew: "function v(e){let n=(0,x.c)(21)",
  normalizationOld: "n[0]===i?h=n[1]:(h=y(i),n[0]=i,n[1]=h);",
  normalizationNew:
    "n[0]===i&&n[20]===l?h=n[1]:(h=l===`codex-annotation-math`?i.replace(/[ \\t]*\\\\\\[[ \\t]*(?:\\r?\\n)?/g,()=>`\\n\\n$$\\n`).replace(/(?:\\r?\\n)?[ \\t]*\\\\\\][ \\t]*/g,()=>`\\n$$\\n\\n`).replace(/[ \\t]*\\\\\\(((?:(?!\\\\\\))[\\s\\S])*?\\r?\\n(?:(?!\\\\\\))[\\s\\S])*?)\\\\\\)[ \\t]*/g,(e,t)=>`\\n\\n$$\\n${t.trim()}\\n$$\\n\\n`):y(i),n[0]=i,n[20]=l,n[1]=h);",
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
    "var DS,OS,kS,AS=e((()=>{Am(),DS=t(Io(),1),Qo(),Ai(),jc(),OS=Z(),kS=`codex-annotation`}));",
  dependencyNew:
    "var DS,OS,kS,AS=e((()=>{Am(),DS=t(Io(),1),Qo(),Ai(),jc(),Dh(),OS=Z(),kS=`codex-annotation`}));",
};

const annotationAnchors = {
  initializerOld: "function CRc(e){let t=(0,wRc.c)(7)",
  initializerNew: Buffer.concat([
    Buffer.from("var codexAnnotationMathExtensions=[{extensions:[", "utf8"),
    mathExtension,
    Buffer.from("]}];", "utf8"),
    annotationNormalizer,
    Buffer.from(";function CRc(e){let t=(0,wRc.c)(7)", "utf8"),
  ]),
  rendererOld:
    "(0,g4.jsx)(`div`,{className:`mt-0.5 break-words whitespace-pre-wrap`,children:r})",
  rendererNew:
    "(0,g4.jsx)(GB,{className:`mt-0.5 break-words`,extensions:codexAnnotationMathExtensions,children:codexNormalizeAnnotationMath(r)})",
  dependencyOld:
    "var wRc,g4,TRc=n((()=>{wRc=l(),bd(),oX(),uz(),LE(),n5s(),g4=J()}));",
  dependencyNew:
    "var wRc,g4,TRc=n((()=>{wRc=l(),bd(),oX(),uz(),LE(),n5s(),Yfa(),g4=J()}));",
};

const previewHelpers = `var codexMathUserFormattedLazy;function codexMathLoadFailure(e){return(0,E2.jsx)(\`div\`,{\"data-codex-math-preview-load-error\":\`true\`,className:\`text-size-chat whitespace-pre-wrap\`,children:e.text})}async function codexMathLoadUserFormatted(){try{let e=await import(\`./user-formatted-text-CaMb4KJx.js\`);return e.n(),{default:e.t}}catch(e){return{default:codexMathLoadFailure}}}function codexMathGetUserFormatted(){return codexMathUserFormattedLazy??=T2.lazy(codexMathLoadUserFormatted)}function codexMathComposerPreview(e){let t=gs(Bj,e.conversationId),n=Y(bb),r=e.cwd??t?.cwd??n??void 0,i=codexMathGetUserFormatted(),a=gd(),o=a.formatMessage({id:\`markdownFileEditor.mode.viewPreview\`,defaultMessage:\`View preview\`,description:\`Button label for switching from Markdown source to the rendered preview\`});return(0,E2.jsx)(\`div\`,{\"data-codex-math-composer-preview\":\`true\`,\"aria-label\":o,role:\`region\`,tabIndex:0,className:\`max-h-48 overflow-auto break-words p-3\`,children:(0,E2.jsx)(T2.Suspense,{fallback:(0,E2.jsx)(\`div\`,{\"data-codex-math-preview-loading\":\`true\`,className:\`text-size-chat whitespace-pre-wrap\`,children:e.text}),children:(0,E2.jsx)(i,{cwd:r,externalLinkContextMenuConversationId:e.externalLinkContextMenuConversationId,hostId:e.hostId??Zg,markdownClassName:\`codex-single-dollar-math\`,text:e.text})})})}function codexMathPreviewButton(e){let t=gd(),n=e.active?t.formatMessage({id:\`markdownFileEditor.mode.viewSource\`,defaultMessage:\`View source\`,description:\`Button label for switching from the rendered Markdown preview to source\`}):t.formatMessage({id:\`markdownFileEditor.mode.viewPreview\`,defaultMessage:\`View preview\`,description:\`Button label for switching from Markdown source to the rendered preview\`});return(0,E2.jsx)(cV.FooterAction,{children:(0,E2.jsx)(aX,{\"aria-label\":n,\"aria-pressed\":e.active,color:\`ghostActive\`,disabled:e.disabled,size:\`toolbar\`,onClick:e.onClick,children:n})})}`;

const previewAnchors = {
  helperOld: "function xEc(e){",
  helperNew: `${previewHelpers}function xEc(e){`,
};

const codexPreviewAnchors = {
  stateOld:
    "let ie=re,ae=cU(W,BGc,`document`),oe=cU(W,zGc,`document`),se=gd(),ce=Y(JGc),",
  stateNew:
    "let ie=re,ae=cU(W,BGc,`document`),oe=cU(W,zGc,`document`),codexMathText=cU(W,jEc,`document`),codexMathPreviewText=codexMathText+`\\n`,codexPlainTextMode=JY(qu.composerPlainTextMode),[codexMathCodexPreview,setCodexMathCodexPreview]=(0,U4.useState)(!1);(0,U4.useEffect)(()=>{setCodexMathCodexPreview(!1)},[W,codexPlainTextMode,K,codexMathText]),i=codexPlainTextMode&&codexMathCodexPreview?(0,W4.jsx)(codexMathComposerPreview,{conversationId:K,cwd:b,externalLinkContextMenuConversationId:K,hostId:y,text:codexMathPreviewText}):i;let se=gd(),ce=Y(JGc),",
  actionsOld:
    "let tt=et,nt;t[90]!==Ye||t[91]!==ye.thread?(nt=Ye==null?null:(0,W4.jsx)(cUc,{action:`speaker`,isMuted:ye.thread.isMuted,phase:Ye,onClick:ye.thread.toggleMute}),t[90]=Ye,t[91]=ye.thread,t[92]=nt):nt=t[92];let rt=nt,it;",
  actionsNew:
    "let tt=et,nt;t[90]!==Ye||t[91]!==ye.thread?(nt=Ye==null?null:(0,W4.jsx)(cUc,{action:`speaker`,isMuted:ye.thread.isMuted,phase:Ye,onClick:ye.thread.toggleMute}),t[90]=Ye,t[91]=ye.thread,t[92]=nt):nt=t[92];let rt=nt,codexMathCodexPreviewToggle=null;if(codexPlainTextMode&&codexMathText.length>0){let e=()=>{codexMathCodexPreview?(setCodexMathCodexPreview(!1),window.requestAnimationFrame(()=>W.focus())):W.view.composing||setCodexMathCodexPreview(!0)};codexMathCodexPreviewToggle=(0,W4.jsx)(codexMathPreviewButton,{active:codexMathCodexPreview,disabled:!codexMathCodexPreview&&W.view.composing,onClick:e})}codexMathCodexPreviewToggle!=null&&(rt=(0,W4.jsxs)(W4.Fragment,{children:[codexMathCodexPreviewToggle,rt]}));let it;",
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
  if (
    count(bytes, "codex-single-dollar-math") !== 0 ||
    count(bytes, "codexAnnotationMathExtensions") !== 0 ||
    count(bytes, "codexMathComposerPreview") !== 0
  ) {
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
  ["composer preview helpers", previewAnchors.helperOld, previewAnchors.helperNew],
  ["Codex composer preview state", codexPreviewAnchors.stateOld, codexPreviewAnchors.stateNew],
  ["Codex composer preview actions", codexPreviewAnchors.actionsOld, codexPreviewAnchors.actionsNew],
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
  [annotation, "function codexMathComposerPreview(e)", 1],
  [annotation, "function codexMathPreviewButton(e)", 1],
  [
    annotation,
    "function codexMathComposerPreview(e){let t=gs(Bj,e.conversationId),n=Y(bb)",
    1,
  ],
  [annotation, "function codexMathComposerPreview(e){let t=gs(Bj,e.conversationId),n=Y(Sb)", 0],
  [annotation, "hostId:e.hostId??Zg", 1],
  [annotation, "import(`./user-formatted-text-CaMb4KJx.js`)", 1],
  [annotation, "markdownClassName:`codex-single-dollar-math`", 1],
  [annotation, "data-codex-math-composer-preview", 1],
  [annotation, "data-codex-math-preview-load-error", 1],
  [annotation, codexPreviewAnchors.stateNew, 1],
  [annotation, codexPreviewAnchors.actionsNew, 1],
  [annotation, "text:codexMathPreviewText", 1],
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
if (expectedOutputHash != null && sha256(built.output) !== expectedOutputHash) {
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
    composerPreviewSameComponent: "passed",
    composerPreviewNoDuplicateMathExtension: "passed",
    composerPreviewDependencyRebinding: "passed",
  },
}, null, 2));
