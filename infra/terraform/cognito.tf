# Cognito User Pool
resource "aws_cognito_user_pool" "pool" {
  name = "${var.environment}-social-user-pool"

  # Password strength policy
  password_policy {
    minimum_length    = 8
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }

  # Allow user sign-up using email
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Verification email settings
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  # Standard user attributes schemas
  schema {
    attribute_data_type      = "String"
    developer_only_attribute = false
    mutable                  = true
    name                     = "name"
    required                 = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  tags = {
    Name = "${var.environment}-social-user-pool"
  }
}

# Cognito User Pool Client (used by Frontend Web/Mobile client)
resource "aws_cognito_user_pool_client" "client" {
  name         = "${var.environment}-social-app-client"
  user_pool_id = aws_cognito_user_pool.pool.id

  # Authentication flows
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH"
  ]

  # Token validity configurations
  id_token_validity      = 60 # 60 minutes
  access_token_validity  = 60 # 60 minutes
  refresh_token_validity = 30 # 30 days

  token_validity_units {
    id_token      = "minutes"
    access_token  = "minutes"
    refresh_token = "days"
  }

  prevent_user_existence_errors = "ENABLED"
}

# Cognito User Pool Domain (required for OAuth hosted UI)
resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${var.environment}-social-media-auth"
  user_pool_id = aws_cognito_user_pool.pool.id
}

output "cognito_user_pool_id" {
  value       = aws_cognito_user_pool.pool.id
  description = "The ID of the Cognito User Pool"
}

output "cognito_user_pool_client_id" {
  value       = aws_cognito_user_pool_client.client.id
  description = "The ID of the Cognito User Pool Client"
}

output "cognito_auth_domain" {
  value       = aws_cognito_user_pool_domain.main.domain
  description = "The Cognito authentication domain name"
}
