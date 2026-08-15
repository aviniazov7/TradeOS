// CSV export with proper RFC-4180 escaping — a field containing a comma,
// quote or newline must be quoted and its quotes doubled, otherwise the file
// silently shifts columns (a real risk with free-text notes / market titles).
function escapeCell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const BOM = '\uFEFF'; // so Excel renders Hebrew instead of mojibake

/**
 * Build a CSV string (BOM-prefixed).
 * @param {string[]} headers
 * @param {Array<Array<*>>} rows
 */
export function toCsv(headers, rows) {
  const lines = [headers.map(escapeCell).join(',')];
  for (const r of rows) lines.push(r.map(escapeCell).join(','));
  return BOM + lines.join('\n');
}

/** Trigger a browser download of the given rows as a .csv file. */
export function downloadCsv(filename, headers, rows) {
  const blob = new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** `prefix_YYYY-MM-DD.csv` */
export function stampedName(prefix) {
  return `${prefix}_${new Date().toISOString().slice(0, 10)}.csv`;
}
