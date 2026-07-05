import fs from 'node:fs';
import path from 'node:path';
import type { Page } from 'playwright';
import type { BrowserService } from './browser.js';

/**
 * Gmail操作を管理するサービスクラス
 */
export class GmailService {
  private readonly GMAIL_URL = 'https://mail.google.com';

  // メール行のセレクタはGmailのUI変更で複数パターンが混在するため、
  // 検索結果の待機（searchMails）・件数取得（getMailCount）・メールを開く（openMailByIndex）で共通利用する
  private readonly MAIL_ROW_SELECTORS = [
    'tr.zA', // Gmail標準のメール行
    'div[role="main"] table tbody tr[role="row"]', // メインエリア内のテーブル行
    'table.F tbody tr', // テーブルF内の行
  ];

  // searchMailsで遷移した検索URLを保持し、backToSearchResultsで検索結果コンテキストが
  // 外れてしまった場合に確実に復帰できるようにする（Escapeキーのみでは受信トレイに
  // 戻ってしまうことがあり、2件目以降が検索結果ではなく受信トレイ全体に対して
  // 処理されてしまう不具合の原因になっていた）
  private lastSearchUrl: string | null = null;

  constructor(private browserService: BrowserService) {}

  /**
   * Gmail内でメールを検索する
   * 検索ボックスのDOM要素はGmailのUI変更で頻繁にセレクタが変わり壊れやすいため、
   * GmailがサポートするURLハッシュ検索（#search/クエリ）へ直接遷移する方式を採用する
   * @param page - ページインスタンス
   * @param query - 検索クエリ（例: "from:rakuten"）
   * @returns 検索結果のメールリスト
   */
  async searchMails(page: Page, query: string): Promise<void> {
    try {
      console.log(`検索クエリ「${query}」でメールを検索しています...`);

      // 検索クエリはURLハッシュに含めるためエンコードが必要
      const searchUrl = `${this.GMAIL_URL}/mail/u/0/#search/${encodeURIComponent(query)}`;
      console.log('検索結果のURLへ遷移しています...');

      try {
        await this.navigateToSearchUrl(page, searchUrl);
      } catch (waitError) {
        // 検索結果・空結果表示のどちらも現れなかった場合、
        // インタースティシャル等で実際には検索できていない可能性が高い
        throw new Error(
          `検索結果の描画がタイムアウトしました。ログイン後の案内ページ等が表示されている可能性があります: ${waitError instanceof Error ? waitError.message : String(waitError)}`
        );
      }

      // フルロードしても何らかの理由でGmailが検索ビュー以外（受信トレイ等）へ
      // 戻された場合、行の存在だけでは検索結果と受信トレイを区別できず、
      // 誤って受信トレイ全体を処理してしまう危険があるため明示的に検証する
      this.assertOnSearchResultsHash(page, 'メール検索');

      // 「検索できたこと」の判定は行の有無でしか行えないため、実際に
      // from:rakuten等の検索結果になっているかをログから目視確認できるようにする
      await this.logSearchResultsPreview(page);

      // backToSearchResultsでEscapeキーが検索結果コンテキストを外してしまった場合に
      // 同じ検索へ再度遷移して復帰できるよう、成功した検索URLを保持しておく
      this.lastSearchUrl = searchUrl;

      console.log('検索が完了しました');
    } catch (error) {
      throw new Error(
        `メール検索に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 検索結果のURLへ遷移し、確実に検索ビューを描画させる。
   * ハッシュ部分のみが異なるURLへのgotoは同一ドキュメント内ナビゲーションとして扱われ、
   * Gmailが検索ビューへ切り替わらず受信トレイ表示のままになることがある。
   * そのためgoto後に明示的なreloadを行いフルロード（完全な再読み込み）を強制する。
   * storageStateによるログインセッションはブラウザコンテキストに保持されるため、
   * reloadしてもログイン状態は失われない。
   * searchMailsでの初回遷移と、backToSearchResultsでの検索結果コンテキスト復帰の
   * 両方から呼び出す共通ロジックのため切り出している。
   * @param page - ページインスタンス
   * @param searchUrl - 検索結果のURL（#search/クエリ を含む）
   */
  private async navigateToSearchUrl(page: Page, searchUrl: string): Promise<void> {
    await this.browserService.goto(page, searchUrl);

    // ハッシュ変更だけでは検索ビューへ切り替わらない場合があるため、
    // フルリロードして指定ハッシュの状態からページ全体を再構築させる
    await page.reload({ waitUntil: 'domcontentloaded' });

    // 実際に検索結果一覧（メール行）またはGmailの空結果表示がDOMに現れるまで待つことで、
    // ログイン後のインタースティシャル（案内／広告ページ）に隠れて
    // 検索結果が描画されないまま「成功」と誤判定する事態を防ぐ
    await this.waitForSearchResultsRendered(page);
  }

  /**
   * 現在のURLハッシュが検索結果（#search/）のままであることを確認する。
   * メール行のセレクタ（tr.zA等）は受信トレイの行とも共通のため、行の存在だけでは
   * 検索結果と受信トレイを区別できない。フルロード後にGmailが何らかの理由で
   * 検索ビュー以外へ遷移した場合、暗黙にフォールバックせず明示的にエラーとして扱う。
   * @param page - ページインスタンス
   * @param context - エラーメッセージに含める処理名
   */
  private assertOnSearchResultsHash(page: Page, context: string): void {
    const currentUrl = page.url();
    if (!currentUrl.includes('#search/')) {
      throw new Error(
        `${context}でGmailが検索ビューになっていません（現在のURL: ${currentUrl}）。受信トレイ全体を誤って処理する可能性があるため処理を中断します。`
      );
    }
  }

  /**
   * 検索結果一覧の先頭数件の差出人メールアドレスをログ出力する。
   * ログ上「検索が完了しました」と表示されていても、実際には検索結果ではなく
   * 受信トレイの内容だった、という誤判定を目視で確認できるようにするための診断用ログ。
   * 件名・本文抜粋は個人情報を含むため出力せず、差出人メールアドレスのみを対象とする。
   * @param page - ページインスタンス
   */
  private async logSearchResultsPreview(page: Page): Promise<void> {
    const previewSenders = await page.evaluate((selectors: string[]) => {
      // biome-ignore lint/suspicious/noExplicitAny: page.evaluate内ではdocumentが利用可能
      const doc = (globalThis as any).document;

      for (const selector of selectors) {
        const rows = doc.querySelectorAll(selector);
        if (rows.length > 0) {
          return Array.from(rows)
            .slice(0, 3)
            .map((row) => {
              // Gmailのメール行内では差出人要素にemail属性が付与されている
              // biome-ignore lint/suspicious/noExplicitAny: page.evaluate内でのDOM要素の型解決を簡略化するため
              const emailElement = (row as any).querySelector('[email]');
              return emailElement?.getAttribute('email') ?? '(差出人不明)';
            });
        }
      }

      return [];
    }, this.MAIL_ROW_SELECTORS);

    if (previewSenders.length === 0) {
      console.log('  検索結果プレビュー: 該当するメール行がありません（0件、または空結果表示）');
      return;
    }

    console.log('  検索結果プレビュー（差出人アドレス・先頭最大3件）:');
    for (const [idx, senderEmail] of previewSenders.entries()) {
      console.log(`    ${idx + 1}. ${senderEmail}`);
    }
  }

  /**
   * 検索結果一覧（メール行）またはGmailの空結果表示がDOMに現れるまで待機する。
   * searchMailsでの初回遷移直後と、backToSearchResultsで検索URLへ復帰した直後の
   * 両方から呼び出す共通ロジックのため切り出している。
   * @param page - ページインスタンス
   */
  private async waitForSearchResultsRendered(page: Page): Promise<void> {
    await page.waitForFunction(
      (selectors: string[]) => {
        // biome-ignore lint/suspicious/noExplicitAny: page.waitForFunction内ではdocumentが利用可能
        const doc = (globalThis as any).document;

        for (const selector of selectors) {
          if (doc.querySelectorAll(selector).length > 0) {
            return true;
          }
        }

        // Gmailの「該当するメールはありません」等の空結果表示（日英）
        const bodyText: string = doc.body?.innerText ?? '';
        return (
          bodyText.includes('見つかりませんでした') ||
          bodyText.includes('No messages matched your search')
        );
      },
      this.MAIL_ROW_SELECTORS,
      { timeout: 10000 }
    );
  }

  /**
   * 保存済みセッション（storageState）でGmailにアクセスした直後に、
   * 実際にログイン済みかどうかを検証する。
   * セッションが失効している場合、mail.google.comは受信トレイではなく
   * 未ログイン向けのマーケティング（Gmail紹介）ページへリダイレクトするため、
   * それを検知せずに後続処理（検索）へ進むと「成功したように見えて実際は
   * 何も処理していない」状態になってしまう。
   * @param page - ページインスタンス
   */
  async verifyLoggedIn(page: Page): Promise<void> {
    try {
      console.log('ログイン状態を検証しています...');

      if (!(await this.isLoggedIn(page))) {
        throw new Error(
          '保存済みセッション（auth.json）が失効しているため、Gmailにログインできていません。' +
            'ローカルで `auth.json` を削除して `HEADLESS=false npm start` を実行し再ログインしてください。' +
            'GitHub Actionsを使っている場合は再生成した認証情報で `AUTH_JSON_BASE64` シークレットを更新してください。'
        );
      }

      console.log('ログイン状態を確認しました（Gmail受信トレイにアクセス済み）');
    } catch (error) {
      throw new Error(
        `ログイン状態の検証に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 現在のページがGmail受信トレイ（ログイン済み状態）かどうかを判定する。
   * 受信トレイUIの有無・URL・マーケティングページ特有の文言の3つの兆候を組み合わせて判定する。
   * 単独の兆候のみで判定すると、一時的なDOM未描画や偶然の文言一致により誤判定するおそれがあるため。
   * @param page - ページインスタンス
   * @returns ログイン済みならtrue
   */
  private async isLoggedIn(page: Page): Promise<boolean> {
    const { hasGmailInboxUI, hasLoginPrompt } = await page.evaluate(() => {
      // biome-ignore lint/suspicious/noExplicitAny: page.evaluate内ではdocumentが利用可能
      const doc = (globalThis as any).document;

      // ログイン済みの兆候: Gmailアプリ本体の受信トレイUI（メイン領域）が存在する
      const hasGmailInboxUI = doc.querySelector('div[role="main"]') !== null;

      // 未ログインの兆候: マーケティングページに固有の文言
      // 「ログイン」等の汎用的な単語はGmailアプリ内（アカウント切替メニュー等）にも
      // 現れうるため誤検知の原因になる。紹介ページ特有の文言のみを採用する
      const bodyText: string = doc.body?.innerText ?? '';
      const hasLoginPrompt =
        bodyText.includes('アカウントを作成') || bodyText.includes('Create an account');

      return { hasGmailInboxUI, hasLoginPrompt };
    });

    const isGmailAppUrl = page.url().includes('mail.google.com/mail/');
    return hasGmailInboxUI && isGmailAppUrl && !hasLoginPrompt;
  }

  /**
   * ブラウザ上でのユーザーによる手動ログイン完了を待機する。
   * Googleは自動化を検知して2段階認証・reCAPTCHA・本人確認を挟むため、
   * ID/パスワードの自動入力によるログインは失敗しやすい。確実に認証状態を得るため、
   * ユーザーが手動でログインし受信トレイに到達したことを検知するまで待つ。
   * @param page - ページインスタンス
   * @param timeoutMs - 待機のタイムアウト（ミリ秒）
   */
  async waitForManualLogin(page: Page, timeoutMs = 300000): Promise<void> {
    console.log(
      '\n👤 ブラウザでGmailに手動ログインしてください（受信トレイの表示を検知するまで待機します）...\n'
    );

    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      try {
        if (await this.isLoggedIn(page)) {
          console.log('✅ ログインを検知しました');
          return;
        }
      } catch (error) {
        // isLoggedIn内部のpage.evaluateは、ユーザーのログイン操作によるページ遷移と
        // 実行タイミングが重なると「実行コンテキストが破棄された」例外を投げることがある。
        // これは「まだログインが完了していない」ことを意味する一時的な事象であり、
        // ループ全体にタイムアウトがあるため握りつぶして次のポーリングに委ねてよい。
        // ただし想定外のエラーまで無条件に隠さないよう、遷移由来と判断できる場合のみ許容する。
        if (this.isTransientNavigationError(error)) {
          console.log(
            '  ⏳ ページ遷移中のため判定をスキップしました。次のポーリングで再確認します...'
          );
        } else {
          throw error;
        }
      }
      // ログイン操作の完了をポーリングで待つ
      await page.waitForTimeout(3000);
    }

    throw new Error(
      `手動ログインの待機がタイムアウトしました（${Math.floor(timeoutMs / 1000)}秒）。ブラウザでログインを完了してから再度実行してください。`
    );
  }

  /**
   * ページ遷移・実行コンテキスト破棄に起因する一時的な例外かどうかを判定する。
   * これらはユーザー操作によるナビゲーション中に発生しうる正常な事象であり、
   * 「ログイン未完了」として扱ってポーリングを継続してよい。それ以外の例外は
   * 想定外の不具合を隠さないよう、呼び出し元へそのまま伝播させる。
   * @param error - 捕捉した例外
   * @returns 一時的なナビゲーション由来の例外ならtrue
   */
  private isTransientNavigationError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }

    const transientPatterns = [
      'Execution context was destroyed',
      'Cannot find context with specified id',
      'navigation',
    ];

    return transientPatterns.some((pattern) => error.message.includes(pattern));
  }

  /**
   * デバッグ用にスクリーンショットをdebug/フォルダへ保存する
   * ログだけでは「実際に検索できているか」を判別できないため、画面の実態を確認可能にする
   *
   * 現時点ではどこからも呼び出していない。スクリーンショットには件名等の個人情報が
   * 写り込む可能性があり常時保存する必要はないため呼び出しを止めたが、
   * 問題発生時に調査しやすくするため関数自体は残してある。再度必要になった箇所から呼び出すこと。
   * （現時点では未使用。tscのnoUnusedLocalsは未使用のprivateメンバーを検出するため、
   * 呼び出しを再追加したときにビルドが壊れないよう、あえてpublicメソッドとして残している）
   * @param page - ページインスタンス
   * @param prefix - ファイル名のプレフィックス
   */
  async saveDebugScreenshot(page: Page, prefix: string): Promise<void> {
    try {
      const debugDir = './debug';
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `${prefix}_${timestamp}.png`;
      const filePath = path.join(debugDir, fileName);

      await page.screenshot({ path: filePath });
      console.log(`  💾 デバッグスクリーンショットを保存しました: ${fileName}`);
    } catch (error) {
      // スクリーンショット保存に失敗しても本処理には影響させない
      console.log(
        `  ⚠️ デバッグスクリーンショットの保存に失敗: ${error instanceof Error ? error.message : String(error)}`
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

      const count = await page.evaluate((selectors: string[]) => {
        // biome-ignore lint/suspicious/noExplicitAny: page.evaluate内ではdocumentが利用可能
        const doc = (globalThis as any).document;

        // 複数のセレクタパターンでメール行を探す
        for (const selector of selectors) {
          const rows = doc.querySelectorAll(selector);
          if (rows.length > 0) {
            return rows.length;
          }
        }

        return 0;
      }, this.MAIL_ROW_SELECTORS);

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
      const clicked = await page.evaluate(
        ({ idx, selectors }: { idx: number; selectors: string[] }) => {
          // biome-ignore lint/suspicious/noExplicitAny: page.evaluate内ではdocumentが利用可能
          const doc = (globalThis as any).document;

          for (const selector of selectors) {
            const rows = doc.querySelectorAll(selector);
            if (rows.length > idx) {
              rows[idx].click();
              return true;
            }
          }

          return false;
        },
        { idx: index, selectors: this.MAIL_ROW_SELECTORS }
      );

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
   * Escapeキーだけではメール詳細を閉じた後にGmailが受信トレイ（#inbox等）へ
   * 遷移してしまうことがあり、その場合2件目以降が検索結果ではなく受信トレイ全体に
   * 対して処理されてしまう（index.tsのskippedCountによるインデックス調整の前提が崩れる）。
   * そのため、Escape後のURLハッシュが検索結果（#search/...）から外れていた場合のみ、
   * searchMailsで保持しておいた検索URLへ明示的に復帰する。
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

      const currentUrl = page.url();
      const isOnSearchResults = currentUrl.includes('#search/');
      console.log(`  現在のURL: ${currentUrl}`);

      if (!isOnSearchResults) {
        if (!this.lastSearchUrl) {
          // searchMailsを経由せずbackToSearchResultsが呼ばれた場合は、
          // 復帰先の検索URLが存在せず正しい状態に戻せないため、フォールバックせず失敗させる
          throw new Error(
            '検索結果のURLが保持されていないため復帰できません。先にsearchMailsを実行してください。'
          );
        }

        console.log(
          `  ⚠️ 検索結果コンテキストが外れていました。検索結果URLへ復帰します: ${this.lastSearchUrl}`
        );
        await this.navigateToSearchUrl(page, this.lastSearchUrl);

        // 復帰処理を行った後も検索ビューになっていない場合、受信トレイ全体を
        // 誤って処理してしまう危険があるため明示的に検証する
        this.assertOnSearchResultsHash(page, '検索結果一覧への復帰');
      }

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
}
