import { createPortal } from 'react-dom';
import { ASSET_CLASS_LABELS, ASSET_CLASS_ORDER, MONTH_LABELS, TAX_RATE } from '../../utils/taxReport';
import { formatIls, formatUsd, formatRate, formatDay, DIRECTION_LABELS } from './taxFormat';

// The print/PDF version of the report: a plain black-on-white document the
// user saves as PDF from the browser's print dialog and hands to an
// accountant. Rendered straight into <body> (portal) so the print stylesheet
// can hide the whole app with one rule and print only this.
const PRINT_CSS = `
#tax-print-root { display: none; }
@media print {
  @page { size: A4; margin: 12mm; }
  html, body { background: #fff !important; min-height: 0 !important; }
  body > *:not(#tax-print-root) { display: none !important; }
  #tax-print-root {
    display: block; direction: rtl; color: #111; background: #fff;
    font: 10.5pt/1.45 system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  #tax-print-root h1 { font-size: 17pt; margin: 0 0 2pt; }
  #tax-print-root h2 { font-size: 12pt; margin: 14pt 0 5pt; break-after: avoid; }
  #tax-print-root .tp-meta { color: #444; font-size: 9.5pt; }
  #tax-print-root .tp-disclaimer { border: 1px solid #b45309; background: #fff7ed; color: #7c2d12; padding: 6pt 8pt; margin: 8pt 0; border-radius: 4pt; font-weight: 600; }
  #tax-print-root table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
  #tax-print-root th, #tax-print-root td { border: 1px solid #ccc; padding: 3pt 5pt; text-align: right; }
  #tax-print-root th { background: #f1f5f9; font-weight: 700; }
  #tax-print-root tr { break-inside: avoid; }
  #tax-print-root thead { display: table-header-group; }
  #tax-print-root .num { direction: ltr; unicode-bidi: plaintext; font-variant-numeric: tabular-nums; white-space: nowrap; }
  #tax-print-root .pos { color: #15803d; }
  #tax-print-root .neg { color: #b91c1c; }
  #tax-print-root .tp-summary td:first-child { width: 45%; }
  #tax-print-root .tp-total td { font-weight: 700; background: #f8fafc; }
  #tax-print-root .tp-notes { font-size: 9pt; color: #333; margin: 4pt 0 0; padding-inline-start: 14pt; }
}
`;

const tone = (v) => (v > 0 ? 'num pos' : v < 0 ? 'num neg' : 'num');

export default function TaxPrintView({ report, journalLabel, sourceLabel }) {
  if (typeof document === 'undefined') return null;
  const t = report.totals;
  const generated = new Date().toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const summary = [
    ['סה״כ רווחים', formatIls(t.gainsIls), t.gainsIls],
    ['סה״כ הפסדים', formatIls(t.lossesIls), t.lossesIls],
    ['הפסדים שקוזזו מול רווחים', formatIls(t.lossesOffsetIls, { signed: false }), 0],
    ['רווח/הפסד הון נטו (₪)', formatIls(t.netIls), t.netIls],
    ['רווח/הפסד נטו ($)', formatUsd(t.netUsd), t.netUsd],
    [`מס משוער (${TAX_RATE * 100}% על רווח נטו חיובי)`, formatIls(t.estimatedTaxIls, { signed: false }), 0],
    ...(t.carryForwardLossIls > 0 ? [['הפסד להעברה לשנים הבאות', formatIls(t.carryForwardLossIls, { signed: false }), 0]] : []),
    ['סה״כ עמלות', formatIls(t.feesIls, { signed: false }), 0],
    ['מספר עסקאות', String(t.tradeCount), 0],
  ];

  return createPortal(
    <div id="tax-print-root" aria-hidden="true">
      <style>{PRINT_CSS}</style>
      <h1>דוח רווחי הון — שנת {report.year}</h1>
      <div className="tp-meta">
        TradeOS · הופק ב-{generated} · יומנים: {journalLabel} · שערי המרה: {sourceLabel}
      </div>
      <div className="tp-disclaimer">הדוח הוא כלי עזר בלבד ואינו ייעוץ מס. יש לבדוק מול רואה חשבון.</div>

      <h2>סיכום</h2>
      <table className="tp-summary">
        <tbody>
          {summary.map(([label, value, v]) => (
            <tr key={label}><td>{label}</td><td className={tone(v)}>{value}</td></tr>
          ))}
        </tbody>
      </table>

      <h2>לפי סוג נכס</h2>
      <table>
        <thead><tr><th>סוג נכס</th><th>עסקאות</th><th>רווחים</th><th>הפסדים</th><th>נטו ₪</th></tr></thead>
        <tbody>
          {ASSET_CLASS_ORDER.filter((c) => report.byAsset[c].count > 0).map((c) => {
            const a = report.byAsset[c];
            return (
              <tr key={c}>
                <td>{ASSET_CLASS_LABELS[c]}</td>
                <td className="num">{a.count}</td>
                <td className={tone(a.gains)}>{formatIls(a.gains)}</td>
                <td className={tone(a.losses)}>{formatIls(a.losses)}</td>
                <td className={tone(a.net)}>{formatIls(a.net)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h2>פירוט חודשי</h2>
      <table>
        <thead><tr><th>חודש</th><th>עסקאות</th><th>רווחים</th><th>הפסדים</th><th>נטו ₪</th></tr></thead>
        <tbody>
          {report.months.map((m) => (
            <tr key={m.month}>
              <td>{MONTH_LABELS[m.month - 1]}</td>
              <td className="num">{m.count}</td>
              <td className={tone(m.gains)}>{formatIls(m.gains)}</td>
              <td className={tone(m.losses)}>{formatIls(m.losses)}</td>
              <td className={tone(m.net)}>{formatIls(m.net)}</td>
            </tr>
          ))}
          <tr className="tp-total">
            <td>סה״כ</td>
            <td className="num">{t.tradeCount}</td>
            <td className={tone(t.gainsIls)}>{formatIls(t.gainsIls)}</td>
            <td className={tone(t.lossesIls)}>{formatIls(t.lossesIls)}</td>
            <td className={tone(t.netIls)}>{formatIls(t.netIls)}</td>
          </tr>
        </tbody>
      </table>

      <h2>פירוט עסקאות</h2>
      <table>
        <thead>
          <tr><th>תאריך סגירה</th><th>נכס</th><th>כיוון</th><th>רווח/הפסד $</th><th>שער</th><th>רווח/הפסד ₪</th><th>עמלות ₪</th></tr>
        </thead>
        <tbody>
          {report.rows.map((r) => (
            <tr key={r.id}>
              <td className="num">{formatDay(r.day)}</td>
              <td>{r.symbol}</td>
              <td>{DIRECTION_LABELS[r.direction] || '—'}</td>
              <td className={tone(r.currency === 'USD' ? r.pnl : 0)}>{r.currency === 'USD' ? formatUsd(r.pnl) : '— (₪)'}</td>
              <td className="num">{r.currency === 'USD' ? `${formatRate(r.rate)}${r.fallback ? '*' : ''}` : '—'}</td>
              <td className={tone(r.pnlIls)}>{r.missingRate ? 'חסר שער' : formatIls(r.pnlIls)}</td>
              <td className="num">{formatIls(r.feesIls, { signed: false })}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <ul className="tp-notes">
        <li>המרה לפי השער היציג של בנק ישראל ביום הסגירה (או יום העסקים הקודם הקרוב). עסקאות בבורסת ת״א (.TA) מדווחות בשקלים ללא המרה.</li>
        <li>החישוב מבוסס על רווח/הפסד נטו (אחרי עמלות) כפי שנרשם ביומן; אינו כולל התאמות אינפלציה, דיבידנדים או הוצאות מוכרות.</li>
        {report.fallbackDays.length > 0 && (
          <li>* שער חלופי (Yahoo, לא שער יציג) שימש בימים: {report.fallbackDays.map(formatDay).join(', ')}.</li>
        )}
        {report.missingRate.length > 0 && (
          <li>{report.missingRate.length} עסקאות ללא שער המרה לא נכללו בסיכום.</li>
        )}
        {report.partial.count > 0 && (
          <li>{report.partial.count} עסקאות פתוחות עם סגירה חלקית לא נכללו — הן ייכללו בשנה שבה ייסגרו.</li>
        )}
      </ul>
    </div>,
    document.body,
  );
}
