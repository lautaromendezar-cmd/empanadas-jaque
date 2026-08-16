# Jaque Empanadas — sitio estático

One-page de [empanadasjaque.com.ar](https://empanadasjaque.com.ar/), reescrito en HTML, CSS y JavaScript
plano para reemplazar la versión de WordPress + Elementor. **No hay build ni dependencias**: lo que está
en el repo es exactamente lo que se sirve.

```
index.html          la página entera
assets/css/         una hoja de estilos
assets/js/          un archivo de comportamiento
assets/img/         fotos, logo y favicon (~1 MB en total)
vercel.json         cache de assets + headers de seguridad
robots.txt          /  sitemap.xml
```

## Cómo verlo

Doble clic en `index.html`. Anda igual desde `file://` — el JS no es un módulo justamente para eso.
Para servirlo por HTTP: `npx serve .` o `python -m http.server`.

## Deploy en Vercel

1. Crear el repo y subirlo.
2. En Vercel: **Add New → Project → Import** el repo.
3. Framework Preset: **Other**. Build Command: vacío. Output Directory: vacío (raíz).
4. Deploy. Cada push a `main` republica.

Para pasarle el dominio, en el panel de Vercel: **Settings → Domains → Add** `empanadasjaque.com.ar`
y apuntar los registros en el proveedor de DNS a lo que indique Vercel. Recién ahí conviene dar de baja
el WordPress.

## Qué cambiar cuando cambien los datos

| Qué | Dónde |
|---|---|
| Precios y gustos | `index.html`, bloques `.menu-group` (`data-name` es lo que usa el buscador: incluye variantes sin tilde) |
| Teléfonos | `index.html`, buscar `tel:` — están en header, hero, ubicación, delivery, footer y barra mobile |
| Horarios | dos lugares: la lista `.hours-list` en `index.html` **y** `SCHEDULE` en `assets/js/main.js` (el cartel "abierto ahora" sale de ahí) |
| Reseñas | `index.html`, `.reviews-track`. Están escritas a mano, tomadas del widget de Google del sitio viejo |
| Dirección | `index.html`, sección `#ubicacion` (texto, link de "Cómo llegar" e `iframe` del mapa) |

## Diferencias con el sitio de WordPress

Mismo contenido, misma identidad (negro + `#ffdf00`, Alegreya Sans SC / Roboto / RocknRoll One / Rosarivo).
Lo que cambió:

- **Los teléfonos ahora son links `tel:`.** En el sitio viejo eran un `<span>` adentro de un `href="#"`,
  así que en el celular no se podía llamar tocándolos.
- **Navegación**: header que se compacta al scrollear, sección activa marcada en el menú (scrollspy),
  barra de progreso, anclas que no quedan tapadas por el header, panel lateral en mobile.
- **Barra fija inferior en mobile** con Llamar / Ver menú / Cómo llegar.
- **Buscador y filtros en el menú** (28 gustos): filtra por categoría y busca sin importar las tildes.
- **Cartel de abierto / cerrado** calculado en hora de Buenos Aires, con el día de hoy marcado en la grilla.
- **Reseñas propias** en vez del widget de Trustindex: sin script de terceros ni cookies.
- **Peso**: ~1 MB de imágenes contra los ~4 MB del original, y sin jQuery, Elementor ni 50 hojas de estilo.
- Accesibilidad: skip link, foco visible, `aria-current` en el nav, `aria-expanded` en el hamburguesa,
  respeta `prefers-reduced-motion`.
- Datos estructurados `Restaurant` (dirección, horarios, teléfono, rating) para Google.

## Detalle importante si se toca el JS

El CSS oculta los `.reveal` **sólo si `<html>` tiene la clase `js`**, que la agrega un script inline en el
`<head>`. Si `main.js` fallara o no cargara, la página se ve completa igual. No convertir `main.js` en
módulo (`type="module"`) porque deja de cargar al abrir el archivo con doble clic.
