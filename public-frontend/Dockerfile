# Public site image. Built from the repo root:
#   docker build -t public-frontend \
#     --build-arg VITE_GOOGLE_CLIENT_ID=... --build-arg VITE_TURNSTILE_SITE_KEY=... public-frontend

# Stage 1: build the static files with Node.
FROM node:22-alpine AS build
WORKDIR /app

# Dependencies first: this layer is cached and only rebuilt when the lock file changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Public values that Vite bakes into the bundle. Not secrets: the browser sees them anyway.
# The build fails if one is missing, instead of shipping a site with broken sign-in or inquiries.
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_TURNSTILE_SITE_KEY
RUN test -n "$VITE_GOOGLE_CLIENT_ID" && test -n "$VITE_TURNSTILE_SITE_KEY" \
    && VITE_GOOGLE_CLIENT_ID="$VITE_GOOGLE_CLIENT_ID" \
       VITE_TURNSTILE_SITE_KEY="$VITE_TURNSTILE_SITE_KEY" \
       npm run build

# Stage 2: serve dist with nginx. Node, node_modules and the sources stay behind in stage 1.
# The unprivileged image runs as UID 101, so runAsNonRoot works here too.
FROM nginxinc/nginx-unprivileged:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080