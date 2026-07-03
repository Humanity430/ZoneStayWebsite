# ZoneStay 인천점 랜딩 페이지

인천 주안역 도보 5분 코리빙 브랜드 **존스테이** 인천점 소개용 정적 랜딩 페이지입니다.

## 구성

- `index.html` — 단일 페이지 랜딩 (인라인 CSS/JS, 외부 의존성은 CDN 폰트뿐)
- `images/` — 실내·복도·객실·주변 사진 (웹용 최적화)
- `.nojekyll` — GitHub Pages의 Jekyll 처리 비활성화

## 배포

GitHub Pages(Deploy from a branch, `main` / root)로 서빙됩니다.

👉 https://humanity430.github.io/ZoneStayWebsite/

## 로컬 확인

별도 빌드 없이 `index.html`을 브라우저로 열거나, 간단한 정적 서버로 확인할 수 있습니다.

```bash
python3 -m http.server 8000
# → http://localhost:8000
```
