# GCP public gateway

`survey.npredu.co.kr` is terminated on a small GCP gateway in Seoul and
proxied over WireGuard to the existing `pve-release` application. The home
router and OPNsense do not expose HTTP(S) ports for this service.

## Fixed addresses

- GCP public IP: `34.158.196.85`
- GCP WireGuard: `10.99.0.1/30`
- pve-release WireGuard: `10.99.0.2/30`
- application upstream: `10.10.10.165:3001`

Only the application upstream address is routed through the tunnel. Database,
Redis, and the rest of the LAN are not routed.

## Deployment phases

1. Use `caddy/Caddyfile.bootstrap` while Gabia DNS still points at the previous
   endpoint. It exposes HTTP on the new GCP IP for host-header validation but
   does not request a certificate.
2. Change only the Gabia `survey` A record to `34.158.196.85`.
3. Install `caddy/Caddyfile`, validate it, and reload Caddy. Caddy obtains and
   renews the public certificate automatically.

Caddy access logging is deliberately not enabled to minimize public request
metadata. Personal reservation credentials are delivered in the URL fragment
and submitted in a request body, so they never belong in a server-visible path
or query string.

## Rollback

Change only the Gabia `survey` A record back to its previous value. Do not
change apex, wildcard, `www`, MX, or TXT records. The application and database
remain on `pve-release`, so DNS rollback is sufficient.
