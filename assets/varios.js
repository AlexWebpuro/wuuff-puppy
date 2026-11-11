// "➕ Agregar otro" en las fichas de producto (arnés, correa, combos…): para llevar varios en un mismo pedido,
// cada uno con su talla (y su nombre, si el combo lleva collar con nombre). Muchas familias tienen 2 o más perritos.
// Lee la talla elegida de los botones .tallas de la ficha y, al comprar con varios, manda al pago
// /?comprar=<producto>&talla=…&lista=[…] (index.html arma el carrito y el servidor recalcula todo).
(function () {
  var btn = document.getElementById('btn-comprar');
  var clave = document.body.getAttribute('data-clave');
  if (!btn || !clave) return;
  var unica = document.body.getAttribute('data-talla-unica') || '';
  var MAX = 6, lista = [];
  var precioBase = (function () { var a = document.querySelector('.info .precio .ahora'); return a ? parseInt(a.textContent.replace(/\D/g, ''), 10) || 0 : 0; })();
  function cop(n) { return '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function evento(n, p) { try { if (window.gtag) gtag('event', n, p || {}); } catch (e) {} }
  function cn() { return window.wuuffCollarNombre && window.wuuffCollarNombre.activo() ? window.wuuffCollarNombre : null; }

  // Talla elegida ahora en la ficha ('' si falta); en el combo, collar + arnés ("SM")
  function tallaActual() {
    if (unica) return unica;
    var piezas = document.querySelectorAll('.tallas[data-pieza]');
    if (piezas.length) {
      var t = '';
      for (var i = 0; i < piezas.length; i++) { var b = piezas[i].querySelector('button[aria-pressed="true"]'); if (!b) return ''; t += b.getAttribute('data-talla'); }
      return t;
    }
    var b2 = document.querySelector('.tallas button[aria-pressed="true"]');
    return b2 ? b2.getAttribute('data-talla') : '';
  }
  function textoTalla(t) { return t === unica ? '' : (t.length === 2 ? 'collar ' + t[0] + ', arnés ' + t[1] : 'Talla ' + t); }
  function actual() {
    var t = tallaActual(); if (!t) return null;
    var c = cn(), it = { talla: t, precio: precioBase, desc: textoTalla(t) };
    if (c) {
      if (!c.valido()) return null;
      var d = c.datos(); it.texto = d.texto; it.color = d.color; if (d.mezcla) it.mezcla = d.mezcla;
      it.precio = c.precio(); it.desc = (it.desc ? it.desc + ' · ' : '') + c.descripcion();
    }
    return it;
  }
  function items() { var a = actual(); return lista.concat(a ? [a] : []); }

  // Interfaz: lista de lo agregado (antes del botón Comprar) y botón "Agregar otro" (después)
  var caja = document.createElement('div'); caja.className = 'varios'; caja.hidden = true;
  btn.parentNode.insertBefore(caja, btn);
  var otro = document.createElement('button'); otro.type = 'button'; otro.className = 'btn-otro';
  btn.parentNode.insertBefore(otro, btn.nextSibling);
  var textoBtn = btn.textContent;

  function pintar() {
    var todos = items(), a = actual(), n = todos.length;
    caja.hidden = !lista.length;
    caja.innerHTML = lista.length ? '<p class="varios-t">🐶 Tu pedido · ' + n + (n === 1 ? ' producto' : ' productos') + '</p>' +
      lista.map(function (it, i) { return '<div class="varios-it"><span><b>' + (i + 1) + '.</b> ' + (it.desc || 'Talla única') + '</span><span>' + cop(it.precio) + '</span><button type="button" data-quitar="' + i + '" aria-label="Quitar">✕</button></div>'; }).join('') +
      (a ? '<div class="varios-it varios-actual"><span><b>' + n + '.</b> ' + (a.desc || 'Talla única') + ' <small>(el que estás eligiendo)</small></span><span>' + cop(a.precio) + '</span></div>' : '') +
      '<div class="varios-total"><span>Total</span><b>' + cop(todos.reduce(function (s, it) { return s + it.precio; }, 0)) + '</b></div>' : '';
    btn.textContent = lista.length ? 'Comprar ' + n + (n === 1 ? ' producto' : ' productos') + ' 🐾' : textoBtn;
    otro.hidden = n >= MAX;
    otro.textContent = '➕ Agregar otro' + (lista.length ? '' : ' (para otro perrito)');
  }
  caja.addEventListener('click', function (e) { var q = e.target.closest('[data-quitar]'); if (q) { lista.splice(+q.getAttribute('data-quitar'), 1); pintar(); } });
  document.addEventListener('click', function (e) { if (e.target.closest('.tallas button, .modo-collar button, #collar-nombre')) setTimeout(pintar, 0); });
  document.addEventListener('input', function (e) { if (e.target.closest('#collar-nombre')) setTimeout(pintar, 0); });

  otro.addEventListener('click', function () {
    var a = actual();
    if (!a) {
      var c = cn();
      if (!tallaActual()) { var av = document.getElementById('aviso-talla'); if (av) { av.classList.add('show'); av.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }
      else if (c) c.listo();
      return;
    }
    lista.push(a); evento('agregar_otro', { producto: clave, cantidad: lista.length });
    // deja la ficha lista para elegir el siguiente: sin talla (si hay que elegir) y sin nombre
    if (!unica) document.querySelectorAll('.tallas button').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
    if (cn()) cn().limpiar();
    pintar();
    caja.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  // Comprar con varios: antes que el botón de la ficha (que compra uno solo)
  // (en la fase de captura del documento, para correr siempre antes que el botón de la ficha, en cualquier navegador)
  document.addEventListener('click', function (e) {
    if (!lista.length || !e.target.closest('#btn-comprar')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    var todos = items().map(function (it) { var o = { talla: it.talla }; if (it.texto) { o.texto = it.texto; o.color = it.color; if (it.mezcla) o.mezcla = it.mezcla; } return o; });
    evento('comprar_varios', { producto: clave, cantidad: todos.length });
    location.href = '/?comprar=' + clave + '&talla=' + encodeURIComponent(todos[0].talla) + '&lista=' + encodeURIComponent(JSON.stringify(todos));
  }, true);

  pintar();
})();
