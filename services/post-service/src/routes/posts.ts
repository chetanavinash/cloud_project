import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { verifyJWT } from '../middleware/auth.js';
import { PublishCommand } from '@aws-sdk/client-sns';
import { snsClient } from '../config/aws.js';
import { config } from '../config/index.js';

const prisma = new PrismaClient();

const createPostSchema = z.object({
  content: z.string().max(280).optional().default(''),
  mediaUrl: z.string().url().optional().or(z.literal('')),
}).refine(data => {
  const hasContent = data.content && data.content.trim().length > 0;
  const hasMedia = data.mediaUrl && data.mediaUrl.trim().length > 0;
  return hasContent || hasMedia;
}, {
  message: 'Post must contain either text content or a media attachment',
});

export async function postRoutes(fastify: FastifyInstance) {
  
  // 1. POST /posts (Create Post)
  fastify.post('/posts', { preHandler: verifyJWT }, async (request: FastifyRequest, reply: FastifyReply) => {
    const authorId = request.user!.sub;

    try {
      const { content, mediaUrl } = createPostSchema.parse(request.body);

      // Regex to find hashtags, e.g., #growth, #development
      const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
      const matches = [...content.matchAll(hashtagRegex)];
      
      // Deduplicate tags and convert to lowercase
      const tags = Array.from(new Set(matches.map(m => m[1].toLowerCase())));

      // Perform a transactional Prisma write: create the post and the associated hashtags
      const post = await prisma.post.create({
        data: {
          authorId,
          content,
          mediaUrl: mediaUrl || null,
          hashtags: {
            create: tags.map(tag => ({ tag }))
          }
        },
        include: {
          hashtags: {
            select: {
              tag: true
            }
          }
        }
      });

      // Publish POST_CREATED event
      if (config.SNS_TOPIC_ARN) {
        try {
          await snsClient.send(new PublishCommand({
            TopicArn: config.SNS_TOPIC_ARN,
            Message: JSON.stringify({
              type: 'POST_CREATED',
              data: {
                id: post.id,
                authorId: post.authorId,
                content: post.content,
                mediaUrl: post.mediaUrl || '',
                createdAt: post.createdAt.toISOString()
              }
            })
          }));
        } catch (snsErr) {
          request.log.error(snsErr, 'Failed to publish POST_CREATED event to SNS:');
        }
      }

      return reply.status(201).send(post);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Validation failed', details: error.errors });
      }
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // 2. GET /posts/:id (Get Single Post - Public)
  fastify.get<{ Params: { id: string } }>('/posts/:id', async (request, reply) => {
    const { id } = request.params;

    try {
      const post = await prisma.post.findUnique({
        where: { id },
        include: {
          hashtags: {
            select: {
              tag: true
            }
          }
        }
      });

      if (!post) {
        return reply.status(404).send({ error: 'Post not found' });
      }

      return reply.send(post);
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // 3. DELETE /posts/:id (Delete Post)
  fastify.delete<{ Params: { id: string } }>('/posts/:id', { preHandler: verifyJWT }, async (request, reply) => {
    const { id } = request.params;
    const authorId = request.user!.sub;

    try {
      const post = await prisma.post.findUnique({
        where: { id }
      });

      if (!post) {
        return reply.status(404).send({ error: 'Post not found' });
      }

      if (post.authorId !== authorId) {
        return reply.status(403).send({ error: 'Forbidden: You can only delete your own posts' });
      }

      await prisma.post.delete({
        where: { id }
      });

      // Publish POST_DELETED event
      if (config.SNS_TOPIC_ARN) {
        try {
          await snsClient.send(new PublishCommand({
            TopicArn: config.SNS_TOPIC_ARN,
            Message: JSON.stringify({
              type: 'POST_DELETED',
              data: {
                id: post.id
              }
            })
          }));
        } catch (snsErr) {
          request.log.error(snsErr, 'Failed to publish POST_DELETED event to SNS:');
        }
      }

      return reply.send({ message: 'Post successfully deleted' });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // 4. GET /users/:id/posts (Get User Posts - Paginated)
  fastify.get<{ Params: { id: string }, Querystring: { limit?: string, cursor?: string } }>('/users/:id/posts', async (request, reply) => {
    const { id } = request.params;
    const limit = Math.min(Number(request.query.limit) || 20, 100);
    const cursor = request.query.cursor; // cursor is post UUID

    try {
      const posts = await prisma.post.findMany({
        where: { authorId: id },
        take: limit + 1,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          hashtags: {
            select: {
              tag: true
            }
          }
        }
      });

      let nextCursor: string | undefined = undefined;
      if (posts.length > limit) {
        posts.pop();
        nextCursor = posts[posts.length - 1]?.id;
      }

      return reply.send({
        posts,
        nextCursor
      });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // 5. POST /posts/stories (Create Story)
  const createStorySchema = z.object({
    mediaUrl: z.string().url(),
  });

  fastify.post('/posts/stories', { preHandler: verifyJWT }, async (request: FastifyRequest, reply: FastifyReply) => {
    const authorId = request.user!.sub;

    try {
      const { mediaUrl } = createStorySchema.parse(request.body);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

      const story = await prisma.story.create({
        data: {
          authorId,
          mediaUrl,
          expiresAt
        }
      });

      return reply.status(201).send(story);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Validation failed', details: error.errors });
      }
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // 6. GET /posts/stories (Get Active Stories for User IDs)
  fastify.get<{ Querystring: { authorIds?: string } }>('/posts/stories', { preHandler: verifyJWT }, async (request, reply) => {
    const { authorIds } = request.query;

    if (!authorIds) {
      return reply.send([]);
    }

    const ids = authorIds.split(',').map(id => id.trim()).filter(Boolean);
    if (ids.length === 0) {
      return reply.send([]);
    }

    try {
      const stories = await prisma.story.findMany({
        where: {
          authorId: { in: ids },
          expiresAt: { gt: new Date() }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      return reply.send(stories);
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}

