/**
 * Points the app at a Supabase project.
 *
 * Writes .env.local and turns demo mode off, but only after checking the keys actually work
 * and the schema has been applied. Being told "that key is wrong" here is a great deal
 * better than finding out from a blank screen on a phone in the shop.
 *
 * Runs either way:
 *   npm run setup
 *   npm run setup -- --url=https://YOUR-PROJECT.supabase.co --key=YOUR-ANON-KEY
 */
import { createInterface } from 'node:readline/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { stdin, stdout } from 'node:process';

const flag = (name) => {
  const found = process.argv.find((a) => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3).trim() : '';
};

const existing = existsSync('.env.local') ? readFileSync('.env.local', 'utf8') : '';
const prior = (key) => {
  const m = existing.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : '';
};

/*
 * Failures return rather than calling process.exit, because exiting while a fetch is still
 * open trips an assertion inside libuv and prints a wall of C internals under an otherwise
 * clear error message.
 */
function fail(...lines) {
  console.error('\n' + lines.join('\n') + '\n');
  process.exitCode = 1;
}

async function main() {
  console.log('\nBadawi Shop setup\n');

  let url = flag('url') || prior('NEXT_PUBLIC_SUPABASE_URL');
  let key = flag('key');
  let email = flag('email') || prior('NEXT_PUBLIC_SHOP_EMAIL');

  if (!flag('url') || !flag('key')) {
    if (!stdin.isTTY) {
      return fail(
        'Nothing to read from. Pass the values as flags instead:',
        '',
        '  npm run setup -- --url=https://YOUR-PROJECT.supabase.co --key=YOUR-ANON-KEY',
      );
    }

    console.log('Both values are in your Supabase dashboard under Project Settings -> API.');
    console.log('They are safe to keep in the app: row level security is what protects the data.\n');

    const rl = createInterface({ input: stdin, output: stdout });
    const ask = async (q, fallback) => (await rl.question(q)).trim() || fallback || '';

    url = await ask(`Project URL${url ? ` [${url}]` : ''}: `, url);
    key = await ask('Anon public key: ', key);
    email = await ask(`Shop login email (optional)${email ? ` [${email}]` : ''}: `, email);

    rl.close();
  }

  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url)) {
    return fail(
      'That does not look like a project URL.',
      'It should be https://something.supabase.co',
      `Got: ${url || '(nothing)'}`,
    );
  }

  if (key.length < 40) {
    return fail('That anon key looks too short. Copy the whole value from the API settings page.');
  }

  const clean = url.replace(/\/$/, '');
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  console.log('Checking the connection...');

  // Does the key itself work? This endpoint answers for anonymous callers, so it tests the
  // key and the project without touching a table.
  let settings;
  try {
    settings = await fetch(`${clean}/auth/v1/settings`, { headers });
  } catch (e) {
    return fail(`Could not reach ${clean}`, e.message, '', 'Check the URL and your connection.');
  }

  if (settings.status === 401 || settings.status === 403) {
    return fail(
      'The project answered but rejected that key.',
      'Make sure it is the anon public key, not the service role key or the JWT secret.',
    );
  }
  if (!settings.ok) {
    return fail(`The project returned ${settings.status} for the key check.`);
  }

  /*
    Now: is the schema there? Asking anonymously is the useful test, because the two answers
    are distinguishable and both are informative.

    A "permission denied for table" is the good outcome. It means the table exists and the
    anon key genuinely cannot read it, which is precisely what should be true of a key that
    ships inside the APK. A "could not find the table" means the schema has not been applied.
  */
  const probe = await fetch(`${clean}/rest/v1/categories?select=name&limit=1`, { headers });
  const body = await probe.text().catch(() => '');

  const missing =
    probe.status === 404 ||
    body.includes('PGRST205') ||
    /could not find the table|does not exist/i.test(body);

  if (missing) {
    return fail(
      'The project is reachable and the key works, but the tables are not there yet.',
      '',
      'Open the SQL editor in your Supabase dashboard, paste the whole of',
      '  supabase/schema.sql',
      'run it, then run this again.',
    );
  }

  const lockedDown = body.includes('42501') || /permission denied/i.test(body);

  if (!probe.ok && !lockedDown) {
    return fail(`The project returned ${probe.status}.`, body.slice(0, 300));
  }

  if (lockedDown) {
    console.log('Tables are in place, and the anon key cannot read them. That is correct.');
  } else {
    // A readable table means anon was granted access somewhere, which is worth knowing about
    // given this key is public.
    console.log('Tables are in place.');
    console.warn('');
    console.warn('Warning: the anon key can read the categories table.');
    console.warn('Re-run supabase/schema.sql to revoke that, or the data is readable by');
    console.warn('anyone holding the key.');
  }

  writeFileSync(
    '.env.local',
    [
      '# Written by `npm run setup`.',
      '# Safe in the browser bundle: row level security is what protects the data.',
      `NEXT_PUBLIC_SUPABASE_URL=${clean}`,
      `NEXT_PUBLIC_SUPABASE_ANON_KEY=${key}`,
      email ? `NEXT_PUBLIC_SHOP_EMAIL=${email}` : '# NEXT_PUBLIC_SHOP_EMAIL=',
      '',
      '# 1 runs the app against a throwaway in-memory shop instead of the real database.',
      'NEXT_PUBLIC_DEMO=0',
      '',
    ].join('\n'),
  );

  console.log('\nConnected, and the schema is in place.');
  console.log('Wrote .env.local with demo mode off.\n');
  console.log('Next:');
  console.log('  1. Create the shop login: dashboard -> Authentication -> Users -> Add user');
  console.log('  2. npm run dev            try it in a browser');
  console.log('  3. npm run android:apk    build the real APK\n');
}

await main();
