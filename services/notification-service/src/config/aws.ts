import { DynamoDBClient, CreateTableCommand, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { SQSClient, CreateQueueCommand, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { SNSClient, CreateTopicCommand, SubscribeCommand } from '@aws-sdk/client-sns';
import { config } from './index.js';

const ddbClientConfig: any = {
  region: config.AWS_REGION,
};

if (config.USE_LOCALSTACK === 'true') {
  ddbClientConfig.endpoint = config.DYNAMODB_ENDPOINT;
  ddbClientConfig.credentials = {
    accessKeyId: 'mock',
    secretAccessKey: 'mock',
  };
}

export const ddbClient = new DynamoDBClient(ddbClientConfig);
export const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const sqsClientConfig: any = {
  region: config.AWS_REGION,
};

if (config.USE_LOCALSTACK === 'true') {
  sqsClientConfig.endpoint = config.LOCALSTACK_ENDPOINT;
  sqsClientConfig.credentials = {
    accessKeyId: 'mock',
    secretAccessKey: 'mock',
  };
}

export const sqsClient = new SQSClient(sqsClientConfig);

const snsClientConfig: any = {
  region: config.AWS_REGION,
};

if (config.USE_LOCALSTACK === 'true') {
  snsClientConfig.endpoint = config.LOCALSTACK_ENDPOINT;
  snsClientConfig.credentials = {
    accessKeyId: 'mock',
    secretAccessKey: 'mock',
  };
}

export const snsClient = new SNSClient(snsClientConfig);

export async function ensureTableExists() {
  const tableName = config.DYNAMODB_TABLE;
  try {
    await ddbClient.send(new DescribeTableCommand({ TableName: tableName }));
    console.log(`DynamoDB Table ${tableName} exists.`);
  } catch (error: any) {
    if (error.name === 'ResourceNotFoundException' || error.message?.includes('ResourceNotFoundException') || error.message?.includes('Table not found')) {
      console.log(`Creating DynamoDB Table ${tableName}...`);
      await ddbClient.send(new CreateTableCommand({
        TableName: tableName,
        KeySchema: [
          { AttributeName: 'userId', KeyType: 'HASH' }, // Partition Key
          { AttributeName: 'id', KeyType: 'RANGE' }     // Sort Key (timestamp_uuid)
        ],
        AttributeDefinitions: [
          { AttributeName: 'userId', AttributeType: 'S' },
          { AttributeName: 'id', AttributeType: 'S' }
        ],
        BillingMode: 'PAY_PER_REQUEST'
      }));
      console.log(`DynamoDB Table ${tableName} created successfully.`);
    } else {
      console.error('Error describing DynamoDB Table:', error);
      throw error;
    }
  }
}

export async function ensureSqsSnsExists() {
  if (config.USE_LOCALSTACK !== 'true') return;

  try {
    console.log('Creating SQS Queue in LocalStack: user-notifications-queue...');
    const createQueueRes = await sqsClient.send(new CreateQueueCommand({
      QueueName: 'user-notifications-queue',
    }));
    const queueUrl = createQueueRes.QueueUrl;

    console.log('Creating SNS Topic in LocalStack: user-notifications-topic...');
    const createTopicRes = await snsClient.send(new CreateTopicCommand({
      Name: 'user-notifications-topic',
    }));
    const topicArn = createTopicRes.TopicArn;

    const queueAttributes = await sqsClient.send(new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ['QueueArn'],
    }));
    const queueArn = queueAttributes.Attributes?.QueueArn;

    if (topicArn && queueArn) {
      console.log(`Subscribing SQS queue (${queueArn}) to SNS topic (${topicArn})...`);
      await snsClient.send(new SubscribeCommand({
        TopicArn: topicArn,
        Protocol: 'sqs',
        Endpoint: queueArn,
      }));
    }
    console.log('SQS & SNS LocalStack initialization successful.');
  } catch (error) {
    console.error('Error initializing SQS/SNS in LocalStack:', error);
  }
}
