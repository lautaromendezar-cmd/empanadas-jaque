'use strict';

/**
 * Genera la sección de reseñas a partir de data/resenas.json.
 *
 * Las reseñas se cargan a mano (copiadas de la ficha de Google Maps), no por
 * la API de Google: se eligen cuáles van y no hay clave ni facturación.
 * La usa tools/resenas.cjs. Todo valor interpolado se escapa.
 */

const fs = require('fs');
const path = require('path');

const MARCA_PUNTAJE_INICIO = '<!-- RESENAS-PUNTAJE:START -->';
const MARCA_PUNTAJE_FIN = '<!-- RESENAS-PUNTAJE:END -->';
const MARCA_INICIO = '<!-- RESENAS:START -->';
const MARCA_FIN = '<!-- RESENAS:END -->';

const CARPETA_FOTOS = 'assets/img/resenas';

/**
 * Google muestra la fecha aproximada («hace 2 meses»), no el día: por eso la
 * fecha se carga como AAAA-MM y se muestra el mes y el año.
 */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const ESTRELLA = '<path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/>';

function escaparHtml(valor) {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 4.6 -> "4,6" */
function decimal(n) {
  return String(n).replace('.', ',');
}

function validar(datos, raiz) {
  if (!datos || typeof datos !== 'object') throw new Error('resenas.json no es un objeto');
  if (typeof datos.puntaje !== 'number' || datos.puntaje < 1 || datos.puntaje > 5) {
    throw new Error('puntaje tiene que ser un número entre 1 y 5 (ej. 4.6)');
  }
  if (!Number.isInteger(datos.total) || datos.total < 1) throw new Error('total tiene que ser un entero');
  if (!Array.isArray(datos.resenas) || !datos.resenas.length) throw new Error('no hay reseñas');

  datos.resenas.forEach((r, i) => {
    const donde = `reseña ${i + 1} (${r && r.autor})`;
    if (!r.autor || typeof r.autor !== 'string') throw new Error(`${donde}: falta autor`);
    if (!r.texto || typeof r.texto !== 'string') throw new Error(`${donde}: falta texto`);
    if (!Number.isInteger(r.estrellas) || r.estrellas < 1 || r.estrellas > 5) {
      throw new Error(`${donde}: estrellas tiene que ser un entero de 1 a 5`);
    }
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(r.fecha || '')) throw new Error(`${donde}: fecha va como AAAA-MM`);
    if (r.foto != null) {
      if (!/^[a-z0-9-]+\.(jpg|webp|png)$/.test(r.foto)) {
        throw new Error(`${donde}: foto tiene que ser un nombre simple, ej. "juan-perez.jpg"`);
      }
      if (raiz && !fs.existsSync(path.join(raiz, CARPETA_FOTOS, r.foto))) {
        throw new Error(`${donde}: no existe ${CARPETA_FOTOS}/${r.foto}`);
      }
    }
  });
}

/** Estrellas del puntaje general: llenas, una a medias si corresponde, vacías. */
function estrellasPuntaje(puntaje) {
  const base = Math.floor(puntaje);
  const fraccion = puntaje - base;
  const llenas = fraccion >= 0.75 ? base + 1 : base;
  const media = fraccion >= 0.25 && fraccion < 0.75;
  let svgs = '';
  for (let i = 0; i < 5; i++) {
    if (i < llenas) {
      svgs += `\n            <svg viewBox="0 0 24 24" aria-hidden="true">${ESTRELLA}</svg>`;
    } else if (i === llenas && media) {
      svgs += `\n            <svg viewBox="0 0 24 24" class="half" aria-hidden="true"><defs><linearGradient id="halfstar"><stop offset="50%" stop-color="currentColor"/><stop offset="50%" stop-color="#d9d9d9"/></linearGradient></defs><path fill="url(#halfstar)" d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/></svg>`;
    } else {
      svgs += `\n            <svg viewBox="0 0 24 24" class="empty" aria-hidden="true">${ESTRELLA}</svg>`;
    }
  }
  return svgs;
}

function renderPuntaje(datos) {
  const p = decimal(datos.puntaje);
  return [
    `<strong>${p}</strong>`,
    `          <span class="stars" role="img" aria-label="${p} de 5 estrellas">${estrellasPuntaje(datos.puntaje)}`,
    '          </span>',
    `          <span class="reviews-count">a base de <strong>${datos.total} reseñas</strong> en Google</span>`,
  ].join('\n');
}

function iniciales(nombre) {
  const partes = nombre.trim().split(/\s+/);
  const letras = partes.length > 1 ? partes[0][0] + partes[partes.length - 1][0] : partes[0].slice(0, 2);
  return letras.toUpperCase();
}

function renderTarjeta(r) {
  let estrellas = '';
  for (let i = 0; i < 5; i++) {
    estrellas += `<svg viewBox="0 0 24 24"${i < r.estrellas ? '' : ' class="empty"'} aria-hidden="true">${ESTRELLA}</svg>`;
  }
  const [a, m] = r.fecha.split('-');
  const avatar = r.foto
    ? `<img class="review-avatar" src="${CARPETA_FOTOS}/${escaparHtml(r.foto)}" alt="" width="40" height="40" loading="lazy" decoding="async">`
    : `<span class="review-avatar" aria-hidden="true">${escaparHtml(iniciales(r.autor))}</span>`;
  return [
    '          <li class="review-card">',
    `            <span class="stars" role="img" aria-label="${r.estrellas} de 5 estrellas">${estrellas}</span>`,
    `            <p>${escaparHtml(r.texto)}</p>`,
    `            <footer>${avatar}<span class="review-meta"><span class="review-author">${escaparHtml(r.autor)}</span><time datetime="${r.fecha}">${MESES[m - 1]} ${a}</time></span></footer>`,
    '          </li>',
  ].join('\n');
}

function renderTarjetas(datos) {
  return '\n' + datos.resenas.map(renderTarjeta).join('\n') + '\n          ';
}

function entreMarcas(html, inicio, fin, contenido) {
  const i = html.indexOf(inicio);
  const f = html.indexOf(fin);
  if (i === -1 || f === -1 || f < i) throw new Error(`no encuentro ${inicio} ... ${fin} en index.html`);
  return html.slice(0, i + inicio.length) + contenido + html.slice(f);
}

function reemplazarEnHtml(html, datos, raiz) {
  validar(datos, raiz);
  let nuevo = entreMarcas(html, MARCA_PUNTAJE_INICIO, MARCA_PUNTAJE_FIN, '\n          ' + renderPuntaje(datos) + '\n          ');
  nuevo = entreMarcas(nuevo, MARCA_INICIO, MARCA_FIN, renderTarjetas(datos));

  const ld = /"aggregateRating": \{ "@type": "AggregateRating", "ratingValue": "[^"]*", "reviewCount": "[^"]*" \}/;
  if (!ld.test(nuevo)) throw new Error('no encuentro aggregateRating en el JSON-LD');
  nuevo = nuevo.replace(ld, `"aggregateRating": { "@type": "AggregateRating", "ratingValue": "${datos.puntaje}", "reviewCount": "${datos.total}" }`);
  return nuevo;
}

module.exports = { reemplazarEnHtml, validar, iniciales, CARPETA_FOTOS };
