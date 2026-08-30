# Badawi Shop

A phone-first till and stock system. Two modes and nothing else in the way:

- **Sell** — scan a barcode, it lands in the cart, discount at checkout, stock comes off by itself.
- **Inventory** — scan or type an article, set its cost, price and count, restock it later.

Plus reporting on best sellers, daily takings and profit, exportable to Excel for any period.

Prices are kept in **US dollars**; every figure is also shown in **Lebanese pounds** at a rate you
set. The rate in force is frozen onto each sale, so an old receipt reproduces exactly what the
customer paid rather than being reconverted at today's rate.

---

## Where the data lives

There is **no database on the phone**. The app is a till; Supabase is the shop's books.

Every product, sale and stock level lives in a Postgres database in your Supabase project.
The phone, the desktop browser and the Android app are all just windows onto it, which is why
two devices always agree and why nothing is lost if a phone is dropped.

The one exception is **demo mode**. With `NEXT_PUBLIC_DEMO=1` the app runs against a shop held
in memory instead, so it can be tried before any of the below is done. Nothing is saved: close
the app and every sale rung up on it is gone. The app says so in an amber strip across the top,
and calls itself "Badawi Shop (demo)". **If you see that strip, you are not looking at real
data.**

---

## Going live

Four steps, about ten minutes.

**1. Create the project.** At [supabase.com/dashboard](https://supabase.com/dashboard), new
project, free tier. Note the database password it asks you to set; you will not need it here,
but you will want it one day.

**2. Create the tables.** In the dashboard open **SQL Editor -> New query**, paste the entire
contents of `supabase/schema.sql`, and hit Run. That one file is every migration in order. It
is safe to run twice if you are not sure it took.

**3. Point the app at it.**

```bash
npm run setup
```

It asks for the **Project URL** and **anon public key**, both on the **Project Settings -> API**
page. Before writing anything it checks the project answers, the key is accepted and the tables
exist, so a typo is caught here rather than by a blank screen in the shop. It writes
`.env.local` and turns demo mode off.

Non-interactively:

```bash
npm run setup -- --url=https://YOUR-PROJECT.supabase.co --key=YOUR-ANON-KEY
```

**4. Create the shop login.** Dashboard -> **Authentication -> Users -> Add user**, with an
email and password you choose. Do this yourself; the app never handles account creation.

Then build the real thing:

```bash
npm run android:apk     # the APK, now talking to your database
npm run dev             # or try it in a browser first
```

The amber demo strip will be gone. That is how you know it is live.

### Trying it first, without any of that

```bash
npm install
npm run dev
```

`.env.local` ships with `NEXT_PUBLIC_DEMO=1`: fourteen articles, five categories and a fortnight
of trading, so every screen has something real in it. Throwaway by design.

---

## Two screens, one app

The layout follows the width it is given, and the features never change with it.

- **Phone** — one column, a coloured rule under the title saying which mode you are in, and
  every action pinned to the bottom in thumb reach.
- **Tablet** — the same, with more room.
- **Desktop** (1024px and up) — the modes move into a rail down the left so you are never more
  than one click from Sell, Inventory or Reports. Paired fields sit side by side, the report
  cards go two-up, and sheets become centred dialogs instead of clinging to the bottom edge.

Every control clears the 44px touch minimum at every width, and nothing scrolls sideways.

## Installing it on Android

The app packages into a real APK with Capacitor. The web build is copied **inside** the APK, so
there is no website involved: it opens instantly and works with no hosting at all.

```bash
npm run android:apk
```

That builds the web app, syncs it into the Android project and produces:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Roughly 27 MB. Copy it to the phone and open it, or with the phone plugged in:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

The build script finds the JDK that Android Studio ships and the SDK for you — there is no
`JAVA_HOME` to set. If you keep your JDK somewhere unusual, set `CAPACITOR_JAVA_HOME`.

### Scanning inside the app

Android gets **Google ML Kit running natively**, with the barcode model bundled into the APK so
nothing downloads and it works offline. It reads a creased label, at an angle, in the dim light
behind a counter, at a distance the browser decoders give up at.

It is simply a fourth implementation of the same `IBarcodeScanner` interface the web ones satisfy.
Adding it took one class and one line in the factory; the camera screen did not change at all.

| Where | What runs |
|---|---|
| The Android app | Google ML Kit, native, model bundled in the APK |
| Android Chrome | the browser's own `BarcodeDetector` |
| iOS Safari, desktop | a WebAssembly decoder, served from the app so a poor connection is fine |
| Any USB or Bluetooth scanner | recognised by its keystroke burst, no setup, works anywhere in Sell mode |

There is always a **type the barcode** box as a fallback.

### Exporting from the phone

A WebView cannot download a file: a link with a download attribute is ignored, silently. So on
Android the workbook is written into the app's **Documents** folder and then offered to the
share sheet, which is how it reaches Drive, WhatsApp or email. Even if you dismiss the share,
the file is already on the phone. The toast names the file so you know what to look for.

In a browser it downloads normally, or uses the share sheet where the browser supports one.

### Signing a release build

The debug APK above installs and runs as-is. For a version to hand around, make a key once:

```bash
keytool -genkey -v -keystore android/badawi.jks -keyalg RSA -keysize 2048 -validity 10000 -alias badawi
```

Then create `android/keystore.properties`:

```
storeFile=badawi.jks
storePassword=YOUR-PASSWORD
keyAlias=badawi
keyPassword=YOUR-PASSWORD
```

Both files are git-ignored. `npm run android:apk -- --release` now signs itself. **Keep the
keystore safe** — without it you cannot ship an update that Android will accept over the old one.

## In a browser instead

The whole app builds to static files (`npm run build` writes `out/`), so it can be served from
anywhere. The camera in a browser needs a secure context — `https://` or `localhost` — so opening
`http://192.168.x.x:3000` on a phone loads the app but leaves the camera blocked.

```bash
npx vercel
```

Set the two `NEXT_PUBLIC_SUPABASE_*` variables there, and **do not** set `NEXT_PUBLIC_DEMO`. Then
add the URL to the phone's home screen: it is a PWA, so it runs full screen with its own icon.

---

## Putting it on the web

The app builds to static files, so any host will serve it. Vercel picks the settings up on its
own.

**1. Push to GitHub**, then in Vercel choose **Add New → Project** and import the repository.
Framework detection finds Next.js; leave the build settings alone.

**2. Add the environment variables** under Settings → Environment Variables, for Production,
Preview and Development:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | your project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon public key |
| `NEXT_PUBLIC_SHOP_PIN` | the PIN the site opens with |
| `NEXT_PUBLIC_DEMO` | `0` |

Copy the first two from your local `.env.local`. **Do not set `NEXT_PUBLIC_DEMO=1`** in
production, or the site will run on throwaway data.

**3. Deploy.** Every push to `main` redeploys from then on.

### The phone and the website are the same shop

Both point at the same Supabase project and read and write the same tables. A sale rung up on
the phone is in the website's figures, and an article added on the computer is scannable on the
phone straight away.

They are not pushed to each other live: an open page shows what it loaded. Pull to refresh, or
change the report period, and it is current again. Stock is the exception and never drifts,
because it is decided inside `checkout_sale` in the database rather than by either device.

### What is public, and what that means

The anon key ships inside the JavaScript bundle and inside the APK. It has to: the browser needs
it to talk to Supabase at all. Anonymous sign-ins are enabled, so anyone who has that key can
obtain a session.

The PIN is a screen lock, checked on the device. It is not a barrier to someone calling the
database directly.

So treat the deployment URL as private, and know that **turning anonymous sign-ins off in
Supabase → Authentication → Sign In / Providers cuts off every holder of that key immediately.**
That is the switch to reach for if the URL ever gets out.

## How it is put together

The dependency rule points inward: nothing in an inner layer knows an outer one exists.

```
src/
  domain/           pure TypeScript. No React, no Supabase, no fetch.
  application/      use cases and the port interfaces they depend on.
  infrastructure/   Supabase, the scanners, Excel, the demo shop.
  presentation/     screens and components.
  container.ts      the only file that names a concrete implementation.
android/            the Capacitor wrapper. No app logic lives here.
```

**SRP** — `Cart` computes, `CheckoutSale` posts, `SupabaseSaleRepository` speaks SQL. Three
reasons to change, three classes.

**OCP** — a new discount is a new `IDiscountStrategy`; a CSV export is a new `IReportExporter`; a
different scanner is a new `IBarcodeScanner`. No existing file gets edited.

**LSP** — every scanner honours the same `start`/`stop` contract, so the camera screen is written
once and works against all three.

**ISP** — Sell mode depends on `IProductReader`, not on a wider interface that also exposes
delete. A bug at the till cannot remove an article.

**DIP** — screens resolve ports from `container()`. Demo mode swaps all seven implementations in
one place and not a single screen, use case or entity changes. That is the clearest evidence the
layering is real rather than decorative.

### What a thing cost, and taking a sale back

Two behaviours are worth knowing about before you rely on the figures.

**A supplier's price moves, and the shop chooses what that means.** Every delivery is entered at
the price paid per unit, and when that differs from last time the app stops and asks what the
shelf price should do about it: hold the same margin, take a new price, or leave it. Which cost
the books then use is a setting:

- **Average them out** (the default) — each delivery folds the remaining stock into one blended
  price. Ten at $15 and ten at $20 become twenty at $17.50, and selling never asks anything.
- **Keep each price apart** — the two tens stay separate, and selling asks which of them is
  going over the counter. It stops asking on its own once the older stock sells through.

Either way, every price change is written to the article's own history, and the price the last
delivery was actually charged is kept beside the blended figure so both are visible.

**A sale can be taken back two ways, and they are not the same.** A **void** says the sale should
never have happened: everything returns to stock, the money leaves the cash box, and the sale
disappears from the figures for the day it was rung up on. A **refund** says goods came back
today: the chosen lines return to stock and the money goes out dated today, so today's report
still agrees with today's drawer. Both put units back on the batch they were sold from, so stock
handed back at last month's price is still stock at last month's price.

### Two things worth knowing

**The device never posts a price.** Checkout sends product ids, quantities and the discount the
cashier chose. `checkout_sale` in Postgres recomputes every figure from the catalogue, locks the
product rows in id order, refuses the sale if the shelf cannot cover it, and writes the sale, its
lines and the stock ledger in one transaction. A stale or tampered device cannot put a wrong
number in the books, and two tills cannot sell the same last item.

**Sale lines carry their own copy** of the name, barcode, category, price and cost. Change a price
today and last month's profit stays exactly as it was; delete an article and its history survives.

**Every movement of money leaves an entry.** Sales in, deliveries out, the first stock of a new
article, a miscount corrected on the shelf, a refund, a void. The Budget screen adds them up and
can name every one of them, which is the only reason a balance is worth trusting. Stock found
that was not on the books was paid for by someone, so the balance comes down; stock missing was
never really bought, so it goes back up.

---

## Checking it still works

```bash
npm run test:all
```

- `npm test` — the domain layer: money arithmetic that cannot drift, discount clamping, cart
  merging, date ranges, and the Excel workbook end to end. No mocks; that is the payoff of
  keeping the layer pure.
- `npm run test:db` — runs every migration against a real Postgres (PGlite, compiled to
  WebAssembly, so no Docker needed) and exercises `checkout_sale` and the reporting functions:
  stock deduction, over-sell refusal, discount clamping, duplicate folding, fractional quantities
  for goods sold by weight, and day bucketing in the shop's own time zone. It also covers the
  parts that move money without selling anything: weighted-average and per-batch costing,
  corrections, opening stock, voids and partial refunds, including that a refund pays back
  exactly what the screen quoted for it.

`npm run build` typechecks the whole project.

---

## Commands

| | |
|---|---|
| `npm run dev` | development server |
| `npm run build` | production build, typechecked |
| `npm run test:all` | domain, Excel and database tests |
| `npm run db:push` | apply migrations to the linked Supabase project |
| `npm run db:reset` | rebuild a local Supabase database from scratch (needs Docker) |
| `npm run android:apk` | build the web app and produce a debug APK |
| `npm run android:apk -- --release` | the same, as a release build |
| `npm run android:open` | open the Android project in Android Studio |
| `npm run setup` | point the app at your Supabase project and verify it works |
| `node scripts/build-schema.mjs` | rebuild `supabase/schema.sql` from the migrations |

---

## When something is not right

**Everything I entered has disappeared.** The app is in demo mode. Look for the amber strip at
the top. Follow *Going live* above.

**Export does nothing.** Fixed. If it still happens, the toast now names the file it wrote;
look in the phone's Documents folder. A silent failure means an old APK, so rebuild.

**The app freezes on a black or see-through screen.** That was the barcode scanner: it makes
the page transparent so the camera shows behind it, and if the scan failed to stop the page
stayed that way. It now always restores itself, including when the app is backgrounded
mid-scan. Rebuild the APK to pick that up.

**Getting the actual error.** Plug the phone in with USB debugging on:

```bash
adb logcat -c && adb logcat | grep -iE "badawi|chromium|AndroidRuntime"
```

Reproduce the problem and send what appears. `AndroidRuntime` lines are real crashes;
`chromium` lines are errors inside the app.
