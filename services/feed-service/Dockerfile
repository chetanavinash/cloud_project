# ==========================================
# STAGE 1: Build the application
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy root configurations for references
COPY package*.json ./
COPY tsconfig.base.json ./

# Copy service files
COPY services/feed-service/package*.json ./services/feed-service/
COPY services/feed-service/tsconfig.json ./services/feed-service/
COPY services/feed-service/prisma ./services/feed-service/prisma/
COPY services/feed-service/src ./services/feed-service/src/

# Install dependencies for workspace
RUN npm ci --workspace=services/feed-service

# Generate Prisma Clients
WORKDIR /usr/src/app/services/feed-service
RUN npx prisma generate --schema=prisma/user-schema.prisma
RUN npx prisma generate --schema=prisma/post-schema.prisma

# Compile TypeScript
RUN npm run build

# ==========================================
# STAGE 2: Run the production application
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

# Set production environment
ENV NODE_ENV=production

# Copy built package dependencies and Prisma files
COPY package*.json ./
COPY services/feed-service/package*.json ./services/feed-service/
COPY services/feed-service/prisma ./prisma/

# Install only production dependencies
RUN npm ci --omit=dev --workspace=services/feed-service

# Copy generated Prisma Clients and built JS files from builder stage
COPY --from=builder /usr/src/app/services/feed-service/dist ./dist
COPY --from=builder /usr/src/app/services/feed-service/src/generated ./dist/generated

# Create non-root system user for runtime security hardening
USER node

EXPOSE 3004

CMD ["node", "dist/index.js"]
