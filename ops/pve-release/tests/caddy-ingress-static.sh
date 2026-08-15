#!/usr/bin/env bash
set -Eeuo pipefail

repo_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../../.." && pwd -P)
deploy=${repo_root}/ops/pve-release/deploy-nest-release.sh
installer=${repo_root}/ops/pve-release/install-datastores.sh
readme=${repo_root}/ops/pve-release/README.md
unit_dir=${repo_root}/ops/pve-release/systemd
socket_unit=${unit_dir}/npr-seminar-caddy-upstream.socket
service_unit=${unit_dir}/npr-seminar-caddy-upstream.service
gateway_dir=${repo_root}/ops/gcp-gateway
gateway_caddyfile=${gateway_dir}/caddy/Caddyfile
gateway_gcp_wireguard=${gateway_dir}/wireguard/gcp-wg0.conf
gateway_pve_wireguard=${gateway_dir}/wireguard/pve-release-wg0.conf
public_base_url=https://survey.example.kr
gcp_public_ip=203.0.113.10

bash -n "${deploy}"
bash -n "${installer}"

grep -Fq "readonly default_public_base_url=${public_base_url}" "${deploy}"
grep -Fq "PUBLIC_BASE_URL=${public_base_url}" "${installer}"
grep -Fq 'must set PUBLIC_BASE_URL exactly to ${default_public_base_url}' "${deploy}"
grep -Fq 'verify_loopback_ports 3000 4000 5432 6379' "${deploy}"
grep -Fq 'verify_exact_listener "${caddy_upstream_listener}"' "${deploy}"
[[ $(grep -Fc '  npr-seminar-caddy-upstream.socket' "${deploy}") -eq 1 ]]
[[ $(grep -Fc '  npr-seminar-caddy-upstream.service' "${deploy}") -eq 1 ]]
grep -Fq 'systemctl enable "${deployment_units[@]}"' "${deploy}"
grep -Fq 'start_and_verify_caddy_upstream' "${deploy}"
grep -Fq 'verify_public_https' "${deploy}"

grep -Fq 'ListenStream=10.10.10.165:3001' "${socket_unit}"
grep -Fq 'ExecStart=/usr/lib/systemd/systemd-socket-proxyd 127.0.0.1:3000' "${service_unit}"
grep -Fq 'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6' "${service_unit}"

grep -Fq 'survey.example.kr {' "${gateway_caddyfile}"
grep -Fq 'reverse_proxy 10.10.10.165:3001' "${gateway_caddyfile}"
grep -Fq 'Address = 10.99.0.1/30' "${gateway_gcp_wireguard}"
grep -Fq 'AllowedIPs = 10.99.0.2/32, 10.10.10.165/32' "${gateway_gcp_wireguard}"
grep -Fq 'Address = 10.99.0.2/30' "${gateway_pve_wireguard}"
grep -Fq 'AllowedIPs = 10.99.0.1/32' "${gateway_pve_wireguard}"
if rg -n 'PrivateKey\s*=' "${gateway_dir}"; then
  echo "a WireGuard private key must never be committed under ${gateway_dir}" >&2
  exit 1
fi

grep -Fq '## Public HTTPS exposure through GCP Caddy and WireGuard' "${readme}"
grep -Fq "public IP \`${gcp_public_ip}\`" "${readme}"
grep -Fq '(`10.99.0.1` on GCP and `10.99.0.2` on `pve-release`)' "${readme}"
grep -Fq '`http://10.10.10.165:3001`' "${readme}"
grep -Fq '`https://survey.example.kr` exactly' "${readme}"
grep -Fq 'public GCP Caddy URL is ${default_public_base_url}' "${deploy}"
grep -Fq 'behind the GCP Caddy/WireGuard ingress and Next' "${deploy}"

legacy_client=tail
legacy_client+=scale
legacy_mode=fun
legacy_mode+=nel
legacy_serve=ser
legacy_serve+=ve
legacy_serve_pattern="(^|[^[:alpha:]])${legacy_serve}([^[:alpha:]]|$)"
if grep -Eqi "${legacy_client}|${legacy_mode}|[.]ts[.]net|OPNsense" "${deploy}"; then
  echo "legacy application ingress logic remains in ${deploy}" >&2
  exit 1
fi
if grep -Eqi "${legacy_client}|${legacy_serve_pattern}|${legacy_mode}|[.]ts[.]net|OPNsense" "${readme}"; then
  echo "legacy application ingress documentation remains in ${readme}" >&2
  exit 1
fi
