import sharp from "sharp";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "..", "public", "icons");
mkdirSync(OUT_DIR, { recursive: true });

function svg(size, { maskable = false } = {}) {
  const pad = maskable ? size * 0.2 : size * 0.08;
  const r = (size - pad * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const bg = "#16a34a";
  const ballR = r * 0.62;

  return `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="${bg}"/>
  <circle cx="${cx}" cy="${cy}" r="${ballR}" fill="#ffffff"/>
  ${Array.from({ length: 9 })
    .map((_, i) => {
      const angle = (i / 9) * Math.PI * 2;
      const hx = cx + Math.cos(angle) * ballR * 0.55;
      const hy = cy + Math.sin(angle) * ballR * 0.55;
      return `<circle cx="${hx}" cy="${hy}" r="${size * 0.018}" fill="${bg}"/>`;
    })
    .join("\n")}
</svg>`;
}

const targets = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "icon-512-maskable.png", size: 512, maskable: true },
  { name: "apple-touch-icon.png", size: 180 },
];

for (const t of targets) {
  const buf = Buffer.from(svg(t.size, { maskable: t.maskable }));
  await sharp(buf).png().toFile(path.join(OUT_DIR, t.name));
  console.log("wrote", t.name);
}
