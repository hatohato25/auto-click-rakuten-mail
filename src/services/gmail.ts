import type { Page } from 'playwright';
import type { BrowserService } from './browser.js';

/**
 * Gmail操作を管理するサービスクラス
 */
export class GmailService {
  private readonly GMAIL_URL = 'https://mail.google.com';

  constructor(private browserService: BrowserService) {}

  /**
   * Gmailにアクセスし、メールアドレス入力画面まで進む
   * @param page - ページインスタンス
   * @param email - Gmailアドレス
   */
  async accessGmail(page: Page, email: string): Promise<void> {
    try {
      // GmailのURLへ遷移
      console.log('Gmailにアクセスしています...');
      await this.browserService.goto(page, this.GMAIL_URL);

      // ログインページへのリダイレクトを待つ（最小限に短縮）
      await page.waitForTimeout(500);

      // メールアドレス入力フィールドを待機
      // Googleのログインページではidentifier入力フィールドが使用される
      const emailInputSelector = 'input[type="email"]';
      console.log('メールアドレス入力フィールドを待機中...');
      await this.browserService.waitForSelector(page, emailInputSelector);

      // メールアドレスを入力
      console.log(`メールアドレス「${email}」を入力しています...`);
      await page.fill(emailInputSelector, email);

      // 「次へ」ボタンをクリック
      const nextButtonSelector = 'button:has-text("次へ"), button:has-text("Next")';
      console.log('「次へ」ボタンをクリックしています...');
      await this.browserService.click(page, nextButtonSelector);

      console.log('メールアドレスの入力が完了しました');
    } catch (error) {
      throw new Error(
        `Gmailへのアクセスに失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * パスワードを入力してログインする
   * @param page - ページインスタンス
   * @param password - パスワード
   */
  async login(page: Page, password: string): Promise<void> {
    try {
      // パスワード入力フィールドを待機
      // Googleログインページではname="Passwd"またはtype="password"が使用される
      const passwordInputSelector = 'input[type="password"]';
      console.log('パスワード入力フィールドを待機中...');
      await this.browserService.waitForSelector(page, passwordInputSelector);

      // パスワードを入力
      console.log('パスワードを入力しています...');
      await page.fill(passwordInputSelector, password);

      // 「次へ」ボタンをクリック
      const nextButtonSelector = 'button:has-text("次へ"), button:has-text("Next")';
      console.log('「次へ」ボタンをクリックしています...');
      await this.browserService.click(page, nextButtonSelector);

      // ログイン処理完了を待機（Gmailのメイン画面が表示されるまで - 短縮）
      console.log('ログイン処理完了を待機中...');
      await page.waitForTimeout(2000);

      console.log('Gmailへのログインが完了しました');
    } catch (error) {
      throw new Error(
        `Gmailへのログインに失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Gmail内でメールを検索する
   * @param page - ページインスタンス
   * @param query - 検索クエリ（例: "from:rakuten"）
   * @returns 検索結果のメールリスト
   */
  async searchMails(page: Page, query: string): Promise<void> {
    try {
      console.log(`検索クエリ「${query}」でメールを検索しています...`);

      // 検索ボックスを待機
      // Gmailの検索ボックスは aria-label="メールを検索" または placeholder で識別できる
      const searchBoxSelector = 'input[aria-label="メールを検索"], input[placeholder*="検索"]';
      console.log('検索ボックスを待機中...');
      await this.browserService.waitForSelector(page, searchBoxSelector, 10000);

      // 検索クエリを入力
      console.log('検索クエリを入力しています...');
      await page.fill(searchBoxSelector, query);

      // Enterキーを押して検索実行
      console.log('検索を実行しています...');
      await page.keyboard.press('Enter');

      // 検索実行後、古いDOM（受信トレイ）が残るため、ページをリロードして検索結果を確実に表示
      console.log('検索結果の読み込みを待機中...');
      await page.waitForTimeout(1000);

      // ページをリロードして検索結果のDOMを更新
      await page.evaluate(() => {
        // biome-ignore lint/suspicious/noExplicitAny: evaluate内ではlocationが利用可能
        (globalThis as any).location.reload();
      });

      // リロード完了を待機（networkidleからdomcontentloadedに変更）
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1500);

      console.log('検索が完了しました');
    } catch (error) {
      throw new Error(
        `メール検索に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 検索結果のメール数を取得
   * @param page - ページインスタンス
   * @returns メール数
   */
  async getMailCount(page: Page): Promise<number> {
    try {
      console.log('検索結果のメール数を取得しています...');

      // 検索結果が読み込まれるまで待機
      await page.waitForTimeout(2000);

      const count = await page.evaluate(() => {
        // biome-ignore lint/suspicious/noExplicitAny: page.evaluate内ではdocumentが利用可能
        const doc = (globalThis as any).document;

        // 複数のセレクタパターンでメール行を探す
        const selectors = [
          'tr.zA', // Gmail標準のメール行
          'div[role="main"] table tbody tr[role="row"]', // メインエリア内のテーブル行
          'table.F tbody tr', // テーブルF内の行
        ];

        for (const selector of selectors) {
          const rows = doc.querySelectorAll(selector);
          if (rows.length > 0) {
            return rows.length;
          }
        }

        return 0;
      });

      console.log(`検索結果: ${count}件のメールが見つかりました`);
      return count;
    } catch (error) {
      throw new Error(
        `メール数の取得に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * N番目のメールを開く（検索結果から）
   * @param page - ページインスタンス
   * @param index - メールのインデックス（0始まり）
   */
  async openMailByIndex(page: Page, index: number): Promise<void> {
    try {
      console.log(`${index + 1}番目のメールを開いています...`);

      // 検索結果が完全に読み込まれるまで待機（大幅に短縮）
      await page.waitForTimeout(500);

      // 画面の一番上にスクロール
      await page.evaluate(() => {
        // biome-ignore lint/suspicious/noExplicitAny: page.evaluate内ではdocumentが利用可能
        const mainArea = (globalThis as any).document.querySelector('div[role="main"]');
        if (mainArea) {
          mainArea.scrollTop = 0;
        }
      });

      await page.waitForTimeout(200);

      // N番目のメールをクリック
      const clicked = await page.evaluate((idx: number) => {
        // biome-ignore lint/suspicious/noExplicitAny: page.evaluate内ではdocumentが利用可能
        const doc = (globalThis as any).document;

        const selectors = [
          'tr.zA',
          'div[role="main"] table tbody tr[role="row"]',
          'table.F tbody tr',
        ];

        for (const selector of selectors) {
          const rows = doc.querySelectorAll(selector);
          if (rows.length > idx) {
            rows[idx].click();
            return true;
          }
        }

        return false;
      }, index);

      if (!clicked) {
        throw new Error(`${index + 1}番目のメールが見つかりませんでした。`);
      }

      // メール内容の読み込みを待機
      // 画像認識処理で明示的に画像の読み込み完了を待機するため、ここでは最小限の待機
      await page.waitForTimeout(800);

      console.log(`${index + 1}番目のメールを開きました`);
    } catch (error) {
      throw new Error(
        `メールを開くことに失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 検索結果一覧に戻る
   * @param page - ページインスタンス
   */
  async backToSearchResults(page: Page): Promise<void> {
    try {
      console.log('検索結果一覧に戻っています...');

      // Escapeキーでメール詳細画面を閉じる
      // goBack()を使うとメールが再度既読になるため、Escapeキーを使用
      await page.keyboard.press('Escape');

      // メールリストが表示されるまで待機
      await page.waitForTimeout(300);

      console.log('検索結果一覧に戻りました');
    } catch (error) {
      throw new Error(
        `検索結果一覧に戻ることに失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * メールを未読にする（メール詳細画面で実行）
   * @param page - ページインスタンス
   */
  async markAsUnread(page: Page): Promise<void> {
    try {
      console.log('メールを未読にしています...');

      // Gmailではショートカットキー Shift+U が最も確実で高速
      // ボタン検索に時間をかけるより、ショートカットキーを直接使用する方が効率的
      console.log('  ショートカットキー Shift+U で未読にしています...');
      await page.keyboard.press('Shift+U');
      console.log('  ✓ 未読処理が完了しました');

      // 未読マークがUI上に反映されるまで最小限の待機
      // Escapeキーで閉じるため、サーバー反映を待つ必要はない
      await page.waitForTimeout(200);

      console.log('メールを未読にしました');
    } catch (error) {
      throw new Error(
        `メールを未読にすることに失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * メールを削除する（ゴミ箱へ移動）
   * @param page - ページインスタンス
   */
  async deleteEmail(page: Page): Promise<void> {
    try {
      console.log('メールを削除しています...');

      // 複数の方法を試行して削除を実行
      let deleted = false;

      // 方法1: 削除ボタンをクリック（最も確実）
      try {
        console.log('  削除ボタンを探しています...');
        // Gmailの削除ボタンは複数のパターンがある
        const deleteButtonSelectors = [
          'div[data-tooltip="ゴミ箱に移動"]',
          'div[data-tooltip="Delete"]',
          'div[aria-label="ゴミ箱に移動"]',
          'div[aria-label="Delete"]',
          'button[aria-label="ゴミ箱に移動"]',
          'button[aria-label="Delete"]',
          '[data-tooltip*="ゴミ箱"]',
          '[aria-label*="ゴミ箱"]',
          '[data-tooltip*="Delete"]',
          '[aria-label*="Delete"]',
        ];

        for (const selector of deleteButtonSelectors) {
          try {
            const button = await page.$(selector);
            if (button) {
              const isVisible = await button.isVisible();
              if (isVisible) {
                console.log(`  削除ボタンが見つかりました: ${selector}`);
                await button.click();
                deleted = true;
                console.log('  ✓ 削除ボタンをクリックしました');
                break;
              }
            }
          } catch {
            // このセレクタでは見つからなかったので次を試す
          }
        }
      } catch (error) {
        console.log(
          `  削除ボタンのクリックに失敗: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      // 方法2: キーボードショートカット `#` を試行
      if (!deleted) {
        try {
          console.log('  キーボードショートカット # を試行しています...');
          await page.keyboard.press('#');
          deleted = true;
          console.log('  ✓ ショートカットキー # を送信しました');
        } catch (error) {
          console.log(
            `  ショートカットキーの送信に失敗: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      // 方法3: Shift+3 を試行
      if (!deleted) {
        try {
          console.log('  キーボードショートカット Shift+3 を試行しています...');
          await page.keyboard.press('Shift+3');
          deleted = true;
          console.log('  ✓ ショートカットキー Shift+3 を送信しました');
        } catch (error) {
          console.log(
            `  ショートカットキーの送信に失敗: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      if (!deleted) {
        console.log('  ⚠️ 削除処理を実行できませんでしたが、処理を継続します');
      }

      // 削除処理のUI反映を待機
      await page.waitForTimeout(500);

      console.log('メールの削除処理が完了しました');
    } catch (error) {
      throw new Error(
        `メールの削除に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 検索結果の最初のメールを開く
   * @param page - ページインスタンス
   * @deprecated openMailByIndex(page, 0) を使用してください
   */
  async openFirstMail(page: Page): Promise<void> {
    return this.openMailByIndex(page, 0);
  }
}
