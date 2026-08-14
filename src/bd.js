/**
 * Capa de base de datos: SQLite integrado en Node (node:sqlite).
 * Crea el esquema si no existe y siembra datos de demostracion la
 * primera vez que se ejecuta el sistema.
 */
import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { crearHash } from './auth.js';
import { hoyISO, sumarDias, sumarMeses } from './util.js';

fs.mkdirSync(path.dirname(config.rutaBD), { recursive: true });

export const bd = new DatabaseSync(config.rutaBD);
bd.exec('PRAGMA journal_mode = WAL');
bd.exec('PRAGMA foreign_keys = ON');

/* ------------------------------------------------------------------ */
/* Esquema                                                             */
/* ------------------------------------------------------------------ */

bd.exec(`
CREATE TABLE IF NOT EXISTS usuarios (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario       TEXT NOT NULL UNIQUE,
  nombre        TEXT NOT NULL,
  correo        TEXT NOT NULL DEFAULT '',
  rol           TEXT NOT NULL DEFAULT 'consulta',
  hash          TEXT NOT NULL,
  activo        INTEGER NOT NULL DEFAULT 1,
  creado_en     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  ultimo_acceso TEXT
);

CREATE TABLE IF NOT EXISTS sesiones (
  token      TEXT PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  creada_en  TEXT NOT NULL,
  expira_en  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS empleados (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  rpe            TEXT NOT NULL UNIQUE,
  nombre         TEXT NOT NULL,
  puesto         TEXT NOT NULL DEFAULT '',
  departamento   TEXT NOT NULL DEFAULT '',
  centro_trabajo TEXT NOT NULL DEFAULT '',
  correo         TEXT NOT NULL DEFAULT '',
  telefono       TEXT NOT NULL DEFAULT '',
  tipo_sangre    TEXT NOT NULL DEFAULT '',
  foto           TEXT,
  activo         INTEGER NOT NULL DEFAULT 1,
  creado_en      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS gafetes (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  folio              TEXT NOT NULL UNIQUE,
  empleado_id        INTEGER NOT NULL REFERENCES empleados(id) ON DELETE CASCADE,
  tipo               TEXT NOT NULL DEFAULT 'Empleado',
  nivel_acceso       TEXT NOT NULL DEFAULT 'General',
  fecha_emision      TEXT NOT NULL,
  fecha_vencimiento  TEXT NOT NULL,
  estado             TEXT NOT NULL DEFAULT 'Activo',
  observaciones      TEXT NOT NULL DEFAULT '',
  creado_en          TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS extintores (
  id                       INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo                   TEXT NOT NULL UNIQUE,
  tipo                     TEXT NOT NULL DEFAULT 'PQS',
  capacidad_kg             REAL NOT NULL DEFAULT 0,
  marca                    TEXT NOT NULL DEFAULT '',
  ubicacion                TEXT NOT NULL DEFAULT '',
  area                     TEXT NOT NULL DEFAULT '',
  fecha_fabricacion        TEXT,
  fecha_recarga            TEXT,
  fecha_prox_recarga       TEXT NOT NULL,
  fecha_prueba_hidrostatica TEXT,
  fecha_prox_hidrostatica  TEXT,
  responsable_id           INTEGER REFERENCES empleados(id) ON DELETE SET NULL,
  estado                   TEXT NOT NULL DEFAULT 'Operativo',
  observaciones            TEXT NOT NULL DEFAULT '',
  creado_en                TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS equipos (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo              TEXT NOT NULL UNIQUE,
  nombre              TEXT NOT NULL,
  categoria           TEXT NOT NULL DEFAULT 'Equipo de proteccion personal',
  marca               TEXT NOT NULL DEFAULT '',
  modelo              TEXT NOT NULL DEFAULT '',
  serie               TEXT NOT NULL DEFAULT '',
  ubicacion           TEXT NOT NULL DEFAULT '',
  responsable_id      INTEGER REFERENCES empleados(id) ON DELETE SET NULL,
  fecha_adquisicion   TEXT,
  fecha_vencimiento   TEXT NOT NULL,
  frecuencia_meses    INTEGER NOT NULL DEFAULT 0,
  fecha_ultimo_mantenimiento TEXT,
  estado              TEXT NOT NULL DEFAULT 'En servicio',
  observaciones       TEXT NOT NULL DEFAULT '',
  creado_en           TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS notificaciones (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  clave          TEXT NOT NULL UNIQUE,
  modulo         TEXT NOT NULL,
  registro_id    INTEGER NOT NULL,
  referencia     TEXT NOT NULL,
  concepto       TEXT NOT NULL,
  titulo         TEXT NOT NULL,
  mensaje        TEXT NOT NULL,
  severidad      TEXT NOT NULL,
  fecha_objetivo TEXT NOT NULL,
  dias_restantes INTEGER NOT NULL,
  leida          INTEGER NOT NULL DEFAULT 0,
  correo_enviado INTEGER NOT NULL DEFAULT 0,
  creada_en      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS bitacora (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario       TEXT NOT NULL DEFAULT 'sistema',
  accion        TEXT NOT NULL,
  modulo        TEXT NOT NULL,
  detalle       TEXT NOT NULL DEFAULT '',
  fecha         TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gafetes_venc     ON gafetes(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_extintores_venc  ON extintores(fecha_prox_recarga);
CREATE INDEX IF NOT EXISTS idx_equipos_venc     ON equipos(fecha_vencimiento);
CREATE INDEX IF NOT EXISTS idx_notif_leida      ON notificaciones(leida, creada_en);
`);

/* ------------------------------------------------------------------ */
/* Configuracion por defecto                                           */
/* ------------------------------------------------------------------ */

const CONFIG_DEFECTO = {
  dias_criticos: '7',
  dias_proximos: '30',
  correo_administrador: '',
  notificar_por_correo: '0',
  nombre_centro: 'Centro de Trabajo CFE',
  zona: 'Zona de Distribucion',
};

const insConfig = bd.prepare('INSERT OR IGNORE INTO configuracion (clave, valor) VALUES (?, ?)');
for (const [clave, valor] of Object.entries(CONFIG_DEFECTO)) insConfig.run(clave, valor);

export function leerConfiguracion() {
  const filas = bd.prepare('SELECT clave, valor FROM configuracion').all();
  const obj = { ...CONFIG_DEFECTO };
  for (const f of filas) obj[f.clave] = f.valor;
  return obj;
}

export function guardarConfiguracion(clave, valor) {
  bd.prepare(
    'INSERT INTO configuracion (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor'
  ).run(clave, String(valor));
}

/** Umbrales de alerta vigentes (dias). */
export function umbrales() {
  const c = leerConfiguracion();
  return {
    critico: Number(c.dias_criticos) || 7,
    proximo: Number(c.dias_proximos) || 30,
  };
}

/** Registra un movimiento en la bitacora de auditoria. */
export function bitacora(usuario, accion, modulo, detalle = '') {
  bd.prepare('INSERT INTO bitacora (usuario, accion, modulo, detalle) VALUES (?, ?, ?, ?)').run(
    usuario || 'sistema',
    accion,
    modulo,
    detalle
  );
}

/* ------------------------------------------------------------------ */
/* Semilla inicial                                                     */
/* ------------------------------------------------------------------ */

/**
 * Genera una contrasena inicial aleatoria (sin caracteres ambiguos).
 * De esta forma el repositorio no contiene ninguna credencial.
 */
function contrasenaAleatoria(longitud = 14) {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(longitud);
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join('');
}

function sembrar() {
  const total = bd.prepare('SELECT COUNT(*) AS n FROM usuarios').get().n;
  if (total > 0) return;

  // La contrasena del administrador se toma de la variable de entorno
  // SIGEV_ADMIN_PASS o, si no existe, se genera una aleatoria y se muestra
  // una sola vez en la consola y en datos/acceso-inicial.txt
  const contrasenaInicial = (process.env.SIGEV_ADMIN_PASS ?? '').trim() || contrasenaAleatoria();

  bd.prepare('INSERT INTO usuarios (usuario, nombre, correo, rol, hash) VALUES (?, ?, ?, ?, ?)').run(
    'admin',
    'Administrador del Sistema',
    '',
    'admin',
    crearHash(contrasenaInicial)
  );

  const archivoAcceso = path.join(path.dirname(config.rutaBD), 'acceso-inicial.txt');
  fs.writeFileSync(
    archivoAcceso,
    [
      'SIGEV - Acceso inicial al sistema',
      '=================================',
      `Generado: ${new Date().toLocaleString('es-MX')}`,
      '',
      '  Usuario:    admin',
      `  Contrasena: ${contrasenaInicial}`,
      '',
      'Cambie esta contrasena al entrar (menu del usuario > Cambiar contrasena)',
      'y elimine este archivo. Nunca lo suba a un repositorio.',
      '',
    ].join('\r\n'),
    'utf8'
  );

  console.log('');
  console.log('  ***********************************************************');
  console.log('   ACCESO INICIAL (se muestra una sola vez)');
  console.log('     Usuario:    admin');
  console.log(`     Contrasena: ${contrasenaInicial}`);
  console.log(`   Copia guardada en: ${archivoAcceso}`);
  console.log('   Cambie la contrasena al entrar y elimine ese archivo.');
  console.log('  ***********************************************************');
  console.log('');

  const hoy = hoyISO();
  const insEmpleado = bd.prepare(`INSERT INTO empleados
    (rpe, nombre, puesto, departamento, centro_trabajo, correo, telefono, tipo_sangre)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);

  const empleados = [
    ['RPE10245', 'Juan Carlos Ramirez Soto', 'Linero de Distribucion', 'Distribucion', 'Zona Centro', 'jc.ramirez@cfe.mx', '8112345678', 'O+'],
    ['RPE10312', 'Maria Fernanda Lopez Cruz', 'Ingeniera de Seguridad', 'Seguridad e Higiene', 'Zona Centro', 'mf.lopez@cfe.mx', '8113456789', 'A+'],
    ['RPE10488', 'Roberto Gutierrez Mendoza', 'Tecnico Electricista', 'Mantenimiento', 'Subestacion Norte', 'r.gutierrez@cfe.mx', '8114567890', 'B+'],
    ['RPE10520', 'Ana Sofia Herrera Vazquez', 'Analista Administrativo', 'Administracion', 'Oficinas Centrales', 'as.herrera@cfe.mx', '8115678901', 'O-'],
    ['RPE10634', 'Luis Alberto Nava Trevino', 'Supervisor de Brigada', 'Distribucion', 'Zona Sur', 'la.nava@cfe.mx', '8116789012', 'AB+'],
    ['RPE10711', 'Patricia Elena Dominguez Rios', 'Jefa de Almacen', 'Almacen', 'Zona Centro', 'pe.dominguez@cfe.mx', '8117890123', 'A-'],
  ];
  for (const e of empleados) insEmpleado.run(...e);

  const insGafete = bd.prepare(`INSERT INTO gafetes
    (folio, empleado_id, tipo, nivel_acceso, fecha_emision, fecha_vencimiento, estado, observaciones)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const gafetes = [
    ['GAF-2024-001', 1, 'Empleado', 'Areas energizadas', sumarDias(hoy, -700), sumarDias(hoy, -12), 'Activo', 'Requiere renovacion inmediata'],
    ['GAF-2024-002', 2, 'Empleado', 'Total', sumarDias(hoy, -400), sumarDias(hoy, 5), 'Activo', ''],
    ['GAF-2024-003', 3, 'Contratista', 'Subestaciones', sumarDias(hoy, -300), sumarDias(hoy, 24), 'Activo', ''],
    ['GAF-2025-004', 4, 'Empleado', 'General', sumarDias(hoy, -120), sumarDias(hoy, 210), 'Activo', ''],
    ['GAF-2025-005', 5, 'Empleado', 'Areas energizadas', sumarDias(hoy, -60), sumarDias(hoy, 300), 'Activo', ''],
    ['GAF-2025-006', 6, 'Visitante frecuente', 'Almacen', sumarDias(hoy, -200), sumarDias(hoy, 45), 'Activo', ''],
  ];
  for (const g of gafetes) insGafete.run(...g);

  const insExtintor = bd.prepare(`INSERT INTO extintores
    (codigo, tipo, capacidad_kg, marca, ubicacion, area, fecha_fabricacion, fecha_recarga,
     fecha_prox_recarga, fecha_prueba_hidrostatica, fecha_prox_hidrostatica, responsable_id, estado, observaciones)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const extintores = [
    ['EXT-001', 'PQS', 9, 'Badger', 'Pasillo principal, planta baja', 'Oficinas Centrales', sumarDias(hoy, -1800), sumarDias(hoy, -370), sumarDias(hoy, -5), sumarDias(hoy, -1100), sumarMeses(hoy, 14), 2, 'Operativo', 'Recarga vencida'],
    ['EXT-002', 'CO2', 4.5, 'Amerex', 'Cuarto de tableros', 'Subestacion Norte', sumarDias(hoy, -1200), sumarDias(hoy, -350), sumarDias(hoy, 15), sumarDias(hoy, -900), sumarMeses(hoy, 20), 3, 'Operativo', ''],
    ['EXT-003', 'PQS', 6, 'Extinsa', 'Almacen general', 'Zona Centro', sumarDias(hoy, -900), sumarDias(hoy, -300), sumarDias(hoy, 65), sumarDias(hoy, -600), sumarMeses(hoy, 30), 6, 'Operativo', ''],
    ['EXT-004', 'Agua a presion', 10, 'Badger', 'Taller de mantenimiento', 'Zona Sur', sumarDias(hoy, -1500), sumarDias(hoy, -340), sumarDias(hoy, 25), sumarDias(hoy, -1400), sumarDias(hoy, 40), 5, 'Operativo', 'Proxima prueba hidrostatica cercana'],
    ['EXT-005', 'Espuma AFFF', 9, 'Amerex', 'Area de vehiculos', 'Zona Centro', sumarDias(hoy, -700), sumarDias(hoy, -100), sumarDias(hoy, 265), sumarDias(hoy, -700), sumarMeses(hoy, 48), 1, 'Operativo', ''],
    ['EXT-006', 'PQS', 4.5, 'Extinsa', 'Cuarto de control', 'Subestacion Norte', sumarDias(hoy, -2000), sumarDias(hoy, -380), sumarDias(hoy, -20), sumarDias(hoy, -2000), sumarDias(hoy, -60), 3, 'Fuera de servicio', 'Enviado a taller'],
  ];
  for (const e of extintores) insExtintor.run(...e);

  const insEquipo = bd.prepare(`INSERT INTO equipos
    (codigo, nombre, categoria, marca, modelo, serie, ubicacion, responsable_id,
     fecha_adquisicion, fecha_vencimiento, frecuencia_meses, fecha_ultimo_mantenimiento, estado, observaciones)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  const equipos = [
    ['EQ-0001', 'Guantes dielectricos clase 2', 'Equipo de proteccion personal', 'Salisbury', 'E214B', 'SLB-4471', 'Brigada Distribucion', 1, sumarDias(hoy, -400), sumarDias(hoy, 3), 6, sumarDias(hoy, -180), 'En servicio', 'Prueba dielectrica semestral'],
    ['EQ-0002', 'Arnes de cuerpo completo', 'Equipo de proteccion personal', '3M', 'Protecta AB17530', '3M-99120', 'Brigada Zona Sur', 5, sumarDias(hoy, -800), sumarDias(hoy, 60), 12, sumarDias(hoy, -300), 'En servicio', ''],
    ['EQ-0003', 'Detector de tension 34.5 kV', 'Instrumento de medicion', 'Fluke', '1AC-E1', 'FLK-33021', 'Subestacion Norte', 3, sumarDias(hoy, -600), sumarDias(hoy, -9), 12, sumarDias(hoy, -370), 'En servicio', 'Calibracion vencida'],
    ['EQ-0004', 'Botiquin de primeros auxilios', 'Insumo con caducidad', 'Generico', 'Tipo B', 'BOT-014', 'Oficinas Centrales', 4, sumarDias(hoy, -200), sumarDias(hoy, 20), 0, null, 'En servicio', 'Revisar medicamentos'],
    ['EQ-0005', 'Multimetro industrial', 'Instrumento de medicion', 'Fluke', '87V', 'FLK-87221', 'Taller de mantenimiento', 3, sumarDias(hoy, -1000), sumarDias(hoy, 120), 12, sumarDias(hoy, -240), 'En servicio', ''],
    ['EQ-0006', 'Casco dielectrico clase E', 'Equipo de proteccion personal', 'MSA', 'V-Gard', 'MSA-7712', 'Brigada Distribucion', 1, sumarDias(hoy, -1100), sumarDias(hoy, 340), 0, null, 'En servicio', ''],
    ['EQ-0007', 'Pertiga telescopica 10 m', 'Herramienta aislada', 'Hastings', 'H-1000', 'HST-2214', 'Zona Sur', 5, sumarDias(hoy, -1500), sumarDias(hoy, 28), 12, sumarDias(hoy, -337), 'En servicio', ''],
    ['EQ-0008', 'Extintor portatil de respaldo', 'Insumo con caducidad', 'Badger', 'B5', 'BDG-5521', 'Almacen general', 6, sumarDias(hoy, -300), sumarDias(hoy, 90), 12, null, 'En almacen', ''],
  ];
  for (const e of equipos) insEquipo.run(...e);

  bitacora('sistema', 'Instalacion', 'Sistema', 'Base de datos creada con informacion de demostracion');
  console.log('  Base de datos inicializada con datos de demostracion.');
}

sembrar();
