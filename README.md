# tomato-news-wp  
🍅 トマト新聞（Tomato News）

WordPress を **CMS（管理画面専用）** として使用し、  
フロント側は **完全に静的 HTML + JSON + JavaScript** で配信するプロジェクト。

表示サイトは PHP を一切使わず、  
**S3 + CloudFront 配信を前提** とした「高速・安全・壊れにくい」構成。

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
- 広告JSON:       http://localhost:8080/static/tomato/placements.json
- 市況JSON:       http://localhost:8080/static/tomato/market.json

leek:
- カテゴリトップ: http://localhost:8080/static/leek/index.html
- 記事一覧:       http://localhost:8080/static/leek/list.html
- 記事詳細:       http://localhost:8080/static/leek/detail.html?id=11
- 広告JSON:       http://localhost:8080/static/leek/placements.json
- 市況JSON:       http://localhost:8080/static/leek/market.json

strawberry:
- カテゴリトップ: http://localhost:8080/static/strawberry/index.html
- 記事一覧:       http://localhost:8080/static/strawberry/list.html
- 記事詳細:       http://localhost:8080/static/strawberry/detail.html?id=5
- 広告JSON:       http://localhost:8080/static/strawberry/placements.json
- 市況JSON:       http://localhost:8080/static/strawberry/market.json
````

---

## 🧱 ディレクトリ構成（完成形）

```text
tomato-news-wp/
├ static/                        # 公開用（生成物 / Git管理しない）
│ ├ index.html                   # 全カテゴリトップ
│ ├ style.css                    # 共通CSS
│ ├ app.js                       # 全paper共通JS
│ ├ tomato/
│ │ ├ index.html
│ │ ├ list.html
│ │ ├ detail.html
│ │ ├ posts.json
│ │ ├ placements.json            # 広告JSON
│ │ ├ market.json                # 市況JSON（価格・取引量・差分）
│ │ └ posts/
│ │   ├ 9.json
│ │   └ 16.json
│ ├ leek/
│ └ strawberry/
│
├ static-src/                    # HTMLテンプレ（編集対象）
│ ├ tomato/
│ │ ├ index.html
│ │ ├ list.html
│ │ └ detail.html
│ ├ leek/
│ └ strawberry/
│
├ wp-content/
│ └ mu-plugins/
│   ├ cli-static-build.php       # 静的生成エンジン（心臓部）
│   ├ ad-items.php               # 広告管理
│   ├ acf-fields.php             # 新聞マスタ
│   └ market-data.php            # 市況データ管理
│
└ README.md
```

---

## 📰 ページ構成（記事）

各カテゴリ（paper）は 3ページ構成：

| ファイル名       | 役割      |
| ----------- | ------- |
| index.html  | カテゴリトップ |
| list.html   | 記事一覧    |
| detail.html | 記事詳細    |

---

## 📦 記事JSON構成

```text
/static/{paper}/posts.json
 → 記事一覧用（軽量）

/static/{paper}/posts/{id}.json
 → 記事詳細用（本文HTML入り）
```

---

## 📊 市況データシステム（Market Data）

### 概要

管理画面からトマトの市況情報を入力し、
静的サイト用に `market.json` を生成する仕組み。

### 管理画面

メニュー：

```
市況データ
```

入力項目：

* 日付
* 品目（大玉 / 中玉 / ミニ / ファースト）
* 価格（円/kg）
* 取引量（トン）
* 紙（paper）

### 出力JSON

```
/static/{paper}/market.json
```

内容例：

```json
{
  "paper": "tomato",
  "as_of": "2026-02-03",
  "items": [
    {
      "variety": "大玉トマト",
      "price": 878,
      "volume": 47,
      "diff": 131,
      "trend": "up"
    }
  ]
}
```

### 特徴

* 前日データとの差分を自動計算
* ↑ / ↓ / same を自動判定
* フロントJSがそのまま表示可能
* 記事・広告と同じ static build パイプラインで生成

---

## 📢 広告管理システム

### 管理画面構成

| 要素       | 内容            |
| -------- | ------------- |
| CPT      | 広告枠（ad_item）  |
| taxonomy | 紙（paper）      |
| taxonomy | 枠タイプ（ad_type） |

---

## 🖥 表示側（static/app.js）

取得JSON：

| ページ         | 取得JSON                                     |
| ----------- | ------------------------------------------ |
| index.html  | posts.json + placements.json + market.json |
| list.html   | posts.json                                 |
| detail.html | posts/{id}.json                            |

---

## 🚫 static/ は直接編集しない

```
static/ は毎回ビルドで上書きされる
```

---

## 🛠 手動ビルド（開発用）

```bash
docker compose exec static_builder wp static-build --all
```

---

## ⚙️ 自動ビルド

以下操作で自動生成：

* 記事更新
* 広告更新
* 市況データ更新
* taxonomy変更

---

## 🏆 この構成の強み

| 観点      | 強み                    |
| ------- | --------------------- |
| パフォーマンス | 完全静的で最速               |
| 安定性     | CMS障害でも配信影響なし         |
| 運用      | お客さんはWPだけ触ればOK        |
| 拡張性     | paper追加が容易            |
| 安全性     | PHP非公開で攻撃面が極小         |
| 将来      | S3 + CloudFrontへ即移行可能 |

