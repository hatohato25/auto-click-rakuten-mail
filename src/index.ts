import type { Browser } from 'playwright';
import { BrowserService } from './services/browser.js';
import { GmailService } from './services/gmail.js';
import { ImageRecognitionService } from './services/image.js';
import { RakutenService } from './services/rakuten.js';
import { loadConfig } from './utils/config.js';
import fs from 'node:fs';

/**
 * メイン処理
 */
async function main(): Promise<void> {
  let browser: Browser | undefined;

  try {
    console.log('=== 楽天メール自動クリックツール ===\n');

    // 設定読み込み
    console.log('設定を読み込んでいます...');
    const config = loadConfig();
    console.log(`メールアドレス: ${config.email}`);
    console.log(`検索クエリ: ${config.searchQuery}`);
    console.log(`Headlessモード: ${config.headless ? '有効' : '無効'}`);
    console.log(`画像マッチング閾値: ${(config.imageMatchThreshold * 100).toFixed(0)}%`);
    console.log(`ピクセルマッチング閾値: ${config.pixelMatchThreshold.toFixed(2)}\n`);

    // サービスの初期化
    const browserService = new BrowserService();
    const gmailService = new GmailService(browserService);
    const imageService = new ImageRecognitionService();
    const rakutenService = new RakutenService();

    // ブラウザの起動
    console.log('ブラウザを起動しています...');
    browser = await browserService.launch({
      headless: config.headless,
    });
    console.log('ブラウザの起動が完了しました\n');

    // 新しいページを作成（storageStateを使用）
    const { page, context } = await browserService.newPage(browser, config.storageStatePath);

    // storageStateが存在する場合はログインをスキップ
    const storageStateExists = fs.existsSync(config.storageStatePath);

    if (!storageStateExists) {
      console.log('初回ログイン: 認証情報を入力します\n');

      // Gmailにアクセス
      await gmailService.accessGmail(page, config.email);

      // パスワード入力してログイン
      await gmailService.login(page, config.password);

      console.log('\n✅ Gmailへのログインに成功しました！\n');

      // 認証状態を保存
      await browserService.saveStorageState(context, config.storageStatePath);
    } else {
      console.log('保存済みの認証情報を使用してログインしています...\n');

      // Gmailにアクセス（既にログイン済みの状態）
      await browserService.goto(page, 'https://mail.google.com');
      await page.waitForTimeout(2000);

      console.log('\n✅ 認証状態を使用してGmailにアクセスしました！\n');
    }

    // メール検索
    await gmailService.searchMails(page, config.searchQuery);

    console.log('\n✅ メール検索に成功しました！\n');

    // 検索結果のメール数を取得
    const mailCount = await gmailService.getMailCount(page);

    if (mailCount === 0) {
      console.log('検索結果にメールがありませんでした。');
      return;
    }

    console.log(`\n📧 ${mailCount}件のメールを処理します\n`);

    // 検知対象画像を読み込み
    console.log('検知対象画像を読み込んでいます...');
    const targetImages = await imageService.loadTargetImages(config.imagesDir);
    console.log('');

    // 各メールに対してループ処理
    let processedCount = 0;
    let clickedCount = 0;
    let markedAsUnreadCount = 0;
    let deletedCount = 0;

    // パフォーマンス測定用の累積時間
    let totalOpenMailTime = 0;
    let totalImageSearchTime = 0;
    let totalClickTime = 0;
    let totalMarkAsUnreadTime = 0;
    let totalDeleteTime = 0;
    let totalBackToResultsTime = 0;
    let totalRakutenLoginTime = 0;

    // 未読に戻したメールの数をカウント（インデックス調整用）
    let skippedCount = 0;

    for (let i = 0; i < mailCount; i++) {
      try {
        console.log(`\n--- ${i + 1}/${mailCount}番目のメール処理中 ---`);

        // 現在のインデックスを計算
        // 削除したメールはリストから消えるが、未読に戻したメールはリストに残るため、
        // 未読に戻した数だけインデックスをずらす
        const currentIndex = skippedCount;
        let startTime = performance.now();
        await gmailService.openMailByIndex(page, currentIndex);
        const openMailTime = performance.now() - startTime;
        totalOpenMailTime += openMailTime;
        console.log(`⏱️ メールを開く: ${openMailTime.toFixed(0)}ms`);

        // メール内で対象画像を検索
        startTime = performance.now();
        const result = await imageService.findTargetImage(
          page,
          targetImages,
          config.imageMatchThreshold,
          config.pixelMatchThreshold
        );
        const imageSearchTime = performance.now() - startTime;
        totalImageSearchTime += imageSearchTime;
        console.log(`⏱️ 画像検索: ${imageSearchTime.toFixed(0)}ms`);

        if (result.found && result.element) {
          // 画像が見つかった場合：別タブでクリック
          console.log('クリック対象画像が見つかりました！');
          startTime = performance.now();
          await imageService.clickInNewTab(page, result.element, async (newPage) => {
            // 楽天ログインが必要かチェック
            const loginRequired = await rakutenService.isLoginRequired(newPage);

            if (loginRequired) {
              console.log('楽天ログインが必要です。ログイン処理を実行します...');
              const loginStartTime = performance.now();
              await rakutenService.login(newPage, config.rakutenUserId, config.rakutenPassword);
              const loginTime = performance.now() - loginStartTime;
              totalRakutenLoginTime += loginTime;
              console.log(`⏱️ 楽天ログイン: ${loginTime.toFixed(0)}ms`);

              // 楽天ログイン直後に認証状態を保存（途中で中断されても楽天認証が保存されるようにする）
              await browserService.saveStorageState(context, config.storageStatePath);
            }
          });
          const clickTime = performance.now() - startTime;
          totalClickTime += clickTime;
          console.log(`⏱️ リンククリック（新しいタブ）: ${clickTime.toFixed(0)}ms`);
          clickedCount++;

          // メールを削除（ゴミ箱へ移動）
          console.log('メールを削除します...');
          startTime = performance.now();
          await gmailService.deleteEmail(page);
          const deleteTime = performance.now() - startTime;
          totalDeleteTime += deleteTime;
          console.log(`⏱️ メール削除: ${deleteTime.toFixed(0)}ms`);
          deletedCount++;
        } else {
          // 画像が見つからなかった場合：未読に戻す
          console.log('クリック対象画像が見つかりませんでした。メールを未読に戻します...');
          startTime = performance.now();
          await gmailService.markAsUnread(page);
          const markAsUnreadTime = performance.now() - startTime;
          totalMarkAsUnreadTime += markAsUnreadTime;
          console.log(`⏱️ 未読に戻す: ${markAsUnreadTime.toFixed(0)}ms`);
          markedAsUnreadCount++;
          // 未読に戻したメールはリストに残るため、次のループでインデックスをずらす
          skippedCount++;
        }

        // 検索結果一覧に戻る
        startTime = performance.now();
        await gmailService.backToSearchResults(page);
        const backToResultsTime = performance.now() - startTime;
        totalBackToResultsTime += backToResultsTime;
        console.log(`⏱️ 検索結果一覧に戻る: ${backToResultsTime.toFixed(0)}ms`);

        processedCount++;
      } catch (error) {
        console.error(`\n⚠️ ${i + 1}番目のメール処理でエラーが発生しました:`);
        console.error(error instanceof Error ? error.message : String(error));
        console.log('次のメールに進みます...');

        // エラーが発生しても検索結果一覧に戻る試みをする
        try {
          await gmailService.backToSearchResults(page);
        } catch {
          // 戻れない場合は処理を中断
          console.error('検索結果一覧に戻れませんでした。処理を中断します。');
          break;
        }
      }
    }

    // 処理結果サマリー
    console.log('\n\n=== 処理結果サマリー ===');
    console.log(`処理したメール数: ${processedCount}/${mailCount}`);
    console.log(`クリックしたリンク数: ${clickedCount}`);
    console.log(`削除したメール数: ${deletedCount}`);
    console.log(`未読に戻したメール数: ${markedAsUnreadCount}`);
    console.log('\n--- パフォーマンス統計 ---');
    console.log(`メールを開く（平均）: ${(totalOpenMailTime / processedCount).toFixed(0)}ms`);
    console.log(`画像検索（平均）: ${(totalImageSearchTime / processedCount).toFixed(0)}ms`);
    if (clickedCount > 0) {
      console.log(`リンククリック（平均）: ${(totalClickTime / clickedCount).toFixed(0)}ms`);
    }
    if (deletedCount > 0) {
      console.log(`メール削除（平均）: ${(totalDeleteTime / deletedCount).toFixed(0)}ms`);
    }
    if (markedAsUnreadCount > 0) {
      console.log(
        `未読に戻す（平均）: ${(totalMarkAsUnreadTime / markedAsUnreadCount).toFixed(0)}ms`
      );
    }
    console.log(
      `検索結果一覧に戻る（平均）: ${(totalBackToResultsTime / processedCount).toFixed(0)}ms`
    );
    if (totalRakutenLoginTime > 0) {
      console.log(`楽天ログイン（合計）: ${totalRakutenLoginTime.toFixed(0)}ms`);
    }
    console.log('=======================\n');
  } catch (error) {
    console.error('\n❌ エラーが発生しました:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    // ブラウザを終了
    if (browser) {
      console.log('\nブラウザを終了しています...');
      await browser.close();
      console.log('処理が完了しました');
    }
  }
}

// メイン処理を実行
main();
