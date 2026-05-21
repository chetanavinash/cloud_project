import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { verifyJWT } from '../middleware/auth.js';
import { userPrisma, postPrisma } from '../config/db.js';
import { redis } from '../config/redis.js';

const feedQuerySchema = z.object({
  limit: z.string().optional().transform(val => Math.min(Number(val) || 20, 100)),
  cursor: z.string().optional(),
});

/**
 * Background backfill worker to populate the user's feed in Redis Sorted Set
 */
async function backfillFeed(userId: string, authorIds: string[], cacheKey: string) {
  try {
    // Exclude celebrity authors from the regular feed cache backfill
    const nonCelebrityUsers = await userPrisma.user.findMany({
      where: {
        id: { in: authorIds },
        followerCount: { lt: 10000 }
      },
      select: { id: true }
    });
    const nonCelebrityIds = nonCelebrityUsers.map(u => u.id);
    
    // Ensure current user is included if they are not a celebrity
    if (!nonCelebrityIds.includes(userId)) {
      const me = await userPrisma.user.findUnique({
        where: { id: userId },
        select: { followerCount: true }
      });
      if (me && me.followerCount < 10000) {
        nonCelebrityIds.push(userId);
      }
    }

    const latestPosts = await postPrisma.post.findMany({
      where: { authorId: { in: nonCelebrityIds } },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: { id: true, createdAt: true }
    });

    if (latestPosts.length === 0) {
      // Store a placeholder to indicate the cache is warm but empty
      await redis.zadd(cacheKey, 0, 'empty_placeholder');
      await redis.expire(cacheKey, 86400); // 24 hours
      return;
    }

    const pipeline = redis.pipeline();
    pipeline.del(cacheKey);

    latestPosts.forEach(post => {
      pipeline.zadd(cacheKey, post.createdAt.getTime(), post.id);
    });

    pipeline.expire(cacheKey, 86400); // 24 hours
    await pipeline.exec();
  } catch (error) {
    console.error(`Error backfilling feed for user ${userId}:`, error);
  }
}

export async function feedRoutes(fastify: FastifyInstance) {
  
  // GET /feed - Protected route returning the current user's feed
  fastify.get('/feed', { preHandler: verifyJWT }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.sub;

    try {
      const { limit, cursor } = feedQuerySchema.parse(request.query);
      const cacheKey = `feed:${userId}`;

      // Check if cache exists
      const cacheExists = await redis.exists(cacheKey);
      let postIds: string[] = [];
      let usedCache = false;

      if (cacheExists) {
        // Fetch followed celebrities
        const celebrityFollows = await userPrisma.follow.findMany({
          where: {
            followerId: userId,
            following: {
              followerCount: { gte: 10000 }
            }
          },
          select: { followingId: true }
        });
        const celebrityIds = celebrityFollows.map(f => f.followingId);

        // Fetch user's own cache (regular users) with scores (timestamps)
        const mainFeedResult = await redis.zrevrange(cacheKey, 0, -1, 'WITHSCORES');
        const rawMainFeed: { id: string; score: number }[] = [];
        for (let i = 0; i < mainFeedResult.length; i += 2) {
          const id = mainFeedResult[i];
          const score = Number(mainFeedResult[i + 1]);
          if (id !== 'empty_placeholder') {
            rawMainFeed.push({ id, score });
          }
        }

        // Fetch followed celebrities' caches
        const rawCelebrityFeeds: { id: string; score: number }[] = [];
        if (celebrityIds.length > 0) {
          const pipeline = redis.pipeline();
          celebrityIds.forEach(id => {
            pipeline.zrevrange(`celebrity:${id}`, 0, -1, 'WITHSCORES');
          });
          const results = await pipeline.exec();
          if (results) {
            results.forEach(res => {
              const [err, val] = res;
              if (!err && Array.isArray(val)) {
                for (let i = 0; i < val.length; i += 2) {
                  const id = val[i];
                  const score = Number(val[i + 1]);
                  rawCelebrityFeeds.push({ id, score });
                }
              }
            });
          }
        }

        // Merge feeds and sort descending by score
        const mergedMap = new Map<string, number>();
        rawMainFeed.forEach(item => mergedMap.set(item.id, item.score));
        rawCelebrityFeeds.forEach(item => {
          const existing = mergedMap.get(item.id);
          if (existing === undefined || item.score > existing) {
            mergedMap.set(item.id, item.score);
          }
        });

        const mergedSorted = Array.from(mergedMap.entries())
          .map(([id, score]) => ({ id, score }))
          .sort((a, b) => b.score - a.score);

        // Paginate the merged list of post IDs
        if (!cursor) {
          postIds = mergedSorted.slice(0, limit).map(item => item.id);
          usedCache = true;
        } else {
          const index = mergedSorted.findIndex(item => item.id === cursor);
          if (index !== -1) {
            postIds = mergedSorted.slice(index + 1, index + 1 + limit).map(item => item.id);
            usedCache = true;
          }
        }
      }

      let feedPosts: any[] = [];

      // If cache miss, or cache is cold (< 5 items and not empty placeholder), query PostgreSQL
      if (!usedCache || (postIds.length < 5 && postIds.length > 0 && !cursor)) {
        // Fetch follows
        const follows = await userPrisma.follow.findMany({
          where: { followerId: userId },
          select: { followingId: true }
        });

        const authorIds = [userId, ...follows.map(f => f.followingId)];

        // Fetch posts from DB
        feedPosts = await postPrisma.post.findMany({
          where: { authorId: { in: authorIds } },
          orderBy: { createdAt: 'desc' },
          take: limit + 1,
          skip: cursor ? 1 : 0,
          cursor: cursor ? { id: cursor } : undefined,
        });

        // Trigger background backfill
        // We do not await this, so it runs asynchronously
        backfillFeed(userId, authorIds, cacheKey).catch(err => {
          request.log.error(err, 'Failed to trigger feed backfill');
        });
      } else {
        // Cache hit: fetch posts from DB using retrieved IDs
        if (postIds.length > 0) {
          const posts = await postPrisma.post.findMany({
            where: { id: { in: postIds } }
          });

          // Prisma findMany does not preserve the order of the 'in' array.
          // We must sort the posts to match the order in postIds (descending by timestamp).
          const postMap = new Map(posts.map(p => [p.id, p]));
          feedPosts = postIds
            .map(id => postMap.get(id))
            .filter((p): p is NonNullable<typeof p> => !!p);
        }
      }

      // Hydrate with user profile details
      let hydratedFeed: any[] = [];
      if (feedPosts.length > 0) {
        const authorIds = Array.from(new Set(feedPosts.map(p => p.authorId)));
        
        const users = await userPrisma.user.findMany({
          where: { id: { in: authorIds } },
          select: {
            id: true,
            username: true,
            displayName: true,
            avatarUrl: true,
          }
        });

        const userMap = new Map(users.map(u => [u.id, u]));

        hydratedFeed = feedPosts.map(post => ({
          id: post.id,
          authorId: post.authorId,
          content: post.content,
          mediaUrl: post.mediaUrl,
          createdAt: post.createdAt,
          updatedAt: post.updatedAt,
          author: userMap.get(post.authorId) || {
            id: post.authorId,
            username: 'deleted_user',
            displayName: 'Deleted User',
            avatarUrl: null,
          }
        }));
      }

      // Paginate hydrated result
      let nextCursor: string | undefined = undefined;
      if (hydratedFeed.length > limit) {
        hydratedFeed.pop();
        nextCursor = hydratedFeed[hydratedFeed.length - 1]?.id;
      }

      return reply.send({
        posts: hydratedFeed,
        nextCursor
      });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Validation failed', details: error.errors });
      }
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // POST /feed/clear-cache - Utility endpoint to clear feed cache (e.g. on new post/follow event)
  fastify.post('/feed/clear-cache', { preHandler: verifyJWT }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.sub;
    try {
      await redis.del(`feed:${userId}`);
      return reply.send({ message: 'Feed cache cleared' });
    } catch (error) {
      request.log.error(error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
}
