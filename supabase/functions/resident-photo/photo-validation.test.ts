import { assertEquals } from 'jsr:@std/assert@1.0.14';
import { validateImage } from './photo-validation.ts';

const onePixelPng = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a7sAAAAASUVORK5CYII='), (c) => c.charCodeAt(0));

Deno.test('accepts valid PNG bytes with matching MIME and extension', async () => {
  assertEquals(await validateImage(onePixelPng, 'image/png', 'photo.png', 1024), true);
});

Deno.test('rejects invalid bytes despite image MIME metadata', async () => {
  assertEquals(await validateImage(new TextEncoder().encode('not an image'), 'image/png', 'photo.png', 1024), false);
});

Deno.test('rejects signature, MIME, and extension mismatches', async () => {
  assertEquals(await validateImage(onePixelPng, 'image/jpeg', 'photo.jpg', 1024), false);
  assertEquals(await validateImage(onePixelPng, 'image/png', 'photo.jpg', 1024), false);
});

Deno.test('rejects files over the configured limit', async () => {
  assertEquals(await validateImage(onePixelPng, 'image/png', 'photo.png', onePixelPng.length - 1), false);
});
