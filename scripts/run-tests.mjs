import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as esbuild from 'esbuild';

const tempOut = path.join(os.tmpdir(), 'real-tws-tests.mjs');

await esbuild.build({
  entryPoints: ['tests/core.test.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: tempOut
});

try {
  execFileSync(process.execPath, ['--test', tempOut], { stdio: 'inherit' });
} finally {
  if (fs.existsSync(tempOut)) {
    fs.unlinkSync(tempOut);
  }
}
