# Admin console image. Built from the repo root: docker build -t admin-frontend admin-frontend

# Stage 1: build the static files with Node.
FROM node:22-alpine AS build
WORKDIR /app

# Dependencies first: this layer is cached and only rebuilt when the lock file changes.
COPY package.json package-lock.json ./
RUN npm ci

# No build args: the console reads nothing from the environment, and in a production
# build import.meta.env.DEV is false, so the dev sign-in box is never shown.
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
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080