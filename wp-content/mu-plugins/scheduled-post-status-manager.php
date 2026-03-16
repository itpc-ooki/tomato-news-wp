<?php
/**
 * Plugin Name: Tomato News - Scheduled Post Actions (MU)
 * Description: Schedules future post/page actions (draft/private/pending/publish/trash/delete) without relying on WP-Cron. Processed by the static builder loop.
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!class_exists('Tomato_Scheduled_Post_Actions')) {
    class Tomato_Scheduled_Post_Actions
    {
        private const META_KEY = '_tomato_scheduled_action';
        private const NONCE_ACTION = 'tomato_scheduled_action_save';
        private const CAPABILITY = 'edit_post';

        public static function init(): void
        {
            add_action('add_meta_boxes', [__CLASS__, 'add_meta_box']);
            add_action('save_post', [__CLASS__, 'save_meta_box'], 20, 2);
            add_action('admin_notices', [__CLASS__, 'render_admin_notice']);
        }

        public static function add_meta_box(): void
        {
            $post_types = ['post', 'page'];
            foreach ($post_types as $post_type) {
                add_meta_box(
                    'tomato-scheduled-action-box',
                    '予約アクション',
                    [__CLASS__, 'render_meta_box'],
                    $post_type,
                    'side',
                    'default'
                );
            }
        }

        public static function render_meta_box(WP_Post $post): void
        {
            if (!current_user_can(self::CAPABILITY, $post->ID)) {
                return;
            }

            wp_nonce_field(self::NONCE_ACTION, 'tomato_scheduled_action_nonce');

            $meta = self::get_post_schedule($post->ID);
            $enabled = !empty($meta['enabled']);
            $action = isset($meta['action']) ? (string) $meta['action'] : '';
            $run_at_utc = isset($meta['run_at_utc']) ? (int) $meta['run_at_utc'] : 0;
            $run_at_local = $run_at_utc > 0
                ? wp_date('Y-m-d\TH:i', $run_at_utc, wp_timezone())
                : '';

            $action_options = self::get_action_options();
            ?>
            <p style="margin:0 0 10px; color:#475569; line-height:1.5;">
                将来の日時に投稿や固定ページのステータス変更を実行します。<br>
                このプロジェクトでは WP-Cron ではなく静的ビルドループで処理されます。
            </p>

            <p style="margin:0 0 12px;">
                <label style="display:flex; align-items:center; gap:8px;">
                    <input type="checkbox" name="tomato_scheduled_action_enabled" value="1" <?php checked($enabled); ?>>
                    <span>予約アクションを有効にする</span>
                </label>
            </p>

            <p style="margin:0 0 12px;">
                <label for="tomato_scheduled_action_type" style="display:block; font-weight:600; margin-bottom:6px;">実行内容</label>
                <select name="tomato_scheduled_action_type" id="tomato_scheduled_action_type" style="width:100%;">
                    <option value="">選択してください</option>
                    <?php foreach ($action_options as $value => $label) : ?>
                        <option value="<?php echo esc_attr($value); ?>" <?php selected($action, $value); ?>><?php echo esc_html($label); ?></option>
                    <?php endforeach; ?>
                </select>
            </p>

            <p style="margin:0 0 12px;">
                <label for="tomato_scheduled_action_datetime" style="display:block; font-weight:600; margin-bottom:6px;">実行日時</label>
                <input
                    type="datetime-local"
                    name="tomato_scheduled_action_datetime"
                    id="tomato_scheduled_action_datetime"
                    value="<?php echo esc_attr($run_at_local); ?>"
                    style="width:100%;"
                >
            </p>

            <?php if ($enabled && $action && $run_at_utc > 0) : ?>
                <div style="padding:10px; background:#f8fafc; border:1px solid #e5e7eb;">
                    <div style="font-weight:600; margin-bottom:4px;">現在の予約</div>
                    <div>内容: <?php echo esc_html($action_options[$action] ?? $action); ?></div>
                    <div>日時: <?php echo esc_html(wp_date('Y-m-d H:i', $run_at_utc, wp_timezone())); ?></div>
                </div>
            <?php endif; ?>
            <?php
        }

        public static function save_meta_box(int $post_id, WP_Post $post): void
        {
            if (!isset($_POST['tomato_scheduled_action_nonce']) || !wp_verify_nonce((string) $_POST['tomato_scheduled_action_nonce'], self::NONCE_ACTION)) {
                return;
            }

            if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) {
                return;
            }

            if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) {
                return;
            }

            if (!current_user_can(self::CAPABILITY, $post_id)) {
                return;
            }

            if (!in_array($post->post_type, ['post', 'page'], true)) {
                return;
            }

            $enabled = !empty($_POST['tomato_scheduled_action_enabled']);
            $action = isset($_POST['tomato_scheduled_action_type']) ? sanitize_key((string) $_POST['tomato_scheduled_action_type']) : '';
            $datetime_local = isset($_POST['tomato_scheduled_action_datetime']) ? sanitize_text_field((string) $_POST['tomato_scheduled_action_datetime']) : '';

            if (!$enabled) {
                delete_post_meta($post_id, self::META_KEY);
                self::set_admin_notice('予約アクションを解除しました。', 'success');
                return;
            }

            $action_options = self::get_action_options();
            if (!isset($action_options[$action])) {
                self::set_admin_notice('予約アクションの内容を選択してください。', 'error');
                delete_post_meta($post_id, self::META_KEY);
                return;
            }

            $run_at_utc = self::parse_local_datetime_to_utc($datetime_local);
            if ($run_at_utc <= time()) {
                self::set_admin_notice('予約日時は現在より未来の日時を指定してください。', 'error');
                delete_post_meta($post_id, self::META_KEY);
                return;
            }

            $meta = [
                'enabled' => 1,
                'action' => $action,
                'run_at_utc' => $run_at_utc,
                'scheduled_by' => get_current_user_id(),
                'updated_at_utc' => time(),
            ];

            update_post_meta($post_id, self::META_KEY, $meta);
            self::set_admin_notice('予約アクションを保存しました。', 'success');
        }

        public static function process_due_actions(bool $log_to_cli = false): int
        {
            $query = new WP_Query([
                'post_type' => ['post', 'page'],
                'post_status' => 'any',
                'posts_per_page' => 100,
                'fields' => 'ids',
                'orderby' => 'ID',
                'order' => 'ASC',
                'meta_query' => [
                    [
                        'key' => self::META_KEY,
                        'compare' => 'EXISTS',
                    ],
                ],
                'no_found_rows' => true,
                'cache_results' => false,
                'update_post_meta_cache' => false,
                'update_post_term_cache' => false,
            ]);

            $processed = 0;
            foreach ($query->posts as $post_id) {
                $meta = self::get_post_schedule((int) $post_id);
                if (empty($meta['enabled']) || empty($meta['action']) || empty($meta['run_at_utc'])) {
                    continue;
                }

                if ((int) $meta['run_at_utc'] > time()) {
                    continue;
                }

                $result = self::run_scheduled_action((int) $post_id, $meta, $log_to_cli);
                if ($result) {
                    $processed++;
                }
            }

            wp_reset_postdata();
            return $processed;
        }

        public static function cli_run($args, $assoc_args): void
        {
            $processed = self::process_due_actions(true);
            if (defined('WP_CLI') && WP_CLI) {
                \WP_CLI::success('Processed scheduled actions: ' . $processed);
            }
        }

        private static function run_scheduled_action(int $post_id, array $meta, bool $log_to_cli = false): bool
        {
            $post = get_post($post_id);
            if (!($post instanceof WP_Post)) {
                delete_post_meta($post_id, self::META_KEY);
                self::maybe_log('Removed orphaned scheduled action for missing post ID ' . $post_id, $log_to_cli);
                return false;
            }

            $action = sanitize_key((string) ($meta['action'] ?? ''));
            $old_status = (string) $post->post_status;
            $did_change = false;

            if ($action === 'delete') {
                self::queue_rebuild_for_post($post, 'scheduled_action:delete:before');
                $deleted = wp_delete_post($post_id, true);
                if ($deleted) {
                    $did_change = true;
                    self::maybe_log('Deleted post ID ' . $post_id . ' by scheduled action.', $log_to_cli);
                }
            } elseif ($action === 'trash') {
                $trashed = wp_trash_post($post_id);
                if ($trashed) {
                    $did_change = true;
                    self::maybe_log('Moved post ID ' . $post_id . ' to trash by scheduled action.', $log_to_cli);
                }
            } else {
                if ($old_status !== $action) {
                    $updated = wp_update_post([
                        'ID' => $post_id,
                        'post_status' => $action,
                    ], true);
                    if (!is_wp_error($updated)) {
                        $did_change = true;
                        self::maybe_log('Changed post ID ' . $post_id . ' status ' . $old_status . ' -> ' . $action . ' by scheduled action.', $log_to_cli);
                    } else {
                        self::maybe_log('Failed scheduled action for post ID ' . $post_id . ': ' . $updated->get_error_message(), $log_to_cli, true);
                    }
                } else {
                    $did_change = true;
                    self::maybe_log('Skipped scheduled action for post ID ' . $post_id . ' because status is already ' . $action . '.', $log_to_cli);
                }
            }

            delete_post_meta($post_id, self::META_KEY);

            if ($did_change && $post->post_type === 'page') {
                self::queue_rebuild_for_post($post, 'scheduled_page_action:' . $action);
            }

            return $did_change;
        }

        private static function queue_rebuild_for_post(WP_Post $post, string $reason): void
        {
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

            if (empty($papers) && method_exists('Tomato_Auto_Static_Build_Queue', 'get_papers_from_newspaper_master')) {
                $papers = Tomato_Auto_Static_Build_Queue::get_papers_from_newspaper_master();
            }

            if (empty($papers)) {
                $papers = ['tomato'];
            }

            $papers = array_values(array_unique(array_filter($papers)));
            Tomato_Auto_Static_Build_Queue::request_build($papers, $reason);
        }

        private static function normalize_paper_key(string $raw): ?string
        {
            $raw = trim(urldecode($raw));
            if ($raw === '') {
                return null;
            }

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

            if (isset($map[$raw])) {
                return $map[$raw];
            }

            if (preg_match('/^[a-z0-9][a-z0-9\-]*$/', $raw)) {
                return $raw;
            }

            $san = sanitize_title($raw);
            if ($san === '' || strpos($san, '%') !== false) {
                return null;
            }

            return $san;
        }

        private static function get_action_options(): array
        {
            return [
                'draft' => '下書きにする',
                'pending' => '保留中にする',
                'private' => '非公開にする',
                'publish' => '公開済みにする',
                'trash' => 'ゴミ箱へ移動する',
                'delete' => '完全に削除する',
            ];
        }

        private static function get_post_schedule(int $post_id): array
        {
            $meta = get_post_meta($post_id, self::META_KEY, true);
            return is_array($meta) ? $meta : [];
        }

        private static function parse_local_datetime_to_utc(string $value): int
        {
            $value = trim($value);
            if ($value === '') {
                return 0;
            }

            $timezone = wp_timezone();
            $dt = date_create_immutable_from_format('Y-m-d\TH:i', $value, $timezone);
            if (!$dt) {
                return 0;
            }

            return (int) $dt->setTimezone(new DateTimeZone('UTC'))->format('U');
        }

        private static function set_admin_notice(string $message, string $type): void
        {
            set_transient('tomato_scheduled_action_notice_' . get_current_user_id(), [
                'message' => $message,
                'type' => $type,
            ], 60);
        }

        public static function render_admin_notice(): void
        {
            $key = 'tomato_scheduled_action_notice_' . get_current_user_id();
            $notice = get_transient($key);
            if (!is_array($notice) || empty($notice['message'])) {
                return;
            }
            delete_transient($key);

            $class = ($notice['type'] ?? '') === 'error' ? 'notice notice-error' : 'notice notice-success is-dismissible';
            printf('<div class="%1$s"><p>%2$s</p></div>', esc_attr($class), esc_html((string) $notice['message']));
        }

        private static function maybe_log(string $message, bool $to_cli, bool $is_error = false): void
        {
            if (class_exists('Tomato_Auto_Static_Build_Runner') && method_exists('Tomato_Auto_Static_Build_Runner', 'external_log')) {
                Tomato_Auto_Static_Build_Runner::external_log('scheduled-actions: ' . $message);
            }

            if ($to_cli && defined('WP_CLI') && WP_CLI) {
                if ($is_error) {
                    \WP_CLI::warning($message);
                } else {
                    \WP_CLI::log($message);
                }
            }
        }
    }
}

Tomato_Scheduled_Post_Actions::init();

if (defined('WP_CLI') && WP_CLI) {
    \WP_CLI::add_command('tomato scheduled-actions-run', [Tomato_Scheduled_Post_Actions::class, 'cli_run'], [
        'shortdesc' => 'Process due scheduled post/page actions.',
    ]);
}
