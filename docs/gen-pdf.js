const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  const abs = path.resolve(__dirname, 'advance-crm-technical-report.html');
  const fileUrl = 'file:///' + abs.replace(/\\/g, '/');
  await page.goto(fileUrl, { waitUntil: 'networkidle0', timeout: 30000 });
  await page.pdf({
    path: path.resolve(__dirname, 'advance-crm-technical-report.pdf'),
    format: 'A4',
    printBackground: true,
    margin: { top: '18mm', right: '20mm', bottom: '18mm', left: '20mm' },
    displayHeaderFooter: true,
    footerTemplate: '<div style="font-size:8px;color:#9ca3af;width:100%;text-align:right;padding-right:20mm"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
    headerTemplate: '<span></span>'
  });
  await browser.close();
  console.log('PDF generado correctamente');
})().catch(e => { console.error(e.message); process.exit(1); });
