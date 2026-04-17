/**
 * HMAC-SHA256 helpers for worker → web app callback authentication.
 *
 * Callbacks carry arbitrary request bodies (job status, file URLs). We sign
 * the raw body and verify with timing-safe equality. The Web Crypto API is
 * used so this works on both Node and Cloudflare Workers runtimes.
 */

const encoder = new TextEncoder();

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

export async function sign(body: string | Uint8Array, secret: string): Promise<string> {
  const key = await getKey(secret);
  const data = typeof body === 'string' ? encoder.encode(body) : body;
  const sig = await crypto.subtle.sign('HMAC', key, data);
  return bytesToHex(new Uint8Array(sig));
}

export async function verify(
  body: string | Uint8Array,
  signatureHex: string,
  secret: string,
): Promise<boolean> {
  if (!signatureHex) return false;
  const expected = await sign(body, secret);
  return timingSafeEqual(expected, signatureHex);
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
