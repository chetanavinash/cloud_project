import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { z } from 'zod';
import { verifyJWT } from '../middleware/auth.js';
import { docClient } from '../config/aws.js';
import { config } from '../config/index.js';

const notificationQuerySchema = z.object({
  limit: z.string().optional().transform(val => Math.min(Number(val) || 20, 100)),
  cursor: z.string().optional(),
});

export async function notificationRoutes(fastify: FastifyInstance) {
  
  // GET /notifications - Protected list of user notifications
  fastify.get('/notifications', { preHandler: verifyJWT }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.sub;

    try {
      const { limit, cursor } = notificationQuerySchema.parse(request.query);

      const command = new QueryCommand({
        TableName: config.DYNAMODB_TABLE,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
        ScanIndexForward: false, // Sort descending (newest first)
        Limit: limit,
        ExclusiveStartKey: cursor ? { userId, id: cursor } : undefined,
      });

      const response = await docClient.send(command);

      const nextCursor = response.LastEvaluatedKey?.id as string | undefined;

      return reply.send({
        notifications: response.Items || [],
        nextCursor,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Validation failed', details: error.errors });
      }
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // POST /notifications/:id/read - Mark notification as read
  fastify.post('/notifications/:id/read', { preHandler: verifyJWT }, async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = request.user!.sub;
    const { id } = request.params;

    try {
      const command = new UpdateCommand({
        TableName: config.DYNAMODB_TABLE,
        Key: { userId, id },
        UpdateExpression: 'set isRead = :isRead',
        ConditionExpression: 'attribute_exists(userId) AND attribute_exists(id)',
        ExpressionAttributeValues: {
          ':isRead': true,
        },
        ReturnValues: 'ALL_NEW',
      });

      const response = await docClient.send(command);
      return reply.send(response.Attributes);
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        return reply.status(404).send({ error: 'Notification not found' });
      }
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}
