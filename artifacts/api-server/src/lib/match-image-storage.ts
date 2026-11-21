import { createHash, createHmac, randomUUID } from "node:crypto";

const MAX_IMAGE_BYTES = 1_087_500;
const DATA_IMAGE_RE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/i;

type StorageConfig = {
  endpoint: URL;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  publicBaseUrl: URL;
};

function getConfig(): StorageConfig | null {
  const { OBJECT_STORAGE_ENDPOINT, OBJECT_STORAGE_BUCKET, OBJECT_STORAGE_ACCESS_KEY_ID, OBJECT_STORAGE_SECRET_ACCESS_KEY, OBJECT_STORAGE_PUBLIC_BASE_URL } = process.env;
  if (!OBJECT_STORAGE_ENDPOINT || !OBJECT_STORAGE_BUCKET || !OBJECT_STORAGE_ACCESS_KEY_ID || !OBJECT_STORAGE_SECRET_ACCESS_KEY || !OBJECT_STORAGE_PUBLIC_BASE_URL) return null;
  try {
    const endpoint = new URL(OBJECT_STORAGE_ENDPOINT);
    const publicBaseUrl = new URL(OBJECT_STORAGE_PUBLIC_BASE_URL);
    if ((endpoint.protocol !== "https:" && endpoint.hostname !== "localhost") || publicBaseUrl.protocol !== "https:") return null;
    if (endpoint.pathname !== "/" || endpoint.search || endpoint.hash || publicBaseUrl.search || publicBaseUrl.hash) return null;
    return {
      endpoint,
      bucket: OBJECT_STORAGE_BUCKET,
      accessKeyId: OBJECT_STORAGE_ACCESS_KEY_ID,
      secretAccessKey: OBJECT_STORAGE_SECRET_ACCESS_KEY,
      region: process.env.OBJECT_STORAGE_REGION || "auto",
      publicBaseUrl,
    };
  } catch {
    return null;
  }
}

export function isMatchImageStorageConfigured(): boolean {
  return getConfig() !== null;
}

function matchesMimeSignature(body: Buffer, mime: string): boolean {
  if (mime === "jpeg") return body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  if (mime === "png") return body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return mime === "webp" && body.length >= 12 && body.toString("ascii", 0, 4) === "RIFF" && body.toString("ascii", 8, 12) === "WEBP";
}

function hash(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

function canonicalUri(bucket: string, key: string): string {
  return `/${awsEncode(bucket)}/${key.split("/").map(awsEncode).join("/")}`;
}

function signingKey(secret: string, date: string, region: string): Buffer {
  const dateKey = hmac(`AWS4${secret}`, date);
  const regionKey = hmac(dateKey, region);
  const serviceKey = hmac(regionKey, "s3");
  return hmac(serviceKey, "aws4_request");
}

async function putObject(config: StorageConfig, key: string, body: Buffer, contentType: string): Promise<void> {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const date = amzDate.slice(0, 8);
  const payloadHash = hash(body);
  const uri = canonicalUri(config.bucket, key);
  const host = config.endpoint.host;
  const canonicalHeaders = `content-type:${contentType.trim()}\nhost:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = `PUT\n${uri}\n\n${canonicalHeaders}${signedHeaders}\n${payloadHash}`;
  const scope = `${date}/${config.region}/s3/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${scope}\n${hash(canonicalRequest)}`;
  const signature = createHmac("sha256", signingKey(config.secretAccessKey, date, config.region)).update(stringToSign).digest("hex");
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const url = new URL(config.endpoint);
  url.pathname = uri;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "content-type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization: authorization,
      "cache-control": "public, max-age=31536000, immutable",
    },
    body,
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Object storage rejected the upload (${response.status}).`);
}

export async function uploadMatchImage(dataUrl: unknown, userId: string): Promise<string> {
  const config = getConfig();
  if (!config) throw new Error("Pitch photo storage is not configured. Set the OBJECT_STORAGE_* settings on the API.");
  if (typeof dataUrl !== "string") throw new Error("Choose a valid JPEG, PNG, or WebP photo.");
  const match = DATA_IMAGE_RE.exec(dataUrl);
  if (!match) throw new Error("Choose a JPEG, PNG, or WebP photo.");
  const body = Buffer.from(match[2], "base64");
  if (!body.length || body.length > MAX_IMAGE_BYTES || body.toString("base64") !== match[2]) throw new Error("Each compressed pitch photo must be under 1 MB.");
  if (!matchesMimeSignature(body, match[1].toLowerCase())) throw new Error("The selected file is not a valid image. Choose a JPEG, PNG, or WebP photo.");
  const extension = match[1].toLowerCase() === "jpeg" ? "jpg" : match[1].toLowerCase();
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(userId)) throw new Error("Could not identify the signed-in user.");
  const key = `matches/${userId}/${randomUUID()}.${extension}`;
  await putObject(config, key, body, `image/${match[1].toLowerCase()}`);
  const base = config.publicBaseUrl.toString().replace(/\/$/, "");
  return `${base}/${key.split("/").map(awsEncode).join("/")}`;
}

