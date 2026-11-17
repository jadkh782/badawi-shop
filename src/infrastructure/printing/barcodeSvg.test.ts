import { describe, expect, it } from 'vitest';
import { Barcode } from '@/domain';
import { code39Svg, ean13Svg } from './barcodeSvg';

describe('the EAN-13 check digit', () => {
  it('agrees with real barcodes', () => {
    // 5901234123457 is the code the rest of the suite already uses as a known-good EAN-13.
    expect(Barcode.ean13CheckDigit('590123412345')).toBe('7');
    expect(Barcode.ean13CheckDigit('400638133393')).toBe('1');
    expect(Barcode.ean13CheckDigit('978020137962')).toBe('4');
  });

  it('accepts a code whose last digit agrees with the rest', () => {
    expect(Barcode.isValidEan13('5901234123457')).toBe(true);
  });

  it('rejects one digit being wrong, which is the whole point of it', () => {
    expect(Barcode.isValidEan13('5901234123458')).toBe(false);
    expect(Barcode.isValidEan13('5901234123447')).toBe(false);
  });

  it('rejects anything that is not thirteen digits', () => {
    expect(Barcode.isValidEan13('')).toBe(false);
    expect(Barcode.isValidEan13('59012341234')).toBe(false);
    expect(Barcode.isValidEan13('590123412345X')).toBe(false);
  });

  it('refuses to compute one from the wrong number of digits', () => {
    expect(() => Barcode.ean13CheckDigit('123')).toThrow();
  });
});

describe('generating a barcode for an article that has none', () => {
  it('produces a valid EAN-13 every time', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = Barcode.generateInStore();
      expect(Barcode.isValidEan13(code.value)).toBe(true);
    }
  });

  it('starts 20, the prefix reserved for a shop own use', () => {
    // Anything else risks colliding with a real manufacturer's code, which would make two
    // different articles scan as one.
    for (let i = 0; i < 50; i += 1) {
      expect(Barcode.generateInStore().value.startsWith('20')).toBe(true);
    }
  });

  it('knows its own codes apart from a supplier one', () => {
    expect(Barcode.generateInStore().isInStore).toBe(true);
    expect(Barcode.create('5901234123457').isInStore).toBe(false);
  });

  it('does not keep handing out the same one', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i += 1) seen.add(Barcode.generateInStore().value);
    // Ten random digits; a repeat inside a hundred draws would mean the source is not random.
    expect(seen.size).toBe(100);
  });
});

describe('drawing an EAN-13', () => {
  it('draws the 95 modules the symbology is made of', () => {
    // 95 modules plus the quiet zone either side, at 2 user units each.
    const svg = ean13Svg('5901234123457');
    expect(svg).toContain('viewBox="0 0 226 74"');
  });

  it('prints the digits under the bars, split the way a shop barcode is', () => {
    const svg = ean13Svg('5901234123457');
    expect(svg).toContain('>5<');
    expect(svg).toContain('>901234<');
    expect(svg).toContain('>123457<');
  });

  it('can be drawn without its digits', () => {
    const svg = ean13Svg('5901234123457', { showText: false });
    expect(svg).not.toContain('<text');
  });

  it('refuses anything that is not thirteen digits', () => {
    expect(() => ean13Svg('123')).toThrow(/thirteen digits/);
    expect(() => ean13Svg('ABCDEFGHIJKLM')).toThrow();
  });

  it('draws different bars for different codes', () => {
    expect(ean13Svg('5901234123457')).not.toBe(ean13Svg('4006381333931'));
  });
});

describe('drawing a Code 39', () => {
  it('carries a sale number', () => {
    const svg = code39Svg('A1B2C3D4');
    expect(svg).toContain('<svg');
    expect(svg).toContain('>A1B2C3D4<');
  });

  it('upper-cases, since Code 39 has no lower case', () => {
    expect(code39Svg('a1b2c3d4')).toBe(code39Svg('A1B2C3D4'));
  });

  it('refuses a character it cannot carry rather than dropping it', () => {
    // A dropped character still scans, as the wrong sale.
    expect(() => code39Svg('A1!B2')).toThrow(/cannot carry/);
    expect(() => code39Svg('')).toThrow();
  });

  it('refuses the delimiter as data', () => {
    expect(() => code39Svg('A*B')).toThrow();
  });

  it('grows with the length of what it carries', () => {
    const short = code39Svg('AB');
    const long = code39Svg('ABCDEFGH');
    const widthOf = (svg: string) => Number(/viewBox="0 0 (\d+)/.exec(svg)?.[1]);
    expect(widthOf(long)).toBeGreaterThan(widthOf(short));
  });
});
