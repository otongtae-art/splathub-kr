/**
 * GET /api/uploads/:filename
 *
 * 개발 모드 전용 — .uploads/ 디렉토리의 파일을 서빙.
 * 프로덕션에서는 R2 public URL로 직접 접근하므로 이 라우트는 불필요.
 */

import { NextResponse } from 'next/server';
import { readFile, stat } from 'fs/promises';
import { join } from 'path';

export const runtime = 'nodejs';

const UPLOAD_DIR = join(process.cwd(), '.uploads');

const MIME_MAP: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  spz: 'application/octet-stream',
  ply: 'application/octet-stream',
  sog: 'application/octet-stream',
};

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ filename: string }> },
) {
  const { filename } = await ctx.params;

  // 보안: 경로 탈출 방지
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return NextResponse.json({ error: 'invalid_filename' }, { status: 400 });
  }

  const filepath = join(UPLOAD_DIR, filename);

  try {
    await stat(filepath);
  } catch {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const buffer = await readFile(filepath);
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const contentType = MIME_MAP[ext] || 'application/octet-stream';

  return new NextResponse(buffer, {
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=3600',
    },
  });
}
