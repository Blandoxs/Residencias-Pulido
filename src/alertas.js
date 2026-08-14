/**
 * Generador de alertas y notificaciones al administrador.
 *
 * Recorre todas las vigencias del sistema y crea una notificacion cuando
 * un concepto entra en estado "proximo", "critico" o "vencido".
 * Cada notificacion tiene una clave unica (modulo + registro + concepto +
 * fecha + nivel) para no duplicar avisos; si el registro se renueva y
 * cambia su fecha, se vuelve a notificar en el nuevo ciclo.
 */
import { bd, leerConfiguracion, bitacora } from './bd.js';
import { listarVigencias } from './vigencias.js';
import { fechaLarga } from './util.js';
import { config } from './config.js';

const TITULOS = {
  vencido: 'VENCIDO',
  critico: 'Por vencer (critico)',
  proximo: 'Proximo a vencer',
};

/**
 * Ejecuta la revision de vencimientos.
 * @param {string} origen texto para la bitacora (automatico / usuario)
 * @returns {Promise<{generadas:number, correo:string}>}
 */
export async function revisarVencimientos(origen = 'automatico') {
  const items = listarVigencias().filter((i) => i.clasificacion !== 'vigente' && i.clasificacion !== 'sin_fecha');

  const insertar = bd.prepare(`INSERT OR IGNORE INTO notificaciones
    (clave, modulo, registro_id, referencia, concepto, titulo, mensaje, severidad, fecha_objetivo, dias_restantes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

  const nuevas = [];
  for (const i of items) {
    const clave = `${i.modulo}:${i.registro_id}:${i.concepto}:${i.fecha}:${i.clasificacion}`;
    const titulo = `${TITULOS[i.clasificacion]}: ${i.modulo_nombre} ${i.referencia}`;
    const mensaje =
      i.dias < 0
        ? `${i.concepto} de ${i.descripcion} vencio el ${fechaLarga(i.fecha)} (hace ${Math.abs(i.dias)} dias). Ubicacion: ${i.ubicacion || 'no especificada'}.`
        : `${i.concepto} de ${i.descripcion} vence el ${fechaLarga(i.fecha)} (faltan ${i.dias} dias). Ubicacion: ${i.ubicacion || 'no especificada'}.`;

    const r = insertar.run(
      clave,
      i.modulo,
      i.registro_id,
      i.referencia,
      i.concepto,
      titulo,
      mensaje,
      i.clasificacion,
      i.fecha,
      i.dias
    );
    if (r.changes > 0) nuevas.push({ ...i, titulo, mensaje, clave });
  }

  let correo = 'sin envio';
  if (nuevas.length) {
    bitacora('sistema', 'Revision de vencimientos', 'Alertas', `${nuevas.length} alertas nuevas (${origen})`);
    correo = await notificarPorCorreo(nuevas);
  }

  return { generadas: nuevas.length, revisadas: items.length, correo };
}

/**
 * Envia el resumen de alertas al administrador.
 * El envio de correo es opcional: si no hay servidor SMTP configurado o el
 * paquete nodemailer no esta instalado, el sistema continua funcionando y
 * las alertas quedan en la bandeja de notificaciones.
 */
async function notificarPorCorreo(nuevas) {
  const cfg = leerConfiguracion();
  if (cfg.notificar_por_correo !== '1') return 'desactivado';

  const destinatarios = new Set();
  if (cfg.correo_administrador) destinatarios.add(cfg.correo_administrador);
  for (const u of bd.prepare("SELECT correo FROM usuarios WHERE rol = 'admin' AND activo = 1 AND correo <> ''").all()) {
    destinatarios.add(u.correo);
  }
  if (!destinatarios.size) return 'sin destinatarios';
  if (!config.smtp.host) return 'SMTP no configurado';

  let nodemailer;
  try {
    nodemailer = (await import('nodemailer')).default;
  } catch {
    return 'nodemailer no instalado';
  }

  try {
    const transporte = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.puerto,
      secure: config.smtp.seguro,
      auth: config.smtp.usuario ? { user: config.smtp.usuario, pass: config.smtp.contrasena } : undefined,
    });

    const filas = nuevas
      .map(
        (n) =>
          `<tr><td style="padding:6px 10px;border-bottom:1px solid #ddd">${n.modulo_nombre} ${n.referencia}</td>
           <td style="padding:6px 10px;border-bottom:1px solid #ddd">${n.concepto}</td>
           <td style="padding:6px 10px;border-bottom:1px solid #ddd">${fechaLarga(n.fecha)}</td>
           <td style="padding:6px 10px;border-bottom:1px solid #ddd;color:${n.dias < 0 ? '#c0392b' : '#b9770e'}">
             ${n.dias < 0 ? `Vencido hace ${Math.abs(n.dias)} d` : `Faltan ${n.dias} d`}</td></tr>`
      )
      .join('');

    await transporte.sendMail({
      from: config.smtp.remitente,
      to: [...destinatarios].join(','),
      subject: `[SIGEV CFE] ${nuevas.length} alerta(s) de vencimiento`,
      html: `<div style="font-family:Segoe UI,Arial,sans-serif">
        <div style="background:#00713f;color:#fff;padding:14px 18px;font-weight:600">
          SIGEV - Sistema de Gestion de Equipo y Vigencias
        </div>
        <p>Se detectaron <strong>${nuevas.length}</strong> conceptos que requieren atencion en ${cfg.nombre_centro}:</p>
        <table style="border-collapse:collapse;font-size:14px">
          <tr style="background:#f0f0f0"><th style="padding:6px 10px;text-align:left">Registro</th>
          <th style="padding:6px 10px;text-align:left">Concepto</th>
          <th style="padding:6px 10px;text-align:left">Fecha</th>
          <th style="padding:6px 10px;text-align:left">Estado</th></tr>
          ${filas}
        </table>
        <p style="color:#666;font-size:12px">Mensaje generado automaticamente por SIGEV. No responder a este correo.</p>
      </div>`,
    });

    const ids = nuevas.map((n) => n.clave);
    const upd = bd.prepare('UPDATE notificaciones SET correo_enviado = 1 WHERE clave = ?');
    for (const id of ids) upd.run(id);
    return `enviado a ${destinatarios.size} destinatario(s)`;
  } catch (err) {
    console.error('  No fue posible enviar el correo de alertas:', err.message);
    return `error: ${err.message}`;
  }
}

/** Programa la revision automatica periodica. */
export function programarRevision() {
  const cada = Math.max(1, config.horasRevisionAlertas) * 3600000;
  revisarVencimientos('automatico (arranque)').then((r) =>
    console.log(`  Revision inicial de vencimientos: ${r.generadas} alerta(s) nueva(s).`)
  );
  const temporizador = setInterval(() => {
    revisarVencimientos('automatico (programado)').catch((e) => console.error(e));
  }, cada);
  temporizador.unref?.();
  return temporizador;
}
