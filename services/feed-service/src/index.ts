import { buildServer } from './server.js';
import { config } from './config/index.js';
import { userPrisma, postPrisma } from './config/db.js';
import { redis } from './config/redis.js';
import * as sqsConsumer from './sqs/consumer.js';

const server = await buildServer();

const port = Number(config.PORT);

try {
  await server.listen({ port, host: '0.0.0.0' });
  console.log(`Feed Service listening on port ${port}`);
  await sqsConsumer.start();
} catch (err) {
  server.log.error(err);
  process.exit(1);
}

// Handle graceful shutdown
const gracefulShutdown = async () => {
  console.log('Shutting down Feed Service gracefully...');
  
  try {
    await sqsConsumer.stop();
    await server.close();
    console.log('HTTP server closed.');
    
    await Promise.all([
      userPrisma.$disconnect(),
      postPrisma.$disconnect()
    ]);
    console.log('Database connections closed.');
    
    await redis.quit();
    console.log('Redis connection closed.');
    
    process.exit(0);
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

