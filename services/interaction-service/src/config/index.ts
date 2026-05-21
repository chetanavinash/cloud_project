import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3003'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string(),
  COGNITO_USER_POOL_ID: z.string().optional(),
  COGNITO_CLIENT_ID: z.string().optional(),
  AWS_REGION: z.string().default('us-east-1'),
  LOCALSTACK_ENDPOINT: z.string().default('http://localhost:4566'),
  USE_LOCALSTACK: z.string().default('true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables for interaction-service:', parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
