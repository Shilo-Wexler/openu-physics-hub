# Runbook

What to do when something rare happens: a deploy, a rollback, a restore, a broken server.
Setup from zero and the folder map are in [README.md](README.md).

`ssh oracle` is the server. `kubectl` works only on the server (the API is not open to the
internet), so every `kubectl` line below runs there unless it says "on the Mac".

## Quick reference

| | staging | prod |
|---|---|---|
| Namespace | `openuvoice-staging` | `openuvoice-prod` |
| Argo CD apps | `staging-db`, `staging-app` | `prod-db`, `prod-app` |
| What it runs | `tag-staging.yaml`, written by CI | the commit pinned in `argocd/apps/prod-*.yaml` |
| Database pods | `chat-db-0` (`chat_db`, user `chat_app`), `admin-db-0` (`admin_db`, user `admin_app`) | same |
| Backups | none | nightly to R2 (below) |

`argo-refresh` is a shell function in `~/.zshrc` on the server. It tells Argo CD to check git
now for every app, instead of waiting for the hourly poll:

```
argo-refresh() { kubectl -n argocd get applications -o name | xargs -I{} kubectl -n argocd annotate {} argocd.argoproj.io/refresh=normal --overwrite; }
```

## Is it healthy?

```
kubectl -n argocd get applications
kubectl -n openuvoice-prod get pods
kubectl -n openuvoice-prod get jobs
kubectl -n cloudflared get pods
```

All apps `Synced` and `Healthy`, all pods `Running`, Jobs `Complete`. To see why a pod fails:

```
kubectl -n openuvoice-prod describe pod <pod>
kubectl -n openuvoice-prod logs <pod> --previous
```

## Deploy to staging

1. Merge the PR to `main`.
2. Wait for CI to finish and for the bot commit `Deploy <sha> to staging`.
3. On the server: `argo-refresh`.

Refreshing before the bot commit applies the new values on the old images, so wait for it.

## Promote to prod

1. Check the change on staging first.
2. GitHub, Actions, **Promote to prod**, Run workflow, leave the tag empty. Empty means the tag
   staging runs now.
3. Wait for the bot commit `Promote <sha> to prod`.
4. On the server: `argo-refresh`.
5. Check: `kubectl -n openuvoice-prod get pods,jobs`. The migrations Jobs must be `Complete`.

## Roll back prod

1. Find the last good tag. On the Mac:
   `git --no-pager log --oneline --grep 'to prod' -10`
2. Run **Promote to prod** with that tag (7 characters).
3. Wait for the bot commit, then `argo-refresh` on the server.

The code, the charts and their values all go back to that commit together. **Migrations do not
go back.** They only add, so older code usually runs fine on a newer schema. If a migration
damaged data, restore the database from a backup (below).

Rolling back to a tag works only while its images are still in GHCR.

## Backups

The `backup` CronJob (prod only) runs every night at 03:30 Israel time. It dumps both databases
with `pg_dump`, encrypts them with `age` and uploads them to the R2 bucket `openuvoice-backups`:

- `daily/<db>/<db>-<date>.dump.age`, kept 7 days.
- `monthly/<db>/...`, a copy made on the 1st of the month, kept 35 days.

R2 deletes old files by itself (lifecycle rules on the bucket).

Each run reports to Healthchecks.io (check `openuvoice-prod-backup`, account
shilowexler@gmail.com): a ping on success, a `/fail` ping on any error. Healthchecks emails when a
run fails, or when no successful run arrives by 05:30. The ping URL is the key `ping-url` in the
`backup` Secret; without it the backup still runs, only without the report.

The files are encrypted to a public key in `values-prod.yaml`. The private key exists only in
the Mac Passwords app, entry `openuvoice backup private key`. **Without it no backup can be
read.** The R2 keys are in the entry `openuvoice R2 prod-backups`.

### Check last night's run

```
kubectl -n openuvoice-prod get jobs | grep backup
kubectl -n openuvoice-prod logs job/<backup-job-name>
```

The Job shows `1/1` and the log lists both uploaded files with their size. The files are also
visible in the Cloudflare dashboard, R2, `openuvoice-backups`.

### Run a backup now

```
kubectl -n openuvoice-prod create job --from=cronjob/backup backup-now
kubectl -n openuvoice-prod logs -f job/backup-now
kubectl -n openuvoice-prod delete job backup-now
```

A second run on the same day overwrites that day's file.

### If the backup fails

The Healthchecks email is the first sign. Then read the Job log (above).

- `403` or `AccessDenied` from R2: the server's public IP changed. Edit the client IP filter of
  the R2 token `prod-backups` (R2, Manage API tokens).
- Password or connection errors from `pg_dump`: check the `chat-db` and `admin-db` Secrets and
  that the database pods run.
- Failed Jobs stay in `kubectl -n openuvoice-prod get jobs` until the next success.

## Restore a backup

The R2 token works only from the server's IP, so on the Mac the files come from the dashboard.
Restore only the database that is broken: chat and admin are separate.

### 1. Download and decrypt (on the Mac)

1. Cloudflare dashboard, R2, `openuvoice-backups`, `daily/<db>/`: download the file you want.
   It saves as `daily_<db>_<db>-<date>.dump.age` in `~/Downloads`.
2. `cd ~/Downloads`
3. Passwords app, `openuvoice backup private key`: copy the whole key line (`AGE-SECRET-KEY-...`).
4. `age -d -i <(pbpaste) -o <db>.dump daily_<db>_<db>-<date>.dump.age`
5. `pbcopy < /dev/null` (clears the key from the clipboard).

`unknown identity type` means the clipboard held something else. Copy the key again.

### 2a. Test only (on the Mac)

Restores into a throwaway Postgres in Docker, to see that a backup is good:

1. `docker run -d --name restore-test -e POSTGRES_PASSWORD=test postgres:17-alpine`
2. Wait 5 seconds.
3. `docker cp <db>.dump restore-test:/tmp/<db>.dump`
4. `docker exec restore-test createdb -U postgres <db>_db`
5. `docker exec restore-test pg_restore -U postgres --no-owner --no-privileges --exit-on-error -d <db>_db /tmp/<db>.dump`
6. Look at the data, for example
   `docker exec restore-test psql -U postgres -d admin_db -c "select email, role from admins"`
7. Clean up: `docker rm -f restore-test` and `rm <db>.dump daily_*.dump.age`

### 2b. Into prod

This replaces the live database with the backup. Everything written after the backup is lost.
Not rehearsed yet: try it on staging first if there is time.

1. Run a backup now (above), so you can go back to the current state.
2. On the Mac: `scp <db>.dump oracle:/tmp/<db>.dump`
3. On the server:
   `kubectl -n openuvoice-prod cp /tmp/<db>.dump <db>-db-0:/tmp/<db>.dump`
4. On the server:
   `kubectl -n openuvoice-prod exec <db>-db-0 -- pg_restore -U <db>_app -d <db>_db --clean --if-exists --no-owner --no-privileges --single-transaction --exit-on-error /tmp/<db>.dump`
5. `--single-transaction` means it either restores everything or changes nothing. On error,
   read the message; the database stays as it was.
6. Restart the backend so it drops old connections:
   `kubectl -n openuvoice-prod rollout restart deployment <db>-backend`
7. Delete the copies:
   - on the server: `kubectl -n openuvoice-prod exec <db>-db-0 -- rm /tmp/<db>.dump` and `rm /tmp/<db>.dump`
   - on the Mac: `rm <db>.dump daily_*.dump.age`

## The site is down

- **Cloudflare error 1033:** the tunnel has no connector. `kubectl -n cloudflared get pods`; if
  they are not running, `kubectl -n cloudflared logs deploy/cloudflared`.
- **502 or 404 from the app:** the tunnel works but the app does not. Check pods and Argo CD
  (Is it healthy?).
- **The console keeps asking to log in, or says no access:** the email is not in the `admins`
  table, or the Access rule group is out of sync. See "Console staff" in the README.
- **The whole server is unreachable:** Oracle Cloud console, Compute, Instances, `web-server`.
  Reboot it from there. Everything comes back by itself after a reboot.

One tunnel, `openuvoice`, serves both staging and prod. Its routes (Zero Trust, Networks,
Tunnels) send all four hosts to `http://traefik.kube-system.svc.cluster.local:80`, and Traefik
picks the namespace by host.

## The server's public IP changed

A reboot keeps the IP; a stop and start in Oracle changes it. Then update:

1. `~/.ssh/config` on the Mac (`Host oracle`).
2. The client IP filter on the Cloudflare API tokens `staging-access-sync` and `prod-access-sync`.
3. The client IP filter on the R2 token `prod-backups`.

New IP, on the server: `curl -s ifconfig.me`

## A new server

Follow "A new server from zero" in the README. Then for prod:

1. The `backup` Secret (R2 keys from the Passwords app), as in the README.
2. Let Argo CD create empty databases, then restore both from the latest backup (2b, steps 2
   to 7).
3. Update the IP everywhere (above).

## Things that expire

| What | Where it is used | Expires | How to renew |
|---|---|---|---|
| GHCR read token (GitHub, `read:packages`) | Secret `ghcr` in both namespaces | ~2027-02-05 | New token, then recreate the Secret in each namespace (below) |
| Cloudflare token `staging-access-sync` | Secret `admin-backend`, key `cf-api-token`, staging | ~2027-11-01 | Roll in the dashboard, update the key |
| Cloudflare token `prod-access-sync` | Same, prod | ~2027-11-03 | Same |
| R2 token `prod-backups` | Secret `backup`, prod | never (IP-locked) | Only if the IP changes |
| age backup key | Passwords app | never | Keep it safe; there is no copy anywhere else |

When the GHCR token expires, pods can no longer pull new images, so the next deploy hangs on
`ImagePullBackOff`. To recreate the Secret, on the server, for each namespace:

```
read -rs GHCR_TOKEN
kubectl -n openuvoice-<env> create secret docker-registry ghcr --docker-server=ghcr.io --docker-username=Shilo-Wexler --docker-password="$GHCR_TOKEN" --dry-run=client -o yaml | kubectl apply -f -
unset GHCR_TOKEN
```

GitHub Actions has 2000 free minutes a month and its budget is $0, so CI stops when they run
out. GitHub emails before that; raise the Actions budget (Billing, Budgets and alerts) if needed.
