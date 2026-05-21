import { FastifyInstance } from 'fastify';
import { connectionManager } from './connection-manager.js';
import crypto from 'crypto';

export async function websocketRoutes(fastify: FastifyInstance) {
  // Clients connect via ws://localhost:3005/ws?token=<JWT_TOKEN>
  // For testing, they can pass ?x-mock-user-id=<USER_ID>
  fastify.route({
    method: 'GET',
    url: '/ws',
    websocket: true,
    handler: async (connection, request) => {
      let userId: string | undefined = undefined;
      const connId = crypto.randomUUID();

      try {
        const queryToken = (request.query as any)?.token;
        const authHeader = request.headers.authorization;
        let token = '';

        if (queryToken) {
          token = queryToken.startsWith('Bearer ') ? queryToken.substring(7) : queryToken;
        } else if (authHeader && authHeader.startsWith('Bearer ')) {
          token = authHeader.substring(7);
        }

        const mockUserId = request.headers['x-mock-user-id'] || (request.query as any)?.['x-mock-user-id'];

        if (mockUserId) {
          userId = mockUserId as string;
        } else if (token) {
          const parts = token.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
            userId = payload.sub || payload.id;
          }
        }

        if (!userId) {
          connection.socket.send(JSON.stringify({ error: 'Unauthorized' }));
          connection.socket.close(4001, 'Unauthorized');
          return;
        }

        // Add to active connections map
        connectionManager.addConnection(userId, connId, connection.socket);
        request.log.info(`WebSocket connection established for user: ${userId} (${connId})`);

        // Send connection acknowledgment
        connection.socket.send(JSON.stringify({
          type: 'WELCOME',
          message: 'Connected to real-time notification feed',
          userId,
        }));

        connection.socket.on('close', () => {
          connectionManager.removeConnection(userId!, connId);
          request.log.info(`WebSocket connection closed for user: ${userId} (${connId})`);
        });

        connection.socket.on('error', (err) => {
          request.log.error(err, `WebSocket connection error for user: ${userId}`);
          connectionManager.removeConnection(userId!, connId);
        });

      } catch (error) {
        request.log.error(error, 'Failed to establish WebSocket connection');
        connection.socket.send(JSON.stringify({ error: 'Unauthorized' }));
        connection.socket.close(4001, 'Unauthorized');
      }
    }
  });
}
