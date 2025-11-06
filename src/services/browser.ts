import { type Browser, type BrowserContext, type Page, chromium } from 'playwright';
import type { BrowserOptions } from '../types/index.js';
import fs from 'node:fs';

/**
 * ブラウザ操作を管理するサービスクラス
 * Playwrightを使用したブラウザ操作を抽象化
 */
export class BrowserService {
  /**
   * ブラウザを起動する
   * @param options - ブラウザオプション（headless、slowMo等）
   * @returns ブラウザインスタンス
   */
  async launch(options?: BrowserOptions): Promise<Browser> {
    try {
      const browser = await chromium.launch({
        headless: options?.headless ?? true,
        slowMo: options?.slowMo,
        // bot検出を回避するための引数
        args: [
          '--disable-blink-features=AutomationControlled', // 自動化検出を無効化
          '--disable-dev-shm-usage',
          '--disable-setuid-sandbox',
          '--no-sandbox',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-site-isolation-trials',
        ],
      });
      return browser;
    } catch (error) {
      throw new Error(
        `ブラウザの起動に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 新しいページ（タブ）を作成する
   * @param browser - ブラウザインスタンス
   * @param storageStatePath - 認証状態ファイルのパス（オプション）
   * @returns ページインスタンスとコンテキスト
   */
  async newPage(
    browser: Browser,
    storageStatePath?: string
  ): Promise<{ page: Page; context: BrowserContext }> {
    try {
      // storageStateが存在する場合は読み込む
      const contextOptions: Parameters<typeof browser.newContext>[0] = {
        // ユーザーエージェントを設定（botと判定されにくくする）
        userAgent:
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 },
        // Javascriptが有効化されていることを保証
        javaScriptEnabled: true,
      };

      // storageStateファイルが存在する場合は読み込む
      if (storageStatePath && fs.existsSync(storageStatePath)) {
        console.log(`認証状態ファイルを読み込んでいます: ${storageStatePath}`);
        contextOptions.storageState = storageStatePath;
      }

      const context = await browser.newContext(contextOptions);

      const page = await context.newPage();

      // navigator.webdriverプロパティを削除してbot検出を回避
      // これはGoogleがPlaywrightを検出する主な方法の1つ
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
        });
      });

      return { page, context };
    } catch (error) {
      throw new Error(
        `新しいページの作成に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 認証状態をファイルに保存する
   * @param context - ブラウザコンテキスト
   * @param storageStatePath - 保存先ファイルパス
   */
  async saveStorageState(context: BrowserContext, storageStatePath: string): Promise<void> {
    try {
      console.log(`認証状態を保存しています: ${storageStatePath}`);
      await context.storageState({ path: storageStatePath });
      console.log('認証状態の保存が完了しました');
    } catch (error) {
      throw new Error(
        `認証状態の保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 指定されたURLにページを遷移させる
   * @param page - ページインスタンス
   * @param url - 遷移先URL
   * @param timeout - タイムアウト時間（ミリ秒）
   */
  async goto(page: Page, url: string, timeout = 30000): Promise<void> {
    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout,
      });
    } catch (error) {
      throw new Error(
        `URL「${url}」への遷移に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 指定されたセレクタの要素が表示されるまで待機する
   * @param page - ページインスタンス
   * @param selector - CSSセレクタ
   * @param timeout - タイムアウト時間（ミリ秒）
   */
  async waitForSelector(page: Page, selector: string, timeout = 30000): Promise<void> {
    try {
      await page.waitForSelector(selector, {
        state: 'visible',
        timeout,
      });
    } catch (error) {
      throw new Error(
        `要素「${selector}」の表示待機がタイムアウトしました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 指定されたセレクタの要素をクリックする
   * @param page - ページインスタンス
   * @param selector - CSSセレクタ
   * @param timeout - タイムアウト時間（ミリ秒）
   */
  async click(page: Page, selector: string, timeout = 30000): Promise<void> {
    try {
      // 要素が表示されるまで待機してからクリック
      await this.waitForSelector(page, selector, timeout);
      await page.click(selector);
    } catch (error) {
      throw new Error(
        `要素「${selector}」のクリックに失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * ブラウザを終了する
   * @param browser - ブラウザインスタンス
   */
  async close(browser: Browser): Promise<void> {
    try {
      await browser.close();
    } catch (error) {
      throw new Error(
        `ブラウザの終了に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
