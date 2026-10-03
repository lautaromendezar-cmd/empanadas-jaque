#!/usr/bin/env node
'use strict';

/**
 * Reseñas de Google, cargadas a mano.
 *
 *   node tools/resenas.cjs generar   reescribe la sección de reseñas en index.html
 *   node tools/resenas.cjs revisar   avisa si index.html quedó desfasado de resenas.json
 *
 * Se editan en data/resenas.json. Cada reseña: autor, estrellas (1-5),
 * fecha (AAAA-MM: Google sólo da «hace N meses»), texto y foto (nombre del archivo en
 * assets/img/resenas/, 96x96 en JPEG; null si no tiene y van las iniciales).
 * El orden del JSON es el orden en que se muestran.
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const RUTA_DATOS = path.join(RAIZ, 'data', 'resenas.json');
const RUTA_INDEX = path.join(RAIZ, 'index.html');

const { reemplazarEnHtml } = require(path.join(RAIZ, 'lib', 'render-resenas.js'));

function esperado() {
  const datos = JSON.parse(fs.readFileSync(RUTA_DATOS, 'utf8'));
  const html = fs.readFileSync(RUTA_INDEX, 'utf8');
  return { html, nuevo: reemplazarEnHtml(html, datos, RAIZ) };
}

function generar() {
  const { html, nuevo } = esperado();
  if (nuevo === html) {
    console.log('Ya estaba todo al día.');
    return 0;
  }
  fs.writeFileSync(RUTA_INDEX, nuevo, 'utf8');
  console.log('index.html regenerado desde data/resenas.json');
  return 0;
}

function revisar() {
  const { html, nuevo } = esperado();
  if (nuevo === html) {
    console.log('OK: index.html coincide con data/resenas.json');
    return 0;
  }
  console.error('DESFASADO: index.html no coincide con data/resenas.json.');
  console.error('Corregilo con:  node tools/resenas.cjs generar');
  return 1;
}

const comandos = { generar, revisar };
const comando = process.argv[2];

if (!comandos[comando]) {
  console.error('Comandos: generar | revisar');
  process.exitCode = 1;
} else {
  try {
    process.exitCode = comandos[comando]();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
