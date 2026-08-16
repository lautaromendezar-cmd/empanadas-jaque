'use strict';

/**
 * Sesión del panel. Sin base de datos: la cookie va firmada con HMAC y el
 * servidor sólo verifica la firma. No hay nada que robar del lado del sitio.
 *
 * Variables de entorno que hacen falta (se cargan en Vercel, nunca en el repo):
 *   ADMIN_PASSWORD_HASH   scrypt, con formato  scrypt$<salt hex>$<hash hex>
 *   SESSION_SECRET        32 bytes al azar en hex
 */

const crypto = require('crypto');

const NOMBRE_COOKIE_SEGURA = '__Host-jaque_sesion';
const NOMBRE_COOKIE_LOCAL = 'jaque_sesion';
const DURACION_SESION_MS = 8 * 60 * 60 * 1000; // 8 horas

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_LARGO = 64;

/** En producción (Vercel) usamos el prefijo __Host-, que exige HTTPS. */
function enProduccion() {
  return Boolean(process.env.VERCEL);
}

function nombreCookie() {
  return enProduccion() ? NOMBRE_COOKIE_SEGURA : NOMBRE_COOKIE_LOCAL;
}

function derivar(password, salt) {
  return crypto.scryptSync(password, salt, SCRYPT_LARGO, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
}

/** Genera el valor que va en ADMIN_PASSWORD_HASH. Lo usa tools/menu.cjs. */
function hashearPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = derivar(password, salt);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/**
 * Comparación en tiempo constante contra el hash guardado.
 * scrypt es lento a propósito (~100 ms), lo que también frena la fuerza bruta.
 */
function verificarPassword(password, guardado) {
  if (typeof password !== 'string' || typeof guardado !== 'string') return false;
  const partes = guardado.split('$');
  if (partes.length !== 3 || partes[0] !== 'scrypt') return false;
  let salt, esperado;
  try {
    salt = Buffer.from(partes[1], 'hex');
    esperado = Buffer.from(partes[2], 'hex');
  } catch {
    return false;
  }
  if (esperado.length !== SCRYPT_LARGO) return false;
  let obtenido;
  try {
    obtenido = derivar(password, salt);
  } catch {
    return false;
  }
  return crypto.timingSafeEqual(obtenido, esperado);
}

function firmar(datos, secreto) {
  return crypto.createHmac('sha256', secreto).update(datos).digest('base64url');
}

/** Token = <vencimiento>.<nonce>.<firma>. Sin estado del lado del servidor. */
function crearToken(secreto) {
  const vence = Date.now() + DURACION_SESION_MS;
  const nonce = crypto.randomBytes(12).toString('base64url');
  const datos = `${vence}.${nonce}`;
  return `${datos}.${firmar(datos, secreto)}`;
}

function tokenValido(token, secreto) {
  if (typeof token !== 'string') return false;
  const partes = token.split('.');
  if (partes.length !== 3) return false;
  const [vence, nonce, firma] = partes;
  const esperada = Buffer.from(firmar(`${vence}.${nonce}`, secreto));
  const recibida = Buffer.from(firma);
  if (esperada.length !== recibida.length) return false;
  if (!crypto.timingSafeEqual(esperada, recibida)) return false;
  const ts = Number(vence);
  return Number.isFinite(ts) && ts > Date.now();
}

function cookieDeSesion(token) {
  const base = [
    `${nombreCookie()}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(DURACION_SESION_MS / 1000)}`,
  ];
  if (enProduccion()) base.push('Secure');
  return base.join('; ');
}

function cookieBorrada() {
  const base = [`${nombreCookie()}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (enProduccion()) base.push('Secure');
  return base.join('; ');
}

function leerCookie(req) {
  const crudo = req.headers.cookie;
  if (!crudo) return null;
  const buscado = nombreCookie();
  for (const parte of crudo.split(';')) {
    const i = parte.indexOf('=');
    if (i === -1) continue;
    if (parte.slice(0, i).trim() === buscado) return parte.slice(i + 1).trim();
  }
  return null;
}

/** true si la request trae una sesión válida. */
function autenticado(req) {
  const secreto = process.env.SESSION_SECRET;
  if (!secreto) return false;
  return tokenValido(leerCookie(req), secreto);
}

/**
 * Freno a la fuerza bruta. La memoria de una función serverless no es
 * compartida ni permanente, así que esto corta ráfagas contra una misma
 * instancia, no un ataque distribuido y paciente. La defensa de fondo son
 * el scrypt lento y una contraseña larga.
 */
const intentos = new Map();
const MAX_INTENTOS = 5;
const BLOQUEO_MS = 15 * 60 * 1000;

function ipDe(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd) return fwd.split(',')[0].trim();
  return req.socket?.remoteAddress || 'desconocida';
}

function bloqueado(req) {
  const reg = intentos.get(ipDe(req));
  if (!reg) return 0;
  if (reg.fallos < MAX_INTENTOS) return 0;
  const restante = reg.hasta - Date.now();
  return restante > 0 ? Math.ceil(restante / 1000) : 0;
}

function registrarFallo(req) {
  const ip = ipDe(req);
  const reg = intentos.get(ip) || { fallos: 0, hasta: 0 };
  reg.fallos += 1;
  reg.hasta = Date.now() + BLOQUEO_MS;
  intentos.set(ip, reg);
  if (intentos.size > 1000) intentos.clear(); // techo de memoria
}

function limpiarIntentos(req) {
  intentos.delete(ipDe(req));
}

module.exports = {
  DURACION_SESION_MS,
  hashearPassword,
  verificarPassword,
  crearToken,
  tokenValido,
  cookieDeSesion,
  cookieBorrada,
  autenticado,
  bloqueado,
  registrarFallo,
  limpiarIntentos,
};
