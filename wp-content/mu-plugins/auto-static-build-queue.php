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


  public static function on_save_market_data($post_id, $post, $update): void
  {
    if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) {
      return;
    }
    if (defined('DOING_CRON') && DOING_CRON) {
      return;
    }
    if (!is_object($post) || ($post->post_type ?? '') !== 'market_data') {
      return;
    }

    $papers = self::detect_papers_from_market_data((int) $post_id);
    self::request_build($papers, 'save_post_market_data');
  }


  public static function on_trashed_post($post_id): void
  {
    $post_id = (int)$post_id;
    $post = get_post($post_id);
    if (!$post || ($post->post_type ?? '') !== 'post') {
      return;
    }

    $papers = self::detect_papers_from_post($post_id);
    if (empty($papers)) {
      $papers = self::get_papers_from_newspaper_master();
    }
    if (empty($papers)) {
      $papers = self::get_default_papers();
    }

    self::request_build($papers, 'trashed_post');
  }

  public static function on_deleted_post($post_id): void
  {
    $post_id = (int)$post_id;

    // At this point the post may already be gone; rebuild all papers as safe fallback.
    $papers = self::get_papers_from_newspaper_master();
    if (empty($papers)) {
      $papers = self::get_default_papers();
    }

    self::request_build($papers, 'deleted_post');
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
    // Prefer explicit taxonomy/category slugs on the edited post.
    $papers = [];

    // 1) WordPress built-in categories (used in your staging admin: tomato/leek/...).
    $cat_slugs = wp_get_post_terms($post_id, 'category', ['fields' => 'slugs']);
    if (is_array($cat_slugs)) {
      foreach ($cat_slugs as $slug) {
        $normalized = self::normalize_paper_key((string) $slug);
        if ($normalized !== null) {
          $papers[] = $normalized;
        }
      }
    }

    // 2) Optional custom taxonomy "paper" (if you ever switch to it).
    if (empty($papers)) {
      $paper_slugs = wp_get_post_terms($post_id, 'paper', ['fields' => 'slugs']);
      if (is_array($paper_slugs)) {
        foreach ($paper_slugs as $slug) {
          $normalized = self::normalize_paper_key((string) $slug);
          if ($normalized !== null) {
            $papers[] = $normalized;
          }
        }
      }
    }

    $papers = array_values(array_unique(array_filter($papers)));

    if (!empty($papers)) {
      return $papers;
    }

    // Fallback: safest default.
    return self::get_default_papers();
  }


  
  private static function normalize_paper_key(string $raw): ?string
  {
    $raw = trim($raw);
    if ($raw === '') {
      return null;
    }

    // If it's percent-encoded (common when slugs contain Japanese), decode once.
    $decoded = urldecode($raw);

    // Known mappings (you can extend this if needed).
    $map = [
      'tomato' => 'tomato',
      'leek' => 'leek',
      'strawberry' => 'strawberry',

      // Japanese label variants -> slug
      'トマト' => 'tomato',
      'トマト新聞' => 'tomato',
      'ねぎ' => 'leek',
      'ネギ' => 'leek',
      'リーク' => 'leek',
      'いちご' => 'strawberry',
      'イチゴ' => 'strawberry',
      '苺' => 'strawberry',
    ];

    if (isset($map[$decoded])) {
      return $map[$decoded];
    }

    // If it's already a safe slug, keep it.
    if (preg_match('/^[a-z0-9][a-z0-9\-]*$/', $decoded)) {
      return $decoded;
    }

    // Last resort: sanitize_title may produce %xx for Japanese; reject those to avoid wrong folders.
    $san = sanitize_title($decoded);
    if ($san === '' || strpos($san, '%') !== false) {
      return null;
    }

    return $san;
  }


  private static function detect_papers_from_market_data(int $post_id): array
  {
    $papers = [];

    $paper_slugs = wp_get_post_terms($post_id, 'paper', ['fields' => 'slugs']);
    if (is_array($paper_slugs)) {
      foreach ($paper_slugs as $slug) {
        $normalized = self::normalize_paper_key((string) $slug);
        if ($normalized !== null) {
          $papers[] = $normalized;
        }
      }
    }

    $papers = array_values(array_unique(array_filter($papers)));

    if (!empty($papers)) {
      return $papers;
    }

    return self::get_default_papers();
  }

  public static function on_trashed_market_data($post_id): void
  {
    $post = get_post((int) $post_id);
    if (!($post instanceof WP_Post) || ($post->post_type ?? '') !== 'market_data') {
      return;
    }

    $papers = self::detect_papers_from_market_data((int) $post_id);
    self::request_build($papers, 'trashed_market_data');
  }

  public static function on_deleted_market_data($post_id): void
  {
    $post = get_post((int) $post_id);
    if ($post instanceof WP_Post && ($post->post_type ?? '') !== 'market_data') {
      return;
    }

    $papers = self::get_papers_from_newspaper_master();
    if (empty($papers)) {
      $papers = self::get_default_papers();
    }

    self::request_build($papers, 'deleted_market_data');
  }

  public static function on_transition_market_data_status($new_status, $old_status, $post): void
  {
    if (!($post instanceof WP_Post) || ($post->post_type ?? '') !== 'market_data') {
      return;
    }

    if ($new_status === $old_status) {
      return;
    }

    $papers = self::detect_papers_from_market_data((int) $post->ID);
    self::request_build($papers, 'transition_market_data:' . $old_status . '->' . $new_status);
  }

  private static function get_papers_for_ad_item(int $post_id): array
  {
    $post = get_post($post_id);
    if (!($post instanceof WP_Post) || ($post->post_type ?? '') !== 'ad_item') {
      return [];
    }

    $papers = [];

    $terms = get_the_terms($post_id, 'paper');
    if ($terms && !is_wp_error($terms)) {
      foreach ($terms as $term) {
        if (!is_object($term) || empty($term->slug)) {
          continue;
        }
        $slug = self::normalize_paper_key((string) $term->slug);
        if ($slug !== null) {
          $papers[] = $slug;
        }
      }
    }

    // Fallback during save when taxonomy terms are still coming from POST.
    if (empty($papers) && isset($_POST['tax_input']['paper'])) {
      $raw_terms = $_POST['tax_input']['paper'];
      if (!is_array($raw_terms)) {
        $raw_terms = [$raw_terms];
      }

      foreach ($raw_terms as $raw_term) {
        if (is_numeric($raw_term)) {
          $term = get_term((int) $raw_term, 'paper');
          if ($term && !is_wp_error($term) && !empty($term->slug)) {
            $slug = self::normalize_paper_key((string) $term->slug);
            if ($slug !== null) {
              $papers[] = $slug;
            }
          }
          continue;
        }

        $slug = self::normalize_paper_key((string) $raw_term);
        if ($slug !== null) {
          $papers[] = $slug;
        }
      }
    }

    $papers = array_values(array_unique(array_filter($papers)));

    if (!empty($papers)) {
      return $papers;
    }

    return self::get_papers_from_newspaper_master() ?: self::get_default_papers();
  }

  public static function on_save_ad_item($post_id, $post, $update): void
  {
    if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) {
      return;
    }
    if (defined('DOING_CRON') && DOING_CRON) {
      return;
    }
    if (!is_object($post) || ($post->post_type ?? '') !== 'ad_item') {
      return;
    }

    $papers = self::get_papers_for_ad_item((int) $post_id);
    self::request_build($papers, 'save_post_ad_item');
  }

  public static function on_transition_post_status($new_status, $old_status, $post): void
  {
    if (!($post instanceof WP_Post) || ($post->post_type ?? '') !== 'ad_item') {
      return;
    }

    if ($new_status === $old_status) {
      return;
    }

    $papers = self::get_papers_for_ad_item((int) $post->ID);
    self::request_build($papers, 'transition_ad_item:' . $old_status . '->' . $new_status);
  }

  public static function on_trashed_ad_item($post_id): void
  {
    $post = get_post((int) $post_id);
    if (!($post instanceof WP_Post) || ($post->post_type ?? '') !== 'ad_item') {
      return;
    }

    $papers = self::get_papers_for_ad_item((int) $post_id);
    self::request_build($papers, 'trashed_ad_item');
  }

  public static function on_deleted_ad_item($post_id): void
  {
    $post = get_post((int) $post_id);

    // before_delete_post runs before the post is actually removed, but tax terms may already be unstable.
    // Rebuild all papers as the safest fallback.
    if ($post instanceof WP_Post && ($post->post_type ?? '') !== 'ad_item') {
      return;
    }

    $papers = self::get_papers_from_newspaper_master();
    if (empty($papers)) {
      $papers = self::get_default_papers();
    }

    self::request_build($papers, 'deleted_ad_item');
  }

  public static function on_save_ja_survey_top($post_id, $post, $update): void
  {
    if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) {
      return;
    }
    if (defined('DOING_CRON') && DOING_CRON) {
      return;
    }
    if (!($post instanceof WP_Post) || ($post->post_type ?? '') !== 'ja_survey_top') {
      return;
    }

    $papers = self::get_papers_from_newspaper_master();
    if (empty($papers)) {
      $papers = self::get_default_papers();
    }

    self::request_build($papers, 'save_post_ja_survey_top');
  }

  public static function on_trashed_ja_survey_top($post_id): void
  {
    $post = get_post((int) $post_id);
    if (!($post instanceof WP_Post) || ($post->post_type ?? '') !== 'ja_survey_top') {
      return;
    }

    $papers = self::get_papers_from_newspaper_master();
    if (empty($papers)) {
      $papers = self::get_default_papers();
    }

    self::request_build($papers, 'trashed_ja_survey_top');
  }

  public static function on_deleted_ja_survey_top($post_id): void
  {
    $post = get_post((int) $post_id);
    if ($post instanceof WP_Post && ($post->post_type ?? '') !== 'ja_survey_top') {
      return;
    }

    $papers = self::get_papers_from_newspaper_master();
    if (empty($papers)) {
      $papers = self::get_default_papers();
    }

    self::request_build($papers, 'deleted_ja_survey_top');
  }

  public static function on_transition_ja_survey_top_status($new_status, $old_status, $post): void
  {
    if (!($post instanceof WP_Post) || ($post->post_type ?? '') !== 'ja_survey_top') {
      return;
    }

    if ($new_status === $old_status) {
      return;
    }

    $papers = self::get_papers_from_newspaper_master();
    if (empty($papers)) {
      $papers = self::get_default_papers();
    }

    self::request_build($papers, 'transition_ja_survey_top:' . $old_status . '->' . $new_status);
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
add_action('save_post_ad_item', [Tomato_Auto_Static_Build_Queue::class, 'on_save_ad_item'], 20, 3);
add_action('save_post_market_data', [Tomato_Auto_Static_Build_Queue::class, 'on_save_market_data'], 20, 3);
add_action('save_post_ja_survey_top', [Tomato_Auto_Static_Build_Queue::class, 'on_save_ja_survey_top'], 20, 3);

add_action('trashed_post', [Tomato_Auto_Static_Build_Queue::class, 'on_trashed_post'], 10, 1);
add_action('deleted_post', [Tomato_Auto_Static_Build_Queue::class, 'on_deleted_post'], 10, 1);
add_action('trashed_post', [Tomato_Auto_Static_Build_Queue::class, 'on_trashed_ad_item'], 20, 1);
add_action('trashed_post', [Tomato_Auto_Static_Build_Queue::class, 'on_trashed_market_data'], 30, 1);
add_action('trashed_post', [Tomato_Auto_Static_Build_Queue::class, 'on_trashed_ja_survey_top'], 40, 1);
add_action('before_delete_post', [Tomato_Auto_Static_Build_Queue::class, 'on_deleted_ad_item'], 20, 1);
add_action('before_delete_post', [Tomato_Auto_Static_Build_Queue::class, 'on_deleted_market_data'], 30, 1);
add_action('before_delete_post', [Tomato_Auto_Static_Build_Queue::class, 'on_deleted_ja_survey_top'], 40, 1);

add_action('transition_post_status', [Tomato_Auto_Static_Build_Queue::class, 'on_transition_post_status'], 20, 3);
add_action('transition_post_status', [Tomato_Auto_Static_Build_Queue::class, 'on_transition_market_data_status'], 30, 3);
add_action('transition_post_status', [Tomato_Auto_Static_Build_Queue::class, 'on_transition_ja_survey_top_status'], 40, 3);

add_action('edited_term', [Tomato_Auto_Static_Build_Queue::class, 'on_terms_edited'], 10, 3);
add_action('created_term', [Tomato_Auto_Static_Build_Queue::class, 'on_terms_edited'], 10, 3);

// Queue is consumed by the static_builder container (polls the option).
