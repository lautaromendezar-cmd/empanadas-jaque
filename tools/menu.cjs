#!/usr/bin/env node
'use strict';

/**
 * Herramienta de línea de comandos para el menú. No hace falta instalar nada.
 *
 *   node tools/menu.cjs password   cambia SOLO la contraseña del panel
 *   node tools/menu.cjs claves     genera las cuatro variables desde cero
 *   node tools/menu.cjs generar    reescribe el bloque del menú en index.html
 *   node tools/menu.cjs revisar    avisa si index.html quedó desfasado de menu.json
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

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

/**
 * Lector de líneas ocultas (no se ve lo que se tipea).
 *
 * Guarda en una cola las líneas que llegan antes de que se las pida. Sin eso,
 * cuando la entrada no viene de un teclado sino redirigida, readline emite
 * todas las líneas de golpe y las preguntas siguientes a la primera no se
 * contestan nunca: el programa termina en silencio y sin hacer nada.
 */
function crearLector() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = () => {}; // silencia el eco: la contraseña no se ve

  const recibidas = [];
  const esperando = [];
  let cerrado = false;

  rl.on('line', (linea) => {
    if (esperando.length) esperando.shift()(linea);
    else recibidas.push(linea);
  });
  rl.on('close', () => {
    cerrado = true;
    while (esperando.length) esperando.shift()(null);
  });

  return {
    preguntar(texto) {
      process.stdout.write(texto);
      return new Promise((resolve) => {
        const entregar = (linea) => {
          process.stdout.write('\n');
          resolve(linea);
        };
        if (recibidas.length) return entregar(recibidas.shift());
        if (cerrado) return entregar(null);
        esperando.push(entregar);
      });
    },
    cerrar() {
      rl.close();
    },
  };
}

/**
 * Cambia únicamente la contraseña del panel. No toca el SESSION_SECRET ni el
 * token: cambiarlos de más sólo sirve para romper cosas que andaban.
 */
async function password() {
  const { hashearPassword, verificarPassword } = require(path.join(RAIZ, 'lib', 'auth.js'));

  // Se pide por teclado, no por argumento: así no queda en el historial de la
  // terminal, que es un archivo de texto que cualquiera puede abrir después.
  const lector = crearLector();
  let nueva, repetida;
  try {
    nueva = await lector.preguntar('Contraseña nueva (no se ve al tipear): ');
    repetida = await lector.preguntar('Repetila para confirmar:              ');
  } finally {
    lector.cerrar();
  }

  if (nueva === null || repetida === null) {
    console.error('Cancelado. No cambié nada.');
    return 1;
  }
  if (nueva.length < 12) {
    console.error('Tiene que tener al menos 12 caracteres. No cambié nada.');
    return 1;
  }
  if (nueva !== repetida) {
    console.error('No coinciden. No cambié nada.');
    return 1;
  }

  const hash = hashearPassword(nueva);
  if (!verificarPassword(nueva, hash) || verificarPassword(nueva + 'x', hash)) {
    console.error('\nEl hash generado no verifica bien. No lo uses, avisá.');
    return 1;
  }

  console.log('\n----------------------------------------------------------');
  console.log('Pegá esto en Vercel -> Settings -> Environment Variables,');
  console.log('reemplazando el valor de ADMIN_PASSWORD_HASH.');
  console.log('Después: Deployments -> el último -> Redeploy.');
  console.log('No hace falta tocar ninguna otra variable.');
  console.log('----------------------------------------------------------\n');
  console.log('ADMIN_PASSWORD_HASH');
  console.log(hash + '\n');
  return 0;
}

const comandos = { password, claves, generar, revisar };
const comando = process.argv[2];

if (!comando || !comandos[comando]) {
  console.error('Comandos: password | claves | generar | revisar');
  process.exitCode = 1;
  return;
}

// exitCode y no process.exit(): con la salida redirigida a un pipe, exit()
// corta lo que todavía no se escribió y el hash nunca llega a verse.
Promise.resolve(comandos[comando]())
  .then((codigo) => { process.exitCode = codigo; })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
