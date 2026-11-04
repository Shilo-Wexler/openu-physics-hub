# Deploy

How OpenUVoice runs outside a laptop. Staging and prod run on one Oracle Cloud server (arm64,
Ubuntu) with k3s, each in its own namespace. Argo CD deploys everything from this repo, so after
the one-time setup below, a merge to `main` deploys staging and the **Promote to prod** workflow
deploys prod. Rare tasks (rollback, restore, a broken server, expiring tokens) are in
[RUNBOOK.md](RUNBOOK.md).

## Folder map

| Path | What it is |
|---|---|
| `../.github/workflows/ci.yml` | Checks every PR; on `main` builds the 7 images to GHCR and writes `tag-staging.yaml` |
| `../.github/workflows/promote.yml` | **Promote to prod**, run by hand: pins prod to one commit and its images |
| `argocd/root.yaml` | The parent Argo CD app, applied once by hand (its header has the Argo CD install) |
| `argocd/values.yaml` | Argo CD's own Helm values (hourly git polling) |
| `argocd/apps/` | One file per Argo CD app: `argocd`, `cluster-k3s`, `staging-db`, `staging-app`, `prod-db`, `prod-app` |
| `backup/` | The backup image (pg_dump, age, rclone), run by the chart's `backup` CronJob in prod |
| `cluster/k3s/` | Cluster-wide config: Traefik settings, in-cluster cloudflared |
| `helm/openuvoice-db/` | Chart for the two Postgres databases (chat, admin) |
| `helm/openuvoice/` | Chart for the app: backends, frontends, migrations Job, purge, access-sync and backup CronJobs, Ingress |
| `helm/openuvoice/values-<env>.yaml` | Per-environment values: hosts and public keys only |
| `helm/openuvoice/tag-staging.yaml` | Staging's image tag; written by CI, never by hand. Prod's tag and commit live in `argocd/apps/prod-*.yaml`, written by the promote workflow |
| `host/` | Files that live on the server itself, outside Kubernetes |
| `migrate/` | The migrations image (one per backend), run by the chart before each upgrade |

No secrets live in this repo. Every secret is a Kubernetes Secret made by hand on the server.

## Names per environment

Same shape in every environment, so a name says which one it belongs to.

| | dev (Mac) | staging | prod |
|---|---|---|---|
| Hosts | `localhost`, `dev` + `admin-dev.openuvoice.com` | `staging` + `admin-staging.openuvoice.com` | `openuvoice.com` + `admin.openuvoice.com` (`www` redirects to the root) |
| Namespace | none | `openuvoice-staging` | `openuvoice-prod` |
| Argo CD apps | none | `staging-db`, `staging-app` | `prod-db`, `prod-app` |
| Cloudflare tunnel | `openuvoice-dev` (cloudflared on the Mac) | `openuvoice` (in the cluster, shared) | `openuvoice` (same tunnel) |
| Cloudflare Access apps | `dev` | `staging` (site, testers) + `admin-staging` (console) | `admin` (console only; the site is public) |
| Console staff (Access rule group + policy) | none | `staging-console-staff` | `prod-console-staff` |
| Cloudflare API token (staff sync) | none | `staging-access-sync` | `prod-access-sync` |
| Google client (chat sign-in) | `chat dev` | `chat staging` | `chat prod` |
| Turnstile widget | Cloudflare's test keys | `openuvoice-staging` | `openuvoice-prod` |
| Backups | none | none | R2 bucket `openuvoice-backups`, token `prod-backups` |

Shared by all: the Google client `Cloudflare Access` (the Google login on every Access gate).
Public IDs (Google client IDs, Access AUD, Turnstile site keys, Cloudflare account and rule group IDs,
the backup public key) are in `values-<env>.yaml`.

## A new server from zero

Run from the repo root on the Mac unless it says "on the server". `ssh oracle` is the server.

1. **Firewall.** Oracle's Ubuntu image rejects forwarded traffic in iptables. In
   `/etc/iptables/rules.v4`, before the REJECT lines, accept the pod and service networks:
   INPUT `-s 10.42.0.0/16` and `-s 10.43.0.0/16`; FORWARD both `-s` and `-d` for each.
   Edit the file by hand (never `netfilter-persistent save`), then reboot. Only SSH (22) is
   open to the internet; 80, 443 and 6443 stay closed.
2. **AppArmor profile**, before k3s, so containerd uses it (see the header of
   `host/cri-containerd.apparmor.d`).
3. **k3s config**, before k3s (see the header of `host/k3s-config.yaml`).
4. **k3s**, pinned. On the server:
   `curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION=v1.36.5+k3s1 sh -`
   Then copy `/etc/rancher/k3s/k3s.yaml` to `~/.kube/config` (mode 600) and install Helm.
5. **Argo CD**, the deploy key and the root app: follow the header of `argocd/root.yaml`.
   The UI is reached only through an SSH port-forward.
6. **Namespace and Secrets** for the environment, by hand. In `openuvoice-<env>`:
   - `chat-db`, `admin-db`: `postgres-password`, `app-password` (random, `openssl rand -hex 24`)
   - `chat-backend`: `database-url`, `mod-api-token` (random, `openssl rand -hex 32`)
   - `admin-backend`: `database-url`, `mod-api-token` (same value as chat), `turnstile-secret`,
     `cf-api-token` (step 7)
   - `ghcr`: docker-registry Secret with a read-only (`read:packages`) GitHub token
   - Prod only, `backup`: `r2-access-key-id`, `r2-secret-access-key` (the R2 token `prod-backups`:
     Object Read & Write, this bucket only, client IP filter = the server's public IP)
   - In namespace `cloudflared`: `cloudflared-token`, the tunnel token (see `cluster/k3s/cloudflared.yaml`)

   Type secret values with `read -rs VAR` (alone on its line), use the variable, then `unset` it,
   so they never show on screen or in shell history.
7. **Cloudflare Access for the console.** Only the emails in the `admins` table get past the
   console's Access gate: admin-backend copies them into an Access rule group after every change
   in the console, and the `access-sync` CronJob fixes the group every 15 minutes. In the Zero
   Trust dashboard (Access controls):
   - Rule group `<env>-console-staff`, including the first admin's email (step 8), so the gate
     lets them in before the first sync.
   - Reusable policy `<env>-console-staff`: Allow, include that rule group.
   - Self-hosted application for the console host only, with that policy, Google login only,
     instant auth, 24 hours, cookie HTTP Only. Its AUD goes into `values-<env>.yaml`.
   - Custom API token `<env>-access-sync` (My Profile, API Tokens): `Access: Organizations,
     Identity Providers, and Groups: Edit`, this account only, client IP filter = the server's
     public IP (`ssh oracle curl -s ifconfig.me`), 1 year. Save it as `cf-api-token` in the
     `admin-backend` Secret. The account ID (from the dashboard URL) and the rule group ID go
     into `values-<env>.yaml`.
8. **First admin**, once the app is up. On the server:
   `kubectl -n openuvoice-<env> exec -it admin-db-0 -- psql -U admin_app -d admin_db`
   then `insert into admins (email, name) values ('<email>', '<name>');`

## Everyday

- **Deploy to staging:** merge to `main`. CI builds the images and the bot commits
  `Deploy <sha> to staging`; Argo CD picks it up within an hour, or at once with `argo-refresh`
  on the server (wait for the bot commit first).
- **Deploy to prod:** Actions, **Promote to prod**, Run workflow with an empty tag, then
  `argo-refresh`. Details and rollback in [RUNBOOK.md](RUNBOOK.md).
- **Argo CD UI:** `ssh -L 8080:localhost:8080 oracle 'KUBECONFIG=$HOME/.kube/config kubectl -n argocd port-forward svc/argocd-server 8080:443'`,
  then https://localhost:8080.
- **Console staff:** add or remove people in the console only, never in the Access rule group
  (the next sync overwrites it). To sync now instead of waiting for the CronJob, on the server:
  `kubectl -n openuvoice-<env> create job --from=cronjob/access-sync access-sync-now`, then
  `kubectl -n openuvoice-<env> logs job/access-sync-now` and delete the Job.
  Failed runs stay in `kubectl -n openuvoice-<env> get jobs`.
- **Cloudflare API token:** it expires after a year and works only from the server's public IP.
  When it expires, Roll it in the dashboard and update `cf-api-token`. If the server's public IP
  changes (an Oracle stop and start changes it; a reboot does not), edit the token's IP filter.
  Either way the sync fails with an error in the admin-backend and CronJob logs.
- **k3s upgrade:** compare `host/cri-containerd.apparmor.d` with the new containerd template
  first; drop the profile once containerd ships the fix (containerd issue #14485).
