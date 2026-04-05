import { Injectable, OnModuleInit } from '@nestjs/common';
import { Client } from 'minio';
import * as dotenv from 'dotenv';
dotenv.config();

@Injectable()
export class StorageService implements OnModuleInit {
  private minioClient: Client;

  async onModuleInit() {
    try {
      this.minioClient = new Client({
        endPoint: process.env.MINIO_ENDPOINT || 'localhost',
        port: parseInt(process.env.MINIO_PORT || '9000', 10),
        useSSL: false,
        accessKey: process.env.MINIO_ACCESS_KEY,
        secretKey: process.env.MINIO_SECRET_KEY,
      });

      const bucket = process.env.MINIO_BUCKET || 'uploads';
      const exists = await this.minioClient
        .bucketExists(bucket)
        .catch(() => false);
      if (!exists) {
        await this.minioClient.makeBucket(bucket, 'us-east-1');
      }

      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${bucket}/*`],
          },
        ],
      };
      await this.minioClient.setBucketPolicy(bucket, JSON.stringify(policy));
      console.log('MinIO connection initialized');
    } catch (error) {
      console.error('MinIO Initialization Error:', error.message);
    }
  }

  private sanitizeFilename(filename: string) {
    return filename
      .replaceAll('/', '_')
      .replaceAll('\\', '_')
      .replaceAll(' ', '_');
  }

  async uploadFile(
    entryId: string,
    userId: string,
    buffer: Buffer,
    filename: string,
    mimetype?: string,
  ) {
    const safeFilename = this.sanitizeFilename(filename);
    const key = `${userId}/${entryId}/${Date.now()}-${safeFilename}`;
    await this.minioClient.putObject(
      process.env.MINIO_BUCKET || 'uploads',
      key,
      buffer,
      buffer.length,
      { 'Content-Type': mimetype || 'application/octet-stream' },
    );
    return { key };
  }

  async getFileStream(key: string) {
    return this.minioClient.getObject(
      process.env.MINIO_BUCKET || 'uploads',
      key,
    );
  }

  async listAssets(prefix = '') {
    const bucket = process.env.MINIO_BUCKET || 'uploads';
    const objects: Array<{ key: string; size?: number; lastModified?: Date }> =
      [];

    const stream = this.minioClient.listObjectsV2(bucket, prefix, true);
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (obj) => {
        if (obj?.name) {
          objects.push({
            key: obj.name,
            size: obj.size,
            lastModified: obj.lastModified,
          });
        }
      });
      stream.on('error', reject);
      stream.on('end', () => resolve());
    });

    return objects;
  }
}
