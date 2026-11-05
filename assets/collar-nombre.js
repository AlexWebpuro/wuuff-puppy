// Personalizador "Collar con nombre" en la ficha del collar: <div id="collar-nombre"></div>
// Precios, colores y tallas: /assets/collar-nombre.json (el servidor usa el mismo archivo y recalcula el total).
// Stock de letras: /assets/letras-stock.json ("sinLimite": true = no se bloquea ninguna letra).
(function () {
  var caja = document.getElementById('collar-nombre');
  if (!caja) return;
  var WA = '573176431286';
  var ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), ICONOS = ['♥', '★'];
  // Ancho de cada letra en Malaka Cournt (en em), para que el nombre siempre quepa en el collar
  var ADV = {"A":0.682,"B":0.622,"C":0.661,"D":0.628,"E":0.637,"F":0.646,"G":0.708,"H":0.69,"I":0.428,"J":0.623,"K":0.681,"L":0.606,"M":0.866,"N":0.689,"O":0.619,"P":0.62,"Q":0.707,"R":0.647,"S":0.608,"T":0.779,"U":0.653,"V":0.767,"W":1.01,"X":0.74,"Y":0.743,"Z":0.774};
  var SVG_HEART = '<path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 4.5 6.4 4.5c2.1 0 3.8 1.2 5.6 3.3 1.8-2.1 3.5-3.3 5.6-3.3 3.7 0 5.5 3.9 4 7.3C19.5 16.4 12 21 12 21z"/>';
  var SVG_STAR = '<path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.2 1.2-6.5L2.5 9.5l6.6-.9z"/>';
  var CFG = null, STOCK = null;
  var state = { texto: '', color: 'rosado', peso: 'p1', tallaManual: 'S' }, flags = { ene: false, corto: false };

  function $(s) { return caja.querySelector(s); }
  function cop(n) { return '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function svgDe(t, cls) { return '<svg class="' + cls + '" viewBox="0 0 24 24" aria-hidden="true">' + (t === '♥' ? SVG_HEART : SVG_STAR) + '</svg>'; }
  function tokens() { return Array.from(state.texto); }
  function cuenta(t) { return tokens().filter(function (x) { return x === t; }).length; }
  function color() { return CFG.colores.filter(function (c) { return c.id === state.color; })[0]; }
  function peso() { return CFG.pesos.filter(function (p) { return p.id === state.peso; })[0]; }
  function talla() { return peso().talla || state.tallaManual; }
  function extras() { return Math.max(0, tokens().length - CFG.incluidas); }
  function total() { return CFG.precio + extras() * CFG.precioExtra; }
  function disponibles(l) {
    if (!STOCK || STOCK.sinLimite) return Infinity;
    var s = (STOCK.stock || {})[state.color] || {};
    return s[l] || 0;
  }
  function faltan() {
    var need = {}, out = [];
    tokens().forEach(function (t) { need[t] = (need[t] || 0) + 1; });
    Object.keys(need).forEach(function (t) { if (need[t] > disponibles(t)) out.push(t); });
    return out;
  }
  function evento(n, p) { try { if (window.gtag) gtag('event', n, p || {}); } catch (e) {} }

  // Solo A–Z, corazón y estrella; las tildes se quitan (José → JOSE) y la Ñ se avisa
  function setTexto(raw) {
    var out = [], ene = false, corto = false;
    Array.from(String(raw).toUpperCase()).forEach(function (ch) {
      if (ch === 'Ñ') { ene = true; return; }
      var b = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      var ok = /^[A-Z]$/.test(b) || ch === '♥' || ch === '★';
      if (!ok) return;
      if (out.length >= CFG.maximo) { corto = true; return; }
      out.push(/^[A-Z]$/.test(b) ? b : ch);
    });
    state.texto = out.join(''); flags.ene = ene; flags.corto = corto;
    pintar();
  }

  function construir() {
    caja.innerHTML =
      '<div class="cn-cab"><h2 class="cn-titulo">Collar con nombre</h2><p>Escribe el nombre de tu perrito, escoge el color de las letras y míralo en el collar antes de comprarlo.</p></div>' +
      '<section class="cn-preview" aria-label="Vista previa del collar"><div class="cn-stage">' +
        '<div class="cn-stage-top"><span data-cn="stage-talla">Collar azul cielo</span><span data-cn="stage-color"></span></div>' +
        '<div class="cn-box"><div class="cn-strap"><div class="cn-name" data-cn="name" aria-live="polite"></div></div></div>' +
        '<p class="cn-stage-note">Collar azul cielo, impermeable y fácil de lavar con agua. Las letras se deslizan por el collar.</p>' +
      '</div></section>' +
      '<section class="cn-card"><h3 class="cn-paso"><span>1</span> Escribe su nombre</h3>' +
        '<p class="cn-hint">Hasta <b>' + CFG.maximo + '</b> letras o figuras. Las primeras <b>' + CFG.incluidas + '</b> van incluidas y cada letra extra suma <b>' + cop(CFG.precioExtra) + '</b>.</p>' +
        '<label class="cn-lbl" for="cn-nombre">Nombre de tu perrito</label>' +
        '<input class="cn-field" id="cn-nombre" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="LUNA" maxlength="20">' +
        '<div class="cn-counter"><span data-cn="cuenta"></span><span class="cn-badge" data-cn="badge"></span></div>' +
        '<p class="cn-keys-title">O toca las letras</p><div class="cn-keys" data-cn="keys"></div>' +
        '<div class="cn-tools"><button type="button" class="cn-link" data-cn="borrar">Borrar la última</button><button type="button" class="cn-link" data-cn="limpiar">Empezar de nuevo</button></div>' +
        '<p class="cn-aviso" data-cn="aviso" role="status" hidden></p></section>' +
      '<section class="cn-card"><h3 class="cn-paso"><span>2</span> Color de las letras</h3><p class="cn-hint">Cambia el color y mira cómo queda en el collar.</p>' +
        '<div class="cn-opts" data-cn="colores" role="radiogroup" aria-label="Color de las letras"></div></section>' +
      '<section class="cn-card"><h3 class="cn-paso"><span>3</span> Talla por peso</h3><p class="cn-hint">Escoge cuánto pesa tu perrito y te decimos qué talla le queda.</p>' +
        '<div class="cn-opts" data-cn="pesos" role="radiogroup" aria-label="Peso de tu perrito"></div><div class="cn-size" data-cn="size"></div></section>' +
      '<section class="cn-card cn-precio" aria-label="Resumen del precio"><h3>Tu collar</h3><dl>' +
        '<dt>Collar</dt><dd>' + cop(CFG.precio) + '</dd><dt>Nombre, hasta ' + CFG.incluidas + ' letras</dt><dd>Incluido</dd>' +
        '<dt data-cn="extra-lbl">Letras extra</dt><dd data-cn="extra"></dd><dt>Entrega</dt><dd>' + CFG.entrega + '</dd></dl>' +
        '<div class="cn-total"><span>Total</span><span class="cn-amount" data-cn="total"></span></div>' +
        '<button type="button" class="cn-cta" data-cn="cta">Comprar ahora</button>' +
        '<a class="cn-wa" data-cn="wa" href="#" target="_blank" rel="noopener">¿Dudas? Escríbenos por WhatsApp</a>' +
        '<p class="cn-fine">Envío gratis en Bogotá y pagas cuando te llegue. Otras ciudades: envío de $18.500 con pago en línea.</p></section>';

    var keys = $('[data-cn=keys]');
    ABC.concat(ICONOS).forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'cn-key'; b.setAttribute('data-k', k);
      b.setAttribute('aria-label', k === '♥' ? 'Corazón' : (k === '★' ? 'Estrella' : 'Letra ' + k));
      if (ICONOS.indexOf(k) > -1) b.innerHTML = svgDe(k, ''); else b.textContent = k;
      keys.appendChild(b);
    });
    CFG.colores.forEach(function (c) {
      $('[data-cn=colores]').insertAdjacentHTML('beforeend', '<button type="button" class="cn-opt" role="radio" data-id="' + c.id + '"><span class="cn-dot" style="background:' + c.main + '"></span><b>' + c.nombre + '</b></button>');
    });
    CFG.pesos.forEach(function (p) {
      $('[data-cn=pesos]').insertAdjacentHTML('beforeend', '<button type="button" class="cn-opt" role="radio" data-id="' + p.id + '"><b>' + p.txt + '</b><small>' + p.sub + '</small></button>');
    });

    caja.addEventListener('click', function (e) {
      var t = e.target, b;
      if ((b = t.closest('.cn-key')) && !b.disabled) return setTexto(state.texto + b.getAttribute('data-k'));
      if ((b = t.closest('[data-cn=colores] .cn-opt'))) { state.color = b.getAttribute('data-id'); evento('collar_nombre_color', { color: state.color }); return pintar(); }
      if ((b = t.closest('[data-cn=pesos] .cn-opt'))) { state.peso = b.getAttribute('data-id'); return pintar(); }
      if ((b = t.closest('[data-cn=size] button[data-t]'))) { state.tallaManual = b.getAttribute('data-t'); return pintar(); }
      if (t.closest('[data-cn=borrar]')) { var x = tokens(); x.pop(); return setTexto(x.join('')); }
      if (t.closest('[data-cn=limpiar]')) { setTexto(''); return $('#cn-nombre').focus(); }
      if (t.closest('[data-cn=cta]')) return comprar();
    });
    $('#cn-nombre').addEventListener('input', function (e) { setTexto(e.target.value); });
    window.addEventListener('resize', ajustar);
    // En celular la vista previa queda fija debajo del menú
    var nav = document.querySelector('body > nav');
    function tope() { caja.style.setProperty('--cn-top', ((nav ? nav.offsetHeight : 0) + 8) + 'px'); }
    tope(); window.addEventListener('resize', tope);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajustar);
  }

  // Las letras son más altas que el collar (≈ 1,3 × su ancho); al escribir más, todo se achica junto
  function ajustar() {
    var strap = $('.cn-strap'), name = $('[data-cn=name]');
    if (!strap) return;
    var t = tokens(), em = 0;
    t.forEach(function (x) { em += ADV[x] || 0.7; });
    if (!em) em = 3;
    var fs = Math.max(26, Math.min(120, strap.clientWidth * 0.76 / (em + t.length * 0.02)));
    name.style.setProperty('--fs', fs + 'px');
    strap.style.height = Math.max(30, fs * 0.54) + 'px';
  }

  function pintar() {
    var col = color(), t = tokens(), n = t.length, ex = extras(), tot = total(), falta = faltan();
    var name = $('[data-cn=name]');
    name.style.setProperty('--c', col.main); name.style.setProperty('--e', col.edge);
    name.innerHTML = n ? t.map(function (x) {
      return '<span class="cn-ch">' + (ICONOS.indexOf(x) > -1 ? svgDe(x, 'cn-ico') : x) + '</span>';
    }).join('') : '<span class="cn-ghost">Su nombre</span>';
    ajustar();
    $('[data-cn=stage-color]').textContent = 'Letras ' + col.nombre.toLowerCase();
    $('[data-cn=stage-talla]').textContent = 'Collar azul cielo · Talla ' + talla();
    var inp = $('#cn-nombre'); if (inp.value !== state.texto) inp.value = state.texto;
    $('[data-cn=cuenta]').innerHTML = '<b>' + n + '</b> de ' + CFG.maximo + (ex ? ' · ' + ex + (ex === 1 ? ' letra extra' : ' letras extra') : '');
    $('[data-cn=badge]').textContent = ex ? '+' + cop(ex * CFG.precioExtra) : CFG.incluidas + ' incluidas sin costo';
    caja.querySelectorAll('.cn-key').forEach(function (b) {
      var k = b.getAttribute('data-k');
      b.disabled = n >= CFG.maximo || cuenta(k) >= disponibles(k);
    });
    caja.querySelectorAll('[data-cn=colores] .cn-opt').forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-id') === state.color)); });
    caja.querySelectorAll('[data-cn=pesos] .cn-opt').forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-id') === state.peso)); });
    var p = peso(), sz = $('[data-cn=size]'), tl = talla();
    if (!p.talla) {
      sz.innerHTML = 'Está entre las dos tallas. Escoge una o <a href="https://wa.me/' + WA + '?text=' + encodeURIComponent('Hola Wuuff Puppy, ¿qué talla de collar le queda a mi perrito? Pesa entre 6 y 9 kg.') + '" target="_blank" rel="noopener">escríbenos con una foto y su peso</a>.' +
        '<br><span class="cn-seg" role="group" aria-label="Talla"><button type="button" data-t="S" aria-pressed="' + (tl === 'S') + '">S</button><button type="button" data-t="M" aria-pressed="' + (tl === 'M') + '">M</button></span>' +
        '<br>Talla ' + tl + ': ' + CFG.tallas[tl] + '.';
    } else {
      sz.innerHTML = '<b>Talla ' + tl + '</b>, ' + CFG.tallas[tl] + '.' + (p.aviso ? ' ' + p.aviso : '');
    }
    var msgs = [];
    if (flags.ene) msgs.push('La Ñ todavía no la tenemos. Escríbenos si el nombre la necesita.');
    if (flags.corto) msgs.push('El máximo es ' + CFG.maximo + ' letras por collar.');
    if (falta.length) msgs.push('En ' + col.nombre.toLowerCase() + ' nos faltan piezas de ' + falta.join(', ') + '. Prueba con otro color o consúltanos.');
    var av = $('[data-cn=aviso]'); av.hidden = !msgs.length; av.textContent = msgs.join(' ');
    $('[data-cn=extra-lbl]').textContent = ex ? 'Letras extra × ' + ex : 'Letras extra';
    $('[data-cn=extra]').textContent = ex ? cop(ex * CFG.precioExtra) : '$0';
    $('[data-cn=total]').textContent = cop(tot);
    var cta = $('[data-cn=cta]');
    if (!n) { cta.textContent = 'Escribe un nombre para comprar'; cta.setAttribute('aria-disabled', 'true'); }
    else if (falta.length) { cta.textContent = 'Faltan letras en este color'; cta.setAttribute('aria-disabled', 'true'); }
    else { cta.removeAttribute('aria-disabled'); cta.textContent = 'Comprar ahora · ' + cop(tot); }
    var lineas = ['Hola Wuuff Puppy, tengo una duda sobre el collar con nombre:', '• Nombre: ' + (n ? t.join('') : '(sin definir)'),
      '• Letras: ' + col.nombre, '• Talla: ' + tl + ' (' + p.txt + ')', '• Total: ' + cop(tot)];
    if (falta.length) lineas.push('• ¿Tienen las letras ' + falta.join(', ') + ' en ' + col.nombre.toLowerCase() + '?');
    var wa = $('[data-cn=wa]');
    wa.href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent(lineas.join('\n'));
    wa.textContent = falta.length ? 'Consultar disponibilidad por WhatsApp' : '¿Dudas? Escríbenos por WhatsApp';
    var ahora = document.querySelector('.info .precio .ahora');
    if (ahora && modo === 'nombre') ahora.textContent = cop(tot) + ' COP';
  }

  // Va directo al pago con el collar ya armado; el servidor vuelve a calcular el total
  function comprar() {
    var cta = $('[data-cn=cta]');
    if (cta.getAttribute('aria-disabled') === 'true') { $('#cn-nombre').focus(); return; }
    evento('collar_nombre_comprar', { letras: tokens().length, color: state.color, talla: talla(), value: total() });
    location.href = '/?comprar=collar&talla=' + talla() + '&nombre=' + encodeURIComponent(state.texto) + '&color=' + state.color + '&peso=' + state.peso;
  }

  // ¿Con nombre o sin nombre? (sin nombre = la compra de siempre a $44.900)
  var ahoraEl = document.querySelector('.info .precio .ahora');
  var modo = 'nombre', precioBase = ahoraEl ? ahoraEl.textContent : '';
  function cambiarModo(m) {
    modo = m;
    document.querySelectorAll('.modo-collar [data-modo]').forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-modo') === m)); });
    caja.hidden = m !== 'nombre';
    var sin = document.getElementById('compra-sin-nombre'); if (sin) sin.hidden = m === 'nombre';
    var ahora = document.querySelector('.info .precio .ahora');
    if (ahora) { if (!precioBase) precioBase = ahora.textContent; if (m === 'nombre' && CFG) pintar(); else ahora.textContent = precioBase; }
    // Con nombre el pedido pasa de $49.900: envío gratis y pago al recibir en Bogotá
    var envio = document.querySelector('.info .envio');
    if (envio) { if (!envioBase) envioBase = envio.textContent; envio.textContent = m === 'nombre' ? '🚚 Envío gratis y pago al recibir en Bogotá · $18.500 al resto de Colombia' : envioBase; }
    var cajaEntrega = document.querySelector('.info [data-entrega]');
    if (cajaEntrega) {
      if (m === 'nombre') cajaEntrega.removeAttribute('data-solo-linea'); else cajaEntrega.setAttribute('data-solo-linea', '');
      if (window.wuuffEntrega && window.wuuffEntrega.repintar) window.wuuffEntrega.repintar();
    }
  }
  var envioBase = '';
  document.querySelectorAll('.modo-collar [data-modo]').forEach(function (b) {
    b.addEventListener('click', function () { cambiarModo(b.getAttribute('data-modo')); evento('collar_modo', { modo: b.getAttribute('data-modo') }); });
  });

  Promise.all([
    fetch('/assets/collar-nombre.json').then(function (r) { return r.json(); }),
    fetch('/assets/letras-stock.json').then(function (r) { return r.ok ? r.json() : { sinLimite: true }; }).catch(function () { return { sinLimite: true }; })
  ]).then(function (r) {
    CFG = r[0]; STOCK = r[1];
    construir();
    var q = new URLSearchParams(location.search);
    setTexto(q.get('nombre') || '');
    if (q.get('modo') === 'sin') cambiarModo('sin'); else cambiarModo('nombre');
  }).catch(function () { cambiarModo('sin'); document.querySelectorAll('.modo-collar').forEach(function (m) { m.hidden = true; }); });
})();
