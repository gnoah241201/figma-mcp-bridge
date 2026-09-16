import { realpath, readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { LIMITS } from '@figma-mcp/core';

/** Giải đường dẫn và bắt buộc nằm trong assetsDir. Chặn cả path traversal lẫn symlink trỏ ra ngoài. */
export async function resolveAsset(relPath: string, assetsDir: string): Promise<string> {
  const base = await realpath(assetsDir);
  const candidate = resolve(base, relPath);

  let real: string;
  try {
    real = await realpath(candidate);
  } catch {
    throw new Error(`File "${relPath}" không tồn tại trong thư mục assets (${base})`);
  }

  if (real !== base && !real.startsWith(base + sep)) {
    throw new Error(`Đường dẫn "${relPath}" nằm ngoài thư mục assets (${base}) — bị từ chối`);
  }

  const info = await stat(real);
  if (info.size > LIMITS.imageMaxBytes) {
    throw new Error(`File "${relPath}" nặng ${Math.round(info.size / 1024 / 1024)}MB, vượt trần 10MB`);
  }
  return real;
}

export async function readAssets(paths: string[], assetsDir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const p of paths) {
    const full = await resolveAsset(p, assetsDir);
    out[p] = (await readFile(full)).toString('base64');
  }
  return out;
}
