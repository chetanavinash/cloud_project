import { SQSClient, CreateQueueCommand, GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { SNSClient, CreateTopicCommand, SubscribeCommand } from '@aws-sdk/client-sns';
import { config } from './index.js';

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

export async function ensureSqsSnsExists() {
  if (config.USE_LOCALSTACK !== 'true') return;

  try {
    console.log('Creating SQS Queue in LocalStack: search-indexing-queue...');
    const createQueueRes = await sqsClient.send(new CreateQueueCommand({
      QueueName: 'search-indexing-queue',
    }));
    const queueUrl = createQueueRes.QueueUrl;

    console.log('Creating SNS Topic in LocalStack: search-indexing-topic...');
    const createTopicRes = await snsClient.send(new CreateTopicCommand({
      Name: 'search-indexing-topic',
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
    console.log('SQS & SNS LocalStack initialization successful for Search Service.');
  } catch (error) {
    console.error('Error initializing SQS/SNS in LocalStack for Search Service:', error);
  }
}
