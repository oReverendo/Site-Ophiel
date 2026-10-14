(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  /* Fecha de hoy (como en la web anterior) */
  var today = doc.getElementById('today');
  if (today) {
    try {
      var t = new Intl.DateTimeFormat('es-ES', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Madrid'
      }).format(new Date());
      today.textContent = t.charAt(0).toUpperCase() + t.slice(1);
    } catch (e) {}
  }

  /* Cabecera: sombra al hacer scroll + altura para el menú móvil */
  var header = doc.querySelector('.site-header');
  var topbar = doc.querySelector('.topbar');
  function setHH() {
    if (!header) return;
    var r = header.getBoundingClientRect();
    root.style.setProperty('--hh', Math.max(0, Math.round(r.bottom)) + 'px');
  }
  function onScroll() {
    if (header) header.classList.toggle('stuck', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* Menú móvil */
  var burger = doc.getElementById('burger');
  var nav = doc.getElementById('nav');
  function closeNav() {
    if (!nav) return;
    nav.classList.remove('open');
    burger.setAttribute('aria-expanded', 'false');
    burger.setAttribute('aria-label', 'Abrir menú');
    doc.body.style.overflow = '';
  }
  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = !nav.classList.contains('open');
      if (open) { window.scrollTo({ top: 0 }); setHH(); }
      nav.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      doc.body.style.overflow = open ? 'hidden' : '';
    });
    window.addEventListener('resize', function () { if (window.innerWidth > 1200) closeNav(); setHH(); });
  }

  /* Submenús (teclado, táctil y ratón) */
  var subs = doc.querySelectorAll('.has-sub');
  function closeSubs(except) {
    subs.forEach(function (li) {
      if (li !== except) {
        li.classList.remove('open');
        var b = li.querySelector('.subtoggle');
        if (b) b.setAttribute('aria-expanded', 'false');
      }
    });
  }
  subs.forEach(function (li) {
    var btn = li.querySelector('.subtoggle');
    if (!btn) return;
    btn.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var open = !li.classList.contains('open');
      closeSubs(li);
      li.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
  });
  doc.addEventListener('click', function (ev) {
    if (!ev.target.closest('.has-sub')) closeSubs();
  });
  doc.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') {
      closeSubs();
      if (nav && nav.classList.contains('open')) { closeNav(); burger.focus(); }
    }
  });

  /* Tamaño de letra y alto contraste */
  var fs = parseInt(root.dataset.fs || '0', 10) || 0;
  function applyFs(n) {
    fs = Math.max(0, Math.min(2, n));
    if (fs) root.dataset.fs = String(fs); else delete root.dataset.fs;
    store.set('bn-fs', fs ? String(fs) : '');
    setHH();
  }
  var up = doc.getElementById('fs-up'), down = doc.getElementById('fs-down'), hc = doc.getElementById('hc');
  if (up) up.addEventListener('click', function () { applyFs(fs + 1); });
  if (down) down.addEventListener('click', function () { applyFs(fs - 1); });
  if (hc) {
    var on = root.dataset.contrast === 'high';
    hc.setAttribute('aria-pressed', String(on));
    hc.addEventListener('click', function () {
      on = !on;
      if (on) root.dataset.contrast = 'high'; else delete root.dataset.contrast;
      hc.setAttribute('aria-pressed', String(on));
      store.set('bn-hc', on ? '1' : '0');
    });
  }

  /* Aparición escalonada al cargar (todo queda visible al terminar) */
  doc.querySelectorAll('.reveal').forEach(function (el, i) {
    el.style.setProperty('--d', ((i % 6) * 0.05) + 's');
  });

  /* Farmacia: estado orientativo abierta/cerrada (hora de Madrid) */
  var st = doc.getElementById('ph-status');
  if (st) {
    var parts = {};
    try {
      new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
        .formatToParts(new Date()).forEach(function (p) { parts[p.type] = p.value; });
    } catch (e) { return; }
    var dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    var d = dayMap[parts.weekday];
    var m = parseInt(parts.hour, 10) * 60 + parseInt(parts.minute, 10);
    var slots = {
      1: [[540, 840], [1020, 1230]], 2: [[540, 840], [1020, 1230]], 3: [[540, 840], [1020, 1230]],
      4: [[540, 840], [1020, 1230]], 5: [[540, 840], [1020, 1230]], 6: [[570, 840]], 0: []
    };
    var isOpen = (slots[d] || []).some(function (s) { return m >= s[0] && m < s[1]; });
    st.textContent = isOpen ? 'Abierta ahora' : 'Cerrada ahora';
    st.className = 'status ' + (isOpen ? 'open' : 'closed');
    doc.querySelectorAll('#ph-hours tr').forEach(function (tr) {
      if ((tr.getAttribute('data-days') || '').split(',').indexOf(String(d)) > -1) tr.classList.add('today');
    });
  }


  /* ---------- Buscador (hero + diálogo) ---------- */
  function norm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  var IDX = (window.BN_INDEX || []).map(function (it) {
    return { it: it, t: norm(it.t), h: norm(it.t + ' ' + it.d + ' ' + (it.k || '')) };
  });
  function runSearch(q) {
    var toks = norm(q).split(/[\s,.;:]+/).filter(Boolean);
    if (!toks.length) return [];
    var res = [];
    IDX.forEach(function (r) {
      var score = 0;
      for (var i = 0; i < toks.length; i++) {
        var tk = toks[i];
        if (r.t.indexOf(tk) === 0) score += 6;
        else if (r.t.indexOf(' ' + tk) > -1) score += 4;
        else if (r.t.indexOf(tk) > -1) score += 3;
        else if (r.h.indexOf(tk) > -1) score += 1;
        else { score = 0; break; }
      }
      if (score) res.push({ r: r.it, s: score });
    });
    res.sort(function (x, y) { return y.s - x.s; });
    return res.slice(0, 8).map(function (x) { return x.r; });
  }
  var HOT = ['Sede electrónica', 'Farmacia', 'Playa', 'El tiempo', 'Tablón de anuncios', 'Empleo'];
  function suggestions() {
    return HOT.map(function (t) {
      for (var i = 0; i < IDX.length; i++) if (IDX[i].it.t === t) return IDX[i].it;
    }).filter(Boolean);
  }
  function mountSearch(form, input, list, status, modal) {
    if (!form || !input || !list) return null;
    var items = [], cur = -1;
    function setCur(n) {
      var opts = list.querySelectorAll('.hs-opt');
      cur = n;
      opts.forEach(function (o, i) { o.setAttribute('aria-selected', String(i === n)); });
      if (n >= 0 && opts[n]) { input.setAttribute('aria-activedescendant', opts[n].id); opts[n].scrollIntoView({ block: 'nearest' }); }
      else input.removeAttribute('aria-activedescendant');
    }
    function render() {
      var q = input.value;
      items = q.trim() ? runSearch(q) : suggestions();
      var h = '';
      if (!items.length) {
        h = '<li class="hs-empty" role="presentation">No hay resultados para «' + esc(q) + '». Prueba con otra palabra o llama al 950 406 041.</li>';
      } else {
        if (!q.trim()) h += '<li class="hs-head" role="presentation">Lo más buscado</li>';
        items.forEach(function (it, i) {
          h += '<li class="hs-opt" role="option" id="' + list.id + '-' + i + '" aria-selected="false"><a href="' + esc(it.h) + '"' +
            (it.x ? ' target="_blank" rel="noopener"' : '') + '><span class="hs-t">' + esc(it.t) + '</span><span class="hs-d">' + esc(it.d) + '</span>' + (it.x ? '<span class="sr"> (se abre en una pestaña nueva)</span>' : '') + '</a></li>';
        });
      }
      list.innerHTML = h; list.hidden = false; input.setAttribute('aria-expanded', 'true'); cur = -1;
      if (status) status.textContent = items.length ? items.length + (q.trim() ? ' resultados' : ' sugerencias') : 'Sin resultados';
    }
    function hide() { if (!modal) { list.hidden = true; input.setAttribute('aria-expanded', 'false'); } }
    function go(n) {
      var links = list.querySelectorAll('.hs-opt a');
      if (links[n]) links[n].click();
    }
    input.addEventListener('input', render);
    input.addEventListener('focus', render);
    input.addEventListener('keydown', function (ev) {
      var n = list.querySelectorAll('.hs-opt').length;
      if (ev.key === 'ArrowDown') { ev.preventDefault(); if (list.hidden) render(); setCur(cur + 1 >= n ? 0 : cur + 1); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); setCur(cur - 1 < 0 ? n - 1 : cur - 1); }
      else if (ev.key === 'Escape' && !modal) { hide(); }
    });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (!list.querySelectorAll('.hs-opt').length) render();
      go(cur >= 0 ? cur : 0);
    });
    if (!modal) {
      doc.addEventListener('click', function (ev) { if (!form.contains(ev.target)) hide(); });
      form.addEventListener('focusout', function () { setTimeout(function () { if (!form.contains(doc.activeElement)) hide(); }, 120); });
    }
    return { render: render };
  }
  mountSearch(doc.getElementById('sform-h'), doc.getElementById('sq-h'), doc.getElementById('sl-h'), doc.getElementById('sstat-h'), false);
  var dlg = doc.getElementById('sdlg');
  var dSearch = mountSearch(doc.getElementById('sform-d'), doc.getElementById('sq-d'), doc.getElementById('sl-d'), doc.getElementById('sstat-d'), true);
  function openSearch() {
    if (!dlg) return;
    if (typeof closeNav === 'function') closeNav();
    if (dlg.showModal) { if (!dlg.open) dlg.showModal(); } else dlg.setAttribute('open', '');
    var qi = doc.getElementById('sq-d'); qi.value = ''; if (dSearch) dSearch.render(); qi.focus();
  }
  Array.prototype.forEach.call(doc.querySelectorAll('#open-search,[data-open-search]'), function (b) { b.addEventListener('click', function () { var n = doc.getElementById('nav'); if (n && n.classList.contains('open') && window.innerWidth <= 1200) { try { doc.getElementById('burger').click(); } catch (e) {} } openSearch(); }); });
  var closeBtn = doc.getElementById('sclose');
  if (closeBtn) closeBtn.addEventListener('click', function () { dlg.close ? dlg.close() : dlg.removeAttribute('open'); });
  if (dlg) dlg.addEventListener('click', function (ev) { if (ev.target === dlg) { dlg.close ? dlg.close() : dlg.removeAttribute('open'); } });
  doc.addEventListener('keydown', function (ev) {
    var t = ev.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (ev.key === '/' && !typing && !ev.metaKey && !ev.ctrlKey) { ev.preventDefault(); openSearch(); }
  });

  /* ---------- Vídeo del banner (YouTube, sin sonido, en bucle, con pausa) ---------- */
  var hero = doc.getElementById('hero');
  var vid = doc.getElementById('hero-video');
  var vbtn = doc.getElementById('vid-toggle');
  var ytId = hero && hero.getAttribute('data-yt');
  var siteMode = hero && hero.getAttribute('data-mode') === 'site';
  var frame = null, playing = false;
  function ytCmd(cmd) {
    if (frame && frame.contentWindow) frame.contentWindow.postMessage(JSON.stringify({ event: 'command', func: cmd, args: '' }), '*');
  }
  function setPlaying(v) {
    playing = v;
    if (vbtn) {
      vbtn.setAttribute('aria-pressed', String(!v));
      vbtn.querySelector('.lbl').textContent = v ? 'Pausar vídeo' : 'Reproducir vídeo';
    }
  }
  function startVideo() {
    if (frame || !siteMode || !vid || !ytId) return;
    frame = doc.createElement('iframe');
    var p = new URLSearchParams({ autoplay: '1', mute: '1', loop: '1', playlist: ytId, controls: '0', modestbranding: '1', playsinline: '1', rel: '0', disablekb: '1', iv_load_policy: '3', enablejsapi: '1', fs: '0' });
    try { if (location.origin && location.origin.indexOf('http') === 0) p.set('origin', location.origin); } catch (e) {}
    frame.src = 'https://www.youtube-nocookie.com/embed/' + ytId + '?' + p.toString();
    frame.title = 'Vídeo de Balanegra';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.allow = 'autoplay; encrypted-media; picture-in-picture';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.addEventListener('load', function () {
      setTimeout(function () { vid.classList.add('on'); hero.classList.add('playing'); }, 1000);
    });
    vid.appendChild(frame);
    setPlaying(true);
  }
  if (siteMode && vbtn) {
    var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches || (navigator.connection && navigator.connection.saveData);
    if (calm) setPlaying(false);
    vbtn.addEventListener('click', function () {
      if (!frame) { startVideo(); return; }
      if (playing) { ytCmd('pauseVideo'); setPlaying(false); } else { ytCmd('playVideo'); setPlaying(true); }
    });
    window.addEventListener('load', function () { if (!calm) setTimeout(startVideo, 250); });
  }

  setHH();
})();
