import { Resvg } from '@resvg/resvg-js';
import { writeFileSync } from 'node:fs';

// Professional TradeOS app icon: dark rounded-square (iOS app style) with an
// upward area chart + candlesticks in the brand orange. Content stays inside
// the maskable safe zone (central ~80%).
// App icon = the exact TradeOS splash logo (LoadingSpinner.jsx): the cyan
// (#38bdf8) line chart with grid, area fill and a glowing tip dot, centered
// on a premium dark rounded-square app background. Same path coordinates as
// the splash so the icon and loading screen match 1:1.
const svg = `
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#15171f"/>
      <stop offset="0.6" stop-color="#0c0d12"/>
      <stop offset="1" stop-color="#08080c"/>
    </linearGradient>
    <linearGradient id="splashGradient" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.30"/>
      <stop offset="100%" stop-color="#38bdf8" stop-opacity="0"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.72" cy="0.30" r="0.85">
      <stop offset="0" stop-color="#38bdf8" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#38bdf8" stop-opacity="0"/>
    </radialGradient>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>

  <rect width="512" height="512" rx="114" fill="url(#bg)"/>
  <rect width="512" height="512" rx="114" fill="url(#glow)"/>
  <rect x="2.5" y="2.5" width="507" height="507" rx="111.5" fill="none" stroke="#38bdf8" stroke-opacity="0.20" stroke-width="3"/>

  <!-- Identical to the splash chart (viewBox 140x90), scaled x2.7 and centered -->
  <g transform="translate(82 154) scale(2.7)">
    <line x1="10" y1="20" x2="130" y2="20" stroke="#2a3142" stroke-width="0.6"/>
    <line x1="10" y1="40" x2="130" y2="40" stroke="#2a3142" stroke-width="0.6"/>
    <line x1="10" y1="60" x2="130" y2="60" stroke="#2a3142" stroke-width="0.6"/>

    <path d="M 10 70 L 25 58 L 40 63 L 55 42 L 70 48 L 85 28 L 100 32 L 115 12 L 130 8 L 130 80 L 10 80 Z"
          fill="url(#splashGradient)"/>

    <path d="M 10 70 L 25 58 L 40 63 L 55 42 L 70 48 L 85 28 L 100 32 L 115 12 L 130 8"
          stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"
          stroke-linejoin="round" fill="none" filter="url(#soft)"/>

    <circle cx="130" cy="8" r="8" fill="none" stroke="#38bdf8" stroke-width="1.5" opacity="0.5"/>
    <circle cx="130" cy="8" r="4" fill="#38bdf8"/>
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
