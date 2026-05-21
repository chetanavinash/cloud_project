# ==========================================
# STAGE 1: Build the application
# ==========================================
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl

WORKDIR /usr/src/app

# Copy root configurations for references
COPY package*.json ./
COPY tsconfig.base.json ./

# Copy service files
COPY services/notification-service/package*.json ./services/notification-service/
COPY services/notification-service/tsconfig.json ./services/notification-service/
COPY services/notification-service/src ./services/notification-service/src/

# Install dependencies for workspace
RUN npm ci --workspace=services/notification-service

# Compile TypeScript
WORKDIR /usr/src/app/services/notification-service
RUN npm run build

# ==========================================
# STAGE 2: Run the production application
# ==========================================
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl

WORKDIR /usr/src/app

# Set production environment
ENV NODE_ENV=production

# Copy built package dependencies
COPY package*.json ./
COPY services/notification-service/package*.json ./services/notification-service/

# Install only production dependencies
RUN npm ci --omit=dev --workspace=services/notification-service

# Copy built JS files from builder stage
COPY --from=builder /usr/src/app/services/notification-service/dist ./dist

# Create non-root system user for runtime security hardening
USER node

EXPOSE 3005

CMD ["node", "dist/index.js"]
