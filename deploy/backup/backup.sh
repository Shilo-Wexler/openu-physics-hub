#!/bin/sh
# Nightly backup of every database: pg_dump, encrypted with age, uploaded to Cloudflare R2.
#
# Arguments: one "name:host:database:user" per database. The user's password is read from
# /secrets/db/<name>/password, the R2 keys from /secrets/r2/.
# Env: BACKUP_RECIPIENT (age public key), R2_ENDPOINT, R2_BUCKET.
#
# Each dump goes to daily/<name>/<name>-<date>.dump.age. On the 1st of the month it is also
# copied to monthly/. R2 lifecycle rules on the bucket delete old files (daily after 7 days,
# monthly after 35). Only the age private key, kept offline, can open the files.
set -eu -o pipefail

: "${BACKUP_RECIPIENT:?}" "${R2_ENDPOINT:?}" "${R2_BUCKET:?}"
[ "$#" -gt 0 ] || { echo "no databases given" >&2; exit 1; }

# rclone remote "r2", from env vars only (no config file).
export RCLONE_CONFIG_R2_TYPE=s3
export RCLONE_CONFIG_R2_PROVIDER=Cloudflare
export RCLONE_CONFIG_R2_ENDPOINT="$R2_ENDPOINT"
RCLONE_CONFIG_R2_ACCESS_KEY_ID="$(cat /secrets/r2/r2-access-key-id)"
RCLONE_CONFIG_R2_SECRET_ACCESS_KEY="$(cat /secrets/r2/r2-secret-access-key)"
export RCLONE_CONFIG_R2_ACCESS_KEY_ID RCLONE_CONFIG_R2_SECRET_ACCESS_KEY
# The token may write objects but not manage buckets, so never check or create the bucket.
export RCLONE_CONFIG_R2_NO_CHECK_BUCKET=true

DATE="$(date -u +%Y-%m-%d)"
DAY="$(date -u +%d)"

for spec in "$@"; do
  IFS=: read -r name host database user <<EOT
$spec
EOT
  file="$name-$DATE.dump.age"
  daily="r2:$R2_BUCKET/daily/$name/$file"

  echo "backing up $database to $daily"
  PGPASSWORD="$(cat "/secrets/db/$name/password")" \
    pg_dump --host="$host" --username="$user" --dbname="$database" --format=custom \
    | age --recipient "$BACKUP_RECIPIENT" \
    | rclone rcat "$daily"

  # Fails (and so fails the Job) when the file did not arrive.
  rclone lsl "$daily"

  if [ "$DAY" = "01" ]; then
    echo "first of the month: copying to monthly/"
    rclone copyto "$daily" "r2:$R2_BUCKET/monthly/$name/$file"
  fi
done

echo "backup done"