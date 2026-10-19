export default function Catalogo({
  productos,
  cargando,
  error,
  cantidadEnCarrito,
  onAgregar,
  onReintentar,
}) {
  if (cargando) return <p className="estado">Cargando productos…</p>

  if (error) {
    return (
      <div className="caja-error">
        <p>{error}</p>
        <button onClick={onReintentar}>Reintentar</button>
      </div>
    )
  }

  if (productos.length === 0) return <p className="estado">No hay productos disponibles.</p>

  return (
    <section>
      <h2>Catálogo</h2>
      <div className="grilla">
        {productos.map((p) => {
          const enCarrito = cantidadEnCarrito(p.id)
          const agotado = p.stock === 0
          const llegoAlMaximo = !agotado && enCarrito >= p.stock

          return (
            <article className="tarjeta" key={p.id}>
              <h3>{p.nombre}</h3>
              <p className="descripcion">{p.descripcion}</p>
              <p className="precio">S/ {Number(p.precio).toFixed(2)}</p>
              <p className={agotado ? 'stock agotado' : 'stock'}>
                {agotado ? 'Agotado' : `${p.stock} disponibles`}
              </p>
              <button onClick={() => onAgregar(p)} disabled={agotado || llegoAlMaximo}>
                {agotado
                  ? 'Agotado'
                  : llegoAlMaximo
                    ? 'Máximo en el carrito'
                    : 'Agregar al carrito'}
              </button>
            </article>
          )
        })}
      </div>
    </section>
  )
}
