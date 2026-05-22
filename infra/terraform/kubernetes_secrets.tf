# ==============================================================================
# Kubernetes Provider & Resources Configuration (Dynamic EKS Authentication)
# ==============================================================================

data "aws_eks_cluster_auth" "cluster" {
  name = aws_eks_cluster.main.name
}

provider "kubernetes" {
  host                   = aws_eks_cluster.main.endpoint
  cluster_ca_certificate = base64decode(aws_eks_cluster.main.certificate_authority[0].data)
  token                  = data.aws_eks_cluster_auth.cluster.token
}

# Inject connection strings, endpoints, client credentials and ARNs into cluster secret
resource "kubernetes_secret" "app_secrets" {
  metadata {
    name      = "app-secrets"
    namespace = "default"
  }

  data = {
    "user-database-url"          = "postgresql://${aws_db_instance.postgres.username}:${random_password.db_password.result}@${aws_db_instance.postgres.address}:5432/user_service_db?schema=public"
    "post-database-url"          = "postgresql://${aws_db_instance.postgres.username}:${random_password.db_password.result}@${aws_db_instance.postgres.address}:5432/post_service_db?schema=public"
    "interaction-database-url"   = "postgresql://${aws_db_instance.postgres.username}:${random_password.db_password.result}@${aws_db_instance.postgres.address}:5432/interaction_service_db?schema=public"
    "search-database-url"        = "postgresql://${aws_db_instance.postgres.username}:${random_password.db_password.result}@${aws_db_instance.postgres.address}:5432/search_service_db?schema=public"
    "redis-host"                 = aws_elasticache_replication_group.redis.primary_endpoint_address
    "cognito-user-pool-id"       = aws_cognito_user_pool.pool.id
    "cognito-client-id"          = aws_cognito_user_pool_client.client.id
    "s3-bucket-name"             = aws_s3_bucket.attachments.id
    "feed-sqs-queue-url"         = aws_sqs_queue.social_fanout.id
    "notification-sqs-queue-url"  = aws_sqs_queue.user_notifications.id
    "search-sqs-queue-url"       = aws_sqs_queue.search_indexing.id
    "notification-sns-topic-arn" = aws_sns_topic.user_notifications.arn
    "search-sns-topic-arn"       = aws_sns_topic.search_indexing.arn
  }

  type = "Opaque"

  # Wait for EKS Node Group to be online before attempting to communicate with cluster API
  depends_on = [
    aws_eks_node_group.general
  ]
}

# Generate a unique suffix for the database initializer job on each run / configuration change
resource "random_id" "db_init_suffix" {
  keepers = {
    db_host     = aws_db_instance.postgres.address
    db_password = random_password.db_password.result
  }
  byte_length = 4
}

# Lightweight, automated one-shot Job to initialize schemas databases in RDS PostgreSQL
resource "kubernetes_job" "db_initializer" {
  metadata {
    name      = "db-initializer-${random_id.db_init_suffix.hex}"
    namespace = "default"
  }

  spec {
    template {
      metadata {}
      spec {
        container {
          name    = "postgres-init"
          image   = "postgres:15-alpine"
          command = [
            "sh",
            "-c",
            "echo 'Checking/Creating databases...'; for db in user_service_db post_service_db interaction_service_db search_service_db; do PGPASSWORD=\"$DB_PASSWORD\" psql -h \"$DB_HOST\" -U \"$DB_USER\" -d postgres -tc \"SELECT 1 FROM pg_database WHERE datname = '$db'\" | grep -q 1 || PGPASSWORD=\"$DB_PASSWORD\" psql -h \"$DB_HOST\" -U \"$DB_USER\" -d postgres -c \"CREATE DATABASE $db;\"; done"
          ]

          env {
            name  = "DB_HOST"
            value = aws_db_instance.postgres.address
          }
          env {
            name  = "DB_USER"
            value = aws_db_instance.postgres.username
          }
          env {
            name  = "DB_PASSWORD"
            value = random_password.db_password.result
          }
        }
        restart_policy = "Never"
      }
    }
    backoff_limit = 4
  }

  wait_for_completion = true

  timeouts {
    create = "10m"
  }

  # Ensure RDS is fully available and EKS worker nodes are online to schedule the job
  depends_on = [
    aws_db_instance.postgres,
    aws_eks_node_group.general
  ]
}
