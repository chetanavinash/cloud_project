import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
const s3Client = new S3Client({
  region: 'us-east-1',
  endpoint: 'http://localhost:4566',
  forcePathStyle: true,
  credentials: {
    accessKeyId: 'mock',
    secretAccessKey: 'mock',
  },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

async function run() {
  const s3Key = `test-${Date.now()}.txt`;
  const command = new PutObjectCommand({
    Bucket: 'social-media-attachments',
    Key: s3Key,
    ContentType: 'text/plain',
  });

  const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
  console.log('Generated URL:', uploadUrl);

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    body: 'hello world',
    headers: {
      'Content-Type': 'text/plain',
    }
  });

  console.log('Status:', response.status);
  const text = await response.text();
  console.log('Response body:', text);
}

run().catch(console.error);
