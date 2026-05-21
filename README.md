# Cloud-Native Social Media Platform

A full-stack, cloud-native social media platform built with a high-performance microservices architecture and deployed on **Amazon Web Services (AWS)** using **Kubernetes (EKS)**.

---

## 🏗️ Architecture Overview

The system consists of **8 core deployable components** (7 backend Node.js/Fastify microservices and a React/Vite web application):

```
                                  [ Client Browser ]
                                          │
                                          ▼ (Port 80)
                                     [ Frontend ]
                                          │
    ┌──────────────┬──────────────────────┼──────────────┬──────────────┬──────────────┐
    ▼ (3001)       ▼ (3002)               ▼ (3003)       ▼ (3004)       ▼ (3005)       ▼ (3006)
[User Service] [Post Service] [Interaction Service] [Feed Service] [Notification] [Search Service]
       │              │               │                  │              │              │
       ▼              ▼               ▼                  ▼              ▼              ▼
  [Cognito]      [DynamoDB]     [PostgreSQL]          [Redis]       [DynamoDB]    [PostgreSQL]
  [PostgreSQL]                                         [SQS]          [SQS]
```

### 🛰️ Port Allocation & Services
1. **`frontend` (Port 80):** React + TypeScript SPA served via Nginx.
2. **`user-service` (Port 3001):** Manages profiles, authentication, user data, and relations.
3. **`post-service` (Port 3002):** Handles creating, editing, and deleting posts.
4. **`interaction-service` (Port 3003):** Coordinates likes and comments.
5. **`feed-service` (Port 3004):** Builds hot cached timelines using Redis.
6. **`notification-service` (Port 3005):** Dispatches real-time updates via WebSockets.
7. **`search-service` (Port 3006):** Provides high-performance search profiles.
8. **`media-service` (Port 3007):** Handles media uploads (images and videos) directly with S3.

---

## 🛠️ Tech Stack & Integrations

Our platform integrates with **10 AWS services**:
- **EKS (Kubernetes):** Container orchestration.
- **ECR:** Docker registry hosting.
- **VPC:** Secure isolated network structure.
- **RDS (PostgreSQL):** Relational databases.
- **DynamoDB:** Fast document-store databases.
- **ElastiCache (Redis):** Feed caching layer.
- **Cognito:** Secure user identity provider.
- **Secrets Manager:** Secure secret values injection.
- **S3:** Content delivery bucket for media.
- **SNS & SQS:** Event broker system for microservices communication.

---

## 🚀 Deployment & CI/CD

Continuous Integration and Continuous Deployment (GitOps) are fully automated via **GitHub Actions**:
- **Triggers:** Push to `main` branch.
- **Lint & Test:** Automatically validates linting rules and runs tests across workspaces.
- **Build & Push:** Compiles production Docker images for all 8 services and pushes them to Amazon ECR.
- **Deploy:** Authenticates with EKS and runs rolling-update upgrades using Helm charts.
