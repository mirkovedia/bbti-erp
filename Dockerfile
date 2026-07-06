# --- deps: instala node_modules con el lockfile ---
FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

# --- builder: genera Prisma Client y compila Next standalone ---
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build
# CLI de Prisma AUTOCONTENIDO para "migrate deploy" en el runner: el CLI 6.x
# tiene dependencias externas (@prisma/config -> effect, c12, ...) que no se
# pueden copiar sueltas; una instalación aislada trae el árbol completo.
# Mantener la versión en sincronía con package.json.
RUN mkdir -p /opt/prisma-cli && cd /opt/prisma-cli \
 && npm init -y --silent >/dev/null \
 && npm install --silent --no-audit --no-fund prisma@6.19.3

# --- runner: imagen mínima non-root ---
FROM node:22-alpine AS runner
WORKDIR /app
# openssl: requerido por Prisma en musl; curl: healthcheck del compose
RUN apk add --no-cache openssl curl \
 && addgroup -S nodejs && adduser -S nextjs -G nodejs

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# schema + migraciones + seed (el seed corre con: node prisma/seed.mjs)
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
# Cliente Prisma runtime (por si el tracing de standalone no lo incluyó completo)
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/bcryptjs ./node_modules/bcryptjs
# CLI autocontenido (ver etapa builder) para las migraciones del arranque
COPY --from=builder --chown=nextjs:nodejs /opt/prisma-cli /opt/prisma-cli
COPY --chown=nextjs:nodejs docker/start.sh ./start.sh
RUN chmod +x ./start.sh

USER nextjs
EXPOSE 3000
CMD ["./start.sh"]
