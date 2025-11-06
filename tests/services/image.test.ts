import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ImageRecognitionService } from '../../src/services/image.js';
import fs from 'node:fs';
import path from 'node:path';

// fsモジュールをモック化
vi.mock('node:fs');

describe('ImageRecognitionService', () => {
  let imageService: ImageRecognitionService;

  beforeEach(() => {
    imageService = new ImageRecognitionService();
    // モック関数をリセット
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('loadTargetImages', () => {
    it('画像ディレクトリが存在しない場合、エラーをスローする', async () => {
      // ディレクトリが存在しないようにモック
      vi.mocked(fs.existsSync).mockReturnValue(false);

      await expect(imageService.loadTargetImages('/non-existent-dir')).rejects.toThrow(
        '画像ディレクトリが見つかりません'
      );
    });

    it('画像ディレクトリにファイルがない場合、空配列を返す', async () => {
      // ディレクトリは存在するがファイルがないようにモック
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue([]);

      const result = await imageService.loadTargetImages('/empty-dir');

      expect(result).toEqual([]);
    });

    it('PNG画像ファイルのみをフィルタリングして読み込む', async () => {
      const testDir = '/test-images';
      const mockFiles = ['image1.png', 'image2.jpg', 'document.pdf', 'image3.PNG'];

      // ディレクトリとファイル存在のモック
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(mockFiles as never);

      // ファイル読み込みのモック（各画像に異なるBufferを返す）
      vi.mocked(fs.readFileSync).mockImplementation((filePath: string | Buffer | URL) => {
        const filePathStr = filePath.toString();
        if (filePathStr.includes('image1.png')) {
          return Buffer.from('image1-data');
        }
        if (filePathStr.includes('image2.jpg')) {
          return Buffer.from('image2-data');
        }
        if (filePathStr.includes('image3.PNG')) {
          return Buffer.from('image3-data');
        }
        return Buffer.from('');
      });

      const result = await imageService.loadTargetImages(testDir);

      // PNG, JPG, JPEG ファイル（3個）のみが読み込まれることを確認
      expect(result).toHaveLength(3);
      expect(result[0].path).toBe(path.join(testDir, 'image1.png'));
      expect(result[1].path).toBe(path.join(testDir, 'image2.jpg'));
      expect(result[2].path).toBe(path.join(testDir, 'image3.PNG'));
      expect(result[0].data.toString()).toBe('image1-data');
      expect(result[1].data.toString()).toBe('image2-data');
      expect(result[2].data.toString()).toBe('image3-data');
    });

    it('JPEG画像ファイルを読み込む', async () => {
      const testDir = '/test-images';
      const mockFiles = ['photo1.jpeg', 'photo2.JPEG'];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(mockFiles as never);

      vi.mocked(fs.readFileSync).mockImplementation((filePath: string | Buffer | URL) => {
        const filePathStr = filePath.toString();
        if (filePathStr.includes('photo1.jpeg')) {
          return Buffer.from('photo1-data');
        }
        if (filePathStr.includes('photo2.JPEG')) {
          return Buffer.from('photo2-data');
        }
        return Buffer.from('');
      });

      const result = await imageService.loadTargetImages(testDir);

      expect(result).toHaveLength(2);
      expect(result[0].path).toBe(path.join(testDir, 'photo1.jpeg'));
      expect(result[1].path).toBe(path.join(testDir, 'photo2.JPEG'));
    });

    it('ファイル読み込みに失敗した場合、エラーをスローする', async () => {
      const testDir = '/test-images';
      const mockFiles = ['image1.png'];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(mockFiles as never);

      // ファイル読み込み時にエラーをスロー
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw new Error('Permission denied');
      });

      await expect(imageService.loadTargetImages(testDir)).rejects.toThrow(
        '対象画像の読み込みに失敗しました'
      );
    });

    it('画像ファイル以外のファイルは無視される', async () => {
      const testDir = '/test-images';
      const mockFiles = ['readme.txt', 'config.json', 'script.js', 'image.png'];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(mockFiles as never);

      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('image-data'));

      const result = await imageService.loadTargetImages(testDir);

      // 画像ファイル（image.png）のみが読み込まれることを確認
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe(path.join(testDir, 'image.png'));
    });
  });

  describe('findTargetImage', () => {
    it('対象画像が空の場合、foundがfalseを返す', async () => {
      // モックページオブジェクト（最小限の実装）
      const mockPage = {
        $$: vi.fn().mockResolvedValue([]),
      } as never;

      const result = await imageService.findTargetImage(mockPage, [], 0.8, 0.1);

      expect(result.found).toBe(false);
      expect(result.element).toBeUndefined();
      expect(result.imagePath).toBeUndefined();
    });
  });
});
