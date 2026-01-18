<?php
/**
 * Static JSON Builder (Mode B)
 *
 * Purpose
 * - For each "paper" (category slug), generate JSON files for list & detail.
 * - Copy per-paper templates into /static/{paper}/ as index.html + detail.html.
 *
 * Output
 * - /static/{paper}/posts.json        (list)
 * - /static/{paper}/posts/{id}.json   (detail)
 * - /static/{paper}/index.html        (copied from /static-src/{paper}/list.html)
 * - /static/{paper}/detail.html       (copied from /static-src/{paper}/detail.html)
 *
 * Notes
 * - This file is loaded as an MU plugin, so it is loaded on every request.
 * - Do NOT run wp-cli "eval-file" against this file (it will load twice and redeclare classes).
 *   Use the registered WP-CLI command: `wp static-build ...`
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

  /** @return bool */
  public static function paper_exists(string $paper): bool {
    $paper = sanitize_title($paper);
    if ($paper === '') return false;

    $src = self::static_src_root() . '/' . $paper;
    return is_dir($src) && is_file($src . '/list.html') && is_file($src . '/detail.html');
  }

  /** Ensure directory exists */
  private static function ensure_dir(string $path): void {
    if (!is_dir($path)) {
      wp_mkdir_p($path);
    }
  }

  /** Copy templates list/detail into /static/{paper}/ */
  private static function sync_templates(string $paper): void {
    $paper = sanitize_title($paper);
    if (!self::paper_exists($paper)) {
      return;
    }

    $src = self::static_src_root() . '/' . $paper;
    $dst = self::static_root() . '/' . $paper;

    self::ensure_dir($dst);

    @copy($src . '/list.html',   $dst . '/index.html');
    @copy($src . '/detail.html', $dst . '/detail.html');
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

    if ($q->have_posts()) {
      foreach ($q->posts as $p) {
        if (!($p instanceof WP_Post)) continue;

        $post_id = (int) $p->ID;

        $title   = get_the_title($p);
        $date    = get_post_time('c', false, $p);
        $date_ymd = get_post_time('Y-m-d', false, $p);

        // excerpt (plain) - keep it short
        $excerpt = has_excerpt($p) ? $p->post_excerpt : wp_trim_words(wp_strip_all_tags($p->post_content), 60, '…');

        // slug: use post_name (keep as-is), but URL encode on the consumer side if needed
        $slug = $p->post_name;

        $list[] = [
          'id'       => $post_id,
          'title'    => $title,
          'date'     => $date,
          'date_ymd' => $date_ymd,
          'excerpt'  => $excerpt,
          'slug'     => $slug,
          // Use query param id for simplicity (detail.html?id=XX)
          'url'      => 'detail.html?id=' . $post_id,
        ];

        // detail json
        $detail = [
          'id'         => $post_id,
          'title'      => $title,
          'date'       => $date,
          'date_ymd'   => $date_ymd,
          // Keep raw HTML content (Gutenberg) as string
          'content'    => apply_filters('the_content', $p->post_content),
          'slug'       => $slug,
          'categories' => [$paper],
        ];

        $detail_path = $posts_dir . '/' . $post_id . '.json';
        file_put_contents($detail_path, wp_json_encode($detail, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
      }
    }
    wp_reset_postdata();

    // posts.json
    $posts_json_path = $static_paper_root . '/posts.json';
    file_put_contents($posts_json_path, wp_json_encode($list, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
  }

  /** Build all papers that exist under /static-src */
  public static function build_all_papers(): void {
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

  /** Return papers (category slugs) for a post that have templates in /static-src */
  public static function get_papers_for_post(int $post_id): array {
    $post = get_post($post_id);
    if (!($post instanceof WP_Post)) return [];
    if ($post->post_type !== 'post') return [];

    $terms = get_the_terms($post_id, 'category');
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
  if ($post->post_type !== 'post') return;

  if ($post->post_status !== 'publish') return;

  $papers = Tomato_Static_Builder_ModeB::get_papers_for_post((int) $post_id);
  foreach ($papers as $paper) {
    Tomato_Static_Builder_ModeB::schedule_build($paper);
  }
}, 10, 3);

// On status transition: if becoming non-publish from publish, cleanup detail json & rebuild list
add_action('transition_post_status', function ($new_status, $old_status, $post) {
  if (!($post instanceof WP_Post)) return;
  if ($post->post_type !== 'post') return;

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
  if (!($post instanceof WP_Post) || $post->post_type !== 'post') {
    return;
  }

  // Remove stale detail json from old categories (best-effort)
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

  foreach ($old_slugs as $paper) {
    Tomato_Static_Builder_ModeB::delete_detail_json($paper, $post_id);
    Tomato_Static_Builder_ModeB::schedule_build($paper);
  }

  // Rebuild new categories only if published
  if ($post->post_status === 'publish') {
    $papers = Tomato_Static_Builder_ModeB::get_papers_for_post($post_id);
    foreach ($papers as $paper) {
      Tomato_Static_Builder_ModeB::schedule_build($paper);
    }
  }
}, 10, 6);

// Trash/delete -> cleanup detail and rebuild list
add_action('trashed_post', function ($post_id) {
  $post = get_post((int) $post_id);
  if (!($post instanceof WP_Post) || $post->post_type !== 'post') {
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
  if (!($post instanceof WP_Post) || $post->post_type !== 'post') {
    return;
  }
  $papers = Tomato_Static_Builder_ModeB::get_papers_for_post((int) $post_id);
  foreach ($papers as $paper) {
    Tomato_Static_Builder_ModeB::delete_detail_json($paper, (int) $post_id);
    Tomato_Static_Builder_ModeB::schedule_build($paper);
  }
});

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
