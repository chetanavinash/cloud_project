# ==========================================
# STAGE 1: Build the application
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy root configurations for references
COPY package*.json ./
COPY tsconfig.base.json ./

# Copy service files
COPY services/search-service/package*.json ./services/search-service/
COPY services/search-service/tsconfig.json ./services/search-service/
COPY services/search-service/prisma ./services/search-service/prisma/
COPY services/search-service/src ./services/search-service/src/

# Install dependencies for workspace
RUN npm ci --workspace=services/search-service

# Generate Prisma Client
WORKDIR /usr/src/app/services/search-service
RUN npx prisma generate

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
COPY services/search-service/package*.json ./services/search-service/
COPY services/search-service/prisma ./prisma/

# Install only production dependencies
RUN npm ci --omit=dev --workspace=services/search-service

# Copy generated Prisma Client and built JS files from builder stage
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /usr/src/app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /usr/src/app/services/search-service/dist ./dist

# Create non-root system user for runtime security hardening
USER node

EXPOSE 3006

CMD ["node", "dist/index.js"]
