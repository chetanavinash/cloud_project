# 1. Fetch available Availability Zones in the region
data "aws_availability_zones" "available" {
  state = "available"
}

# 2. Create the VPC
resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name = "${var.environment}-vpc"
  }
}

# 3. Create the Internet Gateway (for Public Subnets)
resource "aws_internet_gateway" "gw" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.environment}-igw"
  }
}

# 4. Create Public Subnets (3 AZs)
resource "aws_subnet" "public" {
  count                   = 3
  vpc_id                  = aws_vpc.main.id
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, count.index) # 10.0.0.0/20, 10.0.16.0/20, 10.0.32.0/20
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = {
    Name                                           = "${var.environment}-public-${data.aws_availability_zones.available.names[count.index]}"
    "kubernetes.io/cluster/${var.cluster_name}"     = "shared"
    "kubernetes.io/role/elb"                       = "1"
  }
}

# 5. Create Private Subnets for EKS Nodes (3 AZs)
resource "aws_subnet" "private" {
  count             = 3
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 4) # 10.0.64.0/20, 10.0.80.0/20, 10.0.96.0/20
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name                                           = "${var.environment}-private-${data.aws_availability_zones.available.names[count.index]}"
    "kubernetes.io/cluster/${var.cluster_name}"     = "shared"
    "kubernetes.io/role/internal-elb"              = "1"
  }
}

# 6. Create strictly isolated Database Private Subnets (3 AZs)
resource "aws_subnet" "database" {
  count             = 3
  vpc_id            = aws_vpc.main.id
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, count.index + 8) # 10.0.128.0/20, 10.0.144.0/20, 10.0.160.0/20
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = {
    Name = "${var.environment}-database-${data.aws_availability_zones.available.names[count.index]}"
  }
}

# 7. Create EIP for NAT Gateway
resource "aws_eip" "nat" {
  domain = "vpc"

  tags = {
    Name = "${var.environment}-nat-eip"
  }
}

# 8. Create a single NAT Gateway (placed in Public Subnet 1) to save costs
resource "aws_nat_gateway" "nat" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public[0].id

  tags = {
    Name = "${var.environment}-nat-gateway"
  }

  depends_on = [aws_internet_gateway.gw]
}

# 9. Route Table for Public Subnets
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.gw.id
  }

  tags = {
    Name = "${var.environment}-public-rt"
  }
}

# 10. Route Table for Private Subnets (EKS Nodes) pointing to NAT Gateway
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.nat.id
  }

  tags = {
    Name = "${var.environment}-private-rt"
  }
}

# 11. Route Table for strictly isolated Database Subnets (No direct outbound routes)
resource "aws_route_table" "database" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name = "${var.environment}-database-rt"
  }
}

# 12. Public Route Table Associations
resource "aws_route_table_association" "public" {
  count          = 3
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# 13. Private Route Table Associations
resource "aws_route_table_association" "private" {
  count          = 3
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# 14. Database Route Table Associations
resource "aws_route_table_association" "database" {
  count          = 3
  subnet_id      = aws_subnet.database[count.index].id
  route_table_id = aws_route_table.database.id
}

# 15. Outputs
output "vpc_id" {
  value       = aws_vpc.main.id
  description = "The ID of the VPC"
}

output "public_subnet_ids" {
  value       = aws_subnet.public[*].id
  description = "List of public subnet IDs"
}

output "private_subnet_ids" {
  value       = aws_subnet.private[*].id
  description = "List of private subnet IDs for EKS worker nodes"
}

output "database_subnet_ids" {
  value       = aws_subnet.database[*].id
  description = "List of strictly isolated database subnet IDs"
}
