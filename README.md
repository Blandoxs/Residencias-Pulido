# SIGEV — Sistema de Gestión de Equipo y Vigencias

Sistema web para el control del equipo de la empresa con temática institucional CFE:
**gafetes del personal**, **extintores** y **equipo con duración/caducidad determinada**,
con **avisos automáticos al administrador** cuando un producto está por vencer o ya venció.

---

## 1. Requisitos y arranque

Solo se necesita **Node.js 22.5 o superior** (probado en Node 24). **No requiere `npm install`**:
el sistema usa únicamente módulos integrados de Node (servidor HTTP, base de datos SQLite y criptografía).

```bash
npm start
```

Después abra el navegador en **http://127.0.0.1:3000**

Para desarrollo con recarga automática:

```bash
npm run dev
```

Para borrar la base de datos y volver a generarla con datos de demostración:

```bash
npm run reiniciar-bd
```

### Primer acceso

El repositorio **no contiene ninguna contraseña**. En el primer arranque el sistema crea la
cuenta `admin` y genera una contraseña aleatoria de 14 caracteres que se muestra **una sola vez**
en la consola del servidor:

```text
  ***********************************************************
   ACCESO INICIAL (se muestra una sola vez)
     Usuario:    admin
     Contrasena: ··············
  ***********************************************************
```

También queda una copia en `datos/acceso-inicial.txt` (carpeta excluida del repositorio por
`.gitignore`). **Entre al sistema, cambie la contraseña** desde el menú del usuario →
*Cambiar contraseña* y borre ese archivo.

Si prefiere definirla usted, exporte la variable antes del primer arranque:

```bash
set SIGEV_ADMIN_PASS=SuContrasenaSegura
npm start
```

Las demás cuentas se crean desde el módulo **Usuarios** eligiendo su perfil:

| Perfil        | Puede hacer                                                    |
|---------------|-----------------------------------------------------------------|
| Administrador | Todo: usuarios, configuración, bitácora y catálogos              |
| Supervisor    | Alta, cambio y baja de gafetes, extintores, equipo y personal     |
| Consulta      | Solo lectura de catálogos, vigencias y alertas                    |

---

## 2. Módulos del sistema

| Módulo | Qué controla | Fechas que vigila |
|---|---|---|
| **Panel principal** | Indicadores, gráficas y pendientes inmediatos | — |
| **Vigencias** | Concentrado único de todo lo que caduca | Todas |
| **Notificaciones** | Bandeja de alertas generadas por el sistema | — |
| **Gafetes** | Credenciales del personal, folio, tipo y nivel de acceso | Vigencia del gafete |
| **Extintores** | Inventario contra incendio, tipo de agente, capacidad y ubicación | Próxima recarga y próxima prueba hidrostática |
| **Equipo** | EPP, herramienta aislada, instrumentos e insumos | Caducidad y mantenimiento/calibración periódica |
| **Personal** | Empleados (RPE, puesto, área, tipo de sangre, fotografía) | — |
| **Usuarios** | Cuentas de acceso y perfiles | — |
| **Configuración** | Umbrales de aviso, datos del centro y correo | — |
| **Bitácora** | Auditoría de todas las operaciones | — |

### Funciones destacadas

- **Credencial imprimible**: en Gafetes → botón *Credencial* se genera el gafete con foto,
  RPE, puesto, tipo de sangre, folio, nivel de acceso y vigencia, listo para imprimir.
- **Acciones rápidas**: *Renovar* gafete (12 meses), *Recarga* de extintor (reprograma la
  siguiente a 12 meses) y *Mantenimiento* de equipo (registra la fecha de hoy y recalcula el
  siguiente según su frecuencia).
- **Exportación a CSV** (compatible con Excel) en cada módulo.
- **Fotografía del empleado**: se reduce en el navegador y se guarda en la base de datos.

---

## 3. Cómo funcionan las alertas de vencimiento

El motor de vigencias reúne **todos los conceptos con fecha** de los tres módulos y los clasifica:

| Situación | Regla (configurable) | Color |
|---|---|---|
| **Vigente** | Faltan más de 30 días | Verde |
| **Próximo a vencer** | Faltan 30 días o menos | Ámbar |
| **Crítico** | Faltan 7 días o menos | Naranja |
| **Vencido** | La fecha ya pasó | Rojo |

La revisión se ejecuta:

1. Al **arrancar el servidor**.
2. **Cada 6 horas** de forma automática.
3. Cuando se presiona **⟳ Revisar vencimientos** (barra superior, panel o notificaciones).

Cada alerta nueva se guarda con una clave única
(`módulo : registro : concepto : fecha : nivel`), por lo que **no se duplican avisos**;
si el registro se renueva y cambia su fecha, el ciclo de avisos vuelve a iniciar.

Las alertas se muestran en la **campana** de la barra superior y en la vista de Notificaciones.

### Envío de correo al administrador (opcional)

Además del aviso dentro del sistema, se puede enviar un concentrado por correo:

1. En **Configuración** capture el *Correo del administrador* y active *Envío de alertas por correo*.
   También reciben el aviso todos los usuarios con perfil Administrador que tengan correo.
2. Instale el paquete de correo y defina el servidor SMTP antes de arrancar:

```bash
npm install nodemailer
```

```bash
set SMTP_HOST=smtp.oficina.gob.mx
set SMTP_PORT=587
set SMTP_USER=alertas@cfe.mx
set SMTP_PASS=su_contrasena
npm start
```

Si no se configura SMTP el sistema sigue funcionando con normalidad y las alertas
quedan únicamente en la bandeja de notificaciones.

---

## 4. Estructura del proyecto

```
Recidencias Pulido/
├── server.js              Servidor HTTP, archivos estáticos y manejo de errores
├── package.json
├── src/
│   ├── config.js          Parámetros (puerto, base de datos, SMTP, sesión)
│   ├── bd.js              Esquema SQLite, configuración y datos de demostración
│   ├── auth.js            Contraseñas (scrypt), sesiones y control de roles
│   ├── router.js          Enrutador de la API
│   ├── api.js             Servicios REST de todos los módulos
│   ├── vigencias.js       Motor que reúne y clasifica lo que caduca
│   ├── alertas.js         Generación de notificaciones y envío de correo
│   └── util.js            Fechas, validaciones y exportación CSV
├── public/
│   ├── index.html         Estructura y biblioteca de iconos SVG
│   ├── css/estilos.css    Tema institucional (verde CFE, negro y papel)
│   ├── img/
│   │   ├── cfe.svg        Logotipo para fondos claros
│   │   ├── cfe-blanco.svg Logotipo para fondos oscuros (barra y credencial)
│   │   └── favicon.svg
│   └── js/
│       ├── app.js         Acceso, navegación y campana de notificaciones
│       ├── nucleo.js      Cliente de la API y componentes reutilizables
│       └── vistas.js      Pantallas de cada módulo
├── scripts/
│   └── reiniciar-bd.js
└── datos/
    └── sigev.db           Base de datos (se crea sola en el primer arranque)
```

### Identidad gráfica

La interfaz sigue el color institucional de la CFE (verde `#00733F`, negro y papel) con un
lenguaje de **tablero de operación**: retícula estricta, líneas de 1 px, rotulación condensada
en mayúsculas, cifras monoespaciadas e iconos SVG propios (sin librerías externas).

Los archivos `public/img/cfe.svg` y `public/img/cfe-blanco.svg` son una **composición propia**
del emblema (marca + rayo + razón social) para uso interno del proyecto, no el archivo oficial.
Para usar el logotipo institucional basta con **reemplazar esos dos archivos** conservando el
nombre: uno en versión a color para fondos claros y otro en versión blanca para fondos oscuros.
No hay que tocar el código.

---

## 5. Modelo de datos

| Tabla | Contenido | Campos con vencimiento |
|---|---|---|
| `usuarios` | Cuentas de acceso (contraseña con scrypt + sal) | — |
| `sesiones` | Sesiones activas con caducidad | — |
| `empleados` | Personal: RPE, puesto, área, contacto, foto | — |
| `gafetes` | Folio, empleado, tipo, nivel de acceso, estado | `fecha_vencimiento` |
| `extintores` | Código, agente, capacidad, ubicación, responsable | `fecha_prox_recarga`, `fecha_prox_hidrostatica` |
| `equipos` | Código, categoría, marca, serie, responsable | `fecha_vencimiento`, mantenimiento por `frecuencia_meses` |
| `notificaciones` | Alertas generadas, severidad y estado de lectura | — |
| `configuracion` | Umbrales de aviso y datos del centro de trabajo | — |
| `bitacora` | Auditoría de altas, cambios, bajas y accesos | — |

---

## 6. Servicios de la API

Todas las rutas responden JSON y requieren sesión (cookie `sigev_sesion`, HttpOnly).

| Método y ruta | Rol mínimo | Descripción |
|---|---|---|
| `POST /api/sesion/iniciar` · `POST /api/sesion/cerrar` · `GET /api/sesion` | — | Control de acceso |
| `GET /api/panel` | consulta | Indicadores y gráficas del panel |
| `GET /api/vigencias?estado=&modulo=&q=` | consulta | Concentrado de vencimientos |
| `GET·POST·PUT·DELETE /api/empleados[/:id]` | consulta / supervisor | Personal |
| `GET·POST·PUT·DELETE /api/gafetes[/:id]` | consulta / supervisor | Gafetes |
| `GET /api/gafetes/:id/credencial` | consulta | Datos para imprimir la credencial |
| `GET·POST·PUT·DELETE /api/extintores[/:id]` | consulta / supervisor | Extintores |
| `GET·POST·PUT·DELETE /api/equipos[/:id]` | consulta / supervisor | Equipo con vigencia |
| `GET /api/notificaciones` · `POST /api/notificaciones/:id/leer` · `POST /api/notificaciones/leer-todas` | consulta | Bandeja de alertas |
| `POST /api/alertas/revisar` | consulta | Ejecuta el motor de vencimientos |
| `GET·POST·PUT·DELETE /api/usuarios[/:id]` | admin | Cuentas del sistema |
| `GET·PUT /api/configuracion` | consulta / admin | Parámetros del sistema |
| `GET /api/bitacora` | admin | Auditoría |
| `GET /api/exportar/:modulo` | consulta | CSV de empleados, gafetes, extintores, equipos, vigencias o bitácora |

---

## 7. Seguridad

- **El repositorio no contiene credenciales**: la contraseña del administrador se genera de
  forma aleatoria en el primer arranque (o se toma de `SIGEV_ADMIN_PASS`), y la base de datos
  junto con `acceso-inicial.txt` están excluidas por `.gitignore`.
- Contraseñas almacenadas con **scrypt + sal aleatoria**; nunca en texto plano.
- Sesión mediante **token aleatorio de 256 bits** en cookie `HttpOnly` + `SameSite=Strict`,
  con caducidad de 8 horas (configurable con `SIGEV_HORAS_SESION`).
- **Tres perfiles** de permisos verificados en el servidor, no solo en la interfaz.
- Validación y saneamiento de todos los campos recibidos; consultas con parámetros
  (sin concatenar valores, evita inyección SQL).
- Escape de HTML en la interfaz para evitar inyección de código.
- **Bitácora** de accesos, altas, cambios y bajas.

---

## 8. Variables de entorno

| Variable | Valor por omisión | Uso |
|---|---|---|
| `PORT` | `3000` | Puerto del servidor |
| `HOST` | `127.0.0.1` | Use `0.0.0.0` para publicarlo en la red local |
| `SIGEV_BD` | `datos/sigev.db` | Ubicación de la base de datos |
| `SIGEV_HORAS_SESION` | `8` | Duración de la sesión |
| `SIGEV_HORAS_REVISION` | `6` | Frecuencia de la revisión automática |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SEGURO` | — | Servidor de correo saliente |

---

## 9. Respaldo

Toda la información vive en `datos/sigev.db`. Para respaldar, **detenga el servidor** y copie
la carpeta `datos/` completa (incluye los archivos `-wal` y `-shm`). Para restaurar, reemplácela
y vuelva a iniciar.
