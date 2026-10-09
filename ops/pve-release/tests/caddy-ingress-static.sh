#!/usr/bin/env bash
# 공개 HTTPS 경로(GCP Caddy → WireGuard → PVE 소켓 프록시 → web) 설정의 정적 검사
# 실행: 저장소 어디서든 bash 로 실행. 운영 서버에 접속하지 않고 저장소 파일만 읽음
# 종료 코드: 0 통과, 0 이 아니면 어긋난 검사가 있음
set -Eeuo pipefail

# 검사 대상 파일과 기대값
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

# 배포·설치 스크립트 문법과 공개 주소·포트 검증 코드
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

# 소켓 프록시 유닛
grep -Fq 'ListenStream=10.10.10.165:3001' "${socket_unit}"
grep -Fq 'ExecStart=/usr/lib/systemd/systemd-socket-proxyd 127.0.0.1:3000' "${service_unit}"
grep -Fq 'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6' "${service_unit}"

# GCP 게이트웨이 Caddy·WireGuard 설정. 개인 키는 저장소에 없어야 함
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

# README 의 공개 경로 설명
grep -Fq '## Public HTTPS exposure through GCP Caddy and WireGuard' "${readme}"
grep -Fq "public IP \`${gcp_public_ip}\`" "${readme}"
grep -Fq '(`10.99.0.1` on GCP and `10.99.0.2` on `pve-release`)' "${readme}"
grep -Fq '`http://10.10.10.165:3001`' "${readme}"
grep -Fq '`https://survey.example.kr` exactly' "${readme}"
grep -Fq 'public GCP Caddy URL is ${default_public_base_url}' "${deploy}"
grep -Fq 'behind the GCP Caddy/WireGuard ingress and Next' "${deploy}"

# 이전 진입 방식(문자열을 나눠 이 파일 자체가 걸리지 않게 함)이 배포 스크립트·README 에 남아 있지 않음
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
