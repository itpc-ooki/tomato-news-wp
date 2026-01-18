# tomato-news-wp
🍅 トマト新聞（Tomato News）

1つの WordPress を CMS として使いながら、  
フロント側は **完全に静的 HTML + JSON + JavaScript** で配信するプロジェクトです。

記事管理は WordPress、表示は PHP を一切使わない構成になっています。

---

## 🌍 URL（ローカル）

```bash
WP管理画面:
http://localhost:8080/wp-admin

トップページ:
http://localhost:8080/

静的ページ:
http://localhost:8080/static/index.html

新聞ごとの一覧・詳細:
- tomato 一覧: http://localhost:8080/static/tomato/index.html
- tomato 詳細: http://localhost:8080/static/tomato/detail.html?id=9

- leek 一覧: http://localhost:8080/static/leek/index.html
- leek 詳細: http://localhost:8080/static/leek/detail.html?id=11

- strawberry 一覧: http://localhost:8080/static/strawberry/index.html
- strawberry 詳細: http://localhost:8080/static/strawberry/detail.html?id=5
````

---

## 🧱 ディレクトリ構成（完成形）

```bash
tomato-news-wp/
├─ docker-compose.yml
├─ static/                     # 公開用の静的ファイル（生成物 / Git管理しない）
│  ├─ index.html               # トップページ
│  ├─ style.css                # 共通CSS
│  ├─ app.js                   # 全paper共通JS
│  ├─ tomato/
│  │   ├─ index.html
│  │   ├─ detail.html
│  │   ├─ posts.json
│  │   └─ posts/
│  │       ├─ 9.json
│  │       └─ 16.json
│  ├─ leek/
│  └─ strawberry/
│
├─ static-src/                 # HTMLテンプレ置き場（編集するのはここ）
│  ├─ tomato/
│  │   ├─ list.html
│  │   └─ detail.html
│  ├─ leek/
│  └─ strawberry/
│
├─ wp-content/
│  └─ mu-plugins/
│      └─ cli-static-build.php  # 静的生成エンジン（心臓部）
│
└─ README.md
```

---

## 🧠 コンセプト

* WordPress → 管理画面専用
* フロントは

  * HTML
  * JSON
  * JavaScript
    だけで構成
* PHPは一切使わない
* S3 + CloudFront 配信を前提にできる構成

---

## 📰 新聞（paper / slug）の考え方

* tomato / leek / strawberry などは「新聞」
* slug = paper
* 各新聞はそれぞれ独立してビルドされる

例：

```
/static/tomato/
/static/leek/
/static/strawberry/
```

---

## 📦 JSON構成（方式B：一覧JSON + 詳細JSON分割）

```text
/static/{paper}/posts.json
 → 一覧用（軽量）

/static/{paper}/posts/{id}.json
 → 詳細用（本文HTML入り・重い）
```

例（tomato）:

```text
/static/tomato/posts.json
/static/tomato/posts/9.json
/static/tomato/posts/16.json
```

---

## 🛠 静的生成の流れ

① WordPress記事
→
② cli-static-build.php が JSON 生成
→
③ static-src の HTML テンプレをコピー
→
④ static/{paper}/ に静的HTMLとJSONが生成

---

## 🖥 表示側（static/app.js）

* URLから paper を自動判定
  例:

  ```
  /static/tomato/index.html → paper = tomato
  ```

* DOMでページ種別を判定:

  * `#post-list` → 一覧
  * `#post-detail` → 詳細

取得JSON:

| ページ              | 取得するJSON                       |
| ---------------- | ------------------------------ |
| index.html       | `/static/{paper}/posts.json`   |
| detail.html?id=9 | `/static/{paper}/posts/9.json` |

---

## 🎨 CSS管理

```text
/static/style.css
```

ここが **全ページ共通CSS**。

HTMLでは必ずこれを読む：

```html
<link rel="stylesheet" href="/static/style.css">
```

WordPressテーマ側の style.css は
「テーマ定義用」であり、フロントの見た目用ではありません。

---

## 🚫 static/ は直接編集しない

```text
static/ はビルドで毎回上書きされる
```

正しい運用：

```
static-src を編集
↓
build
↓
static に反映
```

---

## 🧪 手動ビルド（開発用）

1紙だけ：

```bash
docker compose run --rm wpcli wp tomato build --allow-root --path=/var/www/html
```

全紙まとめて：

```bash
docker compose run --rm wpcli wp tomato build --allow-root --path=/var/www/html --paper=all
```

---

## ⚙️ 自動ビルド（完成済み）

WordPressで

* 公開
* 更新
* 削除
* カテゴリ変更

が起きると：

* JSON + HTML を自動再生成
* WP-Cron で 8秒後に実行
* 管理者がコマンドを打つ必要なし

---

## 🌱 将来の本番構成

```text
static/ をそのまま S3 に配置
→ CloudFront 配信
```

表示系は PHP なしなので安全・高速。

---

## 🔁 開発 → ステージング反映フロー（想定）

```bash
# 開発完了
git checkout -b staging
git push origin staging

# ステージング環境で
git pull origin staging
docker compose up -d
wp build 実行
S3へ同期
```

---

## 🏆 この構成の強み

| 観点      | 強み                              |
| ------- | ------------------------------- |
| パフォーマンス | 静的HTML + JSONなので最速              |
| 拡張性     | tomato / leek / strawberry 追加可能 |
| 運用      | お客さんはWPだけ触ればOK                  |
| 安全性     | 表示系はPHPなしで攻撃面が小さい               |
| 将来      | そのままS3 + CloudFrontへ            |
