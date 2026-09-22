import { ClientMetadataSchema } from '@dymcode/shared';
import { describe, expect, it } from 'vitest';
import { collectMetadata } from './metadata';

describe('collectMetadata', () => {
  it('collects page context in the shared contract shape', () => {
    const meta = collectMetadata(window, [{ message: 'boom', at: 1 }]);
    expect(meta.url).toBe('https://host.example/pricing?plan=pro');
    expect(meta.consoleErrors).toEqual([{ message: 'boom', at: 1 }]);
    expect(meta.user).toBeUndefined();
    expect(ClientMetadataSchema.safeParse(meta).success).toBe(true);
  });

  it('includes identified id and name but never the email', () => {
    const meta = collectMetadata(window, [], { email: 'a@b.co', id: 'u_1', name: 'Ann' });
    expect(meta.user).toEqual({ id: 'u_1', name: 'Ann' });
    expect(ClientMetadataSchema.safeParse(meta).success).toBe(true);
  });

  it('omits user when only an email was identified', () => {
    expect(collectMetadata(window, [], { email: 'a@b.co' }).user).toBeUndefined();
  });

  it('truncates identified fields to 128 chars', () => {
    const meta = collectMetadata(window, [], { id: 'i'.repeat(200) });
    expect(meta.user?.id).toHaveLength(128);
  });
});
