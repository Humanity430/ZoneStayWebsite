# ZoneStay Website (정적 배포)

존스테이 코리빙 브랜드 정적 사이트. GitHub Pages 로 서빙된다.
작업/소스 트리는 별도이며, 이 저장소는 **배포용 정적 파일만** 담는다.

## 구조
- `index.html` — 홈(지점 선택 지도) → `/`
- `incheon/index.html` — 인천점 → `/incheon/`
- `siheung/index.html` — 시흥점 → `/siheung/`
- `static/css`, `static/js` — 공통 스타일(테마·브랜치 레이어)·클라이언트 라우터
- `dorm-images/` — 사진(웹 최적화본)
- `.nojekyll` — Jekyll 처리 비활성

지점을 폴더 구조로 두어 `/incheon/` 같은 clean URL 이 GitHub Pages 에서 그대로 동작한다.
