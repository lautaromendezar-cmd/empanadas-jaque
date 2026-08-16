'use strict';

/** Cosas compartidas por los endpoints del panel. */

const LARGO_MAXIMO_CUERPO = 64 * 1024; // 64 KB: el menú entero pesa ~5 KB

function json(res, codigo, datos, cabeceras = {}) {
  res.statusCode = codigo;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // El panel no se cachea nunca, ni por el navegador ni por el CDN.
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  for (const [k, v] of Object.entries(cabeceras)) res.setHeader(k, v);
  res.end(JSON.stringify(datos));
}

/**
 * Los endpoints que cambian algo exigen una cabecera propia.
 * Un formulario cross-site no puede mandarla sin pasar por un preflight de
 * CORS que no habilitamos, así que esto corta el CSRF junto con SameSite=Strict.
 */
function pedidoDelPanel(req) {
  return req.headers['x-panel'] === '1';
}

/** Lee y parsea el cuerpo JSON con tope de tamaño. */
async function cuerpoJson(req) {
  if (req.body && typeof req.body === 'object') return req.body;

  const tipo = String(req.headers['content-type'] || '');
  if (!tipo.startsWith('application/json')) {
    const e = new Error('El cuerpo tiene que ser application/json');
    e.status = 415;
    throw e;
  }

  const partes = [];
  let total = 0;
  for await (const parte of req) {
    total += parte.length;
    if (total > LARGO_MAXIMO_CUERPO) {
      const e = new Error('Cuerpo demasiado grande');
      e.status = 413;
      throw e;
    }
    partes.push(parte);
  }
  if (!total) return {};
  try {
    return JSON.parse(Buffer.concat(partes).toString('utf8'));
  } catch {
    const e = new Error('JSON inválido');
    e.status = 400;
    throw e;
  }
}

/** Los mensajes de error internos no salen al navegador. */
function errorInterno(res, error, contexto) {
  console.error(`[${contexto}]`, error);
  json(res, 500, { error: 'Algo falló del lado del servidor. Probá de nuevo.' });
}

module.exports = { json, pedidoDelPanel, cuerpoJson, errorInterno };
