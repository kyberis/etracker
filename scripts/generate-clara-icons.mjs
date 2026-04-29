#!/usr/bin/env node
/**
 * Generates all the Clara-branded icons used by the site:
 *  - public/clara-icon-192.png   (PWA manifest)
 *  - public/clara-icon-512.png   (PWA manifest)
 *  - public/clara-icon-maskable.png (PWA manifest, with safe-zone padding)
 *  - public/clara-icon.png       (1024 master, used by next/og elsewhere)
 *  - src/app/icon.png            (Next.js favicon, 64x64)
 *  - src/app/apple-icon.png      (iOS home screen, 180x180)
 *  - src/app/favicon.ico         (legacy favicon, 32x32 PNG-in-ICO)
 *
 * Source: public/clara-avatar-simple.png (1376x768 illustration on a deep
 * navy background). We crop a centered 768x768 square so the portrait
 * circle is the focal point and resample everything from there.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SOURCE = resolve(ROOT, "public/clara-avatar-simple.png");

// Solid background that matches the painted backdrop in the avatar so
// the maskable padding is invisible.
const BG = { r: 16, g: 14, b: 53, alpha: 1 };

async function ensureDir(file) {
  await mkdir(dirname(file), { recursive: true });
}

async function writePng(out, buf) {
  await ensureDir(out);
  await writeFile(out, buf);
  console.log("wrote", out);
}

/**
 * 1376 x 768 source -> centered 768x768 crop containing the portrait circle.
 */
function cropSquare() {
  const left = Math.round((1376 - 768) / 2);
  return sharp(SOURCE).extract({ left, top: 0, width: 768, height: 768 });
}

async function makeSquarePng(size) {
  return cropSquare()
    .resize(size, size, { fit: "cover" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Maskable icons need ~10% safe-zone padding on every side. We extend
 * the 768 square with the background color, then downsample to 512.
 */
async function makeMaskablePng(size) {
  const pad = Math.round(768 * 0.12);
  return cropSquare()
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: BG })
    .resize(size, size, { fit: "cover" })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Build a single-image .ico that wraps a 32x32 PNG. Modern browsers
 * (and Google's favicon scraper) handle PNG-in-ICO fine.
 */
function buildIco(pngBuffer, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // image count

  const dir = Buffer.alloc(16);
  dir.writeUInt8(size === 256 ? 0 : size, 0); // width (0 means 256)
  dir.writeUInt8(size === 256 ? 0 : size, 1); // height
  dir.writeUInt8(0, 2); // palette
  dir.writeUInt8(0, 3); // reserved
  dir.writeUInt16LE(1, 4); // color planes
  dir.writeUInt16LE(32, 6); // bits per pixel
  dir.writeUInt32LE(pngBuffer.length, 8); // image size
  dir.writeUInt32LE(header.length + dir.length, 12); // offset

  return Buffer.concat([header, dir, pngBuffer]);
}

async function main() {
  const master = await makeSquarePng(1024);
  await writePng(resolve(ROOT, "public/clara-icon.png"), master);

  const icon192 = await makeSquarePng(192);
  await writePng(resolve(ROOT, "public/clara-icon-192.png"), icon192);

  const icon512 = await makeSquarePng(512);
  await writePng(resolve(ROOT, "public/clara-icon-512.png"), icon512);

  const maskable = await makeMaskablePng(512);
  await writePng(resolve(ROOT, "public/clara-icon-maskable.png"), maskable);

  const appIcon = await makeSquarePng(64);
  await writePng(resolve(ROOT, "src/app/icon.png"), appIcon);

  const apple = await makeSquarePng(180);
  await writePng(resolve(ROOT, "src/app/apple-icon.png"), apple);

  const favPng = await makeSquarePng(32);
  const ico = buildIco(favPng, 32);
  await writePng(resolve(ROOT, "src/app/favicon.ico"), ico);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
