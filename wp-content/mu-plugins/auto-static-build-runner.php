<?php
/**
 * Plugin Name: Tomato News - Auto Static Build Runner (MU)
 * Description: WP-CLI command to run queued static build and S3 sync.
 */

if (!defined('ABSPATH')) exit;

class Tomato_Auto_Static_Build_Runner
{
  private static function queue_dir() { return WP_CONTENT_DIR . '/uploads/static-build-queue'; }
  private static function request_file() { return self::queue_dir() . '/requested.json'; }
  private static function lock_file() { return self::queue_dir() . '/running.lock'; }
  private static function log_file() { return self::queue_dir() . '/build.log'; }

  private static function log($msg) {
    $line = '[' . gmdate('c') . '] ' . $msg . "\n";
    @file_put_contents(self::log_file(), $line, FILE_APPEND);
  }

  private static function lock_dir(): string {
  return self::queue_dir() . '/running.lock.d';
}

private static function is_locked(): bool {
  $lock_dir = self::lock_dir();
  if (!is_dir($lock_dir)) {
    return false;
  }

  $stale_after = 30 * 60; // 30 minutes
  $mtime = @filemtime($lock_dir);
  if ($mtime && (time() - $mtime) > $stale_after) {
    self::rrmdir($lock_dir);
    return false;
  }

  return true;
}

private static function lock(): bool {
  $dir = self::queue_dir();
  if (!is_dir($dir)) {
    @mkdir($dir, 0775, true);
  }

  $lock_dir = self::lock_dir();
  $stale_after = 30 * 60; // 30 minutes

  if (@mkdir($lock_dir, 0775)) {
    @file_put_contents($lock_dir . '/meta.json', wp_json_encode([
      'started_at' => time(),
      'pid'        => getmypid(),
      'host'       => php_uname('n'),
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
    return true;
  }

  $mtime = @filemtime($lock_dir);
  if ($mtime && (time() - $mtime) > $stale_after) {
    self::rrmdir($lock_dir);
    if (@mkdir($lock_dir, 0775)) {
      @file_put_contents($lock_dir . '/meta.json', wp_json_encode([
        'started_at' => time(),
        'pid'        => getmypid(),
        'host'       => php_uname('n'),
        'recovered'  => true,
      ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
      return true;
    }
  }

  return false;
}

private static function unlock(): void {
  $lock_dir = self::lock_dir();
  if (is_dir($lock_dir)) {
    self::rrmdir($lock_dir);
  }
}

private static function rrmdir(string $dir): void {
  if (!is_dir($dir)) return;
  $items = @scandir($dir);
  if (!$items) return;
  foreach ($items as $item) {
    if ($item === '.' || $item === '..') continue;
    $path = $dir . '/' . $item;
    if (is_dir($path)) {
      self::rrmdir($path);
    } else {
      @unlink($path);
    }
  }
  @rmdir($dir);
}

  public static function cli_run($args, $assoc_args)
  {
    $force = !empty($assoc_args['force']);

    if (!is_dir(self::queue_dir())) {
      \WP_CLI::log('Queue dir missing. Nothing to do.');
      return;
    }

    if (self::is_locked()) {
      \WP_CLI::log('Build already running (lock exists).');
      return;
    }

    if (!file_exists(self::request_file())) {
      \WP_CLI::log('No queued request.');
      return;
    }

    $req = json_decode((string)@file_get_contents(self::request_file()), true);
    if (!is_array($req)) {
      \WP_CLI::warning('Invalid request.json; removing.');
      @unlink(self::request_file());
      return;
    }

    $run_after = (int)($req['run_after'] ?? 0);
    $papers    = $req['papers'] ?? [];

    if (!$force && $run_after > time()) {
      \WP_CLI::log('Debounce waiting until ' . gmdate('c', $run_after));
      return;
    }

    // Consume the request immediately to allow new changes to queue another run
    @unlink(self::request_file());

    if (!is_array($papers) || empty($papers)) $papers = ['all'];

    // If all is requested, build all
    $build_args = in_array('all', $papers, true) ? ['--all'] : array_map(fn($p) => '--paper=' . $p, $papers);

    // IMPORTANT: adjust these two lines to match your actual environment:
    $wp_path = '/var/www/html';
    $static_dir = '/var/www/html/static';

    // Target S3 prefix should be /static so your pages can load /static/style.css etc.
    // Example: s3://tomatonews-static-stg/static
    $s3_target = getenv('TOMATO_STATIC_S3_TARGET'); // set in container env, e.g. s3://tomatonews-static-stg/static

    if (!$s3_target) {
      \WP_CLI::error('Missing env TOMATO_STATIC_S3_TARGET (e.g. s3://tomatonews-static-stg/static)');
      return;
    }

    if (!self::lock()) { return; }
    self::log('RUN START papers=' . implode(',', $papers));

    try {
      // 1) Build static
      $cmd_build = 'wp --path=' . escapeshellarg($wp_path) . ' static-build ' . implode(' ', array_map('escapeshellarg', $build_args)) . ' --debug';
      \WP_CLI::log('Build: ' . $cmd_build);
      self::log('Build: ' . $cmd_build);
      passthru($cmd_build, $code1);
      if ($code1 !== 0) {
        self::log('Build failed code=' . $code1);
        \WP_CLI::error('static-build failed with code ' . $code1);
      }

      // 2) Sync to S3
      $cmd_sync = 'aws s3 sync ' . escapeshellarg($static_dir) . ' ' . escapeshellarg($s3_target) . ' --delete';
      \WP_CLI::log('Sync: ' . $cmd_sync);
      self::log('Sync: ' . $cmd_sync);
      passthru($cmd_sync, $code2);
      if ($code2 !== 0) {
        self::log('S3 sync failed code=' . $code2);
        \WP_CLI::error('aws s3 sync failed with code ' . $code2);
      }

      self::log('RUN OK');
      \WP_CLI::success('Build + sync complete.');
    } finally {
      self::unlock();
    }
  }
}

if (defined('WP_CLI') && WP_CLI) {
  // Debounced runner (for cron): runs only when due.
  WP_CLI::add_command('tomato auto-static-run', [Tomato_Auto_Static_Build_Runner::class, 'cli_run'], [
    'shortdesc' => 'Run queued static-build and S3 sync (if due).',
  ]);

  // Immediate runner (for manual debug): always runs now, ignoring debounce timer.
  WP_CLI::add_command('tomato auto-static-run-now', function ($args, $assoc_args) {
    $assoc_args = is_array($assoc_args) ? $assoc_args : [];
    $assoc_args['force'] = true;
    Tomato_Auto_Static_Build_Runner::cli_run($args, $assoc_args);
  }, [
    'shortdesc' => 'Run queued static-build and S3 sync immediately (ignore debounce).',
  ]);
}
