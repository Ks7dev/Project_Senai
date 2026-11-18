#!/bin/sh
# Checks the HTTPS setup of the server (issue #11, RNF06): port 80 only
# redirects to 443 and every HTTPS response carries the security headers.
#
# Local server: run from any device of the network after installing the
# root certificate. When deploy/certs/root.crt exists, it is used as the
# CA by default:
#
#   sh deploy/check-headers.sh 192.168.0.50
#
# Public VPS (Let's Encrypt): pass --system-ca to trust the system CAs
# instead of the local root certificate (the same happens with
# CHECK_HEADERS_CA=system in the environment):
#
#   sh deploy/check-headers.sh loja.exemplo.com.br --system-ca
#
# Without the certificate installed, pass --insecure as the second
# argument. Exits with 1 when a critical header is missing.
set -u

HOST="${1:-localhost}"
TLS_MODE="${2:-}"
if [ -z "$TLS_MODE" ] && [ "${CHECK_HEADERS_CA:-}" = "system" ]; then
  TLS_MODE="--system-ca"
fi
CURL_TLS=""
case "$TLS_MODE" in
  --insecure) CURL_TLS="--insecure" ;;
  --system-ca) CURL_TLS="" ;;
  "")
    if [ -f "$(dirname "$0")/certs/root.crt" ]; then
      CURL_TLS="--cacert $(dirname "$0")/certs/root.crt"
    fi
    ;;
  *)
    echo "usage: sh deploy/check-headers.sh <host> [--system-ca | --insecure]" >&2
    exit 2
    ;;
esac

failures=0

fail() {
  echo "FALHA: $1"
  failures=$((failures + 1))
}

ok() {
  echo "OK: $1"
}

# 1. HTTP never serves content: it answers with a redirect to HTTPS
http_headers=$(curl -s -o /dev/null -D - --max-time 10 "http://$HOST/" || true)
http_status=$(printf '%s' "$http_headers" | head -n 1 | awk '{print $2}')
location=$(printf '%s' "$http_headers" | grep -i '^location:' | tr -d '\r')
case "$http_status" in
  301 | 308)
    case "$location" in
      *https://*) ok "HTTP redireciona para HTTPS ($http_status)" ;;
      *) fail "HTTP redireciona, mas não para HTTPS: $location" ;;
    esac
    ;;
  "") ok "HTTP recusado (sem resposta na porta 80)" ;;
  *) fail "HTTP respondeu $http_status em vez de redirecionar para HTTPS" ;;
esac

# 2. HTTPS responses carry the security headers
# shellcheck disable=SC2086
https_headers=$(curl -s -o /dev/null -D - --max-time 10 $CURL_TLS \
  "https://$HOST/" || true)
if [ -z "$https_headers" ]; then
  fail "HTTPS sem resposta (certificado raiz instalado?)"
else
  for header in \
    "Strict-Transport-Security" \
    "Content-Security-Policy" \
    "X-Content-Type-Options" \
    "X-Frame-Options" \
    "Referrer-Policy" \
    "Permissions-Policy"; do
    if printf '%s' "$https_headers" | grep -qi "^$header:"; then
      ok "$header presente"
    else
      fail "$header ausente"
    fi
  done
  for header in "Server" "X-Powered-By"; do
    if printf '%s' "$https_headers" | grep -qi "^$header:"; then
      fail "$header expõe a tecnologia do servidor"
    else
      ok "$header oculto"
    fi
  done
fi

# 3. The payment page CSP uses a per request nonce, never
# 'unsafe-inline' in script-src (#173). The full comparison with the
# approved baseline is done by scripts/check-payment-page.ts.
# shellcheck disable=SC2086
payment_csp=$(curl -s -o /dev/null -D - --max-time 10 $CURL_TLS \
  "https://$HOST/conta/pedidos/verificacao/pagamento" |
  grep -i '^content-security-policy:' | tr -d '\r' || true)
payment_script_src=$(printf '%s' "$payment_csp" | tr ';' '\n' |
  grep -i 'script-src' || true)
if [ -z "$payment_csp" ]; then
  fail "Content-Security-Policy ausente na página de pagamento"
elif printf '%s' "$payment_script_src" | grep -q "'unsafe-inline'"; then
  fail "script-src da página de pagamento com 'unsafe-inline'"
elif printf '%s' "$payment_script_src" | grep -q "'nonce-"; then
  ok "script-src da página de pagamento com nonce"
else
  fail "script-src da página de pagamento sem nonce"
fi

if [ "$failures" -gt 0 ]; then
  echo "$failures alerta(s) crítico(s)."
  exit 1
fi
echo "Nenhum alerta crítico."
