/* ═══════════════════════════════════════════════════════
   ZoneStay 클라이언트 라우터 (점진적 향상 / progressive enhancement)
   ─ 진짜 파일(index.html · incheon/index.html · siheung/index.html)은
     그대로 두고, 내부 링크 클릭을 fetch로 가로채 본문만 교체 + 페이드 → SPA 느낌.
   ─ 지점은 폴더 구조라 URL이 이미 깔끔하다: /incheon/  /siheung/  (/ = 홈).
     GitHub Pages 가 각 폴더의 index.html 을 자동 서빙하므로 새로고침·직접접속·
     공유가 서버 되짚기 없이 그대로 동작한다.
   ─ fetch/history/DOMParser 미지원 브라우저는 아무 일도 안 함 → 일반 링크 이동.
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  // 필수 API 미지원 → 그냥 일반 링크로 동작
  if (!window.history || !window.fetch || !window.DOMParser || !document.currentScript) return;

  // 이 스크립트(static/js/router.js) 위치로 사이트 루트를 계산.
  // 루트 배포든 프로젝트 서브경로(/repo/)든 자동으로 맞음.
  var SITE_ROOT = new URL('../../', document.currentScript.src);

  // 슬러그 → 실제 파일(사이트 루트 기준 상대경로)
  var SLUG_TO_FILE = {
    '':        'index.html',
    'incheon': 'incheon/index.html',
    'siheung': 'siheung/index.html'
  };

  // 사이트 루트 기준 상대경로 → 슬러그 ('' = 홈), 페이지가 아니면 null
  function slugForRel(rel) {
    rel = rel.split('#')[0].split('?')[0];
    rel = rel.replace(/index\.html$/, '').replace(/\/$/, '');
    if (rel === '') return '';
    if (rel === 'incheon') return 'incheon';
    if (rel === 'siheung') return 'siheung';
    return null; // 정적 자산·외부·미등록 경로
  }
  // 절대 URL → 슬러그 (사이트 밖이면 null)
  function slugForURL(href) {
    var noHash = href.split('#')[0];
    if (noHash.indexOf(SITE_ROOT.href) !== 0) return null;
    return slugForRel(noHash.slice(SITE_ROOT.href.length));
  }
  function currentSlug() { return slugForURL(location.href); }

  // 슬러그 → pushState용 절대 URL (지점은 폴더라 뒤에 슬래시)
  function cleanURL(slug, hash) {
    return SITE_ROOT.href + (slug ? slug + '/' : '') + (hash || '');
  }

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var navigating = false;

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ── <head> 갱신: title + 페이지별 스타일시트 교체 ──
  function updateHead(doc) {
    if (doc.title) document.title = doc.title;
    var newHrefs = [].slice.call(doc.querySelectorAll('head link[rel="stylesheet"]'))
      .map(function (l) { return l.getAttribute('href'); });
    var cur = [].slice.call(document.head.querySelectorAll('link[rel="stylesheet"]'));
    // 새 페이지에만 있는 CSS 추가
    newHrefs.forEach(function (href) {
      if (!cur.some(function (l) { return l.getAttribute('href') === href; })) {
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.setAttribute('href', href);
        document.head.appendChild(link);
      }
    });
    // 새 페이지에 없는 CSS 제거 (폰트 등 공통은 양쪽에 다 있어 유지됨)
    cur.forEach(function (l) {
      if (newHrefs.indexOf(l.getAttribute('href')) === -1) l.remove();
    });
  }

  // ── 교체된 body 안의 <script> 재실행 (innerHTML은 스크립트를 실행 안 함) ──
  function runScripts() {
    var scripts = [].slice.call(document.body.querySelectorAll('script'));
    scripts.forEach(function (old) {
      var s = document.createElement('script');
      for (var i = 0; i < old.attributes.length; i++) {
        s.setAttribute(old.attributes[i].name, old.attributes[i].value);
      }
      // 인라인 스크립트는 IIFE로 감싸 전역 const 재선언 충돌 방지
      if (!old.src) s.textContent = '(function(){' + old.textContent + '\n})();';
      old.parentNode.replaceChild(s, old);
    });
  }

  // ── 실제 DOM 교체 ──
  //   pushState 로 URL(=baseURI)이 먼저 바뀌므로, 주입되는 ../static/·../dorm-images/
  //   같은 상대경로가 새 위치 기준으로 올바르게 해석된다.
  function apply(doc, hash) {
    updateHead(doc);
    document.body.innerHTML = doc.body.innerHTML;
    runScripts();
    var target = hash && document.getElementById(hash.slice(1));
    if (target) target.scrollIntoView();
    else window.scrollTo(0, 0);
  }

  // ── 페이지 이동 ──
  function go(slug, hash, push) {
    if (navigating) return;
    var file = SLUG_TO_FILE[slug];
    if (file == null) { location.href = cleanURL(slug, hash); return; }
    navigating = true;

    fetch(SITE_ROOT.href + file, { headers: { 'X-Requested-With': 'router' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        if (push) history.pushState({ slug: slug }, '', cleanURL(slug, hash));

        var swap = function () { apply(doc, hash); };

        if (document.startViewTransition && !reduceMotion) {
          return document.startViewTransition(swap).finished.catch(function () {});
        }
        if (reduceMotion) { swap(); return; }
        // 폴백: 페이드아웃 → 교체 → 페이드인
        document.body.classList.add('rt-fade');
        return wait(180).then(function () {
          swap();
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              document.body.classList.remove('rt-fade');
            });
          });
        });
      })
      .catch(function () {
        // 실패 시 그냥 일반 이동으로 폴백
        location.href = cleanURL(slug, hash);
      })
      .then(function () { navigating = false; });
  }

  // ── 내부 링크 클릭 가로채기 (HTML·SVG 앵커 모두) ──
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 ||
        e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    var el = e.target;
    var a = el && el.closest ? el.closest('a') : null;
    if (!a) return;
    if (a.target === '_blank' || a.hasAttribute('download')) return;

    // SVG 앵커는 a.href 가 문자열이 아니므로 getAttribute 사용 후 baseURI 로 해석
    var raw = a.getAttribute('href');
    if (!raw) return;
    var abs;
    try { abs = new URL(raw, document.baseURI).href; } catch (err) { return; }

    var hi = abs.indexOf('#');
    var hash = hi >= 0 ? abs.slice(hi) : '';
    var noHash = hi >= 0 ? abs.slice(0, hi) : abs;

    // 사이트 밖(외부 링크·다른 오리진)이면 브라우저 기본 동작
    if (noHash.indexOf(SITE_ROOT.href) !== 0) return;

    var targetSlug = slugForRel(noHash.slice(SITE_ROOT.href.length));
    if (targetSlug === null) return; // 페이지 링크가 아님(자산 등) → 기본 동작

    // 같은 페이지로의 이동
    if (targetSlug === currentSlug()) {
      if (!hash) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      return; // 해시가 있으면 브라우저 기본 스크롤에 맡김
    }

    e.preventDefault();
    go(targetSlug, hash, true);
  });

  // ── 뒤로/앞으로 가기 ──
  window.addEventListener('popstate', function () {
    var slug = currentSlug();
    if (slug !== null) go(slug, location.hash, false);
  });
})();
