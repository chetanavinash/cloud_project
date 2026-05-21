import { ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { sqsClient, docClient } from '../config/aws.js';
import { config } from '../config/index.js';
import { connectionManager } from '../ws/connection-manager.js';
import crypto from 'crypto';

class SQSConsumer {
  private running = false;
  private pollTimeout: NodeJS.Timeout | null = null;

  public start() {
    if (this.running) return;
    this.running = true;
    console.log('SQS Consumer starting long-polling loop...');
    this.poll();
  }

  public stop() {
    this.running = false;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
    }
    console.log('SQS Consumer stopped polling.');
  }

  private async poll() {
    if (!this.running) return;

    try {
      const response = await sqsClient.send(new ReceiveMessageCommand({
        QueueUrl: config.SQS_QUEUE_URL,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 2, // Low value for responsive integration testing
      }));

      if (response.Messages && response.Messages.length > 0) {
        for (const message of response.Messages) {
          await this.processMessage(message);
        }
      }
    } catch (error: any) {
      // If QueueDoesNotExist or similar in LocalStack, log warning rather than throwing
      if (error.name === 'QueueDoesNotExist' || error.message?.includes('AWS.SimpleQueueService.NonExistentQueue')) {
        console.warn(`SQS Queue ${config.SQS_QUEUE_URL} does not exist yet. Retrying in 5s...`);
      } else {
        console.error('Error polling SQS messages:', error);
      }
      // Wait before retrying on error
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Schedule next poll immediately
    this.pollTimeout = setTimeout(() => this.poll(), 10);
  }

  private async processMessage(message: any) {
    try {
      const outerBody = JSON.parse(message.Body);
      let payload = outerBody;

      // Handle SNS Subscription Message format
      if (outerBody.Message) {
        try {
          payload = JSON.parse(outerBody.Message);
        } catch {
          payload = outerBody.Message;
        }
      }

      if (!payload.userId || !payload.type || !payload.senderId || !payload.senderName) {
        console.warn('Invalid notification message payload formats:', payload);
        // Remove toxic message from queue
        await sqsClient.send(new DeleteMessageCommand({
          QueueUrl: config.SQS_QUEUE_URL,
          ReceiptHandle: message.ReceiptHandle,
        }));
        return;
      }

      // Write to DynamoDB Notifications Table
      const id = `${Date.now()}_${crypto.randomUUID()}`;
      const notification = {
        userId: payload.userId,
        id,
        type: payload.type,
        senderId: payload.senderId,
        senderName: payload.senderName,
        senderAvatarUrl: payload.senderAvatarUrl || null,
        postId: payload.postId || null,
        commentId: payload.commentId || null,
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      await docClient.send(new PutCommand({
        TableName: config.DYNAMODB_TABLE,
        Item: notification,
      }));

      // Push real-time WS alert
      connectionManager.sendToUser(payload.userId, {
        type: 'NOTIFICATION',
        notification,
      });

      // Acknowledge (delete) the message
      await sqsClient.send(new DeleteMessageCommand({
        QueueUrl: config.SQS_QUEUE_URL,
        ReceiptHandle: message.ReceiptHandle,
      }));

    } catch (error) {
      console.error('Failed to process message:', error);
    }
  }
}

export const sqsConsumer = new SQSConsumer();
