# ==========================================
# STAGE 1: Build the React Application
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy root configurations for workspaces references
COPY package*.json ./
COPY tsconfig.base.json ./

# Copy frontend workspace files
COPY frontend/package*.json ./frontend/
COPY frontend/tsconfig*.json ./frontend/
COPY frontend/vite.config.ts ./frontend/
COPY frontend/index.html ./frontend/
COPY frontend/public ./frontend/public/
COPY frontend/src ./frontend/src/

# Install dependencies for the frontend workspace
RUN npm ci --workspace=frontend

# Build the static production assets
WORKDIR /usr/src/app/frontend
RUN npm run build

# ==========================================
# STAGE 2: Run the production server
# ==========================================
FROM nginx:1.25-alpine AS runner

# Copy customized nginx config for single page application (SPA) routing
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Copy static compiled builds from the builder stage
COPY --from=builder /usr/src/app/frontend/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
