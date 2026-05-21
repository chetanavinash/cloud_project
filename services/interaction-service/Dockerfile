# ==========================================
# STAGE 1: Build the application
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy root configurations for references
COPY package*.json ./
COPY tsconfig.base.json ./

# Copy service files
COPY services/interaction-service/package*.json ./services/interaction-service/
COPY services/interaction-service/tsconfig.json ./services/interaction-service/
COPY services/interaction-service/prisma ./services/interaction-service/prisma/
COPY services/interaction-service/src ./services/interaction-service/src/

# Install dependencies for workspace
RUN npm ci --workspace=services/interaction-service

# Generate Prisma Client
WORKDIR /usr/src/app/services/interaction-service
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
COPY services/interaction-service/package*.json ./services/interaction-service/
COPY services/interaction-service/prisma ./prisma/

# Install only production dependencies
RUN npm ci --omit=dev --workspace=services/interaction-service

# Copy generated Prisma Client and built JS files from builder stage
COPY --from=builder /usr/src/app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /usr/src/app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=builder /usr/src/app/services/interaction-service/dist ./dist

# Create non-root system user for runtime security hardening
USER node

EXPOSE 3003

CMD ["node", "dist/index.js"]
