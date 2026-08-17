'use strict';

/**
 * Genera el HTML del menú a partir de data/menu.json.
 *
 * Este archivo lo usan dos cosas:
 *   - tools/menu.cjs        (para regenerar index.html desde la computadora)
 *   - api/menu.js           (para regenerarlo cuando se guardan precios desde /admin)
 *
 * Todo lo que sale de acá va a parar al index.html que se sirve, así que
 * TODO valor interpolado se escapa. Es la única barrera entre lo que se carga
 * en el panel y el HTML del sitio.
 */

const MARCA_INICIO = '<!-- MENU:START -->';
const MARCA_FIN = '<!-- MENU:END -->';

/** Bloque de datos estructurados del menú, también generado desde menu.json. */
const MARCA_LD_INICIO = '<!-- MENU-LD:START -->';
const MARCA_LD_FIN = '<!-- MENU-LD:END -->';

const SITIO = 'https://empanadasjaque.com.ar/';

/** Precios aceptados: enteros en pesos, sin centavos. */
const PRECIO_MIN = 100;
const PRECIO_MAX = 1000000;

function escaparHtml(valor) {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Valida la forma del menú entero. Tira si algo no cierra: preferimos fallar
 * antes de commitear que dejar el index.html del sitio a medio escribir.
 */
function validarMenu(menu) {
  if (!menu || typeof menu !== 'object' || !Array.isArray(menu.grupos)) {
    throw new Error('menu.json: falta el array "grupos"');
  }
  const ids = new Set();
  for (const grupo of menu.grupos) {
    if (!grupo || typeof grupo.id !== 'string' || typeof grupo.titulo !== 'string') {
      throw new Error('menu.json: grupo sin "id" o "titulo"');
    }
    if (!Array.isArray(grupo.items)) {
      throw new Error(`menu.json: el grupo "${grupo.id}" no tiene "items"`);
    }
    for (const item of grupo.items) {
      if (!item || typeof item.id !== 'string' || !item.id) {
        throw new Error(`menu.json: item sin "id" en el grupo "${grupo.id}"`);
      }
      if (ids.has(item.id)) throw new Error(`menu.json: id repetido "${item.id}"`);
      ids.add(item.id);
      if (typeof item.nombre !== 'string' || !item.nombre) {
        throw new Error(`menu.json: "${item.id}" sin nombre`);
      }
      validarPrecio(item.precio, item.id);
    }
  }
  return menu;
}

/** Un precio válido es un entero dentro de un rango con sentido. */
function validarPrecio(precio, id) {
  if (typeof precio !== 'number' || !Number.isInteger(precio)) {
    throw new Error(`Precio de "${id}": tiene que ser un número entero`);
  }
  if (precio < PRECIO_MIN || precio > PRECIO_MAX) {
    throw new Error(`Precio de "${id}": ${precio} está fuera de rango (${PRECIO_MIN}-${PRECIO_MAX})`);
  }
  return precio;
}

function renderItem(item) {
  const clases = item.nueva ? 'price-item is-new' : 'price-item';
  const etiqueta = item.nueva ? ' <b class="tag">nueva</b>' : '';
  const desc = item.desc ? `<em>${escaparHtml(item.desc)}</em>` : '';
  return `          <li class="${clases}" data-name="${escaparHtml(item.buscar || item.nombre.toLowerCase())}">` +
    `<span class="ico"></span>` +
    `<span class="pname">${escaparHtml(item.nombre)}${etiqueta}${desc}</span>` +
    `<span class="leader"></span>` +
    `<span class="pprice">$${item.precio}</span></li>`;
}

function renderGrupo(grupo) {
  const subtitulo = grupo.subtitulo
    ? `\n          <p class="script-note">${escaparHtml(grupo.subtitulo)}</p>`
    : '';
  return [
    `      <!-- ${grupo.titulo.toUpperCase()} -->`,
    `      <div class="menu-group" data-group="${escaparHtml(grupo.id)}">`,
    `        <header class="menu-group-head">`,
    `          <h3>${escaparHtml(grupo.titulo)}</h3>${subtitulo}`,
    `        </header>`,
    `        <ul class="price-list">`,
    ...grupo.items.map(renderItem),
    `        </ul>`,
    `      </div>`,
  ].join('\n');
}

/** El bloque completo que va entre las marcas, sin las marcas. */
function renderMenu(menu) {
  validarMenu(menu);
  return menu.grupos.map(renderGrupo).join('\n\n');
}

/**
 * Datos estructurados del menú (schema.org/Menu). Se generan del mismo JSON que
 * el HTML, así que cuando el dueño cambia un precio desde el panel, lo que lee
 * Google se actualiza en el mismo commit. Si se escribiera a mano, se
 * desincronizaría en el primer aumento.
 */
function renderMenuLd(menu) {
  validarMenu(menu);
  const doc = {
    '@context': 'https://schema.org',
    '@type': 'Menu',
    '@id': `${SITIO}#menu`,
    name: 'Menú de Jaque Empanadas',
    inLanguage: 'es-AR',
    hasMenuSection: menu.grupos.map((grupo) => ({
      '@type': 'MenuSection',
      name: grupo.titulo,
      ...(grupo.subtitulo ? { description: grupo.subtitulo } : {}),
      hasMenuItem: grupo.items.map((item) => ({
        '@type': 'MenuItem',
        name: item.nombre,
        ...(item.desc ? { description: item.desc } : {}),
        offers: {
          '@type': 'Offer',
          price: String(item.precio),
          priceCurrency: 'ARS',
        },
      })),
    })),
  };
  // Dentro de un <script>, un "<" literal puede cerrar la etiqueta antes de
  // tiempo. JSON.stringify no lo escapa, así que lo hacemos acá.
  const json = JSON.stringify(doc, null, 2).replace(/</g, '\\u003c');
  return `  <script type="application/ld+json">\n${json}\n  </script>`;
}

/** Reemplaza un bloque entre marcas, sin tocar nada de afuera. */
function reemplazarBloque(html, marcaInicio, marcaFin, contenido, sangria) {
  const inicio = html.indexOf(marcaInicio);
  const fin = html.indexOf(marcaFin);
  if (inicio === -1 || fin === -1) {
    throw new Error(`index.html: no encuentro las marcas ${marcaInicio} / ${marcaFin}`);
  }
  if (fin < inicio) {
    throw new Error(`index.html: las marcas ${marcaInicio} / ${marcaFin} están al revés`);
  }
  const antes = html.slice(0, inicio + marcaInicio.length);
  const despues = html.slice(fin);
  return `${antes}\n${contenido}\n${sangria}${despues}`;
}

/**
 * Reescribe en index.html los dos bloques que salen de menu.json: el listado
 * visible y sus datos estructurados.
 */
function reemplazarEnHtml(html, menu) {
  let salida = reemplazarBloque(html, MARCA_INICIO, MARCA_FIN, renderMenu(menu), '      ');
  salida = reemplazarBloque(salida, MARCA_LD_INICIO, MARCA_LD_FIN, renderMenuLd(menu), '');
  return salida;
}

/**
 * Pone la fecha en el sitemap. Se llama cuando cambia el menú: si el sitemap
 * dijera siempre la misma fecha, le estaría mintiendo a Google sobre cuándo se
 * actualizó la página.
 */
function actualizarSitemap(xml, fecha) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error(`Fecha inválida para el sitemap: ${fecha}`);
  if (!xml.includes('<lastmod>')) throw new Error('sitemap.xml: no encuentro <lastmod>');
  return xml.replace(/<lastmod>[^<]*<\/lastmod>/g, `<lastmod>${fecha}</lastmod>`);
}

module.exports = {
  MARCA_INICIO,
  MARCA_FIN,
  actualizarSitemap,
  MARCA_LD_INICIO,
  MARCA_LD_FIN,
  renderMenuLd,
  PRECIO_MIN,
  PRECIO_MAX,
  escaparHtml,
  validarMenu,
  validarPrecio,
  renderMenu,
  reemplazarEnHtml,
};
