import * as esbuild from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
process.chdir(here);
await mkdir('dist', { recursive: true });

const common = {
  bundle: true,
  format: 'iife',
  target: 'es2017',
  // sourcemap: false bat buoc - sourcemap kieu eval khong chay trong sandbox Figma
  sourcemap: false,
  alias: { '@figma-mcp/core': '../core/src/index.ts' },
};

await esbuild.build({ ...common, entryPoints: ['src/code.ts'], outfile: 'dist/code.js' });

const ui = await esbuild.build({ ...common, entryPoints: ['src/ui.ts'], write: false });

const html = await readFile('src/ui.html', 'utf8');
await writeFile('dist/ui.html', html.replace('/*BUNDLE*/', ui.outputFiles[0].text));
console.log('plugin da build vao dist/');
