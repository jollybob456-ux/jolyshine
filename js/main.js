/* ==========================================================================
   JolyShine — interactions
   Everything that runs per-frame or per-pointer-move is rAF-throttled and only
   touches transform/opacity (or a CSS custom property feeding a transform).
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  /* Coalesce high-frequency events into one update per frame */
  function rafThrottle(fn) {
    var queued = false, lastArgs;
    return function () {
      lastArgs = arguments;
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; fn.apply(null, lastArgs); });
    };
  }

  document.addEventListener('DOMContentLoaded', function () {
    intro();
    splitHeadings();
    reveals();
    header();
    mobileMenu();
    heroCanvas();
    heroSpotlight();
    parallax();
    buttonFill();
    planShine();
    planDeck();
    countUp();
    faq();
    beforeAfter();
    carousel();
    lightbox();
    booking();
    $('#year').textContent = new Date().getFullYear();
  });

  /* ---------- Intro curtain ---------- */
  function intro() {
    var el = $('.intro');
    var delay = reduceMotion ? 0 : 1250;
    try {
      if (sessionStorage.getItem('js-intro')) delay = reduceMotion ? 0 : 150;
      sessionStorage.setItem('js-intro', '1');
    } catch (e) { /* storage blocked — just play it */ }

    setTimeout(function () {
      if (el) el.classList.add('is-done');
      root.classList.add('is-loaded');
      if (el) setTimeout(function () { el.remove(); }, 1100);
    }, delay);
  }

  /* ---------- Split headings into words for a staggered reveal ---------- */
  function splitHeadings() {
    $$('.split').forEach(function (h) {
      var i = 0;
      var walk = function (node) {
        Array.prototype.slice.call(node.childNodes).forEach(function (child) {
          if (child.nodeType === 3) {
            var frag = document.createDocumentFragment();
            child.textContent.split(/(\s+)/).forEach(function (part) {
              if (!part) return;
              if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
              var w = document.createElement('span');
              w.className = 'w';
              var inner = document.createElement('span');
              inner.style.setProperty('--i', i++);
              inner.textContent = part;
              w.appendChild(inner);
              frag.appendChild(w);
            });
            node.replaceChild(frag, child);
          } else if (child.nodeType === 1) {
            walk(child);
          }
        });
      };
      walk(h);
    });
  }

  /* ---------- Scroll reveals ---------- */
  function reveals() {
    var els = $$('.reveal, .split');
    if (reduceMotion || !('IntersectionObserver' in window)) {
      els.forEach(function (e) { e.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (e) { io.observe(e); });
  }

  /* ---------- Header, progress bar, floating CTA, active link ---------- */
  function header() {
    var h = $('.site-header');
    var progress = $('.scroll-progress');
    var floatCta = $('.float-bar');
    var lastY = window.scrollY;
    var nearBooking = false, pastHero = false;

    // Visibility of the floating CTA is driven by observers, not per-scroll layout reads
    if ('IntersectionObserver' in window && floatCta) {
      var hide = new Set();
      var cta = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.target.classList.contains('hero')) pastHero = !en.isIntersecting;
          else if (en.isIntersecting) hide.add(en.target); else hide.delete(en.target);
        });
        nearBooking = hide.size > 0;
        floatCta.classList.toggle('is-visible', pastHero && !nearBooking);
      }, { threshold: 0 });
      ['.hero', '.ba-cta', '#booking', '.cta-band', '.footer'].forEach(function (s) { var el = $(s); if (el) cta.observe(el); });
    }

    var update = rafThrottle(function () {
      var y = window.scrollY;
      var max = root.scrollHeight - window.innerHeight;
      progress.style.transform = 'scaleX(' + (max > 0 ? (y / max).toFixed(4) : 0) + ')';
      h.classList.toggle('is-scrolled', y > 40);
      if (!root.classList.contains('menu-open')) h.classList.toggle('is-hidden', y > lastY && y > 500);
      lastY = y;
    });
    window.addEventListener('scroll', update, { passive: true });
    update();

    if ('IntersectionObserver' in window) {
      var links = $$('.nav-links a[href^="#"]');
      var map = {};
      links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
      var spy = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var a = map[en.target.id];
          if (a && en.isIntersecting) {
            links.forEach(function (l) { l.classList.remove('is-active'); });
            a.classList.add('is-active');
          }
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      Object.keys(map).forEach(function (id) { var s = document.getElementById(id); if (s) spy.observe(s); });
    }
  }

  /* ---------- Mobile menu ---------- */
  function mobileMenu() {
    var btn = $('.menu-toggle');
    if (!btn) return;
    function set(open) {
      root.classList.toggle('menu-open', open);
      document.body.classList.toggle('no-scroll', open);
      btn.setAttribute('aria-expanded', open);
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }
    btn.addEventListener('click', function () { set(!root.classList.contains('menu-open')); });
    $$('.nav-links a').forEach(function (a) { a.addEventListener('click', function () { set(false); }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
  }

  /* ---------- Hero canvas: drifting water beads ----------
     Each bead is a pre-rendered sprite blitted with drawImage — no per-frame gradient creation. */
  function heroCanvas() {
    var canvas = $('.hero-canvas');
    if (!canvas || reduceMotion) return;
    var ctx = canvas.getContext('2d', { alpha: true });
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var w, h, beads = [], mouse = { x: -9999, y: -9999 }, running = false, visible = true;

    var SPRITE = 64;
    var sprite = document.createElement('canvas');
    sprite.width = sprite.height = SPRITE;
    (function () {
      var s = sprite.getContext('2d');
      var g = s.createRadialGradient(SPRITE * 0.42, SPRITE * 0.42, 0, SPRITE / 2, SPRITE / 2, SPRITE / 2);
      g.addColorStop(0, 'rgba(240,244,250,1)');
      g.addColorStop(0.35, 'rgba(180,200,225,.35)');
      g.addColorStop(1, 'rgba(124,192,255,0)');
      s.fillStyle = g;
      s.fillRect(0, 0, SPRITE, SPRITE);
    })();

    function makeBead(anywhere) {
      var r = Math.random() * 2.6 + 0.6;
      if (Math.random() < 0.08) r += Math.random() * 5;
      return {
        x: Math.random() * w, y: anywhere ? Math.random() * h : h + 20, r: r,
        vy: -(Math.random() * 0.25 + 0.06) * (r / 2 + 0.5),
        vx: (Math.random() - 0.5) * 0.12,
        a: Math.random() * 0.5 + 0.15, tw: Math.random() * 6.28
      };
    }
    function resize() {
      var r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var count = Math.round(Math.min(60, (w * h) / 18000));
      beads = [];
      for (var i = 0; i < count; i++) beads.push(makeBead(true));
    }
    function frame() {
      if (!visible || document.hidden) { running = false; return; }
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < beads.length; i++) {
        var b = beads[i];
        var dx = b.x - mouse.x, dy = b.y - mouse.y, d2 = dx * dx + dy * dy;
        if (d2 < 22500) { var f = (1 - d2 / 22500) * 0.018; b.x += dx * f; b.y += dy * f; }
        b.x += b.vx; b.y += b.vy; b.tw += 0.02;
        if (b.y < -20 || b.x < -20 || b.x > w + 20) { beads[i] = makeBead(false); continue; }
        var size = b.r * 4.4;
        ctx.globalAlpha = b.a * (0.75 + Math.sin(b.tw) * 0.25);
        ctx.drawImage(sprite, b.x - size / 2, b.y - size / 2, size, size);
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame(frame);
    }
    function start() { if (!running) { running = true; requestAnimationFrame(frame); } }

    resize();
    window.addEventListener('resize', rafThrottle(resize));
    var hero = $('.hero');
    hero.addEventListener('pointermove', function (e) {
      var r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
    }, { passive: true });
    hero.addEventListener('pointerleave', function () { mouse.x = mouse.y = -9999; });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && visible) start(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) start(); }).observe(hero);
    }
    start();
  }

  /* ---------- Hero spotlight: a fixed-size glow moved with transform ---------- */
  function heroSpotlight() {
    var hero = $('.hero'), spot = $('.hero-spot');
    if (!hero || !spot || !finePointer || reduceMotion) return;
    var move = rafThrottle(function (x, y) { spot.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)'; });
    hero.addEventListener('pointermove', function (e) {
      var r = hero.getBoundingClientRect();
      move(e.clientX - r.left, e.clientY - r.top);
    }, { passive: true });
  }

  /* ---------- Light parallax on the hero logo ---------- */
  function parallax() {
    var els = $$('[data-parallax]');
    if (!els.length || reduceMotion) return;
    var limit = window.innerHeight * 1.2;
    var update = rafThrottle(function () {
      var y = window.scrollY;
      if (y > limit) return;
      els.forEach(function (el) {
        el.style.transform = 'translate3d(0,' + (y * parseFloat(el.dataset.parallax)).toFixed(1) + 'px,0)';
      });
    });
    window.addEventListener('scroll', update, { passive: true });
  }

  /* ---------- Ghost buttons fill outward from where the cursor entered (button never moves) ---------- */
  function buttonFill() {
    $$('.btn-ghost').forEach(function (btn) {
      function setOrigin(e) {
        var r = btn.getBoundingClientRect();
        btn.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        btn.style.setProperty('--my', (e.clientY - r.top) + 'px');
      }
      btn.addEventListener('pointerenter', setOrigin);
      btn.addEventListener('pointerleave', setOrigin);
    });
  }

  /* ---------- Plan cards: cursor-following shine ---------- */
  function planShine() {
    if (!finePointer) return;
    $$('.plan').forEach(function (card) {
      var set = rafThrottle(function (x, y) {
        card.style.setProperty('--mx', x + '%');
        card.style.setProperty('--my', y + '%');
      });
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        set(((e.clientX - r.left) / r.width * 100).toFixed(1), ((e.clientY - r.top) / r.height * 100).toFixed(1));
      }, { passive: true });
    });
  }

  /* ---------- Phones: pricing is a swipe deck — sync the dots, open on the popular plan ---------- */
  function planDeck() {
    var deck = $('.plans'), dots = $$('.plan-dots span');
    if (!deck || !dots.length) return;
    var plans = $$('.plan', deck);
    var mq = window.matchMedia('(max-width: 760px)');
    function sync() {
      var mid = deck.scrollLeft + deck.clientWidth / 2, best = 0, bestD = Infinity;
      plans.forEach(function (p, i) {
        var d = Math.abs(p.offsetLeft + p.offsetWidth / 2 - mid);
        if (d < bestD) { bestD = d; best = i; }
      });
      dots.forEach(function (d, i) { d.classList.toggle('is-active', i === best); });
    }
    function center(i) {
      var p = plans[i];
      deck.scrollLeft = p.offsetLeft - (deck.clientWidth - p.offsetWidth) / 2;
      sync();
    }
    deck.addEventListener('scroll', rafThrottle(sync), { passive: true });
    if (mq.matches) center(1);
    mq.addEventListener('change', function (e) { if (e.matches) center(1); });
  }

  /* ---------- Count prices up when they enter view ---------- */
  function countUp() {
    var els = $$('.count');
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        io.unobserve(en.target);
        var el = en.target, to = parseInt(el.dataset.to, 10), start = null, dur = 1400, last = -1;
        (function step(t) {
          if (!start) start = t;
          var p = Math.min((t - start) / dur, 1);
          var v = Math.round(to * (1 - Math.pow(1 - p, 4)));
          if (v !== last) { el.textContent = v; last = v; }
          if (p < 1) requestAnimationFrame(step);
        })(performance.now());
      });
    }, { threshold: 0.6 });
    els.forEach(function (el) { el.textContent = '0'; io.observe(el); });
  }

  /* ---------- FAQ: animated open/close, one at a time ---------- */
  function faq() {
    var items = $$('.faq-item');
    items.forEach(function (item) {
      var summary = $('summary', item);
      var body = $('.faq-answer', item);
      summary.addEventListener('click', function (e) {
        e.preventDefault();
        if (item.open) close(item); else open(item);
      });
      function open(it) {
        items.forEach(function (o) { if (o !== it && o.open) close(o); });
        it.open = true;
        if (reduceMotion) return;
        body.animate([{ height: '0px', opacity: 0 }, { height: body.scrollHeight + 'px', opacity: 1 }], { duration: 450, easing: 'cubic-bezier(.16,1,.3,1)' });
      }
    });
    function close(it) {
      var body = $('.faq-answer', it);
      if (reduceMotion) { it.open = false; return; }
      var a = body.animate([{ height: body.offsetHeight + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 340, easing: 'cubic-bezier(.65,0,.35,1)' });
      a.onfinish = function () { it.open = false; };
    }
  }

  /* ---------- Before / after: the clean photo wipes down to the pointer ---------- */
  function beforeAfter() {
    var ba = $('#beforeAfter');
    if (!ba) return;
    var range = $('.ba-range', ba);
    var line = $('.ba-line', ba);
    var target = 0, current = 0, raf = null, touched = false, height = ba.offsetHeight;

    window.addEventListener('resize', rafThrottle(function () { height = ba.offsetHeight; render(current); }));

    function render(v) {
      ba.style.setProperty('--y', v + '%');
      line.style.transform = 'translate3d(0,' + (height * v / 100 - 1).toFixed(1) + 'px,0)';
      ba.classList.toggle('show-after', v > 12);
      ba.classList.toggle('hide-before', v > 88);
    }
    // Ease toward the target so the wipe feels like liquid rather than snapping
    function tick() {
      current += (target - current) * (reduceMotion ? 1 : 0.18);
      if (Math.abs(target - current) < 0.05) current = target;
      render(current);
      raf = current === target ? null : requestAnimationFrame(tick);
    }
    function go(v) {
      target = Math.max(0, Math.min(100, v));
      range.value = Math.round(target);
      if (!raf) raf = requestAnimationFrame(tick);
    }
    function fromEvent(e) {
      var r = ba.getBoundingClientRect();
      touched = true;
      go((e.clientY - r.top) / r.height * 100);
    }

    ba.addEventListener('pointermove', function (e) {
      if (e.pointerType === 'mouse' || dragging) fromEvent(e);
    }, { passive: true });
    var dragging = false;
    ba.addEventListener('pointerdown', function (e) {
      dragging = e.pointerType === 'mouse'; fromEvent(e);
    });
    ba.addEventListener('pointerup', function () { dragging = false; });
    ba.addEventListener('pointercancel', function () { dragging = false; });
    range.addEventListener('input', function () { touched = true; go(+range.value); });
    ba.tabIndex = -1;
    ba.addEventListener('click', function () { range.focus({ preventScroll: true }); });

    render(0);

    // Touch devices: vertical drags belong to page scrolling, so the wipe follows scroll position instead
    if (!finePointer) {
      var onScroll = rafThrottle(function () {
        if (touched) return;
        var r = ba.getBoundingClientRect(), vh = window.innerHeight;
        if (r.bottom < 0 || r.top > vh) return;
        go(Math.min(94, ((vh * 0.85 - r.top) / (vh * 0.6)) * 100)); // stop short so the handle stays in frame
      });
      window.addEventListener('scroll', onScroll, { passive: true });
      ba.addEventListener('pointerdown', function () { setTimeout(function () { touched = false; }, 2500); });
      return;
    }

    // Teaser: sweep down and settle halfway the first time it scrolls into view
    if (!reduceMotion && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (en) {
        if (!en[0].isIntersecting) return;
        io.disconnect();
        setTimeout(function () { if (!touched) go(70); }, 500);
        setTimeout(function () { if (!touched) go(45); }, 1500);
      }, { threshold: 0.5 });
      io.observe(ba);
    } else {
      go(50);
    }
  }

  /* ---------- Clean-car carousel: endless auto-scroll, drag/swipe to browse ---------- */
  function carousel() {
    var wrap = $('#carousel');
    if (!wrap) return;
    var track = $('.carousel-track', wrap);
    var originals = $$('.shot', track);
    originals.forEach(function (s, i) { s.dataset.i = i; });

    // Duplicate the set so the loop is seamless
    originals.forEach(function (s) {
      var c = s.cloneNode(true);
      c.setAttribute('aria-hidden', 'true');
      c.tabIndex = -1;
      track.appendChild(c);
    });

    var x = 0, half = 0, speed = reduceMotion ? 0 : 0.45, visible = true;
    var dragging = false, moved = 0, startX = 0, startOffset = 0, velocity = 0, lastPX = 0, running = false;

    function measure() { half = track.scrollWidth / 2; }
    function wrapX() { if (half) { while (x <= -half) x += half; while (x > 0) x -= half; } }
    function paint() { track.style.transform = 'translate3d(' + x.toFixed(2) + 'px,0,0)'; }

    function frame() {
      if (!visible || document.hidden) { running = false; return; }
      if (!dragging) {
        if (Math.abs(velocity) > 0.05) { x += velocity; velocity *= 0.94; }
        else x -= speed;
        wrapX(); paint();
      }
      requestAnimationFrame(frame);
    }
    function start() { if (!running) { running = true; requestAnimationFrame(frame); } }


    wrap.addEventListener('pointerdown', function (e) {
      dragging = true; moved = 0; velocity = 0;
      startX = lastPX = e.clientX; startOffset = x;
      wrap.classList.add('is-dragging');
    });
    window.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      var dx = e.clientX - startX;
      moved = Math.max(moved, Math.abs(dx));
      velocity = e.clientX - lastPX; lastPX = e.clientX;
      x = startOffset + dx; wrapX(); paint();
    }, { passive: true });
    function end() { if (!dragging) return; dragging = false; wrap.classList.remove('is-dragging'); }
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);

    // A drag shouldn't count as a click on a photo
    track.addEventListener('click', function (e) { if (moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);

    window.addEventListener('resize', rafThrottle(measure));
    $$('img', track).forEach(function (img) { if (!img.complete) img.addEventListener('load', measure); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && visible) start(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) start(); }).observe(wrap);
    }
    measure();
    start();
  }

  /* ---------- Lightbox ---------- */
  function lightbox() {
    var lb = $('#lightbox');
    var originals = $$('.shot:not([aria-hidden])');
    if (!lb || !originals.length) return;
    var img = $('img', lb), cap = $('figcaption', lb);
    var idx = 0, lastFocus = null;

    function show(i) {
      idx = (i + originals.length) % originals.length;
      var s = originals[idx], thumb = $('img', s);
      img.classList.remove('ready');
      img.onload = function () { img.classList.add('ready'); };
      img.src = s.dataset.full;
      img.alt = thumb.alt;
      cap.textContent = thumb.alt + '  ·  ' + (idx + 1) + ' / ' + originals.length;
      if (img.complete) img.classList.add('ready');
    }
    function open(i) {
      lastFocus = document.activeElement;
      lb.hidden = false;
      document.body.classList.add('no-scroll');
      show(i);
      requestAnimationFrame(function () { lb.classList.add('is-open'); });
      $('.lb-close', lb).focus();
    }
    function close() {
      lb.classList.remove('is-open');
      document.body.classList.remove('no-scroll');
      setTimeout(function () { lb.hidden = true; }, 400);
      if (lastFocus) lastFocus.focus({ preventScroll: true });
    }
    $('#carousel').addEventListener('click', function (e) {
      var s = e.target.closest('.shot');
      if (s) open(+s.dataset.i);
    });
    $('.lb-close', lb).addEventListener('click', close);
    $('.lb-prev', lb).addEventListener('click', function () { show(idx - 1); });
    $('.lb-next', lb).addEventListener('click', function () { show(idx + 1); });
    lb.addEventListener('click', function (e) { if (e.target === lb || e.target.tagName === 'FIGURE') close(); });
    document.addEventListener('keydown', function (e) {
      if (lb.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowLeft') show(idx - 1);
      if (e.key === 'ArrowRight') show(idx + 1);
    });
    var sx = null;
    lb.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
    lb.addEventListener('touchend', function (e) {
      if (sx === null) return;
      var dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1));
      sx = null;
    });
  }

  /* ---------- Booking form ---------- */
  function booking() {
    var form = $('#bookingForm');
    if (!form) return;
    var dateInput = $('#date'), timeInput = $('#time');
    var status = $('#formStatus'), done = $('#bookingDone');
    var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    var BOOK_AHEAD_DAYS = 90;

    var today = new Date(); today.setHours(0, 0, 0, 0);
    var lastDay = new Date(today); lastDay.setDate(lastDay.getDate() + BOOK_AHEAD_DAYS);
    var view = new Date(today.getFullYear(), today.getMonth(), 1);
    var selected = null;

    /* Calendar */
    var cal = $('#calendar'), grid = $('.cal-grid', cal), title = $('.cal-title', cal);
    var prevBtn = $('[data-dir="-1"]', cal), nextBtn = $('[data-dir="1"]', cal);

    function iso(d) {
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    function renderCal(dir) {
      title.textContent = MONTHS[view.getMonth()] + ' ' + view.getFullYear();
      var frag = document.createDocumentFragment();
      var first = view.getDay();
      var days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
      for (var i = 0; i < first; i++) frag.appendChild(document.createElement('span'));
      for (var d = 1; d <= days; d++) {
        var date = new Date(view.getFullYear(), view.getMonth(), d);
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'cal-day';
        b.textContent = d;
        b.dataset.date = iso(date);
        b.setAttribute('aria-label', date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }));
        if (date < today || date > lastDay) b.disabled = true;
        if (+date === +today) b.classList.add('is-today');
        if (selected && +date === +selected) { b.classList.add('is-selected'); b.setAttribute('aria-pressed', 'true'); }
        frag.appendChild(b);
      }
      grid.replaceChildren(frag);
      prevBtn.disabled = view.getFullYear() === today.getFullYear() && view.getMonth() === today.getMonth();
      nextBtn.disabled = new Date(view.getFullYear(), view.getMonth() + 1, 1) > lastDay;
      if (dir) {
        grid.style.setProperty('--dir', dir);
        grid.classList.remove('anim'); void grid.offsetWidth; grid.classList.add('anim');
      }
    }
    $$('.cal-nav', cal).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var dir = parseInt(btn.dataset.dir, 10);
        view = new Date(view.getFullYear(), view.getMonth() + dir, 1);
        renderCal(dir);
      });
    });
    grid.addEventListener('click', function (e) {
      var b = e.target.closest('.cal-day');
      if (!b || b.disabled) return;
      var p = b.dataset.date.split('-');
      selected = new Date(+p[0], +p[1] - 1, +p[2]);
      dateInput.value = b.dataset.date;
      var prev = $('.cal-day.is-selected', grid);
      if (prev) { prev.classList.remove('is-selected'); prev.removeAttribute('aria-pressed'); }
      b.classList.add('is-selected'); b.setAttribute('aria-pressed', 'true');
      updateSummary('date');
    });
    renderCal();

    /* Time slots */
    var slots = $$('.time-slot');
    slots.forEach(function (slot) {
      slot.addEventListener('click', function () {
        slots.forEach(function (s) { s.classList.remove('is-selected'); s.setAttribute('aria-checked', 'false'); });
        slot.classList.add('is-selected');
        slot.setAttribute('aria-checked', 'true');
        timeInput.value = slot.dataset.time;
        updateSummary('time');
      });
    });

    /* Packages — any .book-this link (hero, pricing cards) preselects and jumps to the form */
    var radios = $$('input[name="package"]', form);
    radios.forEach(function (r) { r.addEventListener('change', function () { updateSummary('package'); }); });

    $$('.book-this').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var pkg = btn.dataset.package;
        radios.forEach(function (r) {
          r.checked = r.value === pkg;
          if (r.checked) {
            var label = r.closest('.pkg');
            label.classList.remove('flash'); void label.offsetWidth; label.classList.add('flash');
          }
        });
        updateSummary('package');
        if (!form.hidden) {
          $('#booking').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
        }
      });
    });

    /* Summary + step completion */
    function currentPackage() {
      var r = radios.filter(function (x) { return x.checked; })[0];
      return r ? r.value : '';
    }
    function updateSummary(changed) {
      var vals = {
        package: currentPackage(),
        date: selected ? selected.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '',
        time: timeInput.value
      };
      Object.keys(vals).forEach(function (k) {
        var el = $('[data-sum="' + k + '"]', form);
        el.textContent = vals[k] || '—';
        if (k === changed) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
      });
      var blocks = $$('.step-block', form);
      blocks[0].classList.toggle('is-complete', !!vals.package);
      blocks[1].classList.toggle('is-complete', !!(vals.date && vals.time));
      blocks[2].classList.toggle('is-complete', ['name', 'phone', 'address'].every(function (id) { return $('#' + id).value.trim(); }));
      if (status.classList.contains('is-error')) status.className = 'form-status';
    }
    $$('.field input, .field textarea', form).forEach(function (f) {
      f.addEventListener('input', function () {
        f.closest('.field').classList.remove('is-invalid');
        updateSummary();
      });
    });

    /* Validation + submit */
    function fail(msg, target) {
      status.textContent = msg;
      status.className = 'form-status is-error';
      if (target) {
        target.classList.remove('shake'); void target.offsetWidth; target.classList.add('shake');
        target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      }
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var blocks = $$('.step-block', form);
      if (!currentPackage()) return fail('Please choose a package.', $('.pkg-grid', form));
      if (!dateInput.value) return fail('Please pick a date on the calendar.', cal);
      if (!timeInput.value) return fail('Please pick a preferred time slot.', $('#timeGrid'));
      var missing = ['name', 'phone', 'address'].filter(function (id) { return !$('#' + id).value.trim(); });
      if (missing.length) {
        missing.forEach(function (id) { $('#' + id).closest('.field').classList.add('is-invalid'); });
        return fail('Please fill in your name, phone number and service address.', blocks[2]);
      }

      var btn = $('.btn-submit', form);
      btn.classList.add('is-sending');
      status.className = 'form-status';

      fetch(form.action, {
        method: 'POST',
        body: new FormData(form),
        headers: { Accept: 'application/json' }
      }).then(function (res) {
        btn.classList.remove('is-sending');
        if (!res.ok) throw new Error('bad status');
        form.hidden = true;
        done.hidden = false;
        done.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'center' });
      }).catch(function () {
        btn.classList.remove('is-sending');
        fail('Something went wrong sending your request — please call (945) 248-1256 instead.');
      });
    });

    $('#bookAnother').addEventListener('click', function () {
      form.reset();
      selected = null; dateInput.value = ''; timeInput.value = '';
      slots.forEach(function (s) { s.classList.remove('is-selected'); s.setAttribute('aria-checked', 'false'); });
      view = new Date(today.getFullYear(), today.getMonth(), 1);
      renderCal();
      updateSummary();
      done.hidden = true;
      form.hidden = false;
    });
  }
})();
