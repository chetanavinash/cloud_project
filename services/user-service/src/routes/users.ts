import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { verifyJWT } from '../middleware/auth.js';
import { PublishCommand } from '@aws-sdk/client-sns';
import { snsClient } from '../config/aws.js';
import { config } from '../config/index.js';
import crypto from 'crypto';

const prisma = new PrismaClient();

// Schema definitions for Zod validations
const registerSchema = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
  displayName: z.string().min(1).max(50),
  password: z.string().min(6),
  bio: z.string().max(160).optional(),
  avatarUrl: z.string().url().optional().or(z.literal('')),
});

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(50).optional(),
  bio: z.string().max(160).optional(),
  avatarUrl: z.string().url().optional().or(z.literal('')),
});

export async function userRoutes(fastify: FastifyInstance) {
  
  // 1. POST /register
  fastify.post('/register', { preHandler: verifyJWT }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userClaims = request.user!;
    
    try {
      const parsedBody = registerSchema.parse(request.body);
      
      // Check if user already exists
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { id: userClaims.sub },
            { username: parsedBody.username },
            { email: userClaims.email || '' }
          ]
        }
      });

      if (existingUser) {
        return reply.status(409).send({ error: 'User with this ID, username, or email already exists' });
      }

      // Hash password using Node's crypto
      const hashedPassword = crypto.createHash('sha256').update(parsedBody.password).digest('hex');

      // Create new user in DB
      const user = await prisma.user.create({
        data: {
          id: userClaims.sub,
          email: userClaims.email || `${parsedBody.username}@example.com`,
          username: parsedBody.username.toLowerCase(),
          displayName: parsedBody.displayName,
          password: hashedPassword,
          bio: parsedBody.bio,
          avatarUrl: parsedBody.avatarUrl,
        }
      });

      // Publish USER_CREATED event
      if (config.SNS_TOPIC_ARN) {
        try {
          await snsClient.send(new PublishCommand({
            TopicArn: config.SNS_TOPIC_ARN,
            Message: JSON.stringify({
              type: 'USER_CREATED',
              data: {
                id: user.id,
                username: user.username,
                displayName: user.displayName,
                bio: user.bio || '',
                avatarUrl: user.avatarUrl || '',
              }
            })
          }));
        } catch (snsErr) {
          request.log.error(snsErr, 'Failed to publish USER_CREATED event to SNS:');
        }
      }

      return reply.status(201).send(user);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Validation failed', details: error.errors });
      }
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // 2. GET /users/:id (Public)
  fastify.get<{ Params: { id: string } }>('/users/:id', async (request, reply) => {
    const { id } = request.params;
    
    try {
      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          _count: {
            select: { followers: true, following: true }
          }
        }
      });

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      return reply.send(user);
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // 3. PUT /users/:id
  fastify.put<{ Params: { id: string } }>('/users/:id', { preHandler: verifyJWT }, async (request, reply) => {
    const { id } = request.params;
    const userClaims = request.user!;

    if (userClaims.sub !== id) {
      return reply.status(403).send({ error: 'Forbidden: You can only update your own profile' });
    }

    try {
      const parsedBody = updateProfileSchema.parse(request.body);
      
      const updatedUser = await prisma.user.update({
        where: { id },
        data: parsedBody,
      });

      // Publish USER_UPDATED event
      if (config.SNS_TOPIC_ARN) {
        try {
          await snsClient.send(new PublishCommand({
            TopicArn: config.SNS_TOPIC_ARN,
            Message: JSON.stringify({
              type: 'USER_UPDATED',
              data: {
                id: updatedUser.id,
                username: updatedUser.username,
                displayName: updatedUser.displayName,
                bio: updatedUser.bio || '',
                avatarUrl: updatedUser.avatarUrl || '',
              }
            })
          }));
        } catch (snsErr) {
          request.log.error(snsErr, 'Failed to publish USER_UPDATED event to SNS:');
        }
      }

      return reply.send(updatedUser);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Validation failed', details: error.errors });
      }
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // 4. DELETE /users/:id
  fastify.delete<{ Params: { id: string } }>('/users/:id', { preHandler: verifyJWT }, async (request, reply) => {
    const { id } = request.params;
    const userClaims = request.user!;

    if (userClaims.sub !== id) {
      return reply.status(403).send({ error: 'Forbidden: You can only delete your own account' });
    }

    try {
      await prisma.user.delete({
        where: { id },
      });

      return reply.send({ message: 'User account successfully deleted' });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // 5. POST /users/:id/follow
  fastify.post<{ Params: { id: string } }>('/users/:id/follow', { preHandler: verifyJWT }, async (request, reply) => {
    const followingId = request.params.id; // Target user to follow
    const followerId = request.user!.sub; // Current logged in user

    if (followerId === followingId) {
      return reply.status(400).send({ error: 'You cannot follow yourself' });
    }

    try {
      // Check if target user exists
      const targetUser = await prisma.user.findUnique({ where: { id: followingId } });
      if (!targetUser) {
        return reply.status(404).send({ error: 'User to follow not found' });
      }

      // Check if already following
      const existingFollow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: { followerId, followingId }
        }
      });

      if (existingFollow) {
        return reply.status(400).send({ error: 'You are already following this user' });
      }

      // Perform transaction: Create Follow record and update follower counts on both Users
      await prisma.$transaction([
        prisma.follow.create({
          data: { followerId, followingId }
        }),
        prisma.user.update({
          where: { id: followerId },
          data: { followingCount: { increment: 1 } }
        }),
        prisma.user.update({
          where: { id: followingId },
          data: { followerCount: { increment: 1 } }
        })
      ]);

      return reply.send({ message: 'Successfully followed user' });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // 6. DELETE /users/:id/follow (Unfollow)
  fastify.delete<{ Params: { id: string } }>('/users/:id/follow', { preHandler: verifyJWT }, async (request, reply) => {
    const followingId = request.params.id; // Target user to unfollow
    const followerId = request.user!.sub; // Current user

    try {
      // Check if following exists
      const existingFollow = await prisma.follow.findUnique({
        where: {
          followerId_followingId: { followerId, followingId }
        }
      });

      if (!existingFollow) {
        return reply.status(400).send({ error: 'You are not following this user' });
      }

      // Perform transaction: Delete Follow record and decrement follower counts on both Users
      await prisma.$transaction([
        prisma.follow.delete({
          where: {
            followerId_followingId: { followerId, followingId }
          }
        }),
        prisma.user.update({
          where: { id: followerId },
          data: { followingCount: { decrement: 1 } }
        }),
        prisma.user.update({
          where: { id: followingId },
          data: { followerCount: { decrement: 1 } }
        })
      ]);

      return reply.send({ message: 'Successfully unfollowed user' });
    } catch (error) {
      request.log.error({ err: error });
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // 7. GET /users/:id/followers
  fastify.get<{ Params: { id: string }, Querystring: { limit?: string, cursor?: string } }>('/users/:id/followers', async (request, reply) => {
    const { id } = request.params;
    const limit = Math.min(Number(request.query.limit) || 20, 100);
    const cursor = request.query.cursor; // cursor would be followerId

    try {
      const followers = await prisma.follow.findMany({
        where: { followingId: id },
        take: limit + 1,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { followerId_followingId: { followerId: cursor, followingId: id } } : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          follower: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            }
          }
        }
      });

      let nextCursor: string | undefined = undefined;
      if (followers.length > limit) {
        followers.pop();
        nextCursor = followers[followers.length - 1]?.followerId;
      }

      return reply.send({
        followers: followers.map(f => f.follower),
        nextCursor
      });
    } catch (error) {
      request.log.error({ err: error });
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // 8. GET /users/:id/following
  fastify.get<{ Params: { id: string }, Querystring: { limit?: string, cursor?: string } }>('/users/:id/following', async (request, reply) => {
    const { id } = request.params;
    const limit = Math.min(Number(request.query.limit) || 20, 100);
    const cursor = request.query.cursor; // cursor would be followingId

    try {
      const following = await prisma.follow.findMany({
        where: { followerId: id },
        take: limit + 1,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { followerId_followingId: { followerId: id, followingId: cursor } } : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          following: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            }
          }
        }
      });

      let nextCursor: string | undefined = undefined;
      if (following.length > limit) {
        following.pop();
        nextCursor = following[following.length - 1]?.followingId;
      }

      return reply.send({
        following: following.map(f => f.following),
        nextCursor
      });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // 9. POST /login
  const loginSchema = z.object({
    username: z.string().toLowerCase().trim(),
    password: z.string(),
  });

  fastify.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { username, password } = loginSchema.parse(request.body);
      const user = await prisma.user.findUnique({
        where: { username: username.toLowerCase() }
      });
      
      if (!user) {
        return reply.status(404).send({ error: 'Account does not exist. Please sign up first.' });
      }
      
      const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
      if (user.password !== hashedPassword && user.password !== '') {
        return reply.status(401).send({ error: 'Incorrect password' });
      }
      
      return reply.send(user);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Validation failed', details: error.errors });
      }
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}
