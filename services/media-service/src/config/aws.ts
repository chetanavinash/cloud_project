import { S3Client } from '@aws-sdk/client-s3';
import { config } from './index.js';

const s3ClientConfig: any = {
  region: config.AWS_REGION,
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
};

if (config.USE_LOCALSTACK === 'true') {
  s3ClientConfig.endpoint = config.LOCALSTACK_ENDPOINT;
  s3ClientConfig.forcePathStyle = true; // Required for LocalStack
  s3ClientConfig.credentials = {
    accessKeyId: 'mock',
    secretAccessKey: 'mock',
  };
}

export const s3Client = new S3Client(s3ClientConfig);
