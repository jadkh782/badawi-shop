/**
 * Shown when the Supabase keys are missing.
 *
 * Without this the app would throw on its first render and show a blank screen, which tells
 * whoever is setting it up nothing at all. An empty state is an instruction, not an error.
 */
export function SetupNotice() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <p className="eyebrow">Setup</p>
        <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold">
          Connect the database
        </h1>
      </div>

      <p className="text-sm leading-relaxed text-[var(--color-muted)]">
        Badawi Shop needs a Supabase project before it can hold any stock. Create one, then put
        its URL and anon key in a file called <code className="text-[var(--color-sell)]">.env.local</code>{' '}
        beside <code className="text-[var(--color-sell)]">package.json</code>:
      </p>

      <pre className="card overflow-x-auto p-4 text-xs leading-relaxed text-[var(--color-muted)]">
        {`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...`}
      </pre>

      <p className="text-sm leading-relaxed text-[var(--color-muted)]">
        Both values are on the project API settings page. Restart the dev server afterwards, and
        this screen goes away.
      </p>
    </main>
  );
}
