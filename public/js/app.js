/**
 * Arranque de la aplicacion: acceso, navegacion entre vistas,
 * cinta de estado operativo y sesion del usuario.
 */
import { api, estado, esc, aviso, abrirModal, puede, formulario, leerFormulario, detectarModo } from './nucleo.js';
import * as vistas from './vistas.js';

const ROLES = { admin: 'Administrador', supervisor: 'Supervisor', consulta: 'Consulta' };
const VISTA_INICIAL = 'panel';

/* ============================ ARRANQUE ============================ */

document.getElementById('rail-fecha').textContent = new Date().toLocaleDateString('es-MX', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

function actualizarReloj() {
  document.getElementById('reloj').textContent = new Date().toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
actualizarReloj();
setInterval(actualizarReloj, 30000);

iniciar();

async function iniciar() {
  // Sin servidor Node detras, la aplicacion corre en modo demostracion.
  await detectarModo();

  if (estado.demostracion) {
    document.getElementById('nota-servidor').classList.add('oculto');
    document.getElementById('nota-demo').classList.remove('oculto');
    document.getElementById('cinta-demo').classList.remove('oculto');
    document.getElementById('btn-entrar-demo').onclick = () => {
      const f = document.getElementById('form-acceso');
      f.usuario.value = 'admin';
      f.contrasena.value = 'demo';
      f.requestSubmit();
    };
  }

  try {
    const d = await api.obtener('/api/sesion');
    if (d.usuario) return await entrar(d.usuario);
  } catch {
    /* sin sesion activa */
  }
  document.getElementById('pantalla-acceso').classList.remove('oculto');
  document.getElementById('aplicacion').classList.add('oculto');
}

/* ============================ ACCESO ============================ */

document.getElementById('form-acceso').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  const error = document.getElementById('error-acceso');
  const boton = form.querySelector('button');
  error.classList.add('oculto');
  boton.disabled = true;

  try {
    const d = await api.crear('/api/sesion/iniciar', {
      usuario: form.usuario.value,
      contrasena: form.contrasena.value,
    });
    form.reset();
    await entrar(d.usuario);
  } catch (err) {
    error.textContent = err.message;
    error.classList.remove('oculto');
  }
  boton.disabled = false;
});

async function entrar(usuario) {
  estado.usuario = usuario;
  document.getElementById('pantalla-acceso').classList.add('oculto');
  document.getElementById('aplicacion').classList.remove('oculto');

  document.getElementById('nombre-usuario').textContent = usuario.nombre;
  document.getElementById('rol-usuario').textContent = ROLES[usuario.rol] ?? usuario.rol;
  document.getElementById('avatar-usuario').textContent = usuario.nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  // Oculta las opciones reservadas al administrador.
  document.querySelectorAll('[data-rol]').forEach((n) => n.classList.toggle('oculto', !puede(n.dataset.rol)));

  const [catalogos, config] = await Promise.all([api.obtener('/api/catalogos'), api.obtener('/api/configuracion')]);
  estado.catalogos = catalogos;
  estado.configuracion = config;
  document.getElementById('barra-centro').textContent = config.nombre_centro;

  estado.refrescarEstado = actualizarCinta;
  await actualizarCinta();
  setInterval(actualizarCinta, 60000);

  navegar();
}

/* ============================ NAVEGACION ============================ */

window.addEventListener('hashchange', navegar);

async function navegar() {
  if (!estado.usuario) return;
  const nombre = (location.hash.replace('#/', '') || VISTA_INICIAL).split('?')[0];
  const vista = vistas[nombre] ?? vistas[VISTA_INICIAL];

  document.querySelectorAll('.rail a').forEach((a) => a.classList.toggle('activo', a.dataset.vista === nombre));
  document.getElementById('rail').classList.remove('abierta');

  // Se reemplaza el contenedor para liberar los eventos de la vista anterior.
  const anterior = document.getElementById('contenido');
  const contenedor = anterior.cloneNode(false);
  anterior.replaceWith(contenedor);
  contenedor.innerHTML = '<div class="tabla-caja"><div class="vacio">Cargando</div></div>';

  try {
    await vista(contenedor);
  } catch (e) {
    if (e.codigo === 401) return location.reload();
    contenedor.innerHTML = `<div class="alerta alerta--error">No fue posible cargar la vista: ${esc(e.message)}</div>`;
  }
}

/* ==================== CINTA DE ESTADO Y CAMPANA ==================== */

async function actualizarCinta() {
  try {
    const d = await api.obtener('/api/resumen');
    for (const clave of ['vencido', 'critico', 'proximo', 'vigente']) {
      document.getElementById(`c-${clave}`).textContent = d.resumen[clave] ?? 0;
    }

    const insignia = document.getElementById('contador-notificaciones');
    insignia.textContent = d.sinLeer > 99 ? '99+' : d.sinLeer;
    insignia.classList.toggle('oculto', !d.sinLeer);

    const railAlertas = document.getElementById('rail-alertas');
    railAlertas.textContent = d.sinLeer;
    railAlertas.classList.toggle('oculto', !d.sinLeer);

    document.getElementById('cinta-sello').textContent = d.ultimaRevision
      ? `Ultima revision: ${d.ultimaRevision.slice(0, 16).replace(' ', ' · ')}`
      : 'Sin revisiones registradas';
    estado.notificaciones = d.sinLeer;
  } catch {
    /* la sesion pudo expirar */
  }
}

document.getElementById('btn-campana').onclick = () => (location.hash = '#/notificaciones');

document.getElementById('btn-revisar').onclick = async (e) => {
  const boton = e.currentTarget;
  boton.disabled = true;
  try {
    const r = await api.crear('/api/alertas/revisar');
    aviso(`Revision de vencimientos: ${r.generadas} alerta(s) nueva(s). Correo: ${r.correo}.`);
    await actualizarCinta();
    const actual = location.hash.replace('#/', '') || VISTA_INICIAL;
    if (actual === 'panel' || actual === 'notificaciones' || actual === 'vigencias') navegar();
  } catch (err) {
    aviso(err.message, 'error');
  }
  boton.disabled = false;
};

document.getElementById('btn-menu').onclick = () => document.getElementById('rail').classList.toggle('abierta');

/* ============================ MENU DE USUARIO ============================ */

const menuUsuario = document.getElementById('menu-usuario');
const desplegable = document.getElementById('menu-desplegable');

menuUsuario.addEventListener('click', (e) => {
  if (e.target.closest('[data-accion]')) return;
  desplegable.classList.toggle('abierto');
  e.stopPropagation();
});
document.addEventListener('click', () => desplegable.classList.remove('abierto'));

desplegable.addEventListener('click', async (e) => {
  const accion = e.target.closest('[data-accion]')?.dataset.accion;
  desplegable.classList.remove('abierto');

  if (accion === 'salir') {
    await api.crear('/api/sesion/cerrar');
    estado.usuario = null;
    location.hash = '';
    location.reload();
  }

  if (accion === 'contrasena') {
    abrirModal({
      titulo: 'Cambiar contrasena',
      ancho: 'modal--angosto',
      contenido: formulario([
        { nombre: 'nueva', etiqueta: 'Nueva contrasena', tipo: 'contrasena', requerido: true, ancho: 'completo' },
        { nombre: 'confirmar', etiqueta: 'Confirmar contrasena', tipo: 'contrasena', requerido: true, ancho: 'completo' },
      ]),
      acciones: [
        { texto: 'Cancelar', alClic: (_c, cerrar) => cerrar() },
        {
          texto: 'Guardar',
          clase: 'boton--primario',
          alClic: async (capa, cerrar) => {
            const datos = leerFormulario(capa);
            if (!datos) return;
            if (datos.nueva.length < 6) return aviso('La contrasena debe tener al menos 6 caracteres.', 'error');
            if (datos.nueva !== datos.confirmar) return aviso('Las contrasenas no coinciden.', 'error');
            try {
              await api.crear('/api/perfil/contrasena', { nueva: datos.nueva });
              cerrar();
              aviso('Contrasena actualizada.');
            } catch (err) {
              aviso(err.message, 'error');
            }
          },
        },
      ],
    });
  }
});
