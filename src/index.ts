// Deep import bypasses @lbr77/anisette-js's main entry (which has a top-level
// `new URL(import.meta.url)` side effect via wasm-loader.js that crashes on Workers).
// The package's "exports" map does not expose these — see src/anisette-js-shim.d.ts.
import { Anisette } from "@lbr77/anisette-js/dist/anisette.js";
import type { HttpClient } from "@lbr77/anisette-js/dist/http.js";
// @ts-expect-error — Emscripten generated module, no types ship with the package
import RawModuleFactory from "@lbr77/anisette-js/dist/anisette_rs.js";

const ModuleFactory = RawModuleFactory as (
  overrides?: Record<string, unknown>,
) => Promise<unknown>;

type WebAssemblyImports = Record<string, Record<string, unknown>>;

export interface AnisetteState {
  adiPb: string;
  deviceJson: string;
}

export interface AnisetteHeaders {
  "X-Apple-I-Client-Time": string;
  "X-Apple-I-MD": string;
  "X-Apple-I-MD-LU": string;
  "X-Apple-I-MD-M": string;
  "X-Apple-I-MD-RINFO": string;
  "X-Apple-I-SRL-NO"?: string;
  "X-Apple-I-TimeZone": string;
  "X-Apple-Locale"?: string;
  "X-MMe-Client-Info"?: string;
  "X-Mme-Device-Id"?: string;
}

export interface CreateAnisetteOptions {
  sscBinary: ArrayBuffer | Uint8Array;
  adiBinary: ArrayBuffer | Uint8Array;
  wasmModule: WebAssembly.Module;
  state?: AnisetteState;
  httpClient?: HttpClient;
}

export interface AnisetteProvider {
  getHeaders(): Promise<AnisetteHeaders>;
  getState(): AnisetteState;
  isProvisioned: boolean;
}

const u8ToB64 = (u: Uint8Array): string =>
  btoa(String.fromCharCode(...Array.from(u)));
const b64ToU8 = (s: string): Uint8Array =>
  Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

class DefaultHttpClient implements HttpClient {
  async get(url: string, headers: Record<string, string>): Promise<Uint8Array> {
    const r = await fetch(url, { method: "GET", headers });
    return new Uint8Array(await r.arrayBuffer());
  }
  async post(
    url: string,
    body: string,
    headers: Record<string, string>,
  ): Promise<Uint8Array> {
    const r = await fetch(url, { method: "POST", body, headers });
    return new Uint8Array(await r.arrayBuffer());
  }
}

async function withShadowedGlobals<T>(fn: () => Promise<T>): Promise<T> {
  const g = globalThis as Record<string, unknown>;
  const saved: Record<string, unknown> = {};
  const shadow = (k: string, v: unknown) => {
    try {
      saved[k] = g[k];
      Object.defineProperty(g, k, { value: v, configurable: true });
    } catch {}
  };
  shadow("process", undefined);
  shadow("WorkerGlobalScope", undefined);
  shadow("window", {});
  shadow("indexedDB", {
    open: () => {
      throw new Error("IDB stubbed by anisette-workers");
    },
  });
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(saved)) {
      try {
        Object.defineProperty(g, k, { value: saved[k], configurable: true });
      } catch {}
    }
  }
}

export async function createAnisette(
  options: CreateAnisetteOptions,
): Promise<AnisetteProvider> {
  const {
    sscBinary,
    adiBinary,
    wasmModule,
    state,
    httpClient = new DefaultHttpClient(),
  } = options;

  const ani = await withShadowedGlobals(async () => {
    const wasm = await ModuleFactory({
      FS: undefined,
      instantiateWasm(
        imports: WebAssemblyImports,
        receive: (i: WebAssembly.Instance) => void,
      ) {
        const p = (WebAssembly.instantiate as (
          m: WebAssembly.Module,
          imports: unknown,
        ) => Promise<WebAssembly.Instance>)(wasmModule, imports);
        p.then(receive).catch((err: unknown) => {
          const e = err as { message?: string };
          console.error(
            "[anisette-workers] WebAssembly.instantiate FAILED:",
            e?.message ?? err,
          );
          throw err;
        });
        return {};
      },
    });

    const ssc = sscBinary instanceof Uint8Array ? sscBinary : new Uint8Array(sscBinary);
    const adi = adiBinary instanceof Uint8Array ? adiBinary : new Uint8Array(adiBinary);

    return await Anisette.fromSo(ssc, adi, wasm, {
      httpClient,
      init: state
        ? {
            adiPb: b64ToU8(state.adiPb),
            deviceJsonBytes: b64ToU8(state.deviceJson),
          }
        : {},
    });
  });

  if (!ani.isProvisioned) {
    await ani.provision();
  }

  return {
    isProvisioned: ani.isProvisioned,
    async getHeaders() {
      return (await ani.getData()) as unknown as AnisetteHeaders;
    },
    getState() {
      return {
        adiPb: u8ToB64(ani.getAdiPb()),
        deviceJson: u8ToB64(ani.getDeviceJson()),
      };
    },
  };
}
