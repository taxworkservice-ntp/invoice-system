import { S3Client, DeleteObjectCommand, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getEnv } from "./env.js";

// Server-only credentials — no VITE_* fallbacks: Vite would inline them
// into the client bundle.
const bucket = getEnv("R2_BUCKET");
const accessKeyId = getEnv("R2_ACCESS_KEY_ID");
const secretAccessKey = getEnv("R2_SECRET_ACCESS_KEY");
const endpoint = getEnv("R2_ENDPOINT");

export const r2Bucket = bucket;

const r2 = new S3Client({
  region: "auto",
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle: true,
});

export function getUploadSignedUrl(key, contentType) {
  return getSignedUrl(
    r2,
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType || "application/octet-stream",
    }),
    { expiresIn: 300 }
  );
}

export function putR2Object(key, body, contentType) {
  return r2.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType || "application/octet-stream",
    })
  );
}

export function getDownloadSignedUrl(key, expiresIn = 3600) {
  return getSignedUrl(
    r2,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn }
  );
}

export function deleteR2Object(key) {
  return r2.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    })
  );
}
