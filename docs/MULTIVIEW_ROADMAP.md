# Multi-view 파이프라인 로드맵

## 현재 상태 (2026-04)

TRELLIS.2 HF Space 는 `multiimages` 파라미터를 노출하지 않음 (UI 만 존재).
Zero123++ / LGM / Hunyuan3D-2mini-Turbo 공개 Space 는 접근 제한 또는 Runtime Error.

## 설계 (구현 대기)

```
사용자 사진 1장
  ↓
  [옵션 A] Zero123++ Space (사용 가능 시)
     → 6 뷰 생성 (4s on H100)
  ↓
  [옵션 B] MV-Adapter (ICCV 2025)
     → 4 뷰 생성 (SDXL 기반)
  ↓
  TRELLIS v1 (multi-image 모드 O) — multiimages=[view1..viewN]
     또는
  TRELLIS.2 (Microsoft 가 `multiimages` 공개 시)
  ↓
  .glb (뒷면 hallucination 최소)
```

## 예상 품질 효과

| 항목 | 단일뷰 | Multi-view (6뷰) |
|---|---|---|
| 앞면 | 양호 | 양호 |
| 뒷면 | **환각 blob** | 실제 뷰 기반 재구성 |
| 측면 대칭성 | 취약 | 강함 |
| 토폴로지 | 복잡한 객체에서 깨짐 | 훨씬 안정 |

## 실행 조건 (이 중 하나 충족 시 활성화)

1. Zero123++ 공개 Space 재가동
2. microsoft/TRELLIS.2 가 `multiimages` 파라미터 노출
3. 또는 Modal/HF 에 직접 Zero123++ 호스팅 (weights: sudo-ai/zero123plus-v1.2)

## 구현 비용 추정

- HF Space wrapper 수정: 2시간
  - Zero123++ 호출 단계 추가
  - 뷰 저장 + TRELLIS 로 전달
- 테스트: 1시간
- 총 3시간
