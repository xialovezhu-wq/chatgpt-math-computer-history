import fs from "node:fs";
import path from "node:path";
import { readArchiveHeaderSync } from "file:///Users/USER_NAME/.npm/_npx/4b0e2640fe917ac8/node_modules/@electron/asar/lib/disk.js";

const [archivePath, ...terms] = process.argv.slice(2);

if (!archivePath || terms.length === 0) {
  throw new Error("Usage: node search-asar-js.mjs /absolute/app.asar term [term ...]");
}

const { header, headerSize } = readArchiveHeaderSync(archivePath);
const dataStart = 8 + headerSize;
const archiveFd = fs.openSync(archivePath, "r");
const patterns = terms.map((term) => ({ term, regex: new RegExp(term, "gi") }));
let hitCount = 0;

function readEntry(entry, filename) {
  if (entry.unpacked) {
    return fs.readFileSync(path.join(`${archivePath}.unpacked`, filename));
  }

  const buffer = Buffer.alloc(entry.size);
  fs.readSync(archiveFd, buffer, 0, entry.size, dataStart + Number(entry.offset));
  return buffer;
}

function walk(node, prefix = "") {
  for (const [name, entry] of Object.entries(node.files ?? {})) {
    const filename = prefix ? `${prefix}/${name}` : name;

    if (entry.files) {
      walk(entry, filename);
      continue;
    }

    if (!filename.startsWith("webview/assets/") || !filename.endsWith(".js")) {
      continue;
    }

    if (/^webview\/assets\/[a-z]{2}(?:-[A-Z]{2,3})?-[A-Za-z0-9_-]+\.js$/.test(filename)) {
      continue;
    }

    const text = readEntry(entry, filename).toString("utf8");

    for (const { term, regex } of patterns) {
      regex.lastIndex = 0;
      let match;
      while ((match = regex.exec(text)) !== null) {
        const start = Math.max(0, match.index - 350);
        const end = Math.min(text.length, match.index + match[0].length + 550);
        console.log(`\nFILE=${filename}\nTERM=${term}\nINDEX=${match.index}\n${text.slice(start, end)}\n`);
        hitCount += 1;
        if (hitCount >= 200) return;
        if (match[0].length === 0) regex.lastIndex += 1;
      }
    }

    if (hitCount >= 200) return;
  }
}

try {
  walk(header);
} finally {
  fs.closeSync(archiveFd);
}

console.error(`TOTAL_HITS=${hitCount}`);
