# Migrations image for one backend. Build from the repo root:
#   docker build -f deploy/migrate/Dockerfile --build-arg SERVICE=chat-backend -t chat-migrate .
# Same Postgres major version as the databases, so psql matches the server.
FROM postgres:17-alpine

ARG SERVICE
RUN test -n "$SERVICE" || (echo "Set --build-arg SERVICE=chat-backend or admin-backend" && exit 1)

COPY ${SERVICE}/db/migrations /db/migrations
COPY ${SERVICE}/db/seed /db/seed
COPY shared/courses.csv /db/courses.csv
COPY --chmod=0555 deploy/migrate/migrate.sh /usr/local/bin/migrate

# 70 is the postgres user in the alpine image.
USER 70
ENTRYPOINT ["migrate"]