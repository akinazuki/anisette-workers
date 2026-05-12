#!/usr/bin/env bun
import { readFile, writeFile } from "node:fs/promises";

const path = process.argv[2];
const NEW_INITIAL = Number(process.argv[3] ?? 256);

if (!path) {
  console.error("usage: bun anisette-patch-wasm <file.wasm> [new_initial_pages]");
  process.exit(1);
}

const wasm = new Uint8Array(await readFile(path));
let p = 8;

function leb128() {
  let v = 0,
    shift = 0,
    byte;
  do {
    byte = wasm[p++];
    v |= (byte & 0x7f) << shift;
    shift += 7;
  } while (byte & 0x80);
  return v;
}

function encodeLeb128(n) {
  const out = [];
  let v = n;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v !== 0) b |= 0x80;
    out.push(b);
  } while (v !== 0);
  return out;
}

while (p < wasm.length) {
  const id = wasm[p++];
  const startOfLenByte = p;
  const len = leb128();
  const bodyStart = p;
  console.log(`section id=${id} len=${len} @${bodyStart}`);

  if (id === 5) {
    const count = leb128();
    const flagsByte = wasm[p++];
    const origInitial = leb128();
    const maxPages = flagsByte & 1 ? leb128() : null;

    console.log(`  memories: ${count}`);
    console.log(
      `  memory[0]: flags=${flagsByte} initial=${origInitial}p=${origInitial * 64}KB${
        maxPages !== null ? ` max=${maxPages}p=${maxPages * 64}KB` : ""
      }`,
    );

    const newBody = [
      ...encodeLeb128(count),
      flagsByte,
      ...encodeLeb128(NEW_INITIAL),
      ...(maxPages !== null ? encodeLeb128(maxPages) : []),
    ];
    const newSection = new Uint8Array([id, ...encodeLeb128(newBody.length), ...newBody]);

    const before = wasm.slice(0, startOfLenByte - 1);
    const after = wasm.slice(bodyStart + len);
    const out = new Uint8Array(before.length + newSection.length + after.length);
    out.set(before, 0);
    out.set(newSection, before.length);
    out.set(after, before.length + newSection.length);

    const outPath = path + ".patched";
    await writeFile(outPath, out);
    console.log(`\n✓ wrote ${outPath}: ${out.length} bytes (orig ${wasm.length})`);
    console.log(`  initial: ${origInitial} → ${NEW_INITIAL} pages (${NEW_INITIAL * 64}KB)`);
    console.log(`  next: mv ${outPath} ${path}`);
    process.exit(0);
  }

  p = bodyStart + len;
}

console.error("memory section not found");
process.exit(1);
