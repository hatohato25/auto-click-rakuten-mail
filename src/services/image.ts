import type { ElementHandle, Page } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

/**
 * 画像認識を管理するサービスクラス
 */
export class ImageRecognitionService {
  /**
   * 検知対象画像を読み込む
   * @param imagesDir - 画像ディレクトリのパス
   * @returns 画像データの配列（Buffer形式）
   */
  async loadTargetImages(imagesDir: string): Promise<{ path: string; data: Buffer }[]> {
    try {
      console.log(`画像ディレクトリ「${imagesDir}」から対象画像を読み込んでいます...`);

      // ディレクトリが存在するか確認
      if (!fs.existsSync(imagesDir)) {
        throw new Error(`画像ディレクトリが見つかりません: ${imagesDir}`);
      }

      // ディレクトリ内のファイルを取得
      const files = fs.readdirSync(imagesDir);

      // 比較処理（PNG.sync.read + pixelmatch）はPNG画像のみ対応のため、対象は.pngファイルに限定する
      // 拡張子だけでは中身が別形式（例: JPEGをリネームしたもの）である事故を検知できないため、
      // このあと実際にPNGとしてデコードできるかを1件ずつ検証する
      const imageFiles = files.filter((file) => path.extname(file).toLowerCase() === '.png');

      if (imageFiles.length === 0) {
        console.log(`⚠️ 画像ディレクトリに画像ファイルが見つかりませんでした: ${imagesDir}`);
        return [];
      }

      // 各画像ファイルを読み込み、PNGとしてデコードできるものだけを対象にする
      // 1枚でもデコードに失敗すると findTargetImage 側で例外が発生し、全メールの画像検索が
      // 巻き込まれて失敗するため、ここで不正なファイルを弾いて処理を継続できるようにする
      const images: { path: string; data: Buffer }[] = [];
      for (const file of imageFiles) {
        const filePath = path.join(imagesDir, file);
        const data = fs.readFileSync(filePath);

        try {
          PNG.sync.read(data);
        } catch (error) {
          console.log(
            `⚠️ ${file} はPNGとしてデコードできないため対象画像から除外します: ${error instanceof Error ? error.message : String(error)}`
          );
          continue;
        }

        console.log(`  - ${file} を読み込みました`);
        images.push({ path: filePath, data });
      }

      if (images.length === 0) {
        console.log(
          `⚠️ 有効な対象画像が1枚もありませんでした（すべてPNGとしてデコードできませんでした）: ${imagesDir}`
        );
      }

      console.log(`${images.length}個の対象画像を読み込みました`);
      return images;
    } catch (error) {
      throw new Error(
        `対象画像の読み込みに失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * ページ内で対象画像を検索
   * @param page - ページインスタンス
   * @param targetImages - 検知対象画像の配列
   * @param threshold - マッチング閾値（0.0～1.0）
   * @param pixelThreshold - ピクセル単位の閾値（0.0～1.0）
   * @returns 検索結果（found: 見つかったか、element: 要素ハンドル、imagePath: マッチした画像パス）
   */
  async findTargetImage(
    page: Page,
    targetImages: { path: string; data: Buffer }[],
    threshold = 0.8,
    pixelThreshold = 0.1
  ): Promise<{ found: boolean; element?: ElementHandle; imagePath?: string }> {
    try {
      console.log('ページ内で対象画像を検索しています...');

      if (targetImages.length === 0) {
        console.log('検知対象画像が登録されていません');
        return { found: false };
      }

      // 対象画像のサイズ情報を事前に取得してキャッシュ（パフォーマンス最適化）
      // loadTargetImagesで検証済みの画像のみが渡される想定だが、想定外のデータが
      // 混入していた場合に1枚のデコード失敗で全体の画像検索が失敗しないよう、
      // 個別にtry-catchしてログを残しつつ除外する
      const targetImageSizes: { width: number; height: number }[] = [];
      for (const img of targetImages) {
        try {
          const png = PNG.sync.read(img.data);
          targetImageSizes.push({ width: png.width, height: png.height });
        } catch (error) {
          console.log(
            `⚠️ ${path.basename(img.path)} はPNGとしてデコードできないためサイズ事前チェックから除外します: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      // ページ内の全img要素を取得
      const images = await page.$$('img');
      console.log(`ページ内に${images.length}個の画像要素が見つかりました`);

      // 画像の読み込みを待機（ヘッドレスモードでの遅延読み込み対応）
      // すべての画像のcomplete属性がtrueになるまで待機
      await page.evaluate(() => {
        // biome-ignore lint/suspicious/noExplicitAny: evaluate内ではdocumentが利用可能
        const doc = (globalThis as any).document;
        const imgElements = Array.from(doc.querySelectorAll('img'));
        return Promise.all(
          imgElements.map(
            // biome-ignore lint/suspicious/noExplicitAny: evaluate内ではHTMLImageElementの型は実行時に利用可能
            (img: any) =>
              new Promise((resolve) => {
                if (img.complete) {
                  resolve(true);
                } else {
                  img.addEventListener('load', () => resolve(true));
                  img.addEventListener('error', () => resolve(true));
                  // タイムアウト（1秒）
                  setTimeout(() => resolve(true), 1000);
                }
              })
          )
        );
      });
      console.log('画像の読み込み完了を確認しました');

      // サイズの許容差（割合ベース）
      // boundingBoxはCSSレンダリングサイズのため、実際の画像サイズと大きく異なる場合がある
      // 20%の許容差を設定（例: 678x151の画像が542~814x121~181の範囲ならマッチング対象）
      // より厳密な範囲にすることで無関係な画像のスクリーンショット取得を削減し、パフォーマンスを向上
      const SIZE_TOLERANCE_RATIO = 0.2;
      let skippedCount = 0;

      // 各画像要素に対してマッチングを試行
      for (const imgElement of images) {
        // 画像のバウンディングボックスを取得（サイズ事前チェック用）
        // boundingBoxがnullの場合、要素が存在しないか、表示されていない
        const boundingBox = await imgElement.boundingBox();
        if (!boundingBox) {
          continue;
        }

        // サイズが0の画像はスキップ（非表示または読み込み失敗）
        if (boundingBox.width === 0 || boundingBox.height === 0) {
          continue;
        }

        // 対象画像のサイズと比較して、明らかに違う場合はスキップ
        let hasPotentialMatch = false;
        for (let i = 0; i < targetImageSizes.length; i++) {
          const targetSize = targetImageSizes[i];

          // 許容範囲を計算（±20%）
          const widthMin = targetSize.width * (1 - SIZE_TOLERANCE_RATIO);
          const widthMax = targetSize.width * (1 + SIZE_TOLERANCE_RATIO);
          const heightMin = targetSize.height * (1 - SIZE_TOLERANCE_RATIO);
          const heightMax = targetSize.height * (1 + SIZE_TOLERANCE_RATIO);

          // boundingBoxのサイズが許容範囲内かチェック
          if (
            boundingBox.width >= widthMin &&
            boundingBox.width <= widthMax &&
            boundingBox.height >= heightMin &&
            boundingBox.height <= heightMax
          ) {
            hasPotentialMatch = true;
            break;
          }
        }

        // すべての対象画像とサイズが大きく異なる場合はスクリーンショット取得をスキップ
        if (!hasPotentialMatch) {
          skippedCount++;
          continue;
        }

        // 画像のスクリーンショットを取得
        let screenshot: Buffer;
        try {
          screenshot = await imgElement.screenshot({ type: 'png' });
        } catch {
          // スクリーンショット取得に失敗した場合はスキップ
          continue;
        }

        // 各対象画像とマッチングを試行
        for (const targetImage of targetImages) {
          const result = await this.matchImage(
            screenshot,
            targetImage.data,
            targetImage.path,
            threshold,
            pixelThreshold
          );

          if (result.matched) {
            console.log(`✅ マッチング成功: ${path.basename(targetImage.path)}`);
            return { found: true, element: imgElement, imagePath: targetImage.path };
          }
        }
      }

      // スキップした画像数をログ出力（パフォーマンス情報）
      if (skippedCount > 0) {
        console.log(`  ⚡ サイズ不一致により${skippedCount}個の画像をスキップしました`);
      }

      console.log('対象画像は見つかりませんでした');
      return { found: false };
    } catch (error) {
      throw new Error(
        `画像検索に失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 画像マッチングを実行（デバッグ情報付き）
   * @param screenshot - スクリーンショット画像
   * @param targetImage - 対象画像
   * @param targetImagePath - 対象画像のパス（ログ出力用）
   * @param threshold - マッチング閾値（0.0～1.0）
   * @param pixelThreshold - ピクセル単位の閾値（0.0～1.0、デフォルト: 0.1）
   * @returns マッチング結果オブジェクト
   */
  async matchImage(
    screenshot: Buffer,
    targetImage: Buffer,
    targetImagePath: string,
    threshold: number,
    pixelThreshold = 0.1
  ): Promise<{ matched: boolean; matchRate: number; reason: string }> {
    try {
      // PNGとしてパース
      const img1 = PNG.sync.read(screenshot);
      const img2 = PNG.sync.read(targetImage);

      // サイズの許容差（ピクセル）
      // 5ピクセル以内の差は許容し、それを超える場合は比較をスキップ
      const SIZE_TOLERANCE = 5;

      // 画像サイズの差を計算
      const widthDiff = Math.abs(img1.width - img2.width);
      const heightDiff = Math.abs(img1.height - img2.height);

      // サイズ差が許容範囲外の場合は比較処理をスキップ（パフォーマンス最適化）
      if (widthDiff > SIZE_TOLERANCE || heightDiff > SIZE_TOLERANCE) {
        return { matched: false, matchRate: 0, reason: 'size_mismatch' };
      }

      // マッチングに使用する画像データとサイズ
      let compareData1 = img1.data;
      let compareData2 = img2.data;
      let compareWidth = img1.width;
      let compareHeight = img1.height;

      // サイズが少し異なる場合は、小さい方に合わせてトリミング
      if (widthDiff > 0 || heightDiff > 0) {
        const targetWidth = Math.min(img1.width, img2.width);
        const targetHeight = Math.min(img1.height, img2.height);

        // スクリーンショットをトリミング（必要な場合）
        if (img1.width !== targetWidth || img1.height !== targetHeight) {
          const cropped1 = this.cropImage(img1, targetWidth, targetHeight);
          compareData1 = cropped1.data;
        }

        // 対象画像をトリミング（必要な場合）
        if (img2.width !== targetWidth || img2.height !== targetHeight) {
          const cropped2 = this.cropImage(img2, targetWidth, targetHeight);
          compareData2 = cropped2.data;
        }

        compareWidth = targetWidth;
        compareHeight = targetHeight;
      }

      // pixelmatchで画像を比較
      const width = compareWidth;
      const height = compareHeight;

      // 差分画像は不要なのでundefinedを渡す
      const mismatchedPixels = pixelmatch(compareData1, compareData2, undefined, width, height, {
        threshold: pixelThreshold, // ピクセル単位の閾値（設定可能）
      });

      // 不一致ピクセル数の割合を計算
      const totalPixels = width * height;
      const matchRate = 1 - mismatchedPixels / totalPixels;

      // マッチング結果のログ出力
      const targetFileName = path.basename(targetImagePath);
      console.log(`    📊 [${targetFileName}] マッチ率: ${(matchRate * 100).toFixed(2)}%`);
      console.log(
        `       画像サイズ: ${width}x${height}, 不一致ピクセル: ${mismatchedPixels.toLocaleString()}/${totalPixels.toLocaleString()}`
      );

      // 閾値と比較
      const matched = matchRate >= threshold;

      if (!matched) {
        // マッチしなかった画像を保存（デバッグ用）
        await this.saveFailedMatch(screenshot, targetImagePath, matchRate);
      }

      return {
        matched,
        matchRate,
        reason: matched ? 'success' : 'low_match_rate',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`    ❌ マッチングエラー: ${errorMessage}`);
      return { matched: false, matchRate: 0, reason: 'parse_error' };
    }
  }

  /**
   * 画像をトリミング
   * @param img - PNG画像
   * @param width - トリミング後の幅
   * @param height - トリミング後の高さ
   * @returns トリミングされた画像
   */
  private cropImage(img: PNG, width: number, height: number): PNG {
    const cropped = new PNG({ width, height });

    // 元の画像から指定サイズ分のピクセルデータをコピー
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcIdx = (img.width * y + x) << 2;
        const dstIdx = (width * y + x) << 2;

        cropped.data[dstIdx] = img.data[srcIdx]; // R
        cropped.data[dstIdx + 1] = img.data[srcIdx + 1]; // G
        cropped.data[dstIdx + 2] = img.data[srcIdx + 2]; // B
        cropped.data[dstIdx + 3] = img.data[srcIdx + 3]; // A
      }
    }

    return cropped;
  }

  /**
   * マッチしなかった画像を保存（デバッグ用）
   * @param screenshot - スクリーンショット画像
   * @param targetImagePath - 対象画像のパス
   * @param matchRate - マッチ率
   */
  private async saveFailedMatch(
    screenshot: Buffer,
    targetImagePath: string,
    matchRate: number
  ): Promise<void> {
    try {
      // デバッグディレクトリが存在しない場合は作成
      const debugDir = './debug';
      if (!fs.existsSync(debugDir)) {
        fs.mkdirSync(debugDir, { recursive: true });
      }

      // ファイル名を生成（タイムスタンプ + マッチ率 + 元の画像名）
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const targetFileName = path.basename(targetImagePath, path.extname(targetImagePath));
      const matchRateStr = (matchRate * 100).toFixed(0);
      const fileName = `failed_${timestamp}_rate${matchRateStr}_${targetFileName}.png`;
      const filePath = path.join(debugDir, fileName);

      // 画像を保存
      fs.writeFileSync(filePath, screenshot);
      console.log(`    💾 マッチ失敗画像を保存しました: ${fileName}`);
    } catch (error) {
      // 保存に失敗してもマッチング処理には影響させない
      console.log(
        `    ⚠️ マッチ失敗画像の保存に失敗: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * マッチした要素を別タブでクリック（元の画面を保持）
   * @param page - ページインスタンス
   * @param element - 要素ハンドル
   * @param onNewPage - 新しいページが開かれた際のコールバック関数（オプション）
   */
  async clickInNewTab(
    page: Page,
    element: ElementHandle,
    onNewPage?: (newPage: Page) => Promise<void>
  ): Promise<void> {
    try {
      console.log('マッチした画像を別タブでクリックしています...');

      // 要素の親リンク（a タグ）を取得
      const link = await element.evaluateHandle((el) => {
        // biome-ignore lint/suspicious/noExplicitAny: evaluate内ではDOMの型が利用可能
        let current = el as any;
        while (current) {
          if (current.tagName === 'A') {
            return current;
          }
          current = current.parentElement;
        }
        return null;
      });

      if (!link || link === null) {
        throw new Error('画像の親リンクが見つかりませんでした');
      }

      // リンクのURLを取得
      const href = await link.evaluate((el) => {
        // biome-ignore lint/suspicious/noExplicitAny: evaluate内ではDOMの型が利用可能
        const anchor = el as any;
        return anchor?.href ?? null;
      });

      if (!href) {
        throw new Error('リンクのURLが取得できませんでした');
      }

      console.log(`リンクURL: ${href}`);

      // 新しいタブでリンクを開く
      const context = page.context();
      const newPage = await context.newPage();
      await newPage.goto(href, { waitUntil: 'domcontentloaded' });

      console.log('新しいタブでリンクを開きました');

      // ページ読み込み完了を待機（networkidleタイムアウトを短縮）
      // domcontentloadedでDOMが読み込まれているため、固定待機は不要
      try {
        await newPage.waitForLoadState('networkidle', { timeout: 5000 });
      } catch {
        // networkidleでタイムアウトしても、domcontentloadedで読み込まれていれば続行
        console.log('  (networkidle待機タイムアウト - domcontentloadedで続行)');
      }

      console.log('ページの読み込みが完了しました');

      // コールバック関数が指定されている場合は実行（楽天ログイン処理など）
      // エラーが発生してもタブを閉じるため、try-finally で囲む
      try {
        if (onNewPage) {
          await onNewPage(newPage);
        }
      } finally {
        // コールバックの成否に関わらず、必ずタブを閉じる
        // これにより楽天ログイン失敗時でもタブが残らない
        await newPage.close();
        console.log('新しいタブを閉じました');
      }
    } catch (error) {
      throw new Error(
        `別タブでのクリックに失敗しました: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
