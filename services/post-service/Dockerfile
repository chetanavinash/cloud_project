# ==========================================
# STAGE 1: Build the application
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy root configurations for references
COPY tsconfig.base.json ./

# Copy service files
COPY services/post-service/package*.json ./services/post-service/
COPY services/post-service/tsconfig.json ./services/post-service/
COPY services/post-service/prisma ./services/post-service/prisma/
COPY services/post-service/src ./services/post-service/src/

# Install dependencies for workspace
RUN npm ci --workspace=services/post-service

# Generate Prisma Client
WORKDIR /usr/src/app/services/post-service
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
COPY services/post-service/package*.json ./
COPY services/post-service/prisma ./prisma/

# Install only production dependencies
RUN npm ci --only=production

# Copy generated Prisma Client and built JS files from builder stage
COPY --from=builder /usr/src/app/services/post-service/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /usr/src/app/services/post-service/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /usr/src/app/services/post-service/dist ./dist

# Create non-root system user for runtime security hardening
USER node

EXPOSE 3002

CMD ["node", "dist/index.js"]
