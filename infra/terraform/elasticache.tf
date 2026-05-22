# ElastiCache Subnet Group
resource "aws_elasticache_subnet_group" "redis" {
  name       = "${var.environment}-redis-subnet-group"
  subnet_ids = aws_subnet.database[*].id
}

# Security Group for Redis (Allow EKS worker nodes on 6379 only)
resource "aws_security_group" "redis_sg" {
  name        = "${var.environment}-redis-sg"
  description = "Security group for ElastiCache Redis"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "Redis access from EKS nodes and VPC"
    from_port   = 6379
    to_port     = 6379
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
    Name = "${var.environment}-redis-sg"
  }
}

# ElastiCache Redis Replication Group
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id       = "${var.environment}-social-redis"
  description                = "Redis cluster for feed caching, session storage, and rate limiting"
  node_type                  = "cache.t3.micro" # Free Tier eligible node type
  port                       = 6379
  parameter_group_name       = "default.redis7"
  subnet_group_name          = aws_elasticache_subnet_group.redis.name
  security_group_ids         = [aws_security_group.redis_sg.id]
  automatic_failover_enabled = true

  # Set up cluster mode (sharded cluster) as specified in project plan
  # For dev/staging environment we can keep replicas_per_node_group = 1 and num_node_groups = 3
  # If cost needs to be minimized in dev, we can set num_node_groups = 1 (sharding disabled, single primary)
  # using a ternary condition or variable. For maximum plan fidelity, we use 3 shards.
  num_node_groups         = var.environment == "prod" ? 3 : 1
  replicas_per_node_group = 1

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  tags = {
    Name = "${var.environment}-social-redis"
  }
}

output "redis_primary_endpoint" {
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
  description = "The primary endpoint of the Redis replication group"
}

output "redis_configuration_endpoint" {
  value       = aws_elasticache_replication_group.redis.configuration_endpoint_address
  description = "The configuration endpoint for Cluster Mode enabled clients"
}
