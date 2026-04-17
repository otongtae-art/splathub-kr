# Third-party Attribution

이 프로젝트는 다음 오픈소스 구성요소를 사용합니다. 상업 사용 가부와 라이선스는 `~/.claude/plans/vast-prancing-fog.md` §10 매트릭스 참조.

## 핵심 구성요소 (상업 사용 가능)

| 구성요소 | 라이선스 | 저장소 |
| --- | --- | --- |
| SuperSplat (에디터 fork 원본) | MIT | https://github.com/playcanvas/supersplat |
| Spark.js (.ply/.spz 뷰어) | MIT | https://github.com/sparkjsdev/spark |
| `@playcanvas/splat-transform` (포맷 변환 CLI) | MIT | https://www.npmjs.com/package/@playcanvas/splat-transform |
| VGGT-1B-Commercial (pose/depth) | Meta Commercial | https://github.com/facebookresearch/vggt |
| FreeSplatter (Gaussian 생성) | Apache 2.0 | https://github.com/TencentARC/FreeSplatter |
| gsplat (Phase 2 유료 학습) | Apache 2.0 | https://github.com/nerfstudio-project/gsplat |
| Brush (클라이언트 WebGPU 학습 폴백) | Apache 2.0 | https://github.com/ArthurBrussee/brush |
| RMBG-1.4 (배경 제거) | MIT | https://huggingface.co/briaai/RMBG-1.4 |

## 사용 금지 목록

비상업(CC BY-NC / Academic Only) 라이선스로 상업 서비스에서 쓸 수 없는 대안들:

- VGGT-1B (기본 가중치, 상업판 아님) → VGGT-1B-Commercial 사용
- RMBG-2.0 → RMBG-1.4 사용
- Splatt3R (CC BY-NC) → FreeSplatter 사용
- graphdeco-inria 원본 3DGS (비상업) → gsplat 사용

## CI 차단

`.github/workflows/ci.yml` 의 `license-guard` job이 `pnpm ls --json` + `pip list --format=json` 을 파싱해 이 금지 목록에 해당하는 패키지가 dependency tree에 올라오면 빌드 실패.

## 사용자 생성 콘텐츠(UGC) 라이선스

- 무료 변환으로 만든 결과물 기본 라이선스: **CC BY-NC 4.0** — 상업 사용 불가, 저작자 표시 + 비상업 목적 한정
- 크리에이터가 개별 모델의 라이선스를 **CC BY 4.0** 또는 **CC0 1.0**으로 업그레이드 가능
- Phase 2 유료 학습 결과물: 크리에이터가 완전 소유, `allow_commercial=true` 시 상업 라이선스 판매 가능
