<?php
/**
 * Static JSON Builder (Mode B)
 *
 * Purpose
 * - For each "paper" (category slug), generate JSON files for list & detail.
 * - Copy per-paper templates into /static/{paper}/
 *
 * Output (per paper)
 * - /static/{paper}/posts.json        (list)
 * - /static/{paper}/posts/{id}.json   (detail)
 * - /static/{paper}/index.html        (category top)
 * - /static/{paper}/list.html         (list page)
 * - /static/{paper}/detail.html       (detail page)
 *
 * + Placements (ads/pr/sponsor)
 * - /static/{paper}/placements.json
 * - /static/{paper}/market.json       (market data)
 *
 * Template rules
 * - /static-src/{paper}/detail.html is required
 * - /static-src/{paper}/list.html   is required
 * - /static-src/{paper}/index.html  is optional
 *   - if missing, list.html will be copied as index.html (backward compatible)
 *
 * Notes
 * - This file is loaded as an MU plugin, so it is loaded on every request.
 * - Do NOT run wp-cli "eval-file" against this file (it will load twice and redeclare classes).
 *   Use the registered WP-CLI command: `wp static-build ...`
 *
 * Expected (for placements):
 * - CPT: ad_item (publish items)
 * - Taxonomy: paper (slug: tomato/leek/strawberry etc)  -> to decide which /static/{paper}/ to write
 * - Taxonomy: ad_type (slug: ads/pr/sponsor_ad/sponsor_video)
 * - Fields (recommended ACF):
 *   - link_url (URL)
 *   - image (Image: array|id|url)
 *   - video (Video: array|id|url)  [only used when ad_type = sponsor_video]
 */

if (!defined('ABSPATH')) {
  exit;
}

if (!class_exists('Tomato_Static_Builder_ModeB')) {

class Tomato_Static_Builder_ModeB {

  /** @return string absolute path */
  private static function static_src_root(): string {
    return rtrim(ABSPATH, '/') . '/static-src';
  }

  /** @return string absolute path */
  private static function static_root(): string {
    return rtrim(ABSPATH, '/') . '/static';
  }

  /**
   * Paper exists if required templates exist.
   * - required: list.html, detail.html
   * - optional: index.html
   */
  public static function paper_exists(string $paper): bool {
    $paper = sanitize_title($paper);
    if ($paper === '') return false;

    $src = self::static_src_root() . '/' . $paper;

    return is_dir($src)
      && is_file($src . '/list.html')
      && is_file($src . '/detail.html');
  }

  /** Ensure directory exists */
  private static function ensure_dir(string $path): void {
    if (!is_dir($path)) {
      wp_mkdir_p($path);
    }
  }

  /**
   * Recursively copy a directory.
   * Used to sync shared assets (e.g. /static-src/common, /static-src/components) into /static.
   */
  private static function rcopy(string $src, string $dst): void {
    if (!is_dir($src)) {
      return;
    }

    self::ensure_dir($dst);

    $items = scandir($src);
    if ($items === false) {
      return;
    }

    foreach ($items as $item) {
      if ($item === '.' || $item === '..') {
        continue;
      }

      $from = $src . '/' . $item;
      $to   = $dst . '/' . $item;

      if (is_dir($from)) {
        self::rcopy($from, $to);
      } else {
        @copy($from, $to);
      }
    }
  }


  /**
   * Rewrite "/static/..." asset paths inside generated HTML to relative paths.
   * This makes the same build work both:
   * - Local: served under "/static/..."
   * - S3: served at bucket root "/..."
   *
   * Example (depth=1 for /tomato/index.html):
   *   /static/style.css -> ../style.css
   *   /static/app.js    -> ../app.js
   *   /static/common/...-> ../common/...
   */
  private static function rewrite_static_prefix_in_html(string $file, int $depth): void {
    if (!is_file($file)) return;

    $html = file_get_contents($file);
    if ($html === false) return;

    $prefix = str_repeat('../', max(0, $depth));

    // Replace /static/... (both " and ')
    $html = preg_replace('#(["\'])/static/#', '$1' . $prefix, $html);

    // Also handle cases like href="/static" (no trailing slash)
    $html = preg_replace('#(["\'])/static(["\'])#', '$1' . $prefix . '$2', $html);

    file_put_contents($file, $html);
  }

  private static function rewrite_static_prefix_in_html_under(string $root): void {
    $root = rtrim($root, '/');
    if (!is_dir($root)) return;

    $it = new RecursiveIteratorIterator(
      new RecursiveDirectoryIterator($root, FilesystemIterator::SKIP_DOTS)
    );

    foreach ($it as $f) {
      /** @var SplFileInfo $f */
      if (!$f->isFile()) continue;
      if (strtolower($f->getExtension()) !== 'html') continue;

      $file = $f->getPathname();

      // Depth is number of path segments from $root to the html file's directory.
      $rel_dir = ltrim(str_replace($root, '', $f->getPath()), '/');
      $depth = $rel_dir === '' ? 0 : substr_count($rel_dir, '/') + 1;

      self::rewrite_static_prefix_in_html($file, $depth);
    }
  }

  /**
   * Copy common front assets from /static-src to /static.
   *
   * Background:
   * - /static is treated as build output and is usually git-ignored.
   * - Shared assets (app.js / style.css / optional root index.html) should be authored
   *   under /static-src and copied into /static at build time.
   */
  private static function sync_common_assets(): void {
    $src = self::static_src_root();
    $dst = self::static_root();

    // Ensure /static exists
    self::ensure_dir($dst);


    // Root-level files (app.js, auth.js, style.css, variety.js, etc.)
    // Copy ALL non-hidden files directly under /static-src into /static.
    // This avoids having to maintain a manual allow-list as files increase.
    $items = scandir($src);
    if ($items !== false) {
      foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        if (strpos($item, '.') === 0) continue; // ignore dotfiles like .DS_Store
        $from = $src . '/' . $item;
        $to   = $dst . '/' . $item;
        if (is_file($from)) {
          @copy($from, $to);
        }
      }
    }

    // Shared directories (header/footer components, shared css/js/img)
    // NOTE: /static-src is not deployed in S3/CloudFront, so these must be copied into /static.
    self::rcopy($src . '/common',     $dst . '/common');
    self::rcopy($src . '/components', $dst . '/components');

    // Account pages (login / register / mypage)
    self::rcopy($src . '/account', $dst . '/account');


    // Make /static/... paths work on both local (/static/...) and S3 bucket root (/...)
    self::rewrite_static_prefix_in_html_under(self::static_root());
  }


/**
 * Sync WordPress uploads into /static so the static site can serve images.
 *
 * Why:
 * - posts.json stores featured_image as a relative path under /wp-content/uploads/...
 * - In staging, we deploy only /static to S3, so we need the uploads to exist under /static too.
 * - We copy uploads to: /static/wp-content/uploads/...
 *
 * NOTE:
 * - This is a simple "rcopy" (no deletes). For staging deployment, use `aws s3 sync` with --delete.
 */
private static function sync_uploads_assets(): void {
  // Prefer WordPress upload dir (respects custom settings), fallback to default.
  $upload = wp_get_upload_dir();
  $src = isset($upload['basedir']) && $upload['basedir'] ? (string) $upload['basedir'] : (rtrim(ABSPATH, '/') . '/wp-content/uploads');

  // In case wp_get_upload_dir returns a URL-like value or something unexpected, guard it.
  if ($src === '' || !is_dir($src)) {
    return;
  }

  $dst = self::static_root() . '/wp-content/uploads';
  self::rcopy($src, $dst);
}

  /**
   * Convert an URL to a "safe" relative path for the browser.
   * Why:
   * - In Docker/CLI context, wp_get_attachment_image_url() may return http://wordpress/... (service name)
   * - Browser on host accesses via http://localhost:8080/...
   * - Using relative path like /wp-content/uploads/... works everywhere (local/stg/prod on same origin)
   *
   * @return string|null relative path like "/wp-content/uploads/....jpg"
   */
  private static function to_relative_path(?string $url): ?string {
    if (!$url) return null;

    $url = (string) $url;

    // Goal:
    // - Static site is served under /static/...
    // - Uploads are synced to /static/wp-content/uploads/...
    // So always return a URL that is valid from the static site origin.
    //
    // Preferred output:
    // - /static/wp-content/uploads/....jpg

    // Root-relative path
    if (strpos($url, '/') === 0) {
      // Already points to /static/... => keep
      if (strpos($url, '/static/') === 0) {
        return $url;
      }

      // WordPress assets (uploads, etc) => serve via /static/wp-content/...
      if (strpos($url, '/wp-content/') === 0) {
        return '/static' . $url;
      }

      // Other root paths: keep as-is
      return $url;
    }

    // Absolute URL (http/https)
    if (preg_match('#^https?://#i', $url)) {
      $parts = parse_url($url);
      $path = is_array($parts) && isset($parts['path']) ? (string) $parts['path'] : '';

      // If the absolute URL points to wp-content, rewrite to /static/wp-content/...
      if ($path && strpos($path, '/wp-content/') === 0) {
        return '/static' . $path;
      }
      if ($path && strpos($path, '/static/wp-content/') === 0) {
        return $path;
      }

      // Otherwise keep as-is (external assets like YouTube thumbnails)
      return $url;
    }

    // Relative path (e.g. "../assets/...") => keep
    return $url;
  }





  /**
   * Rewrite absolute wp-content/uploads URLs inside HTML content to the static-site path.
   *
   * Example:
   * - http://54.xx.xx.xx:8080/wp-content/uploads/...  -> /static/wp-content/uploads/...
   * - https://example.com/wp-content/uploads/...      -> /static/wp-content/uploads/...
   *
   * This is required because post_content often contains absolute URLs (src/srcset).
   */
  private static function rewrite_uploads_urls_in_html(string $html): string {
    if ($html === '') return $html;

    // Replace protocol + host (and optional port) pointing to wp-content/uploads
    $html = preg_replace(
      '#(?:https?:)?//[^/]+/wp-content/uploads/#i',
      '/static/wp-content/uploads/',
      $html
    );

    return $html;
  }

  /**
   * Get featured image URL (relative) or null
   * - returns string|null
   */
  private static function get_featured_image_url(int $post_id): ?string {
    $thumb_id = get_post_thumbnail_id($post_id);
    if (!$thumb_id) {
      return null;
    }

    // Prefer a reasonable size for list/detail
    $url = wp_get_attachment_image_url($thumb_id, 'large');
    if (!$url) {
      // fallback
      $url = wp_get_attachment_url($thumb_id);
    }

    return self::to_relative_path($url ? (string) $url : null);
  }

  /**
   * Helper: get ACF field value safely
   * @return mixed|null
   */
  private static function get_acf_field_value(string $field_key, int $post_id) {
    $value = null;

    if (function_exists('get_field')) {
      $value = get_field($field_key, $post_id);
      if ($value !== null && $value !== false && $value !== '') {
        return $value;
      }
    }

    $meta = get_post_meta($post_id, $field_key, true);
    if ($meta !== '' && $meta !== null) {
      return $meta;
    }

    return $value;
  }

  /**
   * Helper: resolve media field (ACF image/file) to URL
   * Accepts: array|id|url
   */
  private static function resolve_media_to_url($field_value): ?string {
    if (!$field_value) return null;

    if (is_array($field_value) && !empty($field_value['url'])) {
      return (string) $field_value['url'];
    }

    if (is_numeric($field_value)) {
      $url = wp_get_attachment_url((int) $field_value);
      return $url ? (string) $url : null;
    }

    if (is_string($field_value) && $field_value !== '') {
      return $field_value;
    }

    return null;
  }

  /** @return int newspaper post id for the paper slug/output dir, or 0 */
  private static function get_newspaper_post_id_by_paper(string $paper): int {
    $paper = sanitize_title($paper);
    if ($paper === '') return 0;

    $queries = [
      [
        'key' => 'newspaper_slug',
        'value' => $paper,
      ],
      [
        'key' => 'output_subdir',
        'value' => $paper,
      ],
    ];

    foreach ($queries as $meta) {
      $q = new WP_Query([
        'post_type' => 'newspaper',
        'post_status' => 'any',
        'posts_per_page' => 1,
        'meta_query' => [
          [
            'key' => $meta['key'],
            'value' => $meta['value'],
            'compare' => '=',
          ],
        ],
      ]);

      if ($q->have_posts()) {
        $post = $q->posts[0];
        wp_reset_postdata();
        return ($post instanceof WP_Post) ? (int) $post->ID : 0;
      }
      wp_reset_postdata();
    }

    return 0;
  }


  /**
   * Build placements json for a paper:
   * - /static/{paper}/placements.json
   */
  private static function build_placements_json(string $paper): void {
    $paper = sanitize_title($paper);
    if ($paper === '') return;
    if (!self::paper_exists($paper)) return;

    $static_paper_root = self::static_root() . '/' . $paper;
    self::ensure_dir($static_paper_root);

    // =========================================================
    // Global menu visibility (per paper)
    // - Configured on CPT: newspaper (ACF field: hidden_menu_items)
    // - Output as `menu_hidden` in placements.json
    // =========================================================
    $menu_hidden = [];
    try {
      $newspaper_post_id = self::get_newspaper_post_id_by_paper($paper);
      if ($newspaper_post_id > 0) {
        $raw = self::get_acf_field_value('hidden_menu_items', $newspaper_post_id);
        if (is_array($raw)) {
          $menu_hidden = array_values(array_filter(array_map(function($v){
            $v = sanitize_title((string) $v);
            return $v !== '' ? $v : null;
          }, $raw)));
        } elseif (is_string($raw) && $raw !== '') {
          $menu_hidden = [ sanitize_title($raw) ];
        }
      }
    } catch (Exception $e) {
      // keep silent - placements build should not fail because of menu settings
      $menu_hidden = [];
    }


    // Fixed limits + taxonomy slugs for ad_type
    $buckets = [
      'ads'            => ['limit' => 3, 'type_slug' => 'ads'],
      'pr'             => ['limit' => 2, 'type_slug' => 'pr'],
      'sponsor_ads'    => ['limit' => 4, 'type_slug' => 'sponsor_ad'],
      'sponsor_videos' => ['limit' => 3, 'type_slug' => 'sponsor_video'],
    ];

    $out = [
      'ads' => [],
      'pr' => [],
      'sponsor_ads' => [],
      'sponsor_videos' => [],
      'sticky_banner' => null,
      'menu_hidden' => $menu_hidden,
    ];

    foreach ($buckets as $key => $cfg) {

      $q = new WP_Query([
        'post_type'      => 'ad_item',
        'post_status'    => 'publish',
        'posts_per_page' => (int) $cfg['limit'],
        'orderby'        => 'menu_order',
        'order'          => 'ASC',
        'tax_query'      => [
          [
            'taxonomy' => 'paper',
            'field'    => 'slug',
            'terms'    => [$paper],
          ],
          [
            'taxonomy' => 'ad_type',
            'field'    => 'slug',
            'terms'    => [ sanitize_title((string) $cfg['type_slug']) ],
          ],
        ],
      ]);

      if ($q->have_posts()) {
        foreach ($q->posts as $p) {
          if (!($p instanceof WP_Post)) continue;

          $id = (int) $p->ID;

          // URL (ACF recommended)
          $link_url = '';
          $acf_url = self::get_acf_field_value('link_url', $id);
          if (is_string($acf_url) && $acf_url !== '') {
            $link_url = $acf_url;
          } else {
            // fallback: post meta
            $meta_url = get_post_meta($id, 'link_url', true);
            if (is_string($meta_url) && $meta_url !== '') {
              $link_url = $meta_url;
            }
          }

          // Image (ACF image field recommended)
          $image_url = null;
          $acf_image = self::get_acf_field_value('image', $id);
          $image_url = self::resolve_media_to_url($acf_image);
          if (!$image_url) {
            // fallback: featured image
            $image_url = self::get_featured_image_url($id);
            // NOTE: get_featured_image_url already returns relative; if it returned relative, keep it.
            // If it returned null, keep null.
            if ($image_url && strpos($image_url, '/static/') === 0) {
              // already relative & static-prefixed
            }
          }

          // Convert to relative path (also adds /static prefix for uploads)
          $image_rel = self::to_relative_path($image_url ? (string) $image_url : null);

          $item = [
            'id'    => $id,
            'title' => get_the_title($p),
            'url'   => $link_url,
            'image' => $image_rel,
          ];

          // Ads placement controls (for "ads" bucket)
          if ($key === 'ads') {
            // Column: A (left/vcolA) or B (right/vcolB)
            $col = self::get_acf_field_value('ad_column', $id);
            $col = is_string($col) ? strtoupper(trim($col)) : '';
            if ($col !== 'A' && $col !== 'B') $col = 'A';

            // Size: medium (ad-half-vertical) or small (ad-rect-vertical)
            $size = self::get_acf_field_value('ad_size', $id);
            $size = is_string($size) ? strtolower(trim($size)) : '';
            if ($size !== 'medium' && $size !== 'small') $size = 'small';

            // Optional extra class
            $extra_class = self::get_acf_field_value('ad_extra_class', $id);
            $extra_class = is_string($extra_class) ? trim($extra_class) : '';
            if ($extra_class === '') $extra_class = null;

            $item['column'] = $col;
            $item['size'] = $size;
            $item['class'] = ($size === 'medium') ? 'ad-half-vertical' : 'ad-rect-vertical';
            $item['extra_class'] = $extra_class;
          }


          if ($key === 'sponsor_ads') {
            $category = self::get_acf_field_value('sponsor_category', $id);
            $item['category'] = is_string($category) ? sanitize_title($category) : '';
          }

          if ($key === 'sponsor_videos') {
            $video_url = null;

            // Video (ACF file field recommended)
            $acf_video = self::get_acf_field_value('video', $id);
            $video_url = self::resolve_media_to_url($acf_video);

            // Convert to relative path (uploads -> /static/wp-content/uploads/...)
            $item['video'] = self::to_relative_path($video_url ? (string) $video_url : null);
          }

          $out[$key][] = $item;
        }
      }
      wp_reset_postdata();
    }

    // ---------------------------------------------------------
    // Sticky banner (SP 固定バナー / index.html)
    // - Source: ad_item with ACF true_false `show_on_index_sticky` = 1
    // - Only ONE per paper (enforced on save via mu-plugin)
    // ---------------------------------------------------------
    try {
      $sq = new WP_Query([
        'post_type'      => 'ad_item',
        'post_status'    => 'publish',
        'posts_per_page' => 1,
        'orderby'        => 'menu_order',
        'order'          => 'ASC',
        'tax_query'      => [
          [
            'taxonomy' => 'paper',
            'field'    => 'slug',
            'terms'    => [$paper],
          ],
        ],
        'meta_query'     => [
          [
            'key'     => 'show_on_index_sticky',
            'value'   => '1',
            'compare' => '=',
          ],
        ],
      ]);

      if ($sq->have_posts() && !empty($sq->posts) && ($sq->posts[0] instanceof WP_Post)) {
        $sp = $sq->posts[0];
        $sid = (int) $sp->ID;

        $surl = '';
        $acf_url = self::get_acf_field_value('link_url', $sid);
        if (is_string($acf_url) && $acf_url !== '') {
          $surl = $acf_url;
        } else {
          $meta_url = get_post_meta($sid, 'link_url', true);
          if (is_string($meta_url) && $meta_url !== '') $surl = $meta_url;
        }

        $simg = null;
        $acf_image = self::get_acf_field_value('image', $sid);
        $img_url = self::resolve_media_to_url($acf_image);
        if (!$img_url) {
          $img_url = self::get_featured_image_url($sid);
        }
        $simg = self::to_relative_path($img_url ? (string) $img_url : null);

        $out['sticky_banner'] = [
          'id'    => $sid,
          'title' => get_the_title($sid),
          'url'   => $surl,
          'image' => $simg,
        ];
      }
      wp_reset_postdata();
    } catch (Exception $e) {
      // ignore
    }


    $path = $static_paper_root . '/placements.json';
    file_put_contents($path, wp_json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
  }

  /**
   * Build varieties.json for a paper.
   *
   * Source:
   * - CPT: variety (品種マスタ)
   * - Category (category slug) is used as "paper" filter (tomato/leek/strawberry)
   *
   * Output:
   * - /static/{paper}/varieties.json
   *
   * JSON format (matches current variety.html/variety.js expectations):
   * { "items": [ { id, name, category, company, image, tomvType, description, res } ... ] }
   */
  private static function build_varieties_json(string $paper): void {
    $paper = sanitize_title($paper);
    if ($paper === '') return;
    if (!self::paper_exists($paper)) return;

    $static_paper_root = self::static_root() . '/' . $paper;
    self::ensure_dir($static_paper_root);

    $items = [];

    $q = new WP_Query([
      'post_type'      => 'variety',
      'post_status'    => 'publish',
      'posts_per_page' => -1,
      'orderby'        => 'meta_value_num title',
      'meta_key'       => 'sort_order',
      'order'          => 'ASC',
      'tax_query'      => [
        [
          'taxonomy' => 'category',
          'field'    => 'slug',
          'terms'    => [$paper],
        ],
      ],
    ]);

    if ($q->have_posts()) {
      while ($q->have_posts()) {
        $q->the_post();
        $id = get_the_ID();

        $category = function_exists('get_field') ? (string) get_field('variety_category', $id) : '';
        $company  = function_exists('get_field') ? (string) get_field('company', $id) : '';
        $season_value = function_exists('get_field') ? (string) get_field('season', $id) : '';
        $image    = function_exists('get_field') ? get_field('image', $id) : '';
        $link     = function_exists('get_field') ? (string) get_field('link', $id) : '';
        $desc     = function_exists('get_field') ? (string) get_field('description', $id) : '';
        $res      = function_exists('get_field') ? get_field('res', $id) : null;
        $sort     = function_exists('get_field') ? (int) get_field('sort_order', $id) : 0;

        // Fallbacks
        if ($category === '') $category = 'large';
        if (!is_array($res)) $res = [];

        $season_slug = sanitize_title($season_value);
        if ($season_slug === 'winter' || $season_slug === 'winterspring') $season_slug = 'winter-spring';
        if ($season_slug === 'summer' || $season_slug === 'summerautumn') $season_slug = 'summer-autumn';
        if ($season_value === '冬春') $season_slug = 'winter-spring';
        if ($season_value === '夏秋') $season_slug = 'summer-autumn';
        if ($season_slug !== 'winter-spring' && $season_slug !== 'summer-autumn') {
          $season_slug = 'summer-autumn';
        }

        $season = $season_slug === 'winter-spring' ? '冬春' : '夏秋';

        // Normalize image path (so it works in /static/{paper}/ pages)
        $image_rel = null;
        if (is_string($image) && $image !== '') {
          $image_rel = self::to_relative_path($image);
        }

        $link_norm = '';
        if (is_string($link) && trim($link) !== '') {
          $link_norm = trim($link);
        }

        $items[] = [
          'id' => $id,
          'name' => get_the_title(),
          'category' => $category,
          'company' => $company,
          'season' => $season,
          'season_slug' => $season_slug,
          'image' => $image_rel ?: '',
          'link' => $link_norm,
          'description' => $desc,
          'res' => $res,
          // internal sort key (removed later)
          '__sort' => $sort,
        ];
      }
    }
    wp_reset_postdata();

    // Stable ordering: sort_order asc, then name asc, then id asc
    usort($items, function ($a, $b) {
      $sa = isset($a['__sort']) ? (int) $a['__sort'] : 0;
      $sb = isset($b['__sort']) ? (int) $b['__sort'] : 0;
      if ($sa !== $sb) return $sa <=> $sb;

      $na = isset($a['name']) ? (string) $a['name'] : '';
      $nb = isset($b['name']) ? (string) $b['name'] : '';
      $cmp = strcmp($na, $nb);
      if ($cmp !== 0) return $cmp;

      return ((int) ($a['id'] ?? 0)) <=> ((int) ($b['id'] ?? 0));
    });

    // remove internal field
    foreach ($items as &$it) {
      if (isset($it['__sort'])) unset($it['__sort']);
    }
    unset($it);

    // If admin forgot to assign the paper category to varieties, the tax_query above returns 0 items.
    // In that case, we should NOT overwrite (effectively "delete") the existing varieties.json.
    // Only skip when there is already an existing file; otherwise, write an empty payload.
    $static_out = $static_paper_root . '/varieties.json';

    if (count($items) === 0 && is_file($static_out)) {
      $existing_payload = json_decode((string) file_get_contents($static_out), true);
      $existing_items = [];

      if (is_array($existing_payload)) {
        if (isset($existing_payload['items']) && is_array($existing_payload['items'])) {
          $existing_items = $existing_payload['items'];
        } elseif (array_values($existing_payload) === $existing_payload) {
          $existing_items = $existing_payload;
        }
      }

      if (!empty($existing_items)) {
        $items = $existing_items;
      } else {
        return;
      }
    }

    $point_cards = function_exists('tomato_get_variety_points_for_paper')
      ? tomato_get_variety_points_for_paper($paper)
      : [
          'winter-spring' => [],
          'summer-autumn' => [],
        ];

    $variety_headings = [
      'winter-spring' => isset($point_cards['winter-spring']['_heading']) && is_array($point_cards['winter-spring']['_heading'])
        ? $point_cards['winter-spring']['_heading']
        : [],
      'summer-autumn' => isset($point_cards['summer-autumn']['_heading']) && is_array($point_cards['summer-autumn']['_heading'])
        ? $point_cards['summer-autumn']['_heading']
        : [],
    ];

    $payload = [
      'paper' => $paper,
      'updated_at' => current_time('mysql'),
      'point_cards' => $point_cards,
      'variety_headings' => $variety_headings,
      'items' => $items,
    ];
    $json = wp_json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);

    // 1) Always write the public build output
    file_put_contents($static_out, $json);

    // 2) Also sync back into static-src so the source tree stays up to date
    //    (requested: currently only /static/... was updated).
    $src_paper_root = self::static_src_root() . '/' . $paper;
    if (is_dir($src_paper_root)) {
      $src_out = rtrim($src_paper_root, '/') . '/varieties.json';
      file_put_contents($src_out, $json);
    }
  }



  /**
   * Copy templates into /static/{paper}/
   * - index.html (category top): copy /static-src/{paper}/index.html if exists, else copy list.html
   * - list.html  (list page):     copy /static-src/{paper}/list.html
   * - detail.html (detail page):  copy /static-src/{paper}/detail.html
   */
  private static function sync_templates(string $paper): void {
    $paper = sanitize_title($paper);
    if (!self::paper_exists($paper)) {
      return;
    }

    $src = self::static_src_root() . '/' . $paper;
    $dst = self::static_root() . '/' . $paper;

    self::ensure_dir($dst);

    // list page
    @copy($src . '/list.html',   $dst . '/list.html');

    // detail page
    @copy($src . '/detail.html', $dst . '/detail.html');

    // category top (index)
    if (is_file($src . '/index.html')) {
      @copy($src . '/index.html', $dst . '/index.html');
    } else {
      // backward compatible: use list.html as index.html
      @copy($src . '/list.html', $dst . '/index.html');
    }

    // Copy any other per-paper static files (e.g. variety.html, varieties.json, assets)
    // so new files under /static-src/{paper}/ are automatically published without code changes.
    self::rcopy($src, $dst);

  }

  /** Build list + detail json for a paper */
  public static function build_paper(string $paper): void {
    $paper = sanitize_title($paper);
    if ($paper === '') {
      return;
    }
    if (!self::paper_exists($paper)) {
      // If templates don't exist, do nothing (paper not configured)
      return;
    }

    // Ensure shared assets in /static are up to date
    self::sync_common_assets();

    // Ensure uploads are available under /static for images
    self::sync_uploads_assets();

    self::sync_templates($paper);

    $static_paper_root = self::static_root() . '/' . $paper;
    $posts_dir = $static_paper_root . '/posts';
    self::ensure_dir($posts_dir);

    // Query published posts that have this category slug
    $q = new WP_Query([
      'post_type'      => 'post',
      'post_status'    => 'publish',
      'posts_per_page' => -1,
      'orderby'        => 'date',
      'order'          => 'DESC',
      'tax_query'      => [[
        'taxonomy' => 'category',
        'field'    => 'slug',
        'terms'    => [$paper],
      ]],
    ]);

    
$list = [];

    // Region/Prefecture mapping (used to derive region from prefecture when region is not selected)
    $prefecture_to_region = [
      '北海道' => '北海道',

      '青森県' => '東北',
      '岩手県' => '東北',
      '宮城県' => '東北',
      '秋田県' => '東北',
      '山形県' => '東北',
      '福島県' => '東北',

      '茨城県' => '関東',
      '栃木県' => '関東',
      '群馬県' => '関東',
      '埼玉県' => '関東',
      '千葉県' => '関東',
      '東京都' => '関東',
      '神奈川県' => '関東',

      '新潟県' => '中部',
      '富山県' => '中部',
      '石川県' => '中部',
      '福井県' => '中部',
      '山梨県' => '中部',
      '長野県' => '中部',
      '岐阜県' => '中部',
      '静岡県' => '中部',
      '愛知県' => '中部',

      '三重県' => '近畿',
      '滋賀県' => '近畿',
      '京都府' => '近畿',
      '大阪府' => '近畿',
      '兵庫県' => '近畿',
      '奈良県' => '近畿',
      '和歌山県' => '近畿',

      '鳥取県' => '中国',
      '島根県' => '中国',
      '岡山県' => '中国',
      '広島県' => '中国',
      '山口県' => '中国',

      '徳島県' => '四国',
      '香川県' => '四国',
      '愛媛県' => '四国',
      '高知県' => '四国',

      '福岡県' => '九州',
      '佐賀県' => '九州',
      '長崎県' => '九州',
      '熊本県' => '九州',
      '大分県' => '九州',
      '宮崎県' => '九州',
      '鹿児島県' => '九州',
      '沖縄県' => '九州',
    ];

    $region_name_to_slug = [
      '北海道' => 'hokkaido',
      '東北'   => 'tohoku',
      '関東'   => 'kanto',
      '中部'   => 'chubu',
      '近畿'   => 'kinki',
      '中国'   => 'chugoku',
      '四国'   => 'shikoku',
      '九州'   => 'kyushu',
    ];

    if ($q->have_posts()) {

      foreach ($q->posts as $p) {
        if (!($p instanceof WP_Post)) continue;

        $post_id = (int) $p->ID;

        $title    = get_the_title($p);
        $date     = get_post_time('c', false, $p);
        $date_ymd = get_post_time('Y-m-d', false, $p);

        // excerpt (plain) - keep it short
        $excerpt = has_excerpt($p) ? $p->post_excerpt : wp_trim_words(wp_strip_all_tags($p->post_content), 60, '…');
        $content_plain = trim(wp_strip_all_tags((string) $p->post_content));

        // slug: use post_name (keep as-is), but URL encode on the consumer side if needed
        $slug = $p->post_name;

        // featured image (relative path)
        $featured_image = self::get_featured_image_url($post_id);

        // article type (taxonomy: article_type)
        // - Export both the first item (backward compatible) and the full arrays.
        // - survey.json must not depend on only the first selected term.
        $article_type_terms = wp_get_post_terms($post_id, 'article_type', ['fields' => 'all']);
        $article_types = [];
        $article_type_slugs = [];
        $article_type = null;
        if (!is_wp_error($article_type_terms) && !empty($article_type_terms)) {
          foreach ($article_type_terms as $att) {
            if (isset($att->name) && $att->name !== '') $article_types[] = (string) $att->name;
            if (isset($att->slug) && $att->slug !== '') $article_type_slugs[] = (string) $att->slug;
          }
          if (!empty($article_types)) {
            $article_types = array_values(array_unique($article_types));
            $article_type = $article_types[0];
          }
          if (!empty($article_type_slugs)) {
            $article_type_slugs = array_values(array_unique($article_type_slugs));
          }
        }

        // article tags (taxonomy: article_tag)
        // Returns array of objects: [{name, slug}, ...]
        $article_tag_terms = wp_get_post_terms($post_id, 'article_tag', ['fields' => 'all']);
        $article_tags = [];
        if (!is_wp_error($article_tag_terms) && !empty($article_tag_terms)) {
          foreach ($article_tag_terms as $t) {
            if (!isset($t->name) || $t->name === '') continue;
            $article_tags[] = [
              'name' => $t->name,
              'slug' => isset($t->slug) ? $t->slug : '',
            ];
          }
        }

        // season (taxonomy: season)
        // Single-select in admin, but we safely take the first term if multiple exist.
        // e.g. "冬春" / "夏秋"
        $season_terms = wp_get_post_terms($post_id, 'season', ['fields' => 'all']);
        $season = null;
        $season_slug = null;
        if (!is_wp_error($season_terms) && !empty($season_terms)) {
          $st = $season_terms[0];
          $season = isset($st->name) ? $st->name : null;
          $season_slug = isset($st->slug) ? $st->slug : null;
        }

        // survey_year (taxonomy: survey_year / アンケート年度)
        // Single-select in admin.
        // Used by JA部会アンケート detail posts so survey.html can filter correctly by year.
        $survey_year_terms = wp_get_post_terms($post_id, 'survey_year', ['fields' => 'all']);
        $survey_year = null;
        $survey_year_slug = null;
        if (!is_wp_error($survey_year_terms) && !empty($survey_year_terms)) {
          $yt = $survey_year_terms[0];
          $survey_year = isset($yt->name) ? $yt->name : null;
          $survey_year_slug = isset($yt->slug) ? $yt->slug : null;
        }
        // variety_category (taxonomy: variety_category / 品種カテゴリ)
        // Multi-select in admin. We export both:
        // - variety_categories / variety_category_slugs (arrays)
        // - variety_category / variety_category_slug (first item, backward compatible)
        // e.g. "大玉トマト" / "ミディトマト" / "ミニトマト" / "台木用トマト"
        $variety_category_terms = wp_get_post_terms($post_id, 'variety_category', ['fields' => 'all']);
        $variety_categories = [];
        $variety_category_slugs = [];
        $variety_category = null;
        $variety_category_slug = null;

        if (!is_wp_error($variety_category_terms) && !empty($variety_category_terms)) {
          foreach ($variety_category_terms as $vt) {
            if (!isset($vt->name) || !isset($vt->slug)) continue;
            $variety_categories[] = $vt->name;
            $variety_category_slugs[] = $vt->slug;
          }
        } else {
          // Fallbacks:
          // - In some setups the selected value may be stored via ACF (taxonomy field) or post meta.
          // - Keep export resilient so posts.json always contains the chosen value.
          $fallback = null;

          // ACF taxonomy field (if exists) may return term object / term_id / array
          $acf_val = self::get_acf_field_value('variety_category', $post_id);
          if (!empty($acf_val)) {
            $fallback = $acf_val;
          } else {
            // Generic post meta fallback (could be slug, name, or term_id)
            $meta_val = get_post_meta($post_id, 'variety_category', true);
            if (!empty($meta_val)) {
              $fallback = $meta_val;
            }
          }

          // Normalize fallback into a list
          $fallback_list = [];
          if (is_array($fallback)) {
            $fallback_list = $fallback;
          } elseif (!empty($fallback)) {
            $fallback_list = [$fallback];
          }

          foreach ($fallback_list as $fb) {
            $term_obj = null;
            if (is_object($fb) && isset($fb->term_id)) {
              $term_obj = $fb; // likely WP_Term
            } elseif (is_numeric($fb)) {
              $term_obj = get_term(intval($fb), 'variety_category');
            } elseif (is_string($fb)) {
              $maybe = sanitize_title($fb);
              $term_obj = get_term_by('slug', $maybe, 'variety_category');
              if (!$term_obj) {
                $term_obj = get_term_by('name', $fb, 'variety_category');
              }
            }

            if ($term_obj && !is_wp_error($term_obj) && isset($term_obj->name) && isset($term_obj->slug)) {
              $variety_categories[] = $term_obj->name;
              $variety_category_slugs[] = $term_obj->slug;
            }
          }
        }

        // De-duplicate and set backward-compatible first values
        if (!empty($variety_categories)) {
          $variety_categories = array_values(array_unique($variety_categories));
        }
        if (!empty($variety_category_slugs)) {
          $variety_category_slugs = array_values(array_unique($variety_category_slugs));
        }
        if (!empty($variety_categories)) {
          $variety_category = $variety_categories[0];
        }
        if (!empty($variety_category_slugs)) {
          $variety_category_slug = $variety_category_slugs[0];
        }

        // region (taxonomy: region / 産地)
        // Multi-select in admin. We export both:
        // - regions / region_slugs (arrays)
        // - region / region_slug (first item, backward compatible)
        $region_terms = wp_get_post_terms($post_id, 'region', ['fields' => 'all']);
        $regions = [];
        $region_slugs = [];
        $region = null;
        $region_slug = null;
        if (!is_wp_error($region_terms) && !empty($region_terms)) {
          foreach ($region_terms as $rt) {
            if (!isset($rt->name) || !isset($rt->slug)) continue;
            $regions[] = $rt->name;
            $region_slugs[] = $rt->slug;
          }
          if (!empty($region_terms[0])) {
            $region = isset($region_terms[0]->name) ? $region_terms[0]->name : null;
            $region_slug = isset($region_terms[0]->slug) ? $region_terms[0]->slug : null;
          }
        }

        // prefecture (taxonomy: prefecture / 都道府県)
        // Multi-select in admin. We export both:
        // - prefectures / prefecture_slugs (arrays)
        // - prefecture / prefecture_slug (first item, backward compatible)
        $pref_terms = wp_get_post_terms($post_id, 'prefecture', ['fields' => 'all']);
        $prefectures = [];
        $prefecture_slugs = [];
        $prefecture = null;
        $prefecture_slug = null;
        if (!is_wp_error($pref_terms) && !empty($pref_terms)) {
          foreach ($pref_terms as $pt) {
            if (!isset($pt->name) || !isset($pt->slug)) continue;
            $prefectures[] = $pt->name;
            $prefecture_slugs[] = $pt->slug;
          }
          if (!empty($pref_terms[0])) {
            $prefecture = isset($pref_terms[0]->name) ? $pref_terms[0]->name : null;
            $prefecture_slug = isset($pref_terms[0]->slug) ? $pref_terms[0]->slug : null;
          }
        }

        // Derive region(s) from prefecture if region is not selected
        if ((empty($regions) || !$region || $region === '') && !empty($prefectures)) {
          $derived_regions = [];
          foreach ($prefectures as $pn) {
            if (isset($prefecture_to_region[$pn])) {
              $derived_regions[] = $prefecture_to_region[$pn];
            }
          }
          $derived_regions = array_values(array_unique(array_filter($derived_regions)));
          if (!empty($derived_regions)) {
            $regions = $derived_regions;
            $region = $derived_regions[0];
            $region_slug = isset($region_name_to_slug[$region]) ? $region_name_to_slug[$region] : $region_slug;
            $region_slugs = [];
            foreach ($regions as $rn) {
              if (isset($region_name_to_slug[$rn])) $region_slugs[] = $region_name_to_slug[$rn];
            }
          }
        }



                // Free viewable flag (ACF true_false) - if ON, users can read without login
        $free_viewable = self::get_acf_field_value('free_viewable', $post_id);
        if (!is_bool($free_viewable)) {
          $mv = get_post_meta($post_id, 'free_viewable', true);
          $free_viewable = ($mv === '1' || $mv === 1 || $mv === true);
        }

        $featured_image_display_mode = self::get_acf_field_value('featured_image_display_mode', $post_id);
        if (!is_string($featured_image_display_mode) || trim($featured_image_display_mode) === '') {
          $featured_image_display_mode = get_post_meta($post_id, 'featured_image_display_mode', true);
        }
        $featured_image_display_mode = trim((string) $featured_image_display_mode);
        if ($featured_image_display_mode !== 'third') {
          $featured_image_display_mode = 'full';
        }

        $body_image_tap_action = self::get_acf_field_value('body_image_tap_action', $post_id);
        if (!is_string($body_image_tap_action) || trim($body_image_tap_action) === '') {
          $body_image_tap_action = get_post_meta($post_id, 'body_image_tap_action', true);
        }
        $body_image_tap_action = trim((string) $body_image_tap_action);
        if ($body_image_tap_action !== 'normal') {
          $body_image_tap_action = 'popup';
        }

        $is_survey_sample = get_post_meta($post_id, '_tn_is_survey_sample', true);
        $is_survey_sample = ($is_survey_sample === '1' || $is_survey_sample === 1 || $is_survey_sample === true);

$list[] = [
          'id'       => $post_id,
          'title'    => $title,
          'date'     => $date,
          'date_ymd' => $date_ymd,
          'post_date' => $date_ymd,
          'excerpt'  => $excerpt,
          'content_plain' => $content_plain,
          'search_text' => trim(implode(' ', array_filter([$title, $excerpt, $content_plain, implode(' ', $article_types), implode(' ', $regions), implode(' ', $prefectures), implode(' ', $variety_categories)]))),
          'slug'     => $slug,
          // Use query param id for simplicity (detail.html?id=XX)
          'url'      => 'detail.html?id=' . $post_id,
          'featured_image' => $featured_image,
          'featured_image_display_mode' => $featured_image_display_mode,
          'body_image_tap_action' => $body_image_tap_action,
          'article_type' => $article_type,
          'article_types' => $article_types,
          'article_type_slugs' => $article_type_slugs,
          'article_tags' => $article_tags,
          'season' => $season,
          'season_slug' => $season_slug,
          'survey_year' => $survey_year,
          'survey_year_slug' => $survey_year_slug,
          'variety_category' => $variety_category,
          'variety_categories' => $variety_categories,
          'variety_category_slug' => $variety_category_slug,
          'variety_category_slugs' => $variety_category_slugs,
          'region' => $region,
'regions' => $regions,
          'region_slug' => $region_slug,
          'region_slugs' => $region_slugs,
          'prefecture' => $prefecture,
'prefectures' => $prefectures,
          'prefecture_slug' => $prefecture_slug,
          'prefecture_slugs' => $prefecture_slugs,
          'free_viewable' => $free_viewable ? 1 : 0,
          'member_scope' => $free_viewable ? 'free' : 'member',
          'is_survey_sample' => $is_survey_sample ? 1 : 0,
        ];

        // detail json
        // Reference materials / writer (ACF recommended, fallback to post meta)
        $reference_materials = self::get_acf_field_value('reference_materials', $post_id);
        if (!is_string($reference_materials)) {
          $reference_materials = get_post_meta($post_id, 'reference_materials', true);
        }
        $writer_name = self::get_acf_field_value('writer_name', $post_id);
        if (!is_string($writer_name)) {
          $writer_name = get_post_meta($post_id, 'writer_name', true);
        }

        // Columnists (up to 4 selected per post)
        // - ACF field: columnists (post_object multiple return_format=id)
        // - Fallback to post meta: columnists (array or comma-separated)
        $columnist_ids_raw = self::get_acf_field_value('columnists', $post_id);
        if (!is_array($columnist_ids_raw)) {
          $mv = get_post_meta($post_id, 'columnists', true);
          if (is_array($mv)) $columnist_ids_raw = $mv;
          elseif (is_string($mv) && $mv !== '') $columnist_ids_raw = array_map('trim', explode(',', $mv));
          else $columnist_ids_raw = [];
        }

        $columnist_ids = [];
        foreach ((array)$columnist_ids_raw as $v) {
          if ($v instanceof WP_Post) $v = $v->ID;
          if (is_string($v) && $v !== '' && is_numeric($v)) $v = (int)$v;
          if (is_int($v) && $v > 0) $columnist_ids[] = $v;
        }
        $columnist_ids = array_values(array_unique($columnist_ids));
        $columnist_ids = array_slice($columnist_ids, 0, 4);

        $columnists = [];
        if (!empty($columnist_ids)) {
          $c_posts = get_posts([
            'post_type' => 'tomato_columnist',
            'post__in' => $columnist_ids,
            'orderby' => 'post__in',
            'posts_per_page' => 4,
            'post_status' => 'publish',
          ]);
          foreach ($c_posts as $cp) {
            $c_id = (int)$cp->ID;
            $columnists[] = [
              'id' => $c_id,
              'name' => get_the_title($cp),
              'profession' => (string)get_post_meta($c_id, '_tomato_columnist_profession', true),
              'description' => (string)get_post_meta($c_id, '_tomato_columnist_description', true),
              'featured_image' => get_the_post_thumbnail_url($c_id, 'full') ?: '',
            ];
          }
        }

        // Sidebar placement (single ad_item selected per post)
        // - ACF field: sidebar_ad_item (post_object return_format=id)
        // - Fallback to post meta: sidebar_ad_item
        $sidebar_ad_item_id = self::get_acf_field_value('sidebar_ad_item', $post_id);
        if ($sidebar_ad_item_id instanceof WP_Post) {
          $sidebar_ad_item_id = (int) $sidebar_ad_item_id->ID;
        } elseif (is_string($sidebar_ad_item_id) && $sidebar_ad_item_id !== '' && is_numeric($sidebar_ad_item_id)) {
          $sidebar_ad_item_id = (int) $sidebar_ad_item_id;
        } elseif (!is_numeric($sidebar_ad_item_id)) {
          $mv = get_post_meta($post_id, 'sidebar_ad_item', true);
          $sidebar_ad_item_id = (is_numeric($mv) ? (int) $mv : 0);
        } else {
          $sidebar_ad_item_id = (int) $sidebar_ad_item_id;
        }

        $sidebar_ad = null;
        if ($sidebar_ad_item_id > 0) {
          $ad_post = get_post($sidebar_ad_item_id);
          if ($ad_post instanceof WP_Post && $ad_post->post_type === 'ad_item') {
            // URL
            $link_url = '';
            $acf_url = self::get_acf_field_value('link_url', $sidebar_ad_item_id);
            if (is_string($acf_url) && $acf_url !== '') {
              $link_url = $acf_url;
            } else {
              $meta_url = get_post_meta($sidebar_ad_item_id, 'link_url', true);
              if (is_string($meta_url) && $meta_url !== '') {
                $link_url = $meta_url;
              }
            }

            // Image
            $image_url = null;
            $acf_image = self::get_acf_field_value('image', $sidebar_ad_item_id);
            $image_url = self::resolve_media_to_url($acf_image);
            if (!$image_url) {
              $image_url = self::get_featured_image_url($sidebar_ad_item_id);
            }
            $image_rel = self::to_relative_path($image_url ? (string) $image_url : null);

            $sidebar_ad = [
              'id'    => (int) $sidebar_ad_item_id,
              'title' => get_the_title($ad_post),
              'url'   => $link_url,
              'image' => $image_rel,
            ];
          }
        }

        $detail = [
          'id'         => $post_id,
          'title'      => $title,
          'date'       => $date,
          'date_ymd'   => $date_ymd,
          // Keep raw HTML content (Gutenberg) as string
          'content'    => self::rewrite_uploads_urls_in_html(apply_filters('the_content', $p->post_content)),
          'slug'       => $slug,
          'categories' => [$paper],
          'featured_image' => $featured_image,
          'featured_image_display_mode' => $featured_image_display_mode,
          'body_image_tap_action' => $body_image_tap_action,
          'article_type' => $article_type,
          'article_types' => $article_types,
          'article_type_slugs' => $article_type_slugs,
          'article_tags' => $article_tags,
          'season' => $season,
          'season_slug' => $season_slug,
          'survey_year' => $survey_year,
          'survey_year_slug' => $survey_year_slug,
          'variety_category' => $variety_category,
          'variety_categories' => $variety_categories,
          'variety_category_slug' => $variety_category_slug,
          'variety_category_slugs' => $variety_category_slugs,
          'region' => $region,
'regions' => $regions,
          'region_slug' => $region_slug,
          'region_slugs' => $region_slugs,
          'prefecture' => $prefecture,
'prefectures' => $prefectures,
          'prefecture_slug' => $prefecture_slug,
          'prefecture_slugs' => $prefecture_slugs,
          'free_viewable' => $free_viewable ? 1 : 0,
          'member_scope' => $free_viewable ? 'free' : 'member',
          'is_survey_sample' => $is_survey_sample ? 1 : 0,
          'reference_materials' => is_string($reference_materials) ? trim($reference_materials) : '',
          'writer_name' => is_string($writer_name) ? trim($writer_name) : '',
          'columnists' => $columnists,

          'sidebar_ad' => $sidebar_ad,
        ];

        $detail_path = $posts_dir . '/' . $post_id . '.json';
        file_put_contents($detail_path, wp_json_encode($detail, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
      }
    }
    wp_reset_postdata();

    // posts.json
    $posts_json_path = $static_paper_root . '/posts.json';
    file_put_contents($posts_json_path, wp_json_encode($list, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));

    self::build_archive_filters_json($paper);
    self::build_menu_json($paper);

    // survey.json
    // - Dedicated dataset for 産地データ大全 page
    // - Source: normal posts whose 記事タイプ contains "産地データ大全"
    $survey_list = [];
    foreach ($list as $item) {
      if (!is_array($item)) continue;

      $article_type_name = isset($item['article_type']) ? trim((string) $item['article_type']) : '';
      $article_type_names = isset($item['article_types']) && is_array($item['article_types'])
        ? array_values(array_filter(array_map('strval', $item['article_types'])))
        : [];
      $article_type_slugs = isset($item['article_type_slugs']) && is_array($item['article_type_slugs'])
        ? array_values(array_filter(array_map('strval', $item['article_type_slugs'])))
        : [];

      $is_survey = false;
      if ($article_type_name === '産地データ大全') {
        $is_survey = true;
      } elseif (in_array('産地データ大全', $article_type_names, true)) {
        $is_survey = true;
      } elseif (in_array('survey', $article_type_slugs, true)) {
        $is_survey = true;
      }

      if (!$is_survey) continue;

      $survey_prefectures = [];
      if (isset($item['prefectures']) && is_array($item['prefectures'])) {
        $survey_prefectures = array_values(array_filter(array_map('strval', $item['prefectures'])));
      }

      $survey_prefecture_slugs = [];
      if (isset($item['prefecture_slugs']) && is_array($item['prefecture_slugs'])) {
        $survey_prefecture_slugs = array_values(array_filter(array_map('strval', $item['prefecture_slugs'])));
      }

      if (empty($survey_prefectures) && !empty($item['prefecture'])) {
        $survey_prefectures = [(string) $item['prefecture']];
      }
      if (empty($survey_prefecture_slugs) && !empty($item['prefecture_slug'])) {
        $survey_prefecture_slugs = [(string) $item['prefecture_slug']];
      }

      $survey_list[] = [
        'id' => isset($item['id']) ? intval($item['id']) : 0,
        'title' => isset($item['title']) ? (string) $item['title'] : '',
        'date' => isset($item['date']) ? (string) $item['date'] : '',
        'date_ymd' => isset($item['date_ymd']) ? (string) $item['date_ymd'] : '',
        'excerpt' => isset($item['excerpt']) ? (string) $item['excerpt'] : '',
        'slug' => isset($item['slug']) ? (string) $item['slug'] : '',
        'url' => isset($item['url']) ? (string) $item['url'] : '',
        'featured_image' => isset($item['featured_image']) ? (string) $item['featured_image'] : '',
        'prefectures' => $survey_prefectures,
        'prefecture_slugs' => $survey_prefecture_slugs,
        'regions' => isset($item['regions']) && is_array($item['regions']) ? array_values(array_filter(array_map('strval', $item['regions']))) : [],
        'region_slugs' => isset($item['region_slugs']) && is_array($item['region_slugs']) ? array_values(array_filter(array_map('strval', $item['region_slugs']))) : [],
        'survey_year' => isset($item['survey_year']) ? (string) $item['survey_year'] : '',
        'survey_year_slug' => isset($item['survey_year_slug']) ? (string) $item['survey_year_slug'] : '',
        'season' => isset($item['season']) ? (string) $item['season'] : '',
        'season_slug' => isset($item['season_slug']) ? (string) $item['season_slug'] : '',
      ];
    }

    usort($survey_list, function($a, $b) {
      $at = isset($a['date']) ? strtotime((string)$a['date']) : 0;
      $bt = isset($b['date']) ? strtotime((string)$b['date']) : 0;
      return $bt <=> $at;
    });

    $survey_json_path = $static_paper_root . '/survey.json';
    file_put_contents($survey_json_path, wp_json_encode($survey_list, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));

    // placements.json (ads/pr/sponsor)
    self::build_placements_json($paper);

    // varieties.json (variety master data)
    self::build_varieties_json($paper);

    // survey-top.json (JA部会アンケート TOP data by year/season)
    self::build_survey_top_json($paper);

    // market.json (market data: price/volume + diff/trend)
    // Generated by market-data.php (Tomato_Market_Data). Safe no-op if plugin not present.
    if (class_exists('Tomato_Market_Data') && method_exists('Tomato_Market_Data', 'export_json_for_paper')) {
      Tomato_Market_Data::export_json_for_paper($paper);
    }
  }



  /**
   * Read newspaper menu settings from the new per-menu ACF fields.
   * Falls back to the legacy repeater field when individual fields are empty.
   */
  private static function get_newspaper_menu_settings_map(int $newspaper_post_id): array {
    if ($newspaper_post_id <= 0) return [];

    $menu_settings_map = [];
    $article_type_terms = get_terms([
      'taxonomy' => 'article_type',
      'hide_empty' => false,
      'orderby' => 'id',
      'order' => 'ASC',
    ]);

    $default_items = [
      'featured' => [ 'key' => 'featured', 'label' => '特集記事', 'url' => './feature.html', 'order' => 1 ],
    ];

    if (!is_wp_error($article_type_terms) && !empty($article_type_terms)) {
      foreach ($article_type_terms as $term) {
        if (!($term instanceof WP_Term) || !isset($term->name)) continue;

        $name = trim((string) $term->name);
        $slug = isset($term->slug) ? trim((string) $term->slug) : '';
        if ($name === '') continue;

        $label = $name;
        $url = './list.html?article_type=' . rawurlencode($name);
        $key = $slug !== '' ? $slug : sanitize_title($name);

        switch ($name) {
          case 'トマトNEWS':
            $key = 'news';
            break;
          case '栽培技術':
            $key = 'cultivation';
            break;
          case '市場動向':
            $key = 'market';
            break;
          case 'コラム':
            $key = 'column';
            break;
          case '動画':
            $key = 'video';
            break;
          case '紙面':
            $key = 'paper';
            $label = '紙面';
            break;
          case '採録紙面':
            $key = 'paper';
            $label = '採録紙面';
            break;
          case '品種情報':
            $key = 'variety';
            $url = './variety.html';
            break;
          case '病害虫対策':
            $key = 'pest';
            $url = './pest-control.html';
            break;
          case 'WEBセミナー':
            $key = 'seminar';
            $url = './web-seminar.html';
            break;
          case 'JA部会アンケート':
            $key = 'survey';
            $url = './survey.html';
            break;
          case '特集記事':
          case 'トマト特集':
            $key = 'featured';
            $label = '特集記事';
            $url = './feature.html';
            break;
        }

        $current = isset($default_items[$key]) && is_array($default_items[$key]) ? $default_items[$key] : [];
        $current_label = isset($current['label']) ? trim((string) $current['label']) : '';
        $current_url = isset($current['url']) ? trim((string) $current['url']) : '';

        if ($key === 'featured') {
          $label = '特集記事';
          $url = './feature.html';
        } elseif ($key === 'paper' && $label === '採録紙面') {
          $current_label = '採録紙面';
        }

        if ($current_label === '' || $current_label === $key || ($key === 'paper' && $label === '採録紙面')) {
          $current_label = $label;
        }
        if ($url !== '') {
          $current_url = $url;
        }

        $default_items[$key] = [
          'key' => $key,
          'label' => $current_label,
          'url' => $current_url,
          'order' => 999,
        ];
      }
    }

    $default_items = array_values($default_items);
    foreach ($default_items as $index => $item) {
      $key = isset($item['key']) ? sanitize_title((string) $item['key']) : '';
      if ($key === '') continue;

      $order_field = 'menu_order_' . str_replace('-', '_', $key);
      $url_field = 'menu_url_' . str_replace('-', '_', $key);

      $order_value = self::get_acf_field_value($order_field, $newspaper_post_id);
      $url_value = self::get_acf_field_value($url_field, $newspaper_post_id);

      $order = is_numeric($order_value) && intval($order_value) > 0 ? intval($order_value) : ($index + 1);
      $url = is_string($url_value) ? trim($url_value) : '';
      if ($url === '') {
        $url = isset($item['url']) ? (string) $item['url'] : '';
      }

      $menu_settings_map[$key] = [
        'order' => $order,
        'url' => $url,
      ];
    }

    $raw_menu_settings = self::get_acf_field_value('menu_item_settings', $newspaper_post_id);
    if (is_array($raw_menu_settings)) {
      foreach ($raw_menu_settings as $row) {
        if (!is_array($row)) continue;
        $row_key = isset($row['menu_item_key']) ? sanitize_title((string) $row['menu_item_key']) : '';
        if ($row_key === '') continue;

        $current_order = isset($menu_settings_map[$row_key]['order']) ? intval($menu_settings_map[$row_key]['order']) : 0;
        $current_url = isset($menu_settings_map[$row_key]['url']) ? (string) $menu_settings_map[$row_key]['url'] : '';

        $row_order = isset($row['menu_order']) && $row['menu_order'] !== '' ? (int) $row['menu_order'] : 0;
        if ($current_order <= 0 && $row_order > 0) {
          $current_order = $row_order;
        }
        if ($current_order <= 0) $current_order = 999;

        $row_url = isset($row['menu_url']) ? trim((string) $row['menu_url']) : '';
        if ($current_url === '' && $row_url !== '') {
          $current_url = $row_url;
        }

        $menu_settings_map[$row_key] = [
          'order' => $current_order,
          'url' => $current_url,
        ];
      }
    }

    return $menu_settings_map;
  }

  /**
   * Build menu.json for header/footer navigation.
   *
   * Output:
   * - /static/{paper}/menu.json
   *
   * Behavior:
   * - Uses article_type terms as the main navigation source
   * - Converts specific known article types to dedicated page URLs
   * - Keeps a stable preferred order and appends new article types automatically
   */
  private static function build_menu_json(string $paper): void {
    $paper = sanitize_title($paper);
    if ($paper === '') return;
    if (!self::paper_exists($paper)) return;

    $static_paper_root = self::static_root() . '/' . $paper;
    self::ensure_dir($static_paper_root);

    $term_items = [];
    $article_type_terms = get_terms([
      'taxonomy' => 'article_type',
      'hide_empty' => false,
      'orderby' => 'id',
      'order' => 'ASC',
    ]);

    $preferred_order = [
      'featured',
      'news',
      'variety',
      'cultivation',
      'market',
      'pest',
      'seminar',
      'column',
      'video',
      'paper',
      'survey',
    ];
    $preferred_rank = array_flip($preferred_order);

    $newspaper_post_id = self::get_newspaper_post_id_by_paper($paper);
    $menu_settings_map = self::get_newspaper_menu_settings_map($newspaper_post_id);

    if (!is_wp_error($article_type_terms) && !empty($article_type_terms)) {
      foreach ($article_type_terms as $term) {
        if (!($term instanceof WP_Term) || !isset($term->name)) continue;

        $name = trim((string) $term->name);
        $slug = isset($term->slug) ? trim((string) $term->slug) : '';
        if ($name === '') continue;

        $label = $name;
        $url = './list.html?article_type=' . rawurlencode($name);
        $key = $slug !== '' ? $slug : sanitize_title($name);

        switch ($name) {
          case 'トマトNEWS':
            $key = 'news';
            break;

          case '栽培技術':
            $key = 'cultivation';
            break;

          case '市場動向':
            $key = 'market';
            break;

          case 'コラム':
            $key = 'column';
            break;

          case '動画':
            $key = 'video';
            break;

          case '紙面':
            $key = 'paper';
            $label = '紙面';
            break;

          case '採録紙面':
            $key = 'paper';
            $label = '採録紙面';
            break;

          case '品種情報':
            $key = 'variety';
            $url = './variety.html';
            break;

          case '病害虫対策':
            $key = 'pest';
            $url = './pest-control.html';
            break;

          case 'WEBセミナー':
            $key = 'seminar';
            $url = './web-seminar.html';
            break;

          case 'JA部会アンケート':
            $key = 'survey';
            $url = './survey.html';
            break;

          case '特集記事':
          case 'トマト特集':
            $key = 'featured';
            $label = '特集記事';
            $url = './feature.html';
            break;
        }

        $order = array_key_exists($key, $preferred_rank) ? (intval($preferred_rank[$key]) + 1) : 999;
        if (isset($menu_settings_map[$key])) {
          if (!empty($menu_settings_map[$key]['url'])) {
            $url = (string) $menu_settings_map[$key]['url'];
          }
          if (isset($menu_settings_map[$key]['order']) && intval($menu_settings_map[$key]['order']) > 0) {
            $order = intval($menu_settings_map[$key]['order']);
          }
        }

        $map_key = $key !== '' ? $key : 'menu-item';
        $current = isset($term_items[$map_key]) && is_array($term_items[$map_key]) ? $term_items[$map_key] : null;

        if ($map_key === 'featured') {
          $label = '特集記事';
          if (!isset($menu_settings_map[$map_key]['url']) || trim((string) $menu_settings_map[$map_key]['url']) === '') {
            $url = './feature.html';
          }
        }

        if ($map_key === 'paper') {
          $existing_label = $current && isset($current['label']) ? trim((string) $current['label']) : '';
          if ($existing_label === '採録紙面' && $label !== '採録紙面') {
            $label = $existing_label;
          }
          if ($label === '採録紙面') {
            // Prefer 採録紙面 when both 紙面 and 採録紙面 exist.
          } elseif ($existing_label === '採録紙面') {
            $label = '採録紙面';
          }
        }

        if ($current && isset($current['label']) && $map_key !== 'paper') {
          $label = (string) $current['label'];
        }
        if ($current && isset($current['url']) && $map_key !== 'paper' && (!isset($menu_settings_map[$map_key]['url']) || trim((string) $menu_settings_map[$map_key]['url']) === '')) {
          $url = (string) $current['url'];
        }
        if ($current && isset($current['order']) && isset($menu_settings_map[$map_key]['order']) && intval($menu_settings_map[$map_key]['order']) <= 0) {
          $order = intval($current['order']);
        }

        $term_items[$map_key] = [
          'key' => $map_key,
          'label' => $label,
          'url' => $url,
          'order' => $order,
        ];
      }
    }

    if (!isset($term_items['featured'])) {
      $featured_order = isset($menu_settings_map['featured']['order']) && intval($menu_settings_map['featured']['order']) > 0
        ? intval($menu_settings_map['featured']['order'])
        : 1;
      $featured_url = isset($menu_settings_map['featured']['url']) && trim((string) $menu_settings_map['featured']['url']) !== ''
        ? trim((string) $menu_settings_map['featured']['url'])
        : './feature.html';

      $term_items = ['featured' => [
        'key' => 'featured',
        'label' => '特集記事',
        'url' => $featured_url,
        'order' => $featured_order,
      ]] + $term_items;
    }

    $items = array_values($term_items);
    usort($items, static function(array $a, array $b) use ($preferred_rank) {
      $a_order = isset($a['order']) ? intval($a['order']) : 999;
      $b_order = isset($b['order']) ? intval($b['order']) : 999;
      if ($a_order !== $b_order) {
        return $a_order <=> $b_order;
      }

      $a_key = isset($a['key']) ? (string) $a['key'] : '';
      $b_key = isset($b['key']) ? (string) $b['key'] : '';
      $a_rank = array_key_exists($a_key, $preferred_rank) ? intval($preferred_rank[$a_key]) : 999;
      $b_rank = array_key_exists($b_key, $preferred_rank) ? intval($preferred_rank[$b_key]) : 999;
      if ($a_rank !== $b_rank) {
        return $a_rank <=> $b_rank;
      }

      $a_label = isset($a['label']) ? (string) $a['label'] : '';
      $b_label = isset($b['label']) ? (string) $b['label'] : '';
      return strcmp($a_label, $b_label);
    });

    $menu_json_path = $static_paper_root . '/menu.json';
    file_put_contents($menu_json_path, wp_json_encode($items, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
  }


  /**
   * Build archive-filters.json for archive search form.
   *
   * Output:
   * - /static/{paper}/archive-filters.json
   */
  private static function build_archive_filters_json(string $paper): void {
    $paper = sanitize_title($paper);
    if ($paper === '') return;
    if (!self::paper_exists($paper)) return;

    $static_paper_root = self::static_root() . '/' . $paper;
    self::ensure_dir($static_paper_root);

    $article_types = [];
    $article_type_details = [];
    $article_type_terms = get_terms([
      'taxonomy' => 'article_type',
      'hide_empty' => false,
      'orderby' => 'id',
      'order' => 'ASC',
    ]);
    if (!is_wp_error($article_type_terms) && !empty($article_type_terms)) {
      foreach ($article_type_terms as $term) {
        if ($term instanceof WP_Term && isset($term->name) && $term->name !== '') {
          $article_types[] = (string) $term->name;
          $article_type_details[] = [
            'name' => (string) $term->name,
            'slug' => isset($term->slug) ? (string) $term->slug : '',
            'description' => isset($term->description) ? (string) $term->description : '',
          ];
        }
      }
    }

    $regions = [];
    $region_terms = get_terms([
      'taxonomy' => 'region',
      'hide_empty' => false,
      'orderby' => 'id',
      'order' => 'ASC',
    ]);
    if (!is_wp_error($region_terms) && !empty($region_terms)) {
      foreach ($region_terms as $term) {
        if ($term instanceof WP_Term && isset($term->name) && $term->name !== '') {
          $regions[] = (string) $term->name;
        }
      }
    }

    $variety_categories = [];
    $variety_terms = get_terms([
      'taxonomy' => 'variety_category',
      'hide_empty' => false,
      'orderby' => 'id',
      'order' => 'ASC',
    ]);
    if (!is_wp_error($variety_terms) && !empty($variety_terms)) {
      foreach ($variety_terms as $term) {
        if ($term instanceof WP_Term && isset($term->name) && $term->name !== '') {
          $variety_categories[] = (string) $term->name;
        }
      }
    }

    $payload = [
      'article_types' => array_values(array_unique(array_filter($article_types))),
      'article_type_details' => array_values($article_type_details),
      'regions' => array_values(array_unique(array_filter($regions))),
      'variety_categories' => array_values(array_unique(array_filter($variety_categories))),
    ];

    $archive_filters_json_path = $static_paper_root . '/archive-filters.json';
    file_put_contents($archive_filters_json_path, wp_json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
  }

  /**
   * Build survey-top.json for a paper.
   *
   * Source:
   * - CPT: ja_survey_top
   * - Paper selector: ACF/meta field `survey_target_paper`
   * - Taxonomy: survey_year
   * - Season selector: ACF/meta field `survey_top_season`
   * - ACF fields: page_title, page_subtitle, hero_title, hero_description,
   *   detail_title, detail_subtitle, detail_description,
   *   total_producers, response_rate,
   *   survey_graph_1 .. survey_graph_4 (JSON arrays)
   *
   * Output:
   * - /static/{paper}/survey-top.json
   */
  private static function build_survey_top_json(string $paper): void {
    $paper = sanitize_title($paper);
    if ($paper === '') return;
    if (!self::paper_exists($paper)) return;

    $static_paper_root = self::static_root() . '/' . $paper;
    self::ensure_dir($static_paper_root);

    $items = [];

    $q = new WP_Query([
      'post_type'      => 'ja_survey_top',
      'post_status'    => 'publish',
      'posts_per_page' => -1,
      'orderby'        => 'date',
      'order'          => 'DESC',
    ]);

    if ($q->have_posts()) {
      foreach ($q->posts as $post) {
        if (!($post instanceof WP_Post)) continue;

        $id = (int) $post->ID;

        // JA survey TOP no longer uses duplicated category taxonomy.
        // Use the dedicated paper field first, and keep a legacy category fallback.
        $target_paper = self::get_acf_field_value('survey_target_paper', $id);
        if (!is_string($target_paper) || trim($target_paper) === '') {
          $target_paper = get_post_meta($id, 'survey_target_paper', true);
        }
        $target_paper = sanitize_title(is_string($target_paper) ? $target_paper : '');

        if ($target_paper === '') {
          $legacy_terms = get_the_terms($id, 'category');
          if ($legacy_terms && !is_wp_error($legacy_terms) && isset($legacy_terms[0])) {
            $target_paper = sanitize_title((string) $legacy_terms[0]->slug);
          }
        }

        if ($target_paper !== $paper) {
          continue;
        }

        $survey_year = self::get_acf_field_value('survey_top_year', $id);
        if (!is_string($survey_year) || trim($survey_year) === '') {
          $survey_year = get_post_meta($id, 'survey_top_year', true);
        }
        $survey_year = trim((string) $survey_year);

        if ($survey_year === '') {
          $year_terms = get_the_terms($id, 'survey_year');
          if ($year_terms && !is_wp_error($year_terms) && isset($year_terms[0])) {
            $survey_year = (string) $year_terms[0]->name;
          }
        }

        // survey_season taxonomy was removed from the CPT to avoid duplicate admin UI.
        // Use the ACF/meta select field and normalize to label + slug.
        $survey_season_slug = self::get_acf_field_value('survey_top_season', $id);
        if (!is_string($survey_season_slug) || trim($survey_season_slug) === '') {
          $survey_season_slug = get_post_meta($id, 'survey_top_season', true);
        }
        $survey_season_slug = sanitize_title(is_string($survey_season_slug) ? $survey_season_slug : '');

        $survey_season = '';
        if ($survey_season_slug === 'winter') {
          $survey_season = '冬春';
        } elseif ($survey_season_slug === 'summer') {
          $survey_season = '夏秋';
        }

        // Legacy fallback: support old survey_season taxonomy data if present.
        if ($survey_season_slug === '' || $survey_season === '') {
          $season_terms = get_the_terms($id, 'survey_season');
          if ($season_terms && !is_wp_error($season_terms) && isset($season_terms[0])) {
            $survey_season = (string) $season_terms[0]->name;
            $survey_season_slug = sanitize_title((string) $season_terms[0]->slug);
          }
        }

        $graphs = [];
        $graph_defs = [
          ['field' => 'survey_graph_1', 'id' => 'graph1', 'title' => '困っている害虫', 'section_title_field' => 'detail_section_1_title', 'section_text_field' => 'detail_section_1_text', 'section_highlight_field' => 'detail_section_1_highlight'],
          ['field' => 'survey_graph_2', 'id' => 'graph2', 'title' => '困っている病害', 'section_title_field' => 'detail_section_2_title', 'section_text_field' => 'detail_section_2_text', 'section_highlight_field' => 'detail_section_2_highlight'],
          ['field' => 'survey_graph_3', 'id' => 'graph3', 'title' => '困っている生理障害', 'section_title_field' => 'detail_section_3_title', 'section_text_field' => 'detail_section_3_text', 'section_highlight_field' => 'detail_section_3_highlight'],
          ['field' => 'survey_graph_4', 'id' => 'graph4', 'title' => '導入したい資機材', 'section_title_field' => 'detail_section_4_title', 'section_text_field' => 'detail_section_4_text', 'section_highlight_field' => 'detail_section_4_highlight'],
        ];

        foreach ($graph_defs as $def) {
          $raw = self::get_acf_field_value($def['field'], $id);
          if (!is_string($raw)) {
            $raw = get_post_meta($id, $def['field'], true);
          }
          $raw = is_string($raw) ? trim($raw) : '';

          $items_for_graph = [];
          if ($raw !== '') {
            $decoded = json_decode($raw, true);
            if (is_array($decoded)) {
              foreach ($decoded as $row) {
                if (!is_array($row)) continue;
                $label = isset($row['label']) ? trim((string) $row['label']) : (isset($row['name']) ? trim((string) $row['name']) : '');
                $value_raw = $row['value'] ?? ($row['percent'] ?? null);
                $value = is_numeric($value_raw) ? (float) $value_raw : 0;
                if ($label === '') continue;
                $items_for_graph[] = [
                  'label' => $label,
                  'value' => $value,
                ];
              }
            }
          }

          $section_title = self::get_acf_field_value($def['section_title_field'], $id);
          if (!is_string($section_title)) {
            $section_title = get_post_meta($id, $def['section_title_field'], true);
          }

          $section_text = self::get_acf_field_value($def['section_text_field'], $id);
          if (!is_string($section_text)) {
            $section_text = get_post_meta($id, $def['section_text_field'], true);
          }

          $section_highlight = self::get_acf_field_value($def['section_highlight_field'], $id);
          if (!is_string($section_highlight)) {
            $section_highlight = get_post_meta($id, $def['section_highlight_field'], true);
          }

          $graphs[] = [
            'id' => $def['id'],
            'title' => $def['title'],
            'section_title' => is_string($section_title) ? trim($section_title) : '',
            'section_text' => is_string($section_text) ? trim($section_text) : '',
            'section_highlight' => is_string($section_highlight) ? trim($section_highlight) : '',
            'items' => $items_for_graph,
          ];
        }

        $items[] = [
          'id' => $id,
          'title' => get_the_title($post),
          'page_title' => (string) self::get_acf_field_value('page_title', $id),
          'page_subtitle' => (string) self::get_acf_field_value('page_subtitle', $id),
          'hero_title' => (string) self::get_acf_field_value('hero_title', $id),
          'hero_description' => (string) self::get_acf_field_value('hero_description', $id),
          'detail_title' => (string) self::get_acf_field_value('detail_title', $id),
          'detail_subtitle' => (string) self::get_acf_field_value('detail_subtitle', $id),
          'detail_description' => (string) self::get_acf_field_value('detail_description', $id),
          'total_producers' => (string) self::get_acf_field_value('total_producers', $id),
          'response_rate' => (string) self::get_acf_field_value('response_rate', $id),
          'survey_target_paper' => $target_paper,
          'survey_year' => $survey_year,
          'survey_season' => $survey_season,
          'survey_season_slug' => $survey_season_slug,
          'graphs' => $graphs,
        ];
      }
    }
    wp_reset_postdata();

    usort($items, function($a, $b) {
      $ya = isset($a['survey_year']) ? (string) $a['survey_year'] : '';
      $yb = isset($b['survey_year']) ? (string) $b['survey_year'] : '';
      if ($ya !== $yb) {
        return strcmp($yb, $ya);
      }

      $season_order = ['winter' => 0, 'summer' => 1];
      $sa = $season_order[$a['survey_season_slug'] ?? ''] ?? 99;
      $sb = $season_order[$b['survey_season_slug'] ?? ''] ?? 99;
      if ($sa !== $sb) {
        return $sa <=> $sb;
      }

      return ((int)($b['id'] ?? 0)) <=> ((int)($a['id'] ?? 0));
    });

    $payload = [
      'items' => array_values($items),
      'year_options' => self::get_visible_survey_year_options(),
    ];

    $path = $static_paper_root . '/survey-top.json';
    file_put_contents($path, wp_json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
  }


  private static function get_visible_survey_year_options(): array {
    if (!taxonomy_exists('survey_year')) {
      return [
        ['label' => '2025年', 'value' => '2025', 'slug' => '2025'],
        ['label' => '2026年', 'value' => '2026', 'slug' => '2026'],
        ['label' => '2027年', 'value' => '2027', 'slug' => '2027'],
      ];
    }

    $terms = get_terms([
      'taxonomy' => 'survey_year',
      'hide_empty' => false,
    ]);

    if (is_wp_error($terms) || !is_array($terms)) {
      return [
        ['label' => '2025年', 'value' => '2025', 'slug' => '2025'],
        ['label' => '2026年', 'value' => '2026', 'slug' => '2026'],
        ['label' => '2027年', 'value' => '2027', 'slug' => '2027'],
      ];
    }

    $options = [];
    foreach ($terms as $term) {
      if (!($term instanceof WP_Term)) continue;

      $visible = false;
      if (function_exists('tn_get_survey_year_front_visible')) {
        $visible = (bool) tn_get_survey_year_front_visible($term);
      } else {
        $raw = get_term_meta($term->term_id, 'show_in_survey_selector', true);
        if ($raw === '' || $raw === null) {
          $visible = in_array((string) $term->slug, ['2025', '2026', '2027'], true) || in_array((string) $term->name, ['2025', '2026', '2027'], true);
        } else {
          $visible = $raw === '1';
        }
      }

      if (!$visible) continue;

      $value = trim((string) $term->slug);
      if ($value === '') {
        $value = trim((string) $term->name);
      }
      if ($value === '') continue;

      $options[] = [
        'label' => trim((string) $term->name) !== '' ? trim((string) $term->name) . '年' : $value . '年',
        'value' => $value,
        'slug' => trim((string) $term->slug),
      ];
    }

    usort($options, function($a, $b) {
      $va = isset($a['value']) ? (string) $a['value'] : '';
      $vb = isset($b['value']) ? (string) $b['value'] : '';
      $na = preg_match('/^\d+$/', $va) ? (int) $va : null;
      $nb = preg_match('/^\d+$/', $vb) ? (int) $vb : null;
      if ($na !== null && $nb !== null && $na !== $nb) {
        return $na <=> $nb;
      }
      return strcmp($va, $vb);
    });

    return array_values($options);
  }

  /** Build all papers that exist under /static-src */
  public static function build_all_papers(): void {
    // Ensure shared assets in /static are up to date
    self::sync_common_assets();

    // Ensure uploads are available under /static for images
    self::sync_uploads_assets();

    $root = self::static_src_root();
    if (!is_dir($root)) return;

    $dirs = glob($root . '/*', GLOB_ONLYDIR);
    if (!$dirs) return;

    foreach ($dirs as $dir) {
      $paper = basename($dir);
      if (self::paper_exists($paper)) {
        self::build_paper($paper);
      }
    }
  }

  /** Return papers for a post that have templates in /static-src */
  public static function get_papers_for_post(int $post_id): array {
    $post = get_post($post_id);
    if (!($post instanceof WP_Post)) return [];
    if (!in_array($post->post_type, ['post', 'ja_survey_top'], true)) return [];

    $papers = [];

    // Normal posts use the existing category taxonomy as paper selector.
    if ($post->post_type === 'post') {
      $terms = get_the_terms($post_id, 'category');
      if ($terms && !is_wp_error($terms)) {
        foreach ($terms as $t) {
          $slug = sanitize_title($t->slug);
          if ($slug && self::paper_exists($slug)) {
            $papers[] = $slug;
          }
        }
      }
      return array_values(array_unique($papers));
    }

    // JA survey TOP no longer uses duplicated category taxonomy.
    // Use the dedicated ACF/meta field instead.
    $paper = self::get_acf_field_value('survey_target_paper', $post_id);
    if (!is_string($paper) || trim($paper) === '') {
      $paper = get_post_meta($post_id, 'survey_target_paper', true);
    }
    $paper = sanitize_title(is_string($paper) ? $paper : '');
    if ($paper !== '' && self::paper_exists($paper)) {
      $papers[] = $paper;
    }

    // Legacy fallback: if an older post still has category terms, keep supporting it.
    if (empty($papers)) {
      $terms = get_the_terms($post_id, 'category');
      if ($terms && !is_wp_error($terms)) {
        foreach ($terms as $t) {
          $slug = sanitize_title($t->slug);
          if ($slug && self::paper_exists($slug)) {
            $papers[] = $slug;
          }
        }
      }
    }

    return array_values(array_unique($papers));
  }

  /** Return papers (paper taxonomy slugs) for an ad_item */
  public static function get_papers_for_ad_item(int $post_id): array {
    $post = get_post($post_id);
    if (!($post instanceof WP_Post)) return [];
    if ($post->post_type !== 'ad_item') return [];

    $terms = get_the_terms($post_id, 'paper');
    if (!$terms || is_wp_error($terms)) return [];

    $papers = [];
    foreach ($terms as $t) {
      $slug = sanitize_title($t->slug);
      if ($slug && self::paper_exists($slug)) {
        $papers[] = $slug;
      }
    }
    return array_values(array_unique($papers));
  }

  /** Delete a single detail json */
  public static function delete_detail_json(string $paper, int $post_id): void {
    $paper = sanitize_title($paper);
    if ($paper === '' || $post_id <= 0) return;

    $path = self::static_root() . '/' . $paper . '/posts/' . $post_id . '.json';
    if (is_file($path)) {
      @unlink($path);
    }
  }

  /** Schedule build via WP-Cron (best-effort) */
  public static function schedule_build(string $paper): void {
    $paper = sanitize_title($paper);
    if ($paper === '' || !self::paper_exists($paper)) return;

    $hook = 'tomato_static_build_paper';
    // Avoid flooding: if already scheduled, skip
    if (!wp_next_scheduled($hook, [$paper])) {
      wp_schedule_single_event(time() + 5, $hook, [$paper]);
    }
  }
}

} // end class_exists guard

// -----------------------------------------------------------------------------
// WP-Cron hook to build a paper
// -----------------------------------------------------------------------------
add_action('tomato_static_build_paper', function ($paper) {
  $paper = sanitize_title((string) $paper);
  if ($paper === '') return;
  Tomato_Static_Builder_ModeB::build_paper($paper);
}, 10, 1);

// -----------------------------------------------------------------------------
// Auto trigger on post changes
// -----------------------------------------------------------------------------

// When post is saved, if published rebuild related papers
add_action('save_post', function ($post_id, $post, $update) {
  if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) return;
  if (!($post instanceof WP_Post)) return;
  if (!in_array($post->post_type, ['post', 'ja_survey_top'], true)) return;

  if ($post->post_status !== 'publish') return;

  $papers = Tomato_Static_Builder_ModeB::get_papers_for_post((int) $post_id);
  foreach ($papers as $paper) {
    Tomato_Static_Builder_ModeB::schedule_build($paper);
  }
}, 10, 3);

// On status transition: if becoming non-publish from publish, cleanup detail json & rebuild list
add_action('transition_post_status', function ($new_status, $old_status, $post) {
  if (!($post instanceof WP_Post)) return;
  if (!in_array($post->post_type, ['post', 'ja_survey_top'], true)) return;

  $post_id = (int) $post->ID;

  if ($old_status === 'publish' && $new_status !== 'publish') {
    $papers = Tomato_Static_Builder_ModeB::get_papers_for_post($post_id);
    foreach ($papers as $paper) {
      Tomato_Static_Builder_ModeB::delete_detail_json($paper, $post_id);
      Tomato_Static_Builder_ModeB::schedule_build($paper);
    }
    return;
  }

  // If it becomes publish, or it stays publish (update), rebuild
  if ($new_status === 'publish') {
    $papers = Tomato_Static_Builder_ModeB::get_papers_for_post($post_id);
    foreach ($papers as $paper) {
      Tomato_Static_Builder_ModeB::schedule_build($paper);
    }
  }
}, 10, 3);

// When categories are changed (including on draft), if post is published rebuild
add_action('set_object_terms', function ($object_id, $terms, $tt_ids, $taxonomy, $append, $old_tt_ids) {
  if ($taxonomy !== 'category') {
    return;
  }
  $post_id = (int) $object_id;
  if ($post_id <= 0) {
    return;
  }

  $post = get_post($post_id);
  if (!($post instanceof WP_Post) || !in_array($post->post_type, ['post', 'ja_survey_top'], true)) {
    return;
  }

  // Remove stale detail json ONLY for categories that were removed (best-effort)
  // NOTE: Gutenberg calls set_object_terms() on every save, and $old_tt_ids contains "previous terms",
  // not "removed terms". If we delete based on $old_tt_ids alone, it will delete the current detail json
  // on every save. So we diff old vs new and delete only removed category slugs.
  $static_src = rtrim(ABSPATH, '/') . '/static-src';

  $old_slugs = [];
  if (is_array($old_tt_ids)) {
    foreach ($old_tt_ids as $tt_id) {
      $term = get_term_by('term_taxonomy_id', (int) $tt_id, 'category');
      if ($term && !is_wp_error($term)) {
        $slug = sanitize_title($term->slug);
        if ($slug && is_dir($static_src . '/' . $slug)) {
          $old_slugs[] = $slug;
        }
      }
    }
  }
  $old_slugs = array_values(array_unique($old_slugs));

  $new_slugs = [];
  if (is_array($tt_ids)) {
    foreach ($tt_ids as $tt_id) {
      $term = get_term_by('term_taxonomy_id', (int) $tt_id, 'category');
      if ($term && !is_wp_error($term)) {
        $slug = sanitize_title($term->slug);
        if ($slug && is_dir($static_src . '/' . $slug)) {
          $new_slugs[] = $slug;
        }
      }
    }
  } elseif (is_array($terms)) {
    // Fallback: sometimes $tt_ids may not be set; try to derive slugs from $terms.
    foreach ($terms as $t) {
      $term = is_object($t) ? $t : get_term((int) $t, 'category');
      if ($term && !is_wp_error($term)) {
        $slug = sanitize_title($term->slug);
        if ($slug && is_dir($static_src . '/' . $slug)) {
          $new_slugs[] = $slug;
        }
      }
    }
  }
  $new_slugs = array_values(array_unique($new_slugs));

  $removed_slugs = array_values(array_diff($old_slugs, $new_slugs));

  foreach ($removed_slugs as $paper) {
    Tomato_Static_Builder_ModeB::delete_detail_json($paper, $post_id);
    Tomato_Static_Builder_ModeB::schedule_build($paper);
  }

  // Rebuild new categories only if published
  if ($post->post_status === 'publish') {
    $papers = Tomato_Static_Builder_ModeB::get_papers_for_post((int) $post_id);
    foreach ($papers as $paper) {
      Tomato_Static_Builder_ModeB::schedule_build($paper);
    }
  }
}, 10, 6);

// Trash/delete -> cleanup detail and rebuild list
add_action('trashed_post', function ($post_id) {
  $post = get_post((int) $post_id);
  if (!($post instanceof WP_Post) || !in_array($post->post_type, ['post', 'ja_survey_top'], true)) {
    return;
  }
  $papers = Tomato_Static_Builder_ModeB::get_papers_for_post((int) $post_id);
  foreach ($papers as $paper) {
    Tomato_Static_Builder_ModeB::delete_detail_json($paper, (int) $post_id);
    Tomato_Static_Builder_ModeB::schedule_build($paper);
  }
});

add_action('before_delete_post', function ($post_id) {
  $post = get_post((int) $post_id);
  if (!($post instanceof WP_Post) || !in_array($post->post_type, ['post', 'ja_survey_top'], true)) {
    return;
  }
  $papers = Tomato_Static_Builder_ModeB::get_papers_for_post((int) $post_id);
  foreach ($papers as $paper) {
    Tomato_Static_Builder_ModeB::delete_detail_json($paper, (int) $post_id);
    Tomato_Static_Builder_ModeB::schedule_build($paper);
  }
});

// -----------------------------------------------------------------------------
// Auto trigger on ad_item changes (placements)
// -----------------------------------------------------------------------------

// When ad_item is saved, if published rebuild related papers
add_action('save_post', function ($post_id, $post, $update) {
  if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) return;
  if (!($post instanceof WP_Post)) return;
  if ($post->post_type !== 'ad_item') return;

  if ($post->post_status !== 'publish') return;

  $papers = Tomato_Static_Builder_ModeB::get_papers_for_ad_item((int) $post_id);
  foreach ($papers as $paper) {
    Tomato_Static_Builder_ModeB::schedule_build($paper);
  }
}, 20, 3);

// On status transition for ad_item -> rebuild placements (and keep templates/assets in sync)
add_action('transition_post_status', function ($new_status, $old_status, $post) {
  if (!($post instanceof WP_Post)) return;
  if ($post->post_type !== 'ad_item') return;

  $post_id = (int) $post->ID;
  $papers = Tomato_Static_Builder_ModeB::get_papers_for_ad_item($post_id);

  if ($old_status === 'publish' && $new_status !== 'publish') {
    foreach ($papers as $paper) {
      Tomato_Static_Builder_ModeB::schedule_build($paper);
    }
    return;
  }

  if ($new_status === 'publish') {
    foreach ($papers as $paper) {
      Tomato_Static_Builder_ModeB::schedule_build($paper);
    }
  }
}, 20, 3);

// Trash/delete ad_item -> rebuild placements
add_action('trashed_post', function ($post_id) {
  $post = get_post((int) $post_id);
  if (!($post instanceof WP_Post) || $post->post_type !== 'ad_item') {
    return;
  }
  $papers = Tomato_Static_Builder_ModeB::get_papers_for_ad_item((int) $post_id);
  foreach ($papers as $paper) {
    Tomato_Static_Builder_ModeB::schedule_build($paper);
  }
}, 20);

add_action('before_delete_post', function ($post_id) {
  $post = get_post((int) $post_id);
  if (!($post instanceof WP_Post) || $post->post_type !== 'ad_item') {
    return;
  }
  $papers = Tomato_Static_Builder_ModeB::get_papers_for_ad_item((int) $post_id);
  foreach ($papers as $paper) {
    Tomato_Static_Builder_ModeB::schedule_build($paper);
  }
}, 20);

// -----------------------------------------------------------------------------
// WP-CLI command (IMPORTANT: do NOT use eval-file; this plugin is already loaded)
// -----------------------------------------------------------------------------
if (defined('WP_CLI') && WP_CLI) {
  WP_CLI::add_command('static-build', function ($args, $assoc_args) {
    // Usage:
    //   wp static-build tomato
    //   wp static-build --all
    //   wp static-build --post=20

    if (!empty($assoc_args['all'])) {
      Tomato_Static_Builder_ModeB::build_all_papers();
      WP_CLI::success('Built all papers.');
      return;
    }

    if (!empty($assoc_args['post'])) {
      $post_id = (int) $assoc_args['post'];
      $papers = Tomato_Static_Builder_ModeB::get_papers_for_post($post_id);
      if (!$papers) {
        WP_CLI::warning("No papers found for post {$post_id} (or templates missing under /static-src).");
        return;
      }
      foreach ($papers as $paper) {
        Tomato_Static_Builder_ModeB::build_paper($paper);
      }
      WP_CLI::success('Built papers for post ' . $post_id . ': ' . implode(', ', $papers));
      return;
    }

    $paper = $args[0] ?? '';
    $paper = sanitize_title((string) $paper);
    if ($paper === '') {
      WP_CLI::error("Usage:\n  wp static-build <paper>\n  wp static-build --all\n  wp static-build --post=<ID>");
    }

    Tomato_Static_Builder_ModeB::build_paper($paper);
    WP_CLI::success('Built paper: ' . $paper);
  });
}