import { useEffect, useState } from 'react'
import { api } from '../api'

const formatearFecha = (iso) =>
  new Date(iso).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })

export default function Pedidos() {
  const [pedidos, setPedidos] = useState(null) // null = cargando
  const [error, setError] = useState('')
  const [abierto, setAbierto] = useState(null) // id del pedido desplegado
  const [detalles, setDetalles] = useState({}) // { [id]: pedido con items }

  useEffect(() => {
    let activo = true
    api
      .misPedidos()
      .then((datos) => {
        if (activo) setPedidos(datos)
      })
      .catch((e) => {
        if (activo) setError(e.message)
      })
    return () => {
      activo = false
    }
  }, [])

  const alternar = async (id) => {
    if (abierto === id) {
      setAbierto(null)
      return
    }
    setAbierto(id)
    if (!detalles[id]) {
      try {
        const detalle = await api.detallePedido(id)
        setDetalles((previo) => ({ ...previo, [id]: detalle }))
      } catch (e) {
        setError(e.message)
      }
    }
  }

  if (error) return <p className="error">{error}</p>
  if (pedidos === null) return <p className="estado">Cargando pedidos…</p>

  return (
    <section>
      <h2>Mis pedidos</h2>

      {pedidos.length === 0 ? (
        <p className="estado">Todavía no tienes pedidos.</p>
      ) : (
        <ul className="lista-pedidos">
          {pedidos.map((p) => (
            <li key={p.id} className="pedido">
              <button className="cabecera-pedido" onClick={() => alternar(p.id)}>
                <span>
                  <strong>Pedido #{p.id}</strong>
                  <small>{formatearFecha(p.creado_en)}</small>
                </span>
                <span className="insignia">{p.estado}</span>
                <strong>S/ {Number(p.total).toFixed(2)}</strong>
              </button>

              {abierto === p.id && (
                <div className="detalle-pedido">
                  {!detalles[p.id] ? (
                    <p className="estado">Cargando detalle…</p>
                  ) : (
                    <table>
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>Cant.</th>
                          <th>Precio</th>
                          <th>Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalles[p.id].items.map((it) => (
                          <tr key={it.producto_id}>
                            <td>{it.producto_nombre}</td>
                            <td>{it.cantidad}</td>
                            <td>S/ {Number(it.precio_unitario).toFixed(2)}</td>
                            <td>S/ {(Number(it.precio_unitario) * it.cantidad).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
