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

  // 파비콘 href 절대화 — pushState로 URL이 바뀐 뒤 브라우저가 상대 href를
  // 새 base 기준으로 재해석해 404를 내는 것을 방지 (head는 교체되지 않으므로)
  var favicon = document.head.querySelector('link[rel="icon"]');
  if (favicon) favicon.setAttribute('href', favicon.href);

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

  // ── 프리페치 캐시: slug → 파싱된 문서(Promise) ──
  //   hover/idle 시 미리 fetch해두면 실제 클릭 시 go()가 캐시를 그대로 써서 즉시 전환된다.
  var docCache = Object.create(null);

  function prefetch(slug) {
    if (slug == null || docCache[slug]) return;
    var file = SLUG_TO_FILE[slug];
    if (file == null) return;
    var docURL = SITE_ROOT.href + file; // 이 문서의 절대 URL — 상대경로 해석 기준
    docCache[slug] = fetch(docURL, { headers: { 'X-Requested-With': 'router' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (html) { return new DOMParser().parseFromString(html, 'text/html'); })
      .then(function (doc) { return warmStyles(doc, docURL); }) // 이 페이지 CSS를 미리 데워둔다
      .catch(function () { delete docCache[slug]; return null; });
  }

  // ── 페이지 안 내부 링크를 유휴 시간에 전부 프리페치 ──
  function idlePrefetchLinks() {
    var links = [].slice.call(document.querySelectorAll('a[href]'));
    links.forEach(function (a) {
      var raw = a.getAttribute('href');
      if (!raw) return;
      var abs;
      try { abs = new URL(raw, document.baseURI).href; } catch (err) { return; }
      var noHash = abs.split('#')[0];
      if (noHash.indexOf(SITE_ROOT.href) !== 0) return;
      var slug = slugForRel(noHash.slice(SITE_ROOT.href.length));
      if (slug === currentSlug()) return; // 현재 페이지는 프리페치 불필요
      prefetch(slug);
    });
  }

  function onIdle(fn) {
    if (window.requestIdleCallback) requestIdleCallback(fn, { timeout: 2000 });
    else setTimeout(fn, 300);
  }

  // ── 새 페이지 스타일시트를 "먼저" 로드 (FOUC 방지 핵심) ──
  //   기존 head에 없는 <link rel=stylesheet>만 추가하고, 전부 load될 때까지 기다린다.
  //   body 교체는 CSS가 적용된 뒤에 일어나므로 "스타일 없는 순간"이 생기지 않는다.
  //   반환: 새 CSS가 모두 로드되면 resolve되는 Promise.
  function ensureStyles(doc) {
    var curHrefs = [].slice.call(document.head.querySelectorAll('link[rel="stylesheet"]'))
      .map(function (l) { return l.getAttribute('href'); });
    var pending = [];
    [].slice.call(doc.querySelectorAll('head link[rel="stylesheet"]')).forEach(function (l) {
      var href = l.getAttribute('href');
      if (!href || curHrefs.indexOf(href) !== -1) return; // 이미 로드됨(공통·폰트 등)
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.setAttribute('href', href);
      pending.push(new Promise(function (resolve) {
        link.onload = link.onerror = resolve;
        setTimeout(resolve, 1500); // 느리거나 실패해도 내비가 멈추지 않게 안전장치
      }));
      document.head.appendChild(link);
    });
    return Promise.all(pending);
  }

  // ── 이전 페이지 전용 스타일시트 제거 ──
  //   반드시 body 교체 "뒤"에 호출해야 한다(먼저 지우면 옛 화면이 잠깐 깨진다).
  function pruneStyles(doc) {
    var keep = [].slice.call(doc.querySelectorAll('head link[rel="stylesheet"]'))
      .map(function (l) { return l.getAttribute('href'); });
    [].slice.call(document.head.querySelectorAll('link[rel="stylesheet"]')).forEach(function (l) {
      if (keep.indexOf(l.getAttribute('href')) === -1) l.remove();
    });
  }

  // ── 프리페치 시 CSS도 캐시에 미리 데워두기 → 첫 클릭에서도 ensureStyles가 즉시 resolve ──
  //   중요: 상대 href를 "그 문서의 URL(baseURL)" 기준으로 절대화한다.
  //   홈은 static/…, 지점은 ../static/… 을 쓰므로, 현재 페이지 위치로 해석하면 404가 난다.
  var warmed = Object.create(null);
  function warmStyles(doc, baseURL) {
    if (!doc) return doc;
    [].slice.call(doc.querySelectorAll('head link[rel="stylesheet"]')).forEach(function (l) {
      var raw = l.getAttribute('href');
      if (!raw) return;
      var abs;
      try { abs = new URL(raw, baseURL).href; } catch (e) { return; }
      if (warmed[abs]) return;
      warmed[abs] = true;
      var link = document.createElement('link');
      link.rel = 'prefetch';
      link.as = 'style';
      link.href = abs; // 절대 URL → 현재 페이지 위치와 무관하게 정확
      document.head.appendChild(link);
    });
    return doc;
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
    if (doc.title) document.title = doc.title;
    document.body.innerHTML = doc.body.innerHTML;
    pruneStyles(doc); // 새 CSS는 ensureStyles로 이미 로드됨 → 이제 옛 CSS 정리
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
    prefetch(slug); // 아직 캐시에 없으면 지금 시작 (있으면 no-op)

    docCache[slug]
      .then(function (doc) {
        if (!doc) throw new Error('prefetch failed');
        delete docCache[slug]; // 소비 후 무효화: 재방문 시 최신 내용을 다시 받는다
        if (push) history.pushState({ slug: slug }, '', cleanURL(slug, hash));

        // 새 페이지 CSS를 먼저 로드한 뒤에만 body를 교체 → FOUC(스타일 깨짐) 없음
        return ensureStyles(doc).then(function () {
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

  // ── 호버/터치 시 프리페치: 클릭하기 전에 미리 받아둬서 클릭 순간 즉시 전환되게 ──
  document.addEventListener('mouseover', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var raw = a.getAttribute('href');
    if (!raw) return;
    var abs;
    try { abs = new URL(raw, document.baseURI).href; } catch (err) { return; }
    var slug = slugForURL(abs.split('#')[0]);
    if (slug !== currentSlug()) prefetch(slug);
  }, { passive: true });
  document.addEventListener('touchstart', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    var raw = a.getAttribute('href');
    if (!raw) return;
    var abs;
    try { abs = new URL(raw, document.baseURI).href; } catch (err) { return; }
    var slug = slugForURL(abs.split('#')[0]);
    if (slug !== currentSlug()) prefetch(slug);
  }, { passive: true });

  // ── 유휴 시간에 현재 페이지에서 보이는 내부 링크 전부 프리페치 ──
  onIdle(idlePrefetchLinks);
})();
