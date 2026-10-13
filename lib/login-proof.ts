/**
 * Challenge-response login (browser side). Uses the Web Crypto API, which
 * browsers only provide on secure pages (https:// or http://localhost).
 * Must produce exactly what lib/credentials.ts computes on the server.
 */

const encoder = new TextEncoder();

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isWebCryptoAvailable(): boolean {
  return typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.subtle !== "undefined";
}

export async function buildLoginProof(
  nonce: string,
  username: string,
  password: string
): Promise<{ usernameHash: string; proof: string }> {
  const subtle = globalThis.crypto.subtle;
  const usernameHash = toHex(await subtle.digest("SHA-256", encoder.encode(username.trim())));
  const passwordKey = await subtle.digest("SHA-256", encoder.encode(password));
  const key = await subtle.importKey("raw", passwordKey, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const proof = toHex(await subtle.sign("HMAC", key, encoder.encode(`${nonce}:${usernameHash}`)));
  return { usernameHash, proof };
}
