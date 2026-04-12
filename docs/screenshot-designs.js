const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const fileUrl = 'file:///' + path.resolve(__dirname, '..', 'design-options.html').replace(/\\/g, '/');
  await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 30000 });

  const options = ['A', 'B', 'C', 'D'];

  for (const opt of options) {
    // Click the button for this option
    await page.evaluate((o) => {
      const btns = document.querySelectorAll('button');
      for (const b of btns) {
        if (b.textContent.trim().startsWith(o)) { b.click(); break; }
      }
    }, opt);

    await new Promise(r => setTimeout(r, 400));

    const outPath = path.resolve(__dirname, `design-option-${opt}.png`);
    await page.screenshot({ path: outPath, fullPage: false });
    console.log(`Saved: ${outPath}`);
  }

  await browser.close();
  console.log('Done');
})().catch(e => { console.error(e.message); process.exit(1); });
