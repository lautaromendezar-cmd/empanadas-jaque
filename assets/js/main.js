/* ============================================================
   Jaque Empanadas — comportamiento del sitio
   Sin dependencias, sin build. No es un módulo a propósito:
   así también funciona abriendo el index.html con doble clic.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------
     1. Año del footer
     --------------------------------------------------------- */
  var yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------------------------------------------------------
     2. Reveals al hacer scroll
     El CSS sólo los oculta si <html> tiene la clase js, que la
     pone un script inline en el <head>. Si algo de acá falla,
     igual se ven: este bloque sólo agrega la clase "in".
     --------------------------------------------------------- */
  var reveals = $$('.reveal');
  if (!('IntersectionObserver' in window) || reduced) {
    reveals.forEach(function (el) { el.classList.add('in'); });
  } else {
    var revObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); revObserver.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    reveals.forEach(function (el) { revObserver.observe(el); });
    // Red de seguridad: si algo quedara sin disparar, a los 4s se muestra todo.
    setTimeout(function () { reveals.forEach(function (el) { el.classList.add('in'); }); }, 4000);
  }

  /* ---------------------------------------------------------
     3. Header: estado "pegado" + barra de progreso
     --------------------------------------------------------- */
  var header = $('#header');
  var progress = $('#progress');
  var toTop = $('#to-top');
  var actionBar = $('#action-bar');
  var hero = $('#inicio');

  function onScroll() {
    var y = window.pageYOffset || document.documentElement.scrollTop;
    var stuck = y > 40;
    header.classList.toggle('is-stuck', stuck);
    document.body.classList.toggle('is-stuck', stuck);

    var max = document.documentElement.scrollHeight - window.innerHeight;
    if (progress) progress.style.width = (max > 0 ? (y / max) * 100 : 0) + '%';

    if (toTop) toTop.classList.toggle('is-on', y > 700);
    if (actionBar) {
      var heroBottom = hero ? hero.offsetTop + hero.offsetHeight - 120 : 400;
      actionBar.classList.toggle('is-on', y > heroBottom);
    }
  }

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (!ticking) {
      window.requestAnimationFrame(function () { onScroll(); spy(); ticking = false; });
      ticking = true;
    }
  }, { passive: true });

  if (toTop) {
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    });
  }

  /* ---------------------------------------------------------
     4. Menú mobile
     --------------------------------------------------------- */
  var burger = $('#burger');
  var nav = $('#nav');
  var backdrop = $('#backdrop');

  function setNav(open) {
    nav.classList.toggle('is-open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Cerrar menú de navegación' : 'Abrir menú de navegación');
    document.body.classList.toggle('nav-open', open);
    if (open) {
      backdrop.hidden = false;
      requestAnimationFrame(function () { backdrop.classList.add('is-on'); });
    } else {
      backdrop.classList.remove('is-on');
      setTimeout(function () { backdrop.hidden = true; }, 300);
    }
  }

  if (burger && nav && backdrop) {
    burger.addEventListener('click', function () {
      setNav(burger.getAttribute('aria-expanded') !== 'true');
    });
    backdrop.addEventListener('click', function () { setNav(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') {
        setNav(false);
        burger.focus();
      }
    });
    $$('a', nav).forEach(function (a) {
      a.addEventListener('click', function () { setNav(false); });
    });
    // Si se agranda la ventana con el panel abierto, lo cerramos.
    window.addEventListener('resize', function () {
      if (window.innerWidth > 1024 && burger.getAttribute('aria-expanded') === 'true') setNav(false);
    });
  }

  /* ---------------------------------------------------------
     5. Scrollspy — marca la sección visible en el nav
     --------------------------------------------------------- */
  var navLinks = $$('.nav-list a');
  var sections = navLinks
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);
  var currentId = '';

  function spy() {
    if (!sections.length) return;
    var probe = (window.pageYOffset || document.documentElement.scrollTop) + (header.offsetHeight + 40);
    var active = sections[0];
    for (var i = 0; i < sections.length; i++) {
      if (sections[i].offsetTop <= probe) active = sections[i];
    }
    // Cerca del final siempre gana la última sección.
    if (window.innerHeight + window.pageYOffset >= document.documentElement.scrollHeight - 60) {
      active = sections[sections.length - 1];
    }
    if (active.id === currentId) return;
    currentId = active.id;
    navLinks.forEach(function (a) {
      var on = a.getAttribute('href') === '#' + currentId;
      if (on) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }

  /* Actualiza el hash sin que el navegador pegue el salto */
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id.length < 2) return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      var top = target.getBoundingClientRect().top + window.pageYOffset - (header.offsetHeight - 1);
      window.scrollTo({ top: top, behavior: reduced ? 'auto' : 'smooth' });
      if (history.replaceState) history.replaceState(null, '', id);
      // Deja el foco en la sección para quien navega con teclado.
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    });
  });

  /* ---------------------------------------------------------
     6. Menú: filtros por categoría + buscador
     --------------------------------------------------------- */
  var chips = $$('.chip');
  var groups = $$('.menu-group');
  var items = $$('.price-item');
  var input = $('#menu-q');
  var clearBtn = $('#menu-q-clear');
  var emptyMsg = $('#menu-empty');
  var filter = 'all';

  function norm(s) {
    return (s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  }

  function applyMenu() {
    var q = norm(input ? input.value.trim() : '');
    var visible = 0;

    groups.forEach(function (g) {
      var groupOn = (filter === 'all' || filter === g.dataset.group);
      var shown = 0;

      $$('.price-item', g).forEach(function (it) {
        var hay = norm(it.dataset.name + ' ' + it.textContent);
        var match = groupOn && (!q || hay.indexOf(q) !== -1);
        it.hidden = !match;
        it.classList.toggle('is-hit', !!q && match);
        if (match) shown++;
      });

      g.hidden = shown === 0;
      visible += shown;
    });

    if (emptyMsg) emptyMsg.hidden = visible !== 0;
    if (clearBtn) clearBtn.hidden = !q;
  }

  chips.forEach(function (chip) {
    chip.addEventListener('click', function () {
      filter = chip.dataset.filter;
      chips.forEach(function (c) {
        var on = c === chip;
        c.classList.toggle('is-active', on);
        c.setAttribute('aria-selected', String(on));
      });
      applyMenu();
    });
  });

  if (input) {
    input.addEventListener('input', applyMenu);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { input.value = ''; applyMenu(); }
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      input.value = '';
      applyMenu();
      input.focus();
    });
  }

  /* ---------------------------------------------------------
     7. Abierto / cerrado, en hora de Buenos Aires
     Miércoles a domingo de 19:30 a 22:45. Lunes y martes cerrado.
     --------------------------------------------------------- */
  var SCHEDULE = {
    0: [1170, 1365],  // domingo
    1: null,          // lunes
    2: null,          // martes
    3: [1170, 1365],
    4: [1170, 1365],
    5: [1170, 1365],
    6: [1170, 1365]
  };
  var DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  function nowInBA() {
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Argentina/Buenos_Aires',
        weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
      }).formatToParts(new Date());
      var map = {};
      parts.forEach(function (p) { map[p.type] = p.value; });
      var wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[map.weekday];
      var h = parseInt(map.hour, 10) % 24;
      return { day: wd, minutes: h * 60 + parseInt(map.minute, 10) };
    } catch (err) {
      var d = new Date();
      return { day: d.getDay(), minutes: d.getHours() * 60 + d.getMinutes() };
    }
  }

  function hhmm(mins) {
    var h = Math.floor(mins / 60), m = mins % 60;
    return h + ':' + (m < 10 ? '0' : '') + m;
  }

  function computeStatus() {
    var now = nowInBA();
    var today = SCHEDULE[now.day];

    if (today && now.minutes >= today[0] && now.minutes < today[1]) {
      return { open: true, text: 'Abierto ahora · hasta las ' + hhmm(today[1]) };
    }
    if (today && now.minutes < today[0]) {
      return { open: false, text: 'Cerrado · abre hoy a las ' + hhmm(today[0]) };
    }
    for (var i = 1; i <= 7; i++) {
      var d = (now.day + i) % 7;
      if (SCHEDULE[d]) {
        var label = (i === 1) ? 'mañana' : 'el ' + DAY_NAMES[d];
        return { open: false, text: 'Cerrado · abre ' + label + ' ' + hhmm(SCHEDULE[d][0]) };
      }
    }
    return { open: false, text: 'Cerrado' };
  }

  var status = computeStatus();
  $$('#status-hero, #status-hours').forEach(function (el) {
    el.hidden = false;
    el.classList.toggle('is-open', status.open);
    el.classList.toggle('is-closed', !status.open);
    var t = $('.status-text', el);
    if (t) t.textContent = status.text;
  });

  // Marca el día de hoy y pinta como cerrados lunes y martes.
  var todayIdx = nowInBA().day;
  $$('.hours-list li').forEach(function (li) {
    if (parseInt(li.dataset.day, 10) === todayIdx) li.classList.add('is-today');
  });

  /* ---------------------------------------------------------
     8. Carrusel de reseñas
     --------------------------------------------------------- */
  var track = $('#reviews-track');
  var prev = $('#rev-prev');
  var next = $('#rev-next');

  if (track && prev && next) {
    var viewport = track.parentElement;

    function step() {
      var card = track.querySelector('.review-card');
      if (!card) return 340;
      return card.getBoundingClientRect().width + 18;
    }
    function syncArrows() {
      var max = viewport.scrollWidth - viewport.clientWidth - 2;
      prev.disabled = viewport.scrollLeft <= 2;
      next.disabled = viewport.scrollLeft >= max;
    }
    prev.addEventListener('click', function () {
      viewport.scrollBy({ left: -step(), behavior: reduced ? 'auto' : 'smooth' });
    });
    next.addEventListener('click', function () {
      viewport.scrollBy({ left: step(), behavior: reduced ? 'auto' : 'smooth' });
    });
    viewport.addEventListener('scroll', syncArrows, { passive: true });
    window.addEventListener('resize', syncArrows);
    syncArrows();
  }

  /* ---------------------------------------------------------
     9. Arranque
     --------------------------------------------------------- */
  onScroll();
  spy();
  applyMenu();

  // Si se entra con un hash, corregimos el offset del header fijo.
  if (location.hash && document.querySelector(location.hash)) {
    setTimeout(function () {
      var t = document.querySelector(location.hash);
      window.scrollTo({ top: t.getBoundingClientRect().top + window.pageYOffset - (header.offsetHeight - 1), behavior: 'auto' });
    }, 60);
  }
})();
