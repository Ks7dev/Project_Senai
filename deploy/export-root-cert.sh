#!/bin/sh
# Copies Caddy's local root certificate to deploy/certs/root.crt so it
# can be installed on the devices of the network (issue #11).
# Run after the first `docker compose up -d`.
set -eu

mkdir -p "$(dirname "$0")/certs"
docker compose cp proxy:/data/caddy/pki/authorities/local/root.crt \
  "$(dirname "$0")/certs/root.crt"
echo "Certificado salvo em deploy/certs/root.crt"
