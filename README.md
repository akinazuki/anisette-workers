# anisette-workers

A wrapper that lets you run [`@lbr77/anisette-js`](https://github.com/lbr77/anisette-js)
(generates Apple Anisette headers locally via a WASM-emulated ARM64 unicorn)
on **Cloudflare Workers**.

```ts
import { createAnisette } from "anisette-workers";
import sscBinary from "./libstoreservicescore.so";
import adiBinary from "./libCoreADI.so";
import wasmModule from "./anisette.wasm";

export default {
  async fetch(req, env) {
    const ani = await createAnisette({ sscBinary, adiBinary, wasmModule });
    const headers = await ani.getHeaders();
    return Response.json(headers);
  },
};
```

Returns the full set of 10 Apple Anisette HTTP headers, ready to plug into
`Authorization` requests against iCloud APIs.

Sample response:

```json
{
  "X-Apple-I-Client-Time": "2026-05-12T08:07:08Z",
  "X-Apple-I-MD":          "AAAABQAAABBsdMD2………………………AAAABA==",
  "X-Apple-I-MD-LU":       "1460382AA8………………………………………………………8D8D43A",
  "X-Apple-I-MD-M":        "JU4pdbmOA0………………………………………………………………………………xsLk7d5wo0",
  "X-Apple-I-MD-RINFO":    "17106176",
  "X-Apple-I-SRL-NO":      "0",
  "X-Apple-I-TimeZone":    "+0000",
  "X-Apple-Locale":        "en_US",
  "X-MMe-Client-Info":     "<MacBookPro13,2> <macOS;13.1;22C65> <com.apple.AuthKit/1 (com.apple.dt.Xcode/3594.4.19)>",
  "X-Mme-Device-Id":       "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"
}
```

---

## Install

```bash
bun add anisette-workers @lbr77/anisette-js
```

## Prepare 3 binary assets

**① Two Apple Music Android `.so` files**

Grab from `lib/arm64-v8a/`:
   - `libstoreservicescore.so`
   - `libCoreADI.so`

3. Drop them into your project's `src/` (or anywhere wrangler can import).

**② Extract + patch the anisette WASM**:

```bash
# Run these two once per project (bootstrap)
bunx anisette-extract-wasm src/anisette.wasm
bunx anisette-patch-wasm src/anisette.wasm
mv src/anisette.wasm.patched src/anisette.wasm
```

Step 1 extracts the WASM blob that's embedded inside `@lbr77/anisette-js`'s JS file
into a standalone `.wasm`. Step 2 patches `INITIAL_MEMORY` from 256MB down to 16MB
(Workers caps a single isolate at 128MB).

## Configure wrangler.toml

```toml
name = "your-worker"
main = "src/worker.ts"
compatibility_date = "2024-11-01"
compatibility_flags = ["nodejs_compat"]

# .so files → ArrayBuffer modules
[[rules]]
type = "Data"
globs = ["**/*.so"]
fallthrough = true

# .wasm files → pre-compiled WebAssembly.Module (Cloudflare compiles at deploy time)
[[rules]]
type = "CompiledWasm"
globs = ["**/*.wasm"]
fallthrough = true

[limits]
cpu_ms = 30000          # cold-start anisette provisioning takes ~3s
```

`src/assets.d.ts` for TypeScript:

```ts
declare module "*.so"   { const data: ArrayBuffer; export default data; }
declare module "*.wasm" { const mod: WebAssembly.Module; export default mod; }
```

## API

### `createAnisette(options): Promise<AnisetteProvider>`

```ts
interface CreateAnisetteOptions {
  sscBinary:  ArrayBuffer | Uint8Array;   // libstoreservicescore.so
  adiBinary:  ArrayBuffer | Uint8Array;   // libCoreADI.so
  wasmModule: WebAssembly.Module;         // pre-compiled anisette WASM
  state?:     AnisetteState;              // optional: reuse a prior provisioning
  httpClient?: HttpClient;                // optional: custom HTTP (defaults to fetch)
}

interface AnisetteProvider {
  getHeaders(): Promise<AnisetteHeaders>; // current anisette headers
  getState():  AnisetteState;             // persistable state (base64)
  isProvisioned: boolean;
}
```

### Full worker example (with KV persistence)

```ts
import { createAnisette, type AnisetteState } from "anisette-workers";
import sscBinary from "./libstoreservicescore.so";
import adiBinary from "./libCoreADI.so";
import wasmModule from "./anisette.wasm";

interface Env { ANISETTE_KV: KVNamespace; }

export default {
  async fetch(_req: Request, env: Env): Promise<Response> {
    const cached = await env.ANISETTE_KV.get<AnisetteState>("anisette-state", "json");
    const ani = await createAnisette({ sscBinary, adiBinary, wasmModule, state: cached ?? undefined });

    if (!cached) {
      await env.ANISETTE_KV.put("anisette-state", JSON.stringify(ani.getState()));
    }

    return Response.json(await ani.getHeaders());
  },
};
```

## Why you need this wrapper

If you just `import { Anisette } from "@lbr77/anisette-js"` and deploy it to Workers,
you'll hit 5 specific errors:

1. **`TypeError: Invalid URL string`** — top-level `new URL(import.meta.url)` side effect in the package
2. **`worker environment detected but not enabled at build time`** — Emscripten environment assert
3. **`indexedDB not supported`** — IDBFS detection
4. **`Wasm code generation disallowed by embedder`** — Workers forbids runtime instantiation
5. **`Out of memory: Cannot allocate Wasm memory`** — 256MB request exceeds the 128MB limit

This library handles 1–3 at runtime (globals shadowing) and ships CLI tools for 4–5.

## Known limitations

- **`wrangler dev` can't reach Apple GSA locally** (workerd restriction) — after changes you can only test on a real edge deploy
- **WASM memory may grow past 128MB in extreme cases** — typical usage peaks around 50MB
