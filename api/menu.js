'use strict';

/**
 * GET /api/menu   devuelve los precios actuales (y una "version" para detectar
 *                 que alguien más los haya tocado mientras tanto)
 * PUT /api/menu   guarda precios nuevos: regenera index.html y commitea las dos
 *                 cosas juntas
 *
 * Lo único que este endpoint acepta cambiar son PRECIOS, y sólo números enteros
 * de gustos que ya existen. Nombres, descripciones y gustos nuevos no se tocan
 * desde acá: así, lo único que puede entrar al HTML del sitio por esta vía es
 * un número.
 */

const crypto = require('crypto');
const auth = require('../lib/auth.js');
const github = require('../lib/github.js');
const { validarPrecio, reemplazarEnHtml, PRECIO_MIN, PRECIO_MAX } = require('../lib/render-menu.js');
const { json, pedidoDelPanel, cuerpoJson, errorInterno } = require('./_comun.js');

const RUTA_MENU = 'data/menu.json';
const RUTA_INDEX = 'index.html';

function version(texto) {
  return crypto.createHash('sha256').update(texto).digest('hex').slice(0, 16);
}

function hoyEnBuenosAires() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' })
    .format(new Date()); // sv-SE da AAAA-MM-DD
}

/** Lo que ve el panel: sin comentarios internos, sólo lo que necesita mostrar. */
function paraElPanel(menu) {
  return menu.grupos.map((g) => ({
    id: g.id,
    titulo: g.titulo,
    items: g.items.map((i) => ({ id: i.id, nombre: i.nombre, desc: i.desc, precio: i.precio })),
  }));
}

module.exports = async function handler(req, res) {
  try {
    if (!auth.autenticado(req)) {
      return json(res, 401, { error: 'Sesión vencida. Entrá de nuevo.' });
    }

    if (req.method === 'GET') {
      const crudo = await github.leerArchivo(RUTA_MENU);
      const menu = JSON.parse(crudo);
      return json(res, 200, {
        grupos: paraElPanel(menu),
        actualizado: menu.actualizado || null,
        version: version(crudo),
        limites: { min: PRECIO_MIN, max: PRECIO_MAX },
      });
    }

    if (req.method !== 'PUT') {
      return json(res, 405, { error: 'Método no permitido' }, { Allow: 'GET, PUT' });
    }

    if (!pedidoDelPanel(req)) {
      return json(res, 403, { error: 'Pedido no reconocido' });
    }

    const cuerpo = await cuerpoJson(req);
    const precios = cuerpo.precios;
    if (!precios || typeof precios !== 'object' || Array.isArray(precios)) {
      return json(res, 400, { error: 'Falta el objeto "precios".' });
    }

    const crudo = await github.leerArchivo(RUTA_MENU);
    const versionActual = version(crudo);
    if (cuerpo.version && cuerpo.version !== versionActual) {
      return json(res, 409, {
        error: 'Los precios cambiaron desde que abriste el panel. Recargá para ver los actuales.',
        version: versionActual,
      });
    }

    const menu = JSON.parse(crudo);
    const porId = new Map();
    for (const grupo of menu.grupos) for (const item of grupo.items) porId.set(item.id, item);

    // Validar TODO antes de tocar nada: o entra el cambio entero, o no entra nada.
    const cambios = [];
    for (const [id, valor] of Object.entries(precios)) {
      const item = porId.get(id);
      if (!item) return json(res, 400, { error: `No existe el gusto "${id}".` });
      if (typeof valor !== 'number' || !Number.isInteger(valor)) {
        return json(res, 400, { error: `El precio de "${item.nombre}" tiene que ser un número entero.` });
      }
      try {
        validarPrecio(valor, item.id);
      } catch (e) {
        return json(res, 400, { error: `${item.nombre}: ${e.message}` });
      }
      if (valor !== item.precio) cambios.push({ item, antes: item.precio, ahora: valor });
    }

    if (!cambios.length) {
      return json(res, 200, { guardado: false, mensaje: 'No había nada para cambiar.', version: versionActual });
    }

    for (const cambio of cambios) cambio.item.precio = cambio.ahora;
    menu.actualizado = hoyEnBuenosAires();

    const menuNuevo = JSON.stringify(menu, null, 2) + '\n';
    const indexActual = await github.leerArchivo(RUTA_INDEX);
    const indexNuevo = reemplazarEnHtml(indexActual, menu); // valida el menú de nuevo

    if (indexNuevo === indexActual) {
      // No debería pasar: si hay cambios de precio, el HTML tiene que cambiar.
      console.error('[menu] hubo cambios pero el index.html quedó igual');
      return json(res, 500, { error: 'No pude aplicar los cambios al sitio. Avisale a Lautaro.' });
    }

    const detalle = cambios
      .slice(0, 6)
      .map((c) => `${c.item.nombre} $${c.antes} -> $${c.ahora}`)
      .join(', ');
    const resto = cambios.length > 6 ? ` y ${cambios.length - 6} mas` : '';

    const commit = await github.commitearArchivos(
      [
        { ruta: RUTA_MENU, contenido: menuNuevo },
        { ruta: RUTA_INDEX, contenido: indexNuevo },
      ],
      `Precios actualizados desde el panel: ${detalle}${resto}`
    );

    return json(res, 200, {
      guardado: true,
      cambios: cambios.length,
      version: version(menuNuevo),
      commit: commit.url,
    });
  } catch (error) {
    if (error.status && error.status < 500) return json(res, error.status, { error: error.message });
    return errorInterno(res, error, 'menu');
  }
};
