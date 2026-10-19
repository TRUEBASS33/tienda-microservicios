require('express-async-errors');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'cambia-este-secreto';
const INTERNAL_KEY = process.env.INTERNAL_KEY || 'clave-interna';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
app.use(express.json());

// ---------- Middlewares ----------

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

function soloAdmin(req, res, next) {
  if (req.usuario?.rol !== 'admin') {
    return res.status(403).json({ error: 'Solo un administrador puede hacer esto' });
  }
  next();
}

function soloInterno(req, res, next) {
  if (req.headers['x-internal-key'] !== INTERNAL_KEY) {
    return res.status(403).json({ error: 'Acceso interno denegado' });
  }
  next();
}

function validarProducto({ nombre, precio, stock }, parcial = false) {
  if (!parcial || nombre !== undefined) {
    if (typeof nombre !== 'string' || !nombre.trim()) return 'El nombre es obligatorio';
  }
  if (!parcial || precio !== undefined) {
    if (typeof precio !== 'number' || precio < 0) return 'El precio debe ser un número mayor o igual a 0';
  }
  if (!parcial || stock !== undefined) {
    if (!Number.isInteger(stock) || stock < 0) return 'El stock debe ser un entero mayor o igual a 0';
  }
  return null;
}

// ---------- Rutas públicas ----------

app.get('/health', (_req, res) => res.json({ servicio: 'productos', estado: 'ok' }));

app.get('/productos', async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM productos ORDER BY id');
  res.json(rows);
});

app.get('/productos/:id', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM productos WHERE id = $1', [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(rows[0]);
});

// ---------- Rutas de administrador ----------

app.post('/productos', autenticar, soloAdmin, async (req, res) => {
  const error = validarProducto(req.body || {});
  if (error) return res.status(400).json({ error });
  const { nombre, descripcion = '', precio, stock } = req.body;
  const { rows } = await pool.query(
    `INSERT INTO productos (nombre, descripcion, precio, stock)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [nombre.trim(), descripcion, precio, stock]
  );
  res.status(201).json(rows[0]);
});

app.put('/productos/:id', autenticar, soloAdmin, async (req, res) => {
  const error = validarProducto(req.body || {}, true);
  if (error) return res.status(400).json({ error });
  const { nombre, descripcion, precio, stock } = req.body;
  const { rows } = await pool.query(
    `UPDATE productos SET
       nombre = COALESCE($1, nombre),
       descripcion = COALESCE($2, descripcion),
       precio = COALESCE($3, precio),
       stock = COALESCE($4, stock)
     WHERE id = $5 RETURNING *`,
    [nombre ?? null, descripcion ?? null, precio ?? null, stock ?? null, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(rows[0]);
});

app.delete('/productos/:id', autenticar, soloAdmin, async (req, res) => {
  const { rowCount } = await pool.query('DELETE FROM productos WHERE id = $1', [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Producto no encontrado' });
  res.status(204).end();
});

// ---------- Rutas internas (las usa el servicio de pedidos) ----------

// Descuenta stock de forma atómica: solo si hay suficiente
app.post('/internal/productos/:id/descontar', soloInterno, async (req, res) => {
  const cantidad = Number(req.body?.cantidad);
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    return res.status(400).json({ error: 'Cantidad inválida' });
  }
  const { rows } = await pool.query(
    `UPDATE productos SET stock = stock - $1
     WHERE id = $2 AND stock >= $1 RETURNING *`,
    [cantidad, req.params.id]
  );
  if (rows[0]) return res.json(rows[0]);

  // No se actualizó nada: ¿no existe o no alcanza el stock?
  const existe = await pool.query('SELECT id, nombre, stock FROM productos WHERE id = $1', [req.params.id]);
  if (!existe.rows[0]) return res.status(404).json({ error: 'Producto no encontrado' });
  res.status(409).json({
    error: `Stock insuficiente para "${existe.rows[0].nombre}"`,
    stock_disponible: existe.rows[0].stock,
  });
});

// Devuelve stock (compensación cuando un pedido falla a medias)
app.post('/internal/productos/:id/reponer', soloInterno, async (req, res) => {
  const cantidad = Number(req.body?.cantidad);
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    return res.status(400).json({ error: 'Cantidad inválida' });
  }
  const { rows } = await pool.query(
    'UPDATE productos SET stock = stock + $1 WHERE id = $2 RETURNING *',
    [cantidad, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Producto no encontrado' });
  res.json(rows[0]);
});

// Manejo de errores no controlados en rutas async
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
});

// ---------- Arranque ----------

async function iniciarDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS productos (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(150) NOT NULL,
      descripcion TEXT NOT NULL DEFAULT '',
      precio NUMERIC(10,2) NOT NULL CHECK (precio >= 0),
      stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
      creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Datos de ejemplo la primera vez
  const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM productos');
  if (rows[0].total === 0) {
    await pool.query(`
      INSERT INTO productos (nombre, descripcion, precio, stock) VALUES
        ('Teclado mecánico', 'Teclado mecánico retroiluminado', 189.90, 25),
        ('Mouse inalámbrico', 'Mouse ergonómico 2.4 GHz', 59.50, 40),
        ('Monitor 24 pulgadas', 'Monitor Full HD IPS', 649.00, 10),
        ('Audífonos con micrófono', 'Ideales para clases virtuales', 99.00, 30)
    `);
  }
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
  app.listen(PORT, () => console.log(`productos-service escuchando en el puerto ${PORT}`));
}

main();
