import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';

// Professional TradeOS app icon: dark rounded-square (iOS app style) with an
// upward area chart + candlesticks in the brand orange. Content stays inside
// the maskable safe zone (central ~80%).
// Clean, professional ascending candlestick chart (the universal symbol of
// crypto/futures trading) on a premium dark rounded-square app background.
// Brand cyan accents the final breakout candle; realistic green/red bodies
// with wicks. Content stays inside the maskable safe zone.
const svg = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1b2231"/>
      <stop offset="0.55" stop-color="#0e1018"/>
      <stop offset="1" stop-color="#08080c"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.74" cy="0.28" r="0.8">
      <stop offset="0" stop-color="#00bfff" stop-opacity="0.26"/>
      <stop offset="1" stop-color="#00bfff" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect width="512" height="512" rx="114" fill="url(#bg)"/>
  <rect width="512" height="512" rx="114" fill="url(#glow)"/>
  <rect x="2.5" y="2.5" width="507" height="507" rx="111.5" fill="none" stroke="#00bfff" stroke-opacity="0.20" stroke-width="3"/>

  <!-- faint baseline -->
  <line x1="104" y1="412" x2="408" y2="412" stroke="#ffffff" stroke-opacity="0.06" stroke-width="4" stroke-linecap="round"/>

  <!-- ascending candlesticks: green uptrend with one red pullback,
       final breakout candle in brand cyan -->
  <g stroke-linecap="round">
    <!-- 1: green -->
    <line x1="138" y1="300" x2="138" y2="392" stroke="#22c55e" stroke-width="6"/>
    <rect x="121" y="320" width="34" height="56" rx="6" fill="#22c55e"/>
    <!-- 2: red pullback -->
    <line x1="206" y1="252" x2="206" y2="350" stroke="#ef4444" stroke-width="6"/>
    <rect x="189" y="274" width="34" height="58" rx="6" fill="#ef4444"/>
    <!-- 3: green -->
    <line x1="274" y1="210" x2="274" y2="312" stroke="#22c55e" stroke-width="6"/>
    <rect x="257" y="232" width="34" height="62" rx="6" fill="#22c55e"/>
    <!-- 4: green -->
    <line x1="342" y1="170" x2="342" y2="270" stroke="#22c55e" stroke-width="6"/>
    <rect x="325" y="190" width="34" height="60" rx="6" fill="#22c55e"/>
    <!-- 5: cyan breakout -->
    <line x1="402" y1="120" x2="402" y2="226" stroke="#00bfff" stroke-width="6" filter="url(#soft)"/>
    <rect x="385" y="140" width="34" height="64" rx="6" fill="#00bfff" filter="url(#soft)"/>
  </g>
</svg>`;

const targets = [
  { file: 'public/icon-512.png', size: 512 },
  { file: 'public/icon-192.png', size: 192 },
  { file: 'public/apple-touch-icon.png', size: 180 },
  { file: 'public/favicon.png', size: 64 },
];

for (const { file, size } of targets) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } })
    .render()
    .asPng();
  writeFileSync(file, png);
  console.log(`wrote ${file} (${size}px, ${png.length} bytes)`);
}
