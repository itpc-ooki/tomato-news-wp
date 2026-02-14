<?php
/**
 * Plugin Name: Tomato News - Auto Static Build Queue (MU)
 * Description: Queue static-build + S3 sync when content changes. Cron/CLI runner executes the job.
 */

if (!defined('ABSPATH')) exit;

class Tomato_Auto_Static_Build_Queue
{
  // Where we store a small queue/lock (must be writable by www-data)
  private static function queue_dir() {
    return WP_CONTENT_DIR . '/uploads/static-build-queue';
  }

  private static function ensure_dir() {
    $dir = self::queue_dir();
    if (!is_dir($dir)) {
      wp_mkdir_p($dir);
    }
    return $dir;
  }

  private static function request_file() {
    return self::ensure_dir() . '/requested.json';
  }

  private static function lock_file() {
    return self::ensure_dir() . '/running.lock';
  }

  private static function log_file() {
    return self::ensure_dir() . '/build.log';
  }

  private static function write_log($msg) {
    $line = '[' . gmdate('c') . '] ' . $msg . "\n";
    @file_put_contents(self::log_file(), $line, FILE_APPEND);
  }

  /**
   * Queue build request:
   * - $papers: array like ['tomato'] or ['all']
   * - debounce_seconds: run after last change
   */
  public static function request_build(array $papers, int $debounce_seconds = 60): void
  {
    $file = self::request_file();
    $now = time();

    $payload = [
      'requested_at' => $now,
      'run_after'    => $now + $debounce_seconds,
      'papers'       => array_values(array_unique($papers)),
    ];

    // Merge with existing request if present
    if (file_exists($file)) {
      $existing = json_decode((string)@file_get_contents($file), true);
      if (is_array($existing)) {
        $existing_papers = isset($existing['papers']) && is_array($existing['papers']) ? $existing['papers'] : [];
        $merged = array_values(array_unique(array_merge($existing_papers, $payload['papers'])));

        // If either includes "all", keep only all
        if (in_array('all', $merged, true)) {
          $merged = ['all'];
        }

        $payload['papers'] = $merged;
      }
    }

    @file_put_contents($file, json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
    self::write_log('Queued build: ' . implode(',', $payload['papers']) . ' run_after=' . gmdate('c', $payload['run_after']));
  }

  // === Hooks that should trigger builds ===

  public static function on_save_post($post_id, $post, $update): void
  {
    if (wp_is_post_revision($post_id)) return;
    if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;

    // Only trigger for your content types (adjust as needed)
    $pt = get_post_type($post_id);
    $allowed = ['post']; // add your CPTs if you have any
    if (!in_array($pt, $allowed, true)) return;

    // Only when status is publish (or scheduled publish becomes publish)
    $status = get_post_status($post_id);
    if (!in_array($status, ['publish'], true)) return;

    // Determine paper(s). If you have a taxonomy/category like tomato/leek/strawberry, detect it.
    // For now, assume category slug represents paper.
    $papers = self::detect_papers_from_post($post_id);
    if (empty($papers)) $papers = ['all'];

    self::request_build($papers, 60);
  }

  public static function on_save_newspaper($post_id, $post, $update): void
  {
    if (wp_is_post_revision($post_id) || (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE)) {
      return;
    }

    $status = get_post_status($post_id);
    if (!in_array($status, ['publish', 'future'], true)) {
      return;
    }

    $papers = self::get_papers_from_newspaper_master();
    if (empty($papers)) {
      $papers = self::get_default_papers();
    }

    self::request_build($papers);
  }


  public static function on_terms_edited($term_id, $tt_id, $taxonomy): void
  {
    // Taxonomy changes can affect listing pages/menus -> safer to rebuild all papers
    self::request_build(['all'], 60);
  }

  public static function on_option_updated($option, $old, $new): void
  {
    // If ACF options or settings affect placements/menus, rebuild all
    // You can narrow this by checking option names you actually use.
    self::request_build(['all'], 60);
  }


  private static function get_papers_from_newspaper_master(): array
  {
    // Option A: Auto-read papers from 「新聞マスター」 (CPT: newspaper)
    // ACF field key: newspaper_slug (required)
    $post_type = 'newspaper';
    if (!post_type_exists($post_type)) {
      return [];
    }

    $q = new WP_Query([
      'post_type'      => $post_type,
      'post_status'    => ['publish'],
      'posts_per_page' => -1,
      'fields'         => 'ids',
      'no_found_rows'  => true,
    ]);

    $papers = [];
    foreach ($q->posts as $pid) {
      $slug = '';
      if (function_exists('get_field')) {
        $slug = (string) get_field('newspaper_slug', $pid);
      }
      if ($slug === '') {
        $slug = (string) get_post_meta($pid, 'newspaper_slug', true);
      }

      $slug = strtolower(trim($slug));
      if ($slug !== '') {
        $papers[] = $slug;
      }
    }

    return array_values(array_unique($papers));
  }

  private static function detect_papers_from_post(int $post_id): array
  {
    // Option A: Rebuild all papers from 新聞マスター.
    $papers = self::get_papers_from_newspaper_master();
    if (!empty($papers)) {
      return $papers;
    }

    // Fallback (for local/dev before 新聞マスター is configured)
    return self::get_default_papers();
  }
}

// Hook it up
add_action('save_post', [Tomato_Auto_Static_Build_Queue::class, 'on_save_post'], 10, 3);
add_action('edited_terms', [Tomato_Auto_Static_Build_Queue::class, 'on_terms_edited'], 10, 3);
add_action('created_term', [Tomato_Auto_Static_Build_Queue::class, 'on_terms_edited'], 10, 3);
add_action('updated_option', [Tomato_Auto_Static_Build_Queue::class, 'on_option_updated'], 10, 3);

// When client adds/edits a paper in 「新聞マスター」, rebuild all papers.
add_action('save_post_newspaper', [Tomato_Auto_Static_Build_Queue::class, 'on_save_newspaper'], 10, 3);
