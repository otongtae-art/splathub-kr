# SplatHub-KR 아키텍처 요약

> 원본 전체 플랜은 `~/.claude/plans/vast-prancing-fog.md` 참조. 이 문서는 프로젝트 저장소에 상주하는 짧은 버전.

## 데이터 흐름 (v1)

```
사용자 브라우저
  │  (1) /capture: getUserMedia → 가이드 오버레이 → 자동 캡처
  │  (2) /convert: 드래그앤드롭 이미지/영상 업로드
  ▼
Cloudflare Pages (Next.js 15)
  ├─ lib/capture/ 에서 blur·pHash·EXIF 전처리
  ├─ /api/upload/presign → R2 presigned PUT
  └─ /api/jobs → Supabase Postgres insert → Upstash queue
                                              │
   ┌──────────────────────────────────────────┤
   │ Ladder of Free GPU (순차 fallback)       │
   ▼                                          │
  1. HF Space ZeroGPU (worker/hf-space)       │
  2. Modal $30/월 크레딧 (worker/modal)       │
  3. Replicate on-demand                      │
  4. Brush WebGPU (client-side, /convert/local)
   │
   ▼
   VGGT-1B-Commercial → FreeSplatter → @playcanvas/splat-transform
   → .spz 파일 R2 업로드 → callback → Supabase Realtime broadcast
   → 브라우저 Spark.js 뷰어 로드
```

## 핵심 모듈

| 경로 | 역할 |
| --- | --- |
| `apps/web/app/capture` | 웹캠/카메라 실시간 캡처 UI |
| `apps/web/app/convert` | 이미지/영상 파일 업로드 변환 |
| `apps/web/app/m/[slug]` | 모델 상세 뷰어 페이지 |
| `apps/web/app/api/jobs/route.ts` | GPU Ladder dispatch |
| `apps/web/components/viewer/GaussianSplatViewer.tsx` | Spark.js + Three.js 래퍼 |
| `apps/web/lib/capture/{blur,phash,exif}.ts` | 클라이언트 품질 게이트 |
| `worker/hf-space/app.py` | HF Space Gradio 파이프라인 |
| `worker/modal/app.py` | Modal fallback 파이프라인 |

## 상태 머신

`queued → preprocessing → pose_estimation → training → postprocessing → uploading → done / failed / canceled`

## 고정비 0원 원칙

- 월 구독형 서비스에 카드 등록 금지
- Modal 신규 $30 크레딧만 사용, 소진 시 사용자에게 "내일 다시" 응답
- Supabase Free는 1주 미사용 paused → GitHub Actions `db-heartbeat.yml`로 매일 heartbeat
- 매일 `infra/scripts/cost-check.ts` cron으로 당월 청구액 > $0.50 시 알림
