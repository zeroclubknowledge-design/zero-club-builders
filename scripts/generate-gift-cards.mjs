import { Resvg } from "@resvg/resvg-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../public/gifts");

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const TEMPLATES = {
  signature: { shell: "#171218", ink: "#ffffff", muted: "#ffffff8c", accent: "#cc208f", accentInk: "#ffffff", name: "Signature" },
  studio:    { shell: "#cc208f", ink: "#ffffff", muted: "#ffffffb3", accent: "#ffffff", accentInk: "#cc208f", name: "Studio" },
  paper:     { shell: "#f4f0e8", ink: "#171218", muted: "#17121880", accent: "#171218", accentInk: "#ffffff", name: "Paper" },
  signal:    { shell: "#184f3c", ink: "#ffffff", muted: "#ffffff99", accent: "#d6ff62", accentInk: "#173328", name: "Signal" },
  cobalt:    { shell: "#2446a8", ink: "#ffffff", muted: "#ffffffa6", accent: "#ffffff", accentInk: "#2446a8", name: "Cobalt" },
  sun:       { shell: "#f2c84b", ink: "#201b12", muted: "#201b128c", accent: "#201b12", accentInk: "#ffffff", name: "Sun" },
};

function generateSvg(t) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <!-- Card Base Background -->
  <rect width="1200" height="630" fill="${t.shell}"/>
  
  <!-- Concentric Border Rings (matching GiftCardVisual.tsx) -->
  <circle cx="1120" cy="-40" r="230" fill="none" stroke="${t.ink}" stroke-width="48" opacity="0.08"/>
  <circle cx="1000" cy="660" r="200" fill="none" stroke="${t.ink}" stroke-width="36" opacity="0.06"/>
  <circle cx="90" cy="690" r="220" fill="${t.accent}" opacity="0.10"/>

  <!-- Top Bar: Logo Mark & Header -->
  <g transform="translate(80, 70)">
    <!-- Star Logo Mark -->
    <path d="M22 0L27 16L44 22L27 28L22 44L17 28L0 22L17 16Z" fill="${t.accent}"/>
    <text x="56" y="32" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="32" font-weight="700" fill="${t.ink}">Zero Club Gift</text>
  </g>

  <!-- Top Right Gift Badge -->
  <g transform="translate(1030, 64)">
    <rect width="90" height="56" rx="16" fill="${t.accent}"/>
    <!-- Gift Icon -->
    <path d="M30 18H60V30H30V18ZM25 30H65V46C65 47.1 64.1 48 63 48H27C25.9 48 25 47.1 25 46V30ZM45 18V48M45 18C45 15.2 42.8 13 40 13C37.2 13 35 15.2 35 18C35 18 39 18 45 18ZM45 18C45 15.2 47.2 13 50 13C52.8 13 55 15.2 55 18C55 18 51 18 45 18Z" stroke="${t.accentInk}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </g>

  <!-- Main Card Body -->
  <text x="80" y="295" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="28" font-weight="700" letter-spacing="4" fill="${t.muted}">ZERO CLUB GIFT CARD</text>
  <text x="80" y="425" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="108" font-weight="800" fill="${t.ink}" letter-spacing="-2">Zero Club Gift</text>
  <text x="80" y="490" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="28" font-weight="500" fill="${t.muted}">Open to claim your Zero Club credit</text>

  <!-- Divider & Bottom Bar -->
  <line x1="80" y1="535" x2="1120" y2="535" stroke="${t.muted}" stroke-opacity="0.25" stroke-width="1.5"/>
  <text x="80" y="580" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="22" font-weight="600" letter-spacing="2" fill="${t.muted}">ZERO CLUB WALLET CREDIT</text>
  <text x="1120" y="580" text-anchor="end" font-family="Consolas, Monaco, monospace" font-size="24" font-weight="600" fill="${t.muted}">zeroclubs.xyz</text>
</svg>`;
}

for (const [key, template] of Object.entries(TEMPLATES)) {
  const svg = generateSvg(template);
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 1200 },
  });
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();
  const outPath = path.join(outDir, `card-${key}.png`);
  fs.writeFileSync(outPath, pngBuffer);
  console.log(`Generated ${outPath}`);
}

// Generate default card
const defaultSvg = generateSvg(TEMPLATES.signature);
const defaultResvg = new Resvg(defaultSvg, { fitTo: { mode: "width", value: 1200 } });
fs.writeFileSync(path.join(outDir, `card-default.png`), defaultResvg.render().asPng());
console.log("Generated card-default.png");
