import { useCallback, useEffect, useState } from 'react'
import { api, borrarSesion, cargarSesion, guardarSesion } from './api'
import Carrito from './components/Carrito'
import Catalogo from './components/Catalogo'
import Login from './components/Login'
import Pedidos from './components/Pedidos'
import './App.css'

export default function App() {
  const [sesion, setSesion] = useState(() => cargarSesion())
  const [vista, setVista] = useState('catalogo') // catalogo | carrito | pedidos | login
  const [productos, setProductos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [carrito, setCarrito] = useState([]) // [{ producto, cantidad }]
  const [aviso, setAviso] = useState('')

  const cargarProductos = useCallback(async () => {
    try {
      setError('')
      setProductos(await api.productos())
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargarProductos()
  }, [cargarProductos])

  // Si el token vence, la API avisa y cerramos la sesión
  useEffect(() => {
    const alExpirar = () => {
      setSesion(null)
      setVista('login')
      setAviso('Tu sesión expiró. Inicia sesión de nuevo.')
    }
    window.addEventListener('sesion-expirada', alExpirar)
    return () => window.removeEventListener('sesion-expirada', alExpirar)
  }, [])

  const irA = (nuevaVista) => {
    setVista(nuevaVista)
    setAviso('')
  }

  // ---------- Carrito ----------

  const cantidadEnCarrito = (id) => carrito.find((i) => i.producto.id === id)?.cantidad ?? 0

  const agregar = (producto) => {
    setCarrito((actual) => {
      const existente = actual.find((i) => i.producto.id === producto.id)
      if (existente) {
        if (existente.cantidad >= producto.stock) return actual
        return actual.map((i) =>
          i.producto.id === producto.id ? { ...i, cantidad: i.cantidad + 1 } : i,
        )
      }
      if (producto.stock < 1) return actual
      return [...actual, { producto, cantidad: 1 }]
    })
  }

  const cambiarCantidad = (id, delta) => {
    setCarrito((actual) =>
      actual.map((i) =>
        i.producto.id === id
          ? { ...i, cantidad: Math.min(Math.max(i.cantidad + delta, 1), i.producto.stock) }
          : i,
      ),
    )
  }

  const quitar = (id) => setCarrito((actual) => actual.filter((i) => i.producto.id !== id))

  const totalItems = carrito.reduce((suma, i) => suma + i.cantidad, 0)

  // ---------- Sesión y pedido ----------

  const iniciarSesion = (datos) => {
    guardarSesion(datos)
    setSesion(datos)
    setAviso('')
    setVista(carrito.length > 0 ? 'carrito' : 'catalogo')
  }

  const cerrarSesion = () => {
    borrarSesion()
    setSesion(null)
    irA('catalogo')
  }

  // Lanza error si la API lo rechaza (el componente Carrito lo muestra)
  const hacerPedido = async () => {
    if (!sesion) {
      setAviso('Inicia sesión para completar tu pedido.')
      setVista('login')
      return
    }
    await api.crearPedido(
      carrito.map((i) => ({ producto_id: i.producto.id, cantidad: i.cantidad })),
    )
    setCarrito([])
    await cargarProductos() // el stock cambió
    setAviso('¡Pedido creado con éxito!')
    setVista('pedidos')
  }

  return (
    <div className="app">
      <header className="barra">
        <h1 className="logo" onClick={() => irA('catalogo')}>
          🛒 Tienda
        </h1>
        <nav className="menu">
          <button className={vista === 'catalogo' ? 'activo' : ''} onClick={() => irA('catalogo')}>
            Catálogo
          </button>
          <button className={vista === 'carrito' ? 'activo' : ''} onClick={() => irA('carrito')}>
            Carrito ({totalItems})
          </button>
          {sesion && (
            <button className={vista === 'pedidos' ? 'activo' : ''} onClick={() => irA('pedidos')}>
              Mis pedidos
            </button>
          )}
          {sesion ? (
            <>
              <span className="usuario">Hola, {sesion.usuario.nombre}</span>
              <button className="secundario" onClick={cerrarSesion}>
                Salir
              </button>
            </>
          ) : (
            <button className={vista === 'login' ? 'activo' : ''} onClick={() => irA('login')}>
              Ingresar
            </button>
          )}
        </nav>
      </header>

      <main className="contenido">
        {aviso && (
          <div className="aviso" role="status">
            <span>{aviso}</span>
            <button className="cerrar" onClick={() => setAviso('')} aria-label="Cerrar aviso">
              ×
            </button>
          </div>
        )}

        {vista === 'catalogo' && (
          <Catalogo
            productos={productos}
            cargando={cargando}
            error={error}
            cantidadEnCarrito={cantidadEnCarrito}
            onAgregar={agregar}
            onReintentar={cargarProductos}
          />
        )}
        {vista === 'carrito' && (
          <Carrito
            items={carrito}
            logueado={Boolean(sesion)}
            onCambiar={cambiarCantidad}
            onQuitar={quitar}
            onPedir={hacerPedido}
            onVerCatalogo={() => irA('catalogo')}
          />
        )}
        {vista === 'pedidos' && sesion && <Pedidos />}
        {vista === 'login' && <Login onExito={iniciarSesion} />}
      </main>

      <footer className="pie">
        Frontend en React + Vite · API de microservicios (Node.js, PostgreSQL, Docker)
      </footer>
    </div>
  )
}
