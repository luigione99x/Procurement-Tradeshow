#!/usr/bin/env bash
# Prova di rendering: build di produzione, avvio su Postgres locale (PGlite), poi apre ogni
# pagina da admin e da cliente e fallisce se una pagina va in errore lato server.
# Uso: bash scripts/smoke-pages.sh   (nessuna rete necessaria)
set -uo pipefail
cd "$(dirname "$0")/.."
WORK=$(mktemp -d); PORT=$((3200 + RANDOM % 500)); U="http://localhost:$PORT"; FAIL=0
export AUTH_SECRET=smoke-secret-lungo-almeno-32-caratteri-xxxxxxxx DATABASE_URL="pglite:$WORK/db"
OUT=$(npx tsx scripts/dev-db.ts "$WORK/db" admin@smoke.test admin-password-smoke) || { echo "dev-db fallito"; exit 1; }
CLI_EMAIL=$(node -e "console.log(JSON.parse(process.argv[1]).demo.email)" "$OUT")
CLI_PW=$(node -e "console.log(JSON.parse(process.argv[1]).demo.password)" "$OUT")
FAIR=$(node -e "console.log(JSON.parse(process.argv[1]).demoFairId)" "$OUT")
CONV=$(node -e "console.log(JSON.parse(process.argv[1]).conversationId)" "$OUT")
[ -d .next ] && [ "${SKIP_BUILD:-}" = "1" ] || npx next build > "$WORK/build.log" 2>&1 || { tail -30 "$WORK/build.log"; exit 1; }
./node_modules/.bin/next start -p $PORT > "$WORK/server.log" 2>&1 & SRV=$!
trap 'kill $SRV 2>/dev/null; rm -rf "$WORK"' EXIT
for i in $(seq 1 60); do curl -s -o /dev/null "$U/login" && break; sleep 0.5; done

login(){ curl -s -c "$WORK/$1" -b "$WORK/$1" -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -H "Origin: $U" -d "{\"email\":\"$2\",\"password\":\"$3\"}" "$U/api/auth/login"; }
page(){ # jar path atteso
  local body code; body=$(curl -s -b "$WORK/$1" -w '\n%{http_code}' "$U$2"); code=$(tail -n1 <<<"$body")
  if [ "$code" != "$3" ] || grep -q "Application error" <<<"$body"; then echo "✗ $1 $2 → $code (atteso $3)"; FAIL=1; else echo "✓ $1 $2 → $code"; fi; }

echo "login admin: $(login adm admin@smoke.test admin-password-smoke)"
curl -s -b "$WORK/adm" -o /dev/null -X POST -H 'Content-Type: application/json' -H "Origin: $U" \
  -d '{"organizationId":"'"$(curl -s -b "$WORK/adm" "$U/api/admin/organizations" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).organizations.find(o=>o.kind==='client').id))")"'","name":"Fiera creata da smoke","budgetCents":1500000}' "$U/api/fairs"
page adm /login 200; page adm /fairs 200; page adm /admin 200; page adm /admin/suppliers 200; page adm "/fairs/$FAIR" 200; page adm "/fairs/$FAIR/conversations/$CONV" 200; page adm /fairs/00000000-0000-0000-0000-000000000000 404
echo "login cliente: $(login cli "$CLI_EMAIL" "$CLI_PW")"
page cli /fairs 200; page cli "/fairs/$FAIR" 200; page cli "/fairs/$FAIR/conversations/$CONV" 200; page cli /admin 404; page cli /admin/suppliers 404
page anon /fairs 307
if grep -qi "error" "$WORK/server.log"; then echo "--- errori nel log del server ---"; grep -i -A3 "error" "$WORK/server.log" | head -40; FAIL=1; fi
[ $FAIL = 0 ] && echo "SMOKE OK" || { echo "SMOKE FALLITO"; exit 1; }
