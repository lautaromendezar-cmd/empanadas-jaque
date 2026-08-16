# Jaque Empanadas — sitio estático

One-page de [empanadasjaque.com.ar](https://empanadasjaque.com.ar/), reescrito en HTML, CSS y JavaScript
plano para reemplazar la versión de WordPress + Elementor. **No hay build ni dependencias**: lo que está
en el repo es exactamente lo que se sirve.

```
index.html          la página entera
data/menu.json      los 28 gustos y sus precios (fuente de verdad)
admin.html          el panel de precios
api/                funciones del panel (sesión y guardado)
lib/                lógica compartida: render del menú, sesión, GitHub
tools/              línea de comandos: claves, generar, revisar, tests, servidor local
assets/css/         hojas de estilo (sitio y panel)
assets/js/          comportamiento (sitio y panel)
assets/img/         fotos, logo y favicon (~1 MB en total)
vercel.json         cache, headers de seguridad y CSP del panel
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

## Panel de precios (`/admin`)

El dueño entra a `empanadasjaque.com.ar/admin` con una contraseña, cambia los precios
y guarda. Eso commitea al repo y Vercel republica solo, en menos de un minuto.

**Cómo funciona.** La fuente de verdad es `data/menu.json`. Al guardar, la función
`api/menu.js` regenera el bloque del menú dentro de `index.html` (entre las marcas
`<!-- MENU:START -->` y `<!-- MENU:END -->`) y commitea **los dos archivos en un solo
commit**. Los precios siguen viviendo en el HTML servido: no hay fetch en runtime, no
hay parpadeo y Google los sigue leyendo.

**Lo único que el panel puede cambiar son precios**, y sólo números enteros de gustos
que ya existen. Agregar, borrar o renombrar un gusto se hace editando `data/menu.json`
y corriendo `node tools/menu.cjs generar`. Es a propósito: así lo único que puede
entrar al HTML del sitio desde el panel es un número.

### Puesta en marcha (una sola vez)

1. Generar las claves:
   ```
   node tools/menu.cjs claves "una contraseña larga para el dueño"
   ```
2. Crear un **fine-grained token** en GitHub → Settings → Developer settings →
   Personal access tokens → Fine-grained. Repositorio: sólo `empanadas-jaque`.
   Permiso: **Contents → Read and write**. Nada más.
3. Cargar en Vercel → Settings → Environment Variables (Production):
   `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `GITHUB_TOKEN`, `GITHUB_REPO`.
4. Redeployar para que las variables tomen efecto.

### Probarlo sin deployar

```
node tools/servidor.cjs      # http://localhost:3000/admin, contraseña probando1234
```
En modo local los cambios se escriben en el disco en vez de ir a GitHub.

### Qué hay puesto de seguridad

- El token de GitHub **nunca sale del servidor**: vive en una variable de entorno y el
  navegador jamás lo ve.
- Contraseña guardada como hash **scrypt** con salt, comparada en tiempo constante.
  Nunca en texto plano, ni en el repo ni en el código.
- Sesión en cookie **HttpOnly + Secure + SameSite=Strict**, con prefijo `__Host-`,
  firmada con HMAC-SHA256 y vencimiento a 8 horas. Sin base de datos.
- CSRF: además de `SameSite=Strict`, todo pedido que cambia algo exige la cabecera
  `X-Panel`, que un formulario de otro sitio no puede mandar.
- Freno a la fuerza bruta: 5 intentos por IP y 15 minutos de espera. Al ser serverless
  la memoria no es compartida, así que la defensa de fondo son el scrypt lento
  (~100 ms por intento) y una contraseña larga.
- Todo lo que se interpola en el HTML se escapa (`lib/render-menu.js`), y los precios
  se validan como enteros dentro de un rango antes de tocar nada.
- `/admin` va con CSP estricta, `noindex` y fuera de `robots.txt`.
- Si alguien cambió los precios mientras el panel estaba abierto, el guardado se
  rechaza con un aviso en vez de pisar el cambio.

### Tests

```
node tools/test.cjs          # 35 pruebas: escapado, validación, sesión y endpoints
node tools/menu.cjs revisar  # avisa si index.html quedó desfasado de menu.json
```

## Qué cambiar cuando cambien los datos

| Qué | Dónde |
|---|---|
| Precios | el panel `/admin`, o `data/menu.json` + `node tools/menu.cjs generar` |
| Gustos (agregar, borrar, renombrar) | `data/menu.json` + `node tools/menu.cjs generar`. `buscar` es lo que usa el buscador del sitio: incluye las variantes sin tilde |
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
