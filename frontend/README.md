# Frontend de la tienda (React + Vite)

Interfaz web para la [API de microservicios](../README.md): catálogo, registro/login, carrito y pedidos.

## Funcionalidades

- **Catálogo** con stock en vivo; no deja agregar más unidades de las disponibles.
- **Registro e inicio de sesión** con JWT guardado en `localStorage`.
- **Carrito** con cambio de cantidades y total.
- **Pedidos**: crea un pedido (el backend descuenta el stock) y consulta tu historial con el detalle de cada uno.
- Manejo de errores de la API (stock insuficiente, sesión vencida, API caída).
- Diseño responsive, sin librerías de UI ni de rutas: solo React.

## Cómo ejecutarlo

Primero levanta el backend desde la carpeta raíz del proyecto:

```bash
docker compose up --build
```

Luego, en otra terminal:

```bash
cd frontend
npm install
npm run dev
```

Abre http://localhost:5173

En desarrollo, Vite reenvía las llamadas `/api/*` al gateway (`http://localhost:8080`), así que no hay problemas de CORS. La configuración está en `vite.config.js`.

## Estructura

```
src/
├── api.js                 # cliente de la API y manejo de sesión
├── App.jsx                # estado global (sesión, carrito) y navegación
├── App.css / index.css    # estilos
└── components/
    ├── Catalogo.jsx
    ├── Carrito.jsx
    ├── Pedidos.jsx
    └── Login.jsx          # login y registro
```

## Despliegue

El frontend se puede publicar en Vercel o Netlify (`npm run build` genera la carpeta `dist`). Para que funcione en línea, el backend también debe estar desplegado en un servidor público; entonces define la variable `VITE_API_URL` con la dirección de la API y agrega los headers CORS al gateway.
