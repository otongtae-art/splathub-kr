# Round 16 — 2026-04-25 KST

## 진단

R15 환경 사전 체크는 어두움만 잡음. 그러나 photogrammetry 의 또 다른 본질적
실패 모드: **textureless 환경** (단색 벽, 무늬 없는 배경).

원리:
- Photogrammetry 는 사진 간 feature point 매칭으로 카메라 위치 추정
- 단색 벽 → feature point 0개 → 매칭 불가 → VGGT 가 카메라 포즈 못 잡음
- 결과: 사진은 멀쩡한데 3D 가 이상하게 나옴 (또는 reconstruction 실패)

이건 어두움보다 더 심각한 실패 — 밝아도 textureless 면 절대 작동 안 함.
사전 감지 가치 ↑.

## 개선

### 1. envCheck state 확장
```ts
{
  state: 'pending' | 'ready';
  issues: ('dim' | 'low_texture')[];
  avgBrightness: number;
  avgFeatures: number;
} | null
```

### 2. Sample 로직 확장
- 기존 5회 brightness sample 옆에 detectFeatures(video, { max: 80, width: 200 }) 추가
- 200px 다운스케일 + max 80 → ~30ms/회 → 5회 = 150ms 추가
- features.length 를 featCounts 배열에 push

### 3. 임계값
- avgBrightness < 60 → 'dim' (R15 기존)
- avgFeatures < 20 → 'low_texture'
- 일반 객체 장면은 200px 에서 ~50-80 features 검출됨

### 4. Banner 메시지 분기
```ts
if (issues.length === 2) → "환경 부적합 — 밝기 X, 특징점 Y"
if (issues == ['low_texture']) → "🎨 질감 부족 — 평균 특징점 X개"
if (issues == ['dim']) → "💡 환경이 어둡습니다 (밝기 X)"
```

설명 메시지도 분기:
- 둘 다: "단색 벽 + 어두운 환경 — photogrammetry 가 카메라 위치를 추정하지 못합니다"
- texture 만: "단색 벽/무늬 없는 배경은 photogrammetry 가 카메라 위치 추정 실패"
- dim 만: 기존 R15 메시지

## 검증

- `npm run build` ✓
- `/capture` 12.4 → 12.7 kB (+0.3)
- TS strict 통과
- detectFeatures 추가 비용 ~150ms (1초 윈도우 안)

## 배포

✅ Git commit + push → Vercel 자동 배포

## 환경 사전 체크 매트릭스

| 환경 | 밝기 | 특징점 | 결과 |
|---|---|---|---|
| 정상 객체 + 밝은 실내 | 200+ | 50+ | banner 안 뜸 |
| 어두운 실내 | <60 | 50+ | 'dim' banner |
| 단색 벽 | 200+ | <20 | 'low_texture' banner |
| 어둠 + 단색 | <60 | <20 | 둘 다 banner |

## 다음 라운드 후보

- 결과 페이지 R7 dropped 사진 미리보기
- 셔터 흰 플래시 오버레이
- 환경 ok 시작은 작은 ✓ 아이콘으로 reassurance (현재 silent pass)
- HF Space env 활성화 도구 (R4 unblock)
