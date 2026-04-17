/**
 * R2 (S3-compatible) helpers — presigned PUT and public URL resolution.
 *
 * Uses SigV4 manually instead of pulling in `@aws-sdk/*` so the Cloudflare
 * Pages Functions runtime stays small. M2 will likely add the official SDK
 * once we need multipart uploads for large videos.
 */

import { required } from './env';

const encoder = new TextEncoder();

export type PresignPutInput = {
  key: string;
  contentType: string;
  expiresInSeconds?: number;
};

export type PresignPutResult = {
  url: string;
  headers: Record<string, string>;
  expires_in: number;
};

/**
 * Generate a presigned PUT URL for Cloudflare R2.
 * R2 uses the AWS SigV4 algorithm with the "auto" region.
 */
export async function presignPut({
  key,
  contentType,
  expiresInSeconds = 900,
}: PresignPutInput): Promise<PresignPutResult> {
  const accountId = required('R2_ACCOUNT_ID');
  const accessKeyId = required('R2_ACCESS_KEY_ID');
  const secretAccessKey = required('R2_SECRET_ACCESS_KEY');
  const bucket = required('R2_BUCKET');

  const host = `${accountId}.r2.cloudflarestorage.com`;
  const region = 'auto';
  const service = 's3';
  const method = 'PUT';

  const now = new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);

  const canonicalUri = `/${bucket}/${encodeKey(key)}`;
  const signedHeaders = 'host';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const query = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expiresInSeconds),
    'X-Amz-SignedHeaders': signedHeaders,
  });

  const canonicalQueryString = [...query.entries()]
    .map(([k, v]) => `${encodeRFC3986(k)}=${encodeRFC3986(v)}`)
    .sort()
    .join('&');

  const canonicalHeaders = `host:${host}\n`;
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = await deriveSigningKey(secretAccessKey, dateStamp, region, service);
  const signature = bytesToHex(await hmac(signingKey, stringToSign));

  const signedUrl = `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;

  return {
    url: signedUrl,
    headers: {
      'content-type': contentType,
    },
    expires_in: expiresInSeconds,
  };
}

/** Resolve a public R2 URL from a key. */
export function publicUrlFor(key: string): string {
  const base = required('R2_PUBLIC_BASE').replace(/\/+$/, '');
  return `${base}/${key.replace(/^\/+/, '')}`;
}

// ───────── helpers ─────────

function toAmzDate(d: Date): string {
  const iso = d.toISOString().replace(/[:-]|\.\d{3}/g, '');
  return iso; // YYYYMMDDTHHMMSSZ
}

function encodeKey(key: string): string {
  return key
    .split('/')
    .map((seg) => encodeRFC3986(seg))
    .join('/');
}

function encodeRFC3986(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(input));
  return bytesToHex(new Uint8Array(bytes));
}

async function hmac(key: Uint8Array, msg: string): Promise<Uint8Array> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(msg));
  return new Uint8Array(sig);
}

async function deriveSigningKey(
  secret: string,
  dateStamp: string,
  region: string,
  service: string,
): Promise<Uint8Array> {
  const kDate = await hmac(encoder.encode(`AWS4${secret}`), dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, 'aws4_request');
  return kSigning;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
