/**
 * Motor de vigencias.
 * Reune en una sola lista todos los conceptos con fecha de caducidad
 * de los tres modulos (gafetes, extintores y equipo) y los clasifica.
 */
import { bd, umbrales } from './bd.js';
import { estadoVigencia, sumarMeses, esFecha } from './util.js';

/** Estados que ya no requieren vigilancia. */
const IGNORADOS = new Set(['Cancelado', 'Baja', 'Dado de baja', 'Desechado']);

/**
 * Devuelve todos los conceptos con vencimiento del sistema.
 * Cada elemento incluye dias restantes y su clasificacion.
 */
export function listarVigencias() {
  const u = umbrales();
  const items = [];

  const agregar = (base, fecha, concepto) => {
    if (!esFecha(fecha)) return;
    const v = estadoVigencia(fecha, u);
    items.push({ ...base, concepto, fecha, dias: v.dias, clasificacion: v.estado, etiqueta: v.etiqueta });
  };

  // --- Gafetes -----------------------------------------------------
  const gafetes = bd
    .prepare(
      `SELECT g.*, e.nombre AS empleado, e.rpe, e.departamento
       FROM gafetes g JOIN empleados e ON e.id = g.empleado_id`
    )
    .all();
  for (const g of gafetes) {
    if (IGNORADOS.has(g.estado)) continue;
    agregar(
      {
        modulo: 'gafetes',
        modulo_nombre: 'Gafete',
        registro_id: g.id,
        referencia: g.folio,
        descripcion: `${g.empleado} (${g.rpe})`,
        ubicacion: g.departamento,
        responsable: g.empleado,
        estado_registro: g.estado,
      },
      g.fecha_vencimiento,
      'Vigencia del gafete'
    );
  }

  // --- Extintores --------------------------------------------------
  const extintores = bd
    .prepare(
      `SELECT x.*, e.nombre AS responsable
       FROM extintores x LEFT JOIN empleados e ON e.id = x.responsable_id`
    )
    .all();
  for (const x of extintores) {
    if (IGNORADOS.has(x.estado)) continue;
    const base = {
      modulo: 'extintores',
      modulo_nombre: 'Extintor',
      registro_id: x.id,
      referencia: x.codigo,
      descripcion: `${x.tipo} ${x.capacidad_kg} kg - ${x.ubicacion}`,
      ubicacion: x.ubicacion,
      responsable: x.responsable ?? 'Sin asignar',
      estado_registro: x.estado,
    };
    agregar(base, x.fecha_prox_recarga, 'Recarga');
    agregar(base, x.fecha_prox_hidrostatica, 'Prueba hidrostatica');
  }

  // --- Equipo ------------------------------------------------------
  const equipos = bd
    .prepare(
      `SELECT q.*, e.nombre AS responsable
       FROM equipos q LEFT JOIN empleados e ON e.id = q.responsable_id`
    )
    .all();
  for (const q of equipos) {
    if (IGNORADOS.has(q.estado)) continue;
    const base = {
      modulo: 'equipos',
      modulo_nombre: 'Equipo',
      registro_id: q.id,
      referencia: q.codigo,
      descripcion: `${q.nombre}${q.marca ? ` - ${q.marca}` : ''}`,
      ubicacion: q.ubicacion,
      responsable: q.responsable ?? 'Sin asignar',
      estado_registro: q.estado,
    };
    agregar(base, q.fecha_vencimiento, 'Vigencia / caducidad');
    if (q.frecuencia_meses > 0 && esFecha(q.fecha_ultimo_mantenimiento)) {
      agregar(base, sumarMeses(q.fecha_ultimo_mantenimiento, q.frecuencia_meses), 'Mantenimiento / calibracion');
    }
  }

  items.sort((a, b) => a.dias - b.dias);
  return items;
}

/** Conteo por clasificacion para el panel principal. */
export function resumenVigencias(items = listarVigencias()) {
  const r = { vencido: 0, critico: 0, proximo: 0, vigente: 0, total: items.length };
  for (const i of items) r[i.clasificacion] = (r[i.clasificacion] ?? 0) + 1;
  return r;
}
