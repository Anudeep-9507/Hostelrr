import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { finalizeOrCleanup, promoteValidatedObject } from './staged-upload.ts';

const object = () => ({ bytes: new Uint8Array([1, 2, 3]), size: 3, contentType: 'image/png', etag: '"v1"' });

Deno.test('replay cannot reserve a consumed upload', async () => {
  let consumed = false;
  const reserve = async () => {
    if (consumed) throw new Error('consumed');
    consumed = true;
    return 'residents/h/r/final.png';
  };
  await promoteValidatedObject({ read: async () => object(), validate: async () => true, reserveFinal: reserve, copy: async () => ({ size: 3, contentType: 'image/png' }), expectedSize: 3, expectedType: 'image/png' });
  await assertRejects(() => promoteValidatedObject({ read: async () => object(), validate: async () => true, reserveFinal: reserve, copy: async () => ({ size: 3, contentType: 'image/png' }), expectedSize: 3, expectedType: 'image/png' }), Error, 'consumed');
});

Deno.test('post-validation staging overwrite fails ETag conditional copy', async () => {
  let finalCreated = false;
  const copy = async (_key: string, etag: string) => {
    assertEquals(etag, '"v1"');
    throw new Error('PreconditionFailed');
  };
  await assertRejects(() => promoteValidatedObject({ read: async () => object(), validate: async () => true, reserveFinal: async () => 'residents/h/r/final.png', copy, expectedSize: 3, expectedType: 'image/png' }), Error, 'PreconditionFailed');
  assertEquals(finalCreated, false);
});

Deno.test('aborted upload never reaches promotion', async () => {
  let copies = 0;
  await assertRejects(() => promoteValidatedObject({ read: async () => object(), validate: async () => true, reserveFinal: async () => { throw new Error('aborted'); }, copy: async () => { copies++; return { size: 3, contentType: 'image/png' }; }, expectedSize: 3, expectedType: 'image/png' }), Error, 'aborted');
  assertEquals(copies, 0);
});

Deno.test('failed final metadata verification rejects promotion', async () => {
  await assertRejects(() => promoteValidatedObject({ read: async () => object(), validate: async () => true, reserveFinal: async () => 'residents/h/r/final.png', copy: async () => ({ size: 2, contentType: 'image/png' }), expectedSize: 3, expectedType: 'image/png' }), Error, 'metadata mismatch');
});

Deno.test('failed database finalization queues both staging and final keys', async () => {
  const queued: string[] = [];
  await assertRejects(() => finalizeOrCleanup(async () => { throw new Error('database unavailable'); }, async () => {
    queued.push('staging/residents/h/r/upload.png', 'residents/h/r/final.png');
  }), Error, 'database unavailable');
  assertEquals(queued, ['staging/residents/h/r/upload.png', 'residents/h/r/final.png']);
});
