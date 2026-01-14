<?php
/**
 * Plugin Name: CLI Static Build (Multi Newspaper)
 * Description: WP-CLI commands to build static HTML per newspaper slug.
 * Author: (local)
 */

if (!defined('WP_CLI') || !WP_CLI) {
  return;
}

class ITPC_Static_Builder {
  /** @var string */
  private $wp_root;

  public function __construct(string $wp_root) {
    $this->wp_root = rtrim($wp_root, '/');
  }

  /**
   * Template directory: {WP_ROOT}/static-src/{slug}
   */
  public function tpl_dir(string $slug): string {
    return $this->wp_root . '/static-src/' . $slug;
  }

  /**
   * Output directory: {WP_ROOT}/static/{slug}
   */
  public function out_dir(string $slug): string {
    return $this->wp_root . '/static/' . $slug;
  }

  public function ensure_dir(string $dir): void {
    if (is_dir($dir)) return;
    if (!mkdir($dir, 0775, true) && !is_dir($dir)) {
      WP_CLI::error("Failed to create directory: {$dir}");
    }
  }

  public function file_exists_or_error(string $path, string $hint): void {
    if (file_exists($path)) return;
    WP_CLI::error("Template not found.\nExpected:\n  {$hint}\nCreate them first (try: wp <slug> init).");
  }

  /**
   * init: create template folder + list/detail templates if missing.
   * - Creates static-src/{slug} automatically.
   * - If static-src/tomato exists, it uses it as a seed (copy) when slug != tomato.
   */
  public function init(string $slug): void {
    $tpl_dir = $this->tpl_dir($slug);
    $this->ensure_dir($tpl_dir);

    $list = $tpl_dir . '/list.html';
    $detail = $tpl_dir . '/detail.html';

    // If already exists, keep it.
    $created = [];

    // Seed from tomato templates if available and target doesn't exist yet.
    $seed_dir = $this->tpl_dir('tomato');
    $seed_list = $seed_dir . '/list.html';
    $seed_detail = $seed_dir . '/detail.html';

    if (!file_exists($list)) {
      if ($slug !== 'tomato' && file_exists($seed_list)) {
        copy($seed_list, $list);
        $created[] = $list . ' (copied from tomato)';
      } else {
        file_put_contents($list, $this->default_list_template($slug));
        $created[] = $list . ' (default)';
      }
    }

    if (!file_exists($detail)) {
      if ($slug !== 'tomato' && file_exists($seed_detail)) {
        copy($seed_detail, $detail);
        $created[] = $detail . ' (copied from tomato)';
      } else {
        file_put_contents($detail, $this->default_detail_template($slug));
        $created[] = $detail . ' (default)';
      }
    }

    if (empty($created)) {
      WP_CLI::success("Templates already exist: {$tpl_dir}");
    } else {
      WP_CLI::success("Initialized templates:\n- " . implode("\n- ", $created));
    }
  }

  /**
   * build: generate static/{slug}/index.html and detail.html from templates.
   * - Creates static-src/{slug} and static/{slug} automatically (no manual mkdir needed).
   * - Overwrites output files (static/{slug}/*) every build.
   * - DOES NOT overwrite templates (static-src/{slug}/*).
   */
  public function build(string $slug): void {
    // Ensure template folder exists (so "newspaper added -> no mkdir" is achieved)
    $this->ensure_dir($this->tpl_dir($slug));

    $tpl_list = $this->tpl_dir($slug) . '/list.html';
    $tpl_detail = $this->tpl_dir($slug) . '/detail.html';

    // If templates missing, tell user to init.
    if (!file_exists($tpl_list) || !file_exists($tpl_detail)) {
      $hint = $this->tpl_dir($slug) . "/list.html\n  " . $this->tpl_dir($slug) . "/detail.html";
      WP_CLI::error("Template not found.\nExpected:\n  {$hint}\nTry:\n  wp {$slug} init\nThen re-run:\n  wp {$slug} build");
    }

    $out_dir = $this->out_dir($slug);
    $this->ensure_dir($out_dir);

    $out_index  = $out_dir . '/index.html';
    $out_detail = $out_dir . '/detail.html';

    $generated_at = gmdate('c');

    $list_html = file_get_contents($tpl_list);
    $detail_html = file_get_contents($tpl_detail);

    // Simple tokens (optional). You can add more later.
    // {{NEWSPAPER_SLUG}} / {{GENERATED_AT}}
    $list_html = str_replace(
      ['{{NEWSPAPER_SLUG}}', '{{GENERATED_AT}}'],
      [$slug, $generated_at],
      $list_html
    );
    $detail_html = str_replace(
      ['{{NEWSPAPER_SLUG}}', '{{GENERATED_AT}}'],
      [$slug, $generated_at],
      $detail_html
    );

    file_put_contents($out_index, $list_html);
    file_put_contents($out_detail, $detail_html);

    WP_CLI::success("Built:\n- {$out_index}\n- {$out_detail}\nGenerated: {$generated_at}\nOpen:\n  http://localhost:8080/static/{$slug}/index.html\n  http://localhost:8080/static/{$slug}/detail.html");
  }

  private function default_list_template(string $slug): string {
    $now = gmdate('c');
    return <<<HTML
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{$slug} - list</title>
</head>
<body>
  <h1>{$slug} - 記事一覧（仮）</h1>
  <p>Generated: {{GENERATED_AT}}</p>
  <p>Slug: {{NEWSPAPER_SLUG}}</p>
  <ul>
    <li><a href="/static/{$slug}/detail.html">記事詳細（仮）へ</a></li>
  </ul>
</body>
</html>
HTML;
  }

  private function default_detail_template(string $slug): string {
    return <<<HTML
<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{$slug} - detail</title>
</head>
<body>
  <p><a href="/static/{$slug}/index.html">← 一覧へ戻る</a></p>
  <h1>{$slug} - 記事詳細（仮）</h1>
  <p>Generated: {{GENERATED_AT}}</p>
  <p>Slug: {{NEWSPAPER_SLUG}}</p>
  <article>
    <h2>タイトル（仮）</h2>
    <p>本文（仮）</p>
  </article>
</body>
</html>
HTML;
  }
}

/**
 * Register commands:
 * - wp newspaper init <slug>
 * - wp newspaper build <slug>
 * - wp {slug} init
 * - wp {slug} build
 */
WP_CLI::add_command('newspaper', function($args, $assoc_args) {
  $sub = $args[0] ?? '';
  $slug = $args[1] ?? '';

  $path = $assoc_args['path'] ?? ABSPATH;
  $builder = new ITPC_Static_Builder($path);

  if ($sub === 'init') {
    if (!$slug) WP_CLI::error("Usage: wp newspaper init <slug> --path=/var/www/html");
    $builder->init($slug);
    return;
  }
  if ($sub === 'build') {
    if (!$slug) WP_CLI::error("Usage: wp newspaper build <slug> --path=/var/www/html");
    $builder->build($slug);
    return;
  }

  WP_CLI::error("Usage:\n  wp newspaper init <slug> --path=/var/www/html\n  wp newspaper build <slug> --path=/var/www/html");
});

/**
 * Convenience alias commands:
 * - wp tomato build / init
 * - wp leek build / init
 * - wp strawberry build / init
 *
 * You can add more slugs here later, OR just use:
 *   wp newspaper build <newslug>
 */
$known_slugs = ['tomato', 'leek', 'strawberry'];

foreach ($known_slugs as $paper) {
  WP_CLI::add_command($paper, function($args, $assoc_args) use ($paper) {
    $sub = $args[0] ?? '';
    $path = $assoc_args['path'] ?? ABSPATH;

    $builder = new ITPC_Static_Builder($path);

    if ($sub === 'init') {
      $builder->init($paper);
      return;
    }
    if ($sub === 'build') {
      $builder->build($paper);
      return;
    }

    WP_CLI::error("Usage:\n  wp {$paper} init --path=/var/www/html\n  wp {$paper} build --path=/var/www/html\n(Or generic) wp newspaper build {$paper} --path=/var/www/html");
  });
}
