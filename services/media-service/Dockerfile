# ==========================================
# STAGE 1: Build the application
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy root configurations for references
COPY tsconfig.base.json ./

# Copy service files
COPY services/media-service/package*.json ./services/media-service/
COPY services/media-service/tsconfig.json ./services/media-service/
COPY services/media-service/src ./services/media-service/src/

# Install dependencies for workspace
RUN npm ci --workspace=services/media-service

# Compile TypeScript
WORKDIR /usr/src/app/services/media-service
RUN npm run build

# ==========================================
# STAGE 2: Run the production application
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

# Set production environment
ENV NODE_ENV=production

# Copy built package dependencies
COPY services/media-service/package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy built JS files from builder stage
COPY --from=builder /usr/src/app/services/media-service/dist ./dist

# Create non-root system user for runtime security hardening
USER node

EXPOSE 3007

CMD ["node", "dist/index.js"]
