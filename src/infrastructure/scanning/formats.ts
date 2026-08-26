/**
 * The symbologies worth looking for on a shop shelf.
 *
 * Restricting the list matters: asking a decoder to consider every format it knows makes it
 * measurably slower per frame and invites misreads, and none of the omitted ones appear on
 * retail packaging.
 */
export const RETAIL_FORMATS = [
  'EAN-13',
  'EAN-8',
  'UPC-A',
  'UPC-E',
  'Code128',
  'Code39',
  'ITF',
  'QRCode',
  'DataMatrix',
] as const;

/** The same list in the casing the browser BarcodeDetector expects. */
export const NATIVE_FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'itf',
  'qr_code',
  'data_matrix',
];
