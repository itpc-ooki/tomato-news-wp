# tomato-news-wp
トマト新聞

1つのWordPressで複数の「新聞（slug）」を管理し、各新聞ごとに静的HTMLを `/static/{slug}/` に出力します。

### URL

```bash
- WP管理画面: http://localhost:8080/wp-admin
- 静的出力（例）
  - tomato 一覧: http://localhost:8080/static/tomato/index.html
  - tomato 詳細: http://localhost:8080/static/tomato/detail.html
  - leek 一覧: http://localhost:8080/static/leek/index.html
  - leek 詳細: http://localhost:8080/static/leek/detail.html
  - strawberry 一覧: http://localhost:8080/static/strawberry/index.html
  - strawberry 詳細: http://localhost:8080/static/strawberry/detail.html
````


---

## ディレクトリ構成

```bash
.
├─ docker-compose.yml
├─ static/                 # ビルド結果（生成物 / 基本Git管理しない）
│  └─ {slug}/
│     ├─ index.html        # 一覧
│     └─ detail.html       # 詳細
├─ static-src/             # テンプレ置き場（新聞ごと）
│  └─ {slug}/
│     ├─ list.html         # 一覧テンプレ
│     └─ detail.html       # 詳細テンプレ
└─ wp-content/
└─ mu-plugins/
└─ cli-static-build.php
````


---

## 0. 前提（ローカルに必要なもの）

- Git
- Docker Desktop（起動しておく）
- 使用ポート: `8080`（他で使ってたら空ける or docker-compose を調整）

---

## 1. リポジトリをクローン（HTTPS / SSH）

### HTTPS

```bash
git clone https://github.com/itpc-ooki/tomato-news-wp.git
cd tomato-news-wp
````

### SSH

```bash
git clone git@github.com:itpc-ooki/tomato-news-wp.git
cd tomato-news-wp
```

---

## 2. Docker 起動

```bash
docker compose up -d
```

ブラウザで開いて確認（WPが表示されればOK）
[http://localhost:8080/](http://localhost:8080/)

---

## 3. 初回だけ：WPの `wp-config.php` が無い場合

`wp-config.php` が無いとWPが動きません。無い場合だけ作成します。

### 3-1. `wp-config.php` の存在確認

```bash
docker compose run --rm wpcli ls -la /var/www/html/wp-config.php
```

無いと言われたら、次を実行：

### 3-2. `wp-config.php` 作成（権限エラー回避のため user 33:33）

```bash
docker compose run --rm --user 33:33 wpcli wp config create \
  --allow-root \
  --path=/var/www/html \
  --dbname=wordpress \
  --dbuser=wp \
  --dbpass=wp \
  --dbhost=db \
  --skip-check
```

---

## 4. WPが未インストールの場合（初回だけ）

### 4-1. インストール済みか確認

```bash
docker compose run --rm wpcli wp core is-installed --allow-root --path=/var/www/html
```

未インストールなら下記（例）：

```bash
docker compose run --rm wpcli wp core install \
  --allow-root \
  --path=/var/www/html \
  --url=http://localhost:8080 \
  --title="Tomato News" \
  --admin_user=admin \
  --admin_password=admin \
  --admin_email=admin@example.com
```

---

## 5. 新聞（slug）の概念

* 「新聞マスタ」というCPT（カスタム投稿タイプ）で新聞を追加します
* slug（例: `tomato`, `leek`, `strawberry`）ごとにテンプレと静的出力先が分かれます

管理画面：

* `wp-admin` → 「新聞マスタ」 → `tomato / leek / strawberry` を作成

重要：

* 複数新聞を出すなら **新聞マスタは slug 分だけ必要**（tomato/leek/strawberry それぞれ作る）

---

## 6. 新聞（slug）を追加したときの対応（テンプレ作成 → ビルド）

例：`leek` を追加したい場合

### 6-1. 管理画面で新聞マスタを追加

* 新聞スラッグ: `leek`
* 出力サブディレクトリ名: `leek`（基本はスラッグと同じでOK）

### 6-2. テンプレを初期化（ディレクトリ作成も自動）

`static-src/{slug}/` と `list.html / detail.html` を用意します。

```bash
docker compose run --rm wpcli wp leek init --allow-root --path=/var/www/html
```

> すでに存在する場合は「Templates already exist」になり、そのままでOKです。

---

## 7. 静的ビルド（一覧/詳細を出力）

新聞ごとにビルドコマンドがあります。

### 7-1. tomato をビルド

```bash
docker compose run --rm wpcli wp tomato build --allow-root --path=/var/www/html
```

確認：

* [http://localhost:8080/static/tomato/index.html](http://localhost:8080/static/tomato/index.html)
* [http://localhost:8080/static/tomato/detail.html](http://localhost:8080/static/tomato/detail.html)

### 7-2. leek をビルド

```bash
docker compose run --rm wpcli wp leek build --allow-root --path=/var/www/html
```

確認：

* [http://localhost:8080/static/leek/index.html](http://localhost:8080/static/leek/index.html)
* [http://localhost:8080/static/leek/detail.html](http://localhost:8080/static/leek/detail.html)

### 7-3. strawberry をビルド

```bash
docker compose run --rm wpcli wp strawberry build --allow-root --path=/var/www/html
```

確認：

* [http://localhost:8080/static/strawberry/index.html](http://localhost:8080/static/strawberry/index.html)
* [http://localhost:8080/static/strawberry/detail.html](http://localhost:8080/static/strawberry/detail.html)

---

## 8. デザイン（テンプレ）を修正したいとき

見た目は `static-src/{slug}/` のテンプレで決まります。

* 一覧テンプレ: `static-src/{slug}/list.html`
* 詳細テンプレ: `static-src/{slug}/detail.html`

例：tomatoの一覧を修正する流れ

1. `static-src/tomato/list.html` を編集
2. ビルドし直す

```bash
docker compose run --rm wpcli wp tomato build --allow-root --path=/var/www/html
```

3. ブラウザで確認
   [http://localhost:8080/static/tomato/index.html](http://localhost:8080/static/tomato/index.html)

---

## 9. 生成物（static/）は手で編集しない

`wp {slug} build` は `static/{slug}/` を **上書き生成**します。

* ✅ 正しい運用: `static-src/{slug}/` を編集 → `build`
* ❌ NG: `static/{slug}/index.html` を直接編集（次のbuildで消えます）

---

## 10. よくあるエラー

### A) `Template not found` が出る

例：

```
Error: Template not found.
Expected:
 /var/www/html/static-src/tomato/list.html
 /var/www/html/static-src/tomato/detail.html
```

対処：テンプレ初期化を実行

```bash
docker compose run --rm wpcli wp tomato init --allow-root --path=/var/www/html
```

---

## 11. Git に push（共同開発）

```bash
git status
git add -A
git commit -m "チケット番号　チケット名"
git push origin branchname
```

---

## 12. 共同開発の運用メモ（おすすめ）

* `static/{slug}/` は生成物なので **基本コミットしない**（`.gitignore` で除外済み）
* 変更するのは主に以下

  * `static-src/{slug}/list.html`
  * `static-src/{slug}/detail.html`
  * `wp-content/` 配下（mu-plugin / テーマなど）

