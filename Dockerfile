# Multi-stage production Dockerfile for LifeOS
# Stage 1: Build & Dependencies
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies required for node-gyp if needed
RUN apk add --no-cache python3 make g++

# Copy package manifests
COPY package*.json ./
COPY frontend/package*.json ./frontend/

# Install root & frontend dependencies
RUN npm ci
RUN cd frontend && npm ci

# Copy full repository source
COPY tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
COPY server.ts ./
COPY frontend ./frontend

# Generate Prisma Client & Build Next.js frontend bundle
RUN npx prisma generate
RUN npm run build:frontend

# Stage 2: Minimal Production Runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copy node_modules and compiled artifacts
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/src ./src
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/frontend/.next ./frontend/.next
COPY --from=builder /app/frontend/public ./frontend/public
COPY --from=builder /app/frontend/node_modules ./frontend/node_modules
COPY --from=builder /app/frontend/package*.json ./frontend/

EXPOSE 3000

# Health check against production endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/health || exit 1

# Launch production server
CMD ["npm", "start"]
