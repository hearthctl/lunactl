#!/usr/bin/env bash
# Starts a disposable Home Assistant with the lunactl package, runs the tests
# and tears the container down again. Never touches production HA.
set -euo pipefail

cd "$(dirname "$0")"
image=ghcr.io/home-assistant/home-assistant:2026.9.3
name=lunactl-ha-test
port=18123
url="http://127.0.0.1:${port}"
client_id="${url}/"

podman rm -f "${name}" >/dev/null 2>&1 || true
trap 'podman rm -f "${name}" >/dev/null' EXIT

podman create --name "${name}" -p "127.0.0.1:${port}:8123" "${image}" >/dev/null
podman cp config/configuration.yaml "${name}:/config/configuration.yaml"
podman cp ../packages "${name}:/config/packages"
podman start "${name}" >/dev/null

echo "waiting for Home Assistant at ${url}"
for _ in $(seq 120); do
  curl -sf "${url}/api/onboarding" >/dev/null && break
  sleep 1
done

auth_code=$(curl -sf -X POST "${url}/api/onboarding/users" -H 'Content-Type: application/json' \
  -d "{\"client_id\":\"${client_id}\",\"name\":\"test\",\"username\":\"test\",\"password\":\"test-password\",\"language\":\"en\"}" \
  | sed -E 's/.*"auth_code": ?"([^"]+)".*/\1/')
HA_TOKEN=$(curl -sf -X POST "${url}/auth/token" \
  -d grant_type=authorization_code -d "code=${auth_code}" -d "client_id=${client_id}" \
  | sed -E 's/.*"access_token": ?"([^"]+)".*/\1/')

for _ in $(seq 120); do
  curl -sf -H "Authorization: Bearer ${HA_TOKEN}" "${url}/api/core/state" | grep -q RUNNING && break
  sleep 1
done

HA_URL="${url}" HA_TOKEN="${HA_TOKEN}" go test -count=1 -v . "$@"
