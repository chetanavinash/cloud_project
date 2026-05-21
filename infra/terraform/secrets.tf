# ==============================================================================
# Helper template for IRSA Assume Role Policy (EKS OpenID Connect federated trust)
# ==============================================================================
data "aws_iam_policy_document" "irsa_assume_role" {
  for_each = toset(local.services)

  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    effect  = "Allow"

    condition {
      test     = "StringEquals"
      # OIDC provider URL without https:// protocol prefix
      variable = "${replace(aws_iam_openid_connect_provider.eks.url, "https://", "")}:sub"
      # Matches "system:serviceaccount:<namespace>:<serviceaccount-name>"
      values   = ["system:serviceaccount:${var.environment}:${each.value}-sa"]
    }

    condition {
      test     = "StringEquals"
      variable = "${replace(aws_iam_openid_connect_provider.eks.url, "https://", "")}:aud"
      values   = ["sts.amazonaws.com"]
    }

    principals {
      identifiers = [aws_iam_openid_connect_provider.eks.arn]
      type        = "Federated"
    }
  }
}

# ==============================================================================
# ECR Repository Access Policy (common for all services to pull images)
# ==============================================================================
resource "aws_iam_policy" "ecr_readonly" {
  name        = "${var.environment}-eks-ecr-readonly-policy"
  description = "Allows read-only access to ECR repositories"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage"
        ]
        Resource = "*"
      }
    ]
  })
}

# ==============================================================================
# 1. User Service IAM Role & Secrets
# ==============================================================================
resource "aws_iam_role" "user_service" {
  name               = "${var.environment}-user-service-role"
  assume_role_policy = data.aws_iam_policy_document.irsa_assume_role["user-service"].json
}

# 2. Post Service IAM Role & Secrets
# ==============================================================================
resource "aws_iam_role" "post_service" {
  name               = "${var.environment}-post-service-role"
  assume_role_policy = data.aws_iam_policy_document.irsa_assume_role["post-service"].json
}

# 3. Interaction Service IAM Role & Secrets
# ==============================================================================
resource "aws_iam_role" "interaction_service" {
  name               = "${var.environment}-interaction-service-role"
  assume_role_policy = data.aws_iam_policy_document.irsa_assume_role["interaction-service"].json
}

# Allow interaction-service to read/write to Likes and Comments DynamoDB tables
resource "aws_iam_policy" "interaction_db_policy" {
  name        = "${var.environment}-interaction-db-policy"
  description = "Allows access to DynamoDB tables for Interaction service"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.post_likes.arn,
          "${aws_dynamodb_table.post_likes.arn}/index/*",
          aws_dynamodb_table.post_comments.arn
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "interaction_db" {
  policy_arn = aws_iam_policy.interaction_db_policy.arn
  role       = aws_iam_role.interaction_service.name
}

# 4. Feed Service IAM Role
# ==============================================================================
resource "aws_iam_role" "feed_service" {
  name               = "${var.environment}-feed-service-role"
  assume_role_policy = data.aws_iam_policy_document.irsa_assume_role["feed-service"].json
}

# 5. Notification Service IAM Role & Policies
# ==============================================================================
resource "aws_iam_role" "notification_service" {
  name               = "${var.environment}-notification-service-role"
  assume_role_policy = data.aws_iam_policy_document.irsa_assume_role["notification-service"].json
}

# Allow notification-service to write/query Notifications DynamoDB table
resource "aws_iam_policy" "notification_db_policy" {
  name        = "${var.environment}-notification-db-policy"
  description = "Allows access to Notifications table in DynamoDB"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan"
        ]
        Resource = [
          aws_dynamodb_table.notifications.arn
        ]
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "notification_db" {
  policy_arn = aws_iam_policy.notification_db_policy.arn
  role       = aws_iam_role.notification_service.name
}

# 6. Search Service IAM Role & Policies
# ==============================================================================
resource "aws_iam_role" "search_service" {
  name               = "${var.environment}-search-service-role"
  assume_role_policy = data.aws_iam_policy_document.irsa_assume_role["search-service"].json
}

# 7. Media Service IAM Role & Policies
# ==============================================================================
resource "aws_iam_role" "media_service" {
  name               = "${var.environment}-media-service-role"
  assume_role_policy = data.aws_iam_policy_document.irsa_assume_role["media-service"].json
}

# ==============================================================================
# Outputs of IAM Roles (used by Helm ServiceAccount annotations)
# ==============================================================================
output "irsa_roles" {
  value = {
    user-service        = aws_iam_role.user_service.arn
    post-service        = aws_iam_role.post_service.arn
    interaction-service = aws_iam_role.interaction_service.arn
    feed-service        = aws_iam_role.feed_service.arn
    notification-service = aws_iam_role.notification_service.arn
    search-service      = aws_iam_role.search_service.arn
    media-service       = aws_iam_role.media_service.arn
  }
  description = "ARNs of IAM roles for Kubernetes Service Accounts (IRSA)"
}
