import { buildServer } from './server.js';
import { config } from './config/index.js';
import { ensureTableExists, ensureSqsSnsExists } from './config/aws.js';
import { sqsConsumer } from './sqs/consumer.js';

const server = await buildServer();

const port = Number(config.PORT);

try {
  // Ensure the DynamoDB table is initialized
  await ensureTableExists();

  // Ensure SQS and SNS exist (for LocalStack development)
  await ensureSqsSnsExists();

  // Start background SQS consumer loop
  sqsConsumer.start();

  // Listen
  await server.listen({ port, host: '0.0.0.0' });
  console.log(`Notification Service listening on port ${port}`);
} catch (err) {
  server.log.error(err);
  process.exit(1);
}

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('Shutting down Notification Service gracefully...');
  
  try {
    sqsConsumer.stop();
    await server.close();
    console.log('HTTP and WebSocket server closed.');
    process.exit(0);
  } catch (error) {
    console.error('Error during graceful shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
