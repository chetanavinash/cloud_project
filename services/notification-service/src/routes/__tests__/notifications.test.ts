import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import WebSocket from 'ws';
import { buildServer } from '../../server.js';
import { ensureTableExists, ensureSqsSnsExists, docClient, snsClient } from '../../config/aws.js';
import { sqsConsumer } from '../../sqs/consumer.js';
import { config } from '../../config/index.js';
import { ScanCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { PublishCommand } from '@aws-sdk/client-sns';

describe('Notification Service API & WS Integration Tests', () => {
  let server: any;
  let serverPort: number;

  beforeAll(async () => {
    console.log('beforeAll: building server...');
    server = await buildServer();
    
    console.log('beforeAll: ensuring DynamoDB table exists...');
    await ensureTableExists();
    
    console.log('beforeAll: ensuring SQS/SNS exists...');
    await ensureSqsSnsExists();

    console.log('beforeAll: starting SQS consumer...');
    sqsConsumer.start();

    console.log('beforeAll: binding server to port...');
    await server.listen({ port: 0, host: '127.0.0.1' });
    serverPort = server.server.address().port;
    console.log(`beforeAll: server bound to port ${serverPort}`);
  });

  afterAll(async () => {
    console.log('afterAll: stopping SQS consumer...');
    sqsConsumer.stop();
    console.log('afterAll: closing server...');
    await server.close();
    console.log('afterAll: finished.');
  });

  beforeEach(async () => {
    console.log('beforeEach: clearing DynamoDB table...');
    const scanRes = await docClient.send(new ScanCommand({
      TableName: config.DYNAMODB_TABLE,
    }));

    if (scanRes.Items && scanRes.Items.length > 0) {
      console.log(`beforeEach: deleting ${scanRes.Items.length} items...`);
      for (const item of scanRes.Items) {
        await docClient.send(new DeleteCommand({
          TableName: config.DYNAMODB_TABLE,
          Key: {
            userId: item.userId,
            id: item.id,
          },
        }));
      }
    }
    console.log('beforeEach: finished.');
  });

  // 1. Test Health endpoint
  it('should return health status', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({
      status: 'OK',
      service: 'notification-service',
    });
  });

  // 2. Test WebSocket connection and event fanout
  it('should handle WebSocket connection and push notification message published to SNS/SQS', async () => {
    const wsUrl = `ws://127.0.0.1:${serverPort}/ws?x-mock-user-id=test-user-123`;
    console.log('Connecting to WebSocket URL:', wsUrl);
    
    // Promise to assert message receive over socket
    const receivedNotification = new Promise<any>((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const timeout = setTimeout(() => {
        console.log('Test timeout triggered, closing WS...');
        ws.close();
        reject(new Error('WebSocket message receive timeout'));
      }, 15000);

      ws.on('open', () => {
        console.log('WebSocket connection opened successfully in test client.');
      });

      ws.on('message', (data: any) => {
        console.log('WebSocket client received message:', data.toString());
        const payload = JSON.parse(data.toString());
        if (payload.type === 'NOTIFICATION') {
          console.log('Received expected NOTIFICATION payload, resolving...');
          clearTimeout(timeout);
          ws.close();
          resolve(payload.notification);
        }
      });

      ws.on('error', (err: any) => {
        console.error('WebSocket client error:', err);
        clearTimeout(timeout);
        reject(err);
      });

      ws.on('close', (code: any, reason: any) => {
        console.log(`WebSocket client closed. Code: ${code}, Reason: ${reason.toString()}`);
      });
    });

    // Wait a brief moment for WebSocket server connection mapping to open
    await new Promise(resolve => setTimeout(resolve, 500));

    // Publish test activity event via SNS
    console.log('Publishing LIKE event to SNS...');
    await snsClient.send(new PublishCommand({
      TopicArn: config.SNS_TOPIC_ARN,
      Message: JSON.stringify({
        userId: 'test-user-123',
        type: 'LIKE',
        senderId: 'bob-sender-id',
        senderName: 'bobbuilder',
        senderAvatarUrl: 'https://example.com/bob.jpg',
        postId: 'post-uuid-1',
      }),
    }));
    console.log('LIKE event published to SNS.');

    // Wait for WebSocket client to parse push event
    const notification = await receivedNotification;
    expect(notification.userId).toBe('test-user-123');
    expect(notification.type).toBe('LIKE');
    expect(notification.senderName).toBe('bobbuilder');
    expect(notification.postId).toBe('post-uuid-1');
    expect(notification.isRead).toBe(false);
  }, 15000);

  // 3. Test REST endpoints: GET Notifications & POST mark as read
  it('should retrieve notification history and update status to read', async () => {
    // 1. Directly inject a notification item in DynamoDB
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/notifications',
      headers: {
        'x-mock-user-id': 'user-alice',
      },
    });

    expect(res.statusCode).toBe(200);
    let body = JSON.parse(res.body);
    expect(body.notifications.length).toBe(0);

    // Publish event via SNS and wait for it to process into DynamoDB
    await snsClient.send(new PublishCommand({
      TopicArn: config.SNS_TOPIC_ARN,
      Message: JSON.stringify({
        userId: 'user-alice',
        type: 'COMMENT',
        senderId: 'user-bob',
        senderName: 'bob',
        postId: 'post-xyz',
        commentId: 'comment-abc',
      }),
    }));

    // Poll DynamoDB through API until the SQS consumer registers the notification
    let attempts = 0;
    let listResponse: any;
    while (attempts < 10) {
      listResponse = await server.inject({
        method: 'GET',
        url: '/api/v1/notifications',
        headers: { 'x-mock-user-id': 'user-alice' },
      });
      body = JSON.parse(listResponse.body);
      if (body.notifications.length > 0) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 300));
      attempts++;
    }

    expect(listResponse.statusCode).toBe(200);
    expect(body.notifications.length).toBe(1);
    const notificationItem = body.notifications[0];
    expect(notificationItem.userId).toBe('user-alice');
    expect(notificationItem.type).toBe('COMMENT');
    expect(notificationItem.isRead).toBe(false);

    // 2. Mark notification as read
    const readResponse = await server.inject({
      method: 'POST',
      url: `/api/v1/notifications/${notificationItem.id}/read`,
      headers: { 'x-mock-user-id': 'user-alice' },
    });

    expect(readResponse.statusCode).toBe(200);
    const updatedItem = JSON.parse(readResponse.body);
    expect(updatedItem.isRead).toBe(true);

    // 3. Confirm status change in list history
    const finalResponse = await server.inject({
      method: 'GET',
      url: '/api/v1/notifications',
      headers: { 'x-mock-user-id': 'user-alice' },
    });
    const finalBody = JSON.parse(finalResponse.body);
    expect(finalBody.notifications[0].isRead).toBe(true);
  }, 15000);
});
