# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1: Build the React + Vite frontend bundle
# ---------------------------------------------------------------------------
FROM node:22.14.0-alpine3.21 AS builder

WORKDIR /app

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY index.html tsconfig.json vite.config.ts server.ts ./
COPY src ./src

RUN npm run build

# ---------------------------------------------------------------------------
# Stage 2: Minimal production runtime (Express + built SPA + native Node 22 TS)
# ---------------------------------------------------------------------------
FROM node:22.14.0-alpine3.21 AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force

# Copy only runtime server, shared server modules, and compiled frontend bundle
COPY --chown=node:node server.ts ./
COPY --chown=node:node src/lib ./src/lib
COPY --from=builder --chown=node:node /app/dist ./dist

# Drop root privileges for Cloud Run / container security
USER node

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "const p=process.env.PORT||8080;fetch('http://127.0.0.1:'+p+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.ts"]
