#!/bin/bash
echo "########### Initializing LocalStack AWS Resources ###########"

# 1. Create S3 Bucket
echo "Creating S3 bucket: social-media-attachments..."
awslocal s3api create-bucket --bucket social-media-attachments --region us-east-1
awslocal s3api put-bucket-cors --bucket social-media-attachments --cors-configuration file:///etc/localstack/init/ready.d/cors.json --region us-east-1


# 2. Create SNS Topics
echo "Creating SNS Topics..."
awslocal sns create-topic --name social-post-created-topic --region us-east-1
awslocal sns create-topic --name search-indexing-topic --region us-east-1
awslocal sns create-topic --name user-notifications-topic --region us-east-1

# 3. Create SQS Queues
echo "Creating SQS Queues..."
awslocal sqs create-queue --queue-name social-fanout-queue --region us-east-1
awslocal sqs create-queue --queue-name social-analytics-queue --region us-east-1
awslocal sqs create-queue --queue-name search-indexing-queue --region us-east-1
awslocal sqs create-queue --queue-name user-notifications-queue --region us-east-1

# 4. Subscribe SQS to SNS Topics
# Fetch ARN strings
POST_TOPIC_ARN="arn:aws:sns:us-east-1:000000000000:social-post-created-topic"
SEARCH_TOPIC_ARN="arn:aws:sns:us-east-1:000000000000:search-indexing-topic"
NOTIFICATION_TOPIC_ARN="arn:aws:sns:us-east-1:000000000000:user-notifications-topic"

FANOUT_QUEUE_ARN="arn:aws:sqs:us-east-1:000000000000:social-fanout-queue"
ANALYTICS_QUEUE_ARN="arn:aws:sqs:us-east-1:000000000000:social-analytics-queue"
SEARCH_QUEUE_ARN="arn:aws:sqs:us-east-1:000000000000:search-indexing-queue"
NOTIFICATION_QUEUE_ARN="arn:aws:sqs:us-east-1:000000000000:user-notifications-queue"

echo "Subscribing SQS queues to SNS topics..."
# Fanout and Analytics subscribe to Post Created
awslocal sns subscribe --topic-arn "$POST_TOPIC_ARN" --protocol sqs --notification-endpoint "$FANOUT_QUEUE_ARN" --region us-east-1
awslocal sns subscribe --topic-arn "$POST_TOPIC_ARN" --protocol sqs --notification-endpoint "$ANALYTICS_QUEUE_ARN" --region us-east-1

# Search Indexing queue subscribes to both search-indexing-topic (users) and social-post-created-topic (posts)
awslocal sns subscribe --topic-arn "$SEARCH_TOPIC_ARN" --protocol sqs --notification-endpoint "$SEARCH_QUEUE_ARN" --region us-east-1
awslocal sns subscribe --topic-arn "$POST_TOPIC_ARN" --protocol sqs --notification-endpoint "$SEARCH_QUEUE_ARN" --region us-east-1

# Notifications queue subscribes to user-notifications-topic
awslocal sns subscribe --topic-arn "$NOTIFICATION_TOPIC_ARN" --protocol sqs --notification-endpoint "$NOTIFICATION_QUEUE_ARN" --region us-east-1

echo "########### LocalStack Initialization Complete ###########"
