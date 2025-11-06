import { config as dotenvConfig } from 'dotenv';
import type { Config } from '../types/index.js';

// .envファイルを読み込む
dotenvConfig();

/**
 * 環境変数から設定を読み込む
 * @returns 設定オブジェクト
 * @throws 必須の環境変数が設定されていない場合
 */
export function loadConfig(): Config {
  const email = process.env.GMAIL_EMAIL;
  const password = process.env.GMAIL_PASSWORD;
  const searchQuery = process.env.SEARCH_QUERY || 'from:rakuten';
  const headless = process.env.HEADLESS === 'true';
  const timeout = Number.parseInt(process.env.TIMEOUT || '30000', 10);
  const imageMatchThreshold = Number.parseFloat(process.env.IMAGE_MATCH_THRESHOLD || '0.8');
  const pixelMatchThreshold = Number.parseFloat(process.env.PIXEL_MATCH_THRESHOLD || '0.1');
  const imagesDir = process.env.IMAGES_DIR || './images';
  const rakutenUserId = process.env.RAKUTEN_USER_ID || '';
  const rakutenPassword = process.env.RAKUTEN_PASSWORD || '';
  const storageStatePath = process.env.STORAGE_STATE_PATH || './auth.json';

  // 必須項目のバリデーション
  if (!email) {
    throw new Error('環境変数GMAIL_EMAILが設定されていません');
  }

  if (!password) {
    throw new Error('環境変数GMAIL_PASSWORDが設定されていません');
  }

  if (!rakutenUserId) {
    throw new Error('環境変数RAKUTEN_USER_IDが設定されていません');
  }

  if (!rakutenPassword) {
    throw new Error('環境変数RAKUTEN_PASSWORDが設定されていません');
  }

  return {
    email,
    password,
    searchQuery,
    headless,
    timeout,
    imageMatchThreshold,
    pixelMatchThreshold,
    imagesDir,
    rakutenUserId,
    rakutenPassword,
    storageStatePath,
  };
}
