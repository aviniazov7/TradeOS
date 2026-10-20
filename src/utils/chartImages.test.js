import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  dataUrlToBlob,
  imageFileFromClipboard,
  imageRejectReason,
  MAX_STORED_IMAGE_BYTES,
} from './chartImages';
import { chartObjectPath } from './tradeImageSlots';

describe('chart image files', () => {
  it('accepts a pasted png and refuses other types', () => {
    const png = { type: 'image/png', getAsFile: () => ({ type: 'image/png', name: 'shot.png' }) };
    expect(imageFileFromClipboard({ items: [png] })).toMatchObject({ type: 'image/png' });
    expect(imageFileFromClipboard({ files: [{ type: 'image/jpeg', name: 'a.jpg' }] }).type).toBe('image/jpeg');
    expect(imageFileFromClipboard({ files: [{ type: 'image/svg+xml' }] })).toBeNull();
    expect(imageFileFromClipboard(null)).toBeNull();
    expect(imageRejectReason({ type: 'image/gif' })).toBeNull();
    expect(imageRejectReason({ type: 'image/svg+xml' })).toMatch(/PNG/);
    expect(imageRejectReason(null)).toMatch(/תמונה/);
  });

  it('turns a compressed data URL into a blob under the storage cap', () => {
    const payload = btoa('chart-bytes');
    const blob = dataUrlToBlob(`data:image/png;base64,${payload}`);
    expect(blob.type).toBe('image/png');
    expect(blob.size).toBe('chart-bytes'.length);
    expect(blob.size).toBeLessThan(MAX_STORED_IMAGE_BYTES);
    expect(() => dataUrlToBlob('data:image/svg+xml;base64,PHN2Zy8+')).toThrow();
    expect(() => dataUrlToBlob('https://example.com/a.png')).toThrow();
  });

  it('stores each screenshot under the owning user', () => {
    expect(chartObjectPath('uid1', 'trade_0')).toBe('users/uid1/charts/trade_0');
    expect(() => chartObjectPath('', 'trade_0')).toThrow();
  });
});

describe('storage.rules', () => {
  const rules = readFileSync(fileURLToPath(new URL('../../storage.rules', import.meta.url)), 'utf8');

  it('limits chart files to the owner, to images, and to 2MB', () => {
    expect(rules).toContain('match /users/{userId}/charts/{imageId}');
    expect(rules).toContain('request.auth.uid == userId');
    expect(rules).toContain('request.resource.size <= 2 * 1024 * 1024');
    expect(rules).toContain("image/(jpeg|png|webp)");
    expect(rules).not.toContain('allow read: if true');
    expect(rules).not.toContain('allow read, write: if true');
  });
});
