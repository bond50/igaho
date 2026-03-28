import { createHash, randomUUID } from 'node:crypto';

const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
const apiKey = process.env.CLOUDINARY_API_KEY?.trim();
const apiSecret = process.env.CLOUDINARY_API_SECRET?.trim();
const baseFolder = process.env.CLOUDINARY_BASE_FOLDER?.trim() || 'igano';

type CloudinaryUploadResult = {
  secureUrl: string;
  publicId: string;
  originalFilename: string;
  bytes: number;
  format: string | null;
};

function assertCloudinaryConfigured() {
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Cloudinary is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.');
  }

  return { cloudName, apiKey, apiSecret, baseFolder };
}

function signUploadParams(params: Record<string, string>, secret: string) {
  const serialized = Object.entries(params)
    .filter(([, value]) => value.length > 0)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  return createHash('sha1').update(`${serialized}${secret}`).digest('hex');
}

export async function uploadFileToCloudinary(
  file: File,
  options?: {
    folder?: string;
    publicIdPrefix?: string;
  },
): Promise<CloudinaryUploadResult> {
  const config = assertCloudinaryConfigured();
  const timestamp = String(Math.floor(Date.now() / 1000));
  const folder = [config.baseFolder, options?.folder?.trim()].filter(Boolean).join('/');
  const publicId = [options?.publicIdPrefix?.trim() || 'file', `${Date.now()}-${randomUUID()}`].join('-');
  const signature = signUploadParams({ folder, public_id: publicId, timestamp }, config.apiSecret);
  const formData = new FormData();
  const buffer = Buffer.from(await file.arrayBuffer());
  const blob = new Blob([buffer], { type: file.type || 'application/octet-stream' });

  formData.append('file', blob, file.name);
  formData.append('api_key', config.apiKey);
  formData.append('timestamp', timestamp);
  formData.append('folder', folder);
  formData.append('public_id', publicId);
  formData.append('signature', signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${config.cloudName}/auto/upload`, {
    method: 'POST',
    body: formData,
    cache: 'no-store',
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        secure_url?: string;
        public_id?: string;
        original_filename?: string;
        bytes?: number;
        format?: string;
        error?: { message?: string };
      }
    | null;

  if (!response.ok || !payload?.secure_url || !payload.public_id) {
    throw new Error(payload?.error?.message || 'Unable to upload file to Cloudinary.');
  }

  return {
    secureUrl: payload.secure_url,
    publicId: payload.public_id,
    originalFilename: payload.original_filename || file.name,
    bytes: payload.bytes ?? file.size,
    format: payload.format ?? null,
  };
}
