import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { verifyJWT } from '../middleware/auth.js';

const prisma = new PrismaClient();

const createCommentSchema = z.object({
  content: z.string().min(1).max(500),
  parentId: z.string().uuid().optional().or(z.literal('')),
});

export async function interactionRoutes(fastify: FastifyInstance) {
  
  // 1. POST /posts/:id/like (Like Post)
  fastify.post<{ Params: { id: string } }>('/posts/:id/like', { preHandler: verifyJWT }, async (request, reply) => {
    const postId = request.params.id;
    const userId = request.user!.sub;

    try {
      // Check if already liked (idempotent)
      const existingLike = await prisma.like.findUnique({
        where: {
          postId_userId: { postId, userId }
        }
      });

      if (existingLike) {
        return reply.status(200).send({ message: 'Already liked post' });
      }

      await prisma.like.create({
        data: { postId, userId }
      });

      return reply.status(201).send({ message: 'Successfully liked post' });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // 2. DELETE /posts/:id/like (Unlike Post)
  fastify.delete<{ Params: { id: string } }>('/posts/:id/like', { preHandler: verifyJWT }, async (request, reply) => {
    const postId = request.params.id;
    const userId = request.user!.sub;

    try {
      const existingLike = await prisma.like.findUnique({
        where: {
          postId_userId: { postId, userId }
        }
      });

      if (!existingLike) {
        return reply.status(400).send({ error: 'You have not liked this post' });
      }

      await prisma.like.delete({
        where: {
          postId_userId: { postId, userId }
        }
      });

      return reply.send({ message: 'Successfully unliked post' });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // 3. GET /posts/:id/like-status (Get Post Like Counts & Status)
  fastify.get<{ Params: { id: string } }>('/posts/:id/like-status', { preHandler: verifyJWT }, async (request, reply) => {
    const postId = request.params.id;
    const userId = request.user!.sub;

    try {
      const [likeCount, userLike] = await Promise.all([
        prisma.like.count({ where: { postId } }),
        prisma.like.findUnique({
          where: {
            postId_userId: { postId, userId }
          }
        })
      ]);

      return reply.send({
        liked: !!userLike,
        count: likeCount
      });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // 4. POST /posts/:id/comments (Create Comment)
  fastify.post<{ Params: { id: string } }>('/posts/:id/comments', { preHandler: verifyJWT }, async (request, reply) => {
    const postId = request.params.id;
    const authorId = request.user!.sub;

    try {
      const { content, parentId } = createCommentSchema.parse(request.body);

      // If parentId is provided, verify it exists and belongs to the same post
      if (parentId) {
        const parentComment = await prisma.comment.findUnique({ where: { id: parentId } });
        if (!parentComment) {
          return reply.status(400).send({ error: 'Parent comment not found' });
        }
        if (parentComment.postId !== postId) {
          return reply.status(400).send({ error: 'Parent comment does not belong to this post' });
        }
      }

      const comment = await prisma.comment.create({
        data: {
          postId,
          authorId,
          content,
          parentId: parentId || null
        }
      });

      return reply.status(201).send(comment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Validation failed', details: error.errors });
      }
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // 5. GET /posts/:id/comments (Get Post Comments - Paginated & Threaded)
  fastify.get<{ Params: { id: string }, Querystring: { limit?: string, cursor?: string } }>('/posts/:id/comments', async (request, reply) => {
    const postId = request.params.id;
    const limit = Math.min(Number(request.query.limit) || 20, 100);
    const cursor = request.query.cursor; // cursor is comment UUID

    try {
      // Fetch top-level comments (parentId is null) and embed first page of sub-replies
      const comments = await prisma.comment.findMany({
        where: { postId, parentId: null },
        take: limit + 1,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { id: cursor } : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          replies: {
            orderBy: { createdAt: 'asc' },
            take: 10 // Grab first 10 replies inline for quick viewing
          }
        }
      });

      let nextCursor: string | undefined = undefined;
      if (comments.length > limit) {
        comments.pop();
        nextCursor = comments[comments.length - 1]?.id;
      }

      return reply.send({
        comments,
        nextCursor
      });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // 6. DELETE /comments/:id (Delete Comment)
  fastify.delete<{ Params: { id: string } }>('/comments/:id', { preHandler: verifyJWT }, async (request, reply) => {
    const { id } = request.params;
    const authorId = request.user!.sub;

    try {
      const comment = await prisma.comment.findUnique({ where: { id } });
      if (!comment) {
        return reply.status(404).send({ error: 'Comment not found' });
      }

      if (comment.authorId !== authorId) {
        return reply.status(403).send({ error: 'Forbidden: You can only delete your own comments' });
      }

      // Deletes comment and automatically cascades to child replies due to schema definition!
      await prisma.comment.delete({ where: { id } });

      return reply.send({ message: 'Comment successfully deleted' });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // 7. POST /posts/:id/bookmark (Bookmark Post)
  fastify.post<{ Params: { id: string } }>('/posts/:id/bookmark', { preHandler: verifyJWT }, async (request, reply) => {
    const postId = request.params.id;
    const userId = request.user!.sub;

    try {
      const existingBookmark = await prisma.bookmark.findUnique({
        where: {
          postId_userId: { postId, userId }
        }
      });

      if (existingBookmark) {
        return reply.status(200).send({ message: 'Already bookmarked post' });
      }

      await prisma.bookmark.create({
        data: { postId, userId }
      });

      return reply.status(201).send({ message: 'Successfully bookmarked post' });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // 8. DELETE /posts/:id/bookmark (Remove Bookmark)
  fastify.delete<{ Params: { id: string } }>('/posts/:id/bookmark', { preHandler: verifyJWT }, async (request, reply) => {
    const postId = request.params.id;
    const userId = request.user!.sub;

    try {
      const existingBookmark = await prisma.bookmark.findUnique({
        where: {
          postId_userId: { postId, userId }
        }
      });

      if (!existingBookmark) {
        return reply.status(400).send({ error: 'You have not bookmarked this post' });
      }

      await prisma.bookmark.delete({
        where: {
          postId_userId: { postId, userId }
        }
      });

      return reply.send({ message: 'Successfully removed bookmark' });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // 9. GET /users/:id/bookmarks (Get User Bookmarks - Paginated)
  fastify.get<{ Params: { id: string }, Querystring: { limit?: string, cursor?: string } }>('/users/:id/bookmarks', { preHandler: verifyJWT }, async (request, reply) => {
    const { id } = request.params;
    const currentUserId = request.user!.sub;
    const limit = Math.min(Number(request.query.limit) || 20, 100);
    const cursor = request.query.cursor; // cursor is postId

    // Users should only view their own bookmarks
    if (id !== currentUserId) {
      return reply.status(403).send({ error: 'Forbidden: You can only view your own bookmarks' });
    }

    try {
      const bookmarks = await prisma.bookmark.findMany({
        where: { userId: id },
        take: limit + 1,
        skip: cursor ? 1 : 0,
        cursor: cursor ? { postId_userId: { postId: cursor, userId: id } } : undefined,
        orderBy: { createdAt: 'desc' }
      });

      let nextCursor: string | undefined = undefined;
      if (bookmarks.length > limit) {
        bookmarks.pop();
        nextCursor = bookmarks[bookmarks.length - 1]?.postId;
      }

      return reply.send({
        bookmarks,
        nextCursor
      });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}
