import Redis from 'ioredis';
import { config } from './index.js';

export const redis = new Redis({
  host: config.REDIS_HOST,
  port: Number(config.REDIS_PORT),
  maxRetriesPerRequest: null,
});

redis.on('error', (err) => {
  console.error('Redis client error:', err);
});
