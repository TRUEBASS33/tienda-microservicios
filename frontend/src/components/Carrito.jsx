import { useState } from 'react'

export default function Carrito({ items, logueado, onCambiar, onQuitar, onPedir, onVerCatalogo }) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState('')

  const total = items.reduce((suma, i) => suma + Number(i.producto.precio) * i.cantidad, 0)

  const pedir = async () => {
    setEnviando(true)
    setError('')
    try {
      await onPedir()
    } catch (e) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  if (items.length === 0) {
    return (
      <section>
        <h2>Tu carrito</h2>
        <p className="estado">Tu carrito está vacío.</p>
        <p className="centrado">
          <button onClick={onVerCatalogo}>Ver catálogo</button>
        </p>
      </section>
    )
  }

  return (
    <section>
      <h2>Tu carrito</h2>

      <ul className="lista-carrito">
        {items.map(({ producto, cantidad }) => (
          <li key={producto.id} className="fila-carrito">
            <div className="datos-producto">
              <strong>{producto.nombre}</strong>
              <span className="precio-unitario">S/ {Number(producto.precio).toFixed(2)} c/u</span>
            </div>

            <div className="cantidad">
              <button
                className="secundario"
                onClick={() => onCambiar(producto.id, -1)}
                disabled={cantidad <= 1}
                aria-label={`Quitar una unidad de ${producto.nombre}`}
              >
                −
              </button>
              <span>{cantidad}</span>
              <button
                className="secundario"
                onClick={() => onCambiar(producto.id, 1)}
                disabled={cantidad >= producto.stock}
                aria-label={`Agregar una unidad de ${producto.nombre}`}
              >
                +
              </button>
            </div>

            <span className="subtotal">S/ {(Number(producto.precio) * cantidad).toFixed(2)}</span>

            <button
              className="peligro"
              onClick={() => onQuitar(producto.id)}
              aria-label={`Quitar ${producto.nombre} del carrito`}
            >
              Quitar
            </button>
          </li>
        ))}
      </ul>

      <div className="resumen">
        <p className="total">
          Total: <strong>S/ {total.toFixed(2)}</strong>
        </p>
        {error && <p className="error">{error}</p>}
        {!logueado && <p className="nota">Necesitas iniciar sesión para completar el pedido.</p>}
        <button onClick={pedir} disabled={enviando}>
          {enviando ? 'Procesando…' : logueado ? 'Realizar pedido' : 'Ingresar para pedir'}
        </button>
      </div>
    </section>
  )
}
