<?php
/**
 * Tomato Auto Static Build Runner (MU plugin)
 *
 * - Reads queued requests from wp-content/uploads/static-build-queue/requested.json
 * - Runs static build (wp static-build ...)
 * - Syncs to S3 if TOMATO_STATIC_S3_TARGET is set
 */

if (!class_exists('Tomato_Auto_Static_Build_Runner')) {
  class Tomato_Auto_Static_Build_Runner {

    private const LOCK_FILE = 'wp-content/uploads/static-build-queue/.lock';
    private const QUEUE_DIR = 'wp-content/uploads/static-build-queue';
    private const REQUESTED_JSON = 'wp-content/uploads/static-build-queue/requested.json';
    private const BUILD_LOG = 'wp-content/uploads/static-build-queue/build.log';
    private const LOCK_STALE_SECONDS = 300;

    private static function lock_path(): string {
      return ABSPATH . ltrim(self::LOCK_FILE, '/');
    }

    private static function queue_dir_path(): string {
      return ABSPATH . ltrim(self::QUEUE_DIR, '/');
    }

    private static function requested_json_path(): string {
      return ABSPATH . ltrim(self::REQUESTED_JSON, '/');
    }

    private static function build_log_path(): string {
      return ABSPATH . ltrim(self::BUILD_LOG, '/');
    }

    private static function ensure_queue_dir(): void {
      $dir = self::queue_dir_path();
      if (!is_dir($dir)) {
        wp_mkdir_p($dir);
      }
    }

    private static function is_locked(): bool {
      $path = self::lock_path();
      if (!file_exists($path)) {
        return false;
      }

      $lock_time = 0;
      $raw = @file_get_contents($path);
      if ($raw !== false) {
        $raw = trim((string) $raw);
        if ($raw !== '' && ctype_digit($raw)) {
          $lock_time = (int) $raw;
        }
      }

      if ($lock_time <= 0) {
        $mtime = @filemtime($path);
        if ($mtime !== false) {
          $lock_time = (int) $mtime;
        }
      }

      if ($lock_time > 0 && (time() - $lock_time) > self::LOCK_STALE_SECONDS) {
        self::append_log('Stale lock detected; removing .lock (age=' . (time() - $lock_time) . 's)');
        @unlink($path);
        clearstatcache(true, $path);
        return file_exists($path);
      }

      return true;
    }

    private static function lock(): void {
      self::ensure_queue_dir();
      @file_put_contents(self::lock_path(), (string) time());
    }

    private static function unlock(): void {
      @unlink(self::lock_path());
    }

    private static function read_requested(): ?array {
      $path = self::requested_json_path();
      if (!file_exists($path)) return null;
      $raw = @file_get_contents($path);
      if ($raw === false) return null;
      $data = json_decode($raw, true);
      if (!is_array($data)) return null;
      return $data;
    }

private const QUEUE_OPTION_KEY = 'tomato_static_build_queue';

/**
 * Queue option format (from auto-static-build-queue.php):
 *   [
 *     'tomato' => [
 *       'paper' => 'tomato',
 *       'requested_at' => 1712345678,
 *       'reasons' => [...],
 *     ],
 *     ...
 *   ]
 */
private static function read_queue_option(): array {
  $queue = get_option(self::QUEUE_OPTION_KEY, []);
  if (!is_array($queue)) {
    return [];
  }
  // Remove any empty / invalid keys
  foreach ($queue as $k => $v) {
    if (!is_string($k) || $k === '') {
      unset($queue[$k]);
    }
  }
  return $queue;
}

private static function remove_queue_items(array $papers): void {
  if (empty($papers)) return;
  $queue = get_option(self::QUEUE_OPTION_KEY, []);
  if (!is_array($queue)) $queue = [];

  $changed = false;
  foreach ($papers as $paper) {
    if (isset($queue[$paper])) {
      unset($queue[$paper]);
      $changed = true;
    }
  }

  if ($changed) {
    update_option(self::QUEUE_OPTION_KEY, $queue, false);
  }
}

    private static function append_log(string $line): void {
      self::ensure_queue_dir();
      $path = self::build_log_path();
      $ts = gmdate('Y-m-d\\TH:i:s\\Z');
      @file_put_contents($path, sprintf("[%s] %s\n", $ts, $line), FILE_APPEND);
    }

    public static function external_log(string $line): void {
      self::append_log($line);
    }

    /**
     * Run build+sync if due.
     *
     * @param bool $force Run immediately (ignore debounce timer)
     */
    public static function run(bool $force = false): void {
      self::ensure_queue_dir();

      if (self::is_locked()) {
        self::append_log('Skip: locked');
        return;
      }

      self::run_scheduled_actions();
      self::run_due_future_publications();

      $queue = self::read_queue_option();
if (!$queue) {
  self::append_log('Skip: empty queue');
  return;
}

$papers = array_keys($queue);
$papers = array_values(array_unique(array_filter($papers, function ($p) { return is_string($p) && $p !== ''; })));
if (empty($papers)) {
  self::append_log('Skip: queue has no paper keys');
  return;
}
self::lock();
      try {
        self::append_log('Start build: papers=' . implode(',', $papers));

        // Run static build
        self::run_static_build($papers);

        // Sync to S3 if configured
        self::run_s3_sync();


        // Auto CloudFront invalidation (optional; keeps cache but updates immediately)
        self::run_cloudfront_invalidation($papers);
        self::remove_queue_items($papers);
        self::append_log('Done build');
      } catch (\Throwable $e) {
        self::append_log('ERROR: ' . $e->getMessage());
        throw $e;
      } finally {
        self::unlock();
      }
    }

    
  private static function normalize_paper_key(string $raw): ?string
  {
    $raw = trim($raw);
    if ($raw === '') {
      return null;
    }

    $decoded = urldecode($raw);

    $map = [
      'tomato' => 'tomato',
      'leek' => 'leek',
      'strawberry' => 'strawberry',

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

    if (preg_match('/^[a-z0-9][a-z0-9\-]*$/', $decoded)) {
      return $decoded;
    }

    $san = sanitize_title($decoded);
    if ($san === '' || strpos($san, '%') !== false) {
      return null;
    }

    return $san;
  }

private static function run_static_build(array $papers): void {
  if (!defined('WP_CLI') || !WP_CLI) {
    self::append_log('Skip build: not WP_CLI');
    return;
  }

  // Normalize + de-duplicate
  $normalized_papers = [];
  foreach ($papers as $p) {
    $n = self::normalize_paper_key((string) $p);
    if ($n !== null) $normalized_papers[] = $n;
  }
  $normalized_papers = array_values(array_unique($normalized_papers));
  if (empty($normalized_papers)) {
    $normalized_papers = ['tomato'];
  }

  foreach ($normalized_papers as $paper) {
    // NOTE: cli-static-build.php registers "static-build".
    // The command signature in this project is: wp static-build <paper>
    $cmd = sprintf('static-build %s', escapeshellarg($paper));
    \WP_CLI::log('Running: wp ' . $cmd);

    $exit_code = 0;
    // Use WP_CLI to execute so it inherits WP/ABSPATH context correctly.
    \WP_CLI::runcommand($cmd, ['launch' => true, 'return' => 'all', 'exit_error' => false], $exit_code);

    if ((int)$exit_code !== 0) {
      \WP_CLI::error('static-build failed for ' . $paper . ' (exit=' . $exit_code . ')');
    }
  }
}




    private static function run_scheduled_actions(): void {
      if (!defined('WP_CLI') || !WP_CLI) {
        self::append_log('Skip scheduled-actions: not WP_CLI');
        return;
      }

      $exit_code = 0;
      $result = \WP_CLI::runcommand('tomato scheduled-actions-run', [
        'launch' => true,
        'return' => 'all',
        'exit_error' => false,
      ], $exit_code);

      if ((int) $exit_code !== 0) {
        self::append_log('Scheduled actions runner failed (exit=' . $exit_code . ')');
        return;
      }

      $stdout = '';
      if (is_object($result) && isset($result->stdout)) {
        $stdout = (string) $result->stdout;
      } elseif (is_array($result) && isset($result['stdout'])) {
        $stdout = (string) $result['stdout'];
      } elseif (is_string($result)) {
        $stdout = $result;
      }

      $stdout = trim($stdout);
      if ($stdout !== '') {
        self::append_log('Scheduled actions: ' . preg_replace('/\s+/', ' ', $stdout));
      }
    }


    private static function run_due_future_publications(): void {
      $now_gmt = gmdate('Y-m-d H:i:s');

      $query = new \WP_Query([
        'post_type' => ['post', 'page'],
        'post_status' => 'future',
        'posts_per_page' => 100,
        'fields' => 'ids',
        'orderby' => 'date',
        'order' => 'ASC',
        'no_found_rows' => true,
        'cache_results' => false,
        'update_post_meta_cache' => false,
        'update_post_term_cache' => false,
        'date_query' => [[
          'column' => 'post_date_gmt',
          'before' => $now_gmt,
          'inclusive' => true,
        ]],
      ]);

      if (empty($query->posts)) {
        return;
      }

      $processed = 0;
      foreach ($query->posts as $post_id) {
        $post_id = (int) $post_id;
        $post = get_post($post_id);
        if (!($post instanceof \WP_Post)) {
          continue;
        }

        if ($post->post_status !== 'future') {
          continue;
        }

        if (function_exists('check_and_publish_future_post')) {
          check_and_publish_future_post($post_id);
        } else {
          wp_publish_post($post_id);
        }

        clean_post_cache($post_id);
        $updated_post = get_post($post_id);
        if (!($updated_post instanceof \WP_Post) || $updated_post->post_status !== 'publish') {
          self::append_log('Future publish skipped/failed for post ID ' . $post_id . '. Current status: ' . (($updated_post instanceof \WP_Post) ? $updated_post->post_status : 'missing'));
          continue;
        }

        self::queue_build_for_post($updated_post, 'future_publish');
        self::append_log('Future publish OK for post ID ' . $post_id . '.');
        $processed++;
      }

      if ($processed > 0) {
        self::append_log('Processed due future publications: ' . $processed);
      }

      wp_reset_postdata();
    }

    private static function queue_build_for_post(\WP_Post $post, string $reason): void {
      if (!class_exists('Tomato_Auto_Static_Build_Queue')) {
        return;
      }

      $papers = [];
      if ($post->post_type === 'post') {
        $cat_slugs = wp_get_post_terms($post->ID, 'category', ['fields' => 'slugs']);
        if (is_array($cat_slugs)) {
          foreach ($cat_slugs as $slug) {
            $normalized = self::normalize_paper_key((string) $slug);
            if ($normalized !== null) {
              $papers[] = $normalized;
            }
          }
        }
      }

      if (empty($papers) && class_exists('Tomato_Auto_Static_Build_Queue') && method_exists('Tomato_Auto_Static_Build_Queue', 'get_papers_from_newspaper_master')) {
        $papers = Tomato_Auto_Static_Build_Queue::get_papers_from_newspaper_master();
      }

      if (empty($papers)) {
        $papers = ['tomato'];
      }

      $papers = array_values(array_unique(array_filter($papers, function ($paper) {
        return is_string($paper) && $paper !== '';
      })));

      if (!empty($papers)) {
        Tomato_Auto_Static_Build_Queue::request_build($papers, $reason);
      }
    }

    /**
     * Run a shell command and return its output.
     *
     * This project uses WP-CLI context but AWS commands are plain shell.
     */
    private static function run_shell(string $cmd, array $opts = [], ?int &$exit_code = null): string {
      $exit_code = 0;

      $descriptorspec = [
        1 => ['pipe', 'w'], // stdout
        2 => ['pipe', 'w'], // stderr
      ];

      // Execute through sh -lc so PATH/aliases behave consistently in the container.
      $process = proc_open(['sh', '-lc', $cmd], $descriptorspec, $pipes);
      if (!is_resource($process)) {
        $exit_code = 1;
        return '';
      }

      $stdout = stream_get_contents($pipes[1]);
      fclose($pipes[1]);

      $stderr = stream_get_contents($pipes[2]);
      fclose($pipes[2]);

      $status = proc_close($process);
      $exit_code = (int) $status;

      // If stderr output is not requested, drop it.
      $include_stderr = !isset($opts['stderr']) || $opts['stderr'] !== false;
      $out = (string) $stdout;
      if ($include_stderr && $stderr) {
        $out .= ($out !== '' ? "\n" : '') . $stderr;
      }

      return $out;
    }

    private static function run_s3_sync(): void {
  if (!defined('WP_CLI') || !WP_CLI) {
    self::append_log('Skip sync: not WP_CLI');
    return;
  }

  $enabled = getenv('ENABLE_S3_SYNC');
  if ($enabled !== '1') {
    self::append_log('Skip sync: ENABLE_S3_SYNC != 1');
    return;
  }

  $s3_target = getenv('TOMATO_STATIC_S3_TARGET');
  if (!$s3_target) {
    \WP_CLI::warning('Missing env TOMATO_STATIC_S3_TARGET (e.g. s3://tomatonews-static-stg/static)');
    return;
  }

  $src_dir = getenv('STATIC_OUTPUT_DIR') ?: '/var/www/html/static';
  $src_dir = rtrim($src_dir, '/');

  $cmd = sprintf(
    'aws s3 sync %s %s --delete',
    escapeshellarg($src_dir . '/'),
    escapeshellarg(rtrim($s3_target, '/') . '/')
  );

  \WP_CLI::log('Running: ' . $cmd);

  $code = 0;
  self::run_shell($cmd, ['stderr' => false, 'return' => 'all', 'launch' => true], $code);
  if ((int)$code !== 0) {
    \WP_CLI::error('aws s3 sync failed with code ' . $code);
  }

  self::append_log('S3 sync OK target=' . $s3_target);
}


/**
 * Auto CloudFront invalidation (optional)
 *
 * Keeps CloudFront caching ON, but makes updates visible immediately.
 *
 * Required env:
 * - ENABLE_CLOUDFRONT_INVALIDATION=1
 * - CLOUDFRONT_DISTRIBUTION_ID=E2XXXXXXXXXXXXX
 *
 * Optional env:
 * - CLOUDFRONT_INVALIDATION_PATHS="/static/*"  (comma-separated)
 */
private static function run_cloudfront_invalidation(array $papers): void {
  if (!defined('WP_CLI') || !WP_CLI) {
    self::append_log('Skip invalidation: not WP_CLI');
    return;
  }

  $enabled = getenv('ENABLE_CLOUDFRONT_INVALIDATION');
  if ($enabled !== '1') {
    self::append_log('Skip invalidation: ENABLE_CLOUDFRONT_INVALIDATION != 1');
    return;
  }

  $dist_id = getenv('CLOUDFRONT_DISTRIBUTION_ID');
  if (!$dist_id) {
    \WP_CLI::warning('Missing env CLOUDFRONT_DISTRIBUTION_ID');
    return;
  }

  // If you want custom paths, set CLOUDFRONT_INVALIDATION_PATHS as space-separated values.
  $custom = getenv('CLOUDFRONT_INVALIDATION_PATHS');
  $paths = [];

  if ($custom) {
    $parts = preg_split('/\s+/', trim($custom));
    foreach ($parts as $p) {
      if ($p !== '') $paths[] = $p;
    }
  } else {
    // Default: invalidate the changed paper folders under /static
    $normalized = [];
    foreach ($papers as $p) {
      $n = self::normalize_paper_key((string) $p);
      if ($n !== null) $normalized[] = $n;
    }
    $normalized = array_values(array_unique($normalized));
    if (empty($normalized)) $normalized = ['tomato'];

    foreach ($normalized as $paper) {
      // minimal but effective
      $paths[] = "/static/{$paper}/*";
    }
  }

  if (empty($paths)) {
    self::append_log('Skip invalidation: no paths');
    return;
  }

  $cmd = 'aws cloudfront create-invalidation'
    . ' --distribution-id ' . escapeshellarg($dist_id)
    . ' --paths ' . implode(' ', array_map('escapeshellarg', $paths));

  \WP_CLI::log('Running: ' . $cmd);

  $code = 0;
  self::run_shell($cmd, ['stderr' => false, 'return' => 'all', 'launch' => true], $code);

  if ((int)$code !== 0) {
    self::append_log('Invalidate ERROR code=' . $code);
    \WP_CLI::warning('CloudFront invalidation failed (exit=' . $code . ')');
    return;
  }

  self::append_log('Invalidate OK paths=' . implode(',', $paths));
  \WP_CLI::success('CloudFront invalidation created.');
}


    /**
     * WP-CLI command handler
     */
    public static function cli_run($args, $assoc_args): void {
      $force = !empty($assoc_args['force']);
      self::run($force);
    }

    public static function cli_run_now($args, $assoc_args): void {
      // Always run immediately (ignore debounce)
      self::run(true);
    }
  }
}

if (defined('WP_CLI') && WP_CLI) {
  // Debounced runner (for cron): runs only when due.
  \WP_CLI::add_command('tomato auto-static-run', [Tomato_Auto_Static_Build_Runner::class, 'cli_run'], [
    'shortdesc' => 'Run queued static-build and S3 sync (if due).',
  ]);

  // Run immediately, ignoring debounce
  \WP_CLI::add_command('tomato auto-static-run-now', [Tomato_Auto_Static_Build_Runner::class, 'cli_run_now'], [
    'shortdesc' => 'Run queued static-build and S3 sync immediately (ignore debounce).',
  ]);
}
