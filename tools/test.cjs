#!/usr/bin/env node
'use strict';

/**
 * Pruebas del panel. Corren sin instalar nada y sin tocar GitHub:
 *   node tools/test.cjs
 *
 * Cubren lo que rompe en silencio: escapado de HTML, validación de precios,
 * firma de sesión y los rechazos de los endpoints.
 */

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let pasadas = 0;
const fallas = [];

function probar(nombre, fn) {
  try {
    fn();
    pasadas++;
  } catch (e) {
    fallas.push(`${nombre}\n    ${e.message}`);
  }
}

function igual(a, b, msg) {
  if (a !== b) throw new Error(`${msg || 'esperaba'}: ${JSON.stringify(b)}, obtuve ${JSON.stringify(a)}`);
}
function cierto(v, msg) {
  if (!v) throw new Error(msg || 'esperaba algo verdadero');
}
function tira(fn, msg) {
  let tiro = false;
  try { fn(); } catch { tiro = true; }
  if (!tiro) throw new Error(msg || 'esperaba que tirara error y no tiró');
}

// =====================================================================
// 1. Renderizador del menú
// =====================================================================
const render = require(path.join(RAIZ, 'lib', 'render-menu.js'));

probar('escapa los caracteres peligrosos de HTML', () => {
  igual(render.escaparHtml('<script>'), '&lt;script&gt;');
  igual(render.escaparHtml('a & b'), 'a &amp; b');
  igual(render.escaparHtml('di "hola"'), 'di &quot;hola&quot;');
});

probar('un nombre con HTML adentro sale escapado, no como etiqueta', () => {
  const menu = {
    grupos: [{
      id: 'g', titulo: 'G', subtitulo: null,
      items: [{ id: 'x', nombre: '</span><script>alert(1)</script>', desc: null, precio: 3500, buscar: 'x' }],
    }],
  };
  const html = render.renderMenu(menu);
  cierto(!html.includes('<script>'), 'se coló una etiqueta script sin escapar');
  cierto(html.includes('&lt;script&gt;'), 'no encontré la versión escapada');
});

probar('un data-name con comillas no puede romper el atributo', () => {
  const menu = {
    grupos: [{
      id: 'g', titulo: 'G', subtitulo: null,
      items: [{ id: 'x', nombre: 'X', desc: null, precio: 3500, buscar: '" onmouseover="alert(1)' }],
    }],
  };
  const html = render.renderMenu(menu);
  cierto(!html.includes('onmouseover="alert'), 'se escapó del atributo');
  cierto(html.includes('&quot;'), 'no escapó las comillas');
});

probar('rechaza precios que no sean enteros en rango', () => {
  tira(() => render.validarPrecio(3500.5, 'x'), 'aceptó un decimal');
  tira(() => render.validarPrecio('3500', 'x'), 'aceptó un string');
  tira(() => render.validarPrecio(-100, 'x'), 'aceptó un negativo');
  tira(() => render.validarPrecio(0, 'x'), 'aceptó cero');
  tira(() => render.validarPrecio(99, 'x'), 'aceptó menos del mínimo');
  tira(() => render.validarPrecio(1000001, 'x'), 'aceptó más del máximo');
  tira(() => render.validarPrecio(NaN, 'x'), 'aceptó NaN');
  tira(() => render.validarPrecio(Infinity, 'x'), 'aceptó Infinity');
  igual(render.validarPrecio(3500, 'x'), 3500, 'rechazó un precio válido');
});

probar('rechaza menús mal formados', () => {
  tira(() => render.validarMenu({}), 'aceptó un menú sin grupos');
  tira(() => render.validarMenu({ grupos: [{ id: 'a' }] }), 'aceptó un grupo sin items');
  tira(() => render.validarMenu({
    grupos: [{ id: 'a', titulo: 'A', items: [
      { id: 'rep', nombre: 'Uno', precio: 100 },
      { id: 'rep', nombre: 'Dos', precio: 100 },
    ] }],
  }), 'aceptó ids repetidos');
});

probar('reemplazarEnHtml tira si faltan las marcas', () => {
  tira(() => render.reemplazarEnHtml('<html></html>', { grupos: [] }), 'no detectó la falta de marcas');
});

// --- contra los archivos de verdad ---
const menuReal = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'menu.json'), 'utf8'));
const indexReal = fs.readFileSync(path.join(RAIZ, 'index.html'), 'utf8');

probar('index.html está al día con menu.json', () => {
  igual(render.reemplazarEnHtml(indexReal, menuReal), indexReal, 'el index quedó desfasado del menu.json');
});

probar('el menú real tiene los 28 gustos', () => {
  const total = menuReal.grupos.reduce((n, g) => n + g.items.length, 0);
  igual(total, 28, 'cantidad de gustos');
});

probar('cambiar un precio actualiza el listado Y los datos estructurados', () => {
  const copia = JSON.parse(JSON.stringify(menuReal));
  copia.grupos[0].items[0].precio = 9999;
  const nuevo = render.reemplazarEnHtml(indexReal, copia);

  cierto(nuevo.includes('<span class="pprice">$9999</span>'), 'el listado no tiene el precio nuevo');
  cierto(nuevo.includes('"price": "9999"'), 'los datos estructurados no tienen el precio nuevo');

  // Fuera de los dos bloques generados no se movió una coma. Las marcas del
  // JSON-LD están en el <head> y las del listado en el <body>, así que las
  // zonas intactas son tres.
  const zonas = (t) => [
    t.slice(0, t.indexOf(render.MARCA_LD_INICIO)),
    t.slice(t.indexOf(render.MARCA_LD_FIN), t.indexOf(render.MARCA_INICIO)),
    t.slice(t.indexOf(render.MARCA_FIN)),
  ];
  const antes = zonas(indexReal);
  const despues = zonas(nuevo);
  const nombres = ['antes del JSON-LD', 'entre el JSON-LD y el listado', 'después del listado'];
  antes.forEach((z, i) => igual(despues[i], z, `se movió algo ${nombres[i]}`));
});

probar('los datos estructurados del menú son JSON válido y completo', () => {
  const bloque = render.renderMenuLd(menuReal);
  const json = bloque.slice(bloque.indexOf('{'), bloque.lastIndexOf('}') + 1);
  const doc = JSON.parse(json);
  igual(doc['@type'], 'Menu', 'tipo');
  igual(doc.hasMenuSection.length, 2, 'secciones');
  const items = doc.hasMenuSection.flatMap((s) => s.hasMenuItem);
  igual(items.length, 28, 'items');
  cierto(items.every((i) => i.offers.priceCurrency === 'ARS'), 'falta la moneda en algún item');
  cierto(items.every((i) => /^\d+$/.test(i.offers.price)), 'algún precio no es un número limpio');
  // el Restaurant lo referencia por id
  cierto(indexReal.includes(`"hasMenu": { "@id": "${doc['@id']}" }`), 'el Restaurant no apunta al Menu');
});

probar('un nombre con < no puede romper el script de datos estructurados', () => {
  const copia = JSON.parse(JSON.stringify(menuReal));
  copia.grupos[0].items[0].nombre = 'Carne </script><script>alert(1)</script>';
  const bloque = render.renderMenuLd(copia);
  const cuerpo = bloque.slice(bloque.indexOf('{'), bloque.lastIndexOf('}') + 1);
  cierto(!cuerpo.includes('</script>'), 'se puede cerrar la etiqueta desde el nombre');
  cierto(cuerpo.includes('\\u003c'), 'no escapó el <');
  JSON.parse(cuerpo); // y sigue siendo JSON válido
});

// =====================================================================
// 2. Sesión y contraseña
// =====================================================================
const auth = require(path.join(RAIZ, 'lib', 'auth.js'));

const PASS = 'una contraseña larga de prueba 123';
const HASH = auth.hashearPassword(PASS);
const SECRETO = 'a'.repeat(64);

probar('la contraseña correcta valida y la incorrecta no', () => {
  cierto(auth.verificarPassword(PASS, HASH), 'rechazó la contraseña correcta');
  cierto(!auth.verificarPassword(PASS + 'x', HASH), 'aceptó una contraseña incorrecta');
  cierto(!auth.verificarPassword('', HASH), 'aceptó la contraseña vacía');
  cierto(!auth.verificarPassword(PASS.toUpperCase(), HASH), 'ignoró mayúsculas');
});

probar('el hash no contiene la contraseña en claro', () => {
  cierto(!HASH.includes(PASS), 'la contraseña quedó en el hash');
  cierto(HASH.startsWith('scrypt$'), 'formato de hash inesperado');
});

probar('dos hashes de la misma contraseña son distintos (hay salt)', () => {
  cierto(auth.hashearPassword(PASS) !== auth.hashearPassword(PASS), 'no hay salt');
});

probar('no revienta con hashes basura', () => {
  cierto(!auth.verificarPassword(PASS, 'cualquier cosa'), 'aceptó un hash inválido');
  cierto(!auth.verificarPassword(PASS, 'scrypt$zz$zz'), 'aceptó hex inválido');
  cierto(!auth.verificarPassword(PASS, ''), 'aceptó hash vacío');
  cierto(!auth.verificarPassword(null, HASH), 'aceptó password null');
});

probar('un token firmado se valida', () => {
  cierto(auth.tokenValido(auth.crearToken(SECRETO), SECRETO), 'rechazó un token legítimo');
});

probar('un token con otro secreto se rechaza', () => {
  cierto(!auth.tokenValido(auth.crearToken(SECRETO), 'b'.repeat(64)), 'aceptó firma de otro secreto');
});

probar('un token manipulado se rechaza', () => {
  const token = auth.crearToken(SECRETO);
  const [vence, nonce, firma] = token.split('.');
  // estirar el vencimiento sin volver a firmar
  const estirado = `${Number(vence) + 999999999}.${nonce}.${firma}`;
  cierto(!auth.tokenValido(estirado, SECRETO), 'aceptó un vencimiento adulterado');
  cierto(!auth.tokenValido(`${vence}.${nonce}.${firma}x`, SECRETO), 'aceptó una firma alterada');
  cierto(!auth.tokenValido('', SECRETO), 'aceptó token vacío');
  cierto(!auth.tokenValido('a.b.c', SECRETO), 'aceptó un token inventado');
  cierto(!auth.tokenValido(null, SECRETO), 'aceptó null');
});

probar('un token vencido se rechaza', () => {
  const crypto = require('crypto');
  const vencido = Date.now() - 1000;
  const datos = `${vencido}.abc`;
  const firma = crypto.createHmac('sha256', SECRETO).update(datos).digest('base64url');
  cierto(!auth.tokenValido(`${datos}.${firma}`, SECRETO), 'aceptó un token vencido');
});

probar('la cookie de sesión sale blindada', () => {
  const cookie = auth.cookieDeSesion('token');
  cierto(cookie.includes('HttpOnly'), 'falta HttpOnly');
  cierto(cookie.includes('SameSite=Strict'), 'falta SameSite=Strict');
  cierto(cookie.includes('Path=/'), 'falta Path');
  const borrada = auth.cookieBorrada();
  cierto(borrada.includes('Max-Age=0'), 'la cookie de salida no expira');
});

// =====================================================================
// 3. Endpoints, con GitHub simulado
// =====================================================================
process.env.ADMIN_PASSWORD_HASH = HASH;
process.env.SESSION_SECRET = SECRETO;
process.env.GITHUB_REPO = 'test/test';
process.env.GITHUB_TOKEN = 'token-de-mentira';

const github = require(path.join(RAIZ, 'lib', 'github.js'));
let commiteado = null;
const menuGuardado = JSON.stringify(menuReal, null, 2) + '\n';
const sitemapReal = fs.readFileSync(path.join(RAIZ, 'sitemap.xml'), 'utf8');

// Mutable: la fecha del sitemap decide si entra o no al commit, así que cada
// prueba fija la que necesita. Leerla del archivo real hacía que el resultado
// dependiera del día en que se corrieran las pruebas.
let sitemapStub = sitemapReal.replace(/<lastmod>[^<]*<\/lastmod>/, '<lastmod>2020-01-01</lastmod>');
github.leerArchivo = async (ruta) => {
  if (ruta === 'data/menu.json') return menuGuardado;
  if (ruta === 'sitemap.xml') return sitemapStub;
  return indexReal;
};
github.commitearArchivos = async (archivos, mensaje) => {
  commiteado = { archivos, mensaje };
  return { sha: 'abc123', url: 'https://github.com/test/commit/abc123' };
};

const apiSesion = require(path.join(RAIZ, 'api', 'sesion.js'));
const apiMenu = require(path.join(RAIZ, 'api', 'menu.js'));

function req(opciones = {}) {
  return {
    method: opciones.method || 'GET',
    headers: {
      ...(opciones.panel === false ? {} : { 'x-panel': '1' }),
      ...(opciones.cookie ? { cookie: opciones.cookie } : {}),
      'x-forwarded-for': opciones.ip || '1.2.3.4',
      'content-type': 'application/json',
      ...opciones.headers,
    },
    body: opciones.body,
    socket: { remoteAddress: '1.2.3.4' },
  };
}

function res() {
  return {
    statusCode: 0, headers: {}, cuerpo: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(texto) { this.cuerpo = JSON.parse(texto); },
  };
}

async function llamar(handler, opciones) {
  const r = res();
  await handler(req(opciones), r);
  return r;
}

// Las pruebas asíncronas se encadenan y se reportan al final.
(async () => {
  async function probarAsync(nombre, fn) {
    try { await fn(); pasadas++; } catch (e) { fallas.push(`${nombre}\n    ${e.message}`); }
  }

  await probarAsync('sin sesión, /api/menu responde 401', async () => {
    const r = await llamar(apiMenu, {});
    igual(r.statusCode, 401, 'código');
  });

  await probarAsync('entrar sin la cabecera del panel responde 403 (CSRF)', async () => {
    const r = await llamar(apiSesion, { method: 'POST', panel: false, body: { password: PASS } });
    igual(r.statusCode, 403, 'código');
  });

  await probarAsync('contraseña incorrecta responde 401 y no deja cookie', async () => {
    const r = await llamar(apiSesion, { method: 'POST', body: { password: 'incorrecta' }, ip: '9.9.9.1' });
    igual(r.statusCode, 401, 'código');
    cierto(!r.headers['set-cookie'], 'mandó cookie con contraseña incorrecta');
  });

  await probarAsync('sin password no entra', async () => {
    const r = await llamar(apiSesion, { method: 'POST', body: {}, ip: '9.9.9.2' });
    igual(r.statusCode, 401, 'código');
  });

  let cookieBuena = null;
  await probarAsync('contraseña correcta abre sesión', async () => {
    const r = await llamar(apiSesion, { method: 'POST', body: { password: PASS }, ip: '5.5.5.5' });
    igual(r.statusCode, 200, 'código');
    cierto(r.headers['set-cookie'], 'no mandó cookie');
    cierto(r.headers['set-cookie'].includes('HttpOnly'), 'la cookie no es HttpOnly');
    const valor = r.headers['set-cookie'].split(';')[0];
    cookieBuena = valor;
    cierto(!JSON.stringify(r.cuerpo).includes(PASS), 'devolvió la contraseña');
  });

  await probarAsync('los primeros 4 errores NO bloquean', async () => {
    for (let i = 0; i < 4; i++) {
      const r = await llamar(apiSesion, { method: 'POST', body: { password: 'mal' }, ip: '7.7.7.1' });
      igual(r.statusCode, 401, `intento ${i + 1}`);
    }
  });

  await probarAsync('tras 5 intentos fallidos la IP queda bloqueada', async () => {
    for (let i = 0; i < 5; i++) {
      await llamar(apiSesion, { method: 'POST', body: { password: 'mal' }, ip: '7.7.7.7' });
    }
    const r = await llamar(apiSesion, { method: 'POST', body: { password: PASS }, ip: '7.7.7.7' });
    igual(r.statusCode, 429, 'código');
    cierto(r.headers['retry-after'], 'falta Retry-After');
    // el primer castigo es corto, no un cuarto de hora
    cierto(Number(r.headers['retry-after']) <= 30, `castigo inicial: ${r.headers['retry-after']}s`);
    cierto(/segundos/.test(r.cuerpo.error), `mensaje en segundos: ${r.cuerpo.error}`);
  });

  await probarAsync('el bloqueo de una IP no afecta a las demás', async () => {
    const r = await llamar(apiSesion, { method: 'POST', body: { password: 'mal' }, ip: '8.8.8.1' });
    igual(r.statusCode, 401, 'otra IP debería poder intentar');
  });

  // El caso que le pasó al dueño: se cumplió el castigo, y un ÚNICO error
  // posterior lo volvía a bloquear el tiempo completo porque el contador de
  // fallos no se olvidaba nunca.
  await probarAsync('pasada la ventana, un solo error no vuelve a bloquear', async () => {
    const IP = '7.7.7.9';
    for (let i = 0; i < 6; i++) {
      await llamar(apiSesion, { method: 'POST', body: { password: 'mal' }, ip: IP });
    }
    igual(
      (await llamar(apiSesion, { method: 'POST', body: { password: PASS }, ip: IP })).statusCode,
      429, 'debería estar bloqueado recién castigado'
    );

    // Simular que pasó un rato largo sin intentos. El salto va escrito a mano y
    // no como auth.VENTANA_MS a propósito: tiene que superar también al bloqueo
    // fijo de 15 minutos de la versión vieja, o esta prueba pasa sin probar nada.
    const SALTO_MS = 20 * 60 * 1000;
    const real = Date.now;
    Date.now = () => real() + SALTO_MS;
    try {
      const unError = await llamar(apiSesion, { method: 'POST', body: { password: 'mal' }, ip: IP });
      igual(unError.statusCode, 401, 'un error aislado tiene que dar 401, no 429');
      const otro = await llamar(apiSesion, { method: 'POST', body: { password: 'mal' }, ip: IP });
      igual(otro.statusCode, 401, 'el segundo error tampoco bloquea');
    } finally {
      Date.now = real;
    }
  });

  await probarAsync('entrar bien limpia el contador de fallos', async () => {
    const IP = '7.7.7.5';
    for (let i = 0; i < 4; i++) {
      await llamar(apiSesion, { method: 'POST', body: { password: 'mal' }, ip: IP });
    }
    igual((await llamar(apiSesion, { method: 'POST', body: { password: PASS }, ip: IP })).statusCode, 200, 'debería entrar');
    // con el contador limpio, vuelve a tener los 5 intentos completos
    for (let i = 0; i < 4; i++) {
      const r = await llamar(apiSesion, { method: 'POST', body: { password: 'mal' }, ip: IP });
      igual(r.statusCode, 401, `tras entrar bien, intento ${i + 1} no debería bloquear`);
    }
  });

  await probarAsync('con sesión, GET /api/menu devuelve los precios sin datos de más', async () => {
    const r = await llamar(apiMenu, { cookie: cookieBuena });
    igual(r.statusCode, 200, 'código');
    igual(r.cuerpo.grupos.length, 2, 'grupos');
    const total = r.cuerpo.grupos.reduce((n, g) => n + g.items.length, 0);
    igual(total, 28, 'gustos');
    cierto(r.cuerpo.version, 'falta la version');
    cierto(!JSON.stringify(r.cuerpo).includes('GITHUB'), 'filtró algo del entorno');
  });

  await probarAsync('guardar sin la cabecera del panel responde 403', async () => {
    const r = await llamar(apiMenu, { method: 'PUT', panel: false, cookie: cookieBuena, body: { precios: {} } });
    igual(r.statusCode, 403, 'código');
  });

  await probarAsync('rechaza un gusto que no existe', async () => {
    const r = await llamar(apiMenu, { method: 'PUT', cookie: cookieBuena, body: { precios: { inventado: 3000 } } });
    igual(r.statusCode, 400, 'código');
  });

  await probarAsync('rechaza precios inválidos', async () => {
    for (const malo of [3500.5, '3500', -1, 0, 99, 2000000, null, {}, []]) {
      const r = await llamar(apiMenu, {
        method: 'PUT', cookie: cookieBuena, body: { precios: { 'carne-suave': malo } },
      });
      igual(r.statusCode, 400, `debería rechazar ${JSON.stringify(malo)}`);
    }
  });

  await probarAsync('ignora campos que no sean precios', async () => {
    commiteado = null;
    const r = await llamar(apiMenu, {
      method: 'PUT', cookie: cookieBuena,
      body: { precios: { 'carne-suave': 4000 }, nombre: 'HACKEADO', grupos: [] },
    });
    igual(r.statusCode, 200, 'código');
    cierto(commiteado, 'no commiteó');
    cierto(!commiteado.archivos[0].contenido.includes('HACKEADO'), 'entró un campo de más');
  });

  await probarAsync('detecta que los precios cambiaron desde que se abrió el panel', async () => {
    const r = await llamar(apiMenu, {
      method: 'PUT', cookie: cookieBuena,
      body: { precios: { 'carne-suave': 4000 }, version: 'viejaviejavieja' },
    });
    igual(r.statusCode, 409, 'código');
  });

  await probarAsync('sin cambios reales no commitea', async () => {
    commiteado = null;
    const actual = menuReal.grupos[0].items[0].precio;
    const r = await llamar(apiMenu, {
      method: 'PUT', cookie: cookieBuena, body: { precios: { 'carne-suave': actual } },
    });
    igual(r.statusCode, 200, 'código');
    igual(r.cuerpo.guardado, false, 'dijo que guardó');
    cierto(!commiteado, 'commiteó sin necesidad');
  });

  await probarAsync('un cambio válido commitea los tres archivos juntos', async () => {
    commiteado = null;
    sitemapStub = sitemapReal.replace(/<lastmod>[^<]*<\/lastmod>/, '<lastmod>2020-01-01</lastmod>');
    const r = await llamar(apiMenu, {
      method: 'PUT', cookie: cookieBuena, body: { precios: { 'carne-suave': 4200, pollo: 4200 } },
    });
    igual(r.statusCode, 200, 'código');
    igual(r.cuerpo.cambios, 2, 'cantidad de cambios');

    const rutas = commiteado.archivos.map((a) => a.ruta).sort();
    igual(rutas.join(','), 'data/menu.json,index.html,sitemap.xml', 'rutas commiteadas');

    const html = commiteado.archivos.find((a) => a.ruta === 'index.html').contenido;
    cierto(html.includes('<span class="pprice">$4200</span>'), 'el listado no tiene el precio nuevo');
    cierto(html.includes('"price": "4200"'), 'los datos estructurados no tienen el precio nuevo');

    const json = JSON.parse(commiteado.archivos.find((a) => a.ruta === 'data/menu.json').contenido);
    igual(json.grupos[0].items[0].precio, 4200, 'el JSON no tiene el precio nuevo');

    const sitemap = commiteado.archivos.find((a) => a.ruta === 'sitemap.xml').contenido;
    cierto(sitemap.includes(`<lastmod>${json.actualizado}</lastmod>`), 'el sitemap no quedó con la fecha del cambio');
  });

  await probarAsync('si el sitemap ya tiene la fecha de hoy, no entra al commit', async () => {
    commiteado = null;
    // fecha de hoy en Buenos Aires, la misma que va a poner el endpoint
    const hoy = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
    sitemapStub = sitemapReal.replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${hoy}</lastmod>`);

    const r = await llamar(apiMenu, {
      method: 'PUT', cookie: cookieBuena, body: { precios: { 'carne-suave': 4300 } },
    });
    igual(r.statusCode, 200, 'código');
    const rutas = commiteado.archivos.map((a) => a.ruta).sort();
    igual(rutas.join(','), 'data/menu.json,index.html', 'no debería incluir un sitemap idéntico');
  });

  await probarAsync('el sitemap sólo acepta fechas con forma de fecha', () => {
    const { actualizarSitemap } = require(path.join(RAIZ, 'lib', 'render-menu.js'));
    for (const mala of ['ayer', '2026-8-1', '', '2026-13-45x']) {
      tira(() => actualizarSitemap(sitemapReal, mala), `aceptó "${mala}"`);
    }
    cierto(actualizarSitemap(sitemapReal, '2026-12-01').includes('<lastmod>2026-12-01</lastmod>'), 'no aplicó una fecha válida');
  });

  await probarAsync('una cookie con firma adulterada no sirve', async () => {
    const nombre = cookieBuena.split('=')[0];
    const r = await llamar(apiMenu, { cookie: `${nombre}=999999999999.abc.firmatrucha` });
    igual(r.statusCode, 401, 'código');
  });

  await probarAsync('salir borra la cookie', async () => {
    const r = await llamar(apiSesion, { method: 'DELETE', cookie: cookieBuena });
    igual(r.statusCode, 200, 'código');
    cierto(r.headers['set-cookie'].includes('Max-Age=0'), 'no borró la cookie');
  });

  await probarAsync('métodos no soportados responden 405', async () => {
    const r = await llamar(apiMenu, { method: 'DELETE', cookie: cookieBuena });
    igual(r.statusCode, 405, 'código');
  });

  // ---------------- resultado ----------------
  console.log(`\n${pasadas} pruebas en verde`);
  if (fallas.length) {
    console.error(`${fallas.length} FALLAS:\n`);
    fallas.forEach((f) => console.error('  - ' + f));
    process.exit(1);
  }
  console.log('Todo OK.\n');
})();
