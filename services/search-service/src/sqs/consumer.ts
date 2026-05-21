import { ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { sqsClient } from '../config/aws.js';
import { config } from '../config/index.js';
import { prisma } from '../config/db.js';

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
        WaitTimeSeconds: 2,
      }));

      if (response.Messages && response.Messages.length > 0) {
        for (const message of response.Messages) {
          await this.processMessage(message);
        }
      }
    } catch (error: any) {
      if (error.name === 'QueueDoesNotExist' || error.message?.includes('AWS.SimpleQueueService.NonExistentQueue')) {
        console.warn(`SQS Queue ${config.SQS_QUEUE_URL} does not exist yet. Retrying in 5s...`);
      } else {
        console.error('Error polling SQS messages:', error);
      }
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

      if (!payload.type || !payload.data) {
        console.warn('Invalid event message payload format:', payload);
        await sqsClient.send(new DeleteMessageCommand({
          QueueUrl: config.SQS_QUEUE_URL,
          ReceiptHandle: message.ReceiptHandle,
        }));
        return;
      }

      const { type, data } = payload;

      console.log(`Processing event: ${type} for id: ${data.id}`);

      switch (type) {
        case 'USER_CREATED':
        case 'USER_UPDATED': {
          await prisma.searchUser.upsert({
            where: { id: data.id },
            update: {
              username: data.username,
              displayName: data.displayName,
              bio: data.bio || '',
              avatarUrl: data.avatarUrl || null,
            },
            create: {
              id: data.id,
              username: data.username,
              displayName: data.displayName,
              bio: data.bio || '',
              avatarUrl: data.avatarUrl || null,
            },
          });
          break;
        }
        case 'POST_CREATED': {
          const content = data.content;
          const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
          const matches = [...content.matchAll(hashtagRegex)];
          const tags = Array.from(new Set(matches.map(m => m[1].toLowerCase())));

          // We use a transaction or serial updates
          await prisma.searchPost.upsert({
            where: { id: data.id },
            update: {
              authorId: data.authorId,
              content: content,
              mediaUrl: data.mediaUrl || null,
              createdAt: new Date(data.createdAt),
            },
            create: {
              id: data.id,
              authorId: data.authorId,
              content: content,
              mediaUrl: data.mediaUrl || null,
              createdAt: new Date(data.createdAt),
            },
          });

          // Upsert hashtags
          for (const tag of tags) {
            await prisma.searchHashtag.upsert({
              where: { tag },
              update: { postCount: { increment: 1 } },
              create: { tag, postCount: 1 },
            });
          }
          break;
        }
        case 'POST_DELETED': {
          const existingPost = await prisma.searchPost.findUnique({
            where: { id: data.id },
          });

          if (existingPost) {
            const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
            const matches = [...existingPost.content.matchAll(hashtagRegex)];
            const tags = Array.from(new Set(matches.map(m => m[1].toLowerCase())));

            // Decrement and potentially cleanup hashtags
            for (const tag of tags) {
              const hashtag = await prisma.searchHashtag.findUnique({ where: { tag } });
              if (hashtag) {
                if (hashtag.postCount <= 1) {
                  await prisma.searchHashtag.delete({ where: { tag } });
                } else {
                  await prisma.searchHashtag.update({
                    where: { tag },
                    data: { postCount: { decrement: 1 } },
                  });
                }
              }
            }

            await prisma.searchPost.delete({
              where: { id: data.id },
            });
          }
          break;
        }
        default:
          console.warn(`Unhandled event type: ${type}`);
      }

      // Delete message from SQS queue
      await sqsClient.send(new DeleteMessageCommand({
        QueueUrl: config.SQS_QUEUE_URL,
        ReceiptHandle: message.ReceiptHandle,
      }));

    } catch (error) {
      console.error('Failed to process search index SQS message:', error);
    }
  }
}

export const sqsConsumer = new SQSConsumer();
