import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config/index.js';
import { mediaRoutes } from './routes/media.js';

export async function buildServer() {
  const fastify = Fastify({
    logger: {
      level: config.NODE_ENV === 'development' ? 'info' : 'warn',
      formatters: {
        level: (label) => {
          return { level: label.toUpperCase() };
        },
      },
      timestamp: () => `,"time":"${new Date().toISOString()}"`,
    },
  });

  // Register CORS
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  // Register API Routes
  await fastify.register(mediaRoutes, { prefix: '/api/v1' });

  // Custom global error handler
  fastify.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    
    if (error.statusCode) {
      return reply.status(error.statusCode).send({ error: error.message });
    }
    
    return reply.status(500).send({ error: 'Internal server error' });
  });

  return fastify;
}
