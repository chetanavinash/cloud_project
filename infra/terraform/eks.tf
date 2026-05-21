# ==============================================================================
# 1. IAM Role for EKS Cluster (Control Plane)
# ==============================================================================
resource "aws_iam_role" "eks_cluster" {
  name = "${var.environment}-eks-cluster-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "eks.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "eks_cluster_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy"
  role       = aws_iam_role.eks_cluster.name
}

# ==============================================================================
# 2. Security Group for EKS Cluster Control Plane
# ==============================================================================
resource "aws_security_group" "eks_cluster" {
  name        = "${var.environment}-eks-cluster-sg"
  description = "Security group for EKS cluster control plane"
  vpc_id      = aws_vpc.main.id

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  tags = {
    Name = "${var.environment}-eks-cluster-sg"
  }
}

# ==============================================================================
# 3. EKS Cluster (Control Plane)
# ==============================================================================
resource "aws_eks_cluster" "main" {
  name     = var.cluster_name
  version  = "1.29"
  role_arn = aws_iam_role.eks_cluster.arn

  vpc_config {
    subnet_ids              = aws_subnet.private[*].id
    security_group_ids      = [aws_security_group.eks_cluster.id]
    endpoint_private_access = true
    endpoint_public_access  = true # Enable public access for local kubectl config (secured via IAM)
  }

  depends_on = [
    aws_iam_role_policy_attachment.eks_cluster_policy
  ]

  tags = {
    Name = var.cluster_name
  }
}

# ==============================================================================
# 4. IAM Role for EKS Worker Nodes
# ==============================================================================
resource "aws_iam_role" "eks_nodes" {
  name = "${var.environment}-eks-node-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "ec2.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy_attachment" "amazon_eks_worker_node_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKSWorkerNodePolicy"
  role       = aws_iam_role.eks_nodes.name
}

resource "aws_iam_role_policy_attachment" "amazon_eks_cni_policy" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEKS_CNI_Policy"
  role       = aws_iam_role.eks_nodes.name
}

resource "aws_iam_role_policy_attachment" "amazon_ec2_container_registry_read_only" {
  policy_arn = "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly"
  role       = aws_iam_role.eks_nodes.name
}

# ==============================================================================
# 5. EKS Managed Node Group (Cost-Optimized t3.medium Instances)
# ==============================================================================
resource "aws_eks_node_group" "general" {
  cluster_name    = aws_eks_cluster.main.name
  node_group_name = "${var.environment}-general-node-group"
  node_role_arn   = aws_iam_role.eks_nodes.arn
  subnet_ids      = aws_subnet.private[*].id

  instance_types = ["t3.medium"] # 2 vCPU, 4GB RAM - perfect for running multi-container workloads on a budget

  scaling_config {
    desired_size = 2
    max_size     = 5
    min_size     = 1
  }

  update_config {
    max_unavailable = 1
  }

  depends_on = [
    aws_iam_role_policy_attachment.amazon_eks_worker_node_policy,
    aws_iam_role_policy_attachment.amazon_eks_cni_policy,
    aws_iam_role_policy_attachment.amazon_ec2_container_registry_read_only
  ]

  tags = {
    Name = "${var.environment}-general-nodes"
  }
}

# ==============================================================================
# 6. IAM OIDC Provider Configuration (for IRSA)
# ==============================================================================
data "tls_certificate" "eks" {
  url = aws_eks_cluster.main.identity[0].oidc[0].issuer
}

resource "aws_iam_openid_connect_provider" "eks" {
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = [data.tls_certificate.eks.certificates[0].sha1_fingerprint]
  url             = aws_eks_cluster.main.identity[0].oidc[0].issuer
}

# ==============================================================================
# Outputs
# ==============================================================================
output "eks_cluster_name" {
  value       = aws_eks_cluster.main.name
  description = "The EKS cluster name"
}

output "eks_cluster_endpoint" {
  value       = aws_eks_cluster.main.endpoint
  description = "Endpoint for EKS control plane"
}

output "eks_cluster_security_group_id" {
  value       = aws_eks_cluster.main.vpc_config[0].cluster_security_group_id
  description = "Security group ID attached to the EKS control plane"
}

output "eks_oidc_provider_arn" {
  value       = aws_iam_openid_connect_provider.eks.arn
  description = "ARN of the OIDC provider for IRSA"
}

output "eks_oidc_issuer" {
  value       = aws_eks_cluster.main.identity[0].oidc[0].issuer
  description = "EKS cluster OIDC issuer URL"
}
