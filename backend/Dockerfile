# Imagen del backend de GestorPro.
#
# Etapa `build`: instala dependencias (con herramientas para compilar argon2),
# genera el cliente Prisma y compila TypeScript. Etapa `runtime`: conserva
# node_modules COMPLETO (incluye prisma CLI y tsx) para poder ejecutar también
# `prisma migrate deploy` y el seed (`tsx prisma/seed.ts`, que importa de src/),
# no solo la app. Mirror de `npm ci && prisma generate && npm run build && npm start`.

FROM node:22-bookworm-slim AS build
WORKDIR /app
# Herramientas para compilar dependencias nativas (argon2).
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
# El cliente Prisma se genera ANTES de tsc (sale en src/generated y se compila).
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV TZ=America/Panama
# App ya construida: node_modules (con devDeps para migrate/seed), dist, prisma,
# src y cliente generado. El binario nativo de argon2 ya viene compilado.
COPY --from=build /app /app
EXPOSE 3000
# La app corre como rol gestorpro_app (DATABASE_URL se inyecta por entorno).
CMD ["node", "dist/server.js"]
