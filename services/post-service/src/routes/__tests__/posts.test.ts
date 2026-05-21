import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../server.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Post Service API Integration Tests', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildServer();
    
    // Clean up test records before starting tests
    await prisma.postHashtag.deleteMany({});
    await prisma.post.deleteMany({});
  });

  afterAll(async () => {
    await server.close();
    await prisma.$disconnect();
  });

  // 1. Test Health Route
  it('should return health status', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });
    
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      status: 'OK',
      service: 'post-service',
    });
  });

  // 2. Create Post with Mock Auth
  it('should successfully create a post and parse hashtags', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: {
        'x-mock-user-id': 'user-alice-123',
        'x-mock-email': 'alice@example.com',
      },
      payload: {
        content: 'Hello world! Having a great day learning #Cloud and #AWS today!',
        mediaUrl: 'https://example.com/assets/cloud.png',
      },
    });

    expect(response.statusCode).toBe(201);
    
    const body = JSON.parse(response.body);
    expect(body.id).toBeDefined();
    expect(body.authorId).toBe('user-alice-123');
    expect(body.content).toContain('Hello world!');
    expect(body.mediaUrl).toBe('https://example.com/assets/cloud.png');
    
    // Assert hashtags are parsed and lowercased
    expect(body.hashtags).toHaveLength(2);
    const tags = body.hashtags.map((h: any) => h.tag);
    expect(tags).toContain('cloud');
    expect(tags).toContain('aws');
  });

  // 3. Create Post without token
  it('should reject post creation without mock bypass or authorization header', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/posts',
      payload: {
        content: 'Unauthorized post content!',
      },
    });

    expect(response.statusCode).toBe(401);
  });

  // 4. Retrieve single post
  it('should fetch single post details including its tags', async () => {
    // First, let's create a post to fetch
    const setupRes = await prisma.post.create({
      data: {
        id: 'post-test-456',
        authorId: 'user-bob-987',
        content: 'Hiking in the mountains! #outdoors #Nature',
        hashtags: {
          create: [{ tag: 'outdoors' }, { tag: 'nature' }]
        }
      }
    });

    const response = await server.inject({
      method: 'GET',
      url: `/api/v1/posts/${setupRes.id}`,
    });

    expect(response.statusCode).toBe(200);

    const body = JSON.parse(response.body);
    expect(body.id).toBe('post-test-456');
    expect(body.content).toBe('Hiking in the mountains! #outdoors #Nature');
    expect(body.hashtags).toHaveLength(2);
    expect(body.hashtags.map((h: any) => h.tag)).toContain('nature');
  });

  // 5. Delete post owned by another user (Forbidden)
  it('should forbid deleting a post owned by another user', async () => {
    const response = await server.inject({
      method: 'DELETE',
      url: '/api/v1/posts/post-test-456', // Owned by user-bob-987
      headers: {
        'x-mock-user-id': 'user-alice-123', // Logged in user is Alice
      },
    });

    expect(response.statusCode).toBe(403);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('Forbidden');
  });

  // 6. Delete post owned by the author (Succeed)
  it('should allow deleting a post owned by the current user', async () => {
    const response = await server.inject({
      method: 'DELETE',
      url: '/api/v1/posts/post-test-456', // Owned by user-bob-987
      headers: {
        'x-mock-user-id': 'user-bob-987', // Logged in user is Bob
      },
    });

    expect(response.statusCode).toBe(200);

    // Verify deletion in database
    const dbPost = await prisma.post.findUnique({ where: { id: 'post-test-456' } });
    expect(dbPost).toBeNull();
  });

  // 7. Get user's timeline (paginated)
  it('should fetch all posts of a specific user with cursor pagination', async () => {
    const userId = 'user-pagination-test';

    // Create 3 posts in DB
    const post1 = await prisma.post.create({
      data: { authorId: userId, content: 'First post #first', createdAt: new Date(Date.now() - 3000) }
    });
    const post2 = await prisma.post.create({
      data: { authorId: userId, content: 'Second post #second', createdAt: new Date(Date.now() - 2000) }
    });
    const post3 = await prisma.post.create({
      data: { authorId: userId, content: 'Third post #third', createdAt: new Date(Date.now() - 1000) }
    });

    // Request first page (limit = 2)
    const page1Res = await server.inject({
      method: 'GET',
      url: `/api/v1/users/${userId}/posts?limit=2`,
    });

    expect(page1Res.statusCode).toBe(200);
    const page1Body = JSON.parse(page1Res.body);
    
    // Should return 2 posts (posts are returned ordered by createdAt desc, so third and second posts)
    expect(page1Body.posts).toHaveLength(2);
    expect(page1Body.posts[0].id).toBe(post3.id);
    expect(page1Body.posts[1].id).toBe(post2.id);
    expect(page1Body.nextCursor).toBe(post2.id); // Cursor should point to post2

    // Request second page using nextCursor
    const page2Res = await server.inject({
      method: 'GET',
      url: `/api/v1/users/${userId}/posts?limit=2&cursor=${page1Body.nextCursor}`,
    });

    expect(page2Res.statusCode).toBe(200);
    const page2Body = JSON.parse(page2Res.body);

    // Should return remaining 1 post (first post)
    expect(page2Body.posts).toHaveLength(1);
    expect(page2Body.posts[0].id).toBe(post1.id);
    expect(page2Body.nextCursor).toBeUndefined(); // No more items
  });
});
