/**
 * Proves supabase/schema.sql can be pasted into the Supabase SQL editor and run, twice, with
 * no errors. Pasting it a second time is a thing people do when they are not sure the first
 * one took, and it must not leave the database in a worse state than it found it.
 */
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.resolve(fileURLToPath(new URL('.', import.meta.url)));
const UID = '11111111-1111-1111-1111-111111111111';

const db = await PGlite.create({ extensions: { pg_trgm } });

await db.exec(`
  create extension if not exists pg_trgm;
  create schema if not exists auth;
  create table auth.users (id uuid primary key, email text);
  insert into auth.users values ('${UID}', 'shop@badawi.test');
  create or replace function auth.uid() returns uuid language sql stable as
    $fn$ select nullif(current_setting('test.uid', true), '')::uuid $fn$;
  create role authenticated;
  create role anon;
  set test.uid = '${UID}';
`);

const schema = await readFile(path.join(HERE, '..', 'schema.sql'), 'utf8');

for (const pass of [1, 2]) {
  try {
    await db.exec(schema);
    console.log(`  ok   schema.sql applied cleanly (pass ${pass})`);
  } catch (e) {
    console.error(`  FAIL schema.sql failed on pass ${pass}: ${e.message}`);
    process.exit(1);
  }
}

/*
  Reproduce what Supabase actually does to a new project: a blanket GRANT ALL to
  authenticated, which is how the live database ended up holding TRUNCATE on the sales table.
  The schema has to narrow that back down, not merely add to it, so the test hands out the
  blanket grant and then applies the schema once more on top.

  Without this the grant assertions below pass for the wrong reason: a bare Postgres has no
  such default, so an additive-only schema looks correct here and is wrong in production.
*/
await db.exec(`grant all on all tables in schema public to authenticated, anon;`);
await db.exec(schema);
console.log('  ok   schema narrows a blanket GRANT ALL back down');


const { rows } = await db.query(`
  select
    (select count(*) from information_schema.tables where table_schema = 'public') as tables,
    (select count(*) from pg_policies where schemaname = 'public') as policies,
    (select count(*) from information_schema.routines where routine_schema = 'public') as functions,
    (select count(*) from categories) as categories
`);

const r = rows[0];
console.log(`  ok   ${r.tables} tables, ${r.policies} policies, ${r.functions} functions, ${r.categories} categories`);

// The seed uses on-conflict-do-nothing, so a second run must not double the shelves.
if (Number(r.categories) !== 9) {
  console.error(`  FAIL expected 9 seeded categories, found ${r.categories}`);
  process.exit(1);
}

/*
  Row level security decides which rows a role sees; a GRANT decides whether it may touch the
  table at all. Policies without grants fail with "permission denied for table" before any
  policy is consulted, which is how you ship a schema that looks locked down and is simply
  broken. These assertions exist because that is exactly what happened once.
*/
const grants = await db.query(`
  select grantee, table_name, string_agg(privilege_type, ',' order by privilege_type) as privs
  from information_schema.role_table_grants
  where table_schema = 'public' and grantee in ('authenticated', 'anon')
  group by grantee, table_name
`);

const held = new Map(grants.rows.map((r) => [`${r.grantee}:${r.table_name}`, r.privs]));
let ok = true;

// Deliberately mirrors the policies, so the two cannot drift apart unnoticed.
const expected = {
  app_settings: 'SELECT,UPDATE',
  categories: 'DELETE,INSERT,SELECT,UPDATE',
  products: 'DELETE,INSERT,SELECT,UPDATE',
  sales: 'SELECT',
  sale_items: 'SELECT',
  stock_movements: 'SELECT',
  sale_line_facts: 'SELECT',
};

for (const [table, privs] of Object.entries(expected)) {
  const actual = held.get(`authenticated:${table}`);
  if (actual === privs) {
    console.log(`  ok   authenticated may ${privs.toLowerCase()} on ${table}`);
  } else {
    console.log(`  FAIL authenticated on ${table}: expected ${privs}, got ${actual ?? 'nothing'}`);
    ok = false;
  }
}

// The anon key ships inside the APK, so it has to be worthless on its own.
const anonGrants = [...held.keys()].filter((k) => k.startsWith('anon:'));
if (anonGrants.length === 0) {
  console.log('  ok   anon holds no table privileges at all');
} else {
  console.log(`  FAIL anon can still reach ${anonGrants.join(', ')}`);
  ok = false;
}

if (!ok) process.exit(1);

console.log('\nschema.sql is safe to paste, and safe to paste twice.');
