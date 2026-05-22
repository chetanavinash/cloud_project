# ==============================================================================
# SQS Queues
# ==============================================================================
resource "aws_sqs_queue" "user_notifications" {
  name                      = "${var.environment}-user-notifications-queue"
  message_retention_seconds = 86400
  receive_wait_time_seconds = 10
}

resource "aws_sqs_queue" "search_indexing" {
  name                      = "${var.environment}-search-indexing-queue"
  message_retention_seconds = 86400
  receive_wait_time_seconds = 10
}

resource "aws_sqs_queue" "social_fanout" {
  name                      = "${var.environment}-social-fanout-queue"
  message_retention_seconds = 86400
  receive_wait_time_seconds = 10
}

# ==============================================================================
# SNS Topics
# ==============================================================================
resource "aws_sns_topic" "user_notifications" {
  name = "${var.environment}-user-notifications-topic"
}

resource "aws_sns_topic" "search_indexing" {
  name = "${var.environment}-search-indexing-topic"
}

# ==============================================================================
# SQS Subscriptions to SNS Topics (Fan-out)
# ==============================================================================
resource "aws_sns_topic_subscription" "user_notifications_sub" {
  topic_arn = aws_sns_topic.user_notifications.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.user_notifications.arn
}

resource "aws_sns_topic_subscription" "search_indexing_sub" {
  topic_arn = aws_sns_topic.search_indexing.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.search_indexing.arn
}

resource "aws_sns_topic_subscription" "social_fanout_sub" {
  topic_arn = aws_sns_topic.search_indexing.arn
  protocol  = "sqs"
  endpoint  = aws_sqs_queue.social_fanout.arn
}

# ==============================================================================
# SQS Queue Policies to Allow SNS Topic Deliveries
# ==============================================================================
resource "aws_sqs_queue_policy" "user_notifications" {
  queue_url = aws_sqs_queue.user_notifications.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = "*"
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.user_notifications.arn
      Condition = {
        ArnEquals = {
          "aws:SourceArn" = aws_sns_topic.user_notifications.arn
        }
      }
    }]
  })
}

resource "aws_sqs_queue_policy" "search_indexing" {
  queue_url = aws_sqs_queue.search_indexing.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = "*"
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.search_indexing.arn
      Condition = {
        ArnEquals = {
          "aws:SourceArn" = aws_sns_topic.search_indexing.arn
        }
      }
    }]
  })
}

resource "aws_sqs_queue_policy" "social_fanout" {
  queue_url = aws_sqs_queue.social_fanout.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = "*"
      Action    = "sqs:SendMessage"
      Resource  = aws_sqs_queue.social_fanout.arn
      Condition = {
        ArnEquals = {
          "aws:SourceArn" = aws_sns_topic.search_indexing.arn
        }
      }
    }]
  })
}

# ==============================================================================
# IAM Policies for EKS Service Roles (Least Privilege)
# ==============================================================================

# Publisher permission for post, user, and interaction services to publish to SNS
resource "aws_iam_role_policy" "sns_publish" {
  name = "${var.environment}-sns-publish-policy"
  role = aws_iam_role.post_service.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = "sns:Publish"
      Resource = [
        aws_sns_topic.user_notifications.arn,
        aws_sns_topic.search_indexing.arn
      ]
    }]
  })
}

# User service only needs access to publish notifications
resource "aws_iam_role_policy" "user_sns_publish" {
  name = "${var.environment}-user-sns-publish-policy"
  role = aws_iam_role.user_service.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = "sns:Publish"
      Resource = aws_sns_topic.user_notifications.arn
    }]
  })
}

# Interaction service also needs to publish notification events
resource "aws_iam_role_policy" "interaction_sns_publish" {
  name = "${var.environment}-interaction-sns-publish-policy"
  role = aws_iam_role.interaction_service.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = "sns:Publish"
      Resource = aws_sns_topic.user_notifications.arn
    }]
  })
}

# Notification service SQS consumer permission
resource "aws_iam_role_policy" "notification_sqs" {
  name = "${var.environment}-notification-sqs-policy"
  role = aws_iam_role.notification_service.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ]
      Resource = aws_sqs_queue.user_notifications.arn
    }]
  })
}

# Search service SQS consumer permission
resource "aws_iam_role_policy" "search_sqs" {
  name = "${var.environment}-search-sqs-policy"
  role = aws_iam_role.search_service.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ]
      Resource = aws_sqs_queue.search_indexing.arn
    }]
  })
}

# Feed service SQS consumer permission
resource "aws_iam_role_policy" "feed_sqs" {
  name = "${var.environment}-feed-sqs-policy"
  role = aws_iam_role.feed_service.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Action = [
        "sqs:ReceiveMessage",
        "sqs:DeleteMessage",
        "sqs:GetQueueAttributes"
      ]
      Resource = aws_sqs_queue.social_fanout.arn
    }]
  })
}
