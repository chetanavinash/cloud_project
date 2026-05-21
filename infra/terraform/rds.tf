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
    description     = "PostgreSQL access from EKS nodes"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_eks_cluster.main.vpc_config[0].cluster_security_group_id]
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

# Aurora PostgreSQL Cluster
resource "aws_rds_cluster" "aurora" {
  cluster_identifier      = "${var.environment}-social-db-cluster"
  engine                  = "aurora-postgresql"
  engine_version          = "15.4" # Engine version aligned with standard 15-alpine
  database_name           = "postgres"
  master_username         = "postgres"
  master_password         = random_password.db_password.result
  backup_retention_period = 5
  preferred_backup_window = "07:00-09:00"
  db_subnet_group_name    = aws_db_subnet_group.db_subnet_group.name
  vpc_security_group_ids  = [aws_security_group.db_sg.id]
  skip_final_snapshot     = true

  # Serverless v2 configuration
  serverless_v2_scaling_configuration {
    min_capacity = 0.5
    max_capacity = 2.0
  }

  tags = {
    Name = "${var.environment}-social-db-cluster"
  }
}

# Aurora Cluster Instances (Serverless v2 for cost savings)
resource "aws_rds_cluster_instance" "cluster_instances" {
  count              = var.environment == "prod" ? 2 : 1 # Multi-AZ in prod, single-AZ in dev/staging to save cost
  identifier         = "${var.environment}-social-db-instance-${count.index}"
  cluster_identifier = aws_rds_cluster.aurora.id
  instance_class     = "db.serverless"
  engine             = aws_rds_cluster.aurora.engine
  engine_version     = aws_rds_cluster.aurora.engine_version
  db_subnet_group_name = aws_db_subnet_group.db_subnet_group.name

  tags = {
    Name = "${var.environment}-social-db-instance-${count.index}"
  }
}

# Outputs
output "rds_cluster_endpoint" {
  value       = aws_rds_cluster.aurora.endpoint
  description = "The cluster writer endpoint"
}

output "rds_cluster_reader_endpoint" {
  value       = aws_rds_cluster.aurora.reader_endpoint
  description = "The cluster reader endpoint"
}

output "rds_database_name" {
  value       = aws_rds_cluster.aurora.database_name
  description = "The master database name"
}

output "rds_master_username" {
  value       = aws_rds_cluster.aurora.master_username
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
    engine   = "aurora-postgresql"
    host     = aws_rds_cluster.aurora.endpoint
    port     = 5432
    username = aws_rds_cluster.aurora.master_username
    password = random_password.db_password.result
  })
}
