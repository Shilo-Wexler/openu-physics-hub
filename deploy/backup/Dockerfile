# Nightly database backup image (deploy/backup/backup.sh). Build from the repo root:
#   docker build -t backup deploy/backup
# Same Postgres major version as the databases: pg_dump must not be older than the server.
FROM postgres:17-alpine

RUN apk add --no-cache age rclone

COPY --chmod=0555 backup.sh /usr/local/bin/backup

# 70 is the postgres user in the alpine image.
USER 70
ENTRYPOINT ["backup"]