require('express-async-errors');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3003;
const JWT_SECRET = process.env.JWT_SECRET || 'cambia-este-secreto';
const INTERNAL_KEY = process.env.INTERNAL_KEY || 'clave-interna';
const USUARIOS_URL = process.env.USUARIOS_URL || 'http://usuarios-service:3001';
const PRODUCTOS_URL = process.env.PRODUCTOS_URL || 'http://productos-service:3002';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
app.use(express.json());

// ---------- Utilidades ----------

function autenticar(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

// Llama a otro microservicio (comunicación HTTP síncrona entre servicios)
async function llamarServicio(url, { method = 'GET', body } = {}) {
  const resp = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-internal-key': INTERNAL_KEY },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000), // si el otro servicio no responde en 5 s, falla
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, data };
}

// ---------- Rutas ----------

app.get('/health', (_req, res) => res.json({ servicio: 'pedidos', estado: 'ok' }));

/**
 * Crear un pedido.
 * Body: { "items": [ { "producto_id": 1, "cantidad": 2 }, ... ] }
 *
 * Flujo:
 *  1. Consulta al servicio de usuarios para confirmar que el usuario existe.
 *  2. Por cada item, pide al servicio de productos que descuente el stock.
 *  3. Si algún item falla, repone el stock ya descontado (compensación, patrón "saga").
 *  4. Guarda el pedido con el precio vigente de cada producto.
 */
app.post('/pedidos', autenticar, async (req, res) => {
  const items = req.body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Envía al menos un item: { items: [{ producto_id, cantidad }] }' });
  }
  for (const it of items) {
    if (!Number.isInteger(it?.producto_id) || !Number.isInteger(it?.cantidad) || it.cantidad <= 0) {
      return res.status(400).json({ error: 'Cada item necesita producto_id y cantidad enteros (cantidad > 0)' });
    }
  }

  // 1) Validar usuario en el servicio de usuarios
  let usuario;
  try {
    const r = await llamarServicio(`${USUARIOS_URL}/internal/usuarios/${req.usuario.id}`);
    if (!r.ok) return res.status(401).json({ error: 'El usuario del token ya no existe' });
    usuario = r.data;
  } catch {
    return res.status(503).json({ error: 'Servicio de usuarios no disponible' });
  }

  // 2) Descontar stock producto por producto
  const descontados = []; // para poder deshacer si algo falla
  try {
    for (const it of items) {
      const r = await llamarServicio(`${PRODUCTOS_URL}/internal/productos/${it.producto_id}/descontar`, {
        method: 'POST',
        body: { cantidad: it.cantidad },
      });
      if (!r.ok) {
        await revertir(descontados);
        return res.status(r.status === 404 || r.status === 409 ? r.status : 502).json({
          error: r.data.error || 'No se pudo procesar el pedido',
          producto_id: it.producto_id,
          ...(r.data.stock_disponible !== undefined && { stock_disponible: r.data.stock_disponible }),
        });
      }
      descontados.push({
        producto_id: it.producto_id,
        cantidad: it.cantidad,
        nombre: r.data.nombre,
        precio: Number(r.data.precio),
      });
    }
  } catch {
    await revertir(descontados);
    return res.status(503).json({ error: 'Servicio de productos no disponible. No se creó el pedido.' });
  }

  // 3) Guardar el pedido en una transacción
  const total = descontados.reduce((s, d) => s + d.precio * d.cantidad, 0);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ped = await client.query(
      `INSERT INTO pedidos (usuario_id, usuario_nombre, total)
       VALUES ($1, $2, $3) RETURNING *`,
      [usuario.id, usuario.nombre, total.toFixed(2)]
    );
    for (const d of descontados) {
      await client.query(
        `INSERT INTO pedido_items (pedido_id, producto_id, producto_nombre, precio_unitario, cantidad)
         VALUES ($1, $2, $3, $4, $5)`,
        [ped.rows[0].id, d.producto_id, d.nombre, d.precio, d.cantidad]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({ ...ped.rows[0], items: descontados });
  } catch (err) {
    await client.query('ROLLBACK');
    await revertir(descontados); // si no se pudo guardar, devolvemos el stock
    console.error(err);
    res.status(500).json({ error: 'No se pudo guardar el pedido' });
  } finally {
    client.release();
  }
});

async function revertir(descontados) {
  for (const d of descontados) {
    try {
      await llamarServicio(`${PRODUCTOS_URL}/internal/productos/${d.producto_id}/reponer`, {
        method: 'POST',
        body: { cantidad: d.cantidad },
      });
    } catch (err) {
      console.error(`No se pudo reponer el producto ${d.producto_id}:`, err.message);
    }
  }
}

// Un cliente ve sus pedidos; un admin ve todos
app.get('/pedidos', autenticar, async (req, res) => {
  const esAdmin = req.usuario.rol === 'admin';
  const { rows } = await pool.query(
    `SELECT * FROM pedidos ${esAdmin ? '' : 'WHERE usuario_id = $1'} ORDER BY id DESC`,
    esAdmin ? [] : [req.usuario.id]
  );
  res.json(rows);
});

app.get('/pedidos/:id', autenticar, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM pedidos WHERE id = $1', [req.params.id]);
  const pedido = rows[0];
  if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (req.usuario.rol !== 'admin' && pedido.usuario_id !== req.usuario.id) {
    return res.status(403).json({ error: 'Ese pedido no es tuyo' });
  }
  const items = await pool.query(
    'SELECT producto_id, producto_nombre, precio_unitario, cantidad FROM pedido_items WHERE pedido_id = $1',
    [pedido.id]
  );
  res.json({ ...pedido, items: items.rows });
});

// Manejo de errores no controlados en rutas async
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
});

// ---------- Arranque ----------

async function iniciarDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pedidos (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL,
      usuario_nombre VARCHAR(100) NOT NULL,
      total NUMERIC(12,2) NOT NULL,
      estado VARCHAR(20) NOT NULL DEFAULT 'creado',
      creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS pedido_items (
      id SERIAL PRIMARY KEY,
      pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
      producto_id INTEGER NOT NULL,
      producto_nombre VARCHAR(150) NOT NULL,
      precio_unitario NUMERIC(10,2) NOT NULL,
      cantidad INTEGER NOT NULL CHECK (cantidad > 0)
    );
  `);
}

async function main() {
  for (let intento = 1; intento <= 10; intento++) {
    try {
      await iniciarDB();
      break;
    } catch (err) {
      console.log(`Esperando a la base de datos (${intento}/10): ${err.message}`);
      if (intento === 10) process.exit(1);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  app.listen(PORT, () => console.log(`pedidos-service escuchando en el puerto ${PORT}`));
}

main();
