/**
 * メールアイテムの型定義
 */
export interface MailItem {
  id: string;
  subject: string;
  sender: string;
  date: Date;
  isRead: boolean;
}

/**
 * 処理結果サマリーの型定義
 */
export interface ProcessSummary {
  totalMails: number;
  processedMails: number;
  clickedLinks: number;
  markedAsUnread: number;
  errors: number;
  startTime: Date;
  endTime: Date;
}

/**
 * 設定オプションの型定義
 */
export interface Config {
  email: string;
  password: string;
  searchQuery: string;
  headless: boolean;
  timeout: number;
  imageMatchThreshold: number;
  pixelMatchThreshold: number;
  imagesDir: string;
  rakutenUserId: string;
  rakutenPassword: string;
  storageStatePath: string;
}

/**
 * ブラウザオプションの型定義
 */
export interface BrowserOptions {
  headless: boolean;
  slowMo?: number;
  storageStatePath?: string;
}
