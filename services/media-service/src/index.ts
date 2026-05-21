import { buildServer } from './server.js';
import { config } from './config/index.js';
import { mediaProcessorSimulator } from './workers/processor.js';

const start = async () => {
  try {
    const server = await buildServer();
    const port = Number(config.PORT);
    
    await server.listen({ 
      port, 
      host: '0.0.0.0' 
    });
    
    server.log.info(`Media microservice listening on port ${port}`);

    // Start simulated S3 processing background worker
    mediaProcessorSimulator.start();

    // Graceful Shutdown Handler
    const signals = ['SIGINT', 'SIGTERM'];
    for (const signal of signals) {
      process.on(signal, async () => {
        server.log.info(`Received ${signal}, shutting down gracefully...`);
        mediaProcessorSimulator.stop();
        await server.close();
        server.log.info('Server closed. Exiting process.');
        process.exit(0);
      });
    }
  } catch (err) {
    console.error('Error starting media server:', err);
    process.exit(1);
  }
};

start();
