import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../server.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Interaction Service API Integration Tests', () => {
  let server: any;
  const postId = 'test-post-uuid-1234';

  beforeAll(async () => {
    server = await buildServer();
    
    // Clean up test records
    await prisma.comment.deleteMany({});
    await prisma.like.deleteMany({});
    await prisma.bookmark.deleteMany({});
  });

  afterAll(async () => {
    await server.close();
    await prisma.$disconnect();
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
      service: 'interaction-service',
    });
  });

  // 2. Like operations
  it('should like, get status, and unlike a post', async () => {
    const userId = 'user-alice-999';

    // Verify initially unliked
    const initialRes = await server.inject({
      method: 'GET',
      url: `/api/v1/posts/${postId}/like-status`,
      headers: { 'x-mock-user-id': userId }
    });
    expect(initialRes.statusCode).toBe(200);
    expect(JSON.parse(initialRes.body)).toEqual({ liked: false, count: 0 });

    // Like the post
    const likeRes = await server.inject({
      method: 'POST',
      url: `/api/v1/posts/${postId}/like`,
      headers: { 'x-mock-user-id': userId }
    });
    expect(likeRes.statusCode).toBe(201);
    expect(JSON.parse(likeRes.body).message).toContain('liked post');

    // Verify liked status and count is 1
    const activeRes = await server.inject({
      method: 'GET',
      url: `/api/v1/posts/${postId}/like-status`,
      headers: { 'x-mock-user-id': userId }
    });
    expect(JSON.parse(activeRes.body)).toEqual({ liked: true, count: 1 });

    // Idempotent like check (should return 200 already liked)
    const doubleLikeRes = await server.inject({
      method: 'POST',
      url: `/api/v1/posts/${postId}/like`,
      headers: { 'x-mock-user-id': userId }
    });
    expect(doubleLikeRes.statusCode).toBe(200);

    // Unlike the post
    const unlikeRes = await server.inject({
      method: 'DELETE',
      url: `/api/v1/posts/${postId}/like`,
      headers: { 'x-mock-user-id': userId }
    });
    expect(unlikeRes.statusCode).toBe(200);

    // Verify like status reset
    const finalRes = await server.inject({
      method: 'GET',
      url: `/api/v1/posts/${postId}/like-status`,
      headers: { 'x-mock-user-id': userId }
    });
    expect(JSON.parse(finalRes.body)).toEqual({ liked: false, count: 0 });
  });

  // 3. Comment operations (Threaded)
  it('should create comments and retrieve them in a threaded structure', async () => {
    const userAlice = 'user-alice';
    const userBob = 'user-bob';

    // 1. Create a top-level comment by Alice
    const parentCommentRes = await server.inject({
      method: 'POST',
      url: `/api/v1/posts/${postId}/comments`,
      headers: { 'x-mock-user-id': userAlice },
      payload: { content: 'This is an awesome post!' }
    });
    expect(parentCommentRes.statusCode).toBe(201);
    const parentComment = JSON.parse(parentCommentRes.body);
    expect(parentComment.content).toBe('This is an awesome post!');
    expect(parentComment.parentId).toBeNull();

    // 2. Create a reply comment by Bob
    const replyCommentRes = await server.inject({
      method: 'POST',
      url: `/api/v1/posts/${postId}/comments`,
      headers: { 'x-mock-user-id': userBob },
      payload: {
        content: 'I agree with Alice!',
        parentId: parentComment.id
      }
    });
    expect(replyCommentRes.statusCode).toBe(201);
    const replyComment = JSON.parse(replyCommentRes.body);
    expect(replyComment.parentId).toBe(parentComment.id);

    // 3. Fetch comments paginated
    const getCommentsRes = await server.inject({
      method: 'GET',
      url: `/api/v1/posts/${postId}/comments?limit=10`
    });
    expect(getCommentsRes.statusCode).toBe(200);
    const getCommentsBody = JSON.parse(getCommentsRes.body);
    expect(getCommentsBody.comments).toHaveLength(1);
    expect(getCommentsBody.comments[0].id).toBe(parentComment.id);
    
    // Verify Bob's reply comment is nested inline inside Alice's parent comment
    expect(getCommentsBody.comments[0].replies).toHaveLength(1);
    expect(getCommentsBody.comments[0].replies[0].id).toBe(replyComment.id);

    // 4. Delete comment bob created (Forbidden for Alice)
    const badDelete = await server.inject({
      method: 'DELETE',
      url: `/api/v1/comments/${replyComment.id}`,
      headers: { 'x-mock-user-id': userAlice }
    });
    expect(badDelete.statusCode).toBe(403);

    // 5. DeleteBob's comment Bob created (Succeeds)
    const goodDelete = await server.inject({
      method: 'DELETE',
      url: `/api/v1/comments/${replyComment.id}`,
      headers: { 'x-mock-user-id': userBob }
    });
    expect(goodDelete.statusCode).toBe(200);

    // Verify deletion in database
    const dbComment = await prisma.comment.findUnique({ where: { id: replyComment.id } });
    expect(dbComment).toBeNull();
  });

  // 4. Bookmarks Operations
  it('should bookmark, fetch bookmarked list, and remove bookmark', async () => {
    const userId = 'user-bookmark-fan';
    const targetPostId = 'post-bookmarked-777';

    // Create bookmark
    const bookmarkRes = await server.inject({
      method: 'POST',
      url: `/api/v1/posts/${targetPostId}/bookmark`,
      headers: { 'x-mock-user-id': userId }
    });
    expect(bookmarkRes.statusCode).toBe(201);

    // Fetch bookmarks list
    const getBookmarksRes = await server.inject({
      method: 'GET',
      url: `/api/v1/users/${userId}/bookmarks?limit=10`,
      headers: { 'x-mock-user-id': userId }
    });
    expect(getBookmarksRes.statusCode).toBe(200);
    const body = JSON.parse(getBookmarksRes.body);
    expect(body.bookmarks).toHaveLength(1);
    expect(body.bookmarks[0].postId).toBe(targetPostId);

    // Fetch bookmarks list of another user (Forbidden)
    const badBookmarksRes = await server.inject({
      method: 'GET',
      url: `/api/v1/users/${userId}/bookmarks?limit=10`,
      headers: { 'x-mock-user-id': 'different-user' }
    });
    expect(badBookmarksRes.statusCode).toBe(403);

    // Remove bookmark
    const removeRes = await server.inject({
      method: 'DELETE',
      url: `/api/v1/posts/${targetPostId}/bookmark`,
      headers: { 'x-mock-user-id': userId }
    });
    expect(removeRes.statusCode).toBe(200);

    // Verify removed
    const verifyRes = await server.inject({
      method: 'GET',
      url: `/api/v1/users/${userId}/bookmarks?limit=10`,
      headers: { 'x-mock-user-id': userId }
    });
    expect(JSON.parse(verifyRes.body).bookmarks).toHaveLength(0);
  });
});
