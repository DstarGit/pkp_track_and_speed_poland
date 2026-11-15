# Stage 1: Build frontend assets (Vite + React + Tailwind CSS)
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY . .

RUN npm run build

# Stage 2: Production runtime (Node 22 native TypeScript strip-types + Express)
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json ./
RUN npm install --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY server.ts ./
COPY src/server ./src/server
COPY src/types ./src/types

RUN mkdir -p /app/.cache/gtfs && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.ts"]
