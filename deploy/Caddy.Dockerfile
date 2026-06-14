# Imagen de Caddy que ADEMÁS trae el SPA ya construido.
#
# Etapa `build`: compila el frontend (Vite) con VITE_API_URL fijado en build-time
# (apunta a https://api.<dominio>). Etapa final: Caddy con el estático en /srv/www
# y el Caddyfile del repo. Contexto de build = raíz del repo (necesita frontend/).

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

FROM caddy:2
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv/www
