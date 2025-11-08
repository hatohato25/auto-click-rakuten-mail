import { loadConfig } from './src/utils/config.js';
import { BrowserService } from './src/services/browser.js';

async function debugLogin() {
  const config = loadConfig();
  const browserService = new BrowserService();

  console.log('=== Gmailログインデバッグ ===\n');
  console.log('Headlessモードでブラウザを起動しています...');

  const browser = await browserService.launch({ headless: true });
  const { page } = await browserService.newPage(browser);

  try {
    // Gmailにアクセス
    console.log('\n1. Gmailにアクセスしています...');
    await page.goto('https://mail.google.com', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1000);

    // メールアドレス入力
    console.log('2. メールアドレスを入力しています...');
    await page.waitForSelector('input[type="email"]', { state: 'visible', timeout: 30000 });
    await page.fill('input[type="email"]', config.email);
    await page.screenshot({ path: 'debug/01-email-input.png', fullPage: true });
    console.log('   スクリーンショット保存: debug/01-email-input.png');

    // 次へボタンをクリック
    console.log('3. 「次へ」ボタンをクリックしています...');
    await page.click('button:has-text("次へ"), button:has-text("Next")');
    await page.waitForTimeout(2000);

    // パスワード画面のスクリーンショット
    console.log('4. パスワード入力画面のスクリーンショットを撮影しています...');
    await page.screenshot({ path: 'debug/02-password-page.png', fullPage: true });
    console.log('   スクリーンショット保存: debug/02-password-page.png');

    // パスワードフィールドを検索
    console.log('\n5. パスワードフィールドを検索しています...');
    const passwordFields = await page.$$('input[type="password"]');
    console.log(`   見つかったパスワードフィールド数: ${passwordFields.length}`);

    for (let i = 0; i < passwordFields.length; i++) {
      const field = passwordFields[i];
      const attrs = await field.evaluate((el) => ({
        name: el.getAttribute('name'),
        id: el.getAttribute('id'),
        class: el.getAttribute('class'),
        ariaHidden: el.getAttribute('aria-hidden'),
        tabindex: el.getAttribute('tabindex'),
        type: el.getAttribute('type'),
        // biome-ignore lint/suspicious/noExplicitAny: HTMLElementの型チェックのため
        visible: (el as any).offsetParent !== null,
      }));
      console.log(`\n   フィールド ${i + 1}:`, JSON.stringify(attrs, null, 2));
    }

    // HTMLソースを保存
    console.log('\n6. ページのHTMLソースを保存しています...');
    const html = await page.content();
    const fs = await import('node:fs');
    fs.writeFileSync('debug/02-password-page.html', html);
    console.log('   HTMLソース保存: debug/02-password-page.html');

    console.log('\n✅ デバッグ情報の収集が完了しました');
    console.log('   debug/ ディレクトリを確認してください');
  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error);
    await page.screenshot({ path: 'debug/error.png', fullPage: true });
    console.log('   エラー時のスクリーンショット: debug/error.png');
  } finally {
    await browser.close();
  }
}

debugLogin();
