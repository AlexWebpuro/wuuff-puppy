// Reseñas de clientes en las fichas de producto: <section id="resenas" data-resenas="arnes"></section>
// Lee las reseñas aprobadas (función resenas), muestra el resumen, la lista y el formulario para escribir una.
// Con ?resena=<token> (enlace del correo después de la compra) la reseña queda como "compra verificada".
(function () {
  var caja = document.querySelector('[data-resenas]');
  if (!caja) return;
  var PRODUCTO = caja.getAttribute('data-resenas');
  var API = '/.netlify/functions/resenas';
  var POR_PAGINA = 5;
  var datos = { total: 0, promedio: 0, distribucion: {}, resenas: [] };
  var orden = 'recientes', mostrar = POR_PAGINA, invitacion = '', fotos = [];
  var MAX_FOTOS = 4;
  try { invitacion = new URLSearchParams(location.search).get('resena') || ''; } catch (e) {}
  if (!/^[a-f0-9]{32}$/.test(invitacion)) invitacion = '';

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(n) { return String(n.toFixed(n % 1 ? 2 : 0)).replace(/0$/, '').replace('.', ','); }
  function estrellas(n, grande) {
    var p = Math.max(0, Math.min(100, n / 5 * 100));
    return '<span class="rs-est' + (grande ? ' rs-grande' : '') + '" role="img" aria-label="' + num(n) + ' de 5 estrellas">★★★★★<span style="width:' + p + '%">★★★★★</span></span>';
  }
  function fecha(iso) {
    var d = new Date(new Date(iso).getTime() - 5 * 36e5);
    function dos(x) { return (x < 10 ? '0' : '') + x; }
    return dos(d.getUTCDate()) + '/' + dos(d.getUTCMonth() + 1) + '/' + d.getUTCFullYear();
  }
  function foto(r, n) { return '/.netlify/functions/resena-foto?id=' + encodeURIComponent(r.id) + (n ? '&n=' + n : ''); }
  function nFotos(r) { return r.fotos || (r.foto ? 1 : 0); }
  function evento(n, p) { try { if (window.gtag) gtag('event', n, p || {}); } catch (e) {} }

  function ordenadas() {
    var l = datos.resenas.slice();
    if (orden === 'fotos') l = l.filter(function (r) { return r.foto; });
    if (orden === 'mejor') l.sort(function (a, b) { return b.estrellas - a.estrellas || (a.fecha < b.fecha ? 1 : -1); });
    if (orden === 'peor') l.sort(function (a, b) { return a.estrellas - b.estrellas || (a.fecha < b.fecha ? 1 : -1); });
    return l;
  }

  function pintarResumen() {
    var t = datos.total;
    if (!t) return '<div class="rs-top rs-vacio"><p>Todavía no hay reseñas de este producto. ¡Cuéntanos cómo le quedó a tu perrihijo y ayuda a otras familias a elegir!</p>' +
      '<button type="button" class="rs-btn" data-rs-escribir>Escribe una reseña</button></div>';
    var barras = [5, 4, 3, 2, 1].map(function (n) {
      var c = datos.distribucion[n] || 0;
      return '<div class="rs-barra"><span class="rs-barra-est">' + estrellas(n) + '</span><span class="rs-barra-fondo"><span style="width:' + (c / t * 100) + '%"></span></span><span class="rs-barra-n">' + c + '</span></div>';
    }).join('');
    return '<div class="rs-top">' +
      '<div class="rs-prom">' + estrellas(datos.promedio, true) + '<p><strong>' + num(datos.promedio) + ' de 5</strong></p><p>Basado en ' + t + (t === 1 ? ' reseña' : ' reseñas') + '</p></div>' +
      '<div class="rs-dist">' + barras + '</div>' +
      '<div class="rs-accion"><button type="button" class="rs-btn" data-rs-escribir>Escribe una reseña</button></div></div>';
  }

  function pintarLista() {
    if (!datos.total) return '';
    var l = ordenadas(), vis = l.slice(0, mostrar);
    var items = vis.map(function (r) {
      return '<article class="rs-item">' +
        '<div class="rs-item-cab">' + estrellas(r.estrellas) + '<time datetime="' + esc(r.fecha) + '">' + fecha(r.fecha) + '</time></div>' +
        '<div class="rs-autor"><span class="rs-avatar" aria-hidden="true">' + esc(r.nombre.charAt(0).toUpperCase()) + '</span><span class="rs-nombre">' + esc(r.nombre) + '</span>' +
        (r.verificada ? '<span class="rs-verif" title="Compró este producto en Wuuff Puppy">✓ Compra verificada</span>' : '') +
        (r.mascota ? '<span class="rs-mascota">🐾 ' + esc(r.mascota) + '</span>' : '') + '</div>' +
        (r.titulo ? '<p class="rs-titulo">' + esc(r.titulo) + '</p>' : '') +
        '<p class="rs-texto">' + esc(r.texto) + '</p>' +
        (nFotos(r) ? '<div class="rs-fotos">' + Array.apply(null, Array(nFotos(r))).map(function (_, n) {
          return '<button type="button" class="rs-foto" data-rs-foto="' + esc(foto(r, n)) + '" aria-label="Ver la foto ' + (n + 1) + ' de ' + esc(r.nombre) + '"><img src="' + esc(foto(r, n)) + '" alt="Foto de ' + esc(r.mascota || 'su perro') + ' con el producto" loading="lazy"></button>';
        }).join('') + '</div>' : '') +
        '</article>';
    }).join('');
    return '<div class="rs-barra-orden"><label>Ordenar: <select data-rs-orden>' +
      [['recientes', 'Más recientes'], ['fotos', 'Con fotos'], ['mejor', 'Mejor calificación'], ['peor', 'Peor calificación']].map(function (o) {
        return '<option value="' + o[0] + '"' + (o[0] === orden ? ' selected' : '') + '>' + o[1] + '</option>';
      }).join('') + '</select></label></div>' +
      '<div class="rs-lista">' + (items || '<p class="rs-nada">No hay reseñas con fotos todavía.</p>') + '</div>' +
      (l.length > mostrar ? '<button type="button" class="rs-mas" data-rs-mas>Ver más reseñas</button>' : '');
  }

  function formulario() {
    return '<form class="rs-form" data-rs-form hidden novalidate>' +
      '<h3>Escribe tu reseña</h3>' +
      '<p class="rs-verif-aviso" data-rs-verif hidden>✓ Compra verificada: tu reseña llevará esta etiqueta.</p>' +
      '<fieldset class="rs-elegir"><legend>Calificación *</legend>' + [1, 2, 3, 4, 5].map(function (n) {
        return '<input type="radio" name="estrellas" id="rs-e' + n + '" value="' + n + '" required><label for="rs-e' + n + '" title="' + n + ' de 5">★</label>';
      }).join('') + '</fieldset>' +
      '<label>Título <small>(opcional)</small><input name="titulo" maxlength="90" placeholder="Ej.: ¡Le quedó perfecto!"></label>' +
      '<label>Tu reseña *<textarea name="texto" rows="4" maxlength="1500" required minlength="10" placeholder="¿Qué talla pediste? ¿Cómo le quedó? ¿Qué tal en los paseos?"></textarea></label>' +
      '<div class="rs-dos"><label>Tu nombre *<input name="nombre" maxlength="60" required autocomplete="name"></label>' +
      '<label>Nombre de tu perrito <small>(opcional)</small><input name="mascota" maxlength="30"></label></div>' +
      '<label>Tu correo <small>(opcional, no se publica)</small><input name="correo" type="email" maxlength="160" autocomplete="email"></label>' +
      '<label class="rs-subir">📸 Agrega fotos de tu perrito <small>(opcional, hasta ' + MAX_FOTOS + ')</small><input name="foto" type="file" accept="image/*" multiple></label>' +
      '<div class="rs-previas" data-rs-previas hidden></div>' +
      '<input name="sitio" class="rs-trampa" tabindex="-1" autocomplete="off" aria-hidden="true">' +
      '<p class="rs-nota">Se publica con tu nombre y la inicial de tu apellido, después de que la revisemos.</p>' +
      '<p class="rs-error" data-rs-error role="alert" hidden></p>' +
      '<button type="submit" class="rs-btn">Enviar reseña</button></form>' +
      '<div class="rs-gracias" data-rs-gracias hidden role="status"><p><strong>¡Gracias! 🐾</strong> Tu reseña llegó. La publicamos apenas la revisemos.</p></div>';
  }

  function pintar() {
    caja.innerHTML = '<h2>Opiniones de los clientes</h2>' + pintarResumen() + formulario() + pintarLista();
    var mini = document.querySelector('[data-resenas-mini]');
    if (mini && datos.total) {
      mini.innerHTML = estrellas(datos.promedio) + ' <span>' + num(datos.promedio) + ' · ' + datos.total + (datos.total === 1 ? ' reseña' : ' reseñas') + '</span>';
      mini.hidden = false;
    }
  }

  // Fotos: cada una se reduce en el navegador a JPEG de máximo 1200 px antes de subirla
  function leerFoto(file, listo) {
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      var max = 1200, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
      var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      var q = 0.85, d = c.toDataURL('image/jpeg', q);
      while (d.length > 1e6 && q > 0.4) { q -= 0.15; d = c.toDataURL('image/jpeg', q); }
      URL.revokeObjectURL(url); listo(d);
    };
    img.onerror = function () { URL.revokeObjectURL(url); listo(''); };
    img.src = url;
  }
  function agregarFotos(lista) {
    var err = caja.querySelector('[data-rs-error]'), malas = 0, sobran = Math.max(0, fotos.length + lista.length - MAX_FOTOS);
    lista = lista.slice(0, Math.max(0, MAX_FOTOS - fotos.length));
    var pend = lista.length;
    function fin() {
      pintarPrevias();
      var msg = malas ? 'No pudimos leer ' + (malas === 1 ? 'una foto' : malas + ' fotos') + '. Prueba con JPG o PNG.' : (sobran ? 'Puedes subir hasta ' + MAX_FOTOS + ' fotos.' : '');
      err.hidden = !msg; err.textContent = msg;
    }
    if (!pend) return fin();
    lista.forEach(function (file) {
      leerFoto(file, function (d) { if (d && fotos.length < MAX_FOTOS) fotos.push(d); else if (!d) malas++; if (--pend === 0) fin(); });
    });
  }
  function pintarPrevias() {
    var box = caja.querySelector('[data-rs-previas]');
    box.hidden = !fotos.length;
    box.innerHTML = fotos.map(function (d, i) {
      return '<span class="rs-previa"><img src="' + d + '" alt="Foto ' + (i + 1) + ' que vas a subir"><button type="button" data-rs-quitar="' + i + '" aria-label="Quitar la foto ' + (i + 1) + '">✕</button></span>';
    }).join('');
    var inp = caja.querySelector('input[name=foto]'); if (inp) inp.disabled = fotos.length >= MAX_FOTOS;
  }

  // Pinta en dorado las estrellas hasta la elegida (o la que está bajo el dedo/ratón)
  function marcar(n) {
    caja.querySelectorAll('.rs-elegir label').forEach(function (l, i) { l.classList.toggle('on', i < n); });
  }
  caja.addEventListener('mouseover', function (e) { var l = e.target.closest && e.target.closest('.rs-elegir label'); if (l) marcar(+l.getAttribute('for').slice(4)); });
  caja.addEventListener('mouseout', function (e) {
    if (!e.target.closest || !e.target.closest('.rs-elegir')) return;
    var c = caja.querySelector('input[name=estrellas]:checked'); marcar(c ? +c.value : 0);
  });

  function abrirFormulario(scroll) {
    var f = caja.querySelector('[data-rs-form]');
    f.hidden = false;
    if (scroll) f.scrollIntoView({ behavior: 'smooth', block: 'start' });
    evento('resena_abrir', { producto: PRODUCTO });
  }

  caja.addEventListener('click', function (e) {
    var t = e.target;
    if (t.closest('[data-rs-escribir]')) return abrirFormulario(true);
    if (t.closest('[data-rs-mas]')) { mostrar += POR_PAGINA; pintarListaSola(); return; }
    var q = t.closest('[data-rs-quitar]');
    if (q) { fotos.splice(+q.getAttribute('data-rs-quitar'), 1); pintarPrevias(); return; }
    var f = t.closest('[data-rs-foto]');
    if (f) verFoto(f.getAttribute('data-rs-foto'));
  });
  caja.addEventListener('change', function (e) {
    if (e.target.matches('[data-rs-orden]')) { orden = e.target.value; mostrar = POR_PAGINA; pintarListaSola(); }
    if (e.target.name === 'estrellas') marcar(+e.target.value);
    if (e.target.name === 'foto') { agregarFotos(Array.prototype.slice.call(e.target.files || [])); e.target.value = ''; }
  });
  caja.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, err = f.querySelector('[data-rs-error]'), btn = f.querySelector('button[type=submit]');
    var est = f.querySelector('input[name=estrellas]:checked');
    function mal(m) { err.textContent = m; err.hidden = false; }
    if (!est) return mal('Elige de 1 a 5 estrellas');
    if (f.texto.value.trim().length < 10) return mal('Cuéntanos un poco más (mínimo 10 letras)');
    if (f.nombre.value.trim().length < 2) return mal('Escribe tu nombre');
    if (f.correo.value && !f.correo.checkValidity()) return mal('Revisa tu correo');
    err.hidden = true; btn.disabled = true; btn.textContent = 'Enviando…';
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      producto: PRODUCTO, estrellas: +est.value, titulo: f.titulo.value, texto: f.texto.value, nombre: f.nombre.value,
      mascota: f.mascota.value, correo: f.correo.value, fotos: fotos, invitacion: invitacion, sitio: f.sitio.value
    }) }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (x) {
      if (!x.ok) throw new Error(x.j.error || 'No se pudo enviar');
      f.hidden = true; caja.querySelector('[data-rs-gracias]').hidden = false;
      evento('resena_enviada', { producto: PRODUCTO, estrellas: +est.value, verificada: !!x.j.verificada });
    }).catch(function (er) {
      mal(er.message === 'Failed to fetch' ? 'No hay conexión. Intenta de nuevo.' : er.message);
      btn.disabled = false; btn.textContent = 'Enviar reseña';
    });
  });

  function pintarListaSola() {
    var vieja = caja.querySelector('.rs-barra-orden');
    if (!vieja) return pintar();
    while (vieja.nextSibling) caja.removeChild(vieja.nextSibling);
    caja.removeChild(vieja);
    caja.insertAdjacentHTML('beforeend', pintarLista());
  }

  function verFoto(src) {
    var o = document.createElement('div');
    o.className = 'rs-visor'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-label', 'Foto de la reseña');
    o.innerHTML = '<img src="' + esc(src) + '" alt="Foto de la reseña"><button type="button" aria-label="Cerrar">✕</button>';
    function cerrar() { o.remove(); document.removeEventListener('keydown', tecla); }
    function tecla(e) { if (e.key === 'Escape') cerrar(); }
    o.addEventListener('click', cerrar); document.addEventListener('keydown', tecla);
    document.body.appendChild(o);
  }

  // Datos para Google: agrega la calificación y las reseñas al producto de la página
  function datosGoogle() {
    if (!datos.total) return;
    document.querySelectorAll('script[type="application/ld+json"]').forEach(function (s) {
      var j; try { j = JSON.parse(s.textContent); } catch (e) { return; }
      var nodos = Array.isArray(j['@graph']) ? j['@graph'] : [j];
      var p = nodos.filter(function (n) { return n && n['@type'] === 'Product'; })[0];
      if (!p) return;
      p.aggregateRating = { '@type': 'AggregateRating', ratingValue: datos.promedio, reviewCount: datos.total, bestRating: 5, worstRating: 1 };
      p.review = datos.resenas.slice(0, 10).map(function (r) {
        return { '@type': 'Review', author: { '@type': 'Person', name: r.nombre }, datePublished: r.fecha.slice(0, 10),
          reviewRating: { '@type': 'Rating', ratingValue: r.estrellas, bestRating: 5 }, name: r.titulo || undefined, reviewBody: r.texto };
      });
      s.textContent = JSON.stringify(j);
    });
  }

  pintar();
  fetch(API + '?producto=' + encodeURIComponent(PRODUCTO)).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
    if (j && Array.isArray(j.resenas)) { datos = j; pintar(); datosGoogle(); }
    if (invitacion) return fetch(API + '?producto=' + encodeURIComponent(PRODUCTO) + '&invitacion=' + invitacion).then(function (r) { return r.json(); }).then(function (v) {
      abrirFormulario(true);
      var f = caja.querySelector('[data-rs-form]');
      if (v && v.valida) {
        caja.querySelector('[data-rs-verif]').hidden = false;
        if (v.nombre && !f.nombre.value) f.nombre.value = v.nombre;
        if (v.mascota && !f.mascota.value) f.mascota.value = v.mascota;
      } else invitacion = '';
    });
  }).catch(function () {});
})();
