/**
 * Configuracion general del servidor.
 * Todos los valores se pueden sobrescribir con variables de entorno,
 * lo que permite mover el sistema a otro equipo sin tocar el codigo.
 */
import path from 'node:path';

export const RAIZ = path.resolve(import.meta.dirname, '..');

export const config = {
  puerto: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? '127.0.0.1',

  // Archivo de base de datos (SQLite integrado en Node, no requiere instalacion).
  rutaBD: process.env.SIGEV_BD ?? path.join(RAIZ, 'datos', 'sigev.db'),

  // Duracion de la sesion del usuario, en horas.
  horasSesion: Number(process.env.SIGEV_HORAS_SESION ?? 8),

  // Cada cuantas horas se ejecuta automaticamente el motor de vencimientos.
  horasRevisionAlertas: Number(process.env.SIGEV_HORAS_REVISION ?? 6),

  // ===================================================================
  // TODO: Configurar aqui la API / credenciales del servicio de correo
  // (SMTP o API key) al desplegar en el servidor de produccion.
  // No colocar credenciales en el repositorio: usar variables de entorno.
  //
  //   set SMTP_HOST=smtp.cfe.mx
  //   set SMTP_PORT=587
  //   set SMTP_USER=alertas.parral@cfe.mx
  //   set SMTP_PASS=...
  //   set SMTP_FROM="SIGEV CFE <alertas.parral@cfe.mx>"
  //   set SIGEV_URL=http://servidor-tics:3000
  //
  // El envio requiere el paquete nodemailer (npm install nodemailer).
  // Si no esta configurado, el sistema sigue operando y las alertas
  // quedan en la bandeja interna.
  // ===================================================================
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    puerto: Number(process.env.SMTP_PORT ?? 587),
    seguro: process.env.SMTP_SEGURO === 'true',
    usuario: process.env.SMTP_USER ?? '',
    contrasena: process.env.SMTP_PASS ?? '',
    remitente: process.env.SMTP_FROM ?? 'SIGEV CFE <no-reply@sigev.local>',
  },
};

/* ==================================================================== */
/* Roles y permisos                                                     */
/* ==================================================================== */

/**
 * Los tres perfiles operativos del sistema. El acceso NO es jerarquico:
 * el Jefe de Seguridad y el Encargado de Documentacion son pares que
 * atienden modulos distintos.
 *
 * NOTA: el nombre del perfil "documentacion" quedo pendiente de definir;
 * para cambiarlo basta con editar el texto de esta tabla.
 */
export const ROLES = {
  admin: 'Administrador',
  seguridad: 'Jefe de Seguridad',
  documentacion: 'Encargado de Documentacion',
  consulta: 'Consulta (solo lectura)', // perfil heredado de versiones anteriores
};

/** Perfiles que se ofrecen al dar de alta un usuario. */
export const ROLES_ASIGNABLES = ['admin', 'seguridad', 'documentacion'];

/**
 * Modulos que cada perfil puede administrar (alta, cambio y baja).
 * La consulta del Panel, Vigencias y Alertas esta abierta a todos los
 * perfiles porque son vistas de concentrado, no de captura.
 */
export const PERMISOS = {
  admin: ['extintores', 'equipos', 'gafetes', 'licencias', 'empleados'],
  seguridad: ['extintores', 'equipos', 'empleados'],
  documentacion: ['gafetes', 'licencias', 'empleados'],
  consulta: [],
};

/** Perfil responsable de cada modulo (recibe las alertas por correo). */
export const RESPONSABLE_MODULO = {
  extintores: 'seguridad',
  equipos: 'seguridad',
  gafetes: 'documentacion',
  licencias: 'documentacion',
  empleados: 'admin',
};

/**
 * Categorias validas del modulo Equipo de Seguridad. Es la unica lista:
 * la usan el catalogo que llena los desplegables y la validacion del
 * servidor, para que no puedan divergir.
 *
 * "Equipo contra incendio" se retiro a proposito: ese material se registra
 * en el modulo Extintores, que lleva su propio ciclo de recarga y prueba
 * hidrostatica. Tenerlo en los dos lugares duplicaba el concepto.
 */
export const CATEGORIAS_EQUIPO = [
  'Botiquin de primeros auxilios',
  'Arnes de seguridad',
  'Equipo de proteccion personal',
  'Herramienta aislada',
  'Instrumento de medicion',
];

/** Nombre visible de cada modulo, usado en el menu y en los correos. */
export const NOMBRE_MODULO = {
  extintores: 'Extintores',
  equipos: 'Equipo de Seguridad',
  gafetes: 'Gafetes',
  licencias: 'Licencias de conducir',
  empleados: 'Personal',
};

/** true si el perfil puede administrar el modulo indicado. */
export function puedeModulo(rol, modulo) {
  return (PERMISOS[rol] ?? []).includes(modulo);
}

/** Modulos visibles en el menu para un perfil. */
export function modulosDe(rol) {
  return PERMISOS[rol] ?? [];
}
