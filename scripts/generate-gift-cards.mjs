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
  <defs>
    <linearGradient id="overlayGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${t.ink}" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="${t.accent}" stop-opacity="0.12"/>
    </linearGradient>
  </defs>
  <!-- Background Card -->
  <rect width="1200" height="630" fill="${t.shell}"/>
  
  <!-- Subtle decorative shapes -->
  <circle cx="1120" cy="-40" r="280" fill="${t.ink}" opacity="0.04"/>
  <circle cx="90" cy="690" r="260" fill="${t.accent}" opacity="0.08"/>
  <circle cx="1080" cy="500" r="180" fill="url(#overlayGrad)" opacity="0.7"/>

  <!-- Top bar: Brand & Badge -->
  <text x="80" y="118" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="34" font-weight="700" fill="${t.ink}" letter-spacing="-0.5">Zero Club Gift</text>
  
  <rect x="1000" y="76" width="120" height="54" rx="27" fill="${t.accent}"/>
  <text x="1060" y="111" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="800" fill="${t.accentInk}" letter-spacing="1">GIFT</text>

  <!-- Middle Content: Purpose & Gift Card Art -->
  <text x="80" y="310" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="700" letter-spacing="4" fill="${t.muted}">ZERO CLUB GIFT CARD</text>
  <text x="80" y="430" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="96" font-weight="800" fill="${t.ink}" letter-spacing="-2">A Gift For You</text>

  <text x="80" y="495" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="28" font-weight="500" fill="${t.muted}">Open and claim your gift in Zero Club</text>

  <!-- Bottom Bar: Credit type & Platform -->
  <line x1="80" y1="535" x2="1120" y2="535" stroke="${t.muted}" stroke-opacity="0.25" stroke-width="1.5"/>
  <text x="80" y="580" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="600" letter-spacing="2" fill="${t.muted}">ZERO CLUB WALLET CREDIT</text>
  <text x="1120" y="580" text-anchor="end" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="22" font-weight="600" fill="${t.muted}">zeroclubs.xyz</text>
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
