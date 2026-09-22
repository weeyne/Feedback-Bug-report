import { createClient } from '@supabase/supabase-js';

export const SCREENSHOT_BUCKET = 'screenshots';

export interface StoredFile {
  data: Uint8Array;
  contentType: string;
}

export interface Storage {
  /** Throws on failure. */
  upload(path: string, data: Uint8Array, contentType: string): Promise<void>;
  download(path: string): Promise<StoredFile | null>;
  /** Returns the paths that were actually removed. Throws if the request itself fails. */
  remove(paths: string[]): Promise<string[]>;
}

export interface MemoryStorage extends Storage {
  files: Map<string, StoredFile>;
  failUploads: boolean;
  failRemovals: Set<string>;
}

export function createMemoryStorage(): MemoryStorage {
  const storage: MemoryStorage = {
    files: new Map(),
    failUploads: false,
    failRemovals: new Set(),
    async upload(path, data, contentType) {
      if (storage.failUploads) throw new Error('memory storage: upload failed');
      storage.files.set(path, { data, contentType });
    },
    async download(path) {
      return storage.files.get(path) ?? null;
    },
    async remove(paths) {
      const removed: string[] = [];
      for (const path of paths) {
        if (storage.failRemovals.has(path) || !storage.files.has(path)) continue;
        storage.files.delete(path);
        removed.push(path);
      }
      return removed;
    },
  };
  return storage;
}

export function createSupabaseStorage(url: string, secretKey: string): Storage {
  const bucket = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(SCREENSHOT_BUCKET);
  return {
    async upload(path, data, contentType) {
      const { error } = await bucket.upload(path, data, { contentType, upsert: false });
      if (error) throw new Error(`storage upload failed: ${error.message}`);
    },
    async download(path) {
      const { data, error } = await bucket.download(path);
      if (error || !data) return null;
      return { data: new Uint8Array(await data.arrayBuffer()), contentType: data.type };
    },
    async remove(paths) {
      if (paths.length === 0) return [];
      const { data, error } = await bucket.remove(paths);
      if (error) throw new Error(`storage remove failed: ${error.message}`);
      return (data ?? []).map((object) => object.name);
    },
  };
}
