import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAsset, readAssets } from '../src/mcp/assets.js';

let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'assets-'));
  await writeFile(join(dir, 'hero.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await mkdir(join(dir, 'sub'), { recursive: true });
  await writeFile(join(dir, 'sub', 'logo.png'), Buffer.from([1, 2, 3]));
});
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe('resolveAsset', () => {
  it('giải được đường dẫn trong thư mục assets', async () => {
    await expect(resolveAsset('hero.png', dir)).resolves.toContain('hero.png');
  });
  it('giải được đường dẫn trong thư mục con', async () => {
    await expect(resolveAsset('sub/logo.png', dir)).resolves.toContain('logo.png');
  });
  it('từ chối path traversal', async () => {
    await expect(resolveAsset('../../etc/passwd', dir)).rejects.toThrow(/ngoài thư mục assets|không tồn tại/);
  });
  it('từ chối đường dẫn tuyệt đối ra ngoài', async () => {
    await expect(resolveAsset(join(tmpdir(), 'other.png'), dir)).rejects.toThrow(/ngoài thư mục assets|không tồn tại/);
  });
  it('báo lỗi rõ khi file không tồn tại', async () => {
    await expect(resolveAsset('missing.png', dir)).rejects.toThrow(/không tồn tại/);
  });
});

describe('readAssets', () => {
  it('đọc nhiều file thành base64 trong một lượt', async () => {
    const out = await readAssets(['hero.png', 'sub/logo.png'], dir);
    expect(Object.keys(out)).toEqual(['hero.png', 'sub/logo.png']);
    expect(out['hero.png']).toBe(Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'));
  });
});
