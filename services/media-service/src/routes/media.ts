import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { z } from 'zod';
import { verifyJWT } from '../middleware/auth.js';
import { s3Client } from '../config/aws.js';
import { config } from '../config/index.js';
import crypto from 'crypto';

const presignedUrlQuerySchema = z.object({
  fileName: z.string().min(1),
  fileType: z.string().min(1).refine(
    val => val.startsWith('image/') || val.startsWith('video/'),
    { message: 'Only image or video file types are allowed' }
  ),
});

export async function mediaRoutes(fastify: FastifyInstance) {
  
  // GET /media/presigned-url - Protected endpoint for generating secure client upload destination
  fastify.get('/media/presigned-url', { preHandler: verifyJWT }, async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = request.user!.sub;

    try {
      const { fileName, fileType } = presignedUrlQuerySchema.parse(request.query);
      
      // Sanitize fileName and append unique timestamp prefix
      const sanitizedName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
      const uniqueName = `${Date.now()}_${crypto.randomUUID()}_${sanitizedName}`;
      
      // Upload key structured in partitions by userId
      const s3Key = `uploads/${userId}/${uniqueName}`;

      const command = new PutObjectCommand({
        Bucket: config.S3_BUCKET_NAME,
        Key: s3Key,
        ContentType: fileType,
      });

      // Generate signed URL valid for 15 minutes (900 seconds)
      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

      // Build the final public retrieval URL
      // If USE_LOCALSTACK is true, it points directly to LocalStack container
      // If production, this would be the CloudFront distribution domain name.
      const publicBaseUrl = config.USE_LOCALSTACK === 'true'
        ? `${config.LOCALSTACK_ENDPOINT}/${config.S3_BUCKET_NAME}`
        : `https://${config.S3_BUCKET_NAME}.s3.amazonaws.com`;
      
      const mediaUrl = `${publicBaseUrl}/${s3Key}`;

      return reply.send({
        uploadUrl,
        mediaUrl,
        key: s3Key,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'Validation failed', details: error.errors });
      }
      request.log.error(error, 'Error generating S3 presigned URL');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // GET /health - standard health check endpoint
  fastify.get('/health', async (request, reply) => {
    return reply.send({ status: 'OK', service: 'media-service' });
  });
}
