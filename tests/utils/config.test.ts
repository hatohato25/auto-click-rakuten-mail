import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../src/utils/config.js';

describe('loadConfig', () => {
  // 環境変数を保存・復元するため
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // 各テスト前に環境変数を保存
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // 各テスト後に環境変数を復元
    process.env = originalEnv;
  });

  it('必須の環境変数がすべて設定されている場合、設定オブジェクトを返す', () => {
    // 必須環境変数を設定
    process.env.GMAIL_EMAIL = 'test@example.com';
    process.env.GMAIL_PASSWORD = 'test-password';
    process.env.RAKUTEN_USER_ID = 'test-rakuten-id';
    process.env.RAKUTEN_PASSWORD = 'test-rakuten-password';

    const config = loadConfig();

    expect(config.email).toBe('test@example.com');
    expect(config.password).toBe('test-password');
    expect(config.rakutenUserId).toBe('test-rakuten-id');
    expect(config.rakutenPassword).toBe('test-rakuten-password');
  });

  it('GMAIL_EMAILが設定されていない場合、エラーをスローする', () => {
    process.env.GMAIL_EMAIL = undefined;
    process.env.GMAIL_PASSWORD = 'test-password';
    process.env.RAKUTEN_USER_ID = 'test-rakuten-id';
    process.env.RAKUTEN_PASSWORD = 'test-rakuten-password';

    expect(() => loadConfig()).toThrow('環境変数GMAIL_EMAILが設定されていません');
  });

  it('GMAIL_PASSWORDが設定されていない場合、エラーをスローする', () => {
    process.env.GMAIL_EMAIL = 'test@example.com';
    process.env.GMAIL_PASSWORD = undefined;
    process.env.RAKUTEN_USER_ID = 'test-rakuten-id';
    process.env.RAKUTEN_PASSWORD = 'test-rakuten-password';

    expect(() => loadConfig()).toThrow('環境変数GMAIL_PASSWORDが設定されていません');
  });

  it('RAKUTEN_USER_IDが設定されていない場合、エラーをスローする', () => {
    process.env.GMAIL_EMAIL = 'test@example.com';
    process.env.GMAIL_PASSWORD = 'test-password';
    process.env.RAKUTEN_USER_ID = undefined;
    process.env.RAKUTEN_PASSWORD = 'test-rakuten-password';

    expect(() => loadConfig()).toThrow('環境変数RAKUTEN_USER_IDが設定されていません');
  });

  it('RAKUTEN_PASSWORDが設定されていない場合、エラーをスローする', () => {
    process.env.GMAIL_EMAIL = 'test@example.com';
    process.env.GMAIL_PASSWORD = 'test-password';
    process.env.RAKUTEN_USER_ID = 'test-rakuten-id';
    process.env.RAKUTEN_PASSWORD = undefined;

    expect(() => loadConfig()).toThrow('環境変数RAKUTEN_PASSWORDが設定されていません');
  });

  it('SEARCH_QUERYが設定されていない場合、デフォルト値を使用する', () => {
    process.env.GMAIL_EMAIL = 'test@example.com';
    process.env.GMAIL_PASSWORD = 'test-password';
    process.env.RAKUTEN_USER_ID = 'test-rakuten-id';
    process.env.RAKUTEN_PASSWORD = 'test-rakuten-password';
    process.env.SEARCH_QUERY = undefined;

    const config = loadConfig();

    expect(config.searchQuery).toBe('from:rakuten');
  });

  it('SEARCH_QUERYが設定されている場合、その値を使用する', () => {
    process.env.GMAIL_EMAIL = 'test@example.com';
    process.env.GMAIL_PASSWORD = 'test-password';
    process.env.RAKUTEN_USER_ID = 'test-rakuten-id';
    process.env.RAKUTEN_PASSWORD = 'test-rakuten-password';
    process.env.SEARCH_QUERY = 'from:rakuten is:unread';

    const config = loadConfig();

    expect(config.searchQuery).toBe('from:rakuten is:unread');
  });

  it('HEADLESSがtrueの場合、headlessがtrueになる', () => {
    process.env.GMAIL_EMAIL = 'test@example.com';
    process.env.GMAIL_PASSWORD = 'test-password';
    process.env.RAKUTEN_USER_ID = 'test-rakuten-id';
    process.env.RAKUTEN_PASSWORD = 'test-rakuten-password';
    process.env.HEADLESS = 'true';

    const config = loadConfig();

    expect(config.headless).toBe(true);
  });

  it('HEADLESSがfalseまたは未設定の場合、headlessがfalseになる', () => {
    process.env.GMAIL_EMAIL = 'test@example.com';
    process.env.GMAIL_PASSWORD = 'test-password';
    process.env.RAKUTEN_USER_ID = 'test-rakuten-id';
    process.env.RAKUTEN_PASSWORD = 'test-rakuten-password';
    process.env.HEADLESS = 'false';

    const config = loadConfig();

    expect(config.headless).toBe(false);
  });

  it('TIMEOUTが設定されていない場合、デフォルト値30000を使用する', () => {
    process.env.GMAIL_EMAIL = 'test@example.com';
    process.env.GMAIL_PASSWORD = 'test-password';
    process.env.RAKUTEN_USER_ID = 'test-rakuten-id';
    process.env.RAKUTEN_PASSWORD = 'test-rakuten-password';
    process.env.TIMEOUT = undefined;

    const config = loadConfig();

    expect(config.timeout).toBe(30000);
  });

  it('TIMEOUTが設定されている場合、その値を使用する', () => {
    process.env.GMAIL_EMAIL = 'test@example.com';
    process.env.GMAIL_PASSWORD = 'test-password';
    process.env.RAKUTEN_USER_ID = 'test-rakuten-id';
    process.env.RAKUTEN_PASSWORD = 'test-rakuten-password';
    process.env.TIMEOUT = '60000';

    const config = loadConfig();

    expect(config.timeout).toBe(60000);
  });

  it('IMAGE_MATCH_THRESHOLDが設定されていない場合、デフォルト値0.8を使用する', () => {
    process.env.GMAIL_EMAIL = 'test@example.com';
    process.env.GMAIL_PASSWORD = 'test-password';
    process.env.RAKUTEN_USER_ID = 'test-rakuten-id';
    process.env.RAKUTEN_PASSWORD = 'test-rakuten-password';
    process.env.IMAGE_MATCH_THRESHOLD = undefined;

    const config = loadConfig();

    expect(config.imageMatchThreshold).toBe(0.8);
  });

  it('IMAGE_MATCH_THRESHOLDが設定されている場合、その値を使用する', () => {
    process.env.GMAIL_EMAIL = 'test@example.com';
    process.env.GMAIL_PASSWORD = 'test-password';
    process.env.RAKUTEN_USER_ID = 'test-rakuten-id';
    process.env.RAKUTEN_PASSWORD = 'test-rakuten-password';
    process.env.IMAGE_MATCH_THRESHOLD = '0.75';

    const config = loadConfig();

    expect(config.imageMatchThreshold).toBe(0.75);
  });

  it('PIXEL_MATCH_THRESHOLDが設定されていない場合、デフォルト値0.1を使用する', () => {
    process.env.GMAIL_EMAIL = 'test@example.com';
    process.env.GMAIL_PASSWORD = 'test-password';
    process.env.RAKUTEN_USER_ID = 'test-rakuten-id';
    process.env.RAKUTEN_PASSWORD = 'test-rakuten-password';
    process.env.PIXEL_MATCH_THRESHOLD = undefined;

    const config = loadConfig();

    expect(config.pixelMatchThreshold).toBe(0.1);
  });

  it('PIXEL_MATCH_THRESHOLDが設定されている場合、その値を使用する', () => {
    process.env.GMAIL_EMAIL = 'test@example.com';
    process.env.GMAIL_PASSWORD = 'test-password';
    process.env.RAKUTEN_USER_ID = 'test-rakuten-id';
    process.env.RAKUTEN_PASSWORD = 'test-rakuten-password';
    process.env.PIXEL_MATCH_THRESHOLD = '0.15';

    const config = loadConfig();

    expect(config.pixelMatchThreshold).toBe(0.15);
  });

  it('IMAGES_DIRが設定されていない場合、デフォルト値./imagesを使用する', () => {
    process.env.GMAIL_EMAIL = 'test@example.com';
    process.env.GMAIL_PASSWORD = 'test-password';
    process.env.RAKUTEN_USER_ID = 'test-rakuten-id';
    process.env.RAKUTEN_PASSWORD = 'test-rakuten-password';
    process.env.IMAGES_DIR = undefined;

    const config = loadConfig();

    expect(config.imagesDir).toBe('./images');
  });

  it('IMAGES_DIRが設定されている場合、その値を使用する', () => {
    process.env.GMAIL_EMAIL = 'test@example.com';
    process.env.GMAIL_PASSWORD = 'test-password';
    process.env.RAKUTEN_USER_ID = 'test-rakuten-id';
    process.env.RAKUTEN_PASSWORD = 'test-rakuten-password';
    process.env.IMAGES_DIR = './custom-images';

    const config = loadConfig();

    expect(config.imagesDir).toBe('./custom-images');
  });

  it('STORAGE_STATE_PATHが設定されていない場合、デフォルト値./auth.jsonを使用する', () => {
    process.env.GMAIL_EMAIL = 'test@example.com';
    process.env.GMAIL_PASSWORD = 'test-password';
    process.env.RAKUTEN_USER_ID = 'test-rakuten-id';
    process.env.RAKUTEN_PASSWORD = 'test-rakuten-password';
    process.env.STORAGE_STATE_PATH = undefined;

    const config = loadConfig();

    expect(config.storageStatePath).toBe('./auth.json');
  });

  it('STORAGE_STATE_PATHが設定されている場合、その値を使用する', () => {
    process.env.GMAIL_EMAIL = 'test@example.com';
    process.env.GMAIL_PASSWORD = 'test-password';
    process.env.RAKUTEN_USER_ID = 'test-rakuten-id';
    process.env.RAKUTEN_PASSWORD = 'test-rakuten-password';
    process.env.STORAGE_STATE_PATH = './custom-auth.json';

    const config = loadConfig();

    expect(config.storageStatePath).toBe('./custom-auth.json');
  });
});
