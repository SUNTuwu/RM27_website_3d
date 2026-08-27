// 将 robot_list 原图 (7-11MB) 压缩为 web 版: 最长边 1400px, JPEG q0.82
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "assets", "images", "robot_list");
const outDir = path.join(sourceDir, "web");
const names = ["hero", "engineer", "infantry", "sentry", "drone", "dart", "radar"];

const edgeCandidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const executablePath = edgeCandidates.find(existsSync);
if (!executablePath) throw new Error("Microsoft Edge not found");

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage();

for (const name of names) {
  const raw = await readFile(path.join(sourceDir, `${name}.jpg`));
  const inputUrl = `data:image/jpeg;base64,${raw.toString("base64")}`;
  const dataUrl = await page.evaluate(async (url) => {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = url;
    });
    const scale = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.82);
  }, inputUrl);
  const base64 = dataUrl.split(",")[1];
  const target = path.join(outDir, `${name}.jpg`);
  await writeFile(target, Buffer.from(base64, "base64"));
  console.log(`[ok] ${name}.jpg -> web/${name}.jpg (${Math.round(base64.length * 0.75 / 1024)} KB)`);
}

await browser.close();
