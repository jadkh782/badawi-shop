import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The Android wrapper.
 *
 * `webDir` is the static export, copied into the APK, so the app opens instantly and with no
 * website behind it. Supabase is still reached over the network, but the shell itself is
 * local, which is why the till comes up on a bad connection.
 */
const config: CapacitorConfig = {
  appId: 'shop.badawi.till',
  appName: 'Badawi Shop',
  webDir: 'out',
  android: {
    // The shop is a dark app; a white flash on every launch is the first thing anyone notices.
    backgroundColor: '#14110f',
  },
  plugins: {
    // Matches the theme colour so the status bar does not sit in a pale strip above the app.
    StatusBar: { style: 'DARK', backgroundColor: '#14110f' },
  },
};

export default config;
