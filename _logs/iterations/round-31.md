# Round 31 — 2026-04-25 KST

## 진단

홈페이지 사이드바 '내 모델' 영역은 0개일 때 단순히 "아직 생성한 모델이
없습니다" 만 표시. 새 방문자는:
- "결과가 어떻게 나오는지 모르겠음"
- "내 사진으로 정말 좋은 결과 나올까?"
- 시도 전 expectation 없음 → 클릭 망설임

`/m/sample-butterfly` 가 이미 존재 — 좋은 sample 결과인데 발견 어려움
(URL 로 직접 가야 함, 홈에 link 없음).

## 개선

**'예시 결과 보기 →' CTA** in 사이드바 empty state.

### UI
```jsx
{myModels.length === 0 ? (
  <div>
    <p>아직 생성한 모델이 없습니다.</p>
    <Link href="/m/sample-butterfly"
          className="...border-accent/30 bg-accent/[0.04] ...">
      <Cube /> 예시 결과 보기 →
    </Link>
    <p className="text-[11px] text-base-400">
      실제 사용자 결과가 어떻게 보이는지 미리 확인하세요.
    </p>
  </div>
) : (
  // 기존 모델 리스트
)}
```

특징:
- accent 테두리 + 옅은 background → 친근하지만 강조
- Cube 아이콘으로 3D context
- 보조 설명 1줄 — "왜 클릭해야 하는지" 동기 부여
- 로그인 한 사용자 (myModels > 0) 에겐 안 보임 (정보 노이즈 X)

## 검증

- `npm run build` ✓
- `/` (root) 사이즈는 변동 거의 없음 (작은 조건부 추가)
- TS strict 통과

## 배포

✅ Git commit + push → Vercel 자동 배포

## 사용자 시나리오

이전:
1. 홈 도착 → "사진으로 진짜 3D" 헤드라인 + 두 경로 카드
2. 사이드바 empty: "아직 모델 없음"
3. 사용자 망설임: "음... 시도해볼까? 결과가 어떨지 모르겠는데"

이후:
1. 홈 도착 → 헤드라인
2. 사이드바: "아직 모델 없음" + [예시 결과 보기 →]
3. 클릭 → /m/sample-butterfly 에서 실제 3D 결과 살펴봄
4. "오 이런 거 만들 수 있구나" → /capture 클릭 의도 ↑

## 다음 라운드 후보

- VGGT 통계 확장 패널
- 토글 트랜지션
- 홈페이지 처음 진입 시 R4 활성화 체크 (admin 전용 banner?)
- 공유 링크 OG image 동적 (모델별 thumbnail)
