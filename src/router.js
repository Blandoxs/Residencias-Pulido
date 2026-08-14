/**
 * Enrutador minimo para la API (sin dependencias externas).
 * Soporta parametros dinamicos del tipo /api/gafetes/:id
 */
export class Router {
  constructor() {
    this.rutas = [];
  }

  agregar(metodo, patron, manejador, rol = null) {
    const nombres = [];
    const expresion = new RegExp(
      `^${patron
        .split('/')
        .map((seg) => {
          if (seg.startsWith(':')) {
            nombres.push(seg.slice(1));
            return '([^/]+)';
          }
          return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        })
        .join('/')}$`
    );
    this.rutas.push({ metodo, expresion, nombres, manejador, rol });
    return this;
  }

  get(p, h, rol) {
    return this.agregar('GET', p, h, rol);
  }
  post(p, h, rol) {
    return this.agregar('POST', p, h, rol);
  }
  put(p, h, rol) {
    return this.agregar('PUT', p, h, rol);
  }
  delete(p, h, rol) {
    return this.agregar('DELETE', p, h, rol);
  }

  buscar(metodo, ruta) {
    for (const r of this.rutas) {
      const m = ruta.match(r.expresion);
      if (!m) continue;
      if (r.metodo !== metodo) continue;
      const params = {};
      r.nombres.forEach((n, i) => (params[n] = decodeURIComponent(m[i + 1])));
      return { ...r, params };
    }
    return null;
  }
}
