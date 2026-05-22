data "aws_caller_identity" "current" {}

resource "aws_s3_bucket" "attachments" {
  bucket        = "dev-social-media-attachments-${data.aws_caller_identity.current.account_id}"
  force_destroy = true # Safe for dev environment to ensure easy cleanup

  tags = {
    Name        = "dev-social-media-attachments"
    Environment = var.environment
  }
}

# Block all public access by default
resource "aws_s3_bucket_public_access_block" "attachments" {
  bucket = aws_s3_bucket.attachments.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Attach IAM policy to media-service role to allow read/write to the S3 bucket
resource "aws_iam_role_policy" "media_s3" {
  name = "${var.environment}-media-s3-policy"
  role = aws_iam_role.media_service.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.attachments.arn,
          "${aws_s3_bucket.attachments.arn}/*"
        ]
      }
    ]
  })
}

output "s3_bucket_name" {
  value       = aws_s3_bucket.attachments.id
  description = "The name of the S3 bucket for media attachments"
}
