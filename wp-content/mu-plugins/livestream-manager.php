<?php
/**
 * Tomato News - Livestream Manager
 *
 * Adds a small WordPress admin settings screen for the WEB seminar livestream,
 * then exports per-paper livestream.json for the static site.
 */

if (!defined('ABSPATH')) exit;

if (!class_exists('Tomato_Livestream_Manager')) {

class Tomato_Livestream_Manager {
    const OPTION_KEY = 'tomato_livestream_settings_v1';
    const TAX_PAPER = 'paper';

    public static function init(): void {
        add_action('admin_menu', [__CLASS__, 'add_admin_page']);
        add_action('admin_post_tomato_save_livestream_settings', [__CLASS__, 'save_settings']);

        if (defined('WP_CLI') && WP_CLI) {
            WP_CLI::add_command('tomato livestream export', [__CLASS__, 'cli_export']);
        }
    }

    public static function add_admin_page(): void {
        add_options_page(
            'ライブ配信設定',
            'ライブ配信設定',
            'manage_options',
            'tomato-livestream-settings',
            [__CLASS__, 'render_admin_page']
        );
    }

    private static function defaults(): array {
        return [
            'enabled' => '1',
            'title' => '第4回トマトサミット 2026',
            'description' => '最新のトマト栽培技術と市場動向について、業界トップクラスの専門家陣が詳しく解説します。施設園芸の最前線から実践的なノウハウまで、生産者の皆様に役立つ情報を多数お届けします。',
            'youtube_id' => 'jfKfPfyJRdk',
            'start_at' => '',
            'date_text' => '2026年6月26日（金）',
            'time_text' => '14:00 開始予定',
            'status_label' => 'ライブ配信中',
            'status_subtitle' => 'ログイン中の会員のみ視聴できます',
        ];
    }

    private static function get_all_settings(): array {
        $raw = get_option(self::OPTION_KEY, []);
        return is_array($raw) ? $raw : [];
    }

    private static function get_settings_for_paper(string $paper): array {
        $paper = sanitize_title($paper);
        $all = self::get_all_settings();
        $settings = isset($all[$paper]) && is_array($all[$paper]) ? $all[$paper] : [];
        return array_merge(self::defaults(), $settings);
    }

    private static function get_paper_terms(): array {
        if (!taxonomy_exists(self::TAX_PAPER)) {
            return [];
        }

        $terms = get_terms([
            'taxonomy' => self::TAX_PAPER,
            'hide_empty' => false,
            'orderby' => 'name',
            'order' => 'ASC',
        ]);

        if (is_wp_error($terms) || empty($terms)) {
            return [];
        }

        return array_values(array_filter($terms, function($term) {
            return $term instanceof WP_Term && !empty($term->slug);
        }));
    }

    public static function render_admin_page(): void {
        if (!current_user_can('manage_options')) {
            wp_die('You do not have permission to access this page.');
        }

        $terms = self::get_paper_terms();
        $selected_paper = isset($_GET['paper']) ? sanitize_title(wp_unslash($_GET['paper'])) : '';
        if ($selected_paper === '' && !empty($terms)) {
            $selected_paper = sanitize_title($terms[0]->slug);
        }
        if ($selected_paper === '') {
            $selected_paper = 'tomato';
        }

        $settings = self::get_settings_for_paper($selected_paper);
        $notice = isset($_GET['updated']) ? sanitize_text_field(wp_unslash($_GET['updated'])) : '';
        ?>
        <div class="wrap">
            <h1>ライブ配信設定</h1>
            <?php if ($notice === '1'): ?>
                <div class="notice notice-success is-dismissible"><p>ライブ配信設定を保存し、livestream.json を更新しました。</p></div>
            <?php endif; ?>

            <p>無料動画セミナーページ（web-seminar.html）のトップに表示する YouTube ライブ配信情報を設定します。</p>

            <?php if (!empty($terms)): ?>
                <form method="get" style="margin:16px 0;">
                    <input type="hidden" name="page" value="tomato-livestream-settings">
                    <label for="tomato_livestream_paper"><strong>紙面</strong></label>
                    <select id="tomato_livestream_paper" name="paper" onchange="this.form.submit()">
                        <?php foreach ($terms as $term): ?>
                            <option value="<?php echo esc_attr($term->slug); ?>" <?php selected($selected_paper, $term->slug); ?>>
                                <?php echo esc_html($term->name . ' (' . $term->slug . ')'); ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </form>
            <?php endif; ?>

            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <?php wp_nonce_field('tomato_save_livestream_settings', 'tomato_livestream_nonce'); ?>
                <input type="hidden" name="action" value="tomato_save_livestream_settings">
                <input type="hidden" name="paper" value="<?php echo esc_attr($selected_paper); ?>">

                <table class="form-table" role="presentation">
                    <tr>
                        <th scope="row">表示</th>
                        <td>
                            <label>
                                <input type="checkbox" name="enabled" value="1" <?php checked($settings['enabled'], '1'); ?>>
                                ライブ配信エリアを表示する
                            </label>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="livestream_title">タイトル</label></th>
                        <td><input type="text" id="livestream_title" name="title" class="regular-text" value="<?php echo esc_attr($settings['title']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="livestream_youtube_id">YouTube動画ID</label></th>
                        <td>
                            <input type="text" id="livestream_youtube_id" name="youtube_id" class="regular-text" value="<?php echo esc_attr($settings['youtube_id']); ?>">
                            <p class="description">例：https://www.youtube.com/watch?v=XXXXXXXXXXX の「XXXXXXXXXXX」の部分だけ入力してください。</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="livestream_start_at">配信開始日時</label></th>
                        <td>
                            <input type="datetime-local" id="livestream_start_at" name="start_at" value="<?php echo esc_attr(self::format_datetime_local($settings['start_at'])); ?>">
                            <p class="description">この日時を過ぎると、ログイン済み会員に YouTube プレイヤーが表示されます。空欄の場合は常に表示されます。</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="livestream_date_text">日付表示</label></th>
                        <td><input type="text" id="livestream_date_text" name="date_text" class="regular-text" value="<?php echo esc_attr($settings['date_text']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="livestream_time_text">時間表示</label></th>
                        <td><input type="text" id="livestream_time_text" name="time_text" class="regular-text" value="<?php echo esc_attr($settings['time_text']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="livestream_description">説明文</label></th>
                        <td><textarea id="livestream_description" name="description" rows="5" class="large-text"><?php echo esc_textarea($settings['description']); ?></textarea></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="livestream_status_label">配信中ラベル</label></th>
                        <td><input type="text" id="livestream_status_label" name="status_label" class="regular-text" value="<?php echo esc_attr($settings['status_label']); ?>"></td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="livestream_status_subtitle">配信中サブテキスト</label></th>
                        <td><input type="text" id="livestream_status_subtitle" name="status_subtitle" class="regular-text" value="<?php echo esc_attr($settings['status_subtitle']); ?>"></td>
                    </tr>
                </table>

                <?php submit_button('保存してJSONを更新'); ?>
            </form>
        </div>
        <?php
    }

    private static function format_datetime_local($value): string {
        $value = trim((string) $value);
        if ($value === '') return '';
        $timestamp = strtotime($value);
        if (!$timestamp) return '';
        return wp_date('Y-m-d\TH:i', $timestamp);
    }

    private static function normalize_start_at($value): string {
        $value = trim((string) $value);
        if ($value === '') return '';
        $timestamp = strtotime($value);
        if (!$timestamp) return '';
        return wp_date('Y-m-d\TH:i:sP', $timestamp);
    }

    public static function save_settings(): void {
        if (!current_user_can('manage_options')) {
            wp_die('You do not have permission to save this setting.');
        }

        check_admin_referer('tomato_save_livestream_settings', 'tomato_livestream_nonce');

        $paper = isset($_POST['paper']) ? sanitize_title(wp_unslash($_POST['paper'])) : 'tomato';
        if ($paper === '') $paper = 'tomato';

        $all = self::get_all_settings();
        $all[$paper] = [
            'enabled' => isset($_POST['enabled']) ? '1' : '0',
            'title' => isset($_POST['title']) ? sanitize_text_field(wp_unslash($_POST['title'])) : '',
            'description' => isset($_POST['description']) ? sanitize_textarea_field(wp_unslash($_POST['description'])) : '',
            'youtube_id' => isset($_POST['youtube_id']) ? self::sanitize_youtube_id(wp_unslash($_POST['youtube_id'])) : '',
            'start_at' => isset($_POST['start_at']) ? self::normalize_start_at(wp_unslash($_POST['start_at'])) : '',
            'date_text' => isset($_POST['date_text']) ? sanitize_text_field(wp_unslash($_POST['date_text'])) : '',
            'time_text' => isset($_POST['time_text']) ? sanitize_text_field(wp_unslash($_POST['time_text'])) : '',
            'status_label' => isset($_POST['status_label']) ? sanitize_text_field(wp_unslash($_POST['status_label'])) : '',
            'status_subtitle' => isset($_POST['status_subtitle']) ? sanitize_text_field(wp_unslash($_POST['status_subtitle'])) : '',
        ];

        update_option(self::OPTION_KEY, $all, false);
        self::export_json_for_paper($paper);

        // Queue the normal static build pipeline so staging/production can sync
        // the updated /static/{paper}/livestream.json to S3 and invalidate CloudFront.
        if (class_exists('Tomato_Auto_Static_Build_Queue') && method_exists('Tomato_Auto_Static_Build_Queue', 'request_build')) {
            Tomato_Auto_Static_Build_Queue::request_build([$paper], 'save_livestream_settings');
        }

        wp_safe_redirect(add_query_arg([
            'page' => 'tomato-livestream-settings',
            'paper' => $paper,
            'updated' => '1',
        ], admin_url('options-general.php')));
        exit;
    }

    private static function sanitize_youtube_id($value): string {
        $value = trim((string) $value);
        if (preg_match('~(?:v=|youtu\.be/|embed/)([A-Za-z0-9_-]{6,})~', $value, $m)) {
            $value = $m[1];
        }
        return preg_replace('/[^A-Za-z0-9_-]/', '', $value);
    }

    public static function export_json_for_paper(string $paper): void {
        $paper = sanitize_title($paper);
        if ($paper === '') return;

        $settings = self::get_settings_for_paper($paper);
        $payload = [
            'enabled' => $settings['enabled'] === '1',
            'title' => (string) $settings['title'],
            'description' => (string) $settings['description'],
            'youtube_id' => self::sanitize_youtube_id($settings['youtube_id']),
            'start_at' => (string) $settings['start_at'],
            'date_text' => (string) $settings['date_text'],
            'time_text' => (string) $settings['time_text'],
            'status_label' => (string) $settings['status_label'],
            'status_subtitle' => (string) $settings['status_subtitle'],
        ];

        $json = wp_json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
        if (!$json) return;

        // Generated data must live only in the public build output.
        // Do not write back into /static-src, because that folder is source/templates only.
        $root = rtrim(ABSPATH, '/') . '/static/' . $paper;
        if (!is_dir($root)) {
            wp_mkdir_p($root);
        }
        if (is_dir($root)) {
            file_put_contents($root . '/livestream.json', $json);
        }
    }

    public static function cli_export($args, $assoc_args): void {
        $paper = isset($args[0]) ? sanitize_title($args[0]) : '';
        if ($paper === '') {
            WP_CLI::error('Usage: wp tomato livestream export <paper>');
        }
        self::export_json_for_paper($paper);
        WP_CLI::success('Exported livestream.json for ' . $paper);
    }
}

Tomato_Livestream_Manager::init();

}
