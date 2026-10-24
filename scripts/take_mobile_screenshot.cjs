const { chromium } = require('playwright');
const path = require('path');

async function capture() {
  const browser = await chromium.launch({ headless: true });
  
  // 1. Mobile viewport (iPhone 14 / modern Android)
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
    hasTouch: true,
    isMobile: true
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await mobilePage.waitForTimeout(2000); // Wait for MapLibre tiles

  const mobileScreenshotPath = path.join(__dirname, '..', 'mobile_preview.png');
  await mobilePage.screenshot({ path: mobileScreenshotPath });
  console.log('Mobile screenshot saved to:', mobileScreenshotPath);

  // 2. Trigger the touch context menu on mobile
  // Touch & hold near center of map (x: 195, y: 400) for 600ms
  const touch = mobilePage.touchscreen;
  if (touch) {
    await touch.tap(195, 400); // focus
    // Simulate touchstart, wait, touchend via page evaluate
    await mobilePage.evaluate(() => {
      const mapCanvas = document.querySelector('.maplibregl-canvas');
      if (mapCanvas) {
        const rect = mapCanvas.getBoundingClientRect();
        const clientX = rect.left + rect.width / 2;
        const clientY = rect.top + rect.height / 2;
        const touchObj = new Touch({
          identifier: 1,
          target: mapCanvas,
          clientX,
          clientY,
          pageX: clientX,
          pageY: clientY
        });
        const touchEvent = new TouchEvent('touchstart', {
          touches: [touchObj],
          targetTouches: [touchObj],
          changedTouches: [touchObj],
          bubbles: true,
          cancelable: true
        });
        mapCanvas.dispatchEvent(touchEvent);
      }
    });

    await mobilePage.waitForTimeout(600); // let the 500ms timer fire

    await mobilePage.evaluate(() => {
      const mapCanvas = document.querySelector('.maplibregl-canvas');
      if (mapCanvas) {
        const touchEvent = new TouchEvent('touchend', {
          touches: [],
          targetTouches: [],
          changedTouches: [],
          bubbles: true,
          cancelable: true
        });
        mapCanvas.dispatchEvent(touchEvent);
      }
    });
    await mobilePage.waitForTimeout(500);

    const menuScreenshotPath = path.join(__dirname, '..', 'mobile_context_menu_preview.png');
    await mobilePage.screenshot({ path: menuScreenshotPath });
    console.log('Mobile context menu screenshot saved to:', menuScreenshotPath);
  }

  await browser.close();
}

capture().catch(err => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
