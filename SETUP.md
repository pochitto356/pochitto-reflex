# ぽちっと反射神経：公開までの準備手順

作成: 2026-10-01 / Claude
← [[アプリ開発メモ]] / [[PK-002_登録作業ログ]]（ぽちっと漢字で同じ作業をした記録）

コード（ゲーム本体・広告・課金・振動・シェア・レビュー依頼・ビルド設定）はできています。
残りは**konishiさんのアカウントが必要な登録作業**です。手順はぽちっと漢字とほぼ同じで、全部で1時間ほどかかります。

| 値 | 内容 |
|---|---|
| アプリ名 | ぽちっと反射神経 |
| バンドルID | `com.konishi.pochittoreflex` |
| SKU | `pochittoreflex` |
| GitHubリポジトリ名 | `pochitto-reflex` |
| アプリ内課金ID | `pochittoreflex_remove_ads`（非消耗型・¥300・参照名「広告削除」） |
| プライバシーポリシー | `https://pochitto356.github.io/pochittoreflex-privacy.html` |

---

## ステップ1. GitHubにリポジトリを作る（10分）

1. https://github.com/new で **`pochitto-reflex`**（Public）を作る
2. 「uploading an existing file」から、zipを展開した**中身**（`package.json` `codemagic.yaml` `capacitor.config.json` `www/` `assets/` など）を**直下**にドラッグする
   - `privacy/` フォルダは入れなくても大丈夫です（ステップ4で別のリポジトリに置きます）
3. 「Commit changes」を押す

## ステップ2. バンドルIDとApp Store Connect（15分）

1. https://developer.apple.com/account/resources/identifiers → App IDs → ＋
   - Description: `Pochitto Reflex` / Bundle ID（Explicit）: `com.konishi.pochittoreflex` / In-App Purchase にチェック
2. App Store Connect → マイApp → ＋ → 新規App
   - 名前: `ぽちっと反射神経 - 反応速度テスト`（使えなければ `ぽちっと反射神経`）/ 日本語 / 上のバンドルID / SKU `pochittoreflex`
3. URLの `.../apps/【数字】/...` が **Apple ID** になります
4. 収益化 → App内課金 → ＋ → **非消耗型** / 参照名 `広告削除` / 製品ID **`pochittoreflex_remove_ads`** / 価格 **¥300**
   - 日本語の表示名は `広告削除`、説明は `すべての広告が表示されなくなります。買い切りです。`

## ステップ3. AdMob（10分）

1. アプリを追加 → iOS → 「App Storeに登録済み？」→ いいえ → アプリ名 `ぽちっと反射神経`
2. 広告ユニットを**2つ**作る
   - バナー `PR_banner`（ホーム・結果・記録・設定の画面下）
   - インタースティシャル `PR_interstitial`（測定3回ごと、結果画面から次に進むとき）

## ステップ4. プライバシーポリシーを公開（5分）

`pochitto356.github.io` リポジトリに `privacy/pochittoreflex-privacy.html` を**ルート直下**へアップロードします。

## ステップ5. Codemagic（10分）

1. Add application → GitHub → `pochitto-reflex` → codemagic.yaml を使う
2. Code signing identities → `com.konishi.pochittoreflex` のプロファイルを **Fetch profiles** で取り込む
3. ⚠ ビルドを始める前に、URLの `?app_id=` で対象アプリを絞り込む（9/4にGRID HUNTERのビルドを誤って走らせた教訓）

---

## Claudeに渡す値

```
1. Apple ID（10桁）         :
2. AdMob アプリID           : ca-app-pub-7792368657314009~
3. バナー広告ユニットID      : ca-app-pub-7792368657314009/
4. インタースティシャルID    : ca-app-pub-7792368657314009/
```

**今はGoogle公式のテスト広告IDが入っています（`native.js` の `IS_TESTING = true`）。この状態では審査に出さないでください。**

## 値をもらってからClaudeがやること

1. `codemagic.yaml`（APP_APPLE_ID / ADMOB_APP_ID）と `www/native.js`（AD_IDS、`IS_TESTING=false`）を書き換える
2. 公開後、`native.js` の `APP_STORE_ID` にApple IDを入れる（シェア文にダウンロードURLが付く）
3. Codemagicでビルド → TestFlight → 実機で確認してもらう（ATTのダイアログ・広告・購入シート）
4. メタデータを入力する（`STORE.md`）。**マーケティングURLを最初から入れる**
5. 審査に提出する ← **konishiさんの「OK」をもらってから押します**

## 審査で気をつける点（過去4アプリの教訓）

| 教訓 | 本アプリでの対応 |
|---|---|
| ATTダイアログが出ていなかった（ぽちっと漢字 2.1差し戻し） | 修正済みの `native.js` をそのまま使っている：アクティブになってから `requestTrackingAuthorization()` を呼び、その後でAdMobを初期化する |
| 課金の初期化が早すぎて商品が取れなかった（GRID HUNTER） | `deviceready` を待って初期化する。商品が取れていなければ取り直してから注文する |
| マーケティングURLが空だとAdMobの配信が制限される | 初回提出から `https://pochitto356.github.io/` を入れる |
| エラー90474（iPadマルチタスク） | 縦画面固定＋`UIRequiresFullScreen=YES`（codemagic.yaml） |
| 初回は2.1「情報要求」になりやすい | 審査メモ（STORE.md）と操作の録画を最初から添付する |
| 医療的な主張と受け取られる（ガイドライン1.4.1） | 「反射神経年齢は娯楽目的の目安」とアプリ内・説明文・審査メモに書いた。ヘルスケアのカテゴリは選ばない |

## App Privacy（データ収集の申告）

- サードパーティ広告（AdMob）：「識別子 → デバイスID」「使用状況データ → 製品の操作」。トラッキングに使用
- 開発者自身は何も収集しない（アカウントもサーバーもない）
