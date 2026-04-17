/**
 * POST /api/upload/presign
 *
 * Issues R2 presigned PUT URLs so the browser can upload images directly —
 * bypassing our server and saving Cloudflare Pages bandwidth quota.
 * Returns one presigned target per input file. The browser must upload with
 * the matching `Content-Type` header for R2 to accept the request.
 */

import { NextResponse } from 'next/server';
import { PresignRequestSchema } from '@splathub/shared';
import { presignPut, publicUrlFor } from '@/lib/r2';
import { registerUpload } from '@/lib/store/memoryUploads';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const parsed = PresignRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid_input', issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const presigns = await Promise.all(
    parsed.data.files.map(async (file) => {
      const key = `uploads/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${sanitize(
        file.name,
      )}`;

      const record = registerUpload({
        owner_id: 'anonymous', // M4에 Supabase auth로 교체
        r2_key: key,
        mime: file.mime,
        size_bytes: file.size,
        width: null,
        height: null,
      });

      const presign = await presignPut({ key, contentType: file.mime });
      return {
        upload_id: record.id,
        r2_key: key,
        public_url: publicUrlFor(key),
        url: presign.url,
        headers: presign.headers,
        expires_in: presign.expires_in,
      };
    }),
  );

  return NextResponse.json({ uploads: presigns });
}

function sanitize(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-80)
    .toLowerCase();
}
