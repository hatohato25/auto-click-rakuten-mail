import type { Page } from 'playwright';

/**
 * 楽天サイトへのログイン処理を管理するサービスクラス
 */
export class RakutenService {
  private isLoggedIn = false; // ログイン済みフラグ（初回のみログイン）

  /**
   * 楽天へのログインが必要かチェック
   * @param page - ページインスタンス
   * @returns ログインが必要な場合true
   */
  async isLoginRequired(page: Page): Promise<boolean> {
    try {
      // すでにログイン済みの場合はスキップ
      if (this.isLoggedIn) {
        return false;
      }

      // URLに 'login' が含まれているかチェック
      const url = page.url();

      if (url.includes('/login') || url.includes('/myrakuten/login')) {
        console.log('楽天ログインページが検出されました');
        return true;
      }

      // ログインフォームが存在するかチェック
      const loginFormSelectors = [
        'input[name="u"]', // ユーザーID入力フィールド
        'input[type="text"][placeholder*="ユーザID"]',
        'input[type="text"][placeholder*="User ID"]',
      ];

      for (const selector of loginFormSelectors) {
        const element = await page.$(selector);
        if (element) {
          console.log('楽天ログインフォームが検出されました');
          return true;
        }
      }

      return false;
    } catch (error) {
      console.error('ログイン要否チェックでエラーが発生しました:', error);
      return false;
    }
  }

  /**
   * 楽天にログイン
   * @param page - ページインスタンス
   * @param userId - 楽天ユーザーID
   * @param password - 楽天パスワード
   */
  async login(page: Page, userId: string, password: string): Promise<void> {
    try {
      console.log('楽天にログインしています...');

      // ページが完全に読み込まれるまで待機（最小限）
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(200);

      // ========================================
      // ステップ1: ユーザーID入力
      // ========================================
      console.log('[ステップ1] ユーザーID入力画面');

      const userIdSelectors = [
        'input[name="u"]',
        'input[id="loginInner_u"]',
        'input[type="text"]',
        'input[placeholder*="ユーザID"]',
        'input[placeholder*="User ID"]',
        '#loginInner_u',
      ];

      let userIdInput: Awaited<ReturnType<Page['$']>> = null;

      // 各セレクタを順番に試す（タイムアウトを大幅短縮）
      for (const selector of userIdSelectors) {
        try {
          userIdInput = await page.waitForSelector(selector, { timeout: 500, state: 'visible' });
          if (userIdInput) {
            console.log(`  ✓ ユーザーID入力フィールドが見つかりました: ${selector}`);
            break;
          }
        } catch {
          // 次のセレクタを試す
        }
      }

      if (!userIdInput) {
        // デバッグ用：スクリーンショットを保存
        await page.screenshot({ path: 'rakuten-login-error-step1.png' });
        console.error(
          '  ✗ ログインページのスクリーンショットを保存しました: rakuten-login-error-step1.png'
        );
        console.error('  ✗ 現在のURL:', page.url());
        throw new Error('ユーザーID入力フィールドが見つかりませんでした');
      }

      // ユーザーIDを入力（待機時間を削除）
      console.log('  → ユーザーIDを入力しています...');
      await userIdInput.fill(userId);

      // 「次へ」ボタンを探してクリック（タイムアウトを大幅短縮）
      const nextBtn = page.getByRole('button', { name: '次へ' });
      await nextBtn.waitFor({ timeout: 1000, state: 'visible' });
      console.log('  ✓ 次へボタンが見つかりました');
      await nextBtn.click();
      console.log('  → 次へボタンをクリックしました');

      // ページ遷移を待機（パスワード入力画面へ）- 最小限の待機
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(200);

      // ========================================
      // ステップ2: パスワード入力
      // ========================================
      console.log('[ステップ2] パスワード入力画面');

      const passwordSelectors = [
        'input[name="p"]',
        'input[id="loginInner_p"]',
        'input[type="password"]',
        '#loginInner_p',
      ];

      let passwordInput: Awaited<ReturnType<Page['$']>> = null;
      for (const selector of passwordSelectors) {
        try {
          passwordInput = await page.waitForSelector(selector, { timeout: 500, state: 'visible' });
          if (passwordInput) {
            console.log(`  ✓ パスワード入力フィールドが見つかりました: ${selector}`);
            break;
          }
        } catch {
          // 次のセレクタを試す
        }
      }

      if (!passwordInput) {
        await page.screenshot({ path: 'rakuten-login-error-step2.png' });
        console.error(
          '  ✗ パスワード画面のスクリーンショットを保存しました: rakuten-login-error-step2.png'
        );
        console.error('  ✗ 現在のURL:', page.url());
        throw new Error('パスワード入力フィールドが見つかりませんでした');
      }

      // パスワードを入力（待機時間を削除）
      console.log('  → パスワードを入力しています...');
      await passwordInput.fill(password);

      // ログインボタン（パスワード画面の「次へ」ボタン）をクリック（タイムアウトを大幅短縮）
      const loginBtn = page.getByRole('button', { name: '次へ' });
      await loginBtn.waitFor({ timeout: 1000, state: 'visible' });
      console.log('  ✓ ログインボタンが見つかりました');
      await loginBtn.click();
      console.log('  → ログインボタンをクリックしました');

      // ログイン後のページ遷移を待機
      // 初回ログイン時はリダイレクトや追加画面が表示される可能性があるため、
      // domcontentloadedでページ遷移完了を確実に待つ
      console.log('  → ログイン処理のページ遷移を待機中...');
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(1000);

      // ログイン成功を確認
      const loginSuccess = await this.verifyLogin(page);
      if (loginSuccess) {
        this.isLoggedIn = true;
        console.log('✅ 楽天へのログインに成功しました');
      } else {
        await page.screenshot({ path: 'rakuten-login-error-verify.png' });
        console.error(
          '✗ ログイン検証失敗のスクリーンショットを保存しました: rakuten-login-error-verify.png'
        );
        throw new Error('ログインに失敗しました');
      }
    } catch (error) {
      throw new Error(
        `楽天へのログインに失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * ログイン状態を確認
   * @param page - ページインスタンス
   * @returns ログイン成功の場合true
   */
  async verifyLogin(page: Page): Promise<boolean> {
    try {
      // URLがログインページでないことを確認
      const url = page.url();
      if (url.includes('/login') || url.includes('/myrakuten/login')) {
        return false;
      }

      // ログインエラーメッセージが表示されていないか確認
      const errorSelectors = [
        'text=ユーザIDまたはパスワードが正しくありません',
        'text=User ID or password is incorrect',
        'div.error',
        'p.error',
      ];

      for (const selector of errorSelectors) {
        const errorElement = await page.$(selector);
        if (errorElement) {
          return false;
        }
      }

      // ログイン成功とみなす
      return true;
    } catch (_error) {
      return false;
    }
  }

  /**
   * ログイン済みフラグをリセット（テスト用）
   */
  resetLoginStatus(): void {
    this.isLoggedIn = false;
  }
}
