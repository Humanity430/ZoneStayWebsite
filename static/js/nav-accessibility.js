/* ═══════════════════════════════════════════════════════
   ZoneStay 모바일 내비게이션 접근성
   ─ 열림 상태를 aria-expanded/aria-hidden과 동기화한다.
   ─ 메뉴 안에서 키보드 포커스를 순환시키고 닫을 때 복귀한다.
   SPA 전환 시 기존 리스너를 제거하고 현재 DOM에 다시 바인딩한다.
   ═══════════════════════════════════════════════════════ */
(function () {
  'use strict';

  if (window.__zoneStayNavCleanup) window.__zoneStayNavCleanup();

  var toggle = document.querySelector('.nav-ham');
  var menu = document.getElementById('mobileNav');
  if (!toggle || !menu) return;

  var closeButton = menu.querySelector('.close-btn');
  var menuLinks = [].slice.call(menu.querySelectorAll('a'));
  var previousOverflow = '';

  function focusableItems() {
    return [].slice.call(menu.querySelectorAll('button, a[href]'))
      .filter(function (el) { return !el.disabled && el.offsetParent !== null; });
  }

  function setOpen(open, returnFocus) {
    menu.classList.toggle('open', open);
    menu.setAttribute('aria-hidden', open ? 'false' : 'true');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');

    if (open) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      if (closeButton) closeButton.focus();
      return;
    }

    document.body.style.overflow = previousOverflow;
    if (returnFocus !== false) toggle.focus();
  }

  function onToggle() { setOpen(true, false); }
  function onClose() { setOpen(false); }
  function onLink() { setOpen(false, false); }
  function onKeydown(event) {
    if (menu.getAttribute('aria-hidden') === 'true') return;

    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      return;
    }

    if (event.key !== 'Tab') return;
    var items = focusableItems();
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  toggle.addEventListener('click', onToggle);
  if (closeButton) closeButton.addEventListener('click', onClose);
  menuLinks.forEach(function (link) { link.addEventListener('click', onLink); });
  document.addEventListener('keydown', onKeydown);

  window.__zoneStayNavCleanup = function () {
    toggle.removeEventListener('click', onToggle);
    if (closeButton) closeButton.removeEventListener('click', onClose);
    menuLinks.forEach(function (link) { link.removeEventListener('click', onLink); });
    document.removeEventListener('keydown', onKeydown);
    document.body.style.overflow = previousOverflow;
  };
})();
