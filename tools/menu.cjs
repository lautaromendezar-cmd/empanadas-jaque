#!/usr/bin/env node
'use strict';

/**
 * Herramienta de línea de comandos para el menú. No hace falta instalar nada.
 *
 *   node tools/menu.cjs claves     genera ADMIN_PASSWORD_HASH y SESSION_SECRET
 *   node tools/menu.cjs generar    reescribe el bloque del menú en index.html
 *   node tools/menu.cjs revisar    avisa si index.html quedó desfasado de menu.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.join(__dirname, '..');
const RUTA_MENU = path.join(RAIZ, 'data', 'menu.json');
const RUTA_INDEX = path.join(RAIZ, 'index.html');

const { reemplazarEnHtml } = require(path.join(RAIZ, 'lib', 'render-menu.js'));
const { hashearPassword } = require(path.join(RAIZ, 'lib', 'auth.js'));

function leerMenu() {
  return JSON.parse(fs.readFileSync(RUTA_MENU, 'utf8'));
}

function generar() {
  const html = fs.readFileSync(RUTA_INDEX, 'utf8');
  const nuevo = reemplazarEnHtml(html, leerMenu());
  if (nuevo === html) {
    console.log('index.html ya estaba al día.');
    return 0;
  }
  fs.writeFileSync(RUTA_INDEX, nuevo, 'utf8');
  console.log('index.html regenerado desde data/menu.json');
  return 0;
}

function revisar() {
  const html = fs.readFileSync(RUTA_INDEX, 'utf8');
  const esperado = reemplazarEnHtml(html, leerMenu());
  if (esperado === html) {
    console.log('OK: index.html coincide con data/menu.json');
    return 0;
  }
  console.error('DESFASADO: index.html no coincide con data/menu.json.');
  console.error('Corregilo con:  node tools/menu.cjs generar');
  return 1;
}

function claves() {
  const password = process.argv[3];
  if (!password) {
    console.error('Uso: node tools/menu.cjs claves "la contraseña que va a usar el dueño"');
    return 1;
  }
  if (password.length < 12) {
    console.error('La contraseña tiene que tener al menos 12 caracteres.');
    return 1;
  }
  console.log('\nCargar estas variables en Vercel (Settings -> Environment Variables).');
  console.log('No guardarlas en el repo ni mandarlas por mail.\n');
  console.log('ADMIN_PASSWORD_HASH');
  console.log(hashearPassword(password) + '\n');
  console.log('SESSION_SECRET');
  console.log(crypto.randomBytes(32).toString('hex') + '\n');
  console.log('GITHUB_REPO');
  console.log('lautaromendezar-cmd/empanadas-jaque\n');
  console.log('GITHUB_TOKEN');
  console.log('(el fine-grained token de GitHub, con permiso Contents: Read and write sobre este repo)\n');
  return 0;
}

const comandos = { claves, generar, revisar };
const comando = process.argv[2];

if (!comando || !comandos[comando]) {
  console.error('Comandos: claves | generar | revisar');
  process.exit(1);
}
process.exit(comandos[comando]());
