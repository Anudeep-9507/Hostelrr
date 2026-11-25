export type StagedObject = { bytes: Uint8Array; size: number; contentType: string; etag: string };

// Shared by Edge handler and Deno tests. Final key is supplied by server RPC,
// never by browser. Copy must condition on the validated source ETag.
export async function promoteValidatedObject<T extends StagedObject>(args: {
  read: () => Promise<T>;
  validate: (object: T) => Promise<boolean>;
  reserveFinal: () => Promise<string>;
  copy: (finalKey: string, sourceEtag: string) => Promise<{ size: number; contentType: string }>;
  expectedSize: number;
  expectedType: string;
}) {
  const object = await args.read();
  if (object.size !== args.expectedSize || object.bytes.length !== object.size || object.contentType !== args.expectedType || !await args.validate(object)) {
    throw new Error('Uploaded image failed validation');
  }
  const finalKey = await args.reserveFinal();
  const metadata = await args.copy(finalKey, object.etag);
  if (metadata.size !== object.size || metadata.contentType !== object.contentType) throw new Error('Promoted photo metadata mismatch');
  return { object, finalKey };
}

export async function finalizeOrCleanup<T>(finalize: () => Promise<T | null | false>, cleanup: () => Promise<void>): Promise<T> {
  try {
    const value = await finalize();
    if (value === null || value === false) throw new Error('Finalization was rejected');
    return value as T;
  } catch (error) {
    await cleanup();
    throw error;
  }
}
