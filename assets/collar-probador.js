// "Pruébalo en tu perro": la persona sube una foto de su mascota y encima ve su collar con nombre
// (las letras y colores que eligió). Lo mueve con el dedo, ajusta tamaño, giro y curva, y puede descargar
// o compartir la foto. Todo pasa en el navegador: la foto no se sube a ningún servidor.
// Lo abre assets/collar-nombre.js con window.wuuffProbador.abrir({ piezas, adv, iconos, strap }).
(function () {
  var MAX = 1400;                 // lado máximo de la foto (px) para que sea rápido en celular
  var FUENTE = '"Malaka Cournt", "Arial Rounded MT Bold", sans-serif';
  var datos = null, foto = null, cv = null, ctx = null, caja = null, capa = null;
  var logo = new Image(); logo.onload = function () { if (foto) dibujar(); }; logo.src = '/images/wuuff-puppy.png';
  var col = { x: 0.5, y: 0.6, w: 0.6, rot: 0, curva: 25 };   // posición y tamaño relativos a la foto
  function evento(n, p) { try { if (window.gtag) gtag('event', n, p || {}); } catch (e) {} }

  function construir() {
    caja = document.createElement('div');
    caja.className = 'pr-fondo'; caja.hidden = true;
    caja.setAttribute('role', 'dialog'); caja.setAttribute('aria-modal', 'true'); caja.setAttribute('aria-label', 'Prueba el collar en tu perro');
    caja.innerHTML =
      '<div class="pr-panel">' +
        '<div class="pr-cab"><h2>📸 Pruébalo en tu perro</h2><button type="button" class="pr-x" data-pr="cerrar" aria-label="Cerrar">×</button></div>' +
        '<div class="pr-vacio" data-pr="vacio"><p>Sube una foto donde se vea bien su cuello y te mostramos cómo le queda su collar.</p>' +
          '<label class="pr-btn pr-principal">Elegir una foto<input type="file" accept="image/*" data-pr="archivo" hidden></label>' +
          '<p class="pr-nota">🔒 Tu foto no se sube a internet: todo pasa en tu celular.</p></div>' +
        '<div class="pr-editor" data-pr="editor" hidden>' +
          '<p class="pr-ayuda">Arrastra el collar hasta su cuello. Con dos dedos lo agrandas o lo giras.</p>' +
          '<div class="pr-lienzo"><canvas data-pr="cv"></canvas></div>' +
          '<div class="pr-ajustes">' +
            '<label>Tamaño<input type="range" min="10" max="100" data-pr="w"></label>' +
            '<label>Giro<input type="range" min="-60" max="60" data-pr="rot"></label>' +
            '<label>Curva<input type="range" min="0" max="100" data-pr="curva"></label>' +
          '</div>' +
          '<div class="pr-acciones"><button type="button" class="pr-btn pr-principal" data-pr="guardar">Descargar foto</button>' +
            '<button type="button" class="pr-btn" data-pr="compartir" hidden>Compartir</button>' +
            '<label class="pr-btn">Otra foto<input type="file" accept="image/*" data-pr="archivo" hidden></label></div>' +
          '<p class="pr-nota">Es una simulación para que te hagas una idea: el collar real puede verse un poco distinto.</p>' +
        '</div>' +
      '</div>';
    document.body.appendChild(caja);
    cv = caja.querySelector('[data-pr=cv]'); ctx = cv.getContext('2d');
    caja.addEventListener('click', function (e) {
      if (e.target === caja || e.target.closest('[data-pr=cerrar]')) cerrar();
      if (e.target.closest('[data-pr=guardar]')) guardar();
      if (e.target.closest('[data-pr=compartir]')) compartir();
    });
    caja.querySelectorAll('[data-pr=archivo]').forEach(function (inp) {
      inp.addEventListener('change', function () { if (inp.files && inp.files[0]) cargar(inp.files[0]); inp.value = ''; });
    });
    ['w', 'rot', 'curva'].forEach(function (k) {
      caja.querySelector('[data-pr=' + k + ']').addEventListener('input', function (e) {
        col[k] = k === 'w' ? e.target.value / 100 : +e.target.value; dibujar();
      });
    });
    document.addEventListener('keydown', function (e) { if (!caja.hidden && e.key === 'Escape') cerrar(); });
    gestos();
  }

  function sincronizarControles() {
    caja.querySelector('[data-pr=w]').value = Math.round(col.w * 100);
    caja.querySelector('[data-pr=rot]').value = Math.round(col.rot);
    caja.querySelector('[data-pr=curva]').value = Math.round(col.curva);
  }

  function cargar(archivo) {
    var url = URL.createObjectURL(archivo), img = new Image();
    img.onload = function () {
      var k = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
      cv.width = Math.round(img.naturalWidth * k); cv.height = Math.round(img.naturalHeight * k);
      foto = img;
      col = { x: 0.5, y: 0.6, w: 0.6, rot: 0, curva: 25 };
      sincronizarControles();
      caja.querySelector('[data-pr=vacio]').hidden = true; caja.querySelector('[data-pr=editor]').hidden = false;
      caja.querySelector('[data-pr=compartir]').hidden = !(navigator.canShare && window.File);
      dibujar();
      evento('collar_probador_foto');
    };
    img.onerror = function () { URL.revokeObjectURL(url); alert('No pudimos abrir esa foto. Prueba con otra (JPG o PNG).'); };
    img.src = url;
  }

  // Dibuja la foto y encima el collar: banda azul cielo en arco y las letras siguiendo la curva
  function dibujar() {
    if (!foto) return;
    var W = cv.width, H = cv.height;
    var principal = ctx;
    principal.clearRect(0, 0, W, H);
    principal.drawImage(foto, 0, 0, W, H);
    // el collar se dibuja en una capa aparte (las puntas se desvanecen sin borrar la foto)
    if (!capa) capa = document.createElement('canvas');
    capa.width = W; capa.height = H; ctx = capa.getContext('2d');
    var L = col.w * W, h = L * 0.075, theta = col.curva / 100 * 2.4;   // largo, alto de la banda y ángulo del arco
    ctx.save();
    ctx.translate(col.x * W, col.y * H); ctx.rotate(col.rot * Math.PI / 180);
    var recto = theta < 0.02, R = recto ? 0 : L / (2 * Math.sin(theta / 2)), cy = recto ? 0 : -R * Math.cos(theta / 2);
    // posición y giro de un punto a una distancia "s" del centro, a lo largo del collar
    function punto(s, dy) {
      if (recto) return { x: s, y: dy || 0, a: 0 };
      var phi = s / R, r = R + (dy || 0);
      return { x: r * Math.sin(phi), y: cy + r * Math.cos(phi), a: -phi };
    }
    // letras: centradas en el collar y del tamaño que quepan (dejan espacio para hebilla y argolla)
    var pz = datos.piezas, fs = h * 2.5, avance = function (t) { return datos.iconos[t] ? 0.75 : (datos.adv[t] || 0.7); };
    var total = pz.reduce(function (a, p) { return a + avance(p.t) * fs; }, 0);
    var Lh = recto ? L / 2 : R * theta / 2;   // medio largo de la banda medido sobre la curva
    // Las letras van encajadas en la banda: siempre un poco más altas que ella (fs = 2,5 × alto de la banda).
    // Si el nombre no cabe, se angosta la banda junto con las letras para mantener esa proporción.
    if (total > Lh * 1.05) { var k = Lh * 1.05 / total; fs *= k; h *= k; total = Lh * 1.05; }
    var C = { base: datos.strap, osc: '#8396c4', claro: '#cfdbf3', borde: 'rgba(60,75,130,.35)' };
    // un trazo a lo largo de la banda, desplazado "dy" del centro (para el volumen)
    function trazo(dy, ancho, color) {
      ctx.strokeStyle = color; ctx.lineWidth = ancho; ctx.beginPath();
      if (recto) { ctx.moveTo(-L / 2, dy); ctx.lineTo(L / 2, dy); } else ctx.arc(0, cy, R + dy, Math.PI / 2 - theta / 2, Math.PI / 2 + theta / 2);
      ctx.stroke();
    }
    // pieza montada sobre la banda en la posición "s" (hebilla, presilla, botones)
    function pieza(s0, dibujo) { var c = punto(s0, 0); ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a); dibujo(); ctx.restore(); }
    function rect(x, y, w, hh, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r); ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    var izq = -total / 2, der = total / 2, lim = Lh * 0.88;
    // argolla en D (cuelga por debajo de la banda, detrás de ella)
    var sD = izq - h * 0.95;
    if (sD > -lim) pieza(sD, function () {
      ctx.lineWidth = h * 0.16; ctx.strokeStyle = C.osc;
      ctx.beginPath(); ctx.moveTo(-h * 0.42, h * 0.2); ctx.lineTo(-h * 0.42, h * 0.55); ctx.arc(0, h * 0.55, h * 0.42, Math.PI, 0, true); ctx.lineTo(h * 0.42, h * 0.2); ctx.stroke();
      ctx.lineWidth = h * 0.1; ctx.strokeStyle = C.base; ctx.stroke();
    });
    // banda con volumen; las puntas se desvanecen como si siguiera detrás del cuello
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = h * 0.6; ctx.shadowOffsetY = h * 0.3;
    ctx.lineCap = 'butt';
    trazo(0, h, C.base);
    ctx.restore();
    // volumen: más claro arriba y más oscuro abajo, como la goma real
    var vol;
    if (recto) { vol = ctx.createLinearGradient(0, -h / 2, 0, h / 2); }
    else { vol = ctx.createRadialGradient(0, cy, R - h / 2, 0, cy, R + h / 2); }
    vol.addColorStop(0, '#93a7d2'); vol.addColorStop(0.18, '#c3d1ee'); vol.addColorStop(0.45, C.base); vol.addColorStop(0.85, '#8ea2cf'); vol.addColorStop(1, '#7a8fbf');
    ctx.lineCap = 'butt'; trazo(0, h, vol);
    // puntas: borra suavemente los extremos (degradado de transparencia)
    ctx.save(); ctx.globalCompositeOperation = 'destination-out';
    [-1, 1].forEach(function (lado) {
      var a = punto(lado * Lh, 0), b = punto(lado * Lh * 0.72, 0);
      var g = ctx.createLinearGradient(a.x, a.y, b.x, b.y); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.strokeStyle = g; ctx.lineWidth = h * 3; ctx.beginPath();
      if (recto) { ctx.moveTo(lado * Lh * 1.05, 0); ctx.lineTo(lado * Lh * 0.72, 0); }
      else { var ang = function (sx) { return Math.PI / 2 - sx / R; }; ctx.arc(0, cy, R, Math.min(ang(lado * Lh * 1.05), ang(lado * Lh * 0.72)), Math.max(ang(lado * Lh * 1.05), ang(lado * Lh * 0.72))); }
      ctx.stroke();
    });
    ctx.restore();
    // hebilla de clic y presilla, al otro lado de las letras
    var sH = der + h * 1.05, sP = der + h * 2.15;
    if (sH + h * 0.75 < lim) pieza(sH, function () {
      var w = h * 1.5, hh = h * 1.3;
      ctx.fillStyle = C.osc; rect(-w / 2, -hh / 2 + h * 0.06, w, hh, h * 0.22); ctx.fill();
      ctx.fillStyle = '#b4c4e6'; rect(-w / 2, -hh / 2, w, hh, h * 0.22); ctx.fill();
      ctx.strokeStyle = C.osc; ctx.lineWidth = h * 0.07; ctx.beginPath(); ctx.moveTo(-w * 0.08, -hh * 0.42); ctx.lineTo(-w * 0.08, hh * 0.42); ctx.stroke();
      ctx.fillStyle = C.osc; rect(w * 0.08, -hh * 0.18, w * 0.26, hh * 0.36, h * 0.06); ctx.fill();
    });
    if (sP + h * 0.3 < lim) pieza(sP, function () {
      var w = h * 0.42, hh = h * 1.18;
      ctx.fillStyle = C.osc; rect(-w / 2, -hh / 2 + h * 0.05, w, hh, h * 0.12); ctx.fill();
      ctx.fillStyle = '#b4c4e6'; rect(-w / 2, -hh / 2, w, hh, h * 0.12); ctx.fill();
    });
    ctx.font = fs + 'px ' + FUENTE; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var s = -total / 2;
    pz.forEach(function (p) {
      var adv = avance(p.t) * fs, c = punto(s + adv / 2, 0);
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a);
      ctx.shadowColor = 'rgba(0,0,0,.3)'; ctx.shadowBlur = fs * 0.12; ctx.shadowOffsetY = fs * 0.08;
      for (var k = 3; k >= 0; k--) {
        var dy = k * fs * 0.025;
        ctx.fillStyle = k ? p.edge : p.main;
        if (datos.iconos[p.t]) {
          var esc = fs * 0.72 / 24;
          ctx.save(); ctx.translate(-12 * esc, -12 * esc + dy); ctx.scale(esc, esc);
          var path = new Path2D(datos.iconos[p.t]);
          ctx.fill(path); ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = ctx.fillStyle; ctx.stroke(path);
          ctx.restore();
        } else ctx.fillText(p.t, 0, fs * 0.04 + dy);
        if (k === 3) ctx.shadowColor = 'transparent';
      }
      ctx.restore();
      s += adv;
    });
    ctx.restore();
    ctx = principal;
    ctx.drawImage(capa, 0, 0);
    // marca: logo Wuuff Puppy + wuuffpuppy.co sobre una franja blanca, abajo a la derecha
    var m = Math.max(14, W * 0.03), lh = m * 2.1, lw = logo && logo.naturalWidth ? lh * logo.naturalWidth / logo.naturalHeight : 0;
    ctx.font = '800 ' + m + 'px Nunito, Arial, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    var tw = ctx.measureText('wuuffpuppy.co').width, pad = m * 0.55, gap = lw ? m * 0.5 : 0;
    var bw = pad * 2 + lw + gap + tw, bh = lh + pad * 0.9, bx = W - bw - m * 0.6, by = H - bh - m * 0.6;
    ctx.fillStyle = 'rgba(255,255,255,.88)'; ctx.shadowColor = 'rgba(0,0,0,.25)'; ctx.shadowBlur = m * 0.5;
    ctx.beginPath(); ctx.moveTo(bx + bh / 2, by); ctx.arcTo(bx + bw, by, bx + bw, by + bh, bh / 2); ctx.arcTo(bx + bw, by + bh, bx, by + bh, bh / 2);
    ctx.arcTo(bx, by + bh, bx, by, bh / 2); ctx.arcTo(bx, by, bx + bw, by, bh / 2); ctx.closePath(); ctx.fill();
    ctx.shadowColor = 'transparent';
    if (lw) ctx.drawImage(logo, bx + pad, by + (bh - lh) / 2, lw, lh);
    ctx.fillStyle = '#2d4375'; ctx.fillText('wuuffpuppy.co', bx + pad + lw + gap, by + bh / 2);
  }

  // Arrastrar con un dedo; con dos, agrandar y girar
  function gestos() {
    var dedos = {}, inicio = null;
    function rel(e) { var r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; }
    cv.addEventListener('pointerdown', function (e) { cv.setPointerCapture(e.pointerId); dedos[e.pointerId] = rel(e); inicio = null; });
    cv.addEventListener('pointermove', function (e) {
      if (!dedos[e.pointerId]) return;
      var antes = dedos[e.pointerId], ahora = rel(e), ids = Object.keys(dedos);
      dedos[e.pointerId] = ahora;
      if (ids.length === 1) { col.x += ahora.x - antes.x; col.y += ahora.y - antes.y; }
      else if (ids.length === 2) {
        var a = dedos[ids[0]], b = dedos[ids[1]], asp = cv.height / cv.width;
        var d = Math.hypot(b.x - a.x, (b.y - a.y) * asp), ang = Math.atan2((b.y - a.y) * asp, b.x - a.x) * 180 / Math.PI;
        if (!inicio) inicio = { d: d, ang: ang, w: col.w, rot: col.rot };
        col.w = Math.min(1, Math.max(0.1, inicio.w * d / inicio.d));
        col.rot = Math.min(60, Math.max(-60, inicio.rot + ang - inicio.ang));
        sincronizarControles();
      }
      col.x = Math.min(1, Math.max(0, col.x)); col.y = Math.min(1, Math.max(0, col.y));
      dibujar();
    });
    function soltar(e) { delete dedos[e.pointerId]; inicio = null; }
    cv.addEventListener('pointerup', soltar); cv.addEventListener('pointercancel', soltar);
  }

  function blob(cb) { cv.toBlob(cb, 'image/jpeg', 0.9); }
  function guardar() {
    blob(function (b) {
      var a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'mi-collar-wuuff.jpg';
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      evento('collar_probador_descargar');
    });
  }
  function compartir() {
    blob(function (b) {
      var f = new File([b], 'mi-collar-wuuff.jpg', { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) {
        navigator.share({ files: [f], title: 'Su collar con nombre', text: 'Así le queda su collar Wuuff Puppy 🐾 wuuffpuppy.co' }).catch(function () {});
        evento('collar_probador_compartir');
      } else guardar();
    });
  }

  function cerrar() { caja.hidden = true; document.documentElement.style.overflow = ''; }

  window.wuuffProbador = {
    abrir: function (d) {
      if (!caja) construir();
      datos = d;
      caja.hidden = false; document.documentElement.style.overflow = 'hidden';
      var listo = document.fonts && document.fonts.load ? document.fonts.load('40px "Malaka Cournt"') : Promise.resolve();
      listo.then(dibujar, dibujar);
      evento('collar_probador_abrir');
    }
  };
})();
