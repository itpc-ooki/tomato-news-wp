# tomato-news-wp  
🍅 トマト新聞（Tomato News）

WordPress を CMS（管理画面専用）として使いながら、  
フロント側は **完全に静的 HTML + JSON + JavaScript** で配信するプロジェクト。

表示サイトは PHP を一切使わず、  
S3 + CloudFront 配信を前提とした「高速・安全・壊れにくい」構成になっています。

---

## 🌍 URL（ローカル）

```text
WP管理画面:
http://localhost:8080/wp-admin

トップページ（全カテゴリ入口）:
http://localhost:8080/static/index.html

各カテゴリ（paper）:

tomato:
- カテゴリトップ: http://localhost:8080/static/tomato/index.html
- 記事一覧:       http://localhost:8080/static/tomato/list.html
- 記事詳細:       http://localhost:8080/static/tomato/detail.html?id=9

leek:
- カテゴリトップ: http://localhost:8080/static/leek/index.html
- 記事一覧:       http://localhost:8080/static/leek/list.html
- 記事詳細:       http://localhost:8080/static/leek/detail.html?id=11

strawberry:
- カテゴリトップ: http://localhost:8080/static/strawberry/index.html
- 記事一覧:       http://localhost:8080/static/strawberry/list.html
- 記事詳細:       http://localhost:8080/static/strawberry/detail.html?id=5
````

---

## 🧱 ディレクトリ構成（完成形）

```text
tomato-news-wp/
├ static/                    # 公開用（生成物 / Git管理しない）
│ ├ index.html               # 全カテゴリトップ
│ ├ style.css                # 共通CSS
│ ├ app.js                   # 全paper共通JS
│ ├ tomato/
│ │ ├ index.html             # カテゴリトップ
│ │ ├ list.html              # 記事一覧
│ │ ├ detail.html            # 記事詳細
│ │ ├ posts.json
│ │ └ posts/
│ │   ├ 9.json
│ │   └ 16.json
│ ├ leek/
│ └ strawberry/
│
├ static-src/                # HTMLテンプレ（編集するのはここ）
│ ├ tomato/
│ │ ├ index.html             # カテゴリトップ
│ │ ├ list.html              # 記事一覧
│ │ └ detail.html            # 記事詳細
│ ├ leek/
│ └ strawberry/
│
├ wp-content/
│ └ mu-plugins/
│   └ cli-static-build.php   # 静的生成エンジン（心臓部）
│
└ README.md
```

---

## 📰 ページ構成

各カテゴリ（paper）は 3ページ構成：

| ファイル名       | 役割      |
| ----------- | ------- |
| index.html  | カテゴリトップ |
| list.html   | 記事一覧    |
| detail.html | 記事詳細    |

---

## 📦 JSON構成（方式B）

```text
/static/{paper}/posts.json
 → 記事一覧用（軽量）

/static/{paper}/posts/{id}.json
 → 記事詳細用（本文HTML入り）
```

---

## 🖥 表示側（static/app.js）

URLから paper を自動判定：

```text
/static/tomato/index.html → paper = tomato
```

DOMでページ種別判定：

| DOM          | ページ                    |
| ------------ | ---------------------- |
| #post-list   | index.html / list.html |
| #post-detail | detail.html            |

JSON取得：

| ページ              | 取得JSON                       |
| ---------------- | ---------------------------- |
| index.html       | /static/{paper}/posts.json   |
| list.html        | /static/{paper}/posts.json   |
| detail.html?id=9 | /static/{paper}/posts/9.json |

---

## 🚫 static/ は直接編集しない

```text
static/ は毎回ビルドで上書きされる
```

正しい運用：

```text
static-src を編集
↓
build
↓
static に反映
```

---

## 🛠 手動ビルド（開発用）

1紙だけ：

```bash
docker compose run --rm wpcli wp tomato build --allow-root --path=/var/www/html --paper=tomato
```

全紙まとめて：

```bash
docker compose run --rm wpcli wp tomato build --allow-root --path=/var/www/html --paper=all
```

---

## ⚙️ 自動ビルド（完成済み）

WordPressで以下が起きると自動で静的生成：

* 公開
* 更新
* 削除
* カテゴリ変更

仕組み：

* save_post
* transition_post_status
* before_delete_post
* set_object_terms
  → WP-Cronで8秒後にビルド実行

---

## 🏆 この構成の強み

| 観点      | 強み                       |
| ------- | ------------------------ |
| パフォーマンス | 完全静的で最速                  |
| 拡張性     | paper追加で無限に増やせる          |
| 運用      | お客さんはWPだけ触ればOK           |
| 安全性     | PHP非公開で攻撃面が小さい           |
| 将来      | S3 + CloudFrontにそのまま移行可能 |
