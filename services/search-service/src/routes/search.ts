import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../config/db.js';
import { verifyJWT } from '../middleware/auth.js';

const searchSchema = z.object({
  q: z.string().default(''),
});

export async function searchRoutes(fastify: FastifyInstance) {
  // Add authentication preHandler to secure search
  fastify.get('/search/users', { preHandler: verifyJWT }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const parsed = searchSchema.parse(request.query);
      const q = parsed.q.trim();

      if (!q) {
        return reply.send([]);
      }

      const users = await prisma.searchUser.findMany({
        where: {
          OR: [
            { username: { contains: q, mode: 'insensitive' } },
            { displayName: { contains: q, mode: 'insensitive' } },
            { bio: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 50,
      });

      return reply.send(users);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Validation failed', details: error.errors });
      }
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  fastify.get('/search/posts', { preHandler: verifyJWT }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const parsed = searchSchema.parse(request.query);
      const q = parsed.q.trim();

      if (!q) {
        return reply.send([]);
      }

      const posts = await prisma.searchPost.findMany({
        where: {
          content: { contains: q, mode: 'insensitive' },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      return reply.send(posts);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Validation failed', details: error.errors });
      }
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  fastify.get('/search/hashtags', { preHandler: verifyJWT }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const parsed = searchSchema.parse(request.query);
      const q = parsed.q.trim();

      if (!q) {
        return reply.send([]);
      }

      // Strip leading hashtag if provided
      const tagQuery = q.startsWith('#') ? q.slice(1) : q;

      const hashtags = await prisma.searchHashtag.findMany({
        where: {
          tag: { startsWith: tagQuery.toLowerCase(), mode: 'insensitive' },
        },
        orderBy: { postCount: 'desc' },
        take: 20,
      });

      return reply.send(hashtags);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Validation failed', details: error.errors });
      }
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}
