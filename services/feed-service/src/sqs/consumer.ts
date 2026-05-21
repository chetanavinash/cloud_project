import { sqsClient } from '../config/aws.js';
import { ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs';
import { config } from '../config/index.js';
import { userPrisma } from '../config/db.js';
import { redis } from '../config/redis.js';

let isRunning = false;

export async function start() {
  if (isRunning) return;
  isRunning = true;
  console.log('SQS Fan-out Consumer started...');

  // Start polling loop in background (non-blocking)
  pollMessages().catch(err => {
    console.error('Fatal error in SQS Fan-out Consumer polling loop:', err);
  });
}

export async function stop() {
  isRunning = false;
  console.log('SQS Fan-out Consumer stopping...');
}

async function pollMessages() {
  while (isRunning) {
    try {
      const data = await sqsClient.send(new ReceiveMessageCommand({
        QueueUrl: config.SQS_QUEUE_URL,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 20, // Long polling
      }));

      if (data.Messages && data.Messages.length > 0) {
        for (const message of data.Messages) {
          if (!isRunning) break;
          
          try {
            await handleMessage(message);
            // Delete message from queue after processing
            await sqsClient.send(new DeleteMessageCommand({
              QueueUrl: config.SQS_QUEUE_URL,
              ReceiptHandle: message.ReceiptHandle!,
            }));
          } catch (err) {
            console.error('Error processing SQS message:', err);
          }
        }
      }
    } catch (err) {
      console.error('Error polling SQS queue:', err);
      // Wait 5 seconds before retrying to prevent hot loop on connection errors
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

async function handleMessage(message: any) {
  const body = JSON.parse(message.Body);
  
  // If the message is from SNS, it will be wrapped in an SNS message wrapper
  let payload = body;
  if (body.TopicArn && body.Message) {
    payload = JSON.parse(body.Message);
  }

  const { type, data } = payload;
  console.log(`Received event type: ${type}`);

  if (type === 'POST_CREATED') {
    const { id: postId, authorId, createdAt } = data;
    const score = new Date(createdAt).getTime();

    // 1. Query the author's followerCount and check if they are a celebrity
    const author = await userPrisma.user.findUnique({
      where: { id: authorId },
      select: { followerCount: true, id: true }
    });

    if (!author) {
      console.warn(`Author with ID ${authorId} not found. Skipping fan-out.`);
      return;
    }

    if (author.followerCount >= 10000) {
      // Celebrity Bypass Workflow
      console.log(`Author ${authorId} is a celebrity (followers: ${author.followerCount}). Saving to celebrity sorted set.`);
      const celebrityKey = `celebrity:${authorId}`;
      await redis.zadd(celebrityKey, score, postId);
      // Cap at 200 items
      await redis.zremrangebyrank(celebrityKey, 0, -201);
    } else {
      // Regular User Fan-out Workflow
      console.log(`Author ${authorId} is a regular user. Fanning out to followers.`);
      // Query follower list
      const followers = await userPrisma.follow.findMany({
        where: { followingId: authorId },
        select: { followerId: true }
      });

      // Targets include the author themselves + all followers
      const targets = [authorId, ...followers.map(f => f.followerId)];

      // Check which targets have active feed caches
      const pipelineExists = redis.pipeline();
      targets.forEach(t => {
        pipelineExists.exists(`feed:${t}`);
      });
      const existsResults = await pipelineExists.exec();

      if (existsResults) {
        const pipelineAdd = redis.pipeline();
        let fanoutCount = 0;

        targets.forEach((t, index) => {
          const [err, exists] = existsResults[index];
          if (!err && exists === 1) {
            const userKey = `feed:${t}`;
            pipelineAdd.zadd(userKey, score, postId);
            pipelineAdd.zremrangebyrank(userKey, 0, -201);
            fanoutCount++;
          }
        });

        if (fanoutCount > 0) {
          await pipelineAdd.exec();
          console.log(`Fanned out post ${postId} to ${fanoutCount} active feed caches (including author if active).`);
        } else {
          console.log(`No active feed caches found for targets of author ${authorId}.`);
        }
      }
    }
  }
}
