/**
 * S3-compatible client for MinIO / Backblaze B2 / Cloudflare R2.
 * Switch provider by changing env vars — code stays the same.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

const BUCKET = process.env.S3_BUCKET || "koza-assets"

let client: S3Client | null = null

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({
      endpoint: process.env.S3_ENDPOINT || "http://localhost:9000",
      region: process.env.S3_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || "koza",
        secretAccessKey: process.env.S3_SECRET_KEY || "koza_dev_2026",
      },
      forcePathStyle: true, // Required for MinIO
    })
  }
  return client
}

/**
 * Generate a presigned PUT URL for direct browser upload.
 */
export async function getPresignedUploadUrl(
  key: string,
  contentType: string = "image/webp",
  expiresIn: number = 3600,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  })
  return getSignedUrl(getClient(), command, { expiresIn })
}

/**
 * Generate a presigned GET URL for reading files.
 */
export async function getPresignedReadUrl(
  key: string,
  expiresIn: number = 86400,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  })
  return getSignedUrl(getClient(), command, { expiresIn })
}

/**
 * Get public URL for a file (when bucket is public or behind CDN).
 */
export function getPublicUrl(key: string): string {
  const endpoint = process.env.S3_PUBLIC_URL || process.env.S3_ENDPOINT || "http://localhost:9000"
  return `${endpoint}/${BUCKET}/${key}`
}

/**
 * Delete a file from storage.
 */
export async function deleteFile(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  })
  await getClient().send(command)
}
