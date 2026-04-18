/**
 * POST /api/hf-3d — SplatHub TRELLIS Proxy 서버 프록시.
 *
 * 우리가 HF 에 배포한 thin Python wrapper Space (`floerw/splathub-trellis-proxy`)
 * 의 `/api/convert` FastAPI 엔드포인트를 그대로 pass-through.
 *
 * Wrapper Space 내부에서:
 *   Python gradio_client → microsoft/TRELLIS (4-step pipeline) → .glb 반환
 *
 * 우리는 단순히 multipart 바디를 그대로 forward + 결과 proxy.
 * 이 이중 proxy 가 필요한 이유는 CORS — HF Space 가 CORS 를 열지만, 사용자
 * 브라우저가 바로 HF 호출하면 드물게 preflight 이슈가 생긴다. Vercel 서버 경유가
 * 가장 안전.
 */

import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const PROXY_ORIGIN =
  process.env.NEXT_PUBLIC_HF_PROXY_URL || 'https://floerw-splathub-trellis-proxy.hf.space';

export async function POST(req: Request) {
  const t0 = Date.now();

  // multipart 바디를 그대로 thin-proxy Space 로 전달.
  // fetch 가 FormData 를 자동으로 multipart/form-data 로 직렬화.
  let form: FormData;
  try {
    form = await req.formData();
    const image = form.get('image');
    if (!image) throw new Error('missing image field');
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid_input', message: (err as Error).message },
      { status: 400 },
    );
  }

  try {
    const upstream = await fetch(`${PROXY_ORIGIN}/api/convert`, {
      method: 'POST',
      body: form,
      // @ts-expect-error: Node 18+ 의 undici 는 duplex 필요
      duplex: 'half',
    });

    // 업스트림이 비-2xx 면 에러 JSON 그대로 전달
    if (!upstream.ok) {
      const text = await upstream.text();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        /* keep raw */
      }
      const msg =
        (parsed && typeof parsed === 'object' && 'detail' in parsed
          ? JSON.stringify((parsed as { detail: unknown }).detail).slice(0, 500)
          : text.slice(0, 500)) || `upstream ${upstream.status}`;
      const isGpuBusy = /No GPU was available|gpu.*avail/i.test(msg);
      return NextResponse.json(
        {
          error: isGpuBusy ? 'gpu_busy' : 'trellis_error',
          message: msg,
          upstream_status: upstream.status,
          elapsedMs: Date.now() - t0,
        },
        { status: isGpuBusy ? 503 : 502 },
      );
    }

    // 성공: .glb 바이너리를 스트리밍으로 클라이언트에 전달
    const contentType = upstream.headers.get('content-type') || 'model/gltf-binary';
    const glbBytes = await upstream.arrayBuffer();

    return new NextResponse(glbBytes, {
      headers: {
        'content-type': contentType,
        'content-length': String(glbBytes.byteLength),
        'x-trellis-elapsed-ms': String(Date.now() - t0),
        'x-trellis-size':
          upstream.headers.get('x-trellis-size') || String(glbBytes.byteLength),
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: 'proxy_failed',
        message: msg,
        elapsedMs: Date.now() - t0,
      },
      { status: 502 },
    );
  }
}
