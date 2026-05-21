import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const envSchema = z.object({
  PORT: z.string().default('3005'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  AWS_REGION: z.string().default('us-east-1'),
  USE_LOCALSTACK: z.string().default('true'),
  LOCALSTACK_ENDPOINT: z.string().default('http://localhost:4566'),
  DYNAMODB_ENDPOINT: z.string().default('http://localhost:8000'),
  DYNAMODB_TABLE: z.string().default('Notifications'),
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
