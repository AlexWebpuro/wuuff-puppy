// Black Wuuff Friday (27 al 30 de nov de 2026): "El nombre de tu perrito va por nuestra cuenta".
// La fecha la decide el servidor (/.netlify/functions/promo); aquí solo se muestra:
//   - la franja lima arriba de todas las páginas (el jueves 26, el anuncio de "Este viernes…")
//   - window.wuuffPromoEstado(): promesa con { fase, ... } para la ficha del collar y el pago.
// Las fichas y el pago la usan para mostrar los precios; el total siempre lo recalcula el servidor.
(function () {
  function simular() {
    try {
      var s = new URLSearchParams(location.search).get('simular');
      if (s) sessionStorage.setItem('wuuff_simular', s);
      return sessionStorage.getItem('wuuff_simular') || '';
    } catch (e) { return ''; }
  }
  if (!window.wuuffPromoEstado) {
    window.wuuffPromoEstado = function () {
      if (!window.__wuuffPromo) { // (el pago de index.html puede haberlo pedido ya)
        var s = simular();
        window.__wuuffPromo = fetch('/.netlify/functions/promo' + (s ? '?simular=' + encodeURIComponent(s) : ''))
          .then(function (r) { return r.ok ? r.json() : { fase: null }; })
          .catch(function () { return { fase: null }; });
      }
      return window.__wuuffPromo;
    };
  }
  window.wuuffSimular = simular;
  if (/^\/panel\//.test(location.pathname)) return;
  var UTM = 'utm_source=web&utm_medium=banner&utm_campaign=black-wuuff-2026';
  window.wuuffPromoEstado().then(function (p) {
    if (!p || !p.fase) return;
    document.documentElement.classList.add(p.fase === 'activa' ? 'bwf-activa' : 'bwf-teaser');
    var css = document.createElement('style');
    css.textContent = '.bwf-franja{display:block;background:#d5d50c;color:#1b1b1b;font-family:inherit;font-weight:800;font-size:14px;line-height:1.35;text-align:center;padding:9px 16px;text-decoration:none;position:relative;z-index:60}' +
      '.bwf-franja:hover{text-decoration:underline}.bwf-franja b{font-weight:900;letter-spacing:.02em}';
    document.head.appendChild(css);
    var a = document.createElement('a');
    a.className = 'bwf-franja';
    a.href = '/combo-collar-arnes-correa/?modo=nombre&' + UTM;
    a.innerHTML = p.fase === 'activa'
      ? '🖤 <b>BLACK WUUFF FRIDAY</b> · El nombre de tu perrito va por nuestra cuenta · Hasta el lun 30 →'
      : '🖤 Este viernes: el nombre de tu perrito va por nuestra cuenta';
    a.addEventListener('click', function () { try { if (window.gtag) gtag('event', 'promo_franja', { fase: p.fase, campaign: 'black-wuuff-2026' }); } catch (e) {} });
    document.body.insertBefore(a, document.body.firstChild);
    // Menús fijos arriba (como el del inicio): se corren debajo de la franja mientras se ve, para no taparla
    var fijos = [].slice.call(document.body.children).filter(function (el) {
      if (el === a) return false;
      var cs = getComputedStyle(el);
      return cs.position === 'fixed' && cs.display !== 'none' && parseFloat(cs.top) === 0 && el.getBoundingClientRect().height < 200;
    });
    if (!fijos.length) return;
    function acomodar() { var h = a.offsetHeight, top = Math.max(0, h - (window.scrollY || 0)) + 'px'; fijos.forEach(function (el) { el.style.top = top; }); }
    acomodar();
    window.addEventListener('scroll', acomodar, { passive: true });
    window.addEventListener('resize', acomodar);
  });
})();
