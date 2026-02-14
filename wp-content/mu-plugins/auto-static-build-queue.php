<?php
/**
 * Plugin Name: Tomato News - Auto Static Build Queue (MU)
 * Description: Queue static-build + S3 sync when content changes. Cron/CLI runner executes the job.
 */

if (!defined('ABSPATH')) {
  exit;
}

class Tomato_Auto_Static_Build_Queue
{
  private const OPTION_KEY = 'tomato_static_build_queue';
  private const LOG_DIR_REL = 'static-build-queue';
  private const LOG_FILE = 'build.log';

  private static function get_log_dir(): string
  {
    $upload_dir = wp_upload_dir();
    return trailingslashit($upload_dir['basedir']) . self::LOG_DIR_REL;
  }

  private static function get_log_file(): string
  {
    return trailingslashit(self::get_log_dir()) . self::LOG_FILE;
  }

  private static function ensure_log_dir(): void
  {
    $dir = self::get_log_dir();
    if (!is_dir($dir)) {
      wp_mkdir_p($dir);
    }
  }

  private static function log(string $message): void
  {
    self::ensure_log_dir();
    $line = '[' . gmdate('Y-m-d H:i:s') . ' UTC] ' . $message . "\n";
    @file_put_contents(self::get_log_file(), $line, FILE_APPEND);
  }

  public static function queue_build(array $papers, string $reason = ''): void
  {
    $papers = array_values(array_filter(array_map('sanitize_title', $papers)));
    if (empty($papers)) {
      return;
    }

    $queue = get_option(self::OPTION_KEY, []);
    if (!is_array($queue)) {
      $queue = [];
    }

    foreach ($papers as $paper) {
      if (!isset($queue[$paper])) {
        $queue[$paper] = [
          'paper' => $paper,
          'requested_at' => time(),
          'reasons' => [],
        ];
      }

      if ($reason !== '') {
        $queue[$paper]['reasons'][] = $reason;
      }
    }

    update_option(self::OPTION_KEY, $queue, false);

    self::log('Queued build: ' . implode(', ', $papers) . ($reason ? ' | reason: ' . $reason : ''));
  }

  public static function dequeue_build(string $paper): void
  {
    $paper = sanitize_title($paper);
    $queue = get_option(self::OPTION_KEY, []);
    if (!is_array($queue) || empty($queue[$paper])) {
      return;
    }

    unset($queue[$paper]);
    update_option(self::OPTION_KEY, $queue, false);

    self::log('Dequeued build: ' . $paper);
  }

  public static function get_queue(): array
  {
    $queue = get_option(self::OPTION_KEY, []);
    return is_array($queue) ? $queue : [];
  }

  public static function request_build(array $papers, string $reason = ''): void
  {
    self::queue_build($papers, $reason);

    // Kick a single WP-Cron event quickly (runner will pick up the queue).
    if (!wp_next_scheduled('tomato_static_build_queue_run')) {
      wp_schedule_single_event(time() + 10, 'tomato_static_build_queue_run');
      self::log('Scheduled WP-Cron tomato_static_build_queue_run');
    }
  }

  public static function on_save_newspaper($post_id, $post, $update): void
  {
    if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) {
      return;
    }
    if (defined('DOING_CRON') && DOING_CRON) {
      return;
    }

    $papers = self::get_papers_from_newspaper_master();
    if (empty($papers)) {
      $papers = self::get_default_papers();
    }

    self::request_build($papers, 'save_post_newspaper');
  }

  public static function on_terms_edited($term_id, $tt_id = null, $taxonomy = null): void
  {
    // Any taxonomy change may affect list/detail filtering; rebuild all papers.
    $papers = self::get_papers_from_newspaper_master();
    if (empty($papers)) {
      $papers = self::get_default_papers();
    }
    self::request_build($papers, 'term_edited:' . (string)$taxonomy);
  }

  public static function on_save_post($post_id, $post, $update): void
  {
    if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) {
      return;
    }
    if (defined('DOING_CRON') && DOING_CRON) {
      return;
    }

    // Only queue for standard posts (your static site content)
    if (!is_object($post) || ($post->post_type ?? '') !== 'post') {
      return;
    }

    $papers = self::detect_papers_from_post((int)$post_id);
    if (empty($papers)) {
      $papers = self::get_papers_from_newspaper_master();
    }
    if (empty($papers)) {
      $papers = self::get_default_papers();
    }

    self::request_build($papers, 'save_post');
  }

  public static function get_papers_from_newspaper_master(): array
  {
    $args = [
      'post_type' => 'newspaper',
      'post_status' => 'publish',
      'posts_per_page' => -1,
      'fields' => 'ids',
      'no_found_rows' => true,
    ];
    $ids = get_posts($args);
    $papers = [];

    foreach ($ids as $id) {
      $slug = get_post_field('post_name', $id);
      if ($slug) {
        $papers[] = sanitize_title($slug);
      }
    }

    $papers = array_values(array_unique(array_filter($papers)));

    return $papers;
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

  private static function get_default_papers(): array
  {
    // Default paper(s) when 新聞マスター is not configured yet.
    return ['tomato'];
  }
}

// Hook it up
add_action('save_post', [Tomato_Auto_Static_Build_Queue::class, 'on_save_post'], 10, 3);
add_action('save_post_newspaper', [Tomato_Auto_Static_Build_Queue::class, 'on_save_newspaper'], 10, 3);

add_action('edited_term', [Tomato_Auto_Static_Build_Queue::class, 'on_terms_edited'], 10, 3);
add_action('created_term', [Tomato_Auto_Static_Build_Queue::class, 'on_terms_edited'], 10, 3);

// The runner will hook this event and process the queue.
