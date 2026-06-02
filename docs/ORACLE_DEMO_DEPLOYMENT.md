# Oracle Demo Deployment

This guide deploys a real UpSPA demo stack on an Oracle Cloud Ubuntu 24.04 VM:

- 3 Storage Provider services on public HTTP ports `8081`, `8082`, and `8083`
- 3 light Login Server instances on public HTTP ports `3000`, `3001`, and `3002`
- 1 PostgreSQL container with databases `upspa1`, `upspa2`, and `upspa3`
- Storage Provider threshold demo configuration `nsp=3`, `tsp=2`

The Storage Provider containers run the real Go service from `services/storage-provider-go/cmd/sp`. The light Login Servers run `demo/light-login-server/server.mjs`. This deployment does not add fake protocol outputs, fake SP responses, or hardcoded fake crypto.

## Oracle Ingress Rules

In the Oracle Cloud Console, open the VM subnet security list or network security group and add ingress rules for:

| Port | Protocol | Source | Purpose |
|---|---|---|---|
| `22` | TCP | your IP, or `0.0.0.0/0` for temporary demo access | SSH |
| `3000` | TCP | `0.0.0.0/0` | Login Server 1 |
| `3001` | TCP | `0.0.0.0/0` | Login Server 2 |
| `3002` | TCP | `0.0.0.0/0` | Login Server 3 |
| `8081` | TCP | `0.0.0.0/0` | Storage Provider 1 |
| `8082` | TCP | `0.0.0.0/0` | Storage Provider 2 |
| `8083` | TCP | `0.0.0.0/0` | Storage Provider 3 |

Keep PostgreSQL private. Do not expose port `5432` publicly for this demo.

## SSH Into The VM

```bash
ssh ubuntu@YOUR_PUBLIC_IP
```

Replace `YOUR_PUBLIC_IP` with the Oracle public IPv4 address assigned to the VM.

## Clone The Repo

```bash
git clone https://github.com/YOUR_ORG/YOUR_UPSPA_REPO.git
cd YOUR_UPSPA_REPO
```

If you upload a local copy instead of cloning, run the remaining commands from the repository root.

## Install Dependencies

```bash
sudo bash scripts/oracle/install_vm_dependencies.sh
sudo bash scripts/oracle/open_ports_ufw.sh
```

Log out and back in if the install script added your user to the `docker` group.

## Build And Start Services

```bash
docker compose -f docker-compose.oracle.yml config
docker compose -f docker-compose.oracle.yml up --build -d
```

Watch startup logs:

```bash
docker compose -f docker-compose.oracle.yml logs -f
```

Postgres initializes the three databases from `scripts/oracle/init_postgres.sql`. Each SP then applies its own embedded schema migration to its assigned database:

- `sp1` uses `upspa1`
- `sp2` uses `upspa2`
- `sp3` uses `upspa3`

## Check Health Endpoints

Run the local smoke test on the VM:

```bash
bash scripts/oracle/smoke_test.sh
```

You can also check from your own machine:

```bash
curl http://YOUR_PUBLIC_IP:8081/v1/health
curl http://YOUR_PUBLIC_IP:8082/v1/health
curl http://YOUR_PUBLIC_IP:8083/v1/health
curl http://YOUR_PUBLIC_IP:3000
curl http://YOUR_PUBLIC_IP:3001
curl http://YOUR_PUBLIC_IP:3002
```

## Configure The Browser Extension

Open the UpSPA extension options page and set:

- Enabled: on
- Main UpSPA UID: your demo UID, for example `alice-main`
- Threshold `tsp`: `2`
- Storage Providers `nsp=3`:
  - SP 1: `http://YOUR_PUBLIC_IP:8081`
  - SP 2: `http://YOUR_PUBLIC_IP:8082`
  - SP 3: `http://YOUR_PUBLIC_IP:8083`

Use HTTP URLs for this demo unless you add a reverse proxy and TLS.

## Demo Flow

Use the same Main UpSPA UID and master password throughout the flow until the master password update step.

1. Run setup/provision in the extension with all three SPs configured and threshold `2`.
2. Open `http://YOUR_PUBLIC_IP:3000/register` and register `alice` on LS1.
3. Open `http://YOUR_PUBLIC_IP:3001/register` and register `alice` on LS2.
4. Open `http://YOUR_PUBLIC_IP:3002/register` and register `alice` on LS3.
5. Log in on all three login servers:
   - `http://YOUR_PUBLIC_IP:3000/login`
   - `http://YOUR_PUBLIC_IP:3001/login`
   - `http://YOUR_PUBLIC_IP:3002/login`
6. Stop SP3:

```bash
docker compose -f docker-compose.oracle.yml stop sp3
```

7. Log in again. With `nsp=3` and `tsp=2`, the flow should still work using SP1 and SP2.
8. Run the master password update flow in the extension.
9. Log in on all three login servers using the new master password. Restart SP3 first if you want all three SPs online:

```bash
docker compose -f docker-compose.oracle.yml start sp3
```

## Troubleshooting

### Port Closed

Check both Oracle ingress rules and the VM firewall:

```bash
sudo ufw status verbose
docker compose -f docker-compose.oracle.yml ps
```

Oracle Cloud blocks traffic before it reaches the VM unless the subnet security list or NSG allows the port.

### Postgres Connection Refused

Check that Postgres is healthy and that the SPs use the internal hostname `postgres`:

```bash
docker compose -f docker-compose.oracle.yml ps
docker compose -f docker-compose.oracle.yml logs postgres
docker compose -f docker-compose.oracle.yml logs sp1 sp2 sp3
```

If you changed database names or passwords after the first boot, recreate the named volume:

```bash
docker compose -f docker-compose.oracle.yml down
docker volume rm upspa_fpb-main_oracle-postgres-data
docker compose -f docker-compose.oracle.yml up --build -d
```

The exact volume name may differ; list volumes with `docker volume ls`.

### Extension CORS Problem

The Go SP service sends permissive CORS headers for browser extension requests. Confirm you configured SP URLs with the public IP and the correct ports:

```text
http://YOUR_PUBLIC_IP:8081
http://YOUR_PUBLIC_IP:8082
http://YOUR_PUBLIC_IP:8083
```

Also confirm the Oracle ingress rules allow `8081`, `8082`, and `8083`.

### WASM CSP Problem

Build and load the extension using its normal extension build output. Do not serve the extension from the login-server pages. If the browser blocks WASM because of content security policy, check the extension manifest and build settings documented in `docs/browser-extension.md`.

### Public IP Missing

In Oracle Cloud, verify the instance has an assigned public IPv4 address. If it does not, assign an ephemeral or reserved public IP to the VNIC, then update the extension SP URLs and login-server URLs to use that address.
