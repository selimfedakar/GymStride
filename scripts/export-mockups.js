const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const LABELS = [
  '01_gym-buddies',
  '02_running-buddies',
  '03_log-workout',
  '04_send-request',
  '05_messages',
  '06_profile',
];

async function run() {
  const htmlPath = path.resolve(__dirname, '..', 'mockup-generator.html');
  const outputDir = path.resolve(__dirname, '..', 'gymstride_mockup', 'exports');

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  console.log('🚀 Launching browser…');
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  // 3× DPR → 1242 × 2688 px output per canvas (Apple 6.5" exact)
  await page.setViewport({ width: 1800, height: 960, deviceScaleFactor: 3 });

  console.log('📄 Loading HTML…');
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

  // Wait for all images inside the canvases to fully load
  await page.evaluate(() =>
    Promise.all(
      [...document.querySelectorAll('.mockup-canvas img')].map(img =>
        img.complete ? Promise.resolve() : new Promise(r => { img.onload = r; img.onerror = r; })
      )
    )
  );

  // Extra settle time for fonts / CSS
  await new Promise(r => setTimeout(r, 800));

  // Hide fixed UI elements that bleed into canvas screenshots
  await page.evaluate(() => {
    const bar = document.querySelector('.export-bar');
    if (bar) bar.style.display = 'none';
  });

  const canvases = await page.$$('.mockup-canvas');

  if (canvases.length === 0) {
    console.error('❌ No .mockup-canvas elements found.');
    await browser.close();
    process.exit(1);
  }

  console.log(`\n📸 Exporting ${canvases.length} mockups → ${outputDir}\n`);

  for (let i = 0; i < canvases.length; i++) {
    const label = LABELS[i] ?? `screen_${i + 1}`;
    const outPath = path.join(outputDir, `GymStride_${label}.png`);

    await canvases[i].screenshot({ path: outPath, omitBackground: false });
    console.log(`  ✓ GymStride_${label}.png`);
  }

  await browser.close();
  console.log('\n✅ Done! All mockups saved to gymstride_mockup/exports/');
}

run().catch(err => { console.error('❌', err.message); process.exit(1); });
