#!/usr/bin/env node

/**
 * Development worker: rebuilds the worker bundle on change and restarts it.
 * The Octokit packages are ESM-only, so the worker always runs as a bundled ES module.
 */
import { spawn } from 'node:child_process';
import { context } from 'esbuild';

let child = null;

function stopChild() {
  return new Promise(resolve => {
    if (!child || child.exitCode !== null) return resolve();
    child.once('exit', () => resolve());
    child.kill('SIGTERM');
  });
}

async function restart() {
  await stopChild();
  child = spawn(process.execPath, ['--enable-source-maps', 'dist/worker.mjs'], {
    stdio: 'inherit',
  });
}

const ctx = await context({
  entryPoints: ['src/worker.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  packages: 'external',
  format: 'esm',
  sourcemap: true,
  outfile: 'dist/worker.mjs',
  logLevel: 'info',
  plugins: [
    {
      name: 'restart-worker',
      setup(build) {
        build.onEnd(result => {
          if (result.errors.length === 0) void restart();
        });
      },
    },
  ],
});

await ctx.watch();

async function shutdown() {
  await ctx.dispose();
  await stopChild();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
