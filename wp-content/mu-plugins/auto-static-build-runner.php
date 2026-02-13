<?php
/**
 * MU Plugin: Auto Static Build Runner
 * - Reads wp-content/uploads/static-build-queue/requested.json
 * - Runs: wp static-build <paper>  (or wp static-build --all)
 * - Syncs static output to S3
 */

if (!class_exists('Tomato_Auto_Static_Build_Runner')) {

class Tomato_Auto_Static_Build_Runner {

  private static function queue_dir(): string {
    return WP_CONTENT_DIR . '/uploads/static-build-queue';
  }

  private static function request_file(): string {
    // ✅ FIX: correct filename
    return self::queue_dir() . '/requested.json';
  }

  private static function log_file(): string {
    return self::queue_dir() . '/build.log';
  }

  private static function lock_file(): string {
    return self::queue_dir() . '/running.lock';
  }

  private static function log(string $msg): void {
    $ts = date('Y-m-d\TH:i:sP');
    @file_put_contents(self::log_file(), "[{$ts}] {$msg}\n", FILE_APPEND);
  }

  private static function lock(): bool {
    if (file_exists(self::lock_file())) return false;
    return @file_put_contents(self::lock_file(), (string)time()) !== false;
  }

  private static function unlock(): void {
    @unlink(self::lock_file());
  }

  private static function read_request(): ?array {
    $file = self::request_file();
    if (!file_exists($file)) return null;

    $raw = @file_get_contents($file);
    if ($raw === false) return null;

    $data = json_decode($raw, true);
    if (!is_array($data)) return null;

    return $data;
  }

  private static function clear_request(): void {
    @unlink(self::request_file());
  }

  private static function run_cmd(string $cmd, ?int &$exit_code = null): void {
    self::log("CMD: {$cmd}");
    \WP_CLI::log($cmd);
    passthru($cmd, $code);
    $exit_code = $code;
  }

  /**
   * wp tomato auto-static-run [--force]
   */
  public static function cli_run(array $args, array $assoc_args): void {
    $force = !empty($assoc_args['force']);

    @mkdir(self::queue_dir(), 0775, true);

    if (!self::lock()) {
      \WP_CLI::warning('Already running (lock exists).');
      self::log('SKIP: already running');
      return;
    }

    try {
      $req = self::read_request();
      if (!$req) {
        \WP_CLI::warning('No requested.json');
        self::log('SKIP: no requested.json');
        return;
      }

      $run_after = isset($req['run_after']) ? (int)$req['run_after'] : 0;
      $papers    = isset($req['papers']) && is_array($req['papers']) ? $req['papers'] : [];

      if (!$force && $run_after > 0 && time() < $run_after) {
        \WP_CLI::warning('Not due yet (run_after in future).');
        self::log('SKIP: not due yet');
        return;
      }

      // consume the request so it won't re-run forever
      self::clear_request();

      $wp_path    = '/var/www/html';
      $static_dir = getenv('TOMATO_STATIC_DIR') ?: ($wp_path . '/static');
      $s3_target  = getenv('TOMATO_STATIC_S3_TARGET') ?: '';

      if ($s3_target === '') {
        \WP_CLI::error('Missing env TOMATO_STATIC_S3_TARGET');
      }

      self::log('RUN START papers=' . json_encode($papers));

      // ✅ FIX: wp static-build expects positional args:
      //   wp static-build tomato
      //   wp static-build --all
      $exit = 0;

      if (in_array('all', $papers, true) || count($papers) === 0) {
        $cmd_build = 'wp --path=' . escapeshellarg($wp_path) . ' static-build --all --debug';
        self::log('Build(all): ' . $cmd_build);
        self::run_cmd($cmd_build, $exit);
        if ($exit !== 0) {
          self::log('Build failed code=' . $exit);
          \WP_CLI::error('static-build failed with code ' . $exit);
        }
      } else {
        foreach ($papers as $paper) {
          if (!is_string($paper) || $paper === '') continue;

          $cmd_build = 'wp --path=' . escapeshellarg($wp_path) . ' static-build ' . escapeshellarg($paper) . ' --debug';
          self::log('Build(' . $paper . '): ' . $cmd_build);
          self::run_cmd($cmd_build, $exit);
          if ($exit !== 0) {
            self::log('Build failed code=' . $exit . ' paper=' . $paper);
            \WP_CLI::error('static-build failed with code ' . $exit . ' (paper=' . $paper . ')');
          }
        }
      }

      // Sync to S3 (same as before)
      $cmd_sync = 'aws s3 sync ' . escapeshellarg($static_dir) . ' ' . escapeshellarg($s3_target) . ' --delete';
      self::log('Sync: ' . $cmd_sync);
      self::run_cmd($cmd_sync, $exit);
      if ($exit !== 0) {
        self::log('S3 sync failed code=' . $exit);
        \WP_CLI::error('aws s3 sync failed with code ' . $exit);
      }

      self::log('RUN OK');
      \WP_CLI::success('Build + sync complete.');
    } finally {
      self::unlock();
    }
  }
}

} // end class_exists

if (defined('WP_CLI') && WP_CLI) {
  \WP_CLI::add_command('tomato auto-static-run', [Tomato_Auto_Static_Build_Runner::class, 'cli_run'], [
    'shortdesc' => 'Run queued static-build and S3 sync (if due).',
    'synopsis' => [
      ['type' => 'flag', 'name' => 'force', 'description' => 'Run immediately, ignore debounce timer'],
    ],
  ]);
}
