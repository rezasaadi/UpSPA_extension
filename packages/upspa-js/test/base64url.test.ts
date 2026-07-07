import { describe, expect, it } from 'vitest';
import { base64UrlToBytes, bytesToBase64Url, utf8ToBase64Url, base64UrlToUtf8 } from '../src/base64url.js';
describe('base64url helpers', () => {
  it('round-trips bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 3, 254, 255]);
    const b64 = bytesToBase64Url(bytes);
    const back = base64UrlToBytes(b64);
    expect([...back]).toEqual([...bytes]);
    expect(b64.includes('+')).toBe(false);
    expect(b64.includes('/')).toBe(false);
    expect(b64.includes('=')).toBe(false);
  });
  it('round-trips utf8 strings', () => {
    const s = 'hello 🌍 / 123';
    const b64 = utf8ToBase64Url(s);
    const back = base64UrlToUtf8(b64);
    expect(back).toBe(s);
  });
});
