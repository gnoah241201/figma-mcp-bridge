import * as esbuild from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// esbuild chot working directory luc khoi dong service, nen process.chdir()
// khong co tac dung. Phai truyen absWorkingDir + duong dan tuyet doi.
const root = fileURLToPath(new URL('.', import.meta.url));
const dist = join(root, 'dist');
await mkdir(dist, { recursive: true });

const common = {
  absWorkingDir: root,
  bundle: true,
  format: 'iife',
  target: 'es2017',
  // sourcemap: false bat buoc - sourcemap kieu eval khong chay trong sandbox Figma
  sourcemap: false,
  // direct eval la co y: figma_eval chay code AI sinh ra trong sandbox. esbuild canh bao
  // vi eval thay scope da bi doi ten, nhung code eval chi cham figma va helper tren
  // globalThis - khong cham bien cuc bo nao cua bundle. Spike 2026-09-16 da xac minh.
  logOverride: { 'direct-eval': 'silent' },
  alias: { '@figma-mcp/core': join(root, '..', 'core', 'src', 'index.ts') },
};

await esbuild.build({
  ...common,
  entryPoints: [join(root, 'src', 'code.ts')],
  outfile: join(dist, 'code.js'),
});

const ui = await esbuild.build({
  ...common,
  entryPoints: [join(root, 'src', 'ui.ts')],
  write: false,
});

const html = await readFile(join(root, 'src', 'ui.html'), 'utf8');
await writeFile(join(dist, 'ui.html'), html.replace('/*BUNDLE*/', ui.outputFiles[0].text));
console.log('plugin da build vao', dist);
