# ==============================================================================
# 1. Notifications Table
# ==============================================================================
resource "aws_dynamodb_table" "notifications" {
  name         = "${var.environment}-Notifications"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId" # PK
  range_key    = "id"     # SK

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.environment}-Notifications"
  }
}

# ==============================================================================
# 2. User Follows Table
# ==============================================================================
resource "aws_dynamodb_table" "user_follows" {
  name         = "${var.environment}-UserFollows"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "followerId"
  range_key    = "followingId"

  attribute {
    name = "followerId"
    type = "S"
  }

  attribute {
    name = "followingId"
    type = "S"
  }

  # GSI to query followers: "Who is following user X?"
  global_secondary_index {
    name            = "FollowingIndex"
    hash_key        = "followingId"
    range_key       = "followerId"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.environment}-UserFollows"
  }
}

# ==============================================================================
# 3. Post Likes Table
# ==============================================================================
resource "aws_dynamodb_table" "post_likes" {
  name         = "${var.environment}-PostLikes"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "postId"
  range_key    = "userId"

  attribute {
    name = "postId"
    type = "S"
  }

  attribute {
    name = "userId"
    type = "S"
  }

  # GSI to query all likes by a user: "What posts did user X like?"
  global_secondary_index {
    name            = "UserLikesIndex"
    hash_key        = "userId"
    range_key       = "postId"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.environment}-PostLikes"
  }
}

# ==============================================================================
# 4. Post Comments Table
# ==============================================================================
resource "aws_dynamodb_table" "post_comments" {
  name         = "${var.environment}-PostComments"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "postId"
  range_key    = "id"

  attribute {
    name = "postId"
    type = "S"
  }

  attribute {
    name = "id"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.environment}-PostComments"
  }
}

# ==============================================================================
# 5. Feed Items Table (Backup cache metadata / celebrity follows list)
# ==============================================================================
resource "aws_dynamodb_table" "feed_items" {
  name         = "${var.environment}-FeedItems"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "userId"
  range_key    = "postId"

  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "postId"
    type = "S"
  }

  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name = "${var.environment}-FeedItems"
  }
}
