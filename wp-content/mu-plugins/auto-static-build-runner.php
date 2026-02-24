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
      return file_exists(self::lock_path());
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
    'synopsis'  => [
      ['type' => 'flag', 'name' => 'force', 'description' => 'Run immediately, ignore debounce timer'],
    ],
  ]);

  // Run immediately, ignoring debounce
  \WP_CLI::add_command('tomato auto-static-run-now', [Tomato_Auto_Static_Build_Runner::class, 'cli_run_now'], [
    'shortdesc' => 'Run queued static-build and S3 sync immediately (ignore debounce).',
  ]);
}
