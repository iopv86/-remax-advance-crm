const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  async function shot(page, theme, outFile) {
    // Set localStorage theme before navigating
    await page.evaluateOnNewDocument((t) => {
      localStorage.setItem('ae-theme', t);
    }, theme);
    await page.goto('http://localhost:3000/dashboard', { waitUntil: 'networkidle0', timeout: 15000 });
    // If redirected to login, we can't get the dashboard — just shoot the login
    const url = page.url();
    if (url.includes('login')) {
      await page.goto('http://localhost:3000/login', { waitUntil: 'networkidle0' });
    }
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: outFile });
    console.log('Saved:', outFile);
  }

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });

  const outDir = path.resolve(__dirname);
  await shot(page, 'dark', path.join(outDir, 'theme-dark.png'));
  await shot(page, 'light', path.join(outDir, 'theme-light.png'));

  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
