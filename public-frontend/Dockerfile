# Public site image. Built from the repo root:
#   docker build -t public-frontend public-frontend
# Nothing per environment is baked in: the Google client ID and Turnstile site key come from env
# vars when the container starts (docker/config.sh), so one image serves staging and production.

# Stage 1: build the static files with Node.
FROM node:22-alpine AS build
WORKDIR /app

# Dependencies first: this layer is cached and only rebuilt when the lock file changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build
# Compress the text files once, here, at the best level, next to each original (file.js.gz).
# nginx sends the .gz to browsers that accept gzip (gzip_static in nginx.conf). Small files gain nothing.
RUN find dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.svg' -o -name '*.html' -o -name '*.json' \) \
    -size +1k -exec gzip -9 -k {} +

# Stage 2: serve dist with nginx. Node, node_modules and the sources stay behind in stage 1.
# The unprivileged image runs as UID 101, so runAsNonRoot works here too.
FROM nginxinc/nginx-unprivileged:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
# The image's entrypoint runs this before nginx starts; it must be executable or it is skipped.
COPY --chmod=755 docker/config.sh /docker-entrypoint.d/40-openuvoice-config.sh
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080