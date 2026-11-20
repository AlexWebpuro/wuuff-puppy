# Marca de agua y fotos livianas

Las fotos que se ven en la web salen de `images/web/` (WebP, máx. 1000 px, con el isotipo + "wuuffpuppy.co" abajo a la derecha).
Las originales sin marca siguen en `images/` porque Google Merchant y el catálogo de Meta rechazan fotos con marca de agua:
por eso `og:image`, el JSON-LD, `catalogo-meta.csv` y `sitemap.xml` siguen apuntando a las originales.

Al agregar fotos nuevas: súbelas a `images/` como siempre, úsalas en el HTML con su ruta normal y luego corre desde la raíz:

    pip install pillow fonttools brotli
    python3 herramientas/marca-de-agua/aplicar.py .

El script genera la versión con marca y cambia las rutas visibles a `images/web/...`.
No toca logos, ilustraciones de personajes, tablas de tallas, videos ni la carpeta /panel.
