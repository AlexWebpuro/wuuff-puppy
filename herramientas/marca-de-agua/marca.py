"""Marca de agua Wuuff Puppy + versiones livianas (WebP) para las fotos de la web.

Uso: python3 marca.py <repo> [--solo a,b,c]  (rutas relativas a images/)
Genera images/web/<misma ruta>.webp, lado largo máx. 1000 px, con la marca abajo a la derecha.
"""
import os, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageStat

AQUI = os.path.dirname(os.path.abspath(__file__))
FUENTE = os.path.join(AQUI, 'nunito900.ttf')
if not os.path.exists(FUENTE):  # se crea a partir de la fuente de la web (requiere: pip install fonttools brotli)
    from fontTools.ttLib import TTFont
    _f = TTFont(os.path.join(AQUI, '../../assets/fonts/nunito-latin-900-normal.woff2')); _f.flavor = None; _f.save(FUENTE)
LADO_MAX = 1000
CALIDAD = 80
AZUL = (73, 100, 175)


def construir_marca(repo, alto, color):
    """Isotipo + 'wuuffpuppy.co' en un solo color, sobre fondo transparente."""
    logo = Image.open(os.path.join(repo, 'images/wuuff-puppy-2.png')).convert('RGBA')
    lh = alto
    logo = logo.resize((round(logo.width * lh / logo.height), lh), Image.LANCZOS)
    a = logo.getchannel('A')
    logo = Image.new('RGBA', logo.size, color + (255,))
    logo.putalpha(a)
    f = ImageFont.truetype(FUENTE, round(alto * 0.62))
    tw = round(f.getlength('wuuffpuppy.co'))
    gap = round(alto * 0.28)
    W, H = logo.width + gap + tw, alto
    m = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    m.paste(logo, (0, 0), logo)
    d = ImageDraw.Draw(m)
    asc, desc = f.getmetrics()
    d.text((logo.width + gap, (H - (asc + desc)) // 2 + round(alto * 0.04)), 'wuuffpuppy.co', font=f, fill=color + (255,))
    return m


def poner_marca(repo, im):
    im = im.convert('RGB')
    if max(im.size) > LADO_MAX:
        k = LADO_MAX / max(im.size)
        im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    corto = min(im.size)
    alto = max(16, round(corto * 0.055))
    margen = round(corto * 0.035)
    # ¿La esquina es clara (foto de producto en fondo blanco)? -> marca azul; si no, blanca con sombra
    prueba = construir_marca(repo, alto, (255, 255, 255))
    x, y = im.width - prueba.width - margen, im.height - prueba.height - margen
    esquina = im.crop((x, y, x + prueba.width, y + prueba.height)).convert('L')
    claro = ImageStat.Stat(esquina).mean[0] > 185
    capa = Image.new('RGBA', im.size, (0, 0, 0, 0))
    if claro:
        mk = construir_marca(repo, alto, AZUL)
        mk.putalpha(mk.getchannel('A').point(lambda v: v * 0.55))
    else:
        mk = construir_marca(repo, alto, (255, 255, 255))
        sombra = Image.new('RGBA', mk.size, (0, 0, 0, 0))
        sombra.putalpha(mk.getchannel('A').point(lambda v: v * 0.35))
        sombra = sombra.filter(ImageFilter.GaussianBlur(max(1, alto * 0.08)))
        capa.paste(sombra, (x + 1, y + 2), sombra)
        mk.putalpha(mk.getchannel('A').point(lambda v: v * 0.85))
    capa.alpha_composite(mk, (x, y))
    out = im.convert('RGBA')
    out.alpha_composite(capa)
    return out.convert('RGB')


def procesar(repo, origen, destino):
    im = Image.open(os.path.join(repo, origen))
    out = poner_marca(repo, im)
    ruta = os.path.join(repo, destino)
    os.makedirs(os.path.dirname(ruta), exist_ok=True)
    out.save(ruta, 'WEBP', quality=CALIDAD, method=6)
    return os.path.getsize(ruta)


if __name__ == '__main__':
    repo = sys.argv[1]
    for par in sys.argv[2:]:
        o, d = par.split('=')
        print(procesar(repo, o, d) // 1024, 'KB', d)
