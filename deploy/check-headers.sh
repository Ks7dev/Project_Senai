#!/bin/sh
# Checks the HTTPS setup of the local server (issue #11, RNF06): port 80
# only redirects to 443 and every HTTPS response carries the security
# headers. Run from any device of the network after installing the root
# certificate (deploy/certs/root.crt):
#
#   sh deploy/check-headers.sh 192.168.0.50
#
# Without the certificate installed, pass --insecure as the second
# argument. Exits with 1 when a critical header is missing.
set -u

HOST="${1:-localhost}"
CURL_TLS=""
if [ "${2:-}" = "--insecure" ]; then
  CURL_TLS="--insecure"
elif [ -f "$(dirname "$0")/certs/root.crt" ]; then
  CURL_TLS="--cacert $(dirname "$0")/certs/root.crt"
fi

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

if [ "$failures" -gt 0 ]; then
  echo "$failures alerta(s) crítico(s)."
  exit 1
fi
echo "Nenhum alerta crítico."
