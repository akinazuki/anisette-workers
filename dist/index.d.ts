export interface HttpClient {
    get(url: string, headers: Record<string, string>): Promise<Uint8Array>;
    post(url: string, body: string, headers: Record<string, string>): Promise<Uint8Array>;
}
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
export declare function createAnisette(options: CreateAnisetteOptions): Promise<AnisetteProvider>;
