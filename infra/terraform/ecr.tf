# Define the list of repositories we want to create
locals {
  services = [
    "user-service",
    "post-service",
    "interaction-service",
    "feed-service",
    "notification-service",
    "search-service",
    "media-service",
    "analytics-service",
    "frontend"
  ]
}

# Create ECR Repositories for each service and the frontend
resource "aws_ecr_repository" "repos" {
  for_each             = toset(local.services)
  name                 = "${var.environment}-${each.value}"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  tags = {
    Name = "${var.environment}-${each.value}-ecr"
  }
}

# Apply lifecycle policy to clean up old untagged images (keeps costs low)
resource "aws_ecr_lifecycle_policy" "repo_policy" {
  for_each   = toset(local.services)
  repository = aws_ecr_repository.repos[each.value].name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
}

output "ecr_repository_urls" {
  value       = { for k, v in aws_ecr_repository.repos : k => v.repository_url }
  description = "The URLs of the created ECR repositories"
}
