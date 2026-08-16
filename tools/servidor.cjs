#!/usr/bin/env node
'use strict';

/**
 * Servidor local para probar el panel sin deployar.
 *
 *   node tools/servidor.cjs
 *   -> http://localhost:3000/admin
 *
 * Sirve los archivos estáticos y enruta /api/* a las mismas funciones que usa
 * Vercel. Si no hay GITHUB_TOKEN, en vez de commitear escribe los archivos en
 * el disco: se puede probar el circuito entero sin tocar el repo.
 *
 * La contraseña de prueba sale de ADMIN_PASSWORD (por defecto "probando1234").
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const PUERTO = Number(process.env.PORT) || 3000;

const auth = require(path.join(RAIZ, 'lib', 'auth.js'));

if (!process.env.ADMIN_PASSWORD_HASH) {
  const pass = process.env.ADMIN_PASSWORD || 'probando1234';
  process.env.ADMIN_PASSWORD_HASH = auth.hashearPassword(pass);
  console.log(`Contraseña de prueba: ${pass}`);
}
if (!process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = crypto.randomBytes(32).toString('hex');
}
process.env.GITHUB_REPO = process.env.GITHUB_REPO || 'local/local';

// Sin token real, GitHub se reemplaza por el disco.
if (!process.env.GITHUB_TOKEN) {
  process.env.GITHUB_TOKEN = 'local';
  const github = require(path.join(RAIZ, 'lib', 'github.js'));
  github.leerArchivo = async (ruta) => fs.readFileSync(path.join(RAIZ, ruta), 'utf8');
  github.commitearArchivos = async (archivos, mensaje) => {
    for (const a of archivos) fs.writeFileSync(path.join(RAIZ, a.ruta), a.contenido, 'utf8');
    console.log(`[local] escrito en disco: ${archivos.map((a) => a.ruta).join(', ')}`);
    console.log(`[local] mensaje: ${mensaje}`);
    return { sha: 'local', url: 'local' };
  };
  console.log('Modo local: los cambios se escriben en el disco, no en GitHub.');
}

const rutasApi = {
  '/api/sesion': require(path.join(RAIZ, 'api', 'sesion.js')),
  '/api/menu': require(path.join(RAIZ, 'api', 'menu.js')),
};

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
};

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PUERTO}`);
  let ruta = decodeURIComponent(url.pathname);

  if (rutasApi[ruta]) {
    try {
      await rutasApi[ruta](req, res);
    } catch (e) {
      console.error(e);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'error interno' }));
    }
    return;
  }

  // cleanUrls: /admin -> admin.html
  if (ruta === '/') ruta = '/index.html';
  let archivo = path.join(RAIZ, ruta);
  if (!fs.existsSync(archivo) && fs.existsSync(archivo + '.html')) archivo += '.html';

  // no dejar salir de la carpeta del proyecto
  if (!path.resolve(archivo).startsWith(path.resolve(RAIZ))) {
    res.statusCode = 403;
    res.end('prohibido');
    return;
  }

  if (!fs.existsSync(archivo) || fs.statSync(archivo).isDirectory()) {
    res.statusCode = 404;
    res.end('no encontrado');
    return;
  }

  res.setHeader('Content-Type', TIPOS[path.extname(archivo)] || 'application/octet-stream');
  res.end(fs.readFileSync(archivo));
});

servidor.listen(PUERTO, () => {
  console.log(`\nPanel:  http://localhost:${PUERTO}/admin`);
  console.log(`Sitio:  http://localhost:${PUERTO}/\n`);
});
