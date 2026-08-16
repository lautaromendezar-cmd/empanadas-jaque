/* Panel de precios. Habla con /api/sesion y /api/menu.
   Acá no hay ningún secreto: la contraseña se manda una vez y el token de
   GitHub nunca sale del servidor. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var pantallaEntrar = $('pantalla-entrar');
  var pantallaPrecios = $('pantalla-precios');
  var barraGuardar = $('barra-guardar');
  var contenedorGrupos = $('grupos');
  var avisoEntrar = $('aviso-entrar');
  var avisoPrecios = $('aviso-precios');

  var estado = { grupos: [], originales: {}, version: null, guardando: false };

  // ---------- utilidades ----------

  function mostrarAviso(elemento, texto, ok) {
    elemento.textContent = texto;
    elemento.className = ok ? 'aviso ok' : 'aviso';
    elemento.hidden = !texto;
  }

  function pedir(ruta, opciones) {
    opciones = opciones || {};
    var cabeceras = { 'X-Panel': '1' };
    if (opciones.body) cabeceras['Content-Type'] = 'application/json';
    return fetch(ruta, {
      method: opciones.method || 'GET',
      headers: cabeceras,
      body: opciones.body ? JSON.stringify(opciones.body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (datos) {
        if (!r.ok) {
          var e = new Error(datos.error || 'Error ' + r.status);
          e.status = r.status;
          throw e;
        }
        return datos;
      });
    });
  }

  // ---------- entrar / salir ----------

  $('form-entrar').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var boton = $('boton-entrar');
    var password = $('password').value;
    boton.disabled = true;
    boton.textContent = 'Entrando…';
    mostrarAviso(avisoEntrar, '');

    pedir('/api/sesion', { method: 'POST', body: { password: password } })
      .then(function () {
        $('password').value = '';
        return cargarMenu();
      })
      .catch(function (e) { mostrarAviso(avisoEntrar, e.message); })
      .then(function () {
        boton.disabled = false;
        boton.textContent = 'Entrar';
      });
  });

  $('salir').addEventListener('click', function () {
    pedir('/api/sesion', { method: 'DELETE' }).then(function () { location.reload(); });
  });

  // ---------- dibujar los precios ----------

  function cargarMenu() {
    return pedir('/api/menu').then(function (datos) {
      estado.grupos = datos.grupos;
      estado.version = datos.version;
      estado.originales = {};
      datos.grupos.forEach(function (g) {
        g.items.forEach(function (i) { estado.originales[i.id] = i.precio; });
      });

      pantallaEntrar.hidden = true;
      pantallaPrecios.hidden = false;
      barraGuardar.hidden = false;
      $('salir').hidden = false;

      $('ultima-actualizacion').textContent = datos.actualizado
        ? 'Última actualización: ' + datos.actualizado
        : '';

      var alcance = $('alcance');
      alcance.innerHTML = '<option value="todos">Todo el menú</option>';
      datos.grupos.forEach(function (g) {
        var op = document.createElement('option');
        op.value = g.id;
        op.textContent = 'Sólo ' + g.titulo.toLowerCase();
        alcance.appendChild(op);
      });

      dibujarGrupos();
      actualizarResumen();
    });
  }

  function dibujarGrupos() {
    contenedorGrupos.textContent = '';
    estado.grupos.forEach(function (grupo) {
      var seccion = document.createElement('section');
      seccion.className = 'grupo';

      var cabecera = document.createElement('div');
      cabecera.className = 'grupo-titulo';
      var h3 = document.createElement('h3');
      h3.textContent = grupo.titulo;
      var cuenta = document.createElement('span');
      cuenta.textContent = grupo.items.length + ' gustos';
      cabecera.appendChild(h3);
      cabecera.appendChild(cuenta);
      seccion.appendChild(cabecera);

      grupo.items.forEach(function (item) {
        seccion.appendChild(dibujarItem(item, grupo.id));
      });

      contenedorGrupos.appendChild(seccion);
    });
  }

  function dibujarItem(item, grupoId) {
    var fila = document.createElement('div');
    fila.className = 'item';
    fila.dataset.id = item.id;
    fila.dataset.grupo = grupoId;

    var nombre = document.createElement('div');
    nombre.className = 'item-nombre';
    var fuerte = document.createElement('strong');
    fuerte.textContent = item.nombre;
    nombre.appendChild(fuerte);
    if (item.desc) {
      var em = document.createElement('em');
      em.textContent = item.desc;
      nombre.appendChild(em);
    }

    var caja = document.createElement('div');
    caja.className = 'item-precio';
    var signo = document.createElement('span');
    signo.textContent = '$';
    var input = document.createElement('input');
    input.type = 'number';
    input.inputMode = 'numeric';
    input.step = '1';
    input.min = '100';
    input.value = String(item.precio);
    input.id = 'precio-' + item.id;
    input.setAttribute('aria-label', 'Precio de ' + item.nombre);
    input.addEventListener('input', function () { alCambiarPrecio(fila); });
    caja.appendChild(signo);
    caja.appendChild(input);

    var antes = document.createElement('small');
    antes.className = 'item-antes';
    antes.hidden = true;
    caja.appendChild(antes);

    fila.appendChild(nombre);
    fila.appendChild(caja);
    return fila;
  }

  // ---------- cambios ----------

  function alCambiarPrecio(fila) {
    var id = fila.dataset.id;
    var input = fila.querySelector('input');
    var antes = fila.querySelector('.item-antes');
    var original = estado.originales[id];
    var actual = parseInt(input.value, 10);
    var cambio = Number.isFinite(actual) && actual !== original;

    fila.classList.toggle('cambiado', cambio);
    antes.hidden = !cambio;
    antes.textContent = cambio ? '$' + original : '';
    actualizarResumen();
  }

  function cambiosPendientes() {
    var lista = [];
    Array.prototype.forEach.call(document.querySelectorAll('.item'), function (fila) {
      var id = fila.dataset.id;
      var valor = parseInt(fila.querySelector('input').value, 10);
      if (Number.isFinite(valor) && valor !== estado.originales[id]) {
        lista.push({ id: id, precio: valor });
      }
    });
    return lista;
  }

  function hayInvalidos() {
    return Array.prototype.some.call(document.querySelectorAll('.item input'), function (input) {
      var v = parseInt(input.value, 10);
      return !Number.isFinite(v) || v < 100 || v > 1000000;
    });
  }

  function actualizarResumen() {
    var cambios = cambiosPendientes();
    var invalidos = hayInvalidos();
    var resumen = $('resumen-cambios');
    var guardar = $('guardar');

    if (invalidos) {
      resumen.textContent = 'Hay un precio vacío o fuera de rango';
    } else if (!cambios.length) {
      resumen.textContent = 'Sin cambios';
    } else {
      resumen.textContent = cambios.length === 1
        ? '1 precio cambiado'
        : cambios.length + ' precios cambiados';
    }

    guardar.disabled = estado.guardando || invalidos || !cambios.length;
    $('deshacer').hidden = !cambios.length;
  }

  $('deshacer').addEventListener('click', function () {
    Array.prototype.forEach.call(document.querySelectorAll('.item'), function (fila) {
      fila.querySelector('input').value = String(estado.originales[fila.dataset.id]);
      alCambiarPrecio(fila);
    });
    mostrarAviso(avisoPrecios, '');
  });

  // ---------- porcentaje ----------

  $('aplicar-porcentaje').addEventListener('click', function () {
    var pct = parseFloat($('porcentaje').value);
    var redondeo = parseInt($('redondeo').value, 10) || 1;
    var alcance = $('alcance').value;

    if (!Number.isFinite(pct)) {
      mostrarAviso(avisoPrecios, 'Poné un porcentaje válido.');
      return;
    }

    var tocados = 0;
    Array.prototype.forEach.call(document.querySelectorAll('.item'), function (fila) {
      if (alcance !== 'todos' && fila.dataset.grupo !== alcance) return;
      var base = estado.originales[fila.dataset.id];
      var nuevo = Math.round((base * (1 + pct / 100)) / redondeo) * redondeo;
      if (nuevo < 100) nuevo = 100;
      fila.querySelector('input').value = String(nuevo);
      alCambiarPrecio(fila);
      tocados++;
    });

    mostrarAviso(
      avisoPrecios,
      'Listo: ' + pct + '% sobre ' + tocados + ' gustos. Revisá y después tocá Guardar.',
      true
    );
  });

  // ---------- guardar ----------

  $('guardar').addEventListener('click', function () {
    var cambios = cambiosPendientes();
    if (!cambios.length) return;

    var texto = cambios.length === 1
      ? 'Vas a cambiar 1 precio.'
      : 'Vas a cambiar ' + cambios.length + ' precios.';
    if (!window.confirm(texto + '\n\nEl sitio se actualiza en menos de un minuto. ¿Guardamos?')) return;

    var precios = {};
    cambios.forEach(function (c) { precios[c.id] = c.precio; });

    var boton = $('guardar');
    estado.guardando = true;
    boton.disabled = true;
    boton.textContent = 'Guardando…';
    mostrarAviso(avisoPrecios, '');

    pedir('/api/menu', { method: 'PUT', body: { precios: precios, version: estado.version } })
      .then(function (datos) {
        estado.version = datos.version;
        cambios.forEach(function (c) { estado.originales[c.id] = c.precio; });
        Array.prototype.forEach.call(document.querySelectorAll('.item'), function (fila) {
          alCambiarPrecio(fila);
        });
        mostrarAviso(
          avisoPrecios,
          datos.guardado
            ? 'Guardado. El sitio se actualiza solo en menos de un minuto.'
            : 'No había nada para cambiar.',
          true
        );
      })
      .catch(function (e) {
        if (e.status === 401) {
          mostrarAviso(avisoPrecios, 'Se venció la sesión. Recargá la página y entrá de nuevo.');
        } else {
          mostrarAviso(avisoPrecios, e.message);
        }
      })
      .then(function () {
        estado.guardando = false;
        boton.textContent = 'Guardar y publicar';
        actualizarResumen();
      });
  });

  // Evita cerrar la pestaña con cambios sin guardar.
  window.addEventListener('beforeunload', function (ev) {
    if (!estado.guardando && cambiosPendientes().length) {
      ev.preventDefault();
      ev.returnValue = '';
    }
  });

  // ---------- arranque ----------

  pedir('/api/sesion')
    .then(function (datos) { if (datos.abierta) return cargarMenu(); })
    .catch(function () { /* sin sesión: queda la pantalla de entrar */ });
})();
