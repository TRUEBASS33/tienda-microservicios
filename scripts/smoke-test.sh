#!/usr/bin/env bash
# Prueba de humo: recorre el flujo completo a través del gateway.
# Uso:  ./scripts/smoke-test.sh            (por defecto http://localhost:8080)
#       BASE_URL=http://localhost:8080 ADMIN_PASSWORD=xxx ./scripts/smoke-test.sh
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8080}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@tienda.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"
EMAIL="cliente_$(date +%s)@correo.com"

verde() { printf '\033[32m✔ %s\033[0m\n' "$1"; }
falla() { printf '\033[31m✘ %s\033[0m\n' "$1"; exit 1; }

# Extrae un campo de un JSON simple sin depender de jq
campo() { python3 -c "import sys,json; print(json.load(sys.stdin)$1)"; }

codigo() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

echo "Probando contra $BASE_URL"

# 1) Gateway vivo
[ "$(codigo "$BASE_URL/health")" = "200" ] || falla "El gateway no responde"
verde "Gateway responde"

# 2) Catálogo público
[ "$(codigo "$BASE_URL/productos")" = "200" ] || falla "No se pudo listar productos"
verde "Catálogo de productos accesible"

# 3) Registro de un cliente
RESP=$(curl -s -X POST "$BASE_URL/auth/registro" -H 'Content-Type: application/json' \
  -d "{\"nombre\":\"Cliente Demo\",\"email\":\"$EMAIL\",\"password\":\"secreto123\"}")
TOKEN=$(echo "$RESP" | campo "['token']") || falla "Registro falló: $RESP"
verde "Cliente registrado ($EMAIL)"

# 4) Sin token no se puede pedir
[ "$(codigo -X POST "$BASE_URL/pedidos" -H 'Content-Type: application/json' \
  -d '{"items":[{"producto_id":1,"cantidad":1}]}')" = "401" ] || falla "Debió responder 401 sin token"
verde "Pedido sin token rechazado (401)"

# 5) Un cliente NO puede crear productos
[ "$(codigo -X POST "$BASE_URL/productos" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"nombre":"X","precio":1,"stock":1}')" = "403" ] \
  || falla "Un cliente no debería poder crear productos"
verde "Cliente no puede crear productos (403)"

# 6) Login del admin y creación de un producto
ADMIN_TOKEN=$(curl -s -X POST "$BASE_URL/auth/login" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\"}" | campo "['token']") \
  || falla "Login de admin falló (revisa ADMIN_EMAIL / ADMIN_PASSWORD)"
PROD=$(curl -s -X POST "$BASE_URL/productos" -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"nombre":"Producto de prueba","descripcion":"Creado por el smoke test","precio":10.50,"stock":5}')
PROD_ID=$(echo "$PROD" | campo "['id']") || falla "No se pudo crear el producto: $PROD"
verde "Admin creó el producto #$PROD_ID (stock 5)"

# 7) Pedido válido: el servicio de pedidos habla con usuarios y productos
PED=$(curl -s -X POST "$BASE_URL/pedidos" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"items\":[{\"producto_id\":$PROD_ID,\"cantidad\":2}]}")
PED_ID=$(echo "$PED" | campo "['id']") || falla "No se pudo crear el pedido: $PED"
verde "Pedido #$PED_ID creado (total: $(echo "$PED" | campo "['total']"))"

# 8) El stock bajó de 5 a 3
STOCK=$(curl -s "$BASE_URL/productos/$PROD_ID" | campo "['stock']")
[ "$STOCK" = "3" ] || falla "El stock debería ser 3 y es $STOCK"
verde "Stock descontado correctamente (5 → 3)"

# 9) Pedir más de lo disponible falla y NO altera el stock
[ "$(codigo -X POST "$BASE_URL/pedidos" -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"items\":[{\"producto_id\":$PROD_ID,\"cantidad\":99}]}")" = "409" ] \
  || falla "Debió responder 409 por stock insuficiente"
STOCK=$(curl -s "$BASE_URL/productos/$PROD_ID" | campo "['stock']")
[ "$STOCK" = "3" ] || falla "El stock cambió tras un pedido fallido ($STOCK)"
verde "Stock insuficiente rechazado (409) y stock intacto"

# 10) Rutas internas no son accesibles desde fuera
[ "$(codigo -X POST "$BASE_URL/internal/productos/$PROD_ID/descontar")" = "404" ] \
  || falla "Las rutas /internal no deberían estar expuestas"
verde "Rutas internas protegidas por el gateway"

echo
verde "Todas las pruebas pasaron 🎉"
