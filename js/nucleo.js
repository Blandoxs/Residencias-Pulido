/**
 * Nucleo del cliente: comunicacion con la API, utilerias de formato,
 * componentes reutilizables (tablas, modales, formularios y avisos).
 */

export const estado = {
  usuario: null,
  catalogos: null,
  configuracion: {},
  notificaciones: 0,
};

const NIVEL = { admin: 3, supervisor: 2, consulta: 1 };

/** Verifica si el usuario en sesion alcanza el rol indicado. */
export function puede(rolMinimo) {
  return (NIVEL[estado.usuario?.rol] ?? 0) >= (NIVEL[rolMinimo] ?? 99);
}

/* ============================ API ============================ */

async function peticion(metodo, ruta, cuerpo) {
  const respuesta = await fetch(ruta, {
    method: metodo,
    headers: cuerpo ? { 'Content-Type': 'application/json' } : {},
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });

  const tipo = respuesta.headers.get('content-type') ?? '';
  if (!tipo.includes('application/json')) {
    if (!respuesta.ok) throw new Error(`Error ${respuesta.status}`);
    return respuesta.text();
  }

  const datos = await respuesta.json();
  if (!respuesta.ok) {
    const error = new Error(datos.error ?? 'Error inesperado');
    error.codigo = respuesta.status;
    throw error;
  }
  return datos;
}

export const api = {
  obtener: (ruta) => peticion('GET', ruta),
  crear: (ruta, cuerpo) => peticion('POST', ruta, cuerpo ?? {}),
  actualizar: (ruta, cuerpo) => peticion('PUT', ruta, cuerpo),
  eliminar: (ruta) => peticion('DELETE', ruta),
};

/* ============================ FORMATO ============================ */

export function esc(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** AAAA-MM-DD -> DD/MM/AAAA */
export function fecha(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return '—';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function fechaHora(texto) {
  if (!texto) return '—';
  const [f, h = ''] = String(texto).split(' ');
  return `${fecha(f)} ${h.slice(0, 5)}`.trim();
}

export function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function diasEntre(iso) {
  if (!iso) return null;
  return Math.round((new Date(`${iso.slice(0, 10)}T00:00:00`) - new Date(`${hoy()}T00:00:00`)) / 86400000);
}

const ETIQUETAS = {
  vencido: 'Vencido',
  critico: 'Critico',
  proximo: 'Por vencer',
  vigente: 'Vigente',
  sin_fecha: 'Sin fecha',
};

/** Icono de la biblioteca incluida en index.html. */
export function icono(nombre, clase = '') {
  return `<svg class="ico ${clase}" aria-hidden="true"><use href="#i-${nombre}"></use></svg>`;
}

/** Clasifica una fecha con los umbrales configurados en el servidor. */
export function clasificar(iso) {
  const dias = diasEntre(iso);
  if (dias === null) return { clase: 'sin_fecha', dias: null, texto: 'Sin fecha' };
  const critico = Number(estado.configuracion.dias_criticos ?? 7);
  const proximo = Number(estado.configuracion.dias_proximos ?? 30);
  if (dias < 0) return { clase: 'vencido', dias, texto: `Vencido hace ${Math.abs(dias)} d` };
  if (dias <= critico) return { clase: 'critico', dias, texto: dias === 0 ? 'Vence hoy' : `${dias} d` };
  if (dias <= proximo) return { clase: 'proximo', dias, texto: `${dias} d` };
  return { clase: 'vigente', dias, texto: `${dias} d` };
}

/** Banderin de estado: cuadro de color + rotulacion tecnica. */
export function marca(clase, texto) {
  return `<span class="marca marca--${esc(clase)}">${esc(texto ?? ETIQUETAS[clase] ?? clase)}</span>`;
}

/** Banderin calculado a partir de una fecha de vencimiento. */
export function marcaFecha(iso) {
  const c = clasificar(iso);
  return marca(c.clase, c.texto);
}

/* ============================ AVISOS ============================ */

export function aviso(mensaje, tipo = 'exito') {
  const caja = document.getElementById('avisos');
  const nodo = document.createElement('div');
  nodo.className = `aviso aviso--${tipo}`;
  nodo.textContent = mensaje;
  caja.appendChild(nodo);
  setTimeout(() => {
    nodo.style.opacity = '0';
    nodo.style.transition = 'opacity .3s';
    setTimeout(() => nodo.remove(), 300);
  }, 3800);
}

/* ============================ MODAL ============================ */

let cerrarActual = null;

export function abrirModal({ titulo, contenido, acciones = [], ancho = '' }) {
  const capa = document.getElementById('capa-modal');
  capa.innerHTML = `
    <div class="modal ${ancho}">
      <div class="modal__barra">
        <h3>${esc(titulo)}</h3>
        <button class="modal__cerrar" data-cerrar aria-label="Cerrar">${icono('cerrar')}</button>
      </div>
      <div class="modal__cuerpo">${contenido}</div>
      ${acciones.length ? `<div class="modal__pie">${acciones.map((a, i) =>
        `<button class="boton ${a.clase ?? ''}" data-accion="${i}">${esc(a.texto)}</button>`).join('')}</div>` : ''}
    </div>`;
  capa.classList.remove('oculto');

  const cerrar = () => {
    capa.classList.add('oculto');
    capa.innerHTML = '';
    cerrarActual = null;
  };
  cerrarActual = cerrar;

  capa.querySelector('[data-cerrar]').onclick = cerrar;
  capa.onclick = (e) => {
    if (e.target === capa) cerrar();
  };
  acciones.forEach((a, i) => {
    const boton = capa.querySelector(`[data-accion="${i}"]`);
    if (boton) boton.onclick = () => a.alClic?.(capa, cerrar, boton);
  });

  return { capa, cerrar, cuerpo: capa.querySelector('.modal__cuerpo') };
}

export function cerrarModal() {
  cerrarActual?.();
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') cerrarModal();
});

/** Cuadro de confirmacion. */
export function confirmar(mensaje, textoBoton = 'Eliminar') {
  return new Promise((resolve) => {
    abrirModal({
      titulo: 'Confirmar operacion',
      icono: '⚠️',
      ancho: 'modal--angosto',
      contenido: `<p style="margin:0">${esc(mensaje)}</p>`,
      acciones: [
        { texto: 'Cancelar', alClic: (_c, cerrar) => { cerrar(); resolve(false); } },
        { texto: textoBoton, clase: 'boton--peligro', alClic: (_c, cerrar) => { cerrar(); resolve(true); } },
      ],
    });
  });
}

/* ============================ TABLAS ============================ */

/**
 * Genera una tabla.
 * columnas: [{ titulo, campo | render(fila), clase }]
 */
export function tabla(columnas, filas, mensajeVacio = 'No hay registros para mostrar.') {
  if (!filas.length) return `<div class="tabla-caja"><div class="vacio">${esc(mensajeVacio)}</div></div>`;
  const cabeza = columnas.map((c) => `<th class="${c.clase ?? ''}">${esc(c.titulo)}</th>`).join('');
  const cuerpo = filas
    .map(
      (f, i) =>
        `<tr data-fila="${i}">${columnas
          .map((c) => `<td class="${c.clase ?? ''}">${c.render ? c.render(f, i) : esc(f[c.campo])}</td>`)
          .join('')}</tr>`
    )
    .join('');
  return `<div class="tabla-caja"><table class="tabla"><thead><tr>${cabeza}</tr></thead><tbody>${cuerpo}</tbody></table></div>`;
}

/* ============================ FORMULARIOS ============================ */

/**
 * Construye el HTML de un formulario.
 * campos: [{ nombre, etiqueta, tipo, opciones, requerido, ancho, ayuda, paso }]
 * tipos: texto | numero | fecha | correo | select | textarea | foto | contrasena
 */
export function formulario(campos, valores = {}) {
  const control = (c) => {
    const v = valores[c.nombre] ?? c.porDefecto ?? '';
    const req = c.requerido ? 'required' : '';
    switch (c.tipo) {
      case 'select':
        return `<select name="${c.nombre}" ${req}>
          ${c.permiteVacio ? `<option value="">— Seleccione —</option>` : ''}
          ${(c.opciones ?? [])
            .map((o) => {
              const valor = typeof o === 'object' ? o.valor : o;
              const texto = typeof o === 'object' ? o.texto : o;
              return `<option value="${esc(valor)}" ${String(valor) === String(v) ? 'selected' : ''}>${esc(texto)}</option>`;
            })
            .join('')}
        </select>`;
      case 'textarea':
        return `<textarea name="${c.nombre}" ${req}>${esc(v)}</textarea>`;
      case 'numero':
        return `<input type="number" name="${c.nombre}" value="${esc(v)}" step="${c.paso ?? 'any'}" min="${c.min ?? 0}" ${req} />`;
      case 'fecha':
        return `<input type="date" name="${c.nombre}" value="${esc(String(v).slice(0, 10))}" ${req} />`;
      case 'correo':
        return `<input type="email" name="${c.nombre}" value="${esc(v)}" ${req} />`;
      case 'contrasena':
        return `<input type="password" name="${c.nombre}" value="" ${req} autocomplete="new-password" />`;
      case 'foto':
        return `<div class="campo--doble" style="align-items:center">
            <input type="file" name="${c.nombre}_archivo" accept="image/*" data-foto="${c.nombre}" />
            <div class="credencial__foto" data-vista-previa="${c.nombre}">
              ${v ? `<img src="${esc(v)}" alt="foto" />` : icono('personal')}
            </div>
            <input type="hidden" name="${c.nombre}" value="${esc(v)}" />
          </div>`;
      default:
        return `<input type="text" name="${c.nombre}" value="${esc(v)}" ${req} maxlength="${c.max ?? 300}" />`;
    }
  };

  return `<form class="formulario__rejilla" autocomplete="off">
    ${campos
      .map(
        (c) => `<label class="campo ${c.ancho === 'completo' ? 'formulario__ancho' : ''}">
          <span>${esc(c.etiqueta)}${c.requerido ? ' *' : ''}</span>
          ${control(c)}
          ${c.ayuda ? `<small class="texto-tenue">${esc(c.ayuda)}</small>` : ''}
        </label>`
      )
      .join('')}
  </form>`;
}

/** Activa la carga de fotografias (se reduce y convierte a base64). */
export function activarFotos(contenedor) {
  contenedor.querySelectorAll('[data-foto]').forEach((entrada) => {
    entrada.addEventListener('change', () => {
      const archivo = entrada.files?.[0];
      if (!archivo) return;
      const lector = new FileReader();
      lector.onload = () => {
        const img = new Image();
        img.onload = () => {
          const lienzo = document.createElement('canvas');
          const escala = Math.min(1, 320 / Math.max(img.width, img.height));
          lienzo.width = Math.round(img.width * escala);
          lienzo.height = Math.round(img.height * escala);
          lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
          const datos = lienzo.toDataURL('image/jpeg', 0.8);
          const campo = entrada.dataset.foto;
          contenedor.querySelector(`input[name="${campo}"]`).value = datos;
          contenedor.querySelector(`[data-vista-previa="${campo}"]`).innerHTML = `<img src="${datos}" alt="foto" />`;
        };
        img.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  });
}

/** Lee los valores de un formulario generado con formulario(). */
export function leerFormulario(contenedor) {
  const form = contenedor.querySelector('form');
  if (!form.reportValidity()) return null;
  const datos = {};
  for (const [clave, valor] of new FormData(form).entries()) {
    if (clave.endsWith('_archivo')) continue;
    datos[clave] = valor;
  }
  return datos;
}

/* ============================ TABLA: CELDAS ============================ */

/** Celda de clave (folio, codigo, RPE) con subtitulo opcional. */
export function celdaClave(valor, subtitulo) {
  return `<span class="clave-fila">${esc(valor)}</span>${subtitulo ? `<span class="sub">${esc(subtitulo)}</span>` : ''}`;
}
