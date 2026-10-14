
/* con <base href>, los enlaces #ancla no deben recargar la página */
document.addEventListener('click', function (e) {
  var a = e.target.closest && e.target.closest('a[href^="#"]');
  if (!a) return;
  var h = a.getAttribute('href');
  if (h.length < 2) return;
  var t = document.getElementById(decodeURIComponent(h.slice(1)));
  if (!t) return;
  e.preventDefault();
  t.scrollIntoView();
  if (!t.hasAttribute('tabindex')) t.setAttribute('tabindex', '-1');
  try { t.focus({ preventScroll: true }); history.replaceState(null, '', location.pathname + location.search + h); } catch (x) {}
});
