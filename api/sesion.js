'use strict';

/**
 * GET     /api/sesion   ¿hay sesión abierta?
 * POST    /api/sesion   entrar (cuerpo: { password })
 * DELETE  /api/sesion   salir
 */

const auth = require('../lib/auth.js');
const { json, pedidoDelPanel, cuerpoJson, errorInterno } = require('./_comun.js');

module.exports = async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return json(res, 200, { abierta: auth.autenticado(req) });
    }

    if (req.method === 'DELETE') {
      return json(res, 200, { abierta: false }, { 'Set-Cookie': auth.cookieBorrada() });
    }

    if (req.method !== 'POST') {
      return json(res, 405, { error: 'Método no permitido' }, { Allow: 'GET, POST, DELETE' });
    }

    if (!pedidoDelPanel(req)) {
      return json(res, 403, { error: 'Pedido no reconocido' });
    }

    const hash = process.env.ADMIN_PASSWORD_HASH;
    const secreto = process.env.SESSION_SECRET;
    if (!hash || !secreto) {
      console.error('[sesion] faltan ADMIN_PASSWORD_HASH y/o SESSION_SECRET');
      return json(res, 503, { error: 'El panel todavía no está configurado.' });
    }

    const esperaSegundos = auth.bloqueado(req);
    if (esperaSegundos) {
      return json(
        res,
        429,
        { error: `Demasiados intentos. Probá de nuevo en ${Math.ceil(esperaSegundos / 60)} minutos.` },
        { 'Retry-After': String(esperaSegundos) }
      );
    }

    const cuerpo = await cuerpoJson(req);
    const password = typeof cuerpo.password === 'string' ? cuerpo.password : '';

    if (!auth.verificarPassword(password, hash)) {
      auth.registrarFallo(req);
      return json(res, 401, { error: 'Contraseña incorrecta.' });
    }

    auth.limpiarIntentos(req);
    const token = auth.crearToken(secreto);
    return json(res, 200, { abierta: true }, { 'Set-Cookie': auth.cookieDeSesion(token) });
  } catch (error) {
    if (error.status) return json(res, error.status, { error: error.message });
    return errorInterno(res, error, 'sesion');
  }
};
