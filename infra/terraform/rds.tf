# DB Subnet Group for the Aurora Cluster
resource "aws_db_subnet_group" "db_subnet_group" {
  name       = "${var.environment}-db-subnet-group"
  subnet_ids = aws_subnet.database[*].id

  tags = {
    Name = "${var.environment}-db-subnet-group"
  }
}

# Security Group for Database (Allow inbound Postgres from EKS nodes only)
resource "aws_security_group" "db_sg" {
  name        = "${var.environment}-db-sg"
  description = "Allow inbound traffic from EKS worker nodes to PostgreSQL"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "PostgreSQL access from EKS nodes and VPC"
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    cidr_blocks = [var.vpc_cidr]
  }

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  tags = {
    Name = "${var.environment}-db-sg"
  }
}

# Generate random password for DB master user
resource "random_password" "db_password" {
  length           = 16
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# Single Instance PostgreSQL Database (Cost-Optimized & Free Tier Compliant)
resource "aws_db_instance" "postgres" {
  identifier             = "${var.environment}-social-db-instance"
  allocated_storage      = 20
  max_allocated_storage  = 100
  engine                 = "postgres"
  engine_version         = "15" # Uses major version to automatically pick the latest supported minor version
  instance_class         = "db.t3.micro" # Fully Free Tier eligible
  db_name                = "postgres"
  username               = "postgres"
  password               = random_password.db_password.result
  db_subnet_group_name   = aws_db_subnet_group.db_subnet_group.name
  vpc_security_group_ids = [aws_security_group.db_sg.id]
  skip_final_snapshot    = true
  publicly_accessible    = false

  tags = {
    Name = "${var.environment}-social-db-instance"
  }
}

# Outputs
output "rds_cluster_endpoint" {
  value       = aws_db_instance.postgres.address
  description = "The database instance endpoint address"
}

output "rds_cluster_reader_endpoint" {
  value       = aws_db_instance.postgres.address
  description = "The database instance reader address (same as writer for single instance)"
}

output "rds_database_name" {
  value       = aws_db_instance.postgres.db_name
  description = "The master database name"
}

output "rds_master_username" {
  value       = aws_db_instance.postgres.username
  description = "The master DB username"
}

output "rds_master_password_secret_name" {
  value       = aws_secretsmanager_secret.db_credentials.name
  description = "Secrets Manager secret name containing RDS master password"
}

# Dummy helper variable to mark password sensitive if needed in other scopes
variable "dummy_db_password" {
  type      = string
  default   = "sensitive"
  sensitive = true
}

resource "aws_secretsmanager_secret" "db_credentials" {
  name                    = "${var.environment}-rds-db-credentials"
  recovery_window_in_days = 0 # Force deletion on destroy
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    engine   = "postgres"
    host     = aws_db_instance.postgres.address
    port     = 5432
    username = aws_db_instance.postgres.username
    password = random_password.db_password.result
  })
}

