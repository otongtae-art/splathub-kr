# 샘플 모델 디렉토리

이 폴더에는 **재배포 가능한 공개 라이선스** (CC0 / CC-BY / MIT / Apache-2.0) 의
Gaussian Splat 파일만 넣습니다. 파일명은 `lib/samples.ts` 의 `spz_url` 과 일치해야
합니다.

## 권장 체크리스트

1. 원본 저작자와 라이선스를 `docs/LICENSE-NOTICES.md` 에 기록
2. `.spz` 형식 권장 (10배 더 작음). `.ply` 만 있으면 `@playcanvas/splat-transform` CLI 로 변환:
   ```bash
   npx @playcanvas/splat-transform input.ply output.spz --sh-degree 1
   ```
3. 썸네일 `.jpg` (1024x1024 권장) 를 함께 넣어 `/m/[slug]` Open Graph 메타에 사용

## Git 무시 정책

샘플 파일은 저장소에 포함합니다 (대용량이어도 LFS 없이). 사용자가 올린 파일은
R2 / HF Dataset 에 저장되며 저장소에는 들어오지 않습니다 (`.gitignore` 참조).
