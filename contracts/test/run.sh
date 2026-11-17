#!/usr/bin/env bash
# Real contract tests against an isolated HA. Never uses a household URL/token.
set -euo pipefail
cd "$(dirname "$0")"

image=ghcr.io/home-assistant/home-assistant:2026.9.3
name="lunactl-contract-test-$$"
port="${HA_TEST_PORT:-18123}"
url="http://127.0.0.1:${port}"
client_id="${url}/"
read -ra podman_cmd <<< "${PODMAN:-podman}"
container() { "${podman_cmd[@]}" "$@"; }
cleanup() { container rm -f --time 30 "$name" >/dev/null; }
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

container create --name "$name" -p "127.0.0.1:${port}:8123" "$image" >/dev/null
container cp config/configuration.yaml "$name:/config/configuration.yaml"
container cp config/custom_components "$name:/config/custom_components"
container cp ../../custom_components/lunactl "$name:/config/custom_components/lunactl"
container start "$name" >/dev/null

wait_for() {
  for _ in $(seq 120); do
    if "$@"; then return; fi
    sleep 1
  done
  container logs "$name"
  echo 'Home Assistant did not become ready' >&2
  exit 1
}
onboarding_ready() { curl -sf --max-time 5 "$url/api/onboarding" >/dev/null; }
wait_for onboarding_ready

# Disposable, locally-created test user only. Parse JSON rather than guessing
# field order/spacing in HA's responses. Never print the resulting token.
auth_code=$(curl -sf --max-time 30 -X POST "$url/api/onboarding/users" -H 'Content-Type: application/json' \
  -d "{\"client_id\":\"${client_id}\",\"name\":\"test\",\"username\":\"test\",\"password\":\"test-password\",\"language\":\"en\"}" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["auth_code"])')
HA_TOKEN=$(curl -sf --max-time 30 -X POST "$url/auth/token" \
  -d grant_type=authorization_code -d "code=$auth_code" -d "client_id=$client_id" \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')
core_ready() {
  curl -sf --max-time 5 -H "Authorization: Bearer $HA_TOKEN" "$url/api/core/state" \
    | python3 -c 'import json,sys; sys.exit(json.load(sys.stdin)["state"] != "RUNNING")'
}
wait_for core_ready
HA_URL="$url" HA_TOKEN="$HA_TOKEN" go test -count=1 -v . "$@"
HA_URL="$url" HA_TOKEN="$HA_TOKEN" ../../.build/ha-venv/bin/python integration_contract.py
