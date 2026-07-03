/* ═══════════════════════════════════════════════════════════════════
   ZoneStay 사이트 설정 — 바뀌는 정보는 전부 여기 CONFIG 값만 고치면 됩니다.
   ───────────────────────────────────────────────────────────────────
   ● 가격 · 전화번호 · 카카오톡 링크 · 주소 · 인스타그램을 한곳에 모음.
   ● 각 페이지 HTML은 값을 직접 쓰지 않고 data-* 자리표시자로 받아 채웁니다.
       data-price="compact.price"  → 해당 지점 가격
       data-kakao="incheon"        → 카카오톡 문의 링크/버튼
       data-phone / data-phone-link→ 전화번호 표시 / tel: 링크
       data-address                → 지점 주소
   ● router.js 가 페이지 전환 후 이 스크립트를 다시 실행하므로,
     매 전환마다 새 지점 기준으로 값이 다시 채워집니다. (IIFE 로 전역 오염 방지)
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CONFIG = {
    // ── 공통 ────────────────────────────────────────────────────────
    phone: '0502-1929-2939', // 대표 전화 (두 지점 공통)

    // 인스타그램 — 지금은 노출 안 함(HTML에서도 주석 처리해 둠).
    // 살릴 때: enabled 를 true 로 바꾸고, 각 페이지의 인스타 마크업 주석을 해제.
    instagram: {
      handle: '@zonestay.kr',
      url: 'https://www.instagram.com/zonestay.kr/',
      enabled: false
    },

    // ── 지점별 정보 ─────────────────────────────────────────────────
    branches: {
      incheon: {
        kakao: 'http://pf.kakao.com/_xehFxfX',
        address: '인천광역시 미추홀구 신세계빌딩 4층',
        prices: {
          heroFrom: '월 40만원부터',
          // low/high 는 객실 설명 문장 속 호실별 가격, table 은 비교표 셀
          compact:  { price: '월 40~45만원', table: '40~45만원', low: '40만원', high: '45만원' },
          standard: { price: '월 50~55만원', table: '50~55만원', low: '50만원', high: '55만원' },
          large:    { price: '월 60만원',    table: '60만원' }
        }
      },
      siheung: {
        kakao: 'http://pf.kakao.com/_KqFxfX',
        address: '경기도 시흥시 월곶동 존스테이 원룸텔 4층',
        prices: {
          heroFrom: '월 40만원부터',
          ocean: { price: '월 55만원' },
          suite: { price: '월 65만원' },
          twin:  { price: '월 55만원' },
          value: { price: '월 40~45만원', low: '40만원', high: '45만원' }
        }
      }
    }
  };

  /* ── 이하 렌더링 로직 (보통 손댈 일 없음) ─────────────────────────── */

  // 현재 지점 판별: nav 의 data-branch, 없으면 URL 경로로 추론
  function currentBranch() {
    var marker = document.querySelector('[data-branch]');
    var b = marker && marker.getAttribute('data-branch');
    if (b) return b;
    var p = location.pathname;
    if (p.indexOf('siheung') !== -1) return 'siheung';
    if (p.indexOf('incheon') !== -1) return 'incheon';
    return null;
  }

  // 점 표기 경로로 중첩 값 꺼내기 ('compact.price' → prices.compact.price)
  function dig(obj, path) {
    return path.split('.').reduce(function (o, k) {
      return (o == null) ? undefined : o[k];
    }, obj);
  }

  function each(sel, fn) {
    [].forEach.call(document.querySelectorAll(sel), fn);
  }

  function render() {
    var digits = CONFIG.phone.replace(/[^0-9]/g, '');

    // 전화 — 표시 텍스트 / tel: 링크 (지점 무관 공통)
    each('[data-phone]', function (el) { el.textContent = CONFIG.phone; });
    each('[data-phone-link]', function (el) { el.setAttribute('href', 'tel:' + digits); });

    var key = currentBranch();
    var branch = key && CONFIG.branches[key];
    if (!branch) return; // 지점 페이지가 아니면 여기까지 (전화만 반영)

    // 주소
    each('[data-address]', function (el) { el.textContent = branch.address; });

    // 가격 — 값이 있으면 덮어쓰고, 없으면 HTML 기본값(폴백) 유지
    each('[data-price]', function (el) {
      var v = dig(branch.prices, el.getAttribute('data-price'));
      if (v != null) el.textContent = v;
    });

    // 카카오톡 문의 — 링크(<a>)면 href, 버튼(<button>)이면 클릭 시 새 탭 열기
    each('[data-kakao]', function (el) {
      var url = branch.kakao;
      if (!url) return;
      if (el.tagName === 'A') {
        el.setAttribute('href', url);
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
      } else {
        el.style.cursor = 'pointer';
        el.onclick = function () { window.open(url, '_blank', 'noopener'); };
      }
    });
  }

  render();
})();
