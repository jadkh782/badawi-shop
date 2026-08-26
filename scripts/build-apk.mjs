/**
 * Builds the Android APK.
 *
 * Gradle needs a modern JDK, and the one on PATH is often an old system Java that fails with
 * an unhelpful class-version error. Android Studio ships a suitable JDK, so this finds it and
 * points Gradle at it rather than making anyone set JAVA_HOME by hand.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const HOME = process.env.USERPROFILE || process.env.HOME || '';
const LOCAL = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');

function findJdk() {
  if (process.env.CAPACITOR_JAVA_HOME) return process.env.CAPACITOR_JAVA_HOME;

  const candidates = [
    // Forward slashes throughout: Node accepts them on Windows and they survive every shell.
    ...['C:/Program Files/Android', 'C:/Program Files/JetBrains'].flatMap((base) => {
      if (!existsSync(base)) return [];
      return readdirSync(base).map((entry) => path.join(base, entry, 'jbr'));
    }),
    path.join(LOCAL, 'Programs', 'Android Studio', 'jbr'),
    process.env.JAVA_HOME ?? '',
  ];

  for (const candidate of candidates) {
    if (candidate && existsSync(path.join(candidate, 'bin', 'java.exe'))) {
      // A JDK without jvm.cfg is a broken install, and Gradle's error for it is inscrutable.
      if (existsSync(path.join(candidate, 'lib', 'jvm.cfg'))) return candidate;
    }
  }
  return null;
}

function findSdk() {
  for (const candidate of [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    path.join(LOCAL, 'Android', 'Sdk'),
  ]) {
    if (candidate && existsSync(path.join(candidate, 'platform-tools'))) return candidate;
  }
  return null;
}

const jdk = findJdk();
if (!jdk) {
  console.error(
    '\nNo usable JDK found.\n\n' +
      'Gradle needs JDK 17 or newer. Android Studio ships one; install Studio, or set\n' +
      'CAPACITOR_JAVA_HOME to a JDK 17+ directory and run this again.\n',
  );
  process.exit(1);
}

const sdk = findSdk();
if (!sdk) {
  console.error(
    '\nNo Android SDK found.\n\n' +
      'Open Android Studio once to install it, or set ANDROID_HOME to its location.\n',
  );
  process.exit(1);
}

console.log(`JDK: ${jdk}`);
console.log(`SDK: ${sdk}\n`);

const release = process.argv.includes('--release');
const task = release ? 'assembleRelease' : 'assembleDebug';

// An absolute path, because a bare `gradlew.bat` is not on PATH and Windows will not look
// in the working directory for it.
const wrapper = path.resolve('android', process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');

// Windows cannot spawn a .bat directly, and `shell: true` would concatenate the arguments
// instead of passing them. Handing cmd.exe one quoted command line keeps the path with its
// space in it intact without that.
const [command, args] =
  process.platform === 'win32'
    ? ['cmd.exe', ['/d', '/s', '/c', `""${wrapper}" ${task} --no-daemon"`]]
    : [wrapper, [task, '--no-daemon']];

const result = spawnSync(command, args, {
  cwd: 'android',
  stdio: 'inherit',
  windowsVerbatimArguments: process.platform === 'win32',
  env: { ...process.env, JAVA_HOME: jdk, ANDROID_HOME: sdk, ANDROID_SDK_ROOT: sdk },
});

if (result.status !== 0) process.exit(result.status ?? 1);

const out = path.join(
  'android', 'app', 'build', 'outputs', 'apk', release ? 'release' : 'debug',
  release ? 'app-release-unsigned.apk' : 'app-debug.apk',
);

if (existsSync(out)) {
  const mb = (statSync(out).size / 1024 / 1024).toFixed(1);
  console.log(`\nAPK ready: ${out}  (${mb} MB)`);
  console.log(
    release
      ? '\nThis one is unsigned. Sign it before installing - see the README.'
      : '\nInstall it with:  adb install -r ' + out,
  );
} else {
  console.log('\nGradle finished but no APK was found at ' + out);
}
