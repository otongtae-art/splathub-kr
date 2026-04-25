# Round 32 — 2026-04-25 KST

## 진단

VGGT 호출 실패 시 train 페이지의 에러 메시지가 generic:
```
⚠ 이전 학습 실패
{error}
서버 쿼터 소진 가능성 — 다시 시도하거나 잠시 후 재시도해주세요.
```

문제:
- 모든 에러에 같은 advice → 부정확
- '잠시 후' 가 얼마인지 모름
- 사용자가 빈 손으로 떠남 — R19 TRELLIS 폴백은 monster 케이스에만 노출

## 개선

### 1. `classifyVggtError(msg)` 헬퍼 — 5종 분류
| 패턴 | 제목 | Advice |
|---|---|---|
| quota / rate limit / 429 | "ZeroGPU 쿼터 소진" | "다음 갱신까지 ~30분, 또는 1장 AI 시도" |
| timeout / 120 | "120초 GPU 한도 초과" | "사진 25장 이하 + 단순한 객체" |
| CUDA / OOM | "GPU 메모리 부족" | "사진 15-20장으로 줄이기" |
| network / 502/503/504 | "네트워크/서버 오류" | "1분 후 재시도" |
| cancelled / aborted | "요청 중단" | "다시 시도" |
| 그 외 | "학습 실패" | "다시 시도 또는 1장 AI" |

### 2. 에러 banner 에 TRELLIS 폴백 버튼 추가
- 기존 R19: monster (성공 후 sparse) 시에만 노출
- R32: VGGT 완전 실패 케이스에도 노출 — 사용자가 빈 손으로 가지 않게
- '🪄 1장 AI 로 시도 (TRELLIS.2)' 버튼
  - idle / loading / error 상태 표시
  - 이미 trellis done 이면 안 보임 (중복 호출 X)
- '사진 1장 (best sharp) 으로 대신 생성' 보조 설명
  - R20 sharpnessScores 활용 → best shot 자동 선택

## 검증

- `npm run build` ✓
- `/capture/train` 12.2 → 12.7 kB (+0.5)
- TS strict 통과
- shots.length === 0 이면 폴백 버튼 안 보임 (안전)

## 배포

✅ Git commit + push → Vercel 자동 배포

## R5 + R19 + R20 + R32 통합 회복 매트릭스

| 시나리오 | 회복 옵션 |
|---|---|
| VGGT 성공 | (그대로) |
| VGGT monster (R5 detected) | [TRELLIS] [다시 촬영] (R19) |
| VGGT 완전 실패 (quota etc.) | [TRELLIS] [다시 시도] (R32) ← 신규 |
| TRELLIS 도 실패 | "다시 촬영하기" 만 가능 |

→ 거의 모든 실패 경로에서 사용자가 결과물 1개 이상 받을 수 있음.

## 다음 라운드 후보

- VGGT 통계 확장 패널
- Mobile 전용 viewer stats (sm:inline 제거)
- 토글 트랜지션
- 공유 링크 동적 OG image
