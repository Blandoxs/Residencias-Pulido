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

  // Correo saliente (opcional). Si no se configura, las alertas quedan
  // unicamente dentro del sistema (bandeja de notificaciones).
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    puerto: Number(process.env.SMTP_PORT ?? 587),
    seguro: process.env.SMTP_SEGURO === 'true',
    usuario: process.env.SMTP_USER ?? '',
    contrasena: process.env.SMTP_PASS ?? '',
    remitente: process.env.SMTP_FROM ?? 'SIGEV CFE <no-reply@sigev.local>',
  },
};

export const ROLES = {
  admin: 'Administrador',
  supervisor: 'Supervisor',
  consulta: 'Consulta',
};

/** Jerarquia de permisos: admin > supervisor > consulta */
export const NIVEL_ROL = { admin: 3, supervisor: 2, consulta: 1 };
