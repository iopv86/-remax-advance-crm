#!/usr/bin/env bash
# scripts/test-ava.sh
# Prueba el endpoint /api/ava con GPT-4o Chat Completions
#
# Requisitos:
#   1. next dev corriendo en puerto 3000
#   2. .env.local con AVA_WEBHOOK_SECRET, OPENAI_API_KEY, SUPABASE_*
#   3. Un contact_id válido en tu Supabase (ver instrucciones abajo)
#
# Cómo correr:
#   bash scripts/test-ava.sh
# ─────────────────────────────────────────────────────────────────────────────

set -e

BASE_URL="${BASE_URL:-http://localhost:3000}"

# Lee el secret desde .env.local
AVA_SECRET=$(grep -E "^AVA_WEBHOOK_SECRET=" .env.local 2>/dev/null | cut -d= -f2- | tr -d '"'"'" | tr -d '\r')

if [ -z "$AVA_SECRET" ]; then
  echo "❌  AVA_WEBHOOK_SECRET no encontrado en .env.local"
  exit 1
fi

# ── Test 1: Mensaje de texto simple ──────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 1 — Mensaje de texto simple"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# IMPORTANTE: cambia este UUID por un contact_id real de tu Supabase.
# Para obtenerlo: ve a /dashboard/contacts, abre cualquier contacto,
# copia el ID de la URL: /dashboard/contacts/{ESTE-UUID}
CONTACT_ID="${TEST_CONTACT_ID:-00000000-0000-0000-0000-000000000001}"

echo "→ Enviando a: $BASE_URL/api/ava"
echo "→ contact_id: $CONTACT_ID"
echo ""

RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST "$BASE_URL/api/ava" \
  -H "Authorization: Bearer $AVA_SECRET" \
  -H "Content-Type: application/json" \
  -d "{
    \"contact_id\": \"$CONTACT_ID\",
    \"message\": \"Hola, me interesa comprar un apartamento en Piantini. Mi presupuesto es 200,000 USD.\",
    \"contact_name\": \"Carlos Test\",
    \"phone\": \"+18095550101\"
  }")

HTTP_STATUS=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n -1)

if [ "$HTTP_STATUS" = "200" ]; then
  echo "✅  Status: $HTTP_STATUS"
  echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('   Modelo:', d.get('model','-')); print('   Tokens:', d.get('usage',{}).get('total_tokens','-')); print(); print('   Respuesta de Ava:'); print('  ', d.get('response','(vacío)')[:300])" 2>/dev/null || echo "$BODY"
elif [ "$HTTP_STATUS" = "404" ]; then
  echo "⚠️   Status: $HTTP_STATUS — contact_id no encontrado en Supabase"
  echo "    → Cambia TEST_CONTACT_ID por un UUID real de tu base de datos:"
  echo "    → TEST_CONTACT_ID=<uuid-real> bash scripts/test-ava.sh"
  echo "$BODY"
elif [ "$HTTP_STATUS" = "401" ]; then
  echo "❌  Status: $HTTP_STATUS — AVA_WEBHOOK_SECRET incorrecto"
  echo "$BODY"
else
  echo "❌  Status: $HTTP_STATUS"
  echo "$BODY"
fi

# ── Test 2: Mensaje con media_content (transcripción simulada) ────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TEST 2 — Multimedia simulado (transcripción de nota de voz)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

RESPONSE2=$(curl -s -w "\n%{http_code}" \
  -X POST "$BASE_URL/api/ava" \
  -H "Authorization: Bearer $AVA_SECRET" \
  -H "Content-Type: application/json" \
  -d "{
    \"contact_id\": \"$CONTACT_ID\",
    \"message\": \"\",
    \"media_type\": \"audio\",
    \"media_content\": \"Buenas, me llamo María. Estoy buscando una villa en Punta Cana para vivir, presupuesto de un millón y medio de dólares, pago al contado.\"
  }")

HTTP_STATUS2=$(echo "$RESPONSE2" | tail -n1)
BODY2=$(echo "$RESPONSE2" | head -n -1)

if [ "$HTTP_STATUS2" = "200" ]; then
  echo "✅  Status: $HTTP_STATUS2 — Ava procesó transcripción de audio"
  echo "$BODY2" | python3 -c "import sys,json; d=json.load(sys.stdin); print('   Respuesta de Ava:'); print('  ', d.get('response','(vacío)')[:300])" 2>/dev/null || echo "$BODY2"
else
  echo "❌  Status: $HTTP_STATUS2"
  echo "$BODY2"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Tests completados."
echo ""
echo "Si TEST 1 devuelve 404: usa un contact_id real de tu Supabase."
echo "  TEST_CONTACT_ID=<uuid> bash scripts/test-ava.sh"
echo ""
