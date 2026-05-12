declare module "*/anisette-js/dist/anisette_rs.js" {
  const factory: (overrides?: Record<string, unknown>) => Promise<unknown>;
  export default factory;
}

declare module "*/anisette-js/dist/anisette.js" {
  export class Anisette {
    isProvisioned: boolean;
    static fromSo(
      ssc: Uint8Array,
      adi: Uint8Array,
      wasmModule: unknown,
      opts: {
        httpClient: unknown;
        init?: { adiPb?: Uint8Array; deviceJsonBytes?: Uint8Array };
      },
    ): Promise<Anisette>;
    provision(): Promise<void>;
    getData(): Promise<Record<string, string>>;
    getAdiPb(): Uint8Array;
    getDeviceJson(): Uint8Array;
  }
}

declare module "*/anisette-js/dist/http.js" {
  export interface HttpClient {
    get(url: string, headers: Record<string, string>): Promise<Uint8Array>;
    post(
      url: string,
      body: string,
      headers: Record<string, string>,
    ): Promise<Uint8Array>;
  }
}
