// Personalizador "Collar con nombre" en la ficha del collar: <div id="collar-nombre"></div>
// Precios, colores y tallas: /assets/collar-nombre.json (el servidor usa el mismo archivo y recalcula el total).
// Stock de letras: /assets/letras-stock.json ("sinLimite": true = no se bloquea ninguna letra).
(function () {
  var caja = document.getElementById('collar-nombre');
  if (!caja) return;
  var WA = '573176431286';
  // data-producto="collar-correa" o "combo": el personalizador va dentro de la ficha del combo
  // (sin el paso de talla ni el resumen; compra el botón de la ficha con window.wuuffCollarNombre)
  var PRODUCTO = caja.getAttribute('data-producto') || 'collar', EN_COMBO = PRODUCTO !== 'collar';
  var ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''), ICONOS = ['♥', '★'];
  // Ancho de cada letra en Malaka Cournt (en em), para que el nombre siempre quepa en el collar
  var ADV = {"A":0.682,"B":0.622,"C":0.661,"D":0.628,"E":0.637,"F":0.646,"G":0.708,"H":0.69,"I":0.428,"J":0.623,"K":0.681,"L":0.606,"M":0.866,"N":0.689,"O":0.619,"P":0.62,"Q":0.707,"R":0.647,"S":0.608,"T":0.779,"U":0.653,"V":0.767,"W":1.01,"X":0.74,"Y":0.743,"Z":0.774};
  var SVG_HEART = '<path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.7 4.5 6.4 4.5c2.1 0 3.8 1.2 5.6 3.3 1.8-2.1 3.5-3.3 5.6-3.3 3.7 0 5.5 3.9 4 7.3C19.5 16.4 12 21 12 21z"/>';
  var SVG_STAR = '<path d="M12 2.6l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.2 1.2-6.5L2.5 9.5l6.6-.9z"/>';
  var CFG = null, STOCK = null;
  var state = { texto: '', color: 'rosado', mezcla: [], combinar: false, pincel: '', peso: 'p1', tallaManual: 'S' }, flags = { ene: false, corto: false };

  function $(s) { return caja.querySelector(s); }
  function cop(n) { return '$' + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function svgDe(t, cls) { return '<svg class="' + cls + '" viewBox="0 0 24 24" aria-hidden="true">' + (t === '♥' ? SVG_HEART : SVG_STAR) + '</svg>'; }
  function tokens() { return Array.from(state.texto); }
  function cuenta(t) { return tokens().filter(function (x) { return x === t; }).length; }
  function color() { return CFG.colores.filter(function (c) { return c.id === state.color; })[0]; }
  // Combinar colores: cada letra o figura puede tener su propio color (mezcla[i], '' = el color de las letras)
  function colorPorId(id) { return CFG.colores.filter(function (c) { return c.id === id; })[0]; }
  function colorEn(i) { return (state.mezcla[i] && colorPorId(state.mezcla[i])) || color(); }
  function combinado() { return state.mezcla.some(function (m, i) { return m && m !== state.color && i < tokens().length; }); }
  function nombrePieza(t) { return t === '♥' ? 'corazón' : (t === '★' ? 'estrella' : t); }
  // Combinaciones que se ven bien juntas (letras + acento) y formas de repartir el acento
  var PAREJAS = [['azulrey', 'naranja'], ['rosado', 'lila'], ['negro', 'fucsia'], ['verde', 'beige'], ['cafe', 'miel'], ['lila', 'fucsia'],
    ['negro', 'beige'], ['azulrey', 'rosado'], ['verde', 'naranja'], ['miel', 'negro'], ['fucsia', 'rosado'], ['beige', 'cafe']];
  var ultimaPropuesta = -1;
  function proponer() {
    var t = tokens(), n = t.length, ops = [];
    if (!n) return false;
    var ico = t.map(function (x, i) { return ICONOS.indexOf(x) > -1 ? i : -1; }).filter(function (i) { return i > -1; });
    var formas = ['alternar', 'primera'].concat(ico.length && ico.length < n ? ['iconos'] : []).concat(n > 3 ? ['mitad'] : []);
    PAREJAS.forEach(function (p, a) { formas.forEach(function (f) { ops.push([a, f]); }); });
    var k; do { k = Math.floor(Math.random() * ops.length); } while (ops.length > 1 && k === ultimaPropuesta);
    ultimaPropuesta = k;
    var par = PAREJAS[ops[k][0]], forma = ops[k][1], base = par[0], acento = par[1];
    state.color = base; state.pincel = acento; state.combinar = true;
    state.mezcla = t.map(function (x, i) {
      var en = forma === 'alternar' ? i % 2 === 1 : forma === 'primera' ? i === 0 : forma === 'iconos' ? ico.indexOf(i) > -1 : i >= Math.ceil(n / 2);
      return en ? acento : '';
    });
    evento('collar_nombre_proponer', { base: base, acento: acento, forma: forma });
    return true;
  }
  // Probador con foto (assets/collar-probador.js): le pasa las piezas con sus colores
  function abrirProbador() {
    var t = tokens();
    if (!t.length) { $('#cn-nombre').focus(); var av = $('[data-cn=aviso]'); av.hidden = false; av.textContent = 'Primero escribe su nombre para verlo en la foto.'; return; }
    if (!window.wuuffProbador) return;
    window.wuuffProbador.abrir({
      piezas: t.map(function (x, i) { var c = colorEn(i); return { t: x, main: c.main, edge: c.edge }; }),
      adv: ADV, strap: '#a9bbe0',
      iconos: { '♥': SVG_HEART.match(/d="([^"]+)"/)[1], '★': SVG_STAR.match(/d="([^"]+)"/)[1] }
    });
  }
  // "L Azul rey · U Azul rey · N Rosado" (para el pedido y WhatsApp)
  function detalleMezcla() { return tokens().map(function (t, i) { return t + ' ' + colorEn(i).nombre; }).join(' · '); }
  function peso() { return CFG.pesos.filter(function (p) { return p.id === state.peso; })[0]; }
  function talla() { return peso().talla || state.tallaManual; }
  function extras() { return Math.max(0, tokens().length - CFG.incluidas); }
  function precios() { return EN_COMBO ? CFG.combos[PRODUCTO] : { precio: CFG.precio, precioSinNombre: CFG.precioSinNombre, titulo: 'Collar con nombre' }; }
  function total() { return modo === 'sin' ? precios().precioSinNombre : precios().precio + extras() * CFG.precioExtra; }
  function disponibles(l, colorId) {
    if (!STOCK || STOCK.sinLimite) return Infinity;
    var s = (STOCK.stock || {})[colorId || state.color] || {};
    return s[l] || 0;
  }
  // Piezas que faltan, cada una en su color: [{ t: 'L', color: 'rosado' }]
  function faltan() {
    var need = {}, out = [];
    tokens().forEach(function (t, i) { var k = t + '|' + colorEn(i).id; need[k] = (need[k] || 0) + 1; });
    Object.keys(need).forEach(function (k) { var p = k.split('|'); if (need[k] > disponibles(p[0], p[1])) out.push({ t: p[0], color: p[1] }); });
    return out;
  }
  // Agrupa las piezas que faltan por color: [{ color: 'rosado', piezas: ['L', 'U'] }]
  function porColor(lista) {
    var g = [];
    lista.forEach(function (x) { var c = colorPorId(x.color).nombre.toLowerCase(), e = g.filter(function (y) { return y.color === c; })[0]; if (e) e.piezas.push(x.t); else g.push({ color: c, piezas: [x.t] }); });
    return g;
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
    var antes = tokens();
    state.texto = out.join(''); flags.ene = ene; flags.corto = corto;
    // Conserva el color de cada pieza mientras el nombre no cambie en esa posición
    var mez = [];
    out.forEach(function (t, i) { mez.push(antes[i] === t ? (state.mezcla[i] || '') : ''); });
    state.mezcla = mez;
    pintar();
  }

  function construir() {
    caja.innerHTML =
      '<div class="cn-cab cn-solo-nombre"><h2 class="cn-titulo">Collar con nombre</h2><p>Escribe el nombre de tu perrito, escoge el color de las letras y míralo en el collar antes de comprarlo.</p></div>' +
      '<section class="cn-preview cn-solo-nombre" aria-label="Vista previa del collar"><div class="cn-stage">' +
        '<div class="cn-stage-top"><span data-cn="stage-talla">Collar azul cielo</span><span data-cn="stage-color"></span></div>' +
        '<div class="cn-box"><div class="cn-strap"><div class="cn-name" data-cn="name" aria-live="polite"></div></div></div>' +
        '<p class="cn-stage-note">Collar azul cielo, impermeable y fácil de lavar con agua. Las letras se deslizan por el collar.</p>' +
      '</div></section>' +
      '<section class="cn-card cn-solo-nombre"><h3 class="cn-paso"><span>1</span> Escribe su nombre</h3>' +
        '<p class="cn-hint">Hasta <b>' + CFG.maximo + '</b> letras o figuras. Las primeras <b>' + CFG.incluidas + '</b> van incluidas y cada letra extra suma <b>' + cop(CFG.precioExtra) + '</b>.</p>' +
        '<label class="cn-lbl" for="cn-nombre">Nombre de tu perrito</label>' +
        '<input class="cn-field" id="cn-nombre" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="LUNA" maxlength="20">' +
        '<div class="cn-counter"><span data-cn="cuenta"></span><span class="cn-badge" data-cn="badge"></span></div>' +
        '<p class="cn-keys-title">O toca las letras</p><div class="cn-keys" data-cn="keys"></div>' +
        '<div class="cn-tools"><button type="button" class="cn-link" data-cn="borrar">Borrar la última</button><button type="button" class="cn-link" data-cn="limpiar">Empezar de nuevo</button></div>' +
        '<p class="cn-aviso" data-cn="aviso" role="status" hidden></p></section>' +
      '<section class="cn-card cn-solo-nombre"><h3 class="cn-paso"><span>2</span> Colores</h3>' +
        '<button type="button" class="cn-proponer" data-cn="proponer">✨ Proponme una combinación</button>' +
        '<div class="cn-seg cn-modo-color" role="group" aria-label="Cómo quieres los colores"><button type="button" data-cm="uno" aria-pressed="true">Un color</button><button type="button" data-cm="mix" aria-pressed="false">🎨 Combinar</button></div>' +
        '<p class="cn-lbl cn-paso-color" data-cn="col-lbl"></p>' +
        '<div class="cn-circulos" data-cn="colores" role="radiogroup" aria-label="Colores"></div>' +
        '<div class="cn-mezcla" data-cn="mezcla" hidden><p class="cn-lbl cn-paso-color" data-cn="mezcla-lbl"></p>' +
        '<div class="cn-piezas" data-cn="piezas"></div><p class="cn-hint" data-cn="mezcla-hint"></p>' +
        '<div class="cn-tools"><button type="button" class="cn-link" data-cn="todas">Todas de este color</button><button type="button" class="cn-link" data-cn="alternar">Alternar colores</button></div></div></section>' +
      '<section class="cn-card cn-solo-nombre cn-probar"><p><b>📸 ¿Cómo se le vería?</b> Sube una foto de tu perrito y míralo con su collar.</p>' +
        '<button type="button" class="cn-btn-probar" data-cn="probar">Pruébalo en tu perro</button></section>' +
      '<section class="cn-card cn-talla"><h3 class="cn-paso"><span data-cn="num-talla">3</span> Talla por peso</h3><p class="cn-hint">Escoge cuánto pesa tu perrito y te decimos qué talla le queda.</p>' +
        '<div class="cn-opts" data-cn="pesos" role="radiogroup" aria-label="Peso de tu perrito"></div><div class="cn-size" data-cn="size"></div></section>' +
      '<section class="cn-card cn-precio" aria-label="Resumen del precio"><h3>Tu collar</h3><dl>' +
        '<dt>Collar</dt><dd data-cn="precio-collar"></dd><dt class="cn-solo-nombre">Nombre, hasta ' + CFG.incluidas + ' letras</dt><dd class="cn-solo-nombre">Incluido</dd>' +
        '<dt class="cn-solo-nombre" data-cn="extra-lbl">Letras extra</dt><dd class="cn-solo-nombre" data-cn="extra"></dd><dt data-cn="entrega-lbl">Entrega</dt><dd data-cn="entrega"></dd></dl>' +
        '<div class="cn-total"><span>Total</span><span class="cn-amount" data-cn="total"></span></div>' +
        '<button type="button" class="cn-cta" data-cn="cta">Comprar ahora</button>' +
        '<a class="cn-wa" data-cn="wa" href="#" target="_blank" rel="noopener">¿Dudas? Escríbenos por WhatsApp</a>' +
        '<p class="cn-fine">Envío: $8.500 en Bogotá y Soacha y $18.500 al resto de Colombia, con pago en línea.</p></section>';

    var keys = $('[data-cn=keys]');
    ABC.concat(ICONOS).forEach(function (k) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'cn-key'; b.setAttribute('data-k', k);
      b.setAttribute('aria-label', k === '♥' ? 'Corazón' : (k === '★' ? 'Estrella' : 'Letra ' + k));
      if (ICONOS.indexOf(k) > -1) b.innerHTML = svgDe(k, ''); else b.textContent = k;
      keys.appendChild(b);
    });
    function circulo(c) { return '<button type="button" class="cn-circ" role="radio" data-id="' + c.id + '" aria-label="' + c.nombre + '" title="' + c.nombre + '" style="--c:' + c.main + '"></button>'; }
    CFG.colores.forEach(function (c) { $('[data-cn=colores]').insertAdjacentHTML('beforeend', circulo(c)); });
    CFG.pesos.forEach(function (p) {
      $('[data-cn=pesos]').insertAdjacentHTML('beforeend', '<button type="button" class="cn-opt" role="radio" data-id="' + p.id + '"><b>' + p.txt + '</b><small>' + p.sub + '</small></button>');
    });

    caja.addEventListener('click', function (e) {
      var t = e.target, b;
      if ((b = t.closest('.cn-key')) && !b.disabled) return setTexto(state.texto + b.getAttribute('data-k'));
      if ((b = t.closest('[data-cm]'))) {
        state.combinar = b.getAttribute('data-cm') === 'mix';
        if (state.combinar) { var idx = CFG.colores.map(function (c) { return c.id; }).indexOf(state.color); state.pincel = CFG.colores[(idx + 1) % CFG.colores.length].id; }
        else state.mezcla = state.mezcla.map(function () { return ''; });
        evento('collar_nombre_combinar', { activo: state.combinar }); return pintar();
      }
      if ((b = t.closest('[data-cn=colores] .cn-circ'))) {
        var id = b.getAttribute('data-id');
        if (state.combinar) state.pincel = id; else { state.color = id; evento('collar_nombre_color', { color: id }); }
        return pintar();
      }
      // Combinar: toca una letra (abajo o en la vista previa) y queda del color elegido; otra vez, vuelve a su color
      if (state.combinar && (b = t.closest('[data-cn=piezas] .cn-pieza, [data-cn=name] .cn-ch'))) {
        var k = +b.getAttribute('data-i');
        state.mezcla[k] = colorEn(k).id === state.pincel ? '' : (state.pincel === state.color ? '' : state.pincel);
        return pintar();
      }
      if (t.closest('[data-cn=todas]')) { state.mezcla = tokens().map(function () { return state.pincel === state.color ? '' : state.pincel; }); return pintar(); }
      if (t.closest('[data-cn=probar]')) { abrirProbador(); return; }
      if (t.closest('[data-cn=proponer]')) { if (!proponer()) { $('#cn-nombre').focus(); } return pintar(); }
      if (t.closest('[data-cn=alternar]')) { state.mezcla = tokens().map(function (x, i) { return i % 2 && state.pincel !== state.color ? state.pincel : ''; }); return pintar(); }
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
    // Si las letras anchas (M, W) no caben, se achica hasta que quepan
    var max = strap.clientWidth * 0.84;
    if (name.scrollWidth > max) { fs = Math.max(20, fs * max / name.scrollWidth); name.style.setProperty('--fs', fs + 'px'); }
    // Las letras y figuras van encajadas: la banda siempre un poco más baja que ellas
    strap.style.height = Math.max(16, fs * 0.5) + 'px';
  }

  function pintar() {
    var col = color(), t = tokens(), n = t.length, ex = extras(), tot = total(), falta = faltan();
    var name = $('[data-cn=name]');
    name.style.setProperty('--c', col.main); name.style.setProperty('--e', col.edge);
    var mix = combinado();
    name.innerHTML = n ? t.map(function (x, i) {
      var ci = state.mezcla[i] && colorPorId(state.mezcla[i]);
      return '<span class="cn-ch" data-i="' + i + '"' + (ci ? ' style="--c:' + ci.main + ';--e:' + ci.edge + '"' : '') + '>' + (ICONOS.indexOf(x) > -1 ? svgDe(x, 'cn-ico') : x) + '</span>';
    }).join('') : '<span class="cn-ghost">Su nombre</span>';
    ajustar();
    $('[data-cn=stage-color]').textContent = mix ? 'Letras combinadas' : 'Letras ' + col.nombre.toLowerCase();
    var pin = colorPorId(state.pincel) || col;
    caja.classList.toggle('cn-combinando', state.combinar);
    caja.querySelectorAll('[data-cm]').forEach(function (b) { b.setAttribute('aria-pressed', String((b.getAttribute('data-cm') === 'mix') === state.combinar)); });
    $('[data-cn=col-lbl]').innerHTML = state.combinar ? '<b>1</b> Elige un color · <span class="cn-nom">' + pin.nombre + '</span>' : 'Color de las letras · <span class="cn-nom">' + col.nombre + '</span>';
    caja.querySelectorAll('[data-cn=colores] .cn-circ').forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-id') === (state.combinar ? pin.id : state.color))); });
    $('[data-cn=mezcla]').hidden = !state.combinar;
    $('[data-cn=mezcla-lbl]').innerHTML = '<b>2</b> Toca las letras que quieres en <span class="cn-nom">' + pin.nombre.toLowerCase() + '</span>';
    $('[data-cn=mezcla-hint]').textContent = n ? 'Tócala de nuevo para volver a ' + col.nombre.toLowerCase() + '. También sirve tocar el collar de arriba.' : 'Primero escribe el nombre en el paso 1.';
    $('[data-cn=piezas]').innerHTML = t.map(function (x, i) {
      var c = colorEn(i);
      return '<button type="button" class="cn-pieza" data-i="' + i + '" aria-label="' + nombrePieza(x) + ' en ' + c.nombre + '" style="--c:' + c.main + ';--e:' + c.edge + '">' + (ICONOS.indexOf(x) > -1 ? svgDe(x, '') : x) + '</button>';
    }).join('');
    $('[data-cn=stage-talla]').textContent = EN_COMBO ? 'Collar azul cielo' : 'Collar azul cielo · Talla ' + talla();
    var inp = $('#cn-nombre'); if (inp.value !== state.texto) inp.value = state.texto;
    $('[data-cn=cuenta]').innerHTML = '<b>' + n + '</b> de ' + CFG.maximo + (ex ? ' · ' + ex + (ex === 1 ? ' letra extra' : ' letras extra') : '');
    $('[data-cn=badge]').textContent = ex ? '+' + cop(ex * CFG.precioExtra) : CFG.incluidas + ' incluidas sin costo';
    caja.querySelectorAll('.cn-key').forEach(function (b) {
      var k = b.getAttribute('data-k');
      b.disabled = n >= CFG.maximo || cuenta(k) >= disponibles(k, state.color);
    });
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
    if (falta.length) msgs.push(porColor(falta).map(function (g) { return 'En ' + g.color + ' nos faltan piezas de ' + g.piezas.join(', ') + '.'; }).join(' ') + ' Prueba con otro color o consúltanos.');
    var av = $('[data-cn=aviso]'); av.hidden = !msgs.length; av.textContent = msgs.join(' ');
    $('[data-cn=extra-lbl]').textContent = ex ? 'Letras extra × ' + ex : 'Letras extra';
    $('[data-cn=extra]').textContent = ex ? cop(ex * CFG.precioExtra) : '$0';
    $('[data-cn=total]').textContent = cop(tot);
    $('[data-cn=precio-collar]').textContent = cop(modo === 'sin' ? precios().precioSinNombre : precios().precio);
    $('[data-cn=entrega-lbl]').textContent = modo === 'sin' ? 'Despacho' : 'Entrega';
    $('[data-cn=entrega]').textContent = modo === 'sin' ? '1–2 días hábiles' : CFG.entrega;
    $('[data-cn=num-talla]').textContent = modo === 'sin' ? '1' : '3';
    var cta = $('[data-cn=cta]');
    if (modo === 'sin') { cta.removeAttribute('aria-disabled'); cta.textContent = 'Comprar ahora · ' + cop(tot); }
    else if (!n) { cta.textContent = 'Escribe un nombre para comprar'; cta.setAttribute('aria-disabled', 'true'); }
    else if (falta.length) { cta.textContent = 'Faltan letras en este color'; cta.setAttribute('aria-disabled', 'true'); }
    else { cta.removeAttribute('aria-disabled'); cta.textContent = 'Comprar ahora · ' + cop(tot); }
    var lineas = modo === 'sin' ? ['Hola Wuuff Puppy, tengo una duda sobre el collar:', '• Talla: ' + tl + ' (' + p.txt + ')', '• Total: ' + cop(tot)]
      : ['Hola Wuuff Puppy, tengo una duda sobre el ' + precios().titulo.toLowerCase() + ':', '• Nombre: ' + (n ? t.join('') : '(sin definir)'),
      '• Letras: ' + (mix ? 'combinadas (' + detalleMezcla() + ')' : col.nombre), (EN_COMBO ? '' : '• Talla: ' + tl + ' (' + p.txt + ')'), '• Total: ' + cop(tot)].filter(Boolean);
    if (falta.length) lineas.push('• ¿Tienen ' + porColor(falta).map(function (g) { return g.piezas.join(', ') + ' en ' + g.color; }).join(' y ') + '?');
    var wa = $('[data-cn=wa]');
    wa.href = 'https://wa.me/' + WA + '?text=' + encodeURIComponent(lineas.join('\n'));
    wa.textContent = falta.length ? 'Consultar disponibilidad por WhatsApp' : '¿Dudas? Escríbenos por WhatsApp';
    var ahora = document.querySelector('.info .precio .ahora');
    if (ahora) ahora.textContent = cop(tot) + ' COP';
    var antes = document.querySelector('.info .precio .antes');
    if (antes && EN_COMBO) antes.hidden = modo === 'nombre';
  }

  // Va directo al pago con el collar ya armado; el servidor vuelve a calcular el total
  function comprar() {
    var cta = $('[data-cn=cta]');
    if (cta.getAttribute('aria-disabled') === 'true') { $('#cn-nombre').focus(); return; }
    if (modo === 'sin') { evento('collar_comprar', { talla: talla(), value: total() }); location.href = '/?comprar=collar&talla=' + talla(); return; }
    var mix = combinado();
    evento('collar_nombre_comprar', { letras: tokens().length, color: state.color, combinado: mix, talla: talla(), value: total() });
    location.href = '/?comprar=collar&talla=' + talla() + '&nombre=' + encodeURIComponent(state.texto) + '&color=' + state.color +
      (mix ? '&mezcla=' + state.mezcla.slice(0, tokens().length).join(',') : '') + '&peso=' + state.peso;
  }

  // Para el botón "Comprar" de las fichas de combo: ¿lleva nombre?, ¿está listo? y los datos para el pago
  window.wuuffCollarNombre = {
    activo: function () { return !!CFG && modo === 'nombre'; },
    listo: function () {
      if (!tokens().length) { $('#cn-nombre').focus(); var av = $('[data-cn=aviso]'); av.hidden = false; av.textContent = 'Escribe el nombre para el collar.'; return false; }
      if (faltan().length) { $('[data-cn=aviso]').scrollIntoView({ block: 'center' }); return false; }
      return true;
    },
    parametros: function () {
      var mix = combinado();
      evento('collar_nombre_comprar', { producto: PRODUCTO, letras: tokens().length, color: state.color, combinado: mix, value: total() });
      return '&nombre=' + encodeURIComponent(state.texto) + '&color=' + state.color + (mix ? '&mezcla=' + state.mezcla.slice(0, tokens().length).join(',') : '');
    }
  };

  // ¿Con nombre o sin nombre? Las dos usan la misma talla por peso; sin nombre oculta el nombre y el color.
  // La galería muestra las fotos de la opción elegida (miniaturas con data-modo) primero.
  var modo = 'nombre';
  var miniaturas = [].slice.call(document.querySelectorAll('.thumbs button'));
  function cambiarModo(m) {
    modo = m;
    document.querySelectorAll('.modo-collar [data-modo]').forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-modo') === m)); });
    caja.hidden = EN_COMBO && m === 'sin';
    caja.classList.toggle('cn-sin', m === 'sin');
    // Con nombre no mostramos la oferta de la placa (satura); sin nombre sí
    document.querySelectorAll('.info .mas-placa').forEach(function (x) { x.hidden = m !== 'sin'; });
    var cont = document.querySelector('.thumbs');
    if (cont && miniaturas.some(function (b) { return b.hasAttribute('data-modo'); })) {
      miniaturas.forEach(function (b) { var dm = b.getAttribute('data-modo'); b.hidden = !!dm && dm !== m; });
      // Primero las fotos de la opción elegida (en su orden) y luego las demás; data-pos-<modo> fija una foto en ese puesto
      var orden = miniaturas.filter(function (b) { return b.getAttribute('data-modo') === m; })
        .concat(miniaturas.filter(function (b) { return !b.hasAttribute('data-modo') && !b.hasAttribute('data-pos-' + m); }));
      miniaturas.filter(function (b) { return b.hasAttribute('data-pos-' + m); })
        .forEach(function (b) { orden.splice(+b.getAttribute('data-pos-' + m) - 1, 0, b); });
      orden.concat(miniaturas.filter(function (b) { return orden.indexOf(b) < 0; })).forEach(function (b) { cont.appendChild(b); });
      miniaturas.filter(function (b) { return !b.hidden; }).sort(function (x, y) { return x.compareDocumentPosition(y) & 4 ? -1 : 1; })
        .forEach(function (b, i) { b.setAttribute('aria-label', 'Ver foto ' + (i + 1)); });
      if (window.wuuffGaleria) window.wuuffGaleria.actualizar();
    }
    if (CFG) pintar();
  }
  document.querySelectorAll('.modo-collar [data-modo]').forEach(function (b) {
    b.addEventListener('click', function () { cambiarModo(b.getAttribute('data-modo')); evento('collar_modo', { modo: b.getAttribute('data-modo') }); });
  });

  Promise.all([
    fetch('/assets/collar-nombre.json').then(function (r) { return r.json(); }),
    fetch('/assets/letras-stock.json').then(function (r) { return r.ok ? r.json() : { sinLimite: true }; }).catch(function () { return { sinLimite: true }; })
  ]).then(function (r) {
    CFG = r[0]; STOCK = r[1];
    if (EN_COMBO && !(CFG.combos && CFG.combos[PRODUCTO])) throw new Error('combo sin precio');
    construir();
    caja.classList.toggle('cn-en-combo', EN_COMBO);
    var q = new URLSearchParams(location.search);
    setTexto(q.get('nombre') || '');
    var inicial = q.get('modo') || (q.get('nombre') ? 'nombre' : caja.getAttribute('data-modo-inicial')) || 'nombre';
    cambiarModo(inicial === 'sin' ? 'sin' : 'nombre');
  }).catch(function () {
    if (EN_COMBO) { document.querySelectorAll('.modo-collar').forEach(function (m) { m.hidden = true; }); return; }
    caja.hidden = false;
    caja.innerHTML = '<p class="cn-aviso">No pudimos cargar el collar. <a href="https://wa.me/' + WA + '?text=' + encodeURIComponent('Hola Wuuff Puppy, quiero comprar el collar') + '" target="_blank" rel="noopener">Escríbenos por WhatsApp</a> y te ayudamos.</p>';
    document.querySelectorAll('.modo-collar').forEach(function (m) { m.hidden = true; });
  });
})();
