/**
 * Builds the Windows installer for the till.
 *
 * Packaging has to happen outside OneDrive. This repository lives inside a synced folder,
 * and OneDrive opens each new file to upload it the moment it appears — including the
 * app.asar that electron-builder writes and then immediately replaces. The build dies with
 * "the process cannot access the file because it is being used by another process", which
 * says nothing about the real cause and is maddening to chase. Building into a plain temp
 * folder sidesteps it entirely, and the finished installer is copied back at the end.
 *
 *     npm run exe
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STAGING = path.join(os.tmpdir(), 'badawi-exe');
const DESTINATION = path.join(ROOT, 'dist-exe');

if (existsSync(STAGING)) rmSync(STAGING, { recursive: true, force: true });

const result = spawnSync(
  'npx',
  [
    'electron-builder',
    '--win',
    '--config',
    'electron-builder.yml',
    `--config.directories.output=${STAGING.replace(/\\/g, '/')}`,
  ],
  {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
    // npx is a .cmd on Windows, which Node refuses to spawn directly, so it goes through the
    // shell. Every argument here is ours; none of it comes from outside.
    shell: true,
  },
);

if (result.error) {
  console.error(`\nCould not run electron-builder: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`\nThe installer did not build (electron-builder exited ${result.status}).`);
  process.exit(result.status ?? 1);
}

const installers = readdirSync(STAGING).filter((name) => name.endsWith('.exe'));
if (installers.length === 0) {
  console.error('\nThe build reported success but produced no installer.');
  process.exit(1);
}

mkdirSync(DESTINATION, { recursive: true });
for (const name of installers) {
  const from = path.join(STAGING, name);
  copyFileSync(from, path.join(DESTINATION, name));
  const mb = (statSync(from).size / 1024 / 1024).toFixed(0);
  console.log(`\n  ${path.join('dist-exe', name)}  (${mb} MB)`);
}

console.log(`
  Copy that onto the till and run it.

  Windows will warn that the publisher is unknown, because the installer is not signed:
  More info, then Run anyway. Signing it needs a certificate bought from a certificate
  authority, which is the only thing that makes that warning go away.

  The app loads the live shop, so pushing to main updates the till the next time it starts.
  Nothing needs reinstalling for an ordinary change.
`);
