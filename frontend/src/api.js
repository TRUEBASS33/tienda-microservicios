// Cliente de la API. Todas las llamadas pasan por el gateway (Nginx).
// En desarrollo, Vite reenvía /api -> http://localhost:8080 (ver vite.config.js).
// Si despliegas el backend en otro lado, define VITE_API_URL (ej. https://mi-api.com).
const BASE = import.meta.env.VITE_API_URL ?? '/api'

const CLAVE_SESION = 'sesion'

// ---------- Sesión (usuario + token) guardada en localStorage ----------

export function cargarSesion() {
  try {
    const sesion = JSON.parse(localStorage.getItem(CLAVE_SESION))
    return sesion?.token ? sesion : null
  } catch {
    return null
  }
}

export function guardarSesion(sesion) {
  try {
    localStorage.setItem(CLAVE_SESION, JSON.stringify(sesion))
  } catch {
    // Sin almacenamiento disponible: la sesión dura hasta recargar la página
  }
}

export function borrarSesion() {
  try {
    localStorage.removeItem(CLAVE_SESION)
  } catch {
    // Nada que borrar
  }
}

// ---------- Petición genérica ----------

async function peticion(ruta, { method = 'GET', body, auth = false } = {}) {
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (auth) {
    const token = cargarSesion()?.token
    if (token) headers.Authorization = `Bearer ${token}`
  }

  let respuesta
  try {
    respuesta = await fetch(`${BASE}${ruta}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new Error('No se pudo conectar con la API. ¿Está corriendo docker compose?')
  }

  const datos = await respuesta.json().catch(() => ({}))

  if (!respuesta.ok) {
    // Token vencido o inválido: avisamos a la app para que cierre la sesión
    if (auth && respuesta.status === 401) {
      borrarSesion()
      window.dispatchEvent(new Event('sesion-expirada'))
    }
    const error = new Error(datos.error || `Error ${respuesta.status}`)
    error.status = respuesta.status
    throw error
  }

  return datos
}

// ---------- Endpoints ----------

export const api = {
  productos: () => peticion('/productos'),
  registro: (datos) => peticion('/auth/registro', { method: 'POST', body: datos }),
  login: (datos) => peticion('/auth/login', { method: 'POST', body: datos }),
  crearPedido: (items) => peticion('/pedidos', { method: 'POST', body: { items }, auth: true }),
  misPedidos: () => peticion('/pedidos', { auth: true }),
  detallePedido: (id) => peticion(`/pedidos/${id}`, { auth: true }),
}
