import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ImageRecognitionService } from '../../src/services/image.js';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

// fsモジュールをモック化
vi.mock('node:fs');

// テスト用の正当なPNGバイナリを生成するヘルパー
// loadTargetImagesがPNG.sync.readでデコード検証するため、ダミー文字列では検証に失敗してしまう
function createValidPngBuffer(width = 1, height = 1): Buffer {
  const png = new PNG({ width, height });
  return PNG.sync.write(png);
}

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

    it('PNG画像ファイルのみをフィルタリングして読み込む（拡張子が.png以外は対象外）', async () => {
      const testDir = '/test-images';
      const mockFiles = ['image1.png', 'image2.jpg', 'document.pdf', 'image3.PNG'];

      // ディレクトリとファイル存在のモック
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(mockFiles as never);

      // ファイル読み込みのモック（各画像に有効なPNGバイナリを返す）
      vi.mocked(fs.readFileSync).mockImplementation(() => createValidPngBuffer());

      const result = await imageService.loadTargetImages(testDir);

      // pixelmatchによる比較はPNGのみ対応のため、.png拡張子のファイル（2個）のみが読み込まれることを確認
      // .jpgファイルと.pdfファイルは拡張子フィルタの時点で除外される
      expect(result).toHaveLength(2);
      expect(result[0].path).toBe(path.join(testDir, 'image1.png'));
      expect(result[1].path).toBe(path.join(testDir, 'image3.PNG'));
    });

    it('PNGとしてデコードできないファイルは警告ログを出して除外される', async () => {
      const testDir = '/test-images';
      const mockFiles = ['valid.png', 'broken.png'];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(mockFiles as never);

      // 拡張子は.pngだが中身がJPEG等、PNGとしてデコードできないケースを再現
      vi.mocked(fs.readFileSync).mockImplementation((filePath: string | Buffer | URL) => {
        const filePathStr = filePath.toString();
        if (filePathStr.includes('broken.png')) {
          return Buffer.from('not-a-real-png');
        }
        return createValidPngBuffer();
      });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      const result = await imageService.loadTargetImages(testDir);

      // 不正なファイル(broken.png)は除外され、有効なファイル(valid.png)のみが残ることを確認
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe(path.join(testDir, 'valid.png'));

      // 除外したファイル名を含む警告ログが出力されることを確認（暗黙に握りつぶさない）
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('broken.png'));

      consoleSpy.mockRestore();
    });

    it('有効な対象画像が1枚もない場合、その旨をログ出力して空配列を返す', async () => {
      const testDir = '/test-images';
      const mockFiles = ['broken.png'];

      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readdirSync).mockReturnValue(mockFiles as never);
      vi.mocked(fs.readFileSync).mockReturnValue(Buffer.from('not-a-real-png'));

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

      const result = await imageService.loadTargetImages(testDir);

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('有効な対象画像が1枚もありませんでした')
      );

      consoleSpy.mockRestore();
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

      vi.mocked(fs.readFileSync).mockReturnValue(createValidPngBuffer());

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
