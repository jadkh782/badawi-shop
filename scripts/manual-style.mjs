/**
 * The manual is printed, so it is designed for paper: warm off-white rather than white, ink
 * that survives a cheap printer, and the amber the app uses kept for the things that matter.
 * The dark screenshots carry the app's own identity, so the page around them stays quiet.
 */
export const css = `
@page { size: A4; margin: 16mm 14mm 18mm; }

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: 'Instrument Sans', system-ui, sans-serif;
  color: #241d18;
  background: #fbf8f3;
  font-size: 10.5pt;
  line-height: 1.55;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

h1, h2, h3, .num, .tnum {
  font-family: 'Archivo', system-ui, sans-serif;
}

/* --- cover ------------------------------------------------------------ */
.cover {
  height: 245mm;
  display: flex;
  flex-direction: column;
  justify-content: center;
  page-break-after: always;
}
.cover .mark { display: flex; gap: 5px; margin-bottom: 18mm; }
.cover .mark i { display: block; background: #b9820d; height: 34mm; border-radius: 1px; }
.cover h1 { font-size: 40pt; line-height: 1.02; margin: 0; letter-spacing: -0.025em; }
.cover .sub { font-size: 15pt; color: #7c6a5d; margin-top: 5mm; }
.cover .rule { height: 3px; width: 46mm; background: #b9820d; margin: 10mm 0; }
.cover .meta { font-size: 9.5pt; color: #8b7a6c; }

/* --- contents --------------------------------------------------------- */
.toc { page-break-after: always; }
.toc h2 { font-size: 20pt; margin: 0 0 8mm; }
.toc ol { list-style: none; padding: 0; margin: 0; counter-reset: s; }
.toc li {
  counter-increment: s;
  display: flex;
  align-items: baseline;
  gap: 4mm;
  padding: 3.2mm 0;
  border-bottom: 1px solid #e6ddd0;
}
.toc li::before {
  content: counter(s, decimal-leading-zero);
  font-family: 'Archivo', sans-serif;
  font-weight: 700;
  color: #b9820d;
  font-size: 10pt;
  min-width: 9mm;
}
.toc .t { font-weight: 600; font-size: 12pt; flex: 1; min-width: 0; }
.toc .d { color: #8b7a6c; font-size: 9.5pt; max-width: 82mm; text-align: right; }

/* --- section opener --------------------------------------------------- */
.section { page-break-before: always; }
.section-head { border-bottom: 3px solid #241d18; padding-bottom: 5mm; margin-bottom: 8mm; }
.section-head .eyebrow {
  font-size: 8pt;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #b9820d;
  font-weight: 700;
}
.section-head h2 { font-size: 24pt; margin: 2mm 0 3mm; letter-spacing: -0.02em; }
.section-head p { margin: 0; color: #6d5c4f; max-width: 145mm; }

/* --- one screen ------------------------------------------------------- */
.screen {
  display: grid;
  grid-template-columns: 53mm 1fr;
  gap: 8mm;
  page-break-inside: avoid;
  margin-bottom: 8mm;
}
.screen img {
  width: 100%;
  border-radius: 5mm;
  border: 1px solid #ddd2c2;
  display: block;
}
.screen.wide { grid-template-columns: 1fr; }
.screen.wide img { border-radius: 3mm; }

.screen h3 { font-size: 14pt; margin: 0 0 3mm; letter-spacing: -0.01em; }
.screen ol { margin: 0; padding-left: 0; list-style: none; counter-reset: n; }
.screen ol li {
  counter-increment: n;
  position: relative;
  padding-left: 8mm;
  margin-bottom: 2.6mm;
}
.screen ol li::before {
  content: counter(n);
  position: absolute;
  left: 0;
  top: 0.2mm;
  width: 5mm;
  height: 5mm;
  background: #241d18;
  color: #fbf8f3;
  border-radius: 50%;
  font-family: 'Archivo', sans-serif;
  font-size: 7.5pt;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
.screen .note {
  margin-top: 4mm;
  padding: 3mm 4mm;
  background: #f5ead4;
  border-left: 3px solid #b9820d;
  font-size: 9.5pt;
  color: #5c4a33;
  border-radius: 0 2mm 2mm 0;
}
.screen b { font-weight: 700; color: #241d18; }

/* --- closing ---------------------------------------------------------- */
.trouble { page-break-before: always; }
.trouble h2 { font-size: 24pt; margin: 0 0 6mm; letter-spacing: -0.02em; }
.trouble dl { margin: 0; }
.trouble dt {
  font-weight: 700;
  font-size: 11.5pt;
  margin-top: 6mm;
  font-family: 'Archivo', sans-serif;
}
.trouble dd { margin: 1.5mm 0 0; color: #5c4a33; }
`;
