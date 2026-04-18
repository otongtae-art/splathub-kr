/**
 * `/edit/[id]` — SuperSplat 에디터 iframe 임베드.
 *
 * 전략:
 *   - apps/editor/ 에 SuperSplat (MIT, v2.24.5) 를 git subtree 로 포함
 *   - scripts/build-editor.sh 가 editor 를 빌드해 apps/web/public/editor-app/
 *     으로 복사 (Vercel 배포 직전 또는 로컬 개발 시 실행)
 *   - 이 페이지는 iframe 으로 self-hosted 에디터를 로드
 *   - postMessage 로 모델 로드/저장 통신
 *
 * URL 파라미터:
 *   - loadUrl : R2/Supabase presigned GET URL (.ply/.sog/.spz)
 *   - returnUrl: 저장 후 리디렉트할 URL (선택)
 *
 * postMessage protocol (양방향):
 *   에디터 → 우리: { type: 'supersplat:save', format: 'ply'|'sog'|'spz', bytes: ArrayBuffer }
 *   우리 → 에디터: { type: 'splathub:init', loadUrl: string }
 *
 * 참고: https://github.com/playcanvas/supersplat (MIT, 라이선스 표기 유지)
 */

import EditorFrame from '@/components/editor/EditorFrame';

export const runtime = 'nodejs';

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ loadUrl?: string }>;
};

export default async function EditPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;

  // TODO: id 로 DB 조회해서 실제 R2 URL 을 가져옴 (Phase 2, 현재는 searchParam 그대로)
  const loadUrl = sp.loadUrl ?? null;

  return (
    <div className="flex h-[100dvh] w-full flex-col bg-base-0">
      <EditorFrame modelId={id} loadUrl={loadUrl} />
    </div>
  );
}
