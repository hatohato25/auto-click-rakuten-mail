import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BrowserService } from '../../src/services/browser.js';
import { chromium } from 'playwright';
import type { Browser, Page, BrowserContext } from 'playwright';

// playwrightモジュールをモック化
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn(),
  },
}));

describe('BrowserService', () => {
  let browserService: BrowserService;

  beforeEach(() => {
    browserService = new BrowserService();
    vi.clearAllMocks();
  });

  describe('launch', () => {
    it('デフォルトオプションでブラウザを起動できる', async () => {
      const mockBrowser = {} as Browser;
      vi.mocked(chromium.launch).mockResolvedValue(mockBrowser);

      const browser = await browserService.launch();

      expect(chromium.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          headless: true,
          args: expect.arrayContaining([
            '--disable-blink-features=AutomationControlled',
            '--disable-dev-shm-usage',
          ]),
        })
      );
      expect(browser).toBe(mockBrowser);
    });

    it('headlessオプションを指定してブラウザを起動できる', async () => {
      const mockBrowser = {} as Browser;
      vi.mocked(chromium.launch).mockResolvedValue(mockBrowser);

      await browserService.launch({ headless: false });

      expect(chromium.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          headless: false,
        })
      );
    });

    it('slowMoオプションを指定してブラウザを起動できる', async () => {
      const mockBrowser = {} as Browser;
      vi.mocked(chromium.launch).mockResolvedValue(mockBrowser);

      await browserService.launch({ headless: true, slowMo: 100 });

      expect(chromium.launch).toHaveBeenCalledWith(
        expect.objectContaining({
          slowMo: 100,
        })
      );
    });

    it('ブラウザ起動に失敗した場合、エラーをスローする', async () => {
      vi.mocked(chromium.launch).mockRejectedValue(new Error('Launch failed'));

      await expect(browserService.launch()).rejects.toThrow('ブラウザの起動に失敗しました');
    });
  });

  describe('newPage', () => {
    it('新しいページを作成できる', async () => {
      const mockPage = {
        addInitScript: vi.fn().mockResolvedValue(undefined),
      } as unknown as Page;

      const mockContext = {
        newPage: vi.fn().mockResolvedValue(mockPage),
      } as unknown as BrowserContext;

      const mockBrowser = {
        newContext: vi.fn().mockResolvedValue(mockContext),
      } as unknown as Browser;

      const result = await browserService.newPage(mockBrowser);

      expect(mockBrowser.newContext).toHaveBeenCalledWith(
        expect.objectContaining({
          userAgent: expect.stringContaining('Mozilla'),
          viewport: { width: 1280, height: 720 },
          javaScriptEnabled: true,
        })
      );
      expect(mockContext.newPage).toHaveBeenCalled();
      expect(mockPage.addInitScript).toHaveBeenCalled();
      expect(result.page).toBe(mockPage);
      expect(result.context).toBe(mockContext);
    });

    it('storageStateファイルが存在する場合は読み込む', async () => {
      const mockPage = {
        addInitScript: vi.fn().mockResolvedValue(undefined),
      } as unknown as Page;

      const mockContext = {
        newPage: vi.fn().mockResolvedValue(mockPage),
      } as unknown as BrowserContext;

      const mockBrowser = {
        newContext: vi.fn().mockResolvedValue(mockContext),
      } as unknown as Browser;

      const result = await browserService.newPage(mockBrowser, './auth.json');

      expect(mockBrowser.newContext).toHaveBeenCalled();
      expect(result.page).toBe(mockPage);
      expect(result.context).toBe(mockContext);
    });

    it('ページ作成に失敗した場合、エラーをスローする', async () => {
      const mockBrowser = {
        newContext: vi.fn().mockRejectedValue(new Error('Context creation failed')),
      } as unknown as Browser;

      await expect(browserService.newPage(mockBrowser)).rejects.toThrow(
        '新しいページの作成に失敗しました'
      );
    });
  });

  describe('goto', () => {
    it('指定されたURLにページを遷移できる', async () => {
      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
      } as unknown as Page;

      await browserService.goto(mockPage, 'https://example.com');

      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          waitUntil: 'domcontentloaded',
          timeout: 30000,
        })
      );
    });

    it('カスタムタイムアウトを指定してページを遷移できる', async () => {
      const mockPage = {
        goto: vi.fn().mockResolvedValue(undefined),
      } as unknown as Page;

      await browserService.goto(mockPage, 'https://example.com', 60000);

      expect(mockPage.goto).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          timeout: 60000,
        })
      );
    });

    it('ページ遷移に失敗した場合、エラーをスローする', async () => {
      const mockPage = {
        goto: vi.fn().mockRejectedValue(new Error('Navigation failed')),
      } as unknown as Page;

      await expect(browserService.goto(mockPage, 'https://example.com')).rejects.toThrow(
        'URL「https://example.com」への遷移に失敗しました'
      );
    });
  });

  describe('waitForSelector', () => {
    it('要素が表示されるまで待機できる', async () => {
      const mockPage = {
        waitForSelector: vi.fn().mockResolvedValue(undefined),
      } as unknown as Page;

      await browserService.waitForSelector(mockPage, '#test-selector');

      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        '#test-selector',
        expect.objectContaining({
          state: 'visible',
          timeout: 30000,
        })
      );
    });

    it('カスタムタイムアウトを指定して待機できる', async () => {
      const mockPage = {
        waitForSelector: vi.fn().mockResolvedValue(undefined),
      } as unknown as Page;

      await browserService.waitForSelector(mockPage, '#test-selector', 5000);

      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        '#test-selector',
        expect.objectContaining({
          timeout: 5000,
        })
      );
    });

    it('要素待機がタイムアウトした場合、エラーをスローする', async () => {
      const mockPage = {
        waitForSelector: vi.fn().mockRejectedValue(new Error('Timeout')),
      } as unknown as Page;

      await expect(browserService.waitForSelector(mockPage, '#test-selector')).rejects.toThrow(
        '要素「#test-selector」の表示待機がタイムアウトしました'
      );
    });
  });

  describe('click', () => {
    it('要素をクリックできる', async () => {
      const mockPage = {
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        click: vi.fn().mockResolvedValue(undefined),
      } as unknown as Page;

      await browserService.click(mockPage, '#button');

      expect(mockPage.waitForSelector).toHaveBeenCalledWith(
        '#button',
        expect.objectContaining({
          state: 'visible',
        })
      );
      expect(mockPage.click).toHaveBeenCalledWith('#button');
    });

    it('クリックに失敗した場合、エラーをスローする', async () => {
      const mockPage = {
        waitForSelector: vi.fn().mockResolvedValue(undefined),
        click: vi.fn().mockRejectedValue(new Error('Click failed')),
      } as unknown as Page;

      await expect(browserService.click(mockPage, '#button')).rejects.toThrow(
        '要素「#button」のクリックに失敗しました'
      );
    });
  });

  describe('close', () => {
    it('ブラウザを終了できる', async () => {
      const mockBrowser = {
        close: vi.fn().mockResolvedValue(undefined),
      } as unknown as Browser;

      await browserService.close(mockBrowser);

      expect(mockBrowser.close).toHaveBeenCalled();
    });

    it('ブラウザ終了に失敗した場合、エラーをスローする', async () => {
      const mockBrowser = {
        close: vi.fn().mockRejectedValue(new Error('Close failed')),
      } as unknown as Browser;

      await expect(browserService.close(mockBrowser)).rejects.toThrow(
        'ブラウザの終了に失敗しました'
      );
    });
  });
});
