import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log("[BROWSER CONSOLE ERROR]", msg.text());
    }
  });
  page.on("pageerror", (err) => console.error("[PAGE ERROR]", err));

  console.log("Navigating to http://localhost:3000/play#debug...");
  await page.goto("http://localhost:3000/play#debug", { waitUntil: "domcontentloaded" });
  console.log("Page loaded!");

  await page.waitForSelector("canvas", { timeout: 10000 });
  console.log("Canvas found!");

  // Wait 3s for textures and layout
  await page.waitForTimeout(3000);

  const canvas = await page.$("canvas");
  const box = await canvas.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  console.log(`Starting long-press at center ${cx}, ${cy}...`);
  await page.mouse.move(cx, cy);
  await page.mouse.down();

  // Hold for 1.4s
  await page.waitForTimeout(1400);
  console.log("Releasing mouse...");
  await page.mouse.up();

  // Wait 3s for burst and transition to settle
  await page.waitForTimeout(3000);

  // Take screenshot of settled detail view
  await page.screenshot({
    path: "/Users/aurelienlouvel/.gemini/antigravity-ide/brain/079db5a8-7369-49d1-ae40-84fab430fb64/scratch/play_detail_fixed.png",
  });
  console.log("Detail screenshot saved!");

  // Now test mouse wheel scrolling down
  console.log("Testing wheel scrolling down...");
  await page.mouse.move(cx, cy);
  await page.mouse.wheel(0, 400);
  await page.waitForTimeout(1000);

  // Take screenshot after scroll
  await page.screenshot({
    path: "/Users/aurelienlouvel/.gemini/antigravity-ide/brain/079db5a8-7369-49d1-ae40-84fab430fb64/scratch/play_detail_scrolled.png",
  });
  console.log("Scrolled screenshot saved!");

  await browser.close();
}

main().catch((err) => {
  console.error("Script failed:", err);
  process.exit(1);
});
