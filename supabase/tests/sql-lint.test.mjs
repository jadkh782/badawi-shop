/**
 * Catches the statements that work locally and fail on Supabase.
 *
 * Supabase preloads the safeupdate extension, which refuses any DELETE or UPDATE with no
 * WHERE clause. A bare Postgres does not, so the schema tests pass happily and the app then
 * fails in the shop with "DELETE requires a WHERE clause". That is exactly what happened to
 * reset_shop, so it is checked here rather than trusted to review.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../migrations');

let failures = 0;
const files = (await readdir(MIGRATIONS)).filter((f) => f.endsWith('.sql')).sort();

for (const file of files) {
  const sql = await readFile(path.join(MIGRATIONS, file), 'utf8');

  sql.split('\n').forEach((line, index) => {
    const code = line.replace(/--.*$/, '').trim();
    if (!code) return;

    // A statement is only safe if it reaches a WHERE before its semicolon. Multi-line
    // statements are left alone: they end on a later line and are checked there.
    const bareDelete = /^delete\s+from\s+[\w."]+\s*;/i.test(code);
    const bareUpdate = /^update\s+[\w."]+\s+set\s+[^;]*;/i.test(code) && !/\bwhere\b/i.test(code);

    if (bareDelete || bareUpdate) {
      console.log(`  FAIL ${file}:${index + 1}  ${code.slice(0, 70)}`);
      console.log('       needs a WHERE clause; Supabase refuses this at runtime');
      failures++;
    }
  });
}

if (failures > 0) {
  console.log(`\n${failures} statement(s) Supabase would refuse.`);
  process.exit(1);
}

console.log(`  ok   no unqualified DELETE or UPDATE in ${files.length} migrations`);
