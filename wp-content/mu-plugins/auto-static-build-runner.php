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

    private const OPTION_KEY = 'tomato_static_build_queue';

    private const LOCK_FILE = 'wp-content/uploads/static-build-queue/.lock';
    private const QUEUE_DIR = 'wp-content/uploads/static-build-queue';
    private const REQUESTED_JSON = 'wp-content/uploads/static-build-queue/requested.json';
    private const BUILD_LOG = 'wp-content/uploads/static-build-queue/build.log';

    private const DEBOUNCE_SECONDS = 10;

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

    /**
     * Preferred queue source: WP option set by Tomato_Auto_Static_Build_Queue (MU).
     * Format: { "tomato": {paper, requested_at, reasons...}, "leek": {...} }
     */
    private static function read_option_queue(): array {
      $queue = get_option(self::OPTION_KEY, []);
      if (!is_array($queue)) return [];

      $papers = [];
      $latest_requested = 0;

      // Accept either associative (paper => meta) or list of items.
      foreach ($queue as $k => $v) {
        if (is_array($v)) {
          $paper = isset($v['paper']) ? (string) $v['paper'] : (is_string($k) ? (string) $k : '');
          $paper = sanitize_title($paper);
          if ($paper !== '') $papers[] = $paper;

          $ts = isset($v['requested_at']) ? (int) $v['requested_at'] : 0;
          if ($ts > $latest_requested) $latest_requested = $ts;
        } elseif (is_string($v)) {
          $paper = sanitize_title($v);
          if ($paper !== '') $papers[] = $paper;
        } elseif (is_string($k)) {
          $paper = sanitize_title($k);
          if ($paper !== '') $papers[] = $paper;
        }
      }

      $papers = array_values(array_unique(array_filter($papers)));

      return [
        'papers' => $papers,
        // Run shortly after the latest enqueue to debounce rapid saves.
        'run_after' => $latest_requested > 0 ? ($latest_requested + self::DEBOUNCE_SECONDS) : 0,
      ];
    }

    private static function clear_option_queue(): void {
      update_option(self::OPTION_KEY, [], false);
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

      // 1) Preferred: WP option queue (tomato_static_build_queue)
      $req = self::read_option_queue();

      // 2) Backward compatibility: legacy requested.json
      if ((!$req || empty($req['papers'])) && file_exists(self::requested_json_path())) {
        $legacy = self::read_requested();
        if ($legacy && !empty($legacy['papers'])) {
          $req = $legacy;
        }
      }

      $papers = isset($req['papers']) && is_array($req['papers']) ? $req['papers'] : [];
      $run_after = isset($req['run_after']) ? (int) $req['run_after'] : 0;

      if (!$papers) {
        self::append_log('Skip: queue empty');
        return;
      }

      $now = time();
      if (!$force && $run_after > 0 && $run_after > $now) {
        self::append_log('Debounce waiting until ' . gmdate('c', $run_after));
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
        self::run_cloudfront_invalidation();

        // Clear queue AFTER successful build+sync+invalidation
        self::clear_option_queue();
        @unlink(self::requested_json_path());

        self::append_log('Done build');
      } catch (\Throwable $e) {
        self::append_log('ERROR: ' . $e->getMessage());
        throw $e;
      } finally {
        self::unlock();
      }
    }

    private static function run_static_build(array $papers): void {
      if (!defined('WP_CLI') || !WP_CLI) {
        // Not running under WP-CLI; just skip.
        self::append_log('Skip: not WP_CLI');
        return;
      }

      $wp_path = ABSPATH;

      // NOTE:
      // cli-static-build.php expects:
      //   wp static-build <paper>
      //   wp static-build --all
      // NOT:
      //   wp static-build --paper=<paper>
      $is_all = in_array('all', $papers, true);

      // 1) Build static
      // - If --all was requested, run once: wp static-build --all
      // - Otherwise, run once per paper: wp static-build tomato / leek / strawberry ...
      if ($is_all) {
      $cmd_build = sprintf(
          'wp --path=%s static-build --all --debug',
          escapeshellarg($wp_path)
      );
      \WP_CLI::log('Build: ' . $cmd_build);
      $code = 0;
      \WP_CLI::runcommand($cmd_build, ['exit_error' => false, 'return' => 'all', 'launch' => true], $code);
      if ($code !== 0) {
          \WP_CLI::error('static-build failed with code ' . $code);
      }
      } else {
      $papers = array_values(array_unique($papers));
      foreach ($papers as $paper) {
          $cmd_build = sprintf(
          'wp --path=%s static-build %s --debug',
          escapeshellarg($wp_path),
          escapeshellarg($paper)
          );
          \WP_CLI::log('Build: ' . $cmd_build);
          $code = 0;
          \WP_CLI::runcommand($cmd_build, ['exit_error' => false, 'return' => 'all', 'launch' => true], $code);
          if ($code !== 0) {
          \WP_CLI::error('static-build failed for ' . $paper . ' with code ' . $code);
          }
        }
      }
    }

    private static function run_s3_sync(): void {
      if (!defined('WP_CLI') || !WP_CLI) {
        self::append_log('Skip sync: not WP_CLI');
        return;
      }

      $s3_target = getenv('TOMATO_STATIC_S3_TARGET');
      if (!$s3_target) {
        \WP_CLI::warning('Missing env TOMATO_STATIC_S3_TARGET (e.g. s3://tomatonews-static-stg/static)');
        self::append_log('Skip sync: TOMATO_STATIC_S3_TARGET not set');
        return;
      }

      // Your static output dir (adjust if your project differs)
      $static_dir = ABSPATH . 'static';

      if (!is_dir($static_dir)) {
        \WP_CLI::warning('static dir missing: ' . $static_dir);
        self::append_log('Skip sync: static dir missing');
        return;
      }

      $cmd_sync = sprintf(
        'aws s3 sync %s %s --delete',
        escapeshellarg($static_dir . '/'),
        escapeshellarg(rtrim($s3_target, '/') . '/')
      );

      \WP_CLI::log('Sync: ' . $cmd_sync);
      $code2 = 0;
      \WP_CLI::runcommand($cmd_sync, ['exit_error' => false, 'return' => 'all', 'launch' => true], $code2);
      if ($code2 !== 0) {
        \WP_CLI::error('aws s3 sync failed with code ' . $code2);
      }

      \WP_CLI::success('Build + sync complete.');
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
private static function run_cloudfront_invalidation(): void {
  if (!defined('WP_CLI') || !WP_CLI) {
    self::append_log('Skip invalidation: not WP_CLI');
    return;
  }

  $enabled = getenv('ENABLE_CLOUDFRONT_INVALIDATION');
  if (!$enabled || $enabled === '0') {
    self::append_log('Skip invalidation: ENABLE_CLOUDFRONT_INVALIDATION not enabled');
    return;
  }

  // Only invalidate when S3 sync is configured (same environment as the builder sync)
  $s3_target = getenv('TOMATO_STATIC_S3_TARGET');
  if (!$s3_target) {
    self::append_log('Skip invalidation: TOMATO_STATIC_S3_TARGET not set');
    return;
  }

  $dist_id = getenv('CLOUDFRONT_DISTRIBUTION_ID');
  if (!$dist_id) {
    \WP_CLI::warning('Missing env CLOUDFRONT_DISTRIBUTION_ID (CloudFront distribution id)');
    self::append_log('Skip invalidation: CLOUDFRONT_DISTRIBUTION_ID not set');
    return;
  }

  // Default: invalidate all generated files under /static (all papers)
  $paths_env = getenv('CLOUDFRONT_INVALIDATION_PATHS');
  if ($paths_env) {
    $paths = array_values(array_filter(array_map('trim', explode(',', $paths_env))));
  } else {
    $paths = ['/static/*'];
  }

  if (!$paths) {
    self::append_log('Skip invalidation: no paths');
    return;
  }

  $args = implode(' ', array_map('escapeshellarg', $paths));

  $cmd = sprintf(
    'aws cloudfront create-invalidation --distribution-id %s --paths %s',
    escapeshellarg($dist_id),
    $args
  );

  \WP_CLI::log('Invalidate: ' . $cmd);
  $code = 0;
  \WP_CLI::runcommand($cmd, ['exit_error' => false, 'return' => 'all', 'launch' => true], $code);

  if ($code !== 0) {
    \WP_CLI::warning('CloudFront invalidation failed with code ' . $code);
    self::append_log('Invalidate ERROR code=' . $code);
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

    public static function cli_run_force($args, $assoc_args): void {
      // Force run immediately (ignore debounce)
      self::run(true);
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
  \WP_CLI::add_command('tomato auto-static-run-force', [Tomato_Auto_Static_Build_Runner::class, 'cli_run_force'], [
    'shortdesc' => 'Run queued static-build and S3 sync immediately (force, ignore debounce).',
  ]);

WP_CLI::add_command('tomato auto-static-run-now', [Tomato_Auto_Static_Build_Runner::class, 'cli_run_now'], [
    'shortdesc' => 'Run queued static-build and S3 sync immediately (ignore debounce).',
  ]);
}
  private static function normalize_paper_slug(string $paper): ?string
  {
    $paper = trim($paper);
    if ($paper === '') {
      return null;
    }

    // Some terminals display UTF-8 as percent-encoding when dumped from JSON.
    // Try to decode once; if it's not encoded, urldecode() is a no-op for normal slugs.
    $decoded = urldecode($paper);

    // If it's already a safe slug, keep it.
    if (preg_match('/^[a-z0-9][a-z0-9\-]*$/', $decoded)) {
      return $decoded;
    }

    // Fallback: sanitize title (may become empty for non-latin).
    $slug = sanitize_title($decoded);
    if (is_string($slug) && $slug !== '') {
      return $slug;
    }

    return null;
  }


