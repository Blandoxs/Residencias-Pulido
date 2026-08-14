/**
 * Vistas de la aplicacion. Cada funcion recibe el contenedor principal
 * y se encarga de dibujar la pantalla completa y enlazar sus eventos.
 */
import {
  api, estado, esc, fecha, fechaHora, hoy, marca, marcaFecha, clasificar, tabla, formulario,
  leerFormulario, activarFotos, abrirModal, confirmar, aviso, puede, icono, celdaClave,
} from './nucleo.js';

/* ================================================================== */
/* Piezas comunes                                                      */
/* ================================================================== */

function rotulo(titulo, descripcion, acciones = '') {
  return `<div class="rotulo">
    <div><h2>${esc(titulo)}</h2><p>${esc(descripcion)}</p></div>
    <div class="rotulo__acciones">${acciones}</div>
  </div>`;
}

const btnExportar = `<button class="boton" id="btn-exportar">${icono('descargar', 'ico--sm')} CSV</button>`;

function botonesFila(id, extras = []) {
  const otros = extras
    .map((e) => `<button class="boton boton--mini" data-op="${e.op}" data-id="${id}">${esc(e.texto)}</button>`)
    .join('');
  const gestion = puede('supervisor')
    ? `<button class="boton boton--mini boton--icono" data-op="editar" data-id="${id}" title="Editar">${icono('editar', 'ico--sm')}</button>
       <button class="boton boton--mini boton--icono boton--peligro" data-op="eliminar" data-id="${id}" title="Eliminar">${icono('eliminar', 'ico--sm')}</button>`
    : '';
  return `<div class="acciones">
    <button class="boton boton--mini boton--icono" data-op="ver" data-id="${id}" title="Ver ficha">${icono('ver', 'ico--sm')}</button>
    ${otros}${gestion}</div>`;
}

function ficha(pares) {
  return `<div class="detalle">${pares.map(([t, v]) => `<div><dt>${esc(t)}</dt><dd>${v ?? '—'}</dd></div>`).join('')}</div>`;
}

function sumarMeses(iso, meses) {
  const d = new Date(`${iso}T00:00:00`);
  d.setMonth(d.getMonth() + meses);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const opcionesEmpleados = () =>
  (estado.catalogos?.empleados ?? []).map((e) => ({ valor: e.id, texto: `${e.nombre} (${e.rpe})` }));

/**
 * Pantalla generica de catalogo: herramientas, tabla, alta, cambio y baja.
 */
async function pantallaCatalogo(cont, cfg) {
  const filtros = { q: '' };

  async function cargar() {
    const filas = await api.obtener(`${cfg.ruta}?q=${encodeURIComponent(filtros.q)}`);
    cont.__filas = filas;
    cont.querySelector('#tabla-catalogo').innerHTML = tabla(cfg.columnas, filas, 'Sin coincidencias');
    cont.querySelector('#conteo').textContent = `${filas.length} registro${filas.length === 1 ? '' : 's'}`;
  }

  const botonNuevo = puede('supervisor')
    ? `<button class="boton boton--primario" id="btn-nuevo">${icono('mas', 'ico--sm')} ${esc(cfg.textoNuevo ?? 'Nuevo')}</button>`
    : '';

  cont.innerHTML = `
    ${rotulo(cfg.titulo, cfg.descripcion, `${btnExportar}${botonNuevo}`)}
    <div class="herramientas">
      ${icono('buscar', 'ico--sm')}
      <input type="search" id="buscador" placeholder="Buscar..." />
      <span class="conteo" id="conteo"></span>
    </div>
    <div id="tabla-catalogo"></div>`;

  const buscador = cont.querySelector('#buscador');
  let temporizador;
  buscador.addEventListener('input', () => {
    clearTimeout(temporizador);
    filtros.q = buscador.value.trim();
    temporizador = setTimeout(cargar, 220);
  });

  cont.querySelector('#btn-exportar').onclick = () => {
    window.location.href = `/api/exportar/${cfg.exportar ?? cfg.clave}`;
  };

  const abrirFormulario = (registro) => {
    const esNuevo = !registro;
    const { cuerpo } = abrirModal({
      titulo: `${esNuevo ? 'Alta de' : 'Editar'} ${cfg.singular}`,
      contenido: formulario(cfg.campos(), registro ?? {}),
      acciones: [
        { texto: 'Cancelar', alClic: (_c, cerrar) => cerrar() },
        {
          texto: 'Guardar',
          clase: 'boton--primario',
          alClic: async (capa, cerrar, boton) => {
            const datos = leerFormulario(capa);
            if (!datos) return;
            boton.disabled = true;
            try {
              if (esNuevo) await api.crear(cfg.ruta, datos);
              else await api.actualizar(`${cfg.ruta}/${registro.id}`, datos);
              cerrar();
              aviso(`${cfg.singular} ${esNuevo ? 'registrado' : 'actualizado'}.`);
              await cargar();
              estado.refrescarEstado?.();
            } catch (e) {
              aviso(e.message, 'error');
              boton.disabled = false;
            }
          },
        },
      ],
    });
    activarFotos(cuerpo);
  };

  if (botonNuevo) cont.querySelector('#btn-nuevo').onclick = () => abrirFormulario(null);

  cont.addEventListener('click', async (e) => {
    const boton = e.target.closest('[data-op]');
    if (!boton) return;
    const id = Number(boton.dataset.id);
    const registro = (cont.__filas ?? []).find((f) => f.id === id);
    const op = boton.dataset.op;

    if (op === 'ver' && registro) return cfg.ver(registro);
    if (op === 'editar') return abrirFormulario(await api.obtener(`${cfg.ruta}/${id}`));
    if (op === 'eliminar') {
      const ok = await confirmar(`Se dara de baja el registro seleccionado de ${cfg.titulo.toLowerCase()}. La operacion no se puede deshacer.`);
      if (!ok) return;
      try {
        await api.eliminar(`${cfg.ruta}/${id}`);
        aviso('Registro eliminado.');
        await cargar();
        estado.refrescarEstado?.();
      } catch (err) {
        aviso(err.message, 'error');
      }
      return;
    }
    if (cfg.accionesExtra) await cfg.accionesExtra(op, registro, cargar);
  });

  await cargar();
}

/* ================================================================== */
/* Panel principal                                                     */
/* ================================================================== */

const NOMBRE_MODULO = { gafetes: 'Gafetes', extintores: 'Extintores', equipos: 'Equipo' };

/** Linea de tiempo de 180 dias con un marcador por concepto. */
function lineaTiempo(items) {
  const carril = (clave) => {
    const propios = items.filter((i) => i.modulo === clave);
    const marcadores = propios
      .map((i) => {
        const pos = Math.min(100, Math.max(0, (Math.max(i.dias, 0) / 180) * 100));
        const titulo = `${i.referencia} · ${i.concepto} · ${
          i.dias < 0 ? `vencido hace ${Math.abs(i.dias)} d` : `en ${i.dias} d`
        } (${fecha(i.fecha)})`;
        return `<i class="marcador marcador--${esc(i.clasificacion)}" style="left:${pos}%" title="${esc(titulo)}"></i>`;
      })
      .join('');
    return `<div class="carril">
      <span class="carril__nombre">${esc(NOMBRE_MODULO[clave])}</span>
      <div class="carril__pista">${marcadores}</div>
    </div>`;
  };

  return `<div class="linea-tiempo">
    ${carril('gafetes')}${carril('extintores')}${carril('equipos')}
    <div class="escala">
      <span>Hoy</span><span>45 d</span><span>90 d</span><span>135 d</span><span>180 d</span>
    </div>
  </div>`;
}

export async function panel(cont) {
  const d = await api.obtener('/api/panel');
  estado.configuracion = d.configuracion;

  const cifra = (valor, etiqueta, nota, tono = '') =>
    `<div class="cifra" data-tono="${tono}">
      <div class="cifra__valor">${valor}</div>
      <div class="cifra__etiqueta">${esc(etiqueta)}</div>
      ${nota ? `<div class="cifra__nota">${esc(nota)}</div>` : ''}
    </div>`;

  const maxMes = Math.max(1, ...d.meses.map((m) => m.total));

  cont.innerHTML = `
    ${rotulo('Panel de control', `${d.configuracion.nombre_centro} · ${d.configuracion.zona}`, `
      <button class="boton" id="btn-ir-vigencias">Ver vigencias</button>
      <button class="boton boton--primario" id="btn-revisar-panel">${icono('refrescar', 'ico--sm')} Revisar</button>`)}

    <div class="cifras">
      ${cifra(d.resumen.vencido ?? 0, 'Vencidos', 'Atencion inmediata', 'vencido')}
      ${cifra(d.resumen.critico ?? 0, 'Criticos', `${d.umbrales.critico} dias o menos`, 'critico')}
      ${cifra(d.resumen.proximo ?? 0, 'Por vencer', `Hasta ${d.umbrales.proximo} dias`, 'proximo')}
      ${cifra(d.resumen.vigente ?? 0, 'Vigentes', `De ${d.resumen.total} conceptos`, 'vigente')}
      ${cifra(d.totales.notificaciones, 'Alertas', 'Sin leer', 'azul')}
    </div>

    <div class="rejilla rejilla--2" style="margin-bottom:14px">
      <div class="hoja hoja--acento">
        <h3 class="titulo-bloque">Linea de vencimientos <small>${d.linea.length} conceptos / 180 dias</small></h3>
        ${lineaTiempo(d.linea)}
      </div>

      <div class="hoja hoja--acento">
        <h3 class="titulo-bloque">Carga por mes <small>Proximos 6 meses</small></h3>
        <div class="barras">
          ${d.meses
            .map(
              (m) => `<div class="barra-fila">
                <span>${esc(m.etiqueta)}</span>
                <div class="barra-pista"><div class="barra-valor" style="width:${(m.total / maxMes) * 100}%"></div></div>
                <b>${m.total}</b>
              </div>`
            )
            .join('')}
        </div>
      </div>
    </div>

    <div class="rejilla rejilla--3" style="margin-bottom:14px">
      ${['gafetes', 'extintores', 'equipos']
        .map((clave) => {
          const m = d.porModulo[clave];
          const barra = (tipo, valor) =>
            `<div class="barra-fila"><span>${esc(tipo)}</span>
              <div class="barra-pista"><div class="barra-valor barra-valor--${tipo}" style="width:${
              m.total ? (valor / m.total) * 100 : 0
            }%"></div></div><b>${valor}</b></div>`;
          return `<div class="hoja">
            <h3 class="titulo-bloque">${esc(NOMBRE_MODULO[clave])} <small>${d.totales[clave]} reg.</small></h3>
            <div class="barras">
              ${barra('vencido', m.vencido)}${barra('critico', m.critico)}
              ${barra('proximo', m.proximo)}${barra('vigente', m.vigente)}
            </div>
          </div>`;
        })
        .join('')}
    </div>

    <h3 class="titulo-bloque">Requieren atencion inmediata</h3>
    ${tabla(
      [
        { titulo: 'Modulo', render: (i) => marca('neutro', i.modulo_nombre) },
        { titulo: 'Referencia', render: (i) => celdaClave(i.referencia), clase: 'clave-fila' },
        { titulo: 'Descripcion', campo: 'descripcion' },
        { titulo: 'Concepto', campo: 'concepto' },
        { titulo: 'Vence', render: (i) => fecha(i.fecha), clase: 'fecha' },
        { titulo: 'Dias', render: (i) => i.dias, clase: 'num' },
        { titulo: 'Situacion', render: (i) => marca(i.clasificacion, i.etiqueta) },
      ],
      d.atencion,
      'Sin pendientes'
    )}`;

  cont.querySelector('#btn-ir-vigencias').onclick = () => (window.location.hash = '#/vigencias');
  cont.querySelector('#btn-revisar-panel').onclick = async (e) => {
    e.target.disabled = true;
    const r = await api.crear('/api/alertas/revisar');
    aviso(`Revision terminada: ${r.generadas} alerta(s) nueva(s) de ${r.revisadas} concepto(s).`);
    await estado.refrescarEstado?.();
    panel(cont);
  };
}

/* ================================================================== */
/* Vigencias                                                           */
/* ================================================================== */

export async function vigencias(cont) {
  const filtros = { estado: 'todos', modulo: 'todos', q: '' };

  cont.innerHTML = `
    ${rotulo('Control de vigencias', 'Concentrado de todos los conceptos con fecha de caducidad.', `
      ${btnExportar}
      <button class="boton boton--primario" id="btn-revisar-v">${icono('refrescar', 'ico--sm')} Generar alertas</button>`)}
    <div class="herramientas">
      ${icono('buscar', 'ico--sm')}
      <input type="search" id="buscador" placeholder="Referencia, equipo, ubicacion..." />
      <select data-filtro="modulo">
        <option value="todos">Todos los modulos</option>
        <option value="gafetes">Gafetes</option>
        <option value="extintores">Extintores</option>
        <option value="equipos">Equipo</option>
      </select>
      <select data-filtro="estado">
        <option value="todos">Todas las situaciones</option>
        <option value="vencido">Vencidos</option>
        <option value="critico">Criticos</option>
        <option value="proximo">Por vencer</option>
        <option value="vigente">Vigentes</option>
      </select>
      <span class="conteo" id="conteo"></span>
    </div>
    <div id="tabla-vigencias"></div>`;

  async function cargar() {
    const d = await api.obtener(
      `/api/vigencias?estado=${filtros.estado}&modulo=${filtros.modulo}&q=${encodeURIComponent(filtros.q)}`
    );
    cont.querySelector('#conteo').textContent =
      `${d.items.length} conceptos · ${d.resumen.vencido} venc. · ${d.resumen.critico} crit. · ${d.resumen.proximo} prox.`;
    cont.querySelector('#tabla-vigencias').innerHTML = tabla(
      [
        { titulo: 'Modulo', render: (i) => marca('neutro', i.modulo_nombre) },
        { titulo: 'Referencia', render: (i) => celdaClave(i.referencia, i.descripcion) },
        { titulo: 'Concepto', campo: 'concepto' },
        { titulo: 'Ubicacion', campo: 'ubicacion' },
        { titulo: 'Responsable', campo: 'responsable' },
        { titulo: 'Fecha', render: (i) => fecha(i.fecha), clase: 'fecha' },
        { titulo: 'Dias', render: (i) => i.dias, clase: 'num' },
        { titulo: 'Situacion', render: (i) => marca(i.clasificacion, i.etiqueta) },
      ],
      d.items,
      'Sin coincidencias'
    );
  }

  const buscador = cont.querySelector('#buscador');
  let t;
  buscador.addEventListener('input', () => {
    clearTimeout(t);
    filtros.q = buscador.value.trim();
    t = setTimeout(cargar, 220);
  });
  cont.querySelectorAll('[data-filtro]').forEach((s) =>
    s.addEventListener('change', () => {
      filtros[s.dataset.filtro] = s.value;
      cargar();
    })
  );
  cont.querySelector('#btn-exportar').onclick = () => (window.location.href = '/api/exportar/vigencias');
  cont.querySelector('#btn-revisar-v').onclick = async (e) => {
    e.target.disabled = true;
    const r = await api.crear('/api/alertas/revisar');
    aviso(`${r.generadas} alerta(s) nueva(s). Correo: ${r.correo}.`);
    await estado.refrescarEstado?.();
    e.target.disabled = false;
  };

  await cargar();
}

/* ================================================================== */
/* Alertas                                                             */
/* ================================================================== */

export async function notificaciones(cont) {
  async function cargar() {
    const d = await api.obtener('/api/notificaciones');
    await estado.refrescarEstado?.();

    cont.querySelector('#lista').innerHTML = d.items.length
      ? `<div class="lista-alertas">${d.items
          .map(
            (n) => `<div class="alerta-fila alerta-fila--${esc(n.severidad)} ${n.leida ? 'alerta-fila--leida' : ''}">
              <div class="alerta-fila__cuerpo">
                <strong>${esc(n.titulo)}</strong>
                <p>${esc(n.mensaje)}</p>
                <span class="alerta-fila__sello">${fechaHora(n.creada_en)} · ${esc(n.modulo)} #${n.registro_id} ·
                  ${n.correo_enviado ? 'correo enviado' : 'sin correo'}</span>
              </div>
              <div class="acciones">
                ${n.leida ? '' : `<button class="boton boton--mini" data-leer="${n.id}">Leida</button>`}
                ${puede('supervisor')
                  ? `<button class="boton boton--mini boton--icono boton--peligro" data-borrar="${n.id}" title="Eliminar">${icono('eliminar', 'ico--sm')}</button>`
                  : ''}
              </div>
            </div>`
          )
          .join('')}</div>`
      : `<div class="tabla-caja"><div class="vacio">Sin alertas registradas</div></div>`;
  }

  cont.innerHTML = `
    ${rotulo('Alertas de vencimiento', 'Avisos generados automaticamente por el motor de vigencias.', `
      <button class="boton" id="btn-todas">Marcar todas leidas</button>
      <button class="boton boton--primario" id="btn-generar">${icono('refrescar', 'ico--sm')} Revisar ahora</button>`)}
    <div id="lista"></div>`;

  cont.querySelector('#btn-todas').onclick = async () => {
    const r = await api.crear('/api/notificaciones/leer-todas');
    aviso(`${r.actualizadas} alerta(s) marcadas como leidas.`);
    await cargar();
  };
  cont.querySelector('#btn-generar').onclick = async (e) => {
    e.target.disabled = true;
    const r = await api.crear('/api/alertas/revisar');
    aviso(`${r.generadas} alerta(s) nueva(s). Correo: ${r.correo}.`);
    await cargar();
    e.target.disabled = false;
  };

  cont.addEventListener('click', async (e) => {
    const leer = e.target.closest('[data-leer]');
    const borrar = e.target.closest('[data-borrar]');
    if (leer) {
      await api.crear(`/api/notificaciones/${leer.dataset.leer}/leer`);
      await cargar();
    }
    if (borrar) {
      await api.eliminar(`/api/notificaciones/${borrar.dataset.borrar}`);
      await cargar();
    }
  });

  await cargar();
}

/* ================================================================== */
/* Gafetes                                                             */
/* ================================================================== */

function credencialHTML(g, cfg) {
  const v = clasificar(g.fecha_vencimiento);
  return `<div class="credencial">
    <div class="credencial__cabeza">
      <img src="img/cfe-blanco.svg" alt="CFE" />
      <span>${esc(cfg.nombre_centro ?? '')}<br />${esc(cfg.zona ?? '')}</span>
    </div>
    <div class="credencial__banda"></div>
    <div class="credencial__cuerpo">
      <div class="credencial__foto">${g.foto ? `<img src="${esc(g.foto)}" alt="Fotografia" />` : icono('personal')}</div>
      <dl class="credencial__datos">
        <h4>${esc(g.empleado)}</h4>
        <dt>RPE</dt><dd>${esc(g.rpe)}</dd>
        <dt>Puesto</dt><dd>${esc(g.puesto || '—')}</dd>
        <dt>Area</dt><dd>${esc(g.departamento || '—')}</dd>
        <dt>Sangre</dt><dd>${esc(g.tipo_sangre || '—')}</dd>
      </dl>
    </div>
    <div class="credencial__folio">
      <div><span>Folio</span><b>${esc(g.folio)}</b></div>
      <div><span>Acceso</span><b>${esc(g.nivel_acceso)}</b></div>
      <div><span>Tipo</span><b>${esc(g.tipo)}</b></div>
    </div>
    <div class="credencial__pie">
      <span>${fecha(g.fecha_emision)} — ${fecha(g.fecha_vencimiento)}</span>
      ${marca(v.clase, v.texto)}
    </div>
  </div>`;
}

export async function gafetes(cont) {
  await pantallaCatalogo(cont, {
    clave: 'gafetes',
    ruta: '/api/gafetes',
    titulo: 'Gafetes',
    singular: 'gafete',
    textoNuevo: 'Nuevo gafete',
    descripcion: 'Credenciales del personal con control de vigencia y nivel de acceso.',
    columnas: [
      { titulo: 'Folio', render: (g) => celdaClave(g.folio) },
      { titulo: 'Empleado', render: (g) => `${esc(g.empleado)}<span class="sub">${esc(g.rpe)} · ${esc(g.departamento)}</span>` },
      { titulo: 'Tipo', render: (g) => `${esc(g.tipo)}<span class="sub">${esc(g.nivel_acceso)}</span>` },
      { titulo: 'Emision', render: (g) => fecha(g.fecha_emision), clase: 'fecha' },
      { titulo: 'Vence', render: (g) => fecha(g.fecha_vencimiento), clase: 'fecha' },
      { titulo: 'Vigencia', render: (g) => marcaFecha(g.fecha_vencimiento) },
      { titulo: 'Estado', render: (g) => marca(g.estado === 'Activo' ? 'vigente' : 'neutro', g.estado) },
      { titulo: '', render: (g) => botonesFila(g.id, [{ op: 'credencial', texto: 'Credencial' }, { op: 'renovar', texto: 'Renovar' }]) },
    ],
    campos: () => [
      { nombre: 'folio', etiqueta: 'Folio', requerido: true },
      { nombre: 'empleado_id', etiqueta: 'Empleado', tipo: 'select', requerido: true, permiteVacio: true, opciones: opcionesEmpleados() },
      { nombre: 'tipo', etiqueta: 'Tipo de gafete', tipo: 'select', requerido: true, opciones: estado.catalogos.tiposGafete },
      { nombre: 'nivel_acceso', etiqueta: 'Nivel de acceso', tipo: 'select', opciones: estado.catalogos.nivelesAcceso },
      { nombre: 'fecha_emision', etiqueta: 'Fecha de emision', tipo: 'fecha', requerido: true, porDefecto: hoy() },
      { nombre: 'fecha_vencimiento', etiqueta: 'Fecha de vencimiento', tipo: 'fecha', requerido: true },
      { nombre: 'estado', etiqueta: 'Estado', tipo: 'select', requerido: true, opciones: estado.catalogos.estadosGafete },
      { nombre: 'observaciones', etiqueta: 'Observaciones', tipo: 'textarea', ancho: 'completo' },
    ],
    ver: (g) =>
      abrirModal({
        titulo: `Gafete ${g.folio}`,
        contenido: `${ficha([
          ['Empleado', esc(g.empleado)],
          ['RPE', esc(g.rpe)],
          ['Puesto', esc(g.puesto)],
          ['Departamento', esc(g.departamento)],
          ['Tipo', esc(g.tipo)],
          ['Nivel de acceso', esc(g.nivel_acceso)],
          ['Emision', fecha(g.fecha_emision)],
          ['Vencimiento', fecha(g.fecha_vencimiento)],
          ['Situacion', marcaFecha(g.fecha_vencimiento)],
          ['Estado', esc(g.estado)],
        ])}
        <p style="margin-top:16px;font-size:.85rem"><b>Observaciones:</b> ${esc(g.observaciones || 'Sin observaciones.')}</p>`,
        acciones: [{ texto: 'Cerrar', alClic: (_c, cerrar) => cerrar() }],
      }),
    accionesExtra: async (op, g, recargar) => {
      if (op === 'credencial') {
        const d = await api.obtener(`/api/gafetes/${g.id}/credencial`);
        abrirModal({
          titulo: `Credencial ${d.gafete.folio}`,
          ancho: 'modal--angosto',
          contenido: credencialHTML(d.gafete, d.configuracion),
          acciones: [
            { texto: 'Cerrar', alClic: (_c, cerrar) => cerrar() },
            { texto: 'Imprimir', clase: 'boton--primario', alClic: () => window.print() },
          ],
        });
      }
      if (op === 'renovar') {
        if (!puede('supervisor')) return aviso('Sin permisos para renovar gafetes.', 'error');
        const ok = await confirmar(
          `Se renovara el gafete ${g.folio} por 12 meses a partir de hoy (nueva vigencia: ${fecha(sumarMeses(hoy(), 12))}).`,
          'Renovar'
        );
        if (!ok) return;
        await api.actualizar(`/api/gafetes/${g.id}`, {
          fecha_emision: hoy(),
          fecha_vencimiento: sumarMeses(hoy(), 12),
          estado: 'Activo',
        });
        aviso('Gafete renovado por 12 meses.');
        await recargar();
        estado.refrescarEstado?.();
      }
    },
  });
}

/* ================================================================== */
/* Extintores                                                          */
/* ================================================================== */

export async function extintores(cont) {
  await pantallaCatalogo(cont, {
    clave: 'extintores',
    ruta: '/api/extintores',
    titulo: 'Extintores',
    singular: 'extintor',
    textoNuevo: 'Nuevo extintor',
    descripcion: 'Equipo contra incendio con control de recarga y prueba hidrostatica.',
    columnas: [
      { titulo: 'Codigo', render: (x) => celdaClave(x.codigo, `${x.tipo} ${x.capacidad_kg} kg`) },
      { titulo: 'Ubicacion', render: (x) => `${esc(x.ubicacion)}<span class="sub">${esc(x.area)}</span>` },
      { titulo: 'Recarga', render: (x) => `${fecha(x.fecha_recarga)}<span class="sub">ultima</span>`, clase: 'fecha' },
      { titulo: 'Prox. recarga', render: (x) => `${fecha(x.fecha_prox_recarga)}<br>${marcaFecha(x.fecha_prox_recarga)}`, clase: 'fecha' },
      {
        titulo: 'Prox. hidrostatica',
        render: (x) => (x.fecha_prox_hidrostatica ? `${fecha(x.fecha_prox_hidrostatica)}<br>${marcaFecha(x.fecha_prox_hidrostatica)}` : '—'),
        clase: 'fecha',
      },
      { titulo: 'Responsable', render: (x) => esc(x.responsable ?? 'Sin asignar') },
      {
        titulo: 'Estado',
        render: (x) => marca(x.estado === 'Operativo' ? 'vigente' : x.estado === 'Fuera de servicio' ? 'vencido' : 'neutro', x.estado),
      },
      { titulo: '', render: (x) => botonesFila(x.id, [{ op: 'recarga', texto: 'Recarga' }]) },
    ],
    campos: () => [
      { nombre: 'codigo', etiqueta: 'Codigo / numero economico', requerido: true },
      { nombre: 'tipo', etiqueta: 'Agente extintor', tipo: 'select', requerido: true, opciones: estado.catalogos.tiposExtintor },
      { nombre: 'capacidad_kg', etiqueta: 'Capacidad (kg)', tipo: 'numero', paso: '0.5' },
      { nombre: 'marca', etiqueta: 'Marca' },
      { nombre: 'ubicacion', etiqueta: 'Ubicacion fisica', requerido: true },
      { nombre: 'area', etiqueta: 'Area / centro de trabajo' },
      { nombre: 'responsable_id', etiqueta: 'Responsable', tipo: 'select', permiteVacio: true, opciones: opcionesEmpleados() },
      { nombre: 'estado', etiqueta: 'Estado', tipo: 'select', requerido: true, opciones: estado.catalogos.estadosExtintor },
      { nombre: 'fecha_fabricacion', etiqueta: 'Fecha de fabricacion', tipo: 'fecha' },
      { nombre: 'fecha_recarga', etiqueta: 'Ultima recarga', tipo: 'fecha' },
      { nombre: 'fecha_prox_recarga', etiqueta: 'Proxima recarga', tipo: 'fecha', requerido: true, ayuda: 'Habitualmente 12 meses despues de la recarga.' },
      { nombre: 'fecha_prueba_hidrostatica', etiqueta: 'Ultima prueba hidrostatica', tipo: 'fecha' },
      { nombre: 'fecha_prox_hidrostatica', etiqueta: 'Proxima prueba hidrostatica', tipo: 'fecha', ayuda: 'Generalmente cada 5 anos.' },
      { nombre: 'observaciones', etiqueta: 'Observaciones', tipo: 'textarea', ancho: 'completo' },
    ],
    ver: (x) =>
      abrirModal({
        titulo: `Extintor ${x.codigo}`,
        contenido: `${ficha([
          ['Agente extintor', esc(x.tipo)],
          ['Capacidad', `${esc(x.capacidad_kg)} kg`],
          ['Marca', esc(x.marca)],
          ['Ubicacion', esc(x.ubicacion)],
          ['Area', esc(x.area)],
          ['Responsable', esc(x.responsable ?? 'Sin asignar')],
          ['Fabricacion', fecha(x.fecha_fabricacion)],
          ['Ultima recarga', fecha(x.fecha_recarga)],
          ['Proxima recarga', `${fecha(x.fecha_prox_recarga)} ${marcaFecha(x.fecha_prox_recarga)}`],
          ['Ultima hidrostatica', fecha(x.fecha_prueba_hidrostatica)],
          ['Proxima hidrostatica', x.fecha_prox_hidrostatica ? `${fecha(x.fecha_prox_hidrostatica)} ${marcaFecha(x.fecha_prox_hidrostatica)}` : '—'],
          ['Estado', esc(x.estado)],
        ])}
        <p style="margin-top:16px;font-size:.85rem"><b>Observaciones:</b> ${esc(x.observaciones || 'Sin observaciones.')}</p>`,
        acciones: [{ texto: 'Cerrar', alClic: (_c, cerrar) => cerrar() }],
      }),
    accionesExtra: async (op, x, recargar) => {
      if (op !== 'recarga') return;
      if (!puede('supervisor')) return aviso('Sin permisos para registrar recargas.', 'error');
      const ok = await confirmar(
        `Se registrara la recarga del extintor ${x.codigo} con fecha de hoy; la proxima quedara programada para el ${fecha(sumarMeses(hoy(), 12))}.`,
        'Registrar'
      );
      if (!ok) return;
      await api.actualizar(`/api/extintores/${x.id}`, {
        fecha_recarga: hoy(),
        fecha_prox_recarga: sumarMeses(hoy(), 12),
        estado: 'Operativo',
      });
      aviso('Recarga registrada. Proxima en 12 meses.');
      await recargar();
      estado.refrescarEstado?.();
    },
  });
}

/* ================================================================== */
/* Equipo                                                              */
/* ================================================================== */

export async function equipos(cont) {
  await pantallaCatalogo(cont, {
    clave: 'equipos',
    ruta: '/api/equipos',
    titulo: 'Equipo con vigencia',
    singular: 'equipo',
    textoNuevo: 'Nuevo equipo',
    descripcion: 'Proteccion personal, herramienta aislada, instrumentos e insumos con caducidad.',
    columnas: [
      { titulo: 'Codigo', render: (q) => celdaClave(q.codigo, q.serie) },
      { titulo: 'Equipo', render: (q) => `${esc(q.nombre)}<span class="sub">${esc(q.marca)} ${esc(q.modelo)}</span>` },
      { titulo: 'Categoria', campo: 'categoria' },
      { titulo: 'Ubicacion', render: (q) => `${esc(q.ubicacion)}<span class="sub">${esc(q.responsable ?? 'Sin asignar')}</span>` },
      { titulo: 'Vence', render: (q) => `${fecha(q.fecha_vencimiento)}<br>${marcaFecha(q.fecha_vencimiento)}`, clase: 'fecha' },
      {
        titulo: 'Mantenimiento',
        clase: 'fecha',
        render: (q) =>
          q.frecuencia_meses > 0 && q.fecha_ultimo_mantenimiento
            ? `${fecha(sumarMeses(q.fecha_ultimo_mantenimiento, q.frecuencia_meses))}<br>${marcaFecha(
                sumarMeses(q.fecha_ultimo_mantenimiento, q.frecuencia_meses)
              )}`
            : '<span class="sub">No aplica</span>',
      },
      { titulo: 'Estado', render: (q) => marca(q.estado === 'En servicio' ? 'vigente' : 'neutro', q.estado) },
      { titulo: '', render: (q) => botonesFila(q.id, [{ op: 'mantenimiento', texto: 'Mantto.' }]) },
    ],
    campos: () => [
      { nombre: 'codigo', etiqueta: 'Codigo de inventario', requerido: true },
      { nombre: 'nombre', etiqueta: 'Nombre del equipo', requerido: true },
      { nombre: 'categoria', etiqueta: 'Categoria', tipo: 'select', requerido: true, opciones: estado.catalogos.categoriasEquipo },
      { nombre: 'marca', etiqueta: 'Marca' },
      { nombre: 'modelo', etiqueta: 'Modelo' },
      { nombre: 'serie', etiqueta: 'Numero de serie' },
      { nombre: 'ubicacion', etiqueta: 'Ubicacion / area' },
      { nombre: 'responsable_id', etiqueta: 'Responsable', tipo: 'select', permiteVacio: true, opciones: opcionesEmpleados() },
      { nombre: 'fecha_adquisicion', etiqueta: 'Fecha de adquisicion', tipo: 'fecha' },
      { nombre: 'fecha_vencimiento', etiqueta: 'Vencimiento / caducidad', tipo: 'fecha', requerido: true },
      { nombre: 'frecuencia_meses', etiqueta: 'Frecuencia de mantenimiento (meses)', tipo: 'numero', paso: '1', ayuda: '0 si no requiere mantenimiento periodico.' },
      { nombre: 'fecha_ultimo_mantenimiento', etiqueta: 'Ultimo mantenimiento', tipo: 'fecha' },
      { nombre: 'estado', etiqueta: 'Estado', tipo: 'select', requerido: true, opciones: estado.catalogos.estadosEquipo },
      { nombre: 'observaciones', etiqueta: 'Observaciones', tipo: 'textarea', ancho: 'completo' },
    ],
    ver: (q) =>
      abrirModal({
        titulo: `${q.codigo} · ${q.nombre}`,
        contenido: `${ficha([
          ['Categoria', esc(q.categoria)],
          ['Marca / modelo', `${esc(q.marca)} ${esc(q.modelo)}`],
          ['Numero de serie', esc(q.serie)],
          ['Ubicacion', esc(q.ubicacion)],
          ['Responsable', esc(q.responsable ?? 'Sin asignar')],
          ['Adquisicion', fecha(q.fecha_adquisicion)],
          ['Vencimiento', `${fecha(q.fecha_vencimiento)} ${marcaFecha(q.fecha_vencimiento)}`],
          ['Frecuencia', q.frecuencia_meses > 0 ? `${q.frecuencia_meses} meses` : 'No aplica'],
          ['Ultimo mantenimiento', fecha(q.fecha_ultimo_mantenimiento)],
          ['Estado', esc(q.estado)],
        ])}
        <p style="margin-top:16px;font-size:.85rem"><b>Observaciones:</b> ${esc(q.observaciones || 'Sin observaciones.')}</p>`,
        acciones: [{ texto: 'Cerrar', alClic: (_c, cerrar) => cerrar() }],
      }),
    accionesExtra: async (op, q, recargar) => {
      if (op !== 'mantenimiento') return;
      if (!puede('supervisor')) return aviso('Sin permisos para registrar mantenimientos.', 'error');
      const ok = await confirmar(
        `Se registrara el mantenimiento del equipo ${q.codigo} con fecha de hoy${
          q.frecuencia_meses > 0 ? ` (proximo en ${q.frecuencia_meses} meses)` : ''
        }.`,
        'Registrar'
      );
      if (!ok) return;
      await api.actualizar(`/api/equipos/${q.id}`, { fecha_ultimo_mantenimiento: hoy() });
      aviso('Mantenimiento registrado.');
      await recargar();
      estado.refrescarEstado?.();
    },
  });
}

/* ================================================================== */
/* Personal                                                            */
/* ================================================================== */

export async function empleados(cont) {
  await pantallaCatalogo(cont, {
    clave: 'empleados',
    ruta: '/api/empleados',
    titulo: 'Personal',
    singular: 'empleado',
    textoNuevo: 'Nuevo empleado',
    descripcion: 'Registro del personal al que se asignan gafetes y equipo.',
    columnas: [
      { titulo: 'RPE', render: (e) => celdaClave(e.rpe) },
      {
        titulo: 'Nombre',
        render: (e) =>
          `<div style="display:flex;align-items:center;gap:10px">
            <span class="usuario__inicial" style="width:26px;height:26px;overflow:hidden">${
              e.foto ? `<img src="${esc(e.foto)}" style="width:100%;height:100%;object-fit:cover" />` : esc(iniciales(e.nombre))
            }</span>${esc(e.nombre)}</div>`,
      },
      { titulo: 'Puesto', render: (e) => `${esc(e.puesto)}<span class="sub">${esc(e.departamento)}</span>` },
      { titulo: 'Centro de trabajo', campo: 'centro_trabajo' },
      { titulo: 'Contacto', render: (e) => `${esc(e.correo)}<span class="sub">${esc(e.telefono)}</span>` },
      { titulo: 'Sangre', campo: 'tipo_sangre', clase: 'num' },
      { titulo: 'Situacion', render: (e) => marca(e.activo ? 'vigente' : 'neutro', e.activo ? 'Activo' : 'Baja') },
      { titulo: '', render: (e) => botonesFila(e.id) },
    ],
    campos: () => [
      { nombre: 'rpe', etiqueta: 'RPE', requerido: true },
      { nombre: 'nombre', etiqueta: 'Nombre completo', requerido: true },
      { nombre: 'puesto', etiqueta: 'Puesto' },
      { nombre: 'departamento', etiqueta: 'Departamento' },
      { nombre: 'centro_trabajo', etiqueta: 'Centro de trabajo' },
      { nombre: 'correo', etiqueta: 'Correo institucional', tipo: 'correo' },
      { nombre: 'telefono', etiqueta: 'Telefono' },
      { nombre: 'tipo_sangre', etiqueta: 'Tipo de sangre', tipo: 'select', permiteVacio: true, opciones: ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'] },
      { nombre: 'activo', etiqueta: 'Situacion', tipo: 'select', opciones: [{ valor: 1, texto: 'Activo' }, { valor: 0, texto: 'Baja' }] },
      { nombre: 'foto', etiqueta: 'Fotografia', tipo: 'foto', ancho: 'completo' },
    ],
    ver: (e) =>
      abrirModal({
        titulo: e.nombre,
        contenido: `<div style="display:flex;gap:18px;flex-wrap:wrap">
          <div class="credencial__foto">${e.foto ? `<img src="${esc(e.foto)}" />` : icono('personal')}</div>
          <div style="flex:1;min-width:240px">${ficha([
            ['RPE', esc(e.rpe)],
            ['Puesto', esc(e.puesto)],
            ['Departamento', esc(e.departamento)],
            ['Centro de trabajo', esc(e.centro_trabajo)],
            ['Correo', esc(e.correo)],
            ['Telefono', esc(e.telefono)],
            ['Tipo de sangre', esc(e.tipo_sangre)],
            ['Situacion', e.activo ? 'Activo' : 'Baja'],
          ])}</div>
        </div>`,
        acciones: [{ texto: 'Cerrar', alClic: (_c, cerrar) => cerrar() }],
      }),
  });
}

function iniciales(nombre = '') {
  return nombre.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}

/* ================================================================== */
/* Usuarios                                                            */
/* ================================================================== */

export async function usuarios(cont) {
  const ROLES = [
    { valor: 'admin', texto: 'Administrador' },
    { valor: 'supervisor', texto: 'Supervisor' },
    { valor: 'consulta', texto: 'Consulta' },
  ];

  async function cargar() {
    const lista = await api.obtener('/api/usuarios');
    cont.__filas = lista;
    cont.querySelector('#tabla-usuarios').innerHTML = tabla(
      [
        { titulo: 'Usuario', render: (u) => celdaClave(u.usuario) },
        { titulo: 'Nombre', campo: 'nombre' },
        { titulo: 'Correo', campo: 'correo' },
        { titulo: 'Perfil', render: (u) => marca(u.rol === 'admin' ? 'info' : 'neutro', ROLES.find((r) => r.valor === u.rol)?.texto ?? u.rol) },
        { titulo: 'Ultimo acceso', render: (u) => fechaHora(u.ultimo_acceso), clase: 'fecha' },
        { titulo: 'Estado', render: (u) => marca(u.activo ? 'vigente' : 'neutro', u.activo ? 'Activo' : 'Inactivo') },
        {
          titulo: '',
          render: (u) => `<div class="acciones">
            <button class="boton boton--mini boton--icono" data-op="editar" data-id="${u.id}" title="Editar">${icono('editar', 'ico--sm')}</button>
            ${u.usuario === 'admin' ? '' : `<button class="boton boton--mini boton--icono boton--peligro" data-op="eliminar" data-id="${u.id}" title="Eliminar">${icono('eliminar', 'ico--sm')}</button>`}
          </div>`,
        },
      ],
      lista
    );
  }

  cont.innerHTML = `
    ${rotulo('Usuarios del sistema', 'Cuentas de acceso y perfiles de permisos.', `
      <button class="boton boton--primario" id="btn-nuevo">${icono('mas', 'ico--sm')} Nuevo usuario</button>`)}
    <div class="hoja" style="margin-bottom:14px">
      <h3 class="titulo-bloque">Perfiles</h3>
      ${ficha([
        ['Administrador', '<span style="font-weight:400">Acceso total: usuarios, configuracion y bitacora.</span>'],
        ['Supervisor', '<span style="font-weight:400">Alta, cambio y baja en los cuatro catalogos.</span>'],
        ['Consulta', '<span style="font-weight:400">Solo lectura de catalogos, vigencias y alertas.</span>'],
      ])}
    </div>
    <div id="tabla-usuarios"></div>`;

  const abrirForm = (u) => {
    const campos = [
      ...(u ? [] : [{ nombre: 'usuario', etiqueta: 'Nombre de acceso', requerido: true }]),
      { nombre: 'nombre', etiqueta: 'Nombre completo', requerido: true },
      { nombre: 'correo', etiqueta: 'Correo (recibe las alertas)', tipo: 'correo' },
      { nombre: 'rol', etiqueta: 'Perfil', tipo: 'select', requerido: true, opciones: ROLES },
      { nombre: 'activo', etiqueta: 'Estado', tipo: 'select', opciones: [{ valor: 1, texto: 'Activo' }, { valor: 0, texto: 'Inactivo' }] },
      { nombre: 'contrasena', etiqueta: u ? 'Nueva contrasena (opcional)' : 'Contrasena', tipo: 'contrasena', requerido: !u, ancho: 'completo' },
    ];
    abrirModal({
      titulo: u ? `Editar ${u.usuario}` : 'Nuevo usuario',
      contenido: formulario(campos, u ?? { rol: 'consulta', activo: 1 }),
      acciones: [
        { texto: 'Cancelar', alClic: (_c, cerrar) => cerrar() },
        {
          texto: 'Guardar',
          clase: 'boton--primario',
          alClic: async (capa, cerrar, boton) => {
            const datos = leerFormulario(capa);
            if (!datos) return;
            if (u && !datos.contrasena) delete datos.contrasena;
            boton.disabled = true;
            try {
              if (u) await api.actualizar(`/api/usuarios/${u.id}`, datos);
              else await api.crear('/api/usuarios', datos);
              cerrar();
              aviso('Usuario guardado.');
              await cargar();
            } catch (e) {
              aviso(e.message, 'error');
              boton.disabled = false;
            }
          },
        },
      ],
    });
  };

  cont.querySelector('#btn-nuevo').onclick = () => abrirForm(null);
  cont.addEventListener('click', async (e) => {
    const boton = e.target.closest('[data-op]');
    if (!boton) return;
    const u = cont.__filas.find((f) => f.id === Number(boton.dataset.id));
    if (boton.dataset.op === 'editar') return abrirForm(u);
    if (boton.dataset.op === 'eliminar') {
      const ok = await confirmar(`Se eliminara la cuenta "${u.usuario}".`);
      if (!ok) return;
      try {
        await api.eliminar(`/api/usuarios/${u.id}`);
        aviso('Usuario eliminado.');
        await cargar();
      } catch (err) {
        aviso(err.message, 'error');
      }
    }
  });

  await cargar();
}

/* ================================================================== */
/* Configuracion                                                       */
/* ================================================================== */

export async function configuracion(cont) {
  const c = await api.obtener('/api/configuracion');
  estado.configuracion = c;

  cont.innerHTML = `
    ${rotulo('Configuracion', 'Parametros de alertas y datos del centro de trabajo.')}
    <div class="rejilla rejilla--2">
      <div class="hoja hoja--acento">
        <h3 class="titulo-bloque">Parametros de alerta</h3>
        <div id="form-config">
          ${formulario(
            [
              { nombre: 'dias_proximos', etiqueta: 'Umbral "por vencer" (dias)', tipo: 'numero', paso: '1', requerido: true },
              { nombre: 'dias_criticos', etiqueta: 'Umbral "critico" (dias)', tipo: 'numero', paso: '1', requerido: true },
              { nombre: 'nombre_centro', etiqueta: 'Centro de trabajo', ancho: 'completo' },
              { nombre: 'zona', etiqueta: 'Zona / division', ancho: 'completo' },
              { nombre: 'correo_administrador', etiqueta: 'Correo del administrador', tipo: 'correo', ancho: 'completo', ayuda: 'Recibe el concentrado de alertas.' },
              {
                nombre: 'notificar_por_correo',
                etiqueta: 'Envio de alertas por correo',
                tipo: 'select',
                ancho: 'completo',
                opciones: [{ valor: '0', texto: 'Desactivado (solo en el sistema)' }, { valor: '1', texto: 'Activado (requiere SMTP)' }],
              },
            ],
            c
          )}
        </div>
        <button class="boton boton--primario" id="btn-guardar-config">Guardar cambios</button>
      </div>

      <div class="hoja hoja--acento">
        <h3 class="titulo-bloque">Motor de vencimientos</h3>
        <p style="font-size:.85rem;color:var(--gris);line-height:1.6;margin-top:0">
          Revisa todos los conceptos con fecha de caducidad (vigencia de gafetes, recarga y prueba
          hidrostatica de extintores, caducidad y mantenimiento de equipo) al arrancar el servidor
          y despues cada 6 horas.
        </p>
        <ol style="font-size:.85rem;line-height:1.85;padding-left:18px;margin:0">
          <li>A <b>${esc(c.dias_proximos)} dias</b> o menos se genera la alerta <b>Por vencer</b>.</li>
          <li>A <b>${esc(c.dias_criticos)} dias</b> o menos la alerta cambia a <b>Critica</b>.</li>
          <li>Pasada la fecha se genera la alerta de <b>Vencido</b>.</li>
          <li>Cada alerta llega a la campana y, con el correo activado, al administrador.</li>
          <li>Al renovar un registro el ciclo reinicia con la fecha nueva.</li>
        </ol>
        <div class="alerta alerta--info" style="margin-bottom:0">
          Para el correo defina <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>
          y <code>SMTP_PASS</code> antes de iniciar el servidor.
        </div>
      </div>
    </div>

    <div class="hoja" style="margin-top:14px">
      <h3 class="titulo-bloque">Seguridad de la cuenta</h3>
      <div class="campo--doble" style="max-width:520px">
        <label class="campo"><span>Nueva contrasena</span><input type="password" id="nueva-contrasena" autocomplete="new-password" /></label>
        <label class="campo"><span>Confirmar</span><input type="password" id="confirmar-contrasena" autocomplete="new-password" /></label>
      </div>
      <button class="boton" id="btn-contrasena">Actualizar contrasena</button>
    </div>`;

  cont.querySelector('#btn-guardar-config').onclick = async (e) => {
    const datos = leerFormulario(cont.querySelector('#form-config'));
    if (!datos) return;
    e.target.disabled = true;
    try {
      estado.configuracion = await api.actualizar('/api/configuracion', datos);
      aviso('Configuracion actualizada.');
      document.getElementById('barra-centro').textContent = estado.configuracion.nombre_centro;
      await estado.refrescarEstado?.();
    } catch (err) {
      aviso(err.message, 'error');
    }
    e.target.disabled = false;
  };

  cont.querySelector('#btn-contrasena').onclick = async () => {
    const nueva = cont.querySelector('#nueva-contrasena').value;
    const confirmacion = cont.querySelector('#confirmar-contrasena').value;
    if (nueva.length < 6) return aviso('La contrasena debe tener al menos 6 caracteres.', 'error');
    if (nueva !== confirmacion) return aviso('Las contrasenas no coinciden.', 'error');
    try {
      await api.crear('/api/perfil/contrasena', { nueva });
      aviso('Contrasena actualizada.');
      cont.querySelector('#nueva-contrasena').value = '';
      cont.querySelector('#confirmar-contrasena').value = '';
    } catch (e) {
      aviso(e.message, 'error');
    }
  };
}

/* ================================================================== */
/* Bitacora                                                            */
/* ================================================================== */

export async function bitacora(cont) {
  const filas = await api.obtener('/api/bitacora');
  cont.innerHTML = `
    ${rotulo('Bitacora', 'Registro de auditoria de las operaciones del sistema.', btnExportar)}
    ${tabla(
      [
        { titulo: 'Fecha', render: (b) => fechaHora(b.fecha), clase: 'fecha' },
        { titulo: 'Usuario', render: (b) => celdaClave(b.usuario) },
        { titulo: 'Accion', render: (b) => marca('neutro', b.accion) },
        { titulo: 'Modulo', campo: 'modulo' },
        { titulo: 'Detalle', campo: 'detalle' },
      ],
      filas,
      'Bitacora vacia'
    )}`;
  cont.querySelector('#btn-exportar').onclick = () => (window.location.href = '/api/exportar/bitacora');
}
