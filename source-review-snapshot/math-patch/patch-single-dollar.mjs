import { createHash } from "node:crypto";
import { open, readFile, stat } from "node:fs/promises";

const [asarPath] = process.argv.slice(2);

if (!asarPath) {
  throw new Error("Usage: node patch-single-dollar.mjs /absolute/path/to/app.asar");
}

const expectedPrefix = "/Applications/ChatGPT-Math-Test-";
const expectedSuffix = ".app/Contents/Resources/app.asar";

if (!asarPath.startsWith(expectedPrefix) || !asarPath.endsWith(expectedSuffix)) {
  throw new Error(`Refusing to patch unexpected path: ${asarPath}`);
}

const disabled = Buffer.from("singleDollarTextMath:!1", "utf8");
const enabled = Buffer.from("singleDollarTextMath:!0", "utf8");

if (disabled.length !== enabled.length) {
  throw new Error("Replacement must preserve byte length");
}

function findAll(haystack, needle) {
  const offsets = [];
  let offset = 0;

  while (offset <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, offset);
    if (found === -1) break;
    offsets.push(found);
    offset = found + needle.length;
  }

  return offsets;
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

const beforeStat = await stat(asarPath);
const archive = await readFile(asarPath);
const disabledOffsets = findAll(archive, disabled);
const enabledOffsets = findAll(archive, enabled);

if (disabledOffsets.length !== 1 || enabledOffsets.length !== 0) {
  throw new Error(
    `Expected exactly one disabled target and no enabled target; found disabled=${disabledOffsets.length}, enabled=${enabledOffsets.length}`,
  );
}

const beforeHash = sha256(archive);
const targetOffset = disabledOffsets[0];
const changedByteOffset = targetOffset + disabled.length - 1;

if (archive[changedByteOffset] !== "1".charCodeAt(0)) {
  throw new Error("Target byte is not the expected disabled value");
}

const handle = await open(asarPath, "r+");
try {
  await handle.write(Buffer.from("0", "utf8"), 0, 1, changedByteOffset);
  await handle.sync();
} finally {
  await handle.close();
}

const afterStat = await stat(asarPath);
const patchedArchive = await readFile(asarPath);
const disabledAfter = findAll(patchedArchive, disabled);
const enabledAfter = findAll(patchedArchive, enabled);

if (beforeStat.size !== afterStat.size) {
  throw new Error(`Archive size changed from ${beforeStat.size} to ${afterStat.size}`);
}

if (disabledAfter.length !== 0 || enabledAfter.length !== 1) {
  throw new Error(
    `Patch verification failed; found disabled=${disabledAfter.length}, enabled=${enabledAfter.length}`,
  );
}

console.log(
  JSON.stringify(
    {
      asarPath,
      targetOffset,
      changedByteOffset,
      size: afterStat.size,
      beforeHash,
      afterHash: sha256(patchedArchive),
      disabledCount: disabledAfter.length,
      enabledCount: enabledAfter.length,
    },
    null,
    2,
  ),
);
