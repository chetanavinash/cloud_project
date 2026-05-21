import { SNSClient } from '@aws-sdk/client-sns';
import { config } from './index.js';

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
