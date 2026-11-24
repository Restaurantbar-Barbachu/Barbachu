const FORMULA_PREFIX_RE = /^[\s\u00A0]*[=+\-@\t\r]/;

export function sanitizeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const safe = FORMULA_PREFIX_RE.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function buildCsvContent(
  headers: string[],
  rows: ReadonlyArray<ReadonlyArray<unknown>>
): string {
  const lines = [
    headers.map((h) => sanitizeCsvCell(h)).join(','),
    ...rows.map((row) => row.map((cell) => sanitizeCsvCell(cell)).join(',')),
  ];
  return '\uFEFF' + lines.join('\r\n');
}

export function downloadCsvFile(
  filename: string,
  headers: string[],
  rows: ReadonlyArray<ReadonlyArray<unknown>>
): void {
  const csvContent = buildCsvContent(headers, rows);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
