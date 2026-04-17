'use client';

/**
 * Hugging Face Space 호출 — 단일 이미지 → 3D mesh (.glb).
 *
 * 환경변수 `NEXT_PUBLIC_HF_SPACE_URL` 이 설정되어 있으면 서버 모드(고품질)로
 * 동작한다. 미설정이면 null 을 반환해 호출자가 브라우저 fallback (gen3d)을
 * 쓰도록 한다.
 *
 * Gradio REST API 흐름:
 *   1. POST /gradio_api/call/predict → event_id 반환
 *   2. GET  /gradio_api/call/predict/{event_id} (SSE) → 결과 수신
 *   3. 결과 data[0].url → .glb 파일 URL
 */

export function getHfSpaceUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_HF_SPACE_URL;
  if (!url) return null;
  return url.replace(/\/+$/, '');
}

export type HfSpaceResult = {
  /** 생성된 .glb 파일의 바이트 배열 */
  bytes: Uint8Array;
  /** 파일 타입 */
  fileType: 'glb' | 'obj';
};

/**
 * HF Space predict 호출. 이미지 1장 → .glb 바이트.
 */
export async function callHfSpace(
  image: File,
  options: { removeBg?: boolean; onProgress?: (frac: number, label?: string) => void } = {},
): Promise<HfSpaceResult> {
  const base = getHfSpaceUrl();
  if (!base) throw new Error('HF_SPACE_URL 이 설정되지 않았습니다.');

  options.onProgress?.(0.05, '서버에 이미지 업로드');

  // 1단계: 이미지를 먼저 Gradio 서버에 업로드
  const formData = new FormData();
  formData.append('files', image);
  const uploadRes = await fetch(`${base}/gradio_api/upload`, {
    method: 'POST',
    body: formData,
  });
  if (!uploadRes.ok) {
    throw new Error(`upload_failed_${uploadRes.status}`);
  }
  const uploadPaths = (await uploadRes.json()) as string[];
  const remotePath = uploadPaths[0];
  if (!remotePath) throw new Error('upload returned no paths');

  options.onProgress?.(0.15, 'GPU 변환 요청');

  // 2단계: /call/predict 로 변환 요청
  const predictRes = await fetch(`${base}/gradio_api/call/predict`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      data: [
        {
          path: remotePath,
          meta: { _type: 'gradio.FileData' },
          url: `${base}/gradio_api/file=${remotePath}`,
          orig_name: image.name,
        },
        options.removeBg ?? true,
      ],
    }),
  });
  if (!predictRes.ok) throw new Error(`predict_failed_${predictRes.status}`);
  const predictJson = (await predictRes.json()) as { event_id?: string };
  const eventId = predictJson.event_id;
  if (!eventId) throw new Error('predict no event_id');

  options.onProgress?.(0.2, 'GPU 대기열 + 추론 진행');

  // 3단계: SSE 로 결과 스트림
  const sseRes = await fetch(`${base}/gradio_api/call/predict/${eventId}`);
  if (!sseRes.ok || !sseRes.body) throw new Error(`sse_failed_${sseRes.status}`);

  const reader = sseRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let resultUrl: string | null = null;
  const lastLabel = 'GPU 추론';
  let lastProgress = 0.25;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // SSE 포맷: "event: xxx\ndata: {...}\n\n"
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const ev of events) {
      const lines = ev.split('\n');
      let eventName = '';
      let dataLine = '';
      for (const line of lines) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLine = line.slice(5).trim();
      }
      if (!dataLine) continue;

      if (eventName === 'complete') {
        try {
          const parsed = JSON.parse(dataLine);
          const glbObj = Array.isArray(parsed) ? parsed[0] : parsed;
          if (glbObj?.url) resultUrl = glbObj.url;
          else if (typeof glbObj === 'string') resultUrl = glbObj;
        } catch (e) {
          console.error('[hfSpace] failed to parse complete event', e);
        }
      } else if (eventName === 'heartbeat') {
        lastProgress = Math.min(0.9, lastProgress + 0.05);
        options.onProgress?.(lastProgress, lastLabel);
      } else if (eventName === 'error') {
        throw new Error(`hf_space_error: ${dataLine.slice(0, 200)}`);
      }
    }
  }

  if (!resultUrl) throw new Error('no result url received');

  options.onProgress?.(0.92, '.glb 다운로드');

  // 4단계: 결과 .glb 다운로드
  const glbRes = await fetch(resultUrl);
  if (!glbRes.ok) throw new Error(`glb_download_failed_${glbRes.status}`);
  const arrayBuffer = await glbRes.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);

  options.onProgress?.(1, '완료');

  return {
    bytes,
    fileType: 'glb',
  };
}
