import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ---------------- Configuración editable ----------------
const PRECIOS = {
  placaSola: 34900, placaSolaAntes: 44900,   // precio de lanzamiento / precio normal (tachado)
  placaConProducto: 24900,                   // precio de la placa al llevarla con collar, arnés o set
};
const PRODUCTOS = [
  { id: 'collar', nombre: 'Collar impermeable', corto: 'Collar', precio: 49900, antes: 58000, badge: ['Nuevo', 'lima'], url: '/collar-impermeable-perro/',
    texto: 'De goma suave, antiolor y fácil de limpiar. Con anillo para colgar la placa.' },
  { id: 'arnes', nombre: 'Arnés tipo H', corto: 'Arnés', precio: 72900, antes: 84900, badge: ['Más vendido', 'lima'], url: '/arnes-tipo-h-impermeable-perro/',
    texto: 'Diseño en H que no presiona el cuello. La placa va en el anillo del pecho.' },
  { id: 'set', nombre: 'Combo completo', corto: 'Combo completo', precio: 157900, antes: 184900, badge: ['Mejor valor', 'coral'], url: '/combo-collar-arnes-correa/', destacado: true,
    texto: 'Collar, arnés y correa impermeables a juego. Envío gratis en Bogotá.' },
];
const TIENDA = 'https://wuuffpuppy.co';
const ASSETS = JSON.parse(document.getElementById('assets-data').textContent);
const MAX_LETRAS = 10;
// Filamentos disponibles
const COLORES = [
  { id: 'morado', nombre: 'Morado', hex: '#6E4AA0' },
  { id: 'azul', nombre: 'Azul', hex: '#3160A6' },
  { id: 'blanco', nombre: 'Blanco', hex: '#F5F5F2' },
  { id: 'rojo', nombre: 'Rojo', hex: '#D3262E' },
];
const DISENOS = {
  huella: { nombre: 'Huella', base: 'azul', letras: 'blanco' },
  gato: { nombre: 'Gato', base: 'morado', letras: 'blanco' },
  nombre: { nombre: 'Nombre', base: 'blanco', letras: 'rojo' },
};
const geometria = (d, n) => d === 'nombre' ? G.placaSilueta(n) : G.placaFigura(d, n);

// ---------------- Estado ----------------
// Datos: en la vista previa van dentro de la página; en wuuffpuppy.co se cargan desde /placa-nfc/datos/
async function cargarJSON(id, url) {
  const el = document.getElementById(id), t = el && el.textContent.trim();
  return t ? JSON.parse(t) : (await fetch(url)).json();
}
const BASE_DATOS = document.documentElement.dataset.datos || '/placa-nfc/datos/';
const [GLYPHS, ILUS_DATA] = await Promise.all([cargarJSON('glyphs', BASE_DATOS + 'glyphs.json'), cargarJSON('ilus-data', BASE_DATOS + 'ilustraciones.json')]);
const G = window.WuuffGeom(window.ClipperLib, GLYPHS);
const estado = { nombre: 'Luna', diseno: 'huella', base: 'azul', letras: 'blanco', compra: 'sola', talla: 'M', rayosX: false };
const ILUS = ILUS_DATA;
const $ = s => document.querySelector(s);
const cop = n => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
const mm = (n, dec = 0) => n.toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const color = id => COLORES.find(c => c.id === id);

// ---------------- Escena 3D ----------------
const visor = $('#visor');
let renderer, labelRenderer, scene, camera, controls, modelo, anillo, nfcMesh, cotas;
let tieneWebGL = true;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let balanceo = !reduceMotion, t0 = performance.now();

function iniciar3D() {
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch (e) { tieneWebGL = false; return; }
  if (!renderer.getContext()) { tieneWebGL = false; return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  visor.prepend(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'Vista 3D de la placa. Arrastra para girarla.');
  renderer.domElement.setAttribute('role', 'img');

  labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = 'etiquetas';
  visor.appendChild(labelRenderer.domElement);

  scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;
  const luz = new THREE.DirectionalLight(0xffffff, 1.1); luz.position.set(-40, 80, 120); scene.add(luz);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc4d6, 0.35));

  camera = new THREE.PerspectiveCamera(28, 1, 1, 2000);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.enablePan = false;
  controls.minDistance = 55; controls.maxDistance = 260;
  controls.addEventListener('start', () => { balanceo = false; });

  const ro = new ResizeObserver(ajustarTamano); ro.observe(visor);
  ajustarTamano();
  renderer.setAnimationLoop(animar);
}

function ajustarTamano() {
  if (!renderer) return;
  const w = visor.clientWidth, h = visor.clientHeight;
  renderer.setSize(w, h, false); labelRenderer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  encuadrar(false);
}

let distanciaIdeal = 140;
function encuadrar(reiniciar) {
  if (!modelo || !camera) return;
  const b = modelo.userData.bb;
  const ancho = b.w + 48, alto = b.h + 34;  // margen para cotas y argolla
  const fov = camera.fov * Math.PI / 180;
  const dV = alto / 2 / Math.tan(fov / 2);
  const dH = ancho / 2 / Math.tan(fov / 2) / camera.aspect;
  distanciaIdeal = Math.max(dV, dH) * 1.05;
  if (reiniciar) {
    camera.position.set(0, -distanciaIdeal * 0.12, distanciaIdeal);
    controls.target.set(0, 0, 0);
    controls.update();
  }
}

function materialPLA(hex) {
  return new THREE.MeshPhysicalMaterial({ color: new THREE.Color(hex), roughness: 0.55, metalness: 0, envMapIntensity: 0.45, clearcoat: 0.15, clearcoatRoughness: 0.6 });
}

function extruir(paths, depth, z, material) {
  const shapes = G.formas(paths).map(f => {
    const s = new THREE.Shape(f.exterior.map(([x, y]) => new THREE.Vector2(x, y)));
    f.huecos.forEach(h => s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y)))));
    return s;
  });
  const geo = new THREE.ExtrudeGeometry(shapes, { depth, bevelEnabled: false, curveSegments: 1 });
  const m = new THREE.Mesh(geo, material); m.position.z = z; return m;
}

function texturaNFC() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#f4f1ea'; x.fillRect(0, 0, 256, 256);
  x.strokeStyle = '#b8732f'; x.lineWidth = 5;
  for (let i = 0; i < 6; i++) {
    const m = 46 + i * 10, r = 26;
    x.beginPath();
    if (x.roundRect) x.roundRect(m, m, 256 - 2 * m, 256 - 2 * m, r - i * 3); else x.rect(m, m, 256 - 2 * m, 256 - 2 * m);
    x.stroke();
  }
  x.fillStyle = '#3b3b40'; x.fillRect(116, 116, 24, 24);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const TEX_NFC = () => (TEX_NFC.t ||= texturaNFC());

function linea(puntos, mat) {
  return new THREE.Line(new THREE.BufferGeometry().setFromPoints(puntos.map(p => new THREE.Vector3(...p))), mat);
}
function etiqueta(texto, x, y, z, clase) {
  const d = document.createElement('div'); d.className = 'cota ' + (clase || ''); d.textContent = texto;
  const o = new CSS2DObject(d); o.position.set(x, y, z); return o;
}

function construirModelo(g, bb) {
  if (!scene) return;
  if (modelo) {
    modelo.traverse(o => { o.geometry?.dispose(); if (o.isCSS2DObject) o.element.remove(); });
    scene.remove(modelo);
  }
  modelo = new THREE.Group();
  const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
  const piezas = new THREE.Group(); piezas.position.set(-cx, -cy, -(g.grosor + g.altoLetras) / 2);

  const matBase = materialPLA(color(estado.base).hex);
  const base = extruir(g.base, g.grosor, 0, matBase); base.name = 'base';
  const letras = extruir(g.letras, g.altoLetras, g.grosor, materialPLA(color(estado.letras).hex));
  piezas.add(base, letras);

  if (g.nfc) {
    const r = g.nfc.d / 2;
    const disco = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.3, 64),
      [new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.8 }),
       new THREE.MeshStandardMaterial({ map: TEX_NFC(), roughness: 0.6 }),
       new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.8 })]);
    disco.rotation.x = Math.PI / 2; disco.position.set(g.nfc.x, g.nfc.y, g.nfc.z + 0.15);
    disco.visible = estado.rayosX; nfcMesh = disco; piezas.add(disco);
  }

  // argolla de referencia por el agujero
  const R = 8.5, tubo = 0.85, a = g.agujero;
  anillo = new THREE.Mesh(new THREE.TorusGeometry(R, tubo, 20, 96),
    new THREE.MeshStandardMaterial({ color: 0xcfd3da, metalness: 1, roughness: 0.22 }));
  anillo.rotation.y = Math.PI / 2;
  anillo.position.set(a.x, a.y + (a.d / 2 - tubo) + R, g.grosor / 2);
  piezas.add(anillo);
  modelo.add(piezas);

  // cotas (ancho abajo, alto a la derecha)
  cotas = new THREE.Group();
  const mat = new THREE.LineBasicMaterial({ color: getComputedStyle(document.documentElement).getPropertyValue('--navy').trim() || '#2d4375' });
  const w2 = bb.w / 2, h2 = bb.h / 2, z = -(g.grosor + g.altoLetras) / 2, yA = -h2 - 6, xA = w2 + 6, tk = 2;
  cotas.add(linea([[-w2, yA, z], [w2, yA, z]], mat), linea([[-w2, yA - tk, z], [-w2, yA + tk, z]], mat), linea([[w2, yA - tk, z], [w2, yA + tk, z]], mat));
  cotas.add(linea([[xA, -h2, z], [xA, h2, z]], mat), linea([[xA - tk, -h2, z], [xA + tk, -h2, z]], mat), linea([[xA - tk, h2, z], [xA + tk, h2, z]], mat));
  cotas.add(etiqueta(mm(bb.w) + ' mm', 0, yA - 4.5, z), etiqueta(mm(bb.h) + ' mm', xA + 8, 0, z, 'vertical'));
  modelo.add(cotas);

  modelo.userData.bb = bb;
  matBase.transparent = estado.rayosX; matBase.opacity = estado.rayosX ? 0.3 : 1; matBase.depthWrite = !estado.rayosX;
  scene.add(modelo);
}

function animar(t) {
  if (modelo && balanceo) {
    const s = (t - t0) / 1000;
    modelo.rotation.y = Math.sin(s * 0.7) * 0.32;
    modelo.rotation.x = Math.sin(s * 0.5) * 0.05;
  }
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

// Vista 2D de respaldo si no hay WebGL
function vista2D(g, bb) {
  visor.querySelector('.respaldo')?.remove();
  const div = document.createElement('div'); div.className = 'respaldo';
  div.innerHTML = svgDe(g, bb, 4) + '<p>Tu navegador no muestra 3D. Esta es la vista de frente.</p>';
  visor.appendChild(div);
}

// Miniaturas 2D de cada diseño con el nombre actual
function svgDe(g, bb, pad) {
  const W = bb.w + 2 * pad, H = bb.h + 2 * pad;
  const d = paths => G.formas(paths).map(f => [f.exterior, ...f.huecos].map(p => 'M' + p.map(([x, y]) => `${(x - bb.x0 + pad).toFixed(2)},${(bb.y1 - y + pad).toFixed(2)}`).join('L') + 'Z').join('')).join('');
  return `<svg viewBox="0 0 ${W.toFixed(2)} ${H.toFixed(2)}"><path fill-rule="evenodd" fill="${color(estado.base).hex}" stroke="rgba(0,0,0,.12)" stroke-width=".4" d="${d(g.base)}"/><path fill-rule="evenodd" fill="${color(estado.letras).hex}" d="${d(g.letras)}"/></svg>`;
}
function miniaturas(nombre) {
  for (const tipo of Object.keys(DISENOS)) {
    const g = geometria(tipo, nombre);
    $('#mini-' + tipo).innerHTML = svgDe(g, G.bounds(g.base), 1);
  }
  // placa colgada del collar en el boceto del inicio (y vista de cerca en la lupa)
  const g = geometria(estado.diseno, nombre), bb = G.bounds(g.base);
  const hx = (g.agujero.x - bb.x0) / bb.w * 100, hy = (bb.y1 - g.agujero.y) / bb.h * 100;
  const tag = $('#tag-hero'); tag.innerHTML = svgDe(g, bb, 0);
  tag.style.width = (22 * bb.w / 44).toFixed(2) + '%';
  tag.style.transform = `translate(-${hx.toFixed(1)}%, -${hy.toFixed(1)}%)`;
  $('#tag-lupa').innerHTML = svgDe(g, bb, 0);
}

// ---------------- Actualización ----------------
let ultimo = null;
function actualizar(reencuadrar) {
  const nombre = estado.nombre.trim() || 'Tu peludo';
  const g = geometria(estado.diseno, nombre);
  const bb = G.bounds(g.base);
  const grosorTotal = g.grosor + g.altoLetras;
  const volumen = G.area(g.base) * g.grosor + G.area(g.letras) * g.altoLetras;   // mm³
  const gramos = volumen / 1000 * 1.24 * 0.75;                                       // PLA, relleno típico
  ultimo = { g, bb, nombre, grosorTotal, gramos };

  $('#m-ancho').textContent = mm(bb.w) + ' mm';
  $('#m-alto').textContent = mm(bb.h) + ' mm';
  $('#m-grosor').textContent = mm(grosorTotal, 1) + ' mm';
  $('#m-peso').textContent = '≈ ' + mm(Math.max(1, Math.round(gramos))) + ' g';
  const prod = $('#prod'); if (prod) prod.textContent = textoProduccion();

  miniaturas(nombre);
  if (tieneWebGL && scene) { construirModelo(g, bb); encuadrar(reencuadrar); }
  else vista2D(g, bb);
  actualizarPrecio();
}

function textoProduccion() {
  const n = estado.nombre.trim(), c = `· base ${color(estado.base).nombre} · letras ${color(estado.letras).nombre}`;
  if (estado.diseno === 'nombre')
    return `llavero_nombre.scad · ajuste "Placa collar NFC (hueco arriba)" · nombre="${n}" ${c}`;
  return `placa_figura.scad · forma="${estado.diseno}" · nombre="${n}" · nfc="embebido" ${c}`;
}

function totales() {
  if (estado.compra === 'sola') return { total: PRECIOS.placaSola, antes: PRECIOS.placaSolaAntes, lineas: [['Placa NFC', PRECIOS.placaSola]] };
  const p = PRODUCTOS.find(x => x.id === estado.compra);
  return { total: p.precio + PRECIOS.placaConProducto, antes: p.antes + PRECIOS.placaSolaAntes, producto: p,
    lineas: [[`${p.corto} talla ${estado.talla}`, p.precio], ['Placa NFC', PRECIOS.placaConProducto]] };
}
function actualizarPrecio() {
  const t = totales();
  $('#total').textContent = cop(t.total);
  $('#antes').textContent = cop(t.antes);
  $('#desglose').innerHTML = t.lineas.map(([n, v]) => `<li><span>${n}</span><span>${cop(v)}</span></li>`).join('');
  $('#talla-wrap').hidden = estado.compra === 'sola';
  const TALLAS = { collar: ['cuello 20–34 cm', 'cuello 24–38 cm'], arnes: ['pecho 23–38 cm', 'pecho 32–53 cm'],
    set: ['cuello 20–34, pecho 23–38 cm', 'cuello 24–38, pecho 32–53 cm'] }[estado.compra];
  if (TALLAS) { $('#talla-s').textContent = '· ' + TALLAS[0]; $('#talla-m').textContent = '· ' + TALLAS[1]; }
  $('#resumen').hidden = true;
}
function pintarCompras() {
  const ops = [{ id: 'sola', nombre: 'Solo la placa', sub: `Precio normal <s>${cop(PRECIOS.placaSolaAntes)}</s>`, precio: PRECIOS.placaSola }]
    .concat(PRODUCTOS.map(p => ({ id: p.id, nombre: `Con ${p.id === 'set' ? 'el combo completo' : (p.id === 'arnes' ? 'un arnés' : 'un collar')}`,
      sub: `${p.corto} ${cop(p.precio)} + placa ${cop(PRECIOS.placaConProducto)}`, precio: p.precio + PRECIOS.placaConProducto })));
  $('#compras').innerHTML = ops.map(o => `<label class="compra"><input type="radio" name="compra" value="${o.id}"${o.id === estado.compra ? ' checked' : ''}>
    <span>${o.nombre}<small>${o.sub}</small></span><b>${cop(o.precio)}</b></label>`).join('');
  document.querySelectorAll('input[name="compra"]').forEach(r => r.addEventListener('change', () => { estado.compra = r.value; actualizarPrecio(); }));
}
function pintarProductos() {
  $('#productos').innerHTML = PRODUCTOS.map(p => `<article class="prod-card${p.destacado ? ' featured' : ''}">
    <div class="prod-img"><img src="${ASSETS.fotos[p.id]}" alt="${ASSETS.alts[p.id]}"></div>
    <div class="prod-body">
      <span class="badge ${p.badge[1]}">${p.badge[0]}</span>
      <h3 class="prod-name">${p.nombre}</h3>
      <p class="prod-desc">${p.texto}</p>
      <div class="prod-precios"><span class="price-old"><s>${cop(p.antes)}</s></span><span class="prod-price">${cop(p.precio)} COP</span></div>
      <span class="mas-placa">+ placa NFC por ${cop(PRECIOS.placaConProducto)}</span>
      <button type="button" class="btn-buy" data-prod="${p.id}">Llévalo con placa 🐾</button>
      <a class="ver-detalles" href="${TIENDA}${p.url}">Ver detalles y guía de tallas →</a>
    </div>
  </article>`).join('');
  document.querySelectorAll('[data-prod]').forEach(b => b.addEventListener('click', () => {
    estado.compra = b.dataset.prod;
    document.querySelector(`input[name="compra"][value="${estado.compra}"]`).checked = true;
    actualizarPrecio();
    $('#disena').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
  }));
}

// ---------------- Controles ----------------
function pintarSwatches(contenedor, clave) {
  const el = $(contenedor); el.innerHTML = '';
  COLORES.forEach(c => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'swatch'; b.style.setProperty('--c', c.hex);
    b.innerHTML = `<i></i>${c.nombre}`; b.dataset.id = c.id;
    b.setAttribute('aria-pressed', String(estado[clave] === c.id));
    b.addEventListener('click', () => { estado[clave] = c.id; refrescarSwatches(); avisoContraste(); actualizar(false); });
    el.appendChild(b);
  });
}
function refrescarSwatches() {
  document.querySelectorAll('#sw-base .swatch').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === estado.base)));
  document.querySelectorAll('#sw-letras .swatch').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === estado.letras)));
  $('#nom-base').textContent = color(estado.base).nombre;
  $('#nom-letras').textContent = color(estado.letras).nombre;
}
function luminancia(hex) {
  const v = [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16) / 255).map(c => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
function avisoContraste() {
  const a = luminancia(color(estado.base).hex), b = luminancia(color(estado.letras).hex);
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  $('#aviso-color').hidden = ratio >= 1.6;
}

const input = $('#nombre');
function validarNombre(v) {
  const malos = [...new Set([...v].filter(ch => !G.soportado(ch)))];
  const msg = $('#aviso-nombre');
  if (malos.length) { msg.textContent = `Estos caracteres no se pueden imprimir: ${malos.join(' ')}. Usa letras, números, espacios, guion o apóstrofo.`; msg.hidden = false; }
  else if (!v.trim()) { msg.textContent = 'Escribe el nombre de tu mascota.'; msg.hidden = false; }
  else msg.hidden = true;
  return [...v].filter(ch => G.soportado(ch)).join('');
}
let tempo;
input.addEventListener('input', () => {
  const limpio = validarNombre(input.value).slice(0, MAX_LETRAS);
  $('#contador').textContent = `${[...input.value].length}/${MAX_LETRAS}`;
  estado.nombre = limpio;
  clearTimeout(tempo); tempo = setTimeout(() => actualizar(true), 90);
});

document.querySelectorAll('input[name="diseno"]').forEach(r => r.addEventListener('change', () => {
  estado.diseno = r.value;
  estado.base = DISENOS[r.value].base; estado.letras = DISENOS[r.value].letras;
  refrescarSwatches(); avisoContraste(); actualizar(true);
}));
document.querySelectorAll('input[name="talla"]').forEach(r => r.addEventListener('change', () => { estado.talla = r.value; actualizarPrecio(); }));

$('#btn-frente').addEventListener('click', () => { balanceo = false; modelo && (modelo.rotation.set(0, 0, 0)); encuadrar(true); });
$('#btn-reverso').addEventListener('click', () => { balanceo = false; if (modelo) modelo.rotation.set(0, Math.PI, 0); encuadrar(true); });
$('#btn-nfc').addEventListener('click', e => {
  estado.rayosX = !estado.rayosX; e.currentTarget.setAttribute('aria-pressed', String(estado.rayosX));
  actualizar(false);
});

$('#btn-agregar').addEventListener('click', () => {
  if (!estado.nombre.trim()) { input.focus(); validarNombre(''); return; }
  const r = ultimo, t = totales();
  // En wuuffpuppy.co: lleva al mismo pago de la tienda (/?comprar=placa → modal de envío + Wompi o contraentrega)
  if (/wuuffpuppy\.co$/.test(location.hostname) || location.hostname.endsWith('.netlify.app')) {
    const q = new URLSearchParams({ comprar: 'placa', forma: estado.diseno, nombre: estado.nombre.trim(), base: estado.base, letras: estado.letras,
      con: estado.compra === 'set' ? 'combo' : estado.compra, talla: estado.compra === 'sola' ? '' : estado.talla });
    try { if (window.gtag) gtag('event', 'placa_comprar', { forma: estado.diseno, con: estado.compra }); } catch (e) {}
    location.href = '/?' + q.toString();
    return;
  }
  const filas = [
    ['Placa', `NFC · forma ${DISENOS[estado.diseno].nombre.toLowerCase()}`],
    ['Nombre', estado.nombre.trim()],
    ['Colores', `Base ${color(estado.base).nombre} · letras ${color(estado.letras).nombre}`],
    ['Medidas', `${mm(r.bb.w)} × ${mm(r.bb.h)} × ${mm(r.grosorTotal, 1)} mm`],
    ...(t.producto ? [['Con', `${t.producto.corto} talla ${estado.talla}`]] : []),
    ['Total', cop(t.total)],
  ];
  $('#resumen-lista').innerHTML = filas.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  $('#resumen').hidden = false;
  $('#resumen').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'nearest' });
  $('#resumen-texto').value = 'Pedido Wuuff Puppy\n' + filas.map(([k, v]) => `${k}: ${v}`).join('\n');
});
$('#btn-copiar').addEventListener('click', async () => {
  const ta = $('#resumen-texto'); const ok = $('#copiado');
  try { await navigator.clipboard.writeText(ta.value); ok.textContent = 'Resumen copiado.'; }
  catch (e) { ta.hidden = false; ta.select(); ok.textContent = 'Selecciona el texto y cópialo.'; }
});


// ---------------- Inicio ----------------
pintarSwatches('#sw-base', 'base'); pintarSwatches('#sw-letras', 'letras'); refrescarSwatches();
input.value = estado.nombre; $('#contador').textContent = `${estado.nombre.length}/${MAX_LETRAS}`;
['#hero-precio', '#combo-precio', '#faq-con'].forEach(s => $(s).textContent = cop(PRECIOS.placaConProducto));
['#faq-sola', '#hero-sola'].forEach(s => $(s).textContent = cop(PRECIOS.placaSola));
$('#hero-antes').textContent = cop(PRECIOS.placaSolaAntes);
document.querySelectorAll('[data-ilus]').forEach(el => el.innerHTML = ILUS[el.dataset.ilus]);
$('#img-boceto').src = ASSETS.boceto; $('#img-pastor').src = ASSETS.pastor;
pintarCompras(); pintarProductos();
iniciar3D();
actualizar(true);
document.documentElement.classList.add('listo');
