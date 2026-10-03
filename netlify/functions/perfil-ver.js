// Perfil público de la mascota: lo que se abre al acercar el celular a la placa NFC.
// URL: https://wuuffpuppy.co/m/<id>  (redirección en netlify.toml)
// Siempre está disponible y no se indexa en buscadores: solo llega quien escanea la placa.
const { getStore, connectLambda } = require('@netlify/blobs');

// El código del perfil puede llegar como ?id=… (redirección de netlify.toml), en la ruta de la función
// (/.netlify/functions/perfil-ver/<código>) o en la dirección original que abrió el celular (/m/<código>).
function codigoPerfil(event) {
  const q = (event.queryStringParameters || {}).id;
  const fuentes = [q, event.path, event.rawUrl, (event.headers || {})['x-nf-original-path'], (event.headers || {})['x-original-uri']];
  for (const f of fuentes) {
    if (!f) continue;
    const m = /(?:^|\/m\/|perfil-(?:ver|foto)\/)([A-Za-z0-9]{6,16})(?:\/foto)?\/?(?:[?#]|$)/.exec(String(f));
    if (m) return m[1].toUpperCase();
  }
  return '';
}

const TIENDA_WA = '573176431286';
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function esc(v) {
  return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function digitos(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (d.length === 10 && d[0] === '3') d = '57' + d;
  return d;
}
function telBonito(tel) {
  const d = String(tel || '').replace(/\D/g, '');
  if (d.length === 10) return d.slice(0, 3) + ' ' + d.slice(3, 6) + ' ' + d.slice(6);
  return String(tel || '');
}
function fechaBonita(s) {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(s || '');
  if (!m) return '';
  return (m[3] ? parseInt(m[3], 10) + ' ' : '') + MESES[parseInt(m[2], 10) - 1] + ' ' + m[1];
}
function edad(nac) {
  const m = /^(\d{4})-(\d{2})/.exec(nac || '');
  if (!m) return '';
  const hoy = new Date();
  let meses = (hoy.getFullYear() - parseInt(m[1], 10)) * 12 + (hoy.getMonth() + 1 - parseInt(m[2], 10));
  if (meses < 0) return '';
  const a = Math.floor(meses / 12), r = meses % 12;
  const pa = a ? a + (a === 1 ? ' año' : ' años') : '';
  const pm = r ? r + (r === 1 ? ' mes' : ' meses') : '';
  return pa && pm ? pa + ' y ' + pm : (pa || pm || 'Menos de 1 mes');
}
function item(k, v, ancho, regular) {
  if (!v) return '';
  return '<div class="item' + (ancho ? ' wide' : '') + '"><div class="k">' + k + '</div><div class="v' + (regular ? ' regular' : '') + '">' + esc(v) + '</div></div>';
}

const CSS = `
:root{--wuff-blue:#4964af;--wuff-blue-dark:#37508f;--wuff-coral:#f17d57;--wuff-coral-dark:#d95f39;--wuff-cream:#f9f0ee;--ink:#2a3149;--muted:#6d7488;--surface:#fff;--line:#e9ddd6;--whatsapp:#1fa855;--radius:16px;--shadow:0 2px 6px rgba(42,49,73,.07),0 10px 30px rgba(42,49,73,.07)}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--wuff-cream);color:var(--ink);font-family:"Nunito Sans",system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.55}
h1,h2{font-family:"Baloo 2","Nunito Sans",sans-serif;line-height:1.15;margin:0}a{color:var(--wuff-blue)}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:16px 20px;border:none;border-radius:14px;font:700 1.05rem "Nunito Sans",sans-serif;text-decoration:none;cursor:pointer}
.btn:active{transform:scale(.98)}.btn-call{background:var(--wuff-blue);color:#fff}.btn-wa{background:var(--whatsapp);color:#fff}
.btn-loc{background:#fff;color:var(--wuff-coral-dark);border:2px solid var(--wuff-coral)}
.profile{max-width:560px;margin:0 auto;padding:0 0 110px}
.hero{position:relative}
.hero .photo{width:100%;aspect-ratio:1/.95;object-fit:cover;display:block;border-radius:0 0 28px 28px;background:#d8d2e8}
.hero .photo-placeholder{width:100%;aspect-ratio:1/.8;display:flex;align-items:center;justify-content:center;font-size:6rem;border-radius:0 0 28px 28px;background:linear-gradient(160deg,var(--wuff-blue),var(--wuff-blue-dark))}
.hero .veil{position:absolute;inset:55% 0 0 0;border-radius:0 0 28px 28px;background:linear-gradient(180deg,transparent,rgba(20,24,40,.75))}
.hero .title{position:absolute;left:20px;right:20px;bottom:18px;color:#fff}
.hero .title h1{font-size:2.2rem;font-weight:700;text-shadow:0 2px 12px rgba(0,0,0,.4)}
.hero .badge{display:inline-flex;align-items:center;gap:6px;margin-top:4px;padding:4px 12px;background:rgba(255,255,255,.18);backdrop-filter:blur(6px);border-radius:99px;font-size:.78rem;font-weight:700;letter-spacing:.03em}
.section{margin:18px 16px 0}.card{background:var(--surface);border-radius:var(--radius);box-shadow:var(--shadow);padding:18px}
.card h2{font-size:1.15rem;display:flex;align-items:center;gap:8px;margin-bottom:10px}
.cta{border:2.5px solid var(--wuff-coral)}.cta h2{color:var(--wuff-coral-dark)}.cta p{margin:0 0 14px;color:var(--muted);font-size:.95rem}
.cta .buttons{display:grid;gap:10px}.cta .phone-visible{text-align:center;font-size:1.3rem;font-weight:800;letter-spacing:.02em;margin:2px 0 12px}
.cta .phone-visible a{color:var(--ink);text-decoration:none}.cta .subnote{font-size:.82rem;color:var(--muted);margin-top:10px;text-align:center}
.kv{display:grid;grid-template-columns:1fr 1fr;gap:10px 14px}.kv .item{background:var(--wuff-cream);border-radius:12px;padding:10px 12px}
.kv .k{font-size:.72rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}.kv .v{font-weight:700;margin-top:1px;overflow-wrap:anywhere}
.kv .item.wide{grid-column:1/-1}.kv .v.regular{font-weight:400}
.vax-table{width:100%;border-collapse:collapse;font-size:.9rem}
.vax-table th{text-align:left;font-size:.7rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);padding:6px 8px;border-bottom:2px solid var(--line)}
.vax-table td{padding:9px 8px;border-bottom:1px solid var(--line)}.vax-table tr:last-child td{border-bottom:none}
.profile-footer{margin:34px 16px 0;text-align:center;color:var(--muted);font-size:.85rem}
.profile-footer .logo{font-family:"Baloo 2",sans-serif;font-weight:700;color:var(--wuff-blue);text-decoration:none}
.sticky-bar{position:fixed;left:0;right:0;bottom:0;z-index:50;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:12px 16px calc(12px + env(safe-area-inset-bottom));background:rgba(249,240,238,.9);backdrop-filter:blur(10px);border-top:1px solid var(--line);max-width:560px;margin:0 auto}
.sticky-bar.una{grid-template-columns:1fr}.sticky-bar .btn{padding:13px 10px;font-size:.98rem}
.status-page{min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:32px 24px}
.status-page .icon{font-size:4rem;margin-bottom:10px}.status-page h1{font-size:1.6rem;margin-bottom:8px;max-width:22ch}
.status-page p{color:var(--muted);max-width:38ch;margin:0 0 20px}.status-page .btn{max-width:320px}`;

function pagina(titulo, cuerpo) {
  return '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">' +
    '<meta name="robots" content="noindex, nofollow"><meta name="theme-color" content="#4964af">' +
    '<title>' + esc(titulo) + '</title><link rel="icon" type="image/svg+xml" href="/images/favicon.svg">' +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Baloo+2:wght@500;600;700&family=Nunito+Sans:ital,wght@0,400;0,700;0,800;1,400&display=swap">' +
    '<style>' + CSS + '</style></head><body>' + cuerpo + '</body></html>';
}

function noEncontrado(id) {
  const wa = 'https://wa.me/' + TIENDA_WA + '?text=' + encodeURIComponent('Hola, encontré una mascota con una placa Wuuff Puppy y quiero ayudar a que vuelva a casa.');
  return pagina('Placa Wuuff Puppy', '<main class="status-page"><div class="icon">🐾</div>' +
    '<h1>Esta placa aún no tiene un perfil activo</h1>' +
    '<p>Si encontraste a una mascota con esta placa, escríbenos y te ayudamos a contactar a su familia.</p>' +
    '<a class="btn btn-wa" href="' + wa + '">💬 Escribir a Wuuff Puppy</a>' +
    '<p style="margin-top:22px;font-size:.75rem;opacity:.6">Código de la placa: ' + esc(id || 'sin código') + '</p></main>');
}

function perfilHTML(p) {
  const m = p.mascota || {}, c = p.contacto || {}, s = p.salud || {}, v = p.veterinaria || {};
  const nombre = m.nombre || 'Esta mascota';
  const lo = m.sexo === 'Hembra' ? 'la' : 'lo';
  const tel = digitos(c.telefono);
  const msg = 'Hola, encontré a ' + nombre + ' gracias a su placa Wuuff Puppy 🐾';
  const wa = 'https://wa.me/' + tel + '?text=' + encodeURIComponent(msg);
  const conWa = c.whatsapp !== false;
  const emoji = m.especie === 'Gato' ? '🐱' : '🐶';

  const foto = p.foto
    ? '<img class="photo" src="/m/' + esc(p.id) + '/foto?v=' + esc(p.foto) + '" alt="Foto de ' + esc(nombre) + '">'
    : '<div class="photo-placeholder" aria-hidden="true">' + emoji + '</div>';

  let familia = 'Su familia';
  if (c.nombre) familia += ' (' + esc(c.nombre) + ')';
  if (m.ciudad) familia += ' en ' + esc(m.ciudad);

  let html = '<main class="profile"><header class="hero">' + foto + '<div class="veil"></div><div class="title">' +
    '<h1>🐾 ' + esc(nombre) + '</h1><span class="badge">🛡️ Perfil protegido por Wuuff Puppy</span></div></header>';

  // Contacto
  html += '<section class="section"><div class="card cta"><h2>📞 ¿Encontraste a ' + esc(nombre) + '?</h2>' +
    '<p>' + familia + ' ' + lo + ' está esperando. Contacta a su familia:</p>' +
    '<div class="phone-visible"><a href="tel:+' + tel + '">' + esc(telBonito(c.telefono)) + '</a></div>' +
    '<div class="buttons"><a class="btn btn-call" href="tel:+' + tel + '">📞 Llamar</a>' +
    (conWa ? '<a class="btn btn-wa" href="' + esc(wa) + '">💬 WhatsApp</a>' : '') +
    (conWa ? '<button type="button" class="btn btn-loc" id="ubicacion">📍 Enviar mi ubicación por WhatsApp</button>' : '') +
    '</div>' +
    (c.telefono2 ? '<p class="subnote">Otro teléfono: <a href="tel:+' + digitos(c.telefono2) + '">' + esc(telBonito(c.telefono2)) + '</a></p>' : '') +
    '</div></section>';

  // Información de la mascota
  const info = item('Especie', m.especie) + item('Raza', m.raza) + item('Sexo', m.sexo) + item('Edad', edad(m.nacimiento)) +
    item('Color', m.color) + item('Esterilizado', m.esterilizado) + item('Ciudad', m.ciudad) +
    item('Señas particulares', m.senas, true, true) + item('Descripción', m.descripcion, true, true);
  html += '<section class="section"><div class="card"><h2>' + emoji + ' Información de la mascota</h2><div class="kv">' + info + '</div></div></section>';

  // Salud
  const salud = item('Alergias', s.alergias, true, true) + item('Condiciones especiales', s.condiciones, true, true) + item('Medicamentos', s.medicamentos, true, true);
  if (salud) html += '<section class="section"><div class="card"><h2>❤️ Información importante</h2><div class="kv">' + salud + '</div></div></section>';

  // Vacunas
  if (p.vacunas && p.vacunas.length) {
    html += '<section class="section"><div class="card"><h2>💉 Vacunas</h2><table class="vax-table"><thead><tr><th>Vacuna</th><th>Fecha</th><th>Próxima dosis</th></tr></thead><tbody>' +
      p.vacunas.map(function (x) {
        return '<tr><td><b>' + esc(x.nombre) + '</b>' + (x.lugar ? '<div style="color:var(--muted);font-size:.8rem">' + esc(x.lugar) + '</div>' : '') +
          '</td><td>' + esc(fechaBonita(x.fecha)) + '</td><td>' + esc(fechaBonita(x.proxima)) + '</td></tr>';
      }).join('') + '</tbody></table></div></section>';
  }

  // Veterinaria
  if (v.nombre || v.telefono) {
    html += '<section class="section"><div class="card"><h2>🩺 Información veterinaria</h2><div class="kv">' +
      item('Veterinaria', v.nombre) +
      (v.telefono ? '<div class="item"><div class="k">Teléfono</div><div class="v"><a href="tel:+' + digitos(v.telefono) + '">' + esc(telBonito(v.telefono)) + '</a></div></div>' : '') +
      item('Dirección', v.direccion, true, true) + '</div></div></section>';
  }

  html += '<footer class="profile-footer"><p>Perfil creado con <a class="logo" href="https://wuuffpuppy.co/placa-nfc/">🐾 Wuuff Puppy</a><br>Pequeños detalles que dicen te quiero.</p></footer>';
  html += '<div class="sticky-bar' + (conWa ? '' : ' una') + '"><a class="btn btn-call" href="tel:+' + tel + '">📞 Llamar</a>' +
    (conWa ? '<a class="btn btn-wa" href="' + esc(wa) + '">💬 WhatsApp</a>' : '') + '</div></main>';

  // Enviar la ubicación de quien la encontró (pide permiso; si no lo da, abre WhatsApp sin ubicación)
  if (conWa) {
    html += '<script>(function(){var b=document.getElementById("ubicacion");if(!b)return;' +
      'var base=' + JSON.stringify('https://wa.me/' + tel + '?text=') + ',msg=' + JSON.stringify(msg + '. Estoy aquí: ') + ';' +
      'function abrir(t){location.href=base+encodeURIComponent(t);}' +
      'b.addEventListener("click",function(){if(!navigator.geolocation){abrir(' + JSON.stringify(msg) + ');return;}' +
      'b.textContent="📍 Obteniendo tu ubicación…";' +
      'navigator.geolocation.getCurrentPosition(function(p){abrir(msg+"https://maps.google.com/?q="+p.coords.latitude.toFixed(6)+","+p.coords.longitude.toFixed(6));},' +
      'function(){abrir(' + JSON.stringify(msg) + ');},{enableHighAccuracy:true,timeout:10000});});})();</script>';
  }
  return pagina(nombre + ' · Perfil Wuuff Puppy', html);
}

exports.handler = async function (event) {
  const id = codigoPerfil(event);
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' };
  let perfil = null;
  if (/^[A-Z0-9]{6,16}$/.test(id)) {
    try {
      connectLambda(event);
      const store = getStore('perfiles-nfc');
      perfil = await store.get(id, { type: 'json' });
      // Un perfil recién creado puede tardar unos segundos en verse: se intenta una vez más
      if (!perfil) {
        await new Promise(function (r) { setTimeout(r, 1500); });
        perfil = await store.get(id, { type: 'json' });
      }
    } catch (err) {
      console.error('No se pudo leer el perfil', id, err.message);
    }
  }
  if (!perfil) console.log('Perfil no encontrado', JSON.stringify({ id: id, q: event.queryStringParameters, path: event.path, rawUrl: event.rawUrl }));
  if (!perfil || perfil.activo === false) return { statusCode: 404, headers: headers, body: noEncontrado(id) };
  return { statusCode: 200, headers: headers, body: perfilHTML(perfil) };
};
