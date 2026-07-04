import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GmailService } from '../../src/services/gmail.js';
import type { BrowserService } from '../../src/services/browser.js';
import type { Page } from 'playwright';
import fs from 'node:fs';

// fsモジュールをモック化（デバッグスクリーンショット保存の検証用）
vi.mock('node:fs');

describe('GmailService', () => {
  let gmailService: GmailService;
  let mockBrowserService: BrowserService;

  beforeEach(() => {
    // searchMailsはbrowserService.gotoのみを使用するため、必要なメソッドのみモック化
    mockBrowserService = {
      goto: vi.fn().mockResolvedValue(undefined),
    } as unknown as BrowserService;

    gmailService = new GmailService(mockBrowserService);

    vi.clearAllMocks();
    vi.mocked(fs.existsSync).mockReturnValue(true);
  });

  describe('searchMails', () => {
    it('検索結果（メール行）が描画されたら成功し、デバッグスクリーンショットを保存する', async () => {
      const mockPage = {
        reload: vi.fn().mockResolvedValue(undefined),
        waitForFunction: vi.fn().mockResolvedValue(undefined),
        // フルロード後もハッシュが検索結果のままであることの検証に使用
        url: vi.fn().mockReturnValue('https://mail.google.com/mail/u/0/#search/from%3Arakuten'),
        evaluate: vi.fn().mockResolvedValue(['楽天市場 差出人A 件名A']),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('')),
      } as unknown as Page;

      await gmailService.searchMails(mockPage, 'from:rakuten');

      expect(mockBrowserService.goto).toHaveBeenCalledWith(
        mockPage,
        expect.stringContaining('#search/')
      );
      // ハッシュ変更だけの同一ドキュメント内遷移では検索ビューへ切り替わらないことがあるため、
      // 必ずフルリロードして描画を強制すること
      expect(mockPage.reload).toHaveBeenCalledWith({ waitUntil: 'domcontentloaded' });
      // ハッシュを確認するだけの無意味な待機ではなく、実際の描画完了を待つこと
      expect(mockPage.waitForFunction).toHaveBeenCalledTimes(1);
      // 検索成功時も実態を確認できるようスクリーンショットを保存すること
      expect(mockPage.screenshot).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining('debug/search_result_'),
        })
      );
    });

    it('検索結果も空結果表示も現れずタイムアウトした場合、デバッグスクリーンショットを保存しエラーをスローする', async () => {
      const mockPage = {
        reload: vi.fn().mockResolvedValue(undefined),
        waitForFunction: vi.fn().mockRejectedValue(new Error('Timeout 10000ms exceeded')),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('')),
      } as unknown as Page;

      // インタースティシャル等で検索結果が描画されない状況を想定
      await expect(gmailService.searchMails(mockPage, 'from:rakuten')).rejects.toThrow(
        '検索結果の描画がタイムアウトしました'
      );

      // ユーザーが「広告ページの正体」を確認できるよう、失敗時も画面を記録すること
      expect(mockPage.screenshot).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining('debug/search_result_timeout_'),
        })
      );
    });

    it('フルロード後もURLハッシュが検索結果（#search/）でない場合、明示的にエラーをスローする', async () => {
      const mockPage = {
        reload: vi.fn().mockResolvedValue(undefined),
        waitForFunction: vi.fn().mockResolvedValue(undefined),
        // 検索結果と共通のセレクタを持つ受信トレイへ戻されてしまった状況を再現
        url: vi.fn().mockReturnValue('https://mail.google.com/mail/u/0/#inbox'),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('')),
      } as unknown as Page;

      await expect(gmailService.searchMails(mockPage, 'from:rakuten')).rejects.toThrow(
        'Gmailが検索ビューになっていません'
      );
    });

    it('debug/フォルダが存在しない場合は作成してからスクリーンショットを保存する', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      const mockPage = {
        reload: vi.fn().mockResolvedValue(undefined),
        waitForFunction: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://mail.google.com/mail/u/0/#search/from%3Arakuten'),
        evaluate: vi.fn().mockResolvedValue([]),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('')),
      } as unknown as Page;

      await gmailService.searchMails(mockPage, 'from:rakuten');

      expect(fs.mkdirSync).toHaveBeenCalledWith('./debug', { recursive: true });
    });
  });

  describe('getMailCount', () => {
    it('メール行のセレクタで件数を取得する', async () => {
      const mockPage = {
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue(3),
      } as unknown as Page;

      const count = await gmailService.getMailCount(mockPage);

      expect(count).toBe(3);
      expect(mockPage.evaluate).toHaveBeenCalledWith(
        expect.any(Function),
        expect.arrayContaining(['tr.zA'])
      );
    });
  });

  describe('verifyLoggedIn', () => {
    it('受信トレイUIが存在しGmailアプリのURLの場合、ログイン済みと判定する', async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue({ hasGmailInboxUI: true, hasLoginPrompt: false }),
        url: vi.fn().mockReturnValue('https://mail.google.com/mail/u/0/#search/from%3Arakuten'),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('')),
      } as unknown as Page;

      await expect(gmailService.verifyLoggedIn(mockPage)).resolves.toBeUndefined();
      expect(mockPage.screenshot).not.toHaveBeenCalled();
    });

    it('マーケティングページ特有の文言が含まれる場合、失効を検知しエラーをスローする', async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue({ hasGmailInboxUI: false, hasLoginPrompt: true }),
        url: vi.fn().mockReturnValue('https://mail.google.com/'),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('')),
      } as unknown as Page;

      await expect(gmailService.verifyLoggedIn(mockPage)).rejects.toThrow(
        '保存済みセッション（auth.json）が失効しているため'
      );

      // 実態を目視確認できるようスクリーンショットを保存すること
      expect(mockPage.screenshot).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining('debug/not_logged_in_'),
        })
      );
    });

    it('受信トレイUIが存在してもURLがGmailアプリ本体でない場合、エラーをスローする', async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue({ hasGmailInboxUI: true, hasLoginPrompt: false }),
        url: vi.fn().mockReturnValue('https://mail.google.com/intl/ja/mail/help/about.html'),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('')),
      } as unknown as Page;

      await expect(gmailService.verifyLoggedIn(mockPage)).rejects.toThrow(
        '保存済みセッション（auth.json）が失効しているため'
      );
    });
  });

  describe('waitForManualLogin', () => {
    it('ページ遷移由来の一時的な例外はログイン未完了として扱い、ポーリングを継続する', async () => {
      const evaluate = vi
        .fn()
        .mockRejectedValueOnce(
          new Error('Execution context was destroyed, most likely because of a navigation')
        )
        .mockResolvedValueOnce({ hasGmailInboxUI: true, hasLoginPrompt: false });

      const mockPage = {
        evaluate,
        url: vi.fn().mockReturnValue('https://mail.google.com/mail/u/0/#inbox'),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
      } as unknown as Page;

      await expect(gmailService.waitForManualLogin(mockPage, 10000)).resolves.toBeUndefined();
      expect(evaluate).toHaveBeenCalledTimes(2);
    });

    it('想定外の例外はそのままスローする', async () => {
      const evaluate = vi.fn().mockRejectedValue(new Error('予期しないエラー'));

      const mockPage = {
        evaluate,
        url: vi.fn().mockReturnValue('https://mail.google.com/mail/u/0/#inbox'),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
      } as unknown as Page;

      await expect(gmailService.waitForManualLogin(mockPage, 10000)).rejects.toThrow(
        '予期しないエラー'
      );
    });

    it('タイムアウトした場合、デバッグスクリーンショットを保存しエラーをスローする', async () => {
      const mockPage = {
        evaluate: vi.fn().mockResolvedValue({ hasGmailInboxUI: false, hasLoginPrompt: false }),
        url: vi.fn().mockReturnValue('https://accounts.google.com/'),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('')),
      } as unknown as Page;

      await expect(gmailService.waitForManualLogin(mockPage, 1)).rejects.toThrow(
        '手動ログインの待機がタイムアウトしました'
      );
      expect(mockPage.screenshot).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining('debug/manual_login_timeout_'),
        })
      );
    });
  });

  describe('openMailByIndex', () => {
    it('指定インデックスのメールが見つからない場合、エラーをスローする', async () => {
      const mockPage = {
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue(false),
      } as unknown as Page;

      await expect(gmailService.openMailByIndex(mockPage, 0)).rejects.toThrow(
        'メールを開くことに失敗しました'
      );
    });
  });

  describe('backToSearchResults', () => {
    it('Escape後も検索結果コンテキスト（#search/）に留まっている場合、検索URLへの復帰は行わない', async () => {
      const mockPage = {
        keyboard: { press: vi.fn().mockResolvedValue(undefined) },
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://mail.google.com/mail/u/0/#search/from%3Arakuten'),
      } as unknown as Page;

      await gmailService.backToSearchResults(mockPage);

      expect(mockPage.keyboard.press).toHaveBeenCalledWith('Escape');
      expect(mockBrowserService.goto).not.toHaveBeenCalled();
    });

    it('Escape後に検索結果コンテキストが外れていた場合、保持していた検索URLへ復帰する', async () => {
      const searchMailPage = {
        reload: vi.fn().mockResolvedValue(undefined),
        waitForFunction: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://mail.google.com/mail/u/0/#search/from%3Arakuten'),
        evaluate: vi.fn().mockResolvedValue([]),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('')),
      } as unknown as Page;
      // 事前にsearchMailsを実行し、復帰先の検索URLを保持させておく
      await gmailService.searchMails(searchMailPage, 'from:rakuten');
      vi.clearAllMocks();

      const mockPage = {
        keyboard: { press: vi.fn().mockResolvedValue(undefined) },
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        waitForFunction: vi.fn().mockResolvedValue(undefined),
        reload: vi.fn().mockResolvedValue(undefined),
        // Escape直後は受信トレイ（#inbox）に遷移してしまった状況を再現し、
        // navigateToSearchUrlによる復帰後は検索結果URLに戻っていることを再現する
        url: vi
          .fn()
          .mockReturnValueOnce('https://mail.google.com/mail/u/0/#inbox')
          .mockReturnValue('https://mail.google.com/mail/u/0/#search/from%3Arakuten'),
      } as unknown as Page;

      await gmailService.backToSearchResults(mockPage);

      expect(mockBrowserService.goto).toHaveBeenCalledWith(
        mockPage,
        expect.stringContaining('#search/from%3Arakuten')
      );
      // 復帰時もフルリロードして検索ビューを確実に描画させること
      expect(mockPage.reload).toHaveBeenCalledWith({ waitUntil: 'domcontentloaded' });
      expect(mockPage.waitForFunction).toHaveBeenCalledTimes(1);
    });

    it('searchMailsを実行しないまま検索結果コンテキストが外れた場合、復帰できずエラーをスローする', async () => {
      const mockPage = {
        keyboard: { press: vi.fn().mockResolvedValue(undefined) },
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        url: vi.fn().mockReturnValue('https://mail.google.com/mail/u/0/#inbox'),
      } as unknown as Page;

      await expect(gmailService.backToSearchResults(mockPage)).rejects.toThrow(
        '検索結果一覧に戻ることに失敗しました'
      );
      expect(mockBrowserService.goto).not.toHaveBeenCalled();
    });
  });
});
