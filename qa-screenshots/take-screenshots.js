const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3001';
const OUT = path.join(__dirname);

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  // 1. Login page - light
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.screenshot({ path: `${OUT}/01-login-light.png`, fullPage: true });
  console.log('✓ login light');

  // 2. Login page - dark
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
    localStorage.setItem('advance-crm-theme', 'dark');
  });
  await page.screenshot({ path: `${OUT}/02-login-dark.png`, fullPage: true });
  console.log('✓ login dark');

  // Try to login with test credentials from env
  // If no credentials, just capture public pages
  const email = process.env.TEST_EMAIL || '';
  const password = process.env.TEST_PASSWORD || '';
  
  if (email && password) {
    await page.evaluate(() => document.documentElement.classList.remove('dark'));
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
    
    // Fill login form
    const emailInput = page.locator('input[type="email"]').first();
    const passInput = page.locator('input[type="password"]').first();
    if (await emailInput.isVisible()) {
      await emailInput.fill(email);
      await passInput.fill(password);
      await page.keyboard.press('Enter');
      await page.waitForURL('**/dashboard**', { timeout: 10000 }).catch(() => {});
    }
  }

  // Check if we're on dashboard
  const onDashboard = page.url().includes('/dashboard');
  
  if (onDashboard) {
    const pages = [
      { path: '/dashboard', name: '03-dashboard' },
      { path: '/dashboard/contacts', name: '04-contacts' },
      { path: '/dashboard/pipeline', name: '05-pipeline' },
      { path: '/dashboard/properties', name: '06-properties' },
      { path: '/dashboard/settings', name: '07-settings' },
    ];
    
    for (const p of pages) {
      // Light
      await page.evaluate(() => document.documentElement.classList.remove('dark'));
      await page.goto(`${BASE}${p.path}`, { waitUntil: 'networkidle' });
      await page.screenshot({ path: `${OUT}/${p.name}-light.png`, fullPage: true });
      console.log(`✓ ${p.name} light`);
      
      // Dark
      await page.evaluate(() => document.documentElement.classList.add('dark'));
      await page.screenshot({ path: `${OUT}/${p.name}-dark.png`, fullPage: true });
      console.log(`✓ ${p.name} dark`);
    }
  } else {
    console.log('⚠ Not authenticated — only login screenshots available');
    console.log('  Set TEST_EMAIL and TEST_PASSWORD env vars to capture dashboard');
  }

  await browser.close();
  console.log('\nDone. Screenshots saved to:', OUT);
}

run().catch(e => { console.error(e); process.exit(1); });
