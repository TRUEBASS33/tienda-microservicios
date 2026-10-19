require('express-async-errors');
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'cambia-este-secreto';
const INTERNAL_KEY = process.env.INTERNAL_KEY || 'clave-interna';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
app.use(express.json());

// ---------- Middlewares ----------

// Verifica el token JWT enviado en el header: Authorization: Bearer <token>
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

// Solo permite llamadas de otros microservicios (no pasan por el gateway)
function soloInterno(req, res, next) {
  if (req.headers['x-internal-key'] !== INTERNAL_KEY) {
    return res.status(403).json({ error: 'Acceso interno denegado' });
  }
  next();
}

const emailValido = (e) => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

function firmarToken(u) {
  return jwt.sign({ id: u.id, email: u.email, rol: u.rol }, JWT_SECRET, { expiresIn: '2h' });
}

// ---------- Rutas públicas ----------

app.get('/health', (_req, res) => res.json({ servicio: 'usuarios', estado: 'ok' }));

app.post('/auth/registro', async (req, res) => {
  const { nombre, email, password } = req.body || {};
  if (!nombre || !emailValido(email) || !password || password.length < 6) {
    return res.status(400).json({
      error: 'Envía nombre, un email válido y una contraseña de al menos 6 caracteres',
    });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol)
       VALUES ($1, $2, $3, 'cliente')
       RETURNING id, nombre, email, rol`,
      [nombre, email.toLowerCase(), hash]
    );
    res.status(201).json({ usuario: rows[0], token: firmarToken(rows[0]) });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Ese email ya está registrado' });
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!emailValido(email) || !password) {
    return res.status(400).json({ error: 'Envía email y password' });
  }
  try {
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email.toLowerCase()]);
    const u = rows[0];
    if (!u || !(await bcrypt.compare(password, u.password_hash))) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }
    res.json({
      usuario: { id: u.id, nombre: u.nombre, email: u.email, rol: u.rol },
      token: firmarToken(u),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno' });
  }
});

// ---------- Rutas protegidas ----------

app.get('/usuarios/me', autenticar, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, nombre, email, rol, creado_en FROM usuarios WHERE id = $1',
    [req.usuario.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
  res.json(rows[0]);
});

// ---------- Ruta interna (la usa el servicio de pedidos) ----------

app.get('/internal/usuarios/:id', soloInterno, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, nombre, email, rol FROM usuarios WHERE id = $1',
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
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
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      email VARCHAR(150) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      rol VARCHAR(20) NOT NULL DEFAULT 'cliente',
      creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Crea un administrador inicial a partir de variables de entorno
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = process.env;
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password_hash, rol)
       VALUES ('Administrador', $1, $2, 'admin')
       ON CONFLICT (email) DO NOTHING`,
      [ADMIN_EMAIL.toLowerCase(), hash]
    );
  }
}

async function main() {
  // Reintenta por si la base de datos aún está arrancando
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
  app.listen(PORT, () => console.log(`usuarios-service escuchando en el puerto ${PORT}`));
}

main();
