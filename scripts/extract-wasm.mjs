#!/usr/bin/env bun
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const outPath = resolve(process.argv[2] ?? "anisette.wasm");

let ModuleFactory;
try {
  ModuleFactory = (await import("@lbr77/anisette-js/dist/anisette_rs.js")).default;
} catch {
  ModuleFactory = (await import("../node_modules/@lbr77/anisette-js/dist/anisette_rs.js"))
    .default;
}

Object.defineProperty(globalThis, "process", { value: undefined, configurable: true });
Object.defineProperty(globalThis, "window", { value: {}, configurable: true });

let captured;
const origInst = WebAssembly.instantiate.bind(WebAssembly);
WebAssembly.instantiate = (...args) => {
  if (args[0] instanceof Uint8Array || args[0] instanceof ArrayBuffer) {
    captured = args[0] instanceof Uint8Array ? args[0] : new Uint8Array(args[0]);
    throw new Error("STOP_AFTER_CAPTURE");
  }
  return origInst(...args);
};

try {
  await ModuleFactory({ FS: undefined });
} catch (e) {
  if (!String(e).includes("STOP_AFTER_CAPTURE")) {
    console.error("unexpected error during extract:", e?.message ?? e);
  }
}

if (!captured) {
  console.error("FAILED: didn't capture any wasm bytes");
  process.exit(1);
}

await writeFile(outPath, captured);
console.log(`✓ wrote ${outPath}: ${captured.length} bytes`);
console.log(`  next: bun anisette-patch-wasm ${outPath}`);
