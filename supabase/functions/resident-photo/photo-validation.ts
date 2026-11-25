import { Image } from 'jsr:@matmen/imagescript@3.20.3';

const EXTENSIONS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

const detectedMime = (bytes: Uint8Array): string | null => {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 12 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') return 'image/webp';
  return null;
};

export const validateImage = async (bytes: Uint8Array, contentType: string, key: string, maxSize: number) => {
  const signatureMime = detectedMime(bytes);
  if (bytes.length <= 0 || bytes.length > maxSize || signatureMime !== contentType || !key.endsWith(`.${EXTENSIONS[contentType]}`)) return false;
  try {
    const image = await Image.decode(bytes, { maxPixels: 16_000_000, threads: 1 });
    return image.width > 0 && image.height > 0;
  } catch {
    return false;
  }
};
