"""Recorre la web, genera images/web/*.webp con marca de agua y cambia las referencias visibles.
No toca: og:image / twitter:image, JSON-LD, catalogo-meta.csv, sitemap, llms.txt (Google y Meta
rechazan fotos de catálogo con marca de agua), ni logos, ilustraciones, tablas de tallas o videos."""
import os, re, sys, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from marca import procesar

R = sys.argv[1]
os.chdir(R)

FOTO = re.compile(r'''(?<![\w.:/-])(/?)(images/(?:opt/)?[A-Za-z0-9_\-/]+\.(?:jpe?g|png|webp))''', re.I)
EXCLUIR = re.compile(r'(wuuff-puppy(-2)?\.png|favicon|/og-|tallas-|arecito|chawi|guardian\.(png|webp)|lucas|images/web/|-nuevo\.(png)$|de-goma\.png)', re.I)


def es_foto(p):
    return not EXCLUIR.search(p)


def origen_de(p):
    """Mejor fuente: el original grande si existe (sin pasar por opt/)."""
    if '/opt/' in p:
        base = os.path.splitext(p.replace('images/opt/', 'images/'))[0]
        for ext in ('.jpg', '.jpeg', '.png', '.webp'):
            if os.path.exists(base + ext) and base + ext != p:
                return base + ext
    return p


def destino_de(p):
    rel = os.path.splitext(p.replace('images/opt/', 'images/').replace('images/', '', 1))[0]
    return 'images/web/' + rel + '.webp'


# Zonas que no se tocan dentro de los HTML
PROTEGIDO = re.compile(r'(<script type="application/ld\+json">.*?</script>|<meta [^>]*>)', re.S | re.I)

archivos = [f for f in glob.glob('**/*.html', recursive=True) + glob.glob('assets/*.js') + glob.glob('assets/*.css')
            if not f.startswith(('node_modules', 'panel/', '.git'))]
hechos, cambios = {}, 0
for f in archivos:
    t = open(f, encoding='utf-8').read()
    partes = PROTEGIDO.split(t)
    nuevo = []
    for i, trozo in enumerate(partes):
        if trozo and PROTEGIDO.fullmatch(trozo):
            nuevo.append(trozo); continue
        def rep(m):
            global cambios
            p = m.group(2)
            if not es_foto(p) or not os.path.exists(p):
                return m.group(0)
            d = destino_de(p)
            if d not in hechos:
                hechos[d] = procesar(R, origen_de(p), d)
            cambios += 1
            return m.group(1) + d
        nuevo.append(FOTO.sub(rep, trozo or ''))
    t2 = ''.join(nuevo)
    if t2 != t:
        open(f, 'w', encoding='utf-8').write(t2)
        print('editado', f)
print(len(hechos), 'fotos generadas,', cambios, 'referencias,', sum(hechos.values()) // 1024, 'KB en total')
