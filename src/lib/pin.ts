// PIN utilities — 8-digit numeric PINs, hashed with PBKDF2 via Web Crypto API.
// Never store or transmit plain PINs. The hash is stored in Firestore as:
//   "salt:hash" where both are base64url-encoded.

const ITERATIONS = 100_000;
const HASH_ALG = "SHA-256";
const KEY_LEN = 32; // bytes

function buf2b64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function b64toBuf(b64: string): Uint8Array {
  const padded = b64.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded);
  return new Uint8Array([...binary].map((c) => c.charCodeAt(0)));
}

export function isValidPin(pin: string): boolean {
  return /^\d{8}$/.test(pin);
}

export async function hashPin(pin: string): Promise<string> {
  const enc = new TextEncoder();
  const saltBuf = crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const hashBuf = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBuf as BufferSource,
      iterations: ITERATIONS,
      hash: HASH_ALG,
    },
    keyMaterial,
    KEY_LEN * 8
  );

  return `${buf2b64(saltBuf.buffer)}:${buf2b64(hashBuf)}`;
}

export async function verifyPin(pin: string, stored: string): Promise<boolean> {
  try {
    const [saltB64, hashB64] = stored.split(":");
    if (!saltB64 || !hashB64) return false;

    const saltBuf = b64toBuf(saltB64);
    const enc = new TextEncoder();

    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(pin),
      "PBKDF2",
      false,
      ["deriveBits"]
    );

    const hashBuf = await crypto.subtle.deriveBits(
      {
        name: "PBKDF2",
        salt: saltBuf as BufferSource,
        iterations: ITERATIONS,
        hash: HASH_ALG,
      },
      keyMaterial,
      KEY_LEN * 8
    );

    const candidate = buf2b64(hashBuf);

    // Constant-time comparison to prevent timing attacks
    if (candidate.length !== hashB64.length) return false;
    let diff = 0;
    for (let i = 0; i < candidate.length; i++) {
      diff |= candidate.charCodeAt(i) ^ hashB64.charCodeAt(i);
    }
    return diff === 0;
  } catch {
    return false;
  }
}