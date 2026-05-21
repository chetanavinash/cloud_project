import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../server.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('User Service API Integration Tests', () => {
  let server: any;

  beforeAll(async () => {
    server = await buildServer();
    
    // Clean up test records
    await prisma.follow.deleteMany({});
    await prisma.user.deleteMany({});
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
      service: 'user-service',
    });
  });

  // 2. Test User Registration
  it('should register a new user using mock auth bypass', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/register',
      headers: {
        'x-mock-user-id': 'test-user-1',
        'x-mock-email': 'alice@example.com',
      },
      payload: {
        username: 'alice',
        displayName: 'Alice Cooper',
        password: 'password123',
        bio: 'Rock guitarist',
        avatarUrl: 'https://example.com/alice.jpg',
      },
    });

    expect(response.statusCode).toBe(201);
    
    const body = JSON.parse(response.body);
    expect(body.id).toBe('test-user-1');
    expect(body.username).toBe('alice');
    expect(body.displayName).toBe('Alice Cooper');
    expect(body.followerCount).toBe(0);
    expect(body.followingCount).toBe(0);
  });

  // 3. Test Conflict Registration
  it('should reject registration with duplicate username', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/v1/register',
      headers: {
        'x-mock-user-id': 'test-user-different',
        'x-mock-email': 'alice-alt@example.com',
      },
      payload: {
        username: 'alice', // Conflict username
        displayName: 'Alice Alternate',
        password: 'password123',
      },
    });

    expect(response.statusCode).toBe(409);
  });

  // 4. Test Fetch Profile
  it('should fetch profile details of registered user', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/v1/users/test-user-1',
    });

    expect(response.statusCode).toBe(200);
    
    const body = JSON.parse(response.body);
    expect(body.username).toBe('alice');
    expect(body.bio).toBe('Rock guitarist');
  });

  // 5. Test Update Profile
  it('should update profile successfully', async () => {
    const response = await server.inject({
      method: 'PUT',
      url: '/api/v1/users/test-user-1',
      headers: {
        'x-mock-user-id': 'test-user-1',
      },
      payload: {
        displayName: 'Alice updated',
        bio: 'Legendary Rockstar',
      },
    });

    expect(response.statusCode).toBe(200);
    
    const body = JSON.parse(response.body);
    expect(body.displayName).toBe('Alice updated');
    expect(body.bio).toBe('Legendary Rockstar');
  });

  // 6. Test Follow Flow
  it('should execute follow operations and increment follow counters', async () => {
    // Register Bob
    const bobReg = await server.inject({
      method: 'POST',
      url: '/api/v1/register',
      headers: {
        'x-mock-user-id': 'test-user-2',
        'x-mock-email': 'bob@example.com',
      },
      payload: {
        username: 'bob',
        displayName: 'Bob Builder',
        password: 'password123',
      },
    });
    
    expect(bobReg.statusCode).toBe(201);

    // Alice follows Bob
    const followRes = await server.inject({
      method: 'POST',
      url: '/api/v1/users/test-user-2/follow',
      headers: {
        'x-mock-user-id': 'test-user-1',
      },
    });

    expect(followRes.statusCode).toBe(200);

    // Check Alice's updated followingCount (should be 1)
    const aliceRes = await server.inject({
      method: 'GET',
      url: '/api/v1/users/test-user-1',
    });
    const alice = JSON.parse(aliceRes.body);
    expect(alice._count.following).toBe(1);

    // Check Bob's updated followerCount (should be 1)
    const bobRes = await server.inject({
      method: 'GET',
      url: '/api/v1/users/test-user-2',
    });
    const bob = JSON.parse(bobRes.body);
    expect(bob._count.followers).toBe(1);
  });
});
