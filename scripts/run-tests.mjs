import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as esbuild from 'esbuild';

const mode = process.argv[2] || '--all';

const allFiles = fs
  .readdirSync(path.resolve('tests'))
  .filter((f) => f.endsWith('.test.ts'))
  .sort();

const selectedFiles = allFiles.filter((f) => {
  if (mode === '--unit') {
    return f === 'core.test.ts' || f.startsWith('unit_');
  }
  if (mode === '--integration') {
    return f.startsWith('integration_');
  }
  return true;
});

if (selectedFiles.length === 0) {
  console.error(`No test files matched mode "${mode}" in tests/`);
  process.exit(1);
}

const builtOutputs = [];

try {
  for (const file of selectedFiles) {
    const outFile = path.join(
      os.tmpdir(),
      `real-tws-${file.replace(/\.ts$/, '')}-${process.pid}.mjs`
    );
    await esbuild.build({
      entryPoints: [path.resolve('tests', file)],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile: outFile
    });
    builtOutputs.push(outFile);
  }

  execFileSync(process.execPath, ['--test', ...builtOutputs], { stdio: 'inherit' });
} finally {
  for (const outFile of builtOutputs) {
    if (fs.existsSync(outFile)) {
      fs.unlinkSync(outFile);
    }
  }
}
