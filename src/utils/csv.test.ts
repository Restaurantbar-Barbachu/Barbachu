import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCsvContent, sanitizeCsvCell } from './csv';

describe('sanitizeCsvCell', () => {
  it('neutralizes leading formula triggers (=, +, -, @, tab, cr)', () => {
    assert.equal(sanitizeCsvCell('=CMD("calc")'), '"\'=CMD(""calc"")"');
    assert.equal(sanitizeCsvCell('+1+2'), '"\'+1+2"');
    assert.equal(sanitizeCsvCell('-100'), '"\'-100"');
    assert.equal(sanitizeCsvCell('@SUM(A1:A2)'), '"\'@SUM(A1:A2)"');
    assert.equal(sanitizeCsvCell('\t=2+2'), '"\'\t=2+2"');
    assert.equal(sanitizeCsvCell('\r=2+2'), '"\'\r=2+2"');
    assert.equal(sanitizeCsvCell('  =HYPERLINK("http://x")'), '"\'  =HYPERLINK(""http://x"")"');
  });

  it('keeps normal text and numeric cells intact and escapes double quotes', () => {
    assert.equal(sanitizeCsvCell('Consomé "Especial"'), '"Consomé ""Especial"""');
    assert.equal(sanitizeCsvCell(125.5), '"125.5"');
    assert.equal(sanitizeCsvCell(null), '""');
    assert.equal(sanitizeCsvCell(undefined), '""');
  });
});

describe('buildCsvContent', () => {
  it('prepends UTF-8 BOM and CRLF line breaks with sanitized rows', () => {
    const csv = buildCsvContent(
      ['Producto', 'Nota'],
      [['Orden 1', '=2+2'], ['Taco', 'Sin cebolla']]
    );
    assert.equal(csv.startsWith('\uFEFF'), true);
    const lines = csv.slice(1).split('\r\n');
    assert.deepEqual(lines, [
      '"Producto","Nota"',
      '"Orden 1","\'=2+2"',
      '"Taco","Sin cebolla"',
    ]);
  });
});
