import { useState } from 'react'
import { api } from '../api'

export default function Login({ onExito }) {
  const [modo, setModo] = useState('login') // login | registro
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  const esRegistro = modo === 'registro'

  const enviar = async (evento) => {
    evento.preventDefault()
    setError('')
    setEnviando(true)
    try {
      const datos = esRegistro
        ? await api.registro({ nombre, email, password })
        : await api.login({ email, password })
      onExito(datos)
    } catch (e) {
      setError(e.message)
    } finally {
      setEnviando(false)
    }
  }

  const cambiarModo = () => {
    setModo(esRegistro ? 'login' : 'registro')
    setError('')
  }

  return (
    <section className="formulario">
      <h2>{esRegistro ? 'Crear cuenta' : 'Iniciar sesión'}</h2>

      <form onSubmit={enviar}>
        {esRegistro && (
          <label>
            Nombre
            <input
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              required
              autoComplete="name"
            />
          </label>
        )}

        <label>
          Correo
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
        </label>

        <label>
          Contraseña
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={esRegistro ? 6 : undefined}
            autoComplete={esRegistro ? 'new-password' : 'current-password'}
          />
          {esRegistro && <small>Mínimo 6 caracteres.</small>}
        </label>

        {error && <p className="error">{error}</p>}

        <button type="submit" disabled={enviando}>
          {enviando ? 'Enviando…' : esRegistro ? 'Registrarme' : 'Entrar'}
        </button>
      </form>

      <p className="cambio-modo">
        {esRegistro ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}{' '}
        <button type="button" className="enlace" onClick={cambiarModo}>
          {esRegistro ? 'Inicia sesión' : 'Regístrate'}
        </button>
      </p>
    </section>
  )
}
