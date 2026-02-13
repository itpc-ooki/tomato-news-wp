<?php
// mu-plugins/auto-static-build-runner.php

if (!defined('ABSPATH')) {
  exit;
}

if (!class_exists('Tomato_Auto_Static_Build_Runner')) {

  class Tomato_Auto_Static_Build_Runner {

    private static function queue_dir(): string {
      return WP_CONTENT_DIR . '/uploads/static-build-queue';
    }

    private static function requested_json_path(): string {
      return self::queue_dir() . '/requested.json';
    }

    private static function build_log_path(): string {
      return self::queue_dir() . '/build.log';
    }

    private static function ensure_queue_dir(): void {
      $dir = self::queue_dir();
      if (!is_dir($dir)) {
        wp_mkdir_p($dir);
      }
    }

    private static function append_log(string $line): void {
      self::ensure_queue_dir();
      $ts = date('Y-m-d\TH:i:sP');
      file_put_contents(self::build_log_path(), sprintf("[%s] %s\n", $ts, $line), FILE_APPEND);
    }

    /**
     * Queue a static build request.
     *
     * $args:
     *  - papers: array|string (e.g. ['tomato'] or 'tomato' or 'all')
     *  - run_after: int unix time (optional; default now)
     */
    public static function queue(array $args = []): void {
      self::ensure_queue_dir();

      $papers = [];
      if (isset($args['papers'])) {
        $papers = is_array($args['papers']) ? $args['papers'] : [$args['papers']];
      }

      $papers = array_values(array_filter(array_map('strval', $papers)));
      if (!$papers) {
        // default behavior: build all papers unless specified
        $papers = ['tomato'];
      }

      $run_after = isset($args['run_after']) ? (int)$args['run_after'] : time();

      $payload = [
        'requested_at' => time(),
        'run_after'    => $run_after,
        'papers'       => $papers,
      ];

      file_put_contents(self::requested_json_path(), json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
      self::append_log('Queued build: ' . json_encode($payload));
    }

    /**
     * CLI entrypoint: runs the queued build if due.
     *
     * Usage example:
     *   wp tomato auto-static-run-now
     */
    public static function cli_run(array $args, array $assoc_args): void {
      $force = !empty($assoc_args['force']);
      self::run($force);
    }

    public static function run(bool $force = false): void {
      self::ensure_queue_dir();

      $req_path = self::requested_json_path();
      if (!file_exists($req_path)) {
        self::append_log('Skip: no requested.json');
        if (defined('WP_CLI') && WP_CLI) {
          \WP_CLI::log('Skip: no requested.json');
        }
        return;
      }

      $raw = file_get_contents($req_path);
      $req = json_decode($raw, true);
      if (!is_array($req)) {
        self::append_log('Skip: requested.json invalid JSON');
        if (defined('WP_CLI') && WP_CLI) {
          \WP_CLI::warning('requested.json invalid JSON');
        }
        return;
      }

      $run_after = isset($req['run_after']) ? (int)$req['run_after'] : 0;
      $papers    = isset($req['papers']) ? $req['papers'] : [];

      if (!is_array($papers)) {
        $papers = [$papers];
      }
      $papers = array_values(array_filter(array_map('strval', $papers)));

      if (!$force && $run_after > time()) {
        self::append_log('Skip: not due yet (run_after=' . $run_after . ')');
        if (defined('WP_CLI') && WP_CLI) {
          \WP_CLI::log('Queued build not due yet. run_after=' . $run_after);
        }
        return;
      }

      // clear request first (so retries must re-queue)
      @unlink($req_path);

      self::append_log('RUN START papers=' . implode(',', $papers));
      if (defined('WP_CLI') && WP_CLI) {
        \WP_CLI::log('RUN START papers=' . implode(',', $papers));
      }

      self::run_static_build($papers);
      self::run_s3_sync();

      self::append_log('RUN DONE');
      if (defined('WP_CLI') && WP_CLI) {
        \WP_CLI::success('RUN DONE');
      }
    }

    private static function run_static_build(array $papers): void {
      if (!defined('WP_CLI') || !WP_CLI) {
        self::append_log('Skip build: not WP_CLI');
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
        escapeshellarg($static_dir),
        escapeshellarg(rtrim($s3_target, '/'))
      );

      \WP_CLI::log('Sync: ' . $cmd_sync);
      $code = 0;
      \WP_CLI::runcommand($cmd_sync, ['exit_error' => false, 'return' => 'all', 'launch' => true], $code);

      if ($code !== 0) {
        \WP_CLI::error('aws s3 sync failed with code ' . $code);
      }

      \WP_CLI::success('S3 sync done: ' . $s3_target);
    }
  }

  if (defined('WP_CLI') && WP_CLI) {
    \WP_CLI::add_command('tomato auto-static-run-now', ['Tomato_Auto_Static_Build_Runner', 'cli_run']);
  }
}
