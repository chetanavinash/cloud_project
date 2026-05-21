import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3006'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string(),
  AWS_REGION: z.string().default('us-east-1'),
  USE_LOCALSTACK: z.string().default('true'),
  LOCALSTACK_ENDPOINT: z.string().default('http://127.0.0.1:4566'),
  SQS_QUEUE_URL: z.string(),
  SNS_TOPIC_ARN: z.string(),
  COGNITO_USER_POOL_ID: z.string().optional(),
  COGNITO_CLIENT_ID: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
