const puppeteer = require('puppeteer-core');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  const page = await browser.newPage();
  const abs = path.resolve(__dirname, 'advance-crm-technical-report.html');
  const fileUrl = 'file:///' + abs.replace(/\\/g, '/');
  await page.goto(fileUrl, { waitUntil: 'networkidle2', timeout: 30000 });
  // Wait for Google Fonts to load
  await new Promise(r => setTimeout(r, 2000));
  await page.pdf({
    path: path.resolve(__dirname, 'advance-crm-technical-report.pdf'),
    format: 'A4',
    printBackground: true,
    margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
  });
  await browser.close();
  console.log('PDF generado: docs/advance-crm-technical-report.pdf');
})().catch(e => { console.error(e.message); process.exit(1); });
