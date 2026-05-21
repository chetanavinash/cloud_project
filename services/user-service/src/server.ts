import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config/index.js';
import { userRoutes } from './routes/users.js';

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
    origin: true, // In production, replace with specific domain
    credentials: true,
  });

  // Health check route
  fastify.get('/health', async () => {
    return { status: 'OK', service: 'user-service' };
  });

  // Register API Routes
  await fastify.register(userRoutes, { prefix: '/api/v1' });

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
