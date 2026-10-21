// Fecha estimada de entrega según la forma de pago (hora de Colombia, sin fines de semana ni festivos).
// La usan las fichas de producto (caja "¿Cuándo te llega?") y el formulario de envío de la página de inicio.
(function () {
  // Reglas: cámbialas aquí si cambian los tiempos de despacho o de la transportadora.
  var CFG = {
    corteHora: 14,              // pedidos antes de las 2:00 p. m. de un día hábil se procesan ese mismo día
    contraentrega: [1, 2],      // días hábiles desde el día en que se procesa (solo Bogotá)
    lineaBogota: [2, 3],        // pago en línea, Bogotá y Soacha
    lineaOtras: [3, 6]          // pago en línea, resto de Colombia
  };
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var DIA = 864e5;

  function utc(y, m, d) { return new Date(Date.UTC(y, m, d)); }
  function mas(d, n) { return new Date(d.getTime() + n * DIA); }
  function clave(d) { return d.toISOString().slice(0, 10); }

  // Domingo de Pascua (algoritmo de Meeus/Jones/Butcher)
  function pascua(y) {
    var a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4,
      f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30,
      i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451),
      mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
    return utc(y, mes - 1, dia);
  }
  // Ley Emiliani: el festivo se corre al lunes siguiente
  function alLunes(d) { var w = d.getUTCDay(); return w === 1 ? d : mas(d, (8 - w) % 7); }

  var cache = {};
  function festivos(y) {
    if (cache[y]) return cache[y];
    var p = pascua(y), f = {};
    [[0, 1], [4, 1], [6, 20], [7, 7], [11, 8], [11, 25]].forEach(function (x) { f[clave(utc(y, x[0], x[1]))] = 1; });
    [[0, 6], [2, 19], [5, 29], [7, 15], [9, 12], [10, 1], [10, 11]].forEach(function (x) { f[clave(alLunes(utc(y, x[0], x[1])))] = 1; });
    [-3, -2, 43, 64, 71].forEach(function (n) { f[clave(mas(p, n))] = 1; }); // Semana Santa, Ascensión, Corpus, Sagrado Corazón
    return (cache[y] = f);
  }
  function habil(d) { var w = d.getUTCDay(); return w !== 0 && w !== 6 && !festivos(d.getUTCFullYear())[clave(d)]; }
  function sumarHabiles(d, n) { while (n > 0) { d = mas(d, 1); if (habil(d)) n--; } return d; }

  // "Ahora" en Bogotá (UTC-5, sin horario de verano), leído con los métodos UTC
  function ahora() { return new Date(Date.now() - 5 * 36e5); }

  function estado() {
    var n = ahora(), hoy = utc(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
    var antesDelCorte = habil(hoy) && n.getUTCHours() < CFG.corteHora;
    var base = antesDelCorte ? hoy : sumarHabiles(hoy, 1);
    var faltan = antesDelCorte ? (CFG.corteHora * 60) - (n.getUTCHours() * 60 + n.getUTCMinutes()) : 0;
    return { hoy: hoy, base: base, faltanMin: faltan };
  }

  // tipo: 'contraentrega' | 'bogota' | 'otras'
  function rango(tipo) {
    var r = tipo === 'contraentrega' ? CFG.contraentrega : tipo === 'bogota' ? CFG.lineaBogota : CFG.lineaOtras;
    var e = estado();
    return { desde: sumarHabiles(e.base, r[0]), hasta: sumarHabiles(e.base, r[1]) };
  }

  function fecha(d, conMes) { return DIAS[d.getUTCDay()] + ' ' + d.getUTCDate() + (conMes ? ' de ' + MESES[d.getUTCMonth()] : ''); }
  function textoRango(r) {
    if (clave(r.desde) === clave(r.hasta)) return 'el ' + fecha(r.desde, true);
    var mismoMes = r.desde.getUTCMonth() === r.hasta.getUTCMonth();
    return 'entre el ' + fecha(r.desde, !mismoMes) + ' y el ' + fecha(r.hasta, true);
  }
  function textoReloj() {
    var e = estado();
    if (e.faltanMin > 0) {
      var h = Math.floor(e.faltanMin / 60), m = e.faltanMin % 60;
      return '⏰ Pide en las próximas <b>' + (h ? h + ' h ' : '') + m + ' min</b> y lo preparamos hoy mismo';
    }
    return '⏰ Si pides ahora, lo preparamos el <b>' + fecha(e.base, true) + '</b>';
  }

  window.wuuffEntrega = { rango: rango, textoRango: textoRango, textoReloj: textoReloj, festivos: festivos, config: CFG };

  // Caja "¿Cuándo te llega?" en las fichas de producto: <div data-entrega></div>
  function pintar(caja) {
    var pago = caja.getAttribute('data-pago') || 'contraentrega';
    var res = pago === 'contraentrega'
      ? '<p class="cl-linea"><span>Bogotá</span><strong>Te llega ' + textoRango(rango('contraentrega')) + '</strong></p>' +
        '<p class="cl-nota">💵 Pagas en efectivo cuando lo recibes. Te confirmamos por WhatsApp antes de enviarlo.</p>'
      : '<p class="cl-linea"><span>Bogotá y Soacha</span><strong>Te llega ' + textoRango(rango('bogota')) + '</strong></p>' +
        '<p class="cl-linea"><span>Otras ciudades</span><strong>Te llega ' + textoRango(rango('otras')) + '</strong></p>' +
        '<p class="cl-nota">💳 Tarjeta, PSE, Nequi, Daviplata o Bancolombia con Wompi.</p>';
    caja.innerHTML =
      '<p class="cl-titulo">📅 ¿Cuándo te llega?</p>' +
      '<div class="cl-tabs" role="group" aria-label="Forma de pago">' +
        '<button type="button" data-p="contraentrega" aria-pressed="' + (pago === 'contraentrega') + '">💵 Pago al recibir</button>' +
        '<button type="button" data-p="linea" aria-pressed="' + (pago !== 'contraentrega') + '">💳 Pago en línea</button>' +
      '</div>' +
      '<div class="cl-res" aria-live="polite">' + res + '</div>' +
      '<p class="cl-reloj">' + textoReloj() + '</p>';
  }
  function iniciar() {
    var cajas = document.querySelectorAll('[data-entrega]');
    if (!cajas.length) return;
    cajas.forEach(function (c) {
      pintar(c);
      c.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-p]');
        if (!b) return;
        c.setAttribute('data-pago', b.getAttribute('data-p'));
        pintar(c);
        try { if (window.gtag) gtag('event', 'entrega_ver', { pago: b.getAttribute('data-p') }); } catch (err) {}
      });
    });
    setInterval(function () { cajas.forEach(pintar); }, 30000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
