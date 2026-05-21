import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildServer } from '../../server.js';
import { ensureSqsSnsExists, snsClient } from '../../config/aws.js';
import { sqsConsumer } from '../../sqs/consumer.js';
import { prisma } from '../../config/db.js';
import { config } from '../../config/index.js';
import { PublishCommand } from '@aws-sdk/client-sns';

describe('Search Service Integration Tests', () => {
  let server: any;

  beforeAll(async () => {
    console.log('beforeAll: building server...');
    server = await buildServer();
    
    console.log('beforeAll: ensuring SQS/SNS exists...');
    await ensureSqsSnsExists();

    console.log('beforeAll: starting SQS consumer...');
    sqsConsumer.start();

    console.log('beforeAll: binding server...');
    await server.listen({ port: 0, host: '127.0.0.1' });
  });

  afterAll(async () => {
    console.log('afterAll: stopping SQS consumer...');
    sqsConsumer.stop();
    console.log('afterAll: closing server...');
    await server.close();
    console.log('afterAll: cleaning database connection...');
    await prisma.$disconnect();
    console.log('afterAll: finished.');
  });

  beforeEach(async () => {
    console.log('beforeEach: clearing database tables...');
    await prisma.searchUser.deleteMany({});
    await prisma.searchPost.deleteMany({});
    await prisma.searchHashtag.deleteMany({});
    console.log('beforeEach: finished.');
  });

  // 1. Health check
  it('should return health status', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      status: 'OK',
      service: 'search-service',
    });
  });

  // 2. Test user search and indexing
  it('should index user profiles via SQS consumer and support user fuzzy queries', async () => {
    // Inject mock search check
    const preSearch = await server.inject({
      method: 'GET',
      url: '/api/v1/search/users?q=Alice',
      headers: { 'x-mock-user-id': 'test-auth-user' },
    });
    expect(preSearch.statusCode).toBe(200);
    expect(JSON.parse(preSearch.body).length).toBe(0);

    // Publish USER_CREATED event
    await snsClient.send(new PublishCommand({
      TopicArn: config.SNS_TOPIC_ARN,
      Message: JSON.stringify({
        type: 'USER_CREATED',
        data: {
          id: 'user-alice-123',
          username: 'alice_wonder',
          displayName: 'Alice Wonderland',
          bio: 'Adventures in rabbits holes and code',
          avatarUrl: 'https://example.com/alice.jpg',
        },
      }),
    }));

    // Poll database through search API until indexed
    let attempts = 0;
    let searchRes: any;
    let users: any[] = [];
    while (attempts < 15) {
      searchRes = await server.inject({
        method: 'GET',
        url: '/api/v1/search/users?q=wonder',
        headers: { 'x-mock-user-id': 'test-auth-user' },
      });
      users = JSON.parse(searchRes.body);
      if (users.length > 0) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 300));
      attempts++;
    }

    expect(searchRes.statusCode).toBe(200);
    expect(users.length).toBe(1);
    expect(users[0].id).toBe('user-alice-123');
    expect(users[0].displayName).toBe('Alice Wonderland');
    expect(users[0].bio).toBe('Adventures in rabbits holes and code');

    // Test USER_UPDATED event
    await snsClient.send(new PublishCommand({
      TopicArn: config.SNS_TOPIC_ARN,
      Message: JSON.stringify({
        type: 'USER_UPDATED',
        data: {
          id: 'user-alice-123',
          username: 'alice_wonder',
          displayName: 'Alice New Name',
          bio: 'Updated bio description',
          avatarUrl: 'https://example.com/alice2.jpg',
        },
      }),
    }));

    // Poll for update
    attempts = 0;
    while (attempts < 15) {
      searchRes = await server.inject({
        method: 'GET',
        url: '/api/v1/search/users?q=New',
        headers: { 'x-mock-user-id': 'test-auth-user' },
      });
      users = JSON.parse(searchRes.body);
      if (users.length > 0 && users[0].displayName === 'Alice New Name') {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 300));
      attempts++;
    }

    expect(users.length).toBe(1);
    expect(users[0].displayName).toBe('Alice New Name');
    expect(users[0].bio).toBe('Updated bio description');
  });

  // 3. Test post search and hashtag extraction
  it('should index posts, extract hashtags, handle deletion and support queries', async () => {
    // Publish POST_CREATED event with hashtags
    await snsClient.send(new PublishCommand({
      TopicArn: config.SNS_TOPIC_ARN,
      Message: JSON.stringify({
        type: 'POST_CREATED',
        data: {
          id: 'post-uuid-1',
          authorId: 'user-alice-123',
          content: 'Learning full-text search with PostgreSQL #cloud #aws #prisma!',
          mediaUrl: 'https://example.com/image.jpg',
          createdAt: new Date().toISOString(),
        },
      }),
    }));

    // Poll post search API
    let attempts = 0;
    let postsSearchRes: any;
    let posts: any[] = [];
    while (attempts < 15) {
      postsSearchRes = await server.inject({
        method: 'GET',
        url: '/api/v1/search/posts?q=postgresql',
        headers: { 'x-mock-user-id': 'test-auth-user' },
      });
      posts = JSON.parse(postsSearchRes.body);
      if (posts.length > 0) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 300));
      attempts++;
    }

    expect(postsSearchRes.statusCode).toBe(200);
    expect(posts.length).toBe(1);
    expect(posts[0].id).toBe('post-uuid-1');
    expect(posts[0].content).toContain('PostgreSQL');

    // Poll hashtag search API
    attempts = 0;
    let tagSearchRes: any;
    let tags: any[] = [];
    while (attempts < 15) {
      tagSearchRes = await server.inject({
        method: 'GET',
        url: '/api/v1/search/hashtags?q=cl',
        headers: { 'x-mock-user-id': 'test-auth-user' },
      });
      tags = JSON.parse(tagSearchRes.body);
      if (tags.length > 0) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 300));
      attempts++;
    }

    expect(tagSearchRes.statusCode).toBe(200);
    expect(tags.length).toBe(1);
    expect(tags[0].tag).toBe('cloud');
    expect(tags[0].postCount).toBe(1);

    // Verify other hashtag queries work too (starts with "#")
    const hashTagSearch = await server.inject({
      method: 'GET',
      url: '/api/v1/search/hashtags?q=%23aws',
      headers: { 'x-mock-user-id': 'test-auth-user' },
    });
    const hashTags = JSON.parse(hashTagSearch.body);
    expect(hashTags.length).toBe(1);
    expect(hashTags[0].tag).toBe('aws');

    // Publish POST_DELETED event
    await snsClient.send(new PublishCommand({
      TopicArn: config.SNS_TOPIC_ARN,
      Message: JSON.stringify({
        type: 'POST_DELETED',
        data: {
          id: 'post-uuid-1',
        },
      }),
    }));

    // Poll until deleted from post index
    attempts = 0;
    while (attempts < 15) {
      postsSearchRes = await server.inject({
        method: 'GET',
        url: '/api/v1/search/posts?q=postgresql',
        headers: { 'x-mock-user-id': 'test-auth-user' },
      });
      posts = JSON.parse(postsSearchRes.body);
      if (posts.length === 0) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 300));
      attempts++;
    }

    expect(posts.length).toBe(0);

    // Verify hashtags are cleaned up
    const finalTagSearch = await server.inject({
      method: 'GET',
      url: '/api/v1/search/hashtags?q=cloud',
      headers: { 'x-mock-user-id': 'test-auth-user' },
    });
    const finalTags = JSON.parse(finalTagSearch.body);
    expect(finalTags.length).toBe(0);
  });
});
