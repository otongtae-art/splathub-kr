/**
 * POST /api/upload/file
 *
 * 개발 모드 전용 — R2 presigned PUT 대신 서버가 직접 파일을 받아 임시 디렉토리에 저장.
 * 프로덕션에서는 presigned PUT → R2 직접 업로드 경로를 사용하므로 이 엔드포인트는 비활성화.
 *
 * multipart/form-data로 파일을 받고, upload_id + 로컬 서빙 URL을 반환.
 */

import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { registerUpload } from '@/lib/store/memoryUploads';

export const runtime = 'nodejs';

const UPLOAD_DIR = join(process.cwd(), '.uploads');

export async function POST(req: Request) {
  const formData = await req.formData();
  const files = formData.getAll('files') as File[];

  if (files.length === 0) {
    return NextResponse.json({ error: 'no_files' }, { status: 400 });
  }

  await mkdir(UPLOAD_DIR, { recursive: true });

  const uploads = await Promise.all(
    files.map(async (file) => {
      const ext = file.name.split('.').pop() || 'jpg';
      const id = randomUUID();
      const filename = `${id}.${ext}`;
      const filepath = join(UPLOAD_DIR, filename);

      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filepath, buffer);

      const record = registerUpload({
        owner_id: 'anonymous',
        r2_key: `local/${filename}`,
        mime: file.type || 'image/jpeg',
        size_bytes: buffer.length,
        width: null,
        height: null,
      });

      return {
        upload_id: record.id,
        filename,
        public_url: `/api/uploads/${filename}`,
        size: buffer.length,
      };
    }),
  );

  return NextResponse.json({ uploads });
}
