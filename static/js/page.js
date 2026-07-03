/* ═══════════════════════════════════════════════════════
   ZoneStay 지점 페이지 공통 상호작용 (모든 지점 HTML에서 로드)
   ─ 스크롤 위치에 따라 상단 내비 링크 강조
   ─ ESC 키로 모바일 메뉴 닫기
   router.js 가 SPA 전환 후 <body>의 <script>를 재실행하므로,
   매 페이지 전환마다 새 섹션 기준으로 다시 바인딩된다.
   (IIFE 로 감싸 전역 오염 방지)
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // ── 스크롤 네비 강조 ──
  var sections = document.querySelectorAll('section[id]');
  var navLinks = document.querySelectorAll('.nav-links a');
  if (sections.length && 'IntersectionObserver' in window) {
    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        navLinks.forEach(function (a) { a.style.color = ''; });
        var active = document.querySelector('.nav-links a[href="#' + e.target.id + '"]');
        if (active) active.style.color = 'var(--text)';  // --ink 는 --text 별칭이라 라이트 테마도 동일
      });
    }, { threshold: 0.3 });
    sections.forEach(function (s) { obs.observe(s); });
  }

  // ── ESC 로 모바일 메뉴 닫기 ──
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var m = document.getElementById('mobileNav');
      if (m) m.classList.remove('open');
    }
  });
})();
