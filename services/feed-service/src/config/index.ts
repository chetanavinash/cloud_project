import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3004'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  USER_DATABASE_URL: z.string(),
  POST_DATABASE_URL: z.string(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379'),
  COGNITO_USER_POOL_ID: z.string().optional(),
  COGNITO_CLIENT_ID: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  LOCALSTACK_ENDPOINT: z.string().default('http://localhost:4566'),
  USE_LOCALSTACK: z.string().default('true'),
  SQS_QUEUE_URL: z.string().default('http://localhost:4566/000000000000/social-fanout-queue'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
