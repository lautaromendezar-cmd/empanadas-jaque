'use strict';

/**
 * Escritura en el repo por la API de GitHub.
 *
 * Usa la Git Data API en vez de la de contenidos para que menu.json e
 * index.html entren en UN SOLO commit. Con dos commits habría dos deploys y,
 * peor, un momento en que el JSON y el HTML no coinciden.
 *
 * El token vive únicamente en la variable de entorno GITHUB_TOKEN del servidor.
 * Nunca se manda al navegador.
 */

const API = 'https://api.github.com';

function config() {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO;
  const rama = process.env.GITHUB_BRANCH || 'main';
  if (!token) throw new Error('Falta la variable de entorno GITHUB_TOKEN');
  if (!repo || !repo.includes('/')) throw new Error('Falta GITHUB_REPO (formato usuario/repo)');
  return { token, repo, rama };
}

async function llamar(ruta, opciones = {}) {
  const { token } = config();
  const respuesta = await fetch(`${API}${ruta}`, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'jaque-panel',
      ...(opciones.body ? { 'Content-Type': 'application/json' } : {}),
      ...opciones.headers,
    },
  });
  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => '');
    const error = new Error(`GitHub ${respuesta.status} en ${ruta}: ${detalle.slice(0, 300)}`);
    error.status = respuesta.status;
    throw error;
  }
  return respuesta.json();
}

/** Lee un archivo de la rama. Devuelve el texto ya decodificado. */
async function leerArchivo(ruta) {
  const { repo, rama } = config();
  const datos = await llamar(`/repos/${repo}/contents/${encodeURI(ruta)}?ref=${encodeURIComponent(rama)}`);
  if (Array.isArray(datos)) throw new Error(`${ruta} es un directorio, no un archivo`);
  return Buffer.from(datos.content, 'base64').toString('utf8');
}

/**
 * Commitea varios archivos de una sola vez.
 * @param {Array<{ruta: string, contenido: string}>} archivos
 * @param {string} mensaje
 * @returns {Promise<{sha: string, url: string}>}
 */
async function commitearArchivos(archivos, mensaje) {
  const { repo, rama } = config();

  // 1. dónde está parada la rama ahora
  const ref = await llamar(`/repos/${repo}/git/ref/heads/${encodeURIComponent(rama)}`);
  const commitPadre = ref.object.sha;

  // 2. el árbol de ese commit
  const commit = await llamar(`/repos/${repo}/git/commits/${commitPadre}`);
  const arbolBase = commit.tree.sha;

  // 3. un blob por archivo
  const blobs = [];
  for (const archivo of archivos) {
    const blob = await llamar(`/repos/${repo}/git/blobs`, {
      method: 'POST',
      body: JSON.stringify({
        content: Buffer.from(archivo.contenido, 'utf8').toString('base64'),
        encoding: 'base64',
      }),
    });
    blobs.push({ path: archivo.ruta, mode: '100644', type: 'blob', sha: blob.sha });
  }

  // 4. árbol nuevo sobre el actual
  const arbol = await llamar(`/repos/${repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({ base_tree: arbolBase, tree: blobs }),
  });

  // 5. el commit
  const nuevo = await llamar(`/repos/${repo}/git/commits`, {
    method: 'POST',
    body: JSON.stringify({ message: mensaje, tree: arbol.sha, parents: [commitPadre] }),
  });

  // 6. mover la rama. Sin force: si alguien commiteó en el medio, esto falla
  //    en vez de pisarle el trabajo.
  await llamar(`/repos/${repo}/git/refs/heads/${encodeURIComponent(rama)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: nuevo.sha, force: false }),
  });

  return { sha: nuevo.sha, url: nuevo.html_url };
}

module.exports = { leerArchivo, commitearArchivos };
