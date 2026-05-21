import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildServer } from '../../server.js';
import { userPrisma, postPrisma } from '../../config/db.js';
import { redis } from '../../config/redis.js';

describe('Feed Service API Integration Tests', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
    await Promise.all([
      userPrisma.$disconnect(),
      postPrisma.$disconnect(),
    ]);
    await redis.quit();
  });

  beforeEach(async () => {
    // Clear databases and cache
    await userPrisma.follow.deleteMany({});
    await userPrisma.user.deleteMany({});
    await postPrisma.post.deleteMany({});
    
    // Clear all feed caches in Redis
    const keys = await redis.keys('feed:*');
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  // 1. Health Route
  it('should return health status', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      status: 'OK',
      service: 'feed-service',
    });
  });

  // 2. Cache Miss and Database Fallback
  it('should fallback to DB query on cache miss and backfill Redis', async () => {
    // 1. Create users
    const alice = await userPrisma.user.create({
      data: {
        id: 'alice-id',
        username: 'alice',
        email: 'alice@example.com',
        displayName: 'Alice Cooper',
      }
    });

    const bob = await userPrisma.user.create({
      data: {
        id: 'bob-id',
        username: 'bob',
        email: 'bob@example.com',
        displayName: 'Bob Builder',
      }
    });

    // 2. Set follow relationship: Alice follows Bob
    await userPrisma.follow.create({
      data: {
        followerId: 'alice-id',
        followingId: 'bob-id',
      }
    });

    // 3. Create posts
    const post1 = await postPrisma.post.create({
      data: {
        id: 'post-1',
        authorId: 'bob-id',
        content: 'Hello from Bob #work',
        createdAt: new Date(Date.now() - 10000), // 10s ago
      }
    });

    const post2 = await postPrisma.post.create({
      data: {
        id: 'post-2',
        authorId: 'alice-id',
        content: 'My own post #life',
        createdAt: new Date(), // Now
      }
    });

    // 4. Fetch Alice's feed
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/feed',
      headers: {
        'x-mock-user-id': 'alice-id',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);

    expect(body.posts.length).toBe(2);
    // Ordered descending by createdAt
    expect(body.posts[0].id).toBe('post-2'); // Alice's post is newer
    expect(body.posts[0].author.username).toBe('alice');
    expect(body.posts[1].id).toBe('post-1'); // Bob's post is older
    expect(body.posts[1].author.username).toBe('bob');

    // 5. Verify Redis was backfilled
    // Wait a brief moment to let the async background backfill finish
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const cacheExists = await redis.exists('feed:alice-id');
    expect(cacheExists).toBe(1);

    const cachedIds = await redis.zrevrange('feed:alice-id', 0, -1);
    expect(cachedIds).toEqual(['post-2', 'post-1']);
  });

  // 3. Pagination with Cursor
  it('should paginate results correctly using cursor', async () => {
    // Create users and followers
    await userPrisma.user.create({
      data: {
        id: 'user-a',
        username: 'usera',
        email: 'usera@example.com',
        displayName: 'User A',
      }
    });

    await userPrisma.user.create({
      data: {
        id: 'user-b',
        username: 'userb',
        email: 'userb@example.com',
        displayName: 'User B',
      }
    });

    await userPrisma.follow.create({
      data: {
        followerId: 'user-a',
        followingId: 'user-b',
      }
    });

    // Create 3 posts
    const now = Date.now();
    await postPrisma.post.create({
      data: {
        id: 'p-1',
        authorId: 'user-b',
        content: 'First post',
        createdAt: new Date(now - 3000),
      }
    });

    await postPrisma.post.create({
      data: {
        id: 'p-2',
        authorId: 'user-b',
        content: 'Second post',
        createdAt: new Date(now - 2000),
      }
    });

    await postPrisma.post.create({
      data: {
        id: 'p-3',
        authorId: 'user-a',
        content: 'Third post',
        createdAt: new Date(now - 1000),
      }
    });

    // Warm cache by calling the endpoint once
    await server.inject({
      method: 'GET',
      url: '/api/v1/feed',
      headers: { 'x-mock-user-id': 'user-a' },
      query: { limit: '2' },
    });

    await new Promise(resolve => setTimeout(resolve, 300));

    // Page 1: limit=2
    const resPage1 = await server.inject({
      method: 'GET',
      url: '/api/v1/feed',
      headers: { 'x-mock-user-id': 'user-a' },
      query: { limit: '2' },
    });

    expect(resPage1.statusCode).toBe(200);
    const body1 = JSON.parse(resPage1.body);
    expect(body1.posts.length).toBe(2);
    expect(body1.posts[0].id).toBe('p-3');
    expect(body1.posts[1].id).toBe('p-2');
    expect(body1.nextCursor).toBe('p-2');

    // Page 2: using cursor from Page 1
    const resPage2 = await server.inject({
      method: 'GET',
      url: '/api/v1/feed',
      headers: { 'x-mock-user-id': 'user-a' },
      query: { limit: '2', cursor: body1.nextCursor },
    });

    expect(resPage2.statusCode).toBe(200);
    const body2 = JSON.parse(resPage2.body);
    expect(body2.posts.length).toBe(1);
    expect(body2.posts[0].id).toBe('p-1');
    expect(body2.nextCursor).toBeUndefined();
  });
});
