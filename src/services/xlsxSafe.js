// Minimal .xlsx writer (uncompressed ZIP of OOXML). Cells are numbers or
// inline strings, never formulas, so a note that starts with "=" cannot run
// when the file is opened. Replaces the unmaintained SheetJS parser, which
// this app only used to write workbooks.

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc ^= bytes[i];
    for (let b = 0; b < 8; b++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(n) {
  return Uint8Array.of(n & 255, (n >>> 8) & 255);
}
function u32(n) {
  return Uint8Array.of(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255);
}
function concat(parts) {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function xmlEscape(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function stripUnsafeControls(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    // Keep tab, newline, and CR so a leading one is still neutralized below.
    if (c === 9 || c === 10 || c === 13 || c >= 32) out += ch;
  }
  return out;
}

export function spreadsheetCell(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return { type: 'n', value };
  if (value == null) return { type: 's', value: '' };
  let s = stripUnsafeControls(String(value));
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (Number.isFinite(n)) return { type: 'n', value: n };
  }
  if (FORMULA_PREFIX.test(s)) s = `'${s}`;
  return { type: 's', value: s };
}

function colName(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function sheetTitle(name, index, used) {
  const base = String(name || `Sheet${index + 1}`).replace(/[:\\/?*[\]]/g, ' ').trim().slice(0, 31) || `Sheet${index + 1}`;
  let title = base;
  let n = 2;
  while (used.has(title)) {
    const suffix = ` ${n}`;
    title = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    n += 1;
  }
  used.add(title);
  return title;
}

function worksheetXml(rows) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>',
  ];
  rows.forEach((row, r) => {
    const cells = (row || []).map((value, c) => {
      const cell = spreadsheetCell(value);
      const ref = `${colName(c)}${r + 1}`;
      if (cell.type === 'n') return `<c r="${ref}"><v>${cell.value}</v></c>`;
      if (!cell.value) return '';
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(cell.value)}</t></is></c>`;
    }).filter(Boolean);
    if (cells.length) lines.push(`<row r="${r + 1}">${cells.join('')}</row>`);
  });
  lines.push('</sheetData></worksheet>');
  return lines.join('');
}

function zipStore(files) {
  const encoder = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const data = encoder.encode(file.data);
    const crc = crc32(data);
    const local = concat([
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0),
      name, data,
    ]);
    parts.push(local);
    central.push(concat([
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name,
    ]));
    offset += local.length;
  }
  const centralDir = concat(central);
  const eocd = concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralDir.length), u32(offset), u16(0),
  ]);
  return concat([...parts, centralDir, eocd]);
}

/**
 * @param {{ name: string, rows: Array<Array<string|number|null>> }[]} sheets
 * @returns {Uint8Array}
 */
export function buildXlsx(sheets) {
  const list = (sheets || []).filter((s) => s && Array.isArray(s.rows));
  const used = new Set();
  const files = [];
  const sheetTags = [];
  const rels = [];
  const overrides = [];
  list.forEach((sheet, i) => {
    const id = i + 1;
    const title = sheetTitle(sheet.name, i, used);
    const path = `xl/worksheets/sheet${id}.xml`;
    files.push({ name: path, data: worksheetXml(sheet.rows) });
    sheetTags.push(`<sheet name="${xmlEscape(title)}" sheetId="${id}" r:id="rId${id}"/>`);
    rels.push(`<Relationship Id="rId${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${id}.xml"/>`);
    overrides.push(`<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
  });
  files.push({
    name: '[Content_Types].xml',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${overrides.join('')}
</Types>`,
  });
  files.push({
    name: '_rels/.rels',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  });
  files.push({
    name: 'xl/workbook.xml',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${sheetTags.join('')}</sheets>
</workbook>`,
  });
  files.push({
    name: 'xl/_rels/workbook.xml.rels',
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${rels.join('')}
</Relationships>`,
  });
  return zipStore(files);
}
