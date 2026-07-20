import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'stream';

@Injectable()
export class S3Service {
  private readonly client: S3Client;
  private readonly presignClient: S3Client;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('S3_BUCKET', 'chat-files');
    const internalEndpoint = config.get<string>('S3_ENDPOINT', 'http://localhost:9000');
    // Presigned URLs are handed to the browser, so they must point at a
    // publicly reachable host. In dev this equals the internal endpoint; in
    // prod the server talks to MinIO over the Docker network (http://minio:9000)
    // while browsers use S3_PUBLIC_ENDPOINT (http://<public-ip>:9000).
    const publicEndpoint = config.get<string>('S3_PUBLIC_ENDPOINT') || internalEndpoint;
    const credentials = {
      accessKeyId: config.get<string>('S3_ACCESS_KEY', 'inmobiles'),
      secretAccessKey: config.get<string>('S3_SECRET_KEY', 'inmobiles-secret'),
    };
    const common = { region: 'us-east-1', forcePathStyle: true, credentials };
    this.client = new S3Client({ endpoint: internalEndpoint, ...common });
    this.presignClient = new S3Client({ endpoint: publicEndpoint, ...common });
  }

  async putObject(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async getObject(key: string): Promise<{ body: Readable; contentType: string }> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return {
      body: res.Body as Readable,
      contentType: res.ContentType ?? 'application/octet-stream',
    };
  }

  async deleteObject(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  presignGet(key: string, expiresInSeconds = 3600): Promise<string> {
    return getSignedUrl(
      this.presignClient,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }
}
