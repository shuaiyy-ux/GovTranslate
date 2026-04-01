import puppeteer from 'puppeteer';
import path from 'path';

const DIST_PATH = path.resolve(__dirname, '..', 'dist');
const DUMMY_KEY = 'sk-ant-test-dummy';

async function runTest(round: number): Promise<{ pass: number; fail: number; results: string[] }> {
  const results: string[] = [];
  let pass = 0, fail = 0;

  function check(name: string, ok: boolean, detail?: string) {
    const status = ok ? 'PASS' : 'FAIL';
    if (ok) pass++; else fail++;
    const msg = `  [${status}] ${name}${detail ? ': ' + detail : ''}`;
    results.push(msg);
  }

  const browser = await puppeteer.launch({
    headless: 'new' as any,
    args: [
      `--disable-extensions-except=${DIST_PATH}`,
      `--load-extension=${DIST_PATH}`,
      '--no-first-run', '--no-default-browser-check',
      '--disable-gpu',
    ],
  });

  try {
    await new Promise((r) => setTimeout(r, 2000));
    const swTarget = await browser.waitForTarget(
      (t) => t.type() === 'service_worker' && t.url().includes('service-worker'),
      { timeout: 10000 },
    );
    const extId = swTarget.url().split('/')[2];
    check('Service worker', true, extId);

    // Save API key
    const opt = await browser.newPage();
    await opt.goto(`chrome-extension://${extId}/options/options.html`);
    await new Promise((r) => setTimeout(r, 500));
    await opt.evaluate((key) => chrome.storage.local.set({ govTranslateApiKey: key }), DUMMY_KEY);
    await opt.close();

    // Test 1: Popup loads with CSS and tutorial
    const popup = await browser.newPage();
    await popup.goto(`chrome-extension://${extId}/popup/popup.html`);
    await new Promise((r) => setTimeout(r, 500));
    const popupH1 = await popup.evaluate(() => window.getComputedStyle(document.querySelector('h1')!).color);
    check('Popup CSS', popupH1 === 'rgb(30, 64, 175)', popupH1);

    const hasTutorial = await popup.evaluate(() => !!document.getElementById('tutorial-toggle'));
    check('Tutorial dropdown exists', hasTutorial);

    const tutorialToggle = await popup.evaluate(() => {
      const btn = document.getElementById('tutorial-toggle') as HTMLButtonElement;
      btn?.click();
      const content = document.getElementById('tutorial-content');
      return content?.style.display !== 'none';
    });
    check('Tutorial opens on click', tutorialToggle);
    await popup.close();

    // Test 2: .gov page → translate bar
    const page = await browser.newPage();
    await page.goto('https://www.usa.gov', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 3000));
    const barText = await page.evaluate(() =>
      document.getElementById('gov-translate-notification')?.textContent?.trim().substring(0, 50) || 'NONE'
    );
    check('Translate bar on .gov', barText.includes('智能翻译'), barText);

    // Test 3: Click translate → redirect to translate.goog
    await page.evaluate(() => {
      for (const b of document.querySelectorAll('button')) {
        if (b.textContent?.includes('翻译')) { b.click(); break; }
      }
    });
    await new Promise((r) => setTimeout(r, 4000));
    check('Redirect to translate.goog', page.url().includes('.translate.goog'), page.url().substring(0, 60));

    // Test 4: Highlight trigger bubble on .gov page (test before redirect)
    const page2 = await browser.newPage();
    await page2.goto('https://www.usa.gov', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 3000));
    // Dismiss notification
    await page2.evaluate(() => {
      const btns = document.querySelectorAll('#gov-translate-notification button');
      if (btns.length > 1) (btns[1] as HTMLElement).click();
    });
    await new Promise((r) => setTimeout(r, 500));
    // Select text
    await page2.evaluate(() => {
      const p = document.querySelector('p');
      if (!p) return;
      const range = document.createRange();
      range.selectNodeContents(p);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });
    await new Promise((r) => setTimeout(r, 800));
    const triggerFound = await page2.evaluate(() => !!document.getElementById('gov-translate-trigger'));
    check('Trigger bubble appears', triggerFound);

    // Test 5: Click trigger → chatbox
    if (triggerFound) {
      await page2.evaluate(() => document.getElementById('gov-translate-trigger')?.click());
      await new Promise((r) => setTimeout(r, 1000));
      const chatboxVisible = await page2.evaluate(() => {
        const host = document.getElementById('gov-translate-chatbox-host');
        return host?.style.display === 'block';
      });
      check('Chatbox opens on trigger click', chatboxVisible);
    } else {
      check('Chatbox opens on trigger click', false, 'skipped - no trigger');
    }
    await page2.close();

    // Test 6: PDF page → banner (not overlay yet — overlay only after clicking translate)
    const pdfPage = await browser.newPage();
    await pdfPage.goto('https://www.irs.gov/pub/irs-pdf/fw2.pdf', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise((r) => setTimeout(r, 3000));
    const pdfBanner = await pdfPage.evaluate(() =>
      document.getElementById('gov-translate-notification')?.textContent?.includes('PDF') || false
    );
    check('PDF banner appears', pdfBanner);
    const noOverlayYet = await pdfPage.evaluate(() => !document.getElementById('gov-translate-pdf-overlay'));
    check('No overlay before clicking', noOverlayYet);
    await pdfPage.close();

    // Test 7: No old code in dist
    const distFiles = await new Promise<string[]>((resolve) => {
      const fs = require('fs');
      resolve(fs.readdirSync(path.join(DIST_PATH)).filter((f: string) => f.endsWith('.js')));
    });
    const hasOldCode = distFiles.some((f: string) =>
      f.includes('dom-translator') || f.includes('text-extractor') || f.includes('mutation-watcher')
    );
    check('No old v1 code in dist', !hasOldCode, distFiles.join(', '));

  } catch (err) {
    results.push(`  [ERROR] ${err instanceof Error ? err.message : String(err)}`);
    fail++;
  } finally {
    await browser.close();
  }

  return { pass, fail, results };
}

async function main() {
  console.log('=== Running 3 rounds of validation ===\n');

  for (let i = 1; i <= 3; i++) {
    console.log(`--- Round ${i} ---`);
    const { pass, fail, results } = await runTest(i);
    for (const r of results) console.log(r);
    console.log(`  Score: ${pass}/${pass + fail} passed\n`);

    if (fail > 0) {
      console.log('STOPPING: failures detected in round ' + i);
      process.exit(1);
    }
  }

  console.log('=== ALL 3 ROUNDS PASSED ===');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
