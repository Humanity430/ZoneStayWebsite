/* ═══════════════════════════════════════════════════════
   ZoneStay 홈 지도 팬·줌(끌어서 이동 + 확대/축소) — 점진적 향상
   ─ world(1430×895)가 viewBox(1000×620) 창보다 크므로, #map-world 의
     translate(=카메라)를 끌어서 가려진 주변부를 볼 수 있게 한다.
   ─ 줌: 휠(커서 기준)·더블클릭·± 버튼. 범위 1×~2.2×.
     핀은 역스케일로 화면 크기를 유지하고, 지명 라벨은 절반만 커진다(z^0.5).
   ─ JS가 없어도 마크업의 기본 translate로 두 지점 핀은 항상 보인다.
     (힌트 칩·줌 버튼도 JS가 있을 때만 표시)
   ─ 라우터(router.js)가 body를 통째로 교체한 뒤 이 스크립트를 재실행하므로
     (runScripts) 전역 오염 없이 매번 새 DOM에 멱등 초기화한다.
   ─ 핀(<a>) 클릭은 라우터의 document 버블 리스너가 처리한다. 드래그로 판정되면
     svg의 캡처 단계에서 클릭을 삼켜 오내비게이션을 막는다.
   ─ 좌표계·경계 계산 규칙: docs/map-design-principles.md
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var svg = document.querySelector('.map-wrap svg');
  var world = svg && svg.querySelector('#map-world');
  if (!svg || !world || svg.dataset.panReady) return;
  svg.dataset.panReady = '1';

  var VB    = { w: 1000, h: 620 };   // viewBox 창 크기
  var WORLD = { w: 1430, h: 895 };   // world(지도 전체) 크기
  var ZMIN = 1, ZMAX = 2.2;          // 줌 범위 — "약도"이므로 과한 확대는 두지 않는다
  var DRAG_THRESHOLD = 5;            // px — 이 이상 움직여야 드래그로 판정(클릭 보호)
  var RUBBER = 3;                    // 경계 밖 저항 배율 (이동량의 1/3만 반영)
  var GLIDE_MS = 520;                // 관성·복귀 애니메이션 길이
  var ZOOM_MS  = 280;                // 버튼·더블클릭 줌 애니메이션 길이
  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 현재 카메라 — 마크업 기본값에서 읽는다 (translate는 viewBox 단위, scale은 z)
  var m = /translate\(\s*(-?[\d.]+)[ ,]+(-?[\d.]+)/.exec(world.getAttribute('transform') || '');
  var tx = m ? parseFloat(m[1]) : 0;
  var ty = m ? parseFloat(m[2]) : 0;
  var z  = 1;

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // ── 역스케일 대상: 핀은 화면 크기 고정(z^-1), 라벨·배지는 부분 확대(z^-0.5~0.65) ──
  var counterEls = [];
  [].forEach.call(svg.querySelectorAll('a.pin-link'), function (a) {
    var p = a.querySelector('.pulse');
    if (p) counterEls.push({ el: a, ax: +p.getAttribute('cx'), ay: +p.getAttribute('cy'), pow: 1 });
  });
  [].forEach.call(svg.querySelectorAll('text.district, text.ref-label'), function (t) {
    counterEls.push({ el: t, ax: +t.getAttribute('x'), ay: +t.getAttribute('y'), pow: 0.5 });
  });
  [].forEach.call(svg.querySelectorAll('text.ic-label, text.road-name'), function (t) {
    counterEls.push({ el: t, ax: +t.getAttribute('x'), ay: +t.getAttribute('y'), pow: 0.6 });
  });
  // 도로 번호 배지: 앵커를 data-cs="x y"로 명시 (자식들이 절대좌표라 라벨과 같은 공식 사용)
  [].forEach.call(svg.querySelectorAll('g.badge[data-cs]'), function (g) {
    var p = g.getAttribute('data-cs').split(' ');
    counterEls.push({ el: g, ax: +p[0], ay: +p[1], pow: 0.65 });
  });
  function applyCounterScale() {
    counterEls.forEach(function (c) {
      if (z === 1) { c.el.removeAttribute('transform'); return; }
      var k = Math.pow(z, -c.pow);
      c.el.setAttribute('transform',
        'translate(' + c.ax + ' ' + c.ay + ') scale(' + k.toFixed(4) + ') translate(' + -c.ax + ' ' + -c.ay + ')');
    });
  }

  function setPos(x, y) {
    tx = x; ty = y;
    world.setAttribute('transform',
      'translate(' + x.toFixed(2) + ' ' + y.toFixed(2) + ') scale(' + z.toFixed(4) + ')');
  }

  // ── 보이는 창: preserveAspectRatio="slice"가 잘라내는 부분을 감안 ──
  var view = { scale: 1, vw: VB.w, vh: VB.h, visX: 0, visY: 0, left: 0, top: 0 };
  function updateView() {
    var r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    view.scale = Math.max(r.width / VB.w, r.height / VB.h); // slice: 큰 쪽에 맞춰 확대
    view.vw = r.width / view.scale; view.vh = r.height / view.scale;
    view.visX = (VB.w - view.vw) / 2; view.visY = (VB.h - view.vh) / 2;
    view.left = r.left; view.top = r.top;
  }
  // 팬 한계 — 보이는 창이 항상 world(×z) 안에 들도록
  function boundsFor(zz) {
    return {
      maxX: view.visX, minX: view.visX + view.vw - WORLD.w * zz,
      maxY: view.visY, minY: view.visY + view.vh - WORLD.h * zz
    };
  }
  function reclamp() {
    var b = boundsFor(z);
    setPos(clamp(tx, b.minX, b.maxX), clamp(ty, b.minY, b.maxY));
  }
  // 화면 px → viewBox 좌표
  function toViewBox(px, py) {
    return { x: view.visX + (px - view.left) / view.scale,
             y: view.visY + (py - view.top) / view.scale };
  }

  // 경계 밖으로 끌면 러버밴드 저항
  function rubber(v, lo, hi) {
    if (v < lo) return lo - (lo - v) / RUBBER;
    if (v > hi) return hi + (v - hi) / RUBBER;
    return v;
  }

  var raf = null;
  function cancelAnim() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

  // ── 관성 + 경계 복귀: 목표점까지 ease-out cubic ──
  function glideTo(x, y) {
    cancelAnim();
    var b = boundsFor(z);
    var x1 = clamp(x, b.minX, b.maxX), y1 = clamp(y, b.minY, b.maxY);
    if (reduceMotion) { setPos(x1, y1); return; }
    var x0 = tx, y0 = ty, t0 = performance.now();
    (function step(now) {
      var p = Math.min(1, (now - t0) / GLIDE_MS);
      var e = 1 - Math.pow(1 - p, 3);
      setPos(x0 + (x1 - x0) * e, y0 + (y1 - y0) * e);
      raf = p < 1 ? requestAnimationFrame(step) : null;
    })(t0);
  }

  // ── 줌: anchor(viewBox 좌표)의 world 지점을 고정한 채 z 변경 ──
  function zoomAt(anchor, zTarget, animate) {
    zTarget = clamp(zTarget, ZMIN, ZMAX);
    if (zTarget === z) return;
    cancelAnim();
    var wx = (anchor.x - tx) / z, wy = (anchor.y - ty) / z; // 고정할 world 지점
    function applyZ(zz) {
      z = zz;
      var b = boundsFor(zz);
      setPos(clamp(anchor.x - wx * zz, b.minX, b.maxX),
             clamp(anchor.y - wy * zz, b.minY, b.maxY));
      applyCounterScale();
      syncZoomButtons();
    }
    if (!animate || reduceMotion) { applyZ(zTarget); return; }
    var z0 = z, t0 = performance.now();
    (function step(now) {
      var p = Math.min(1, (now - t0) / ZOOM_MS);
      var e = 1 - Math.pow(1 - p, 3);
      applyZ(z0 + (zTarget - z0) * e);
      raf = p < 1 ? requestAnimationFrame(step) : null;
    })(t0);
  }
  function visibleCenter() { return { x: VB.w / 2, y: VB.h / 2 }; } // xMidYMid → 항상 창 중앙

  // ── 드래그 ──
  var dragging = false, moved = false, pid = null, suppressClick = false;
  var startX = 0, startY = 0, baseX = 0, baseY = 0;
  var lastX = 0, lastY = 0, lastT = 0, vx = 0, vy = 0; // v: viewBox단위/ms

  svg.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    cancelAnim();
    dragging = true; moved = false; suppressClick = false; pid = e.pointerId;
    startX = lastX = e.clientX; startY = lastY = e.clientY;
    baseX = tx; baseY = ty; vx = vy = 0; lastT = performance.now();
    updateView();
    // 주의: 여기서 setPointerCapture를 걸면 click이 svg로 리타게팅되어
    // 핀(<a>) 클릭을 라우터가 못 받는다 → 드래그 판정 후에만 캡처한다.
  });

  svg.addEventListener('pointermove', function (e) {
    if (!dragging || e.pointerId !== pid) return;
    if (!moved) {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) < DRAG_THRESHOLD) return;
      moved = true;
      svg.classList.add('dragging');
      hideHint();
      try { svg.setPointerCapture(pid); } catch (err) {} // 이제부터는 클릭이 아닌 드래그
    }
    var s = view.scale;
    var now = performance.now(), dt = Math.max(1, now - lastT);
    vx = (e.clientX - lastX) / s / dt;
    vy = (e.clientY - lastY) / s / dt;
    lastX = e.clientX; lastY = e.clientY; lastT = now;
    var b = boundsFor(z);
    setPos(
      rubber(baseX + (e.clientX - startX) / s, b.minX, b.maxX),
      rubber(baseY + (e.clientY - startY) / s, b.minY, b.maxY)
    );
  });

  function endDrag(e) {
    if (!dragging || e.pointerId !== pid) return;
    dragging = false;
    svg.classList.remove('dragging');
    try { svg.releasePointerCapture(pid); } catch (err) {}
    if (!moved) return;
    // 드래그 직후 따라오는 click을 캡처 단계에서 삼킨다(라우터 오내비게이션 방지).
    // pointercancel 등으로 click이 안 오는 경우를 대비해 잠시 후 자동 해제.
    if (e.type === 'pointerup') {
      suppressClick = true;
      setTimeout(function () { suppressClick = false; }, 400);
    }
    // 관성: 놓는 순간 속도만큼 미끄러진 뒤 경계 안으로 정착
    var speed = Math.hypot(vx, vy);
    var k = Math.min(speed, 2.5) / (speed || 1) * 160; // 과속 캡 + 투사 거리(ms 환산)
    glideTo(tx + vx * k, ty + vy * k);
  }
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);

  // 라우터의 document 버블 리스너보다 먼저 실행되도록 캡처 단계에서 차단
  svg.addEventListener('click', function (e) {
    if (suppressClick) {
      suppressClick = false;
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // <a> 핀의 네이티브 드래그(고스트 이미지) 방지
  svg.addEventListener('dragstart', function (e) { e.preventDefault(); });

  // ── 휠 줌 (커서 기준) ──
  svg.addEventListener('wheel', function (e) {
    e.preventDefault();
    updateView();
    zoomAt(toViewBox(e.clientX, e.clientY), z * Math.exp(-e.deltaY * 0.0015), false);
  }, { passive: false });

  // ── 더블클릭 줌 (커서 기준 1.5배) ──
  svg.addEventListener('dblclick', function (e) {
    e.preventDefault();
    updateView();
    zoomAt(toViewBox(e.clientX, e.clientY), z * 1.5, true);
  });

  // ── ± 버튼 (JS가 있을 때만 표시) ──
  var zoomBox = document.querySelector('.map-wrap .map-zoom');
  var btnIn  = zoomBox && zoomBox.querySelector('.zoom-in');
  var btnOut = zoomBox && zoomBox.querySelector('.zoom-out');
  function syncZoomButtons() {
    if (!zoomBox) return;
    btnIn.disabled  = z >= ZMAX - 0.001;
    btnOut.disabled = z <= ZMIN + 0.001;
  }
  if (zoomBox) {
    zoomBox.classList.add('on');
    btnIn.addEventListener('click',  function () { updateView(); zoomAt(visibleCenter(), z * 1.4, true); });
    btnOut.addEventListener('click', function () { updateView(); zoomAt(visibleCenter(), z / 1.4, true); });
    syncZoomButtons();
  }

  // ── 힌트 칩: 첫 드래그 또는 5초 뒤 사라짐 ──
  var hint = document.querySelector('.map-wrap .map-hint');
  var hintTimer = null;
  function hideHint() {
    if (!hint) return;
    clearTimeout(hintTimer);
    hint.classList.remove('show');
    hint = null;
  }
  if (hint) {
    requestAnimationFrame(function () { if (hint) hint.classList.add('show'); });
    hintTimer = setTimeout(hideHint, 5000);
  }

  // 컨테이너 크기가 바뀌면 창·경계 재계산
  function onResize() { updateView(); reclamp(); }
  if (window.ResizeObserver) new ResizeObserver(onResize).observe(svg);
  else window.addEventListener('resize', onResize);
  onResize();
})();
