/**
 * Barcodes drawn as SVG, the same way the icons are drawn rather than imported.
 *
 * Two symbologies, because the shop needs two different things scanned:
 *
 *   EAN-13   on an article label. It is what a retail scanner reads without being told
 *            anything, and it carries its own check digit so a damaged print is rejected
 *            rather than misread as a different article.
 *   Code 39  on a receipt, holding the sale number. Sale ids are hex, which sits inside
 *            Code 39's alphabet, and it needs no check digit or fixed length.
 *
 * Rendering is deliberately dumb: it draws the digits it is handed and never decides what
 * they should be. Whether a code is valid is a question about the shop's articles, so it is
 * answered in the domain by Barcode, not here.
 */

/** Narrow element width, in SVG user units. Everything else is a multiple of it. */
const MODULE = 2;

export interface BarcodeOptions {
  /** Bar height in user units. The width follows from the data. */
  height?: number;
  /** Whether to print the digits under the bars, as every retail barcode does. */
  showText?: boolean;
}

// ---------------------------------------------------------------------------
// EAN-13
// ---------------------------------------------------------------------------

/*
  Three alphabets. A digit in the left half is drawn in L or G depending on the parity
  pattern chosen by the first digit, which is how thirteen digits fit into twelve positions:
  the first one is never drawn at all, only implied by the parity of the other six.
*/
const EAN_L = [
  '0001101', '0011001', '0010011', '0111101', '0100011',
  '0110001', '0101111', '0111011', '0110111', '0001011',
];
const EAN_G = [
  '0100111', '0110011', '0011011', '0100001', '0011101',
  '0111001', '0000101', '0010001', '0001001', '0010111',
];
const EAN_R = [
  '1110010', '1100110', '1101100', '1000010', '1011100',
  '1001110', '1010000', '1000100', '1001000', '1110100',
];

/** Which of L or G each of the six left-hand digits uses, chosen by the first digit. */
const EAN_PARITY = [
  'LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG',
  'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL',
];

const QUIET = 9; // modules of blank paper either side, without which a scanner may miss the start

/**
 * An EAN-13 as an SVG string.
 *
 * Throws on anything that is not thirteen digits. A barcode that does not scan is worse
 * than no barcode, because it is discovered at the counter with a customer waiting.
 */
export function ean13Svg(code: string, options: BarcodeOptions = {}): string {
  const digits = code.trim();
  if (!/^\d{13}$/.test(digits)) {
    throw new Error(`An EAN-13 is thirteen digits, got "${code}"`);
  }

  const height = options.height ?? 60;
  const showText = options.showText ?? true;
  const textHeight = showText ? 14 : 0;
  // The guard bars run lower than the digits, which is what leaves room for the numbers to
  // sit between them the way a shop-bought barcode looks.
  const guardDrop = showText ? 8 : 0;

  const parity = EAN_PARITY[Number(digits[0])] as string;
  const bars: Array<{ x: number; width: number; tall: boolean }> = [];

  let x = QUIET;
  const emit = (pattern: string, tall: boolean) => {
    for (const bit of pattern) {
      if (bit === '1') bars.push({ x, width: 1, tall });
      x += 1;
    }
  };

  emit('101', true); // start guard
  for (let i = 0; i < 6; i += 1) {
    const digit = Number(digits[i + 1]);
    emit(parity[i] === 'L' ? (EAN_L[digit] as string) : (EAN_G[digit] as string), false);
  }
  emit('01010', true); // centre guard
  for (let i = 0; i < 6; i += 1) {
    emit(EAN_R[Number(digits[i + 7])] as string, false);
  }
  emit('101', true); // end guard

  const totalModules = x + QUIET;
  const width = totalModules * MODULE;
  const fullHeight = height + textHeight;

  // Runs of adjacent modules are merged into one rect. A thermal printer renders a single
  // wide rect cleanly; a row of abutting 2-unit rects can leave hairline gaps.
  const rects = mergeRuns(bars)
    .map(
      (bar) =>
        `<rect x="${bar.x * MODULE}" y="0" width="${bar.width * MODULE}" height="${
          bar.tall ? height + guardDrop : height
        }"/>`,
    )
    .join('');

  const text = showText
    ? [
        textAt(digits[0] as string, (QUIET - 5) * MODULE, fullHeight, 'start'),
        textAt(digits.slice(1, 7), (QUIET + 3 + 21) * MODULE, fullHeight, 'middle'),
        textAt(digits.slice(7), (QUIET + 3 + 42 + 5 + 21) * MODULE, fullHeight, 'middle'),
      ].join('')
    : '';

  return wrap(width, fullHeight, rects + text);
}

// ---------------------------------------------------------------------------
// Code 39
// ---------------------------------------------------------------------------

/*
  Nine elements per character, alternating bar and space, of which exactly three are wide.
  Only the characters a sale number can contain are listed: digits, letters and the hyphen.
  Anything else throws rather than being silently dropped, because a barcode missing a
  character still scans — as the wrong thing.
*/
const CODE39: Record<string, string> = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn', '9': 'nnwwnnwnn',
  A: 'wnnnnwnnw', B: 'nnwnnwnnw', C: 'wnwnnwnnn', D: 'nnnnwwnnw',
  E: 'wnnnwwnnn', F: 'nnwnwwnnn', G: 'nnnnnwwnw', H: 'wnnnnwwnn',
  I: 'nnwnnwwnn', J: 'nnnnwwwnn', K: 'wnnnnnnww', L: 'nnwnnnnww',
  M: 'wnwnnnnwn', N: 'nnnnwnnww', O: 'wnnnwnnwn', P: 'nnwnwnnwn',
  Q: 'nnnnnnwww', R: 'wnnnnnwwn', S: 'nnwnnnwwn', T: 'nnnnwnwwn',
  U: 'wwnnnnnnw', V: 'nwwnnnnnw', W: 'wwwnnnnnn', X: 'nwnnwnnnw',
  Y: 'wwnnwnnnn', Z: 'nwwnwnnnn', '-': 'nwnnnnwnw',
  '*': 'nwnnwnwnn', // start and stop, never part of the value
};

/**
 * A Code 39 barcode as an SVG string.
 *
 * The value is upper-cased first, since Code 39 has no lower case and a sale id is hex
 * either way.
 */
export function code39Svg(value: string, options: BarcodeOptions = {}): string {
  const text = value.trim().toUpperCase();
  if (text.length === 0) {
    throw new Error('Nothing to encode');
  }
  for (const character of text) {
    if (character === '*' || !CODE39[character]) {
      throw new Error(`Code 39 cannot carry "${character}"`);
    }
  }

  const height = options.height ?? 50;
  const showText = options.showText ?? true;
  const textHeight = showText ? 14 : 0;

  const bars: Array<{ x: number; width: number; tall: boolean }> = [];
  let x = QUIET;

  // Delimited by * at both ends, which is what tells a scanner where the value starts.
  const characters = ['*', ...text, '*'];
  characters.forEach((character, index) => {
    const pattern = CODE39[character] as string;
    for (let i = 0; i < pattern.length; i += 1) {
      const width = pattern[i] === 'w' ? 3 : 1;
      // Even elements are bars, odd ones the spaces between them.
      if (i % 2 === 0) bars.push({ x, width, tall: false });
      x += width;
    }
    if (index < characters.length - 1) x += 1; // the narrow gap between characters
  });

  const width = (x + QUIET) * MODULE;
  const fullHeight = height + textHeight;

  const rects = bars
    .map(
      (bar) =>
        `<rect x="${bar.x * MODULE}" y="0" width="${bar.width * MODULE}" height="${height}"/>`,
    )
    .join('');

  const label = showText ? textAt(text, width / 2, fullHeight, 'middle') : '';
  return wrap(width, fullHeight, rects + label);
}

// ---------------------------------------------------------------------------

/** Adjacent set modules become one rect, so a printer draws solid bars without seams. */
function mergeRuns(
  bars: Array<{ x: number; width: number; tall: boolean }>,
): Array<{ x: number; width: number; tall: boolean }> {
  const merged: Array<{ x: number; width: number; tall: boolean }> = [];
  for (const bar of bars) {
    const last = merged[merged.length - 1];
    if (last && last.tall === bar.tall && last.x + last.width === bar.x) {
      last.width += bar.width;
    } else {
      merged.push({ ...bar });
    }
  }
  return merged;
}

function textAt(value: string, x: number, bottom: number, anchor: string): string {
  return (
    `<text x="${x}" y="${bottom - 2}" text-anchor="${anchor}" ` +
    `font-family="monospace" font-size="12" fill="#000">${value}</text>`
  );
}

function wrap(width: number, height: number, body: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" ` +
    `width="100%" height="${height}" shape-rendering="crispEdges" fill="#000">${body}</svg>`
  );
}
