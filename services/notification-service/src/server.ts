import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { config } from './config/index.js';
import { notificationRoutes } from './routes/notifications.js';
import { websocketRoutes } from './ws/websocket.js';

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

  // Register WebSocket Plugin
  await fastify.register(websocket);

  // Register CORS
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  // Health check route
  fastify.get('/health', async () => {
    return { status: 'OK', service: 'notification-service' };
  });

  // Register REST API Routes
  await fastify.register(notificationRoutes, { prefix: '/api/v1' });

  // Register WebSocket Router
  await fastify.register(websocketRoutes);

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
