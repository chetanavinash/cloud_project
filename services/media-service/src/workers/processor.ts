import { ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { s3Client } from '../config/aws.js';
import { config } from '../config/index.js';

class MediaProcessorSimulator {
  private interval: NodeJS.Timeout | null = null;
  private processing = false;

  public start() {
    console.log('Media Processor Simulator started polling uploads/');
    this.interval = setInterval(() => this.poll(), 5000);
  }

  public stop() {
    if (this.interval) {
      clearInterval(this.interval);
    }
    console.log('Media Processor Simulator stopped.');
  }

  private async poll() {
    if (this.processing) return;
    this.processing = true;

    try {
      // List all objects in uploads/ prefix
      const response = await s3Client.send(new ListObjectsV2Command({
        Bucket: config.S3_BUCKET_NAME,
        Prefix: 'uploads/',
      }));

      if (response.Contents && response.Contents.length > 0) {
        for (const item of response.Contents) {
          if (item.Key && item.Key !== 'uploads/') {
            await this.processItem(item.Key);
          }
        }
      }
    } catch (error) {
      console.error('Error polling uploads bucket in simulator:', error);
    } finally {
      this.processing = false;
    }
  }

  private async processItem(key: string) {
    console.log(`Simulator detected file to process: ${key}`);

    try {
      // 1. Fetch file from uploads/
      const fileData = await s3Client.send(new GetObjectCommand({
        Bucket: config.S3_BUCKET_NAME,
        Key: key,
      }));

      // Extract details
      const contentType = fileData.ContentType || 'image/jpeg';
      const keyParts = key.split('/'); // e.g. ["uploads", "userId", "filename"]
      const userId = keyParts[1] || 'unknown';
      const filename = keyParts[2] || 'file';

      const isVideo = contentType.startsWith('video/');

      if (isVideo) {
        console.log(`Processing video transcoding for: ${filename}`);
        // Simulate HLS transcode: write index playlist and segment chunks
        const baseProcessedKey = `processed/${userId}/${filename}`;
        
        await s3Client.send(new PutObjectCommand({
          Bucket: config.S3_BUCKET_NAME,
          Key: `${baseProcessedKey}/index.m3u8`,
          Body: '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:10\n#EXTINF:10.0,\nsegment0.ts\n#EXT-X-ENDLIST',
          ContentType: 'application/x-mpegURL',
        }));

        await s3Client.send(new PutObjectCommand({
          Bucket: config.S3_BUCKET_NAME,
          Key: `${baseProcessedKey}/segment0.ts`,
          Body: 'mock-ts-binary-content',
          ContentType: 'video/MP2T',
        }));

        console.log(`Video transcode simulated. Outputs saved to: ${baseProcessedKey}/index.m3u8`);
      } else {
        console.log(`Processing image resizing for: ${filename}`);
        
        // Read file body as buffer
        const bodyBuffer = fileData.Body && typeof (fileData.Body as any).transformToByteArray === 'function'
          ? Buffer.from(await (fileData.Body as any).transformToByteArray())
          : await new Promise<Buffer>((resolve, reject) => {
              const chunks: any[] = [];
              (fileData.Body as any).on('data', (chunk: any) => chunks.push(chunk));
              (fileData.Body as any).on('error', reject);
              (fileData.Body as any).on('end', () => resolve(Buffer.concat(chunks)));
            });

        // Simulate image resizing: write actual image content for thumbnail, small, medium, large
        const resolutions = ['thumbnail', 'small', 'medium', 'large'];
        const baseProcessedKey = `processed/${userId}/${filename}`;

        for (const res of resolutions) {
          await s3Client.send(new PutObjectCommand({
            Bucket: config.S3_BUCKET_NAME,
            Key: `${baseProcessedKey}/${res}.jpg`,
            Body: bodyBuffer,
            ContentType: contentType,
          }));
        }

        console.log(`Image resizing simulated. Resolutions saved to: ${baseProcessedKey}/[resolution].jpg`);
      }

      // 2. Delete original file from uploads/ to prevent infinite reprocessing loop
      await s3Client.send(new DeleteObjectCommand({
        Bucket: config.S3_BUCKET_NAME,
        Key: key,
      }));

      console.log(`Original upload cleaned up: ${key}`);
    } catch (error) {
      console.error(`Failed to process item: ${key}`, error);
    }
  }
}

export const mediaProcessorSimulator = new MediaProcessorSimulator();
