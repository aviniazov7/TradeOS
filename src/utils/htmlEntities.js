// Feed titles and summaries arrive with HTML entities still encoded
// (`Bitcoin&#8217;s`, `S&amp;P`, `&rsquo;`). React renders that text literally,
// so the News screen has to decode it before display. Numeric (decimal and
// hex) and the named entities that show up in RSS are handled. Unknown named
// entities are left as written. Two passes so `&amp;#8217;` becomes the
// character and not the entity text.

const NAMED = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '\u2019',
  lsquo: '\u2018',
  rdquo: '\u201D',
  ldquo: '\u201C',
  sbquo: '\u201A',
  bdquo: '\u201E',
  hellip: '\u2026',
  mdash: '\u2014',
  ndash: '\u2013',
  minus: '\u2212',
  bull: '\u2022',
  middot: '\u00B7',
  laquo: '\u00AB',
  raquo: '\u00BB',
  trade: '\u2122',
  copy: '\u00A9',
  reg: '\u00AE',
  euro: '\u20AC',
  pound: '\u00A3',
  yen: '\u00A5',
  cent: '\u00A2',
  times: '\u00D7',
  divide: '\u00F7',
  shy: '',
};

const ENTITY_RE = /&(#(?:x[0-9a-f]+|\d+)|[a-z][a-z0-9]+);/gi;

function fromCodePoint(cp) {
  // Drop C0/C1 controls (keep tab, LF, CR). A feed must not smuggle them in
  // through a numeric entity.
  if (!Number.isInteger(cp) || cp < 0 || cp > 0x10FFFF) return null;
  if (cp <= 8 || cp === 11 || cp === 12 || (cp >= 14 && cp <= 31) || (cp >= 0x7F && cp <= 0x9F)) return '';
  return String.fromCodePoint(cp);
}

export function decodeHtmlEntities(value) {
  let s = String(value ?? '');
  if (!s.includes('&')) return s;
  for (let pass = 0; pass < 2; pass++) {
    const next = s.replace(ENTITY_RE, (full, body) => {
      if (body[0] === '#') {
        const hex = body[1] === 'x' || body[1] === 'X';
        const cp = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
        const ch = fromCodePoint(cp);
        return ch === null ? full : ch;
      }
      const ch = NAMED[body.toLowerCase()];
      return ch === undefined ? full : ch;
    });
    if (next === s) break;
    s = next;
  }
  return s;
}
