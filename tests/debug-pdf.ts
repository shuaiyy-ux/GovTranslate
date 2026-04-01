import puppeteer from 'puppeteer';
import path from 'path';
import fs from 'fs';

const DIST_PATH = path.resolve(__dirname, '..', 'dist');

async function main() {
  const browser = await puppeteer.launch({
    headless: 'new' as any,
    args: [
      `--disable-extensions-except=${DIST_PATH}`,
      `--load-extension=${DIST_PATH}`,
      '--no-first-run', '--no-default-browser-check', '--disable-gpu',
    ],
  });

  await new Promise((r) => setTimeout(r, 2000));

  const page = await browser.newPage();
  await page.goto('https://translate.google.com/?sl=en&tl=zh-CN', { waitUntil: 'networkidle2', timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2000));

  // Click 文档 tab
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      if ((b.getAttribute('aria-label') || '').includes('文档')) { b.click(); break; }
    }
  });
  await new Promise((r) => setTimeout(r, 1500));

  // Download and upload a real PDF
  const pdfPage = await browser.newPage();
  const resp = await pdfPage.goto('https://www.irs.gov/pub/irs-pdf/fw2.pdf', { timeout: 30000 });
  const buffer = resp ? await resp.buffer() : null;
  await pdfPage.close();
  if (!buffer) { console.log('ERROR: no PDF'); await browser.close(); return; }

  const tmpPath = '/tmp/fw2-test.pdf';
  fs.writeFileSync(tmpPath, buffer);

  const fileInput = await page.$('input[type="file"][accept*="pdf"]');
  await (fileInput as any).uploadFile(tmpPath);
  console.log('Uploaded fw2.pdf');
  await new Promise((r) => setTimeout(r, 3000));

  // Click 翻译
  await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      if ((b.textContent || '').trim() === '翻译') { b.click(); break; }
    }
  });
  console.log('Clicked 翻译, waiting...');

  // Wait for completion
  for (let i = 0; i < 45; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const done = await page.evaluate(() => {
      for (const b of document.querySelectorAll('button')) {
        const t = (b.textContent || '').trim();
        if (t === '打开译文' || t === '下载译文') return true;
      }
      return false;
    });
    if (done) { console.log(`  Done at ${(i+1)*2}s`); break; }
    if (i % 5 === 0) console.log(`  ${(i+1)*2}s: waiting...`);
  }

  // NOW: Investigate what "打开译文" does
  console.log('\n=== Investigating 打开译文 button ===');

  // 1. Check if the button has an href or onclick
  const btnInfo = await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      const t = (b.textContent || '').trim();
      if (t === '打开译文') {
        return {
          tag: b.tagName,
          href: b.getAttribute('href'),
          onclick: b.getAttribute('onclick'),
          parentTag: b.parentElement?.tagName,
          parentHref: b.parentElement?.getAttribute('href'),
          outerHTML: b.outerHTML.substring(0, 300),
        };
      }
    }
    return null;
  });
  console.log('Button info:', JSON.stringify(btnInfo, null, 2));

  // 2. Check all <a> tags for translation-related URLs
  const translationLinks = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a'))
      .map(a => ({ href: a.getAttribute('href')?.substring(0, 150), text: a.textContent?.trim().substring(0, 50) }))
      .filter(l => l.href && (l.href.includes('translate') || l.href.includes('blob') || l.href.includes('doc') || l.text?.includes('译文')));
  });
  console.log('\nTranslation-related links:', JSON.stringify(translationLinks, null, 2));

  // 3. Listen for navigation and click the button (via JS this time to see what happens)
  const client = await page.createCDPSession();
  await client.send('Network.enable');
  await client.send('Page.enable');

  const navigations: string[] = [];
  client.on('Page.frameNavigated', (params: any) => {
    navigations.push(params.frame.url?.substring(0, 150));
  });

  const newWindows: string[] = [];
  client.on('Page.windowOpen', (params: any) => {
    newWindows.push(params.url?.substring(0, 150));
  });

  // Click via trusted mouse event
  const coords = await page.evaluate(() => {
    for (const b of document.querySelectorAll('button')) {
      if ((b.textContent || '').trim() === '打开译文') {
        const r = b.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      }
    }
    return null;
  });

  if (coords) {
    console.log('\nClicking 打开译文 at', coords.x, coords.y);
    await client.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: coords.x, y: coords.y, button: 'left', clickCount: 1 });
    await client.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: coords.x, y: coords.y, button: 'left', clickCount: 1 });

    await new Promise((r) => setTimeout(r, 5000));

    console.log('Navigations:', navigations);
    console.log('New windows:', newWindows);
    console.log('Current URL:', page.url());
  }

  // 4. Also check page HTML for any hidden iframes or embedded content
  const iframes = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('iframe'))
      .map(f => f.src?.substring(0, 150))
      .filter(s => s && !s.includes('recaptcha'));
  });
  console.log('Iframes:', iframes);

  try { fs.unlinkSync(tmpPath); } catch {}
  await browser.close();
}

main().catch(console.error);
