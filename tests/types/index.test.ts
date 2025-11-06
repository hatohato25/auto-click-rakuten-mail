import { describe, it, expect } from 'vitest';
import type { MailItem, ProcessSummary, Config, BrowserOptions } from '../../src/types/index.js';

describe('Type Definitions', () => {
  describe('MailItem', () => {
    it('MailItem型のオブジェクトを作成できる', () => {
      const mailItem: MailItem = {
        id: '12345',
        subject: 'Test Subject',
        sender: 'test@example.com',
        date: new Date('2025-01-15'),
        isRead: false,
      };

      expect(mailItem.id).toBe('12345');
      expect(mailItem.subject).toBe('Test Subject');
      expect(mailItem.sender).toBe('test@example.com');
      expect(mailItem.date).toBeInstanceOf(Date);
      expect(mailItem.isRead).toBe(false);
    });
  });

  describe('ProcessSummary', () => {
    it('ProcessSummary型のオブジェクトを作成できる', () => {
      const summary: ProcessSummary = {
        totalMails: 10,
        processedMails: 8,
        clickedLinks: 5,
        markedAsUnread: 3,
        errors: 0,
        startTime: new Date('2025-01-15T10:00:00'),
        endTime: new Date('2025-01-15T10:30:00'),
      };

      expect(summary.totalMails).toBe(10);
      expect(summary.processedMails).toBe(8);
      expect(summary.clickedLinks).toBe(5);
      expect(summary.markedAsUnread).toBe(3);
      expect(summary.errors).toBe(0);
      expect(summary.startTime).toBeInstanceOf(Date);
      expect(summary.endTime).toBeInstanceOf(Date);
    });
  });

  describe('Config', () => {
    it('Config型のオブジェクトを作成できる', () => {
      const config: Config = {
        email: 'test@example.com',
        password: 'test-password',
        searchQuery: 'from:rakuten',
        headless: false,
        timeout: 30000,
        imageMatchThreshold: 0.8,
        pixelMatchThreshold: 0.1,
        imagesDir: './images',
        rakutenUserId: 'rakuten-user',
        rakutenPassword: 'rakuten-password',
        storageStatePath: './auth.json',
      };

      expect(config.email).toBe('test@example.com');
      expect(config.password).toBe('test-password');
      expect(config.searchQuery).toBe('from:rakuten');
      expect(config.headless).toBe(false);
      expect(config.timeout).toBe(30000);
      expect(config.imageMatchThreshold).toBe(0.8);
      expect(config.pixelMatchThreshold).toBe(0.1);
      expect(config.imagesDir).toBe('./images');
      expect(config.rakutenUserId).toBe('rakuten-user');
      expect(config.rakutenPassword).toBe('rakuten-password');
      expect(config.storageStatePath).toBe('./auth.json');
    });
  });

  describe('BrowserOptions', () => {
    it('BrowserOptions型のオブジェクトを作成できる（slowMoなし）', () => {
      const options: BrowserOptions = {
        headless: true,
      };

      expect(options.headless).toBe(true);
      expect(options.slowMo).toBeUndefined();
      expect(options.storageStatePath).toBeUndefined();
    });

    it('BrowserOptions型のオブジェクトを作成できる（slowMoあり）', () => {
      const options: BrowserOptions = {
        headless: false,
        slowMo: 100,
      };

      expect(options.headless).toBe(false);
      expect(options.slowMo).toBe(100);
    });

    it('BrowserOptions型のオブジェクトを作成できる（storageStatePathあり）', () => {
      const options: BrowserOptions = {
        headless: true,
        storageStatePath: './auth.json',
      };

      expect(options.headless).toBe(true);
      expect(options.storageStatePath).toBe('./auth.json');
    });
  });
});
