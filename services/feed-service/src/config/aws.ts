import { SQSClient } from '@aws-sdk/client-sqs';
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
