import { describe, it, expect } from 'vitest';
import { signalToSetup, confidenceBucket } from './wyckoff';

// Signals and wyckoffSetups describe the same idea with different field names.
// This mapping is what lets the feedback loop measure the scanner against
// ground truth — drop a field here and precision-by-confidence goes blind.

const signal = (over = {}) => ({
  id: 'sig1', pair: 'BTCUSDT', direction: 'long', timeframe: '1h',
  entryPrice: 60000, stopLoss: 59000, tps: [62000, 64000],
  createdAt: '2026-08-01T10:00:00.000Z', confidence: 82, source: 'scanner',
  notes: 'spring', ...over,
});

describe('signalToSetup', () => {
  it('renames each field to its setup counterpart', () => {
    const s = signalToSetup(signal(), 'valid');
    expect(s.entry).toBe(60000);
    expect(s.stop).toBe(59000);
    expect(s.target).toBe(62000);          // first TP only
    expect(s.at).toBe('2026-08-01T10:00:00.000Z');
    expect(s.label).toBe('valid');
  });

  it('keeps the back-reference and the confidence the feedback loop needs', () => {
    const s = signalToSetup(signal(), 'invalid');
    expect(s.signalId).toBe('sig1');       // back-ref + idempotency key
    expect(s.confidence).toBe(82);         // enables precision-by-confidence
  });

  it('treats any source that is not the scanner as manual', () => {
    expect(signalToSetup(signal({ source: 'scanner' }), 'valid').source).toBe('scanner');
    expect(signalToSetup(signal({ source: 'manual' }), 'valid').source).toBe('manual');
    expect(signalToSetup(signal({ source: undefined }), 'valid').source).toBe('manual');
  });

  it('nulls a missing price rather than leaving it undefined for Firestore', () => {
    const s = signalToSetup(signal({ entryPrice: undefined, stopLoss: undefined, tps: [] }), 'valid');
    expect(s.entry).toBe(null);
    expect(s.stop).toBe(null);
    expect(s.target).toBe(null);
  });

  it('survives a malformed tps field', () => {
    expect(signalToSetup(signal({ tps: null }), 'valid').target).toBe(null);
    expect(signalToSetup(signal({ tps: 'nope' }), 'valid').target).toBe(null);
  });

  it('defaults the timeframe and empties missing notes', () => {
    const s = signalToSetup(signal({ timeframe: undefined, notes: undefined }), 'valid');
    expect(s.timeframe).toBe('30m');
    expect(s.notes).toBe('');
  });

  it('does not stamp createdAt — the hook owns that', () => {
    expect('createdAt' in signalToSetup(signal(), 'valid')).toBe(false);
  });
});

describe('confidenceBucket', () => {
  it('splits the scanner range into the three reported bands', () => {
    expect(confidenceBucket(95)).toBe('90–95');
    expect(confidenceBucket(90)).toBe('90–95');
    expect(confidenceBucket(89)).toBe('75–89');
    expect(confidenceBucket(75)).toBe('75–89');
    expect(confidenceBucket(74)).toBe('60–74');
    expect(confidenceBucket(0)).toBe('60–74');
  });
  it('accepts a numeric string but rejects anything unparseable', () => {
    expect(confidenceBucket('91')).toBe('90–95');
    expect(confidenceBucket('high')).toBe(null);
  });

  it('an UNSCORED setup gets no bucket at all', () => {
    // Number(null) is 0, which is finite, so a manual setup — signalToSetup
    // writes confidence: null for one — used to be counted in the lowest band
    // and skew precision-by-confidence with rows the scanner never scored.
    expect(confidenceBucket(null)).toBe(null);
    expect(confidenceBucket(undefined)).toBe(null);
    expect(confidenceBucket('')).toBe(null);
    // A real zero is still a score.
    expect(confidenceBucket(0)).toBe('60–74');
  });
});
