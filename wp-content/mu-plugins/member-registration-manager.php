<?php
/**
 * Plugin Name: Member Registration Manager
 * Description: WordPress-backed member registration with per-paper registration email templates, preview, test send, logging, and safer paper detection.
 * Version: 2.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!class_exists('Member_Registration_Manager')) {
    final class Member_Registration_Manager {
        const OPTION_KEY = 'member_registration_mail_settings';
        const LOG_OPTION_KEY = 'member_registration_mail_logs';
        const NONCE_ACTION = 'member_registration_mail_settings';
        const META_PREFIX = 'tomato_member_';
        const LOG_LIMIT = 100;
        const MENU_SLUG = 'member-registration-mail-settings';

        private $mail_diagnostics = array();

        public function __construct() {
            add_action('rest_api_init', array($this, 'register_rest_routes'));
            add_action('admin_menu', array($this, 'register_admin_menu'));
            add_action('admin_init', array($this, 'handle_admin_actions'));
            add_action('wp_mail_failed', array($this, 'capture_wp_mail_failed'), 10, 1);
            add_action('phpmailer_init', array($this, 'capture_phpmailer_diagnostics'));
        }

        public function register_rest_routes() {
            register_rest_route('tomato-members/v1', '/register', array(
                'methods'             => 'POST',
                'callback'            => array($this, 'handle_register'),
                'permission_callback' => '__return_true',
            ));

            register_rest_route('tomato-members/v1', '/password-reset/request', array(
                'methods'             => 'POST',
                'callback'            => array($this, 'handle_password_reset_request'),
                'permission_callback' => '__return_true',
            ));

            register_rest_route('tomato-members/v1', '/password-reset/confirm', array(
                'methods'             => 'POST',
                'callback'            => array($this, 'handle_password_reset_confirm'),
                'permission_callback' => '__return_true',
            ));
        }

        public function register_admin_menu() {
            add_options_page(
                '会員登録メール設定',
                '会員登録メール設定',
                'manage_options',
                self::MENU_SLUG,
                array($this, 'render_admin_page')
            );
        }

        public function handle_admin_actions() {
            if (!is_admin() || !current_user_can('manage_options')) {
                return;
            }

            if (!empty($_POST['member_registration_settings_submit'])) {
                check_admin_referer(self::NONCE_ACTION);
                $raw = isset($_POST['settings']) && is_array($_POST['settings']) ? wp_unslash($_POST['settings']) : array();
                $sanitized = $this->sanitize_settings($raw);
                update_option(self::OPTION_KEY, $sanitized, false);
                $this->redirect_admin(array('updated' => 'true'));
            }

            if (!empty($_POST['member_registration_test_send_submit'])) {
                check_admin_referer(self::NONCE_ACTION);

                $paper = $this->sanitize_paper_slug(isset($_POST['test_paper']) ? wp_unslash($_POST['test_paper']) : '');
                $to = sanitize_email(isset($_POST['test_to']) ? wp_unslash($_POST['test_to']) : '');
                if (!$to) {
                    $this->redirect_admin(array('mail_test' => 'invalid_email'));
                }

                $result = $this->send_test_email($paper, $to);
                $this->redirect_admin(array(
                    'mail_test' => $result['success'] ? 'success' : 'failed',
                    'paper'     => $paper,
                ));
            }

            if (!empty($_POST['member_registration_clear_logs_submit'])) {
                check_admin_referer(self::NONCE_ACTION);
                update_option(self::LOG_OPTION_KEY, array(), false);
                $this->redirect_admin(array('logs_cleared' => 'true'));
            }
        }

        private function redirect_admin(array $args) {
            $redirect = add_query_arg(
                array_merge(array('page' => self::MENU_SLUG), $args),
                admin_url('options-general.php')
            );
            wp_safe_redirect($redirect);
            exit;
        }


        public function capture_wp_mail_failed($wp_error) {
            if (!is_wp_error($wp_error)) {
                return;
            }

            $data = $wp_error->get_error_data();
            $this->mail_diagnostics['wp_mail_failed'] = array(
                'message' => $wp_error->get_error_message(),
                'data'    => is_array($data) ? $data : array(),
            );
        }

        public function capture_phpmailer_diagnostics($phpmailer) {
            if (!is_object($phpmailer)) {
                return;
            }

            $this->mail_diagnostics['phpmailer'] = array(
                'mailer'      => isset($phpmailer->Mailer) ? (string) $phpmailer->Mailer : '',
                'host'        => isset($phpmailer->Host) ? (string) $phpmailer->Host : '',
                'port'        => isset($phpmailer->Port) ? (string) $phpmailer->Port : '',
                'sendmail'    => isset($phpmailer->Sendmail) ? (string) $phpmailer->Sendmail : '',
                'from'        => isset($phpmailer->From) ? (string) $phpmailer->From : '',
                'from_name'   => isset($phpmailer->FromName) ? (string) $phpmailer->FromName : '',
                'sender'      => isset($phpmailer->Sender) ? (string) $phpmailer->Sender : '',
                'contenttype' => isset($phpmailer->ContentType) ? (string) $phpmailer->ContentType : '',
            );
        }

        private function reset_mail_diagnostics() {
            $this->mail_diagnostics = array();
        }

        private function build_mail_failure_message($fallback = '') {
            $parts = array();

            if (!empty($this->mail_diagnostics['wp_mail_failed']['message'])) {
                $parts[] = 'wp_mail_failed: ' . $this->mail_diagnostics['wp_mail_failed']['message'];
            }

            if (!empty($this->mail_diagnostics['phpmailer'])) {
                $phpmailer = $this->mail_diagnostics['phpmailer'];
                $mailer = isset($phpmailer['mailer']) ? $phpmailer['mailer'] : '';
                $host = isset($phpmailer['host']) ? $phpmailer['host'] : '';
                $port = isset($phpmailer['port']) ? $phpmailer['port'] : '';
                $sendmail = isset($phpmailer['sendmail']) ? $phpmailer['sendmail'] : '';

                $diag = array();
                if ($mailer !== '') {
                    $diag[] = 'mailer=' . $mailer;
                }
                if ($host !== '') {
                    $diag[] = 'host=' . $host;
                }
                if ($port !== '') {
                    $diag[] = 'port=' . $port;
                }
                if ($sendmail !== '') {
                    $diag[] = 'sendmail=' . $sendmail;
                }
                if (!empty($diag)) {
                    $parts[] = 'PHPMailer(' . implode(', ', $diag) . ')';
                }

                if ($mailer === 'mail' && !function_exists('mail')) {
                    $parts[] = 'PHP mail() が無効です。';
                }
            }

            if (empty($parts)) {
                $parts[] = $fallback ? $fallback : 'wp_mail() が false を返しました。';
            }

            $parts[] = '送信基盤（SMTP / sendmail / Postfix 等）が未設定、またはサーバー側で mail() が利用できない可能性があります。';

            return implode(' ', array_unique(array_filter($parts)));
        }

        public function render_admin_page() {
            if (!current_user_can('manage_options')) {
                return;
            }

            $settings = $this->get_settings();
            $papers   = $this->get_papers();
            $logs     = $this->get_logs();
            $default_test_to = sanitize_email(wp_get_current_user()->user_email);
            ?>
            <div class="wrap">
                <h1>会員登録メール設定</h1>

                <?php if (!empty($_GET['updated'])) : ?>
                    <div class="notice notice-success is-dismissible"><p>会員登録メール設定を保存しました。</p></div>
                <?php endif; ?>
                <?php if (!empty($_GET['mail_test'])) : ?>
                    <?php if ($_GET['mail_test'] === 'success') : ?>
                        <div class="notice notice-success is-dismissible"><p>テストメールを送信しました。</p></div>
                    <?php elseif ($_GET['mail_test'] === 'invalid_email') : ?>
                        <div class="notice notice-error is-dismissible"><p>テスト送信先メールアドレスが不正です。</p></div>
                    <?php else : ?>
                        <div class="notice notice-error is-dismissible"><p>テストメール送信に失敗しました。ログを確認してください。</p></div>
                    <?php endif; ?>
                <?php endif; ?>
                <?php if (!empty($_GET['logs_cleared'])) : ?>
                    <div class="notice notice-success is-dismissible"><p>送信ログを削除しました。</p></div>
                <?php endif; ?>

                <p>紙面ごとに件名・本文・送信元を設定できます。カテゴリーのスラッグを紙面名として使用します。</p>
                <p>使用できる置換タグ：<code>{{nickname}}</code> <code>{{email}}</code> <code>{{paper}}</code> <code>{{member_page_url}}</code> <code>{{registration_info}}</code> <code>{{site_name}}</code></p>
                <p>紙面は、登録APIの <code>paper</code> 値 → ドメイン名 → 既定値 <code>tomato</code> の順で自動判定します。</p>

                <form method="post" action="" style="margin:20px 0 28px; padding:16px; background:#fff; border:1px solid #ccd0d4; max-width:900px;">
                    <?php wp_nonce_field(self::NONCE_ACTION); ?>
                    <h2 style="margin-top:0;">テストメール送信</h2>
                    <table class="form-table" role="presentation">
                        <tr>
                            <th scope="row"><label for="test_paper">紙面</label></th>
                            <td>
                                <select id="test_paper" name="test_paper">
                                    <?php foreach ($papers as $paper) : ?>
                                        <option value="<?php echo esc_attr($paper); ?>"><?php echo esc_html($paper); ?></option>
                                    <?php endforeach; ?>
                                </select>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><label for="test_to">送信先メールアドレス</label></th>
                            <td>
                                <input id="test_to" type="email" class="regular-text" name="test_to" value="<?php echo esc_attr($default_test_to); ?>">
                            </td>
                        </tr>
                    </table>
                    <p>
                        <button type="submit" name="member_registration_test_send_submit" value="1" class="button button-secondary">テストメールを送信</button>
                    </p>
                </form>

                <form method="post" action="">
                    <?php wp_nonce_field(self::NONCE_ACTION); ?>
                    <input type="hidden" name="member_registration_settings_submit" value="1">

                    <?php foreach ($papers as $paper) :
                        $paper_settings = isset($settings[$paper]) && is_array($settings[$paper]) ? $settings[$paper] : $this->get_default_paper_settings($paper);
                        $preview = $this->render_template_for_preview($paper_settings, $paper);
                        ?>
                        <div style="max-width:1200px; margin:0 0 24px; background:#fff; border:1px solid #ccd0d4; padding:18px;">
                            <h2 style="margin-top:0;"><?php echo esc_html($paper); ?> registration email settings</h2>
                            <table class="form-table" role="presentation">
                                <tr>
                                    <th scope="row">有効</th>
                                    <td>
                                        <label>
                                            <input type="checkbox" name="settings[<?php echo esc_attr($paper); ?>][enabled]" value="1" <?php checked(!empty($paper_settings['enabled'])); ?>>
                                            送信する
                                        </label>
                                    </td>
                                </tr>
                                <tr>
                                    <th scope="row"><label for="from_email_<?php echo esc_attr($paper); ?>">送信元メール</label></th>
                                    <td><input id="from_email_<?php echo esc_attr($paper); ?>" type="email" class="regular-text" name="settings[<?php echo esc_attr($paper); ?>][from_email]" value="<?php echo esc_attr($paper_settings['from_email']); ?>"></td>
                                </tr>
                                <tr>
                                    <th scope="row"><label for="from_name_<?php echo esc_attr($paper); ?>">送信者名</label></th>
                                    <td><input id="from_name_<?php echo esc_attr($paper); ?>" type="text" class="regular-text" name="settings[<?php echo esc_attr($paper); ?>][from_name]" value="<?php echo esc_attr($paper_settings['from_name']); ?>"></td>
                                </tr>
                                <tr>
                                    <th scope="row"><label for="subject_<?php echo esc_attr($paper); ?>">件名</label></th>
                                    <td><input id="subject_<?php echo esc_attr($paper); ?>" type="text" class="large-text" name="settings[<?php echo esc_attr($paper); ?>][subject]" value="<?php echo esc_attr($paper_settings['subject']); ?>"></td>
                                </tr>
                                <tr>
                                    <th scope="row"><label for="body_<?php echo esc_attr($paper); ?>">本文</label></th>
                                    <td><textarea id="body_<?php echo esc_attr($paper); ?>" name="settings[<?php echo esc_attr($paper); ?>][body]" rows="16" class="large-text code"><?php echo esc_textarea($paper_settings['body']); ?></textarea></td>
                                </tr>
                                <tr>
                                    <th scope="row">プレビュー</th>
                                    <td>
                                        <div style="border:1px solid #dcdcde; background:#f6f7f7; padding:12px; white-space:pre-wrap; font-family:monospace;"><?php echo esc_html($preview); ?></div>
                                    </td>
                                </tr>
                            </table>
                        </div>
                    <?php endforeach; ?>

                    <?php submit_button('設定を保存'); ?>
                </form>

                <div style="max-width:1200px; margin-top:32px; background:#fff; border:1px solid #ccd0d4; padding:18px;">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;">
                        <h2 style="margin:0;">送信ログ</h2>
                        <form method="post" action="" style="margin:0;">
                            <?php wp_nonce_field(self::NONCE_ACTION); ?>
                            <button type="submit" name="member_registration_clear_logs_submit" value="1" class="button button-secondary">ログを削除</button>
                        </form>
                    </div>
                    <?php if (empty($logs)) : ?>
                        <p>まだログはありません。</p>
                    <?php else : ?>
                        <table class="widefat striped" style="margin-top:12px;">
                            <thead>
                                <tr>
                                    <th style="width:170px;">日時</th>
                                    <th style="width:100px;">種別</th>
                                    <th style="width:120px;">紙面</th>
                                    <th style="width:220px;">宛先</th>
                                    <th style="width:90px;">結果</th>
                                    <th>詳細</th>
                                </tr>
                            </thead>
                            <tbody>
                            <?php foreach ($logs as $log) : ?>
                                <tr>
                                    <td><?php echo esc_html(isset($log['created_at']) ? $log['created_at'] : ''); ?></td>
                                    <td><?php echo esc_html(isset($log['type']) ? $log['type'] : ''); ?></td>
                                    <td><?php echo esc_html(isset($log['paper']) ? $log['paper'] : ''); ?></td>
                                    <td><?php echo esc_html(isset($log['to']) ? $log['to'] : ''); ?></td>
                                    <td><?php echo !empty($log['success']) ? '<span style="color:#008a20;font-weight:700;">SUCCESS</span>' : '<span style="color:#b32d2e;font-weight:700;">FAILED</span>'; ?></td>
                                    <td><?php echo esc_html(isset($log['message']) ? $log['message'] : ''); ?></td>
                                </tr>
                            <?php endforeach; ?>
                            </tbody>
                        </table>
                    <?php endif; ?>

                <div style="max-width:1200px; margin-top:24px; background:#fff; border:1px solid #ccd0d4; padding:18px;">
                    <h2 style="margin-top:0;">メール診断</h2>
                    <table class="widefat striped">
                        <tbody>
                            <tr><th style="width:240px;">home_url()</th><td><?php echo esc_html(home_url('/')); ?></td></tr>
                            <tr><th>PHP mail()</th><td><?php echo function_exists('mail') ? 'available' : 'unavailable'; ?></td></tr>
                            <tr><th>SMTP host (php.ini)</th><td><?php echo esc_html((string) ini_get('SMTP')); ?></td></tr>
                            <tr><th>sendmail_path</th><td><?php echo esc_html((string) ini_get('sendmail_path')); ?></td></tr>
                            <tr><th>想定される原因</th><td>このプラグイン自体は wp_mail() まで到達しています。ログに <code>wp_mail() が false</code> と出る場合、アプリ側テンプレートではなく、WordPress / PHPMailer の送信基盤（SMTP・sendmail・Postfix など）未設定が主原因です。</td></tr>
                        </tbody>
                    </table>
                </div>
                </div>
            </div>
            <?php
        }

        public function handle_register(WP_REST_Request $request) {
            $params = $request->get_json_params();
            if (!is_array($params)) {
                $params = $request->get_params();
            }

            $email            = sanitize_email(isset($params['email']) ? $params['email'] : '');
            $password         = isset($params['password']) ? (string) $params['password'] : '';
            $password_confirm = isset($params['password_confirm']) ? (string) $params['password_confirm'] : '';
            $paper            = $this->resolve_paper($params, $request);
            $nickname         = sanitize_text_field(isset($params['nickname']) ? $params['nickname'] : '');

            if (!$email) {
                return new WP_REST_Response(array('success' => false, 'message' => 'メールアドレスを入力してください。'), 400);
            }

            if (!$password) {
                return new WP_REST_Response(array('success' => false, 'message' => 'パスワードを入力してください。'), 400);
            }

            if ($password !== $password_confirm) {
                return new WP_REST_Response(array('success' => false, 'message' => 'パスワードが一致しません。'), 400);
            }

            if (!$this->password_pattern_ok($password)) {
                return new WP_REST_Response(array('success' => false, 'message' => 'パスワードはアルファベット大文字・小文字、数字を含む8文字以上20字以内で入力してください。'), 400);
            }

            if (email_exists($email)) {
                return new WP_REST_Response(array('success' => false, 'message' => 'このメールアドレスは既に登録されています。'), 409);
            }

            $username = $this->build_unique_username($email, $nickname);
            $user_id = wp_insert_user(array(
                'user_login'   => $username,
                'user_pass'    => $password,
                'user_email'   => $email,
                'display_name' => $nickname ? $nickname : $email,
                'nickname'     => $nickname,
                'role'         => 'subscriber',
            ));

            if (is_wp_error($user_id)) {
                $this->add_log(array(
                    'type'    => 'register',
                    'paper'   => $paper,
                    'to'      => $email,
                    'success' => false,
                    'message' => $user_id->get_error_message(),
                ));
                return new WP_REST_Response(array('success' => false, 'message' => $user_id->get_error_message()), 500);
            }

            $profile = $this->extract_profile_fields($params);
            foreach ($profile as $meta_key => $value) {
                update_user_meta($user_id, $meta_key, $value);
            }
            update_user_meta($user_id, self::META_PREFIX . 'paper', $paper);

            $email_result = $this->send_registration_email($user_id, $paper, 'register');

            return new WP_REST_Response(array(
                'success'       => true,
                'message'       => '会員登録が完了しました。',
                'email_sent'    => !empty($email_result['success']),
                'email_message' => isset($email_result['message']) ? $email_result['message'] : '',
                'user'          => array(
                    'id'                    => (int) $user_id,
                    'email'                 => $email,
                    'nickname'              => $nickname,
                    'gender'                => (string) $profile[self::META_PREFIX . 'gender'],
                    'prefecture'            => (string) $profile[self::META_PREFIX . 'prefecture'],
                    'city'                  => (string) $profile[self::META_PREFIX . 'city'],
                    'occupation'            => (string) $profile[self::META_PREFIX . 'occupation'],
                    'farm_scale'            => (string) $profile[self::META_PREFIX . 'farm_scale'],
                    'crop_1'                => (string) $profile[self::META_PREFIX . 'crop_1'],
                    'crop_2'                => (string) $profile[self::META_PREFIX . 'crop_2'],
                    'future_crop'           => (string) $profile[self::META_PREFIX . 'future_crop'],
                    'interests'             => isset($profile[self::META_PREFIX . 'interests']) ? (array) $profile[self::META_PREFIX . 'interests'] : array(),
                    'newsletter_preference' => (string) $profile[self::META_PREFIX . 'newsletter_preference'],
                    'paper'                 => $paper,
                    'created_at'            => current_time('c'),
                    'updated_at'            => current_time('c'),
                ),
            ), 200);
        }


        public function handle_password_reset_request(WP_REST_Request $request) {
            $params = $request->get_json_params();
            if (!is_array($params)) {
                $params = $request->get_params();
            }

            $email = sanitize_email(isset($params['email']) ? $params['email'] : '');
            $paper = $this->resolve_paper($params, $request);
            $generic_message = '入力されたメールアドレス宛に、パスワード再設定用のURLを送信しました。';

            if (!$email) {
                return new WP_REST_Response(array('success' => false, 'message' => 'メールアドレスを入力してください。'), 400);
            }

            $user = get_user_by('email', $email);
            if (!$user) {
                $this->add_log(array(
                    'type'    => 'password_reset_request',
                    'paper'   => $paper,
                    'to'      => $email,
                    'success' => true,
                    'message' => '未登録メールアドレスのためメール送信は行いませんでした。',
                ));
                return new WP_REST_Response(array(
                    'success'    => true,
                    'message'    => $generic_message,
                    'email'      => $email,
                    'email_sent' => false,
                ), 200);
            }

            $result = $this->send_password_reset_email($user, $paper);

            return new WP_REST_Response(array(
                'success'    => true,
                'message'    => $generic_message,
                'email'      => $email,
                'email_sent' => !empty($result['success']),
            ), 200);
        }

        public function handle_password_reset_confirm(WP_REST_Request $request) {
            $params = $request->get_json_params();
            if (!is_array($params)) {
                $params = $request->get_params();
            }

            $login            = isset($params['login']) ? wp_unslash($params['login']) : '';
            $key              = isset($params['key']) ? wp_unslash($params['key']) : '';
            $password         = isset($params['password']) ? (string) $params['password'] : '';
            $password_confirm = isset($params['password_confirm']) ? (string) $params['password_confirm'] : '';
            $paper            = $this->resolve_paper($params, $request);

            if ($login === '' || $key === '') {
                return new WP_REST_Response(array('success' => false, 'message' => 'パスワード再設定URLが不正です。'), 400);
            }

            if (!$password) {
                return new WP_REST_Response(array('success' => false, 'message' => '新しいパスワードを入力してください。'), 400);
            }

            if ($password !== $password_confirm) {
                return new WP_REST_Response(array('success' => false, 'message' => 'パスワードが一致しません。'), 400);
            }

            if (!$this->password_pattern_ok($password)) {
                return new WP_REST_Response(array('success' => false, 'message' => 'パスワードはアルファベット大文字・小文字、数字を含む8文字以上20字以内で入力してください。'), 400);
            }

            $user = check_password_reset_key($key, $login);
            if (is_wp_error($user) || !$user instanceof WP_User) {
                $message = is_wp_error($user) ? $user->get_error_message() : 'パスワード再設定URLが無効です。';
                return new WP_REST_Response(array('success' => false, 'message' => $message), 400);
            }

            reset_password($user, $password);

            $user_id = (int) $user->ID;
            $nickname = get_user_meta($user_id, self::META_PREFIX . 'nickname', true);
            if (!$nickname) {
                $nickname = $user->display_name ? $user->display_name : $user->user_email;
            }
            $stored_paper = get_user_meta($user_id, self::META_PREFIX . 'paper', true);
            if ($stored_paper) {
                $paper = $this->sanitize_paper_slug($stored_paper);
            }

            $this->add_log(array(
                'type'    => 'password_reset_confirm',
                'paper'   => $paper,
                'to'      => $user->user_email,
                'success' => true,
                'message' => 'パスワード再設定に成功しました。',
            ));

            return new WP_REST_Response(array(
                'success' => true,
                'message' => 'パスワードを再設定しました。',
                'user'    => array(
                    'id'       => $user_id,
                    'email'    => $user->user_email,
                    'nickname' => $nickname,
                    'paper'    => $paper,
                ),
            ), 200);
        }

        private function send_test_email($paper, $to) {
            $paper = $this->sanitize_paper_slug($paper);
            $fake_user = (object) array(
                'ID'           => 0,
                'user_email'   => $to,
                'display_name' => 'テストユーザー',
            );

            return $this->deliver_email($paper, $to, $fake_user, array(
                '{{nickname}}'          => 'テストユーザー',
                '{{email}}'             => $to,
                '{{paper}}'             => $paper,
                '{{member_page_url}}'   => $this->build_member_page_url($paper),
                '{{registration_info}}' => "ニックネーム：テストユーザー\nメールアドレス：{$to}\n紙面：{$paper}",
                '{{site_name}}'         => wp_specialchars_decode(get_bloginfo('name'), ENT_QUOTES),
            ), 'test');
        }

        private function send_registration_email($user_id, $paper, $type) {
            $user = get_userdata($user_id);
            if (!$user) {
                return array('success' => false, 'message' => 'ユーザー情報の取得に失敗しました。');
            }

            $nickname = get_user_meta($user_id, self::META_PREFIX . 'nickname', true);
            if (!$nickname) {
                $nickname = $user->display_name ? $user->display_name : $user->user_email;
            }

            return $this->deliver_email($paper, $user->user_email, $user, array(
                '{{nickname}}'          => $nickname,
                '{{email}}'             => $user->user_email,
                '{{paper}}'             => $paper,
                '{{member_page_url}}'   => $this->build_member_page_url($paper),
                '{{registration_info}}' => $this->build_registration_info($user_id, $user),
                '{{site_name}}'         => wp_specialchars_decode(get_bloginfo('name'), ENT_QUOTES),
            ), $type);
        }

        private function deliver_email($paper, $to, $user, array $replacements, $type) {
            $settings = $this->get_settings();
            $paper = $this->sanitize_paper_slug($paper);
            $paper_settings = isset($settings[$paper]) && is_array($settings[$paper]) ? $settings[$paper] : $this->get_default_paper_settings($paper);

            if (empty($paper_settings['enabled'])) {
                $message = 'メール送信設定が無効です。';
                $this->add_log(array(
                    'type'    => $type,
                    'paper'   => $paper,
                    'to'      => $to,
                    'success' => false,
                    'message' => $message,
                ));
                return array('success' => false, 'message' => $message);
            }

            $subject = strtr((string) $paper_settings['subject'], $replacements);
            $body    = strtr((string) $paper_settings['body'], $replacements);
            $from_email = sanitize_email($paper_settings['from_email']);
            $from_name  = sanitize_text_field($paper_settings['from_name']);

            $headers = array('Content-Type: text/plain; charset=UTF-8');
            if ($from_email) {
                $formatted_from = $from_name ? sprintf('%s <%s>', $from_name, $from_email) : $from_email;
                $headers[] = 'From: ' . $formatted_from;
            }

            $this->reset_mail_diagnostics();
            $sent = wp_mail($to, $subject, $body, $headers);
            $message = $sent ? 'メール送信に成功しました。' : $this->build_mail_failure_message('wp_mail() が false を返しました。');

            $this->add_log(array(
                'type'    => $type,
                'paper'   => $paper,
                'to'      => $to,
                'success' => (bool) $sent,
                'message' => $message,
            ));

            return array('success' => (bool) $sent, 'message' => $message);
        }


        private function send_password_reset_email(WP_User $user, $paper) {
            $paper = $this->sanitize_paper_slug($paper);
            $user_id = (int) $user->ID;
            $nickname = get_user_meta($user_id, self::META_PREFIX . 'nickname', true);
            if (!$nickname) {
                $nickname = $user->display_name ? $user->display_name : $user->user_email;
            }

            $stored_paper = get_user_meta($user_id, self::META_PREFIX . 'paper', true);
            if ($stored_paper) {
                $paper = $this->sanitize_paper_slug($stored_paper);
            }

            $reset_key = get_password_reset_key($user);
            if (is_wp_error($reset_key)) {
                $message = $reset_key->get_error_message();
                $this->add_log(array(
                    'type'    => 'password_reset_request',
                    'paper'   => $paper,
                    'to'      => $user->user_email,
                    'success' => false,
                    'message' => $message,
                ));
                return array('success' => false, 'message' => $message);
            }

            $reset_url = $this->build_password_reset_url($paper, $user, $reset_key);
            $paper_label = $this->get_paper_label($paper);
            $subject = $paper_label . ': パスワード再設定';
            $body = $this->build_password_reset_email_html($paper_label, $nickname, $reset_url);

            $headers = array('Content-Type: text/html; charset=UTF-8');
            $headers[] = 'From: ' . sprintf('%s <%s>', $paper_label, 'noreply@agrinews.jp');

            $this->reset_mail_diagnostics();
            $sent = wp_mail($user->user_email, $subject, $body, $headers);
            $message = $sent ? 'パスワード再設定メール送信に成功しました。' : $this->build_mail_failure_message('wp_mail() が false を返しました。');

            $this->add_log(array(
                'type'    => 'password_reset_request',
                'paper'   => $paper,
                'to'      => $user->user_email,
                'success' => (bool) $sent,
                'message' => $message,
            ));

            return array('success' => (bool) $sent, 'message' => $message, 'reset_url' => $reset_url);
        }

        private function build_password_reset_email_html($paper_label, $nickname, $reset_url) {
            $safe_paper_label = esc_html($paper_label);
            $safe_nickname = esc_html($nickname);
            $safe_reset_url = esc_url($reset_url);

            return <<<HTML
<!doctype html>
<html lang="ja">
<head>
<meta charset="UTF-8">
</head>
<body style="margin:0;padding:0;background:#f5f5f5;color:#555;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Kaku Gothic ProN','Hiragino Sans','Yu Gothic',Meiryo,sans-serif;">
  <div style="max-width:860px;margin:0 auto;padding:56px 32px;background:#f5f5f5;">
    <p style="margin:0 0 44px;font-size:24px;line-height:1.7;font-weight:700;">{$safe_nickname} さん</p>
    <p style="margin:0 0 28px;font-size:22px;line-height:1.8;">{$safe_paper_label}をご利用いただきありがとうございます。</p>
    <p style="margin:0 0 42px;font-size:22px;line-height:1.8;">以下のリンクからパスワードを再設定してください。</p>
    <div style="text-align:center;margin:0 0 42px;">
      <a href="{$safe_reset_url}" style="display:inline-block;min-width:280px;padding:28px 52px;background:#c9654b;color:#ffffff;text-decoration:none;font-size:26px;font-weight:700;border-radius:4px;">再設定する</a>
    </div>
    <p style="margin:0 0 8px;font-size:18px;line-height:1.8;">※ボタンが動作しない場合は、以下のURLからアクセスしてください。</p>
    <p style="margin:0 0 48px;font-size:18px;line-height:1.8;word-break:break-all;"><a href="{$safe_reset_url}">{$safe_reset_url}</a></p>
    <hr style="border:none;border-top:1px solid #d9dce4;margin:0 0 48px;">
    <p style="margin:0 0 12px;font-size:18px;line-height:1.8;">※このメールは送信専用のメールアドレスからお送りしています。<br>ご返信いただいても回答はできませんので、あらかじめご了承ください。</p>
    <p style="margin:0;font-size:18px;line-height:1.8;">※このメールに心当たりがない場合、どなたかが誤って入力したものと思われます。お手数ですが、メールを破棄してください。</p>
  </div>
</body>
</html>
HTML;
        }

        private function build_password_reset_url($paper, WP_User $user, $reset_key) {
            $paper = $this->sanitize_paper_slug($paper);
            $base_url = $this->build_account_login_url($paper);
            $query = array(
                'paper'     => $paper,
                'mode'      => 'reset',
                'login'     => $user->user_login,
                'key'       => $reset_key,
                'cms_hint'  => $this->encode_frontend_cms_hint(home_url()),
            );
            return add_query_arg($query, $base_url);
        }

        private function encode_frontend_cms_hint($url) {
            $normalized = untrailingslashit((string) $url);
            if ($normalized === '') {
                return '';
            }

            return rtrim(strtr(base64_encode($normalized), '+/', '-_'), '=');
        }

        private function build_account_login_url($paper) {
            $paper = $this->sanitize_paper_slug($paper);
            $frontend_base = $this->detect_frontend_base_url();
            if ($frontend_base) {
                return trailingslashit($frontend_base) . 'static/account/login.html';
            }

            $host = wp_parse_url(home_url(), PHP_URL_HOST);
            $home = trailingslashit(home_url('/'));
            if (!$host) {
                return $home . 'static/account/login.html';
            }

            if (preg_match('/(^|\.)localhost$/i', $host) || preg_match('/^127\.0\.0\.1$/', $host)) {
                return $home . 'static/account/login.html';
            }

            if (stripos($host, 'stg-') === 0 || stripos($host, '.stg.') !== false || preg_match('/(^|\.)stg[-.]/i', $host)) {
                return 'https://stg-' . $paper . '.agrinews.jp/static/account/login.html';
            }

            return 'https://' . $paper . '.agrinews.jp/static/account/login.html';
        }

        private function detect_frontend_base_url() {
            $candidates = array();

            if (!empty($_SERVER['HTTP_ORIGIN'])) {
                $candidates[] = wp_unslash($_SERVER['HTTP_ORIGIN']);
            }

            if (!empty($_SERVER['HTTP_REFERER'])) {
                $candidates[] = wp_unslash($_SERVER['HTTP_REFERER']);
            }

            if (!empty($_SERVER['HTTP_X_FORWARDED_HOST'])) {
                $proto = !empty($_SERVER['HTTP_X_FORWARDED_PROTO']) ? wp_unslash($_SERVER['HTTP_X_FORWARDED_PROTO']) : 'https';
                $host = trim(wp_unslash($_SERVER['HTTP_X_FORWARDED_HOST']));
                if ($host) {
                    $candidates[] = $proto . '://' . $host;
                }
            }

            foreach ($candidates as $candidate) {
                $candidate = trim((string) $candidate);
                if ($candidate === '') {
                    continue;
                }

                $parts = wp_parse_url($candidate);
                if (empty($parts['host'])) {
                    continue;
                }

                $host = strtolower((string) $parts['host']);
                if (!preg_match('/(^|\.)agrinews\.jp$/i', $host)) {
                    continue;
                }

                $scheme = !empty($parts['scheme']) ? strtolower((string) $parts['scheme']) : 'https';
                if ($scheme !== 'http' && $scheme !== 'https') {
                    $scheme = 'https';
                }

                return $scheme . '://' . $host;
            }

            return '';
        }

        private function render_template_for_preview(array $paper_settings, $paper) {
            $replacements = array(
                '{{nickname}}'          => '山田太郎',
                '{{email}}'             => 'sample@example.com',
                '{{paper}}'             => $paper,
                '{{member_page_url}}'   => $this->build_member_page_url($paper),
                '{{registration_info}}' => "ニックネーム：山田太郎\nメールアドレス：sample@example.com\n都道府県：大阪府\n職業：生産者",
                '{{site_name}}'         => wp_specialchars_decode(get_bloginfo('name'), ENT_QUOTES),
            );

            $subject = strtr((string) $paper_settings['subject'], $replacements);
            $body = strtr((string) $paper_settings['body'], $replacements);
            return "件名：{$subject}\n\n{$body}";
        }

        private function extract_profile_fields(array $params) {
            $interests = array();
            if (isset($params['interests']) && is_array($params['interests'])) {
                $interests = array_values(array_filter(array_map('sanitize_text_field', $params['interests'])));
            }

            return array(
                self::META_PREFIX . 'nickname'              => sanitize_text_field(isset($params['nickname']) ? $params['nickname'] : ''),
                self::META_PREFIX . 'gender'                => sanitize_text_field(isset($params['gender']) ? $params['gender'] : ''),
                self::META_PREFIX . 'prefecture'            => sanitize_text_field(isset($params['prefecture']) ? $params['prefecture'] : ''),
                self::META_PREFIX . 'city'                  => sanitize_text_field(isset($params['city']) ? $params['city'] : ''),
                self::META_PREFIX . 'occupation'            => sanitize_text_field(isset($params['occupation']) ? $params['occupation'] : ''),
                self::META_PREFIX . 'farm_scale'            => sanitize_text_field(isset($params['farm_scale']) ? $params['farm_scale'] : ''),
                self::META_PREFIX . 'crop_1'                => sanitize_text_field(isset($params['crop_1']) ? $params['crop_1'] : ''),
                self::META_PREFIX . 'crop_2'                => sanitize_text_field(isset($params['crop_2']) ? $params['crop_2'] : ''),
                self::META_PREFIX . 'future_crop'           => sanitize_text_field(isset($params['future_crop']) ? $params['future_crop'] : ''),
                self::META_PREFIX . 'interests'             => $interests,
                self::META_PREFIX . 'newsletter_preference' => sanitize_text_field(isset($params['newsletter_preference']) ? $params['newsletter_preference'] : '希望する'),
            );
        }

        private function password_pattern_ok($password) {
            return (bool) preg_match('/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,20}$/', (string) $password);
        }

        private function build_unique_username($email, $nickname) {
            $base_name = $nickname ? $nickname : strstr($email, '@', true);
            $base = sanitize_user((string) $base_name, true);
            if (!$base) {
                $base = 'member';
            }
            $candidate = $base;
            $suffix = 1;
            while (username_exists($candidate)) {
                $candidate = $base . $suffix;
                $suffix++;
            }
            return $candidate;
        }

        private function build_registration_info($user_id, WP_User $user) {
            $pairs = array(
                'ニックネーム'        => get_user_meta($user_id, self::META_PREFIX . 'nickname', true),
                'メールアドレス'      => $user->user_email,
                '性別'                => get_user_meta($user_id, self::META_PREFIX . 'gender', true),
                '都道府県'            => get_user_meta($user_id, self::META_PREFIX . 'prefecture', true),
                '市町村'              => get_user_meta($user_id, self::META_PREFIX . 'city', true),
                '職業'                => get_user_meta($user_id, self::META_PREFIX . 'occupation', true),
                '営農規模'            => get_user_meta($user_id, self::META_PREFIX . 'farm_scale', true),
                '栽培品目（1品目目）' => get_user_meta($user_id, self::META_PREFIX . 'crop_1', true),
                '栽培品目（2品目目）' => get_user_meta($user_id, self::META_PREFIX . 'crop_2', true),
                '今後栽培したい品目'  => get_user_meta($user_id, self::META_PREFIX . 'future_crop', true),
            );

            $interests = get_user_meta($user_id, self::META_PREFIX . 'interests', true);
            if (is_array($interests) && !empty($interests)) {
                $pairs['興味・関心'] = implode('、', array_map('strval', $interests));
            }

            $newsletter = get_user_meta($user_id, self::META_PREFIX . 'newsletter_preference', true);
            if ($newsletter !== '') {
                $pairs['情報配信の希望'] = $newsletter;
            }

            $lines = array();
            foreach ($pairs as $label => $value) {
                $value = is_array($value) ? implode('、', $value) : (string) $value;
                if ($value === '') {
                    continue;
                }
                $lines[] = sprintf('%s：%s', $label, $value);
            }

            return implode("\n", $lines);
        }

        private function build_member_page_url($paper) {
            $paper = $this->sanitize_paper_slug($paper);
            $host = wp_parse_url(home_url(), PHP_URL_HOST);
            $home = home_url('/');
            if (!$host) {
                return trailingslashit($home) . 'static/' . rawurlencode($paper) . '/index.html';
            }

            if (preg_match('/(^|\.)localhost$/i', $host) || preg_match('/^127\.0\.0\.1$/', $host)) {
                return trailingslashit($home) . 'static/' . rawurlencode($paper) . '/index.html';
            }

            if (stripos($host, 'stg-') === 0 || stripos($host, '.stg.') !== false || preg_match('/(^|\.)stg[-.]/i', $host)) {
                return 'https://stg-' . $paper . '.agrinews.jp/';
            }

            return 'https://' . $paper . '.agrinews.jp/';
        }

        private function resolve_paper(array $params, WP_REST_Request $request) {
            if (!empty($params['paper'])) {
                return $this->sanitize_paper_slug($params['paper']);
            }

            $host = '';
            if (method_exists($request, 'get_header')) {
                $host = (string) $request->get_header('host');
                if (!$host) {
                    $host = (string) $request->get_header('x-forwarded-host');
                }
            }
            if (!$host && !empty($_SERVER['HTTP_HOST'])) {
                $host = (string) $_SERVER['HTTP_HOST'];
            }
            $host = strtolower(trim($host));
            $host = preg_replace('/:\d+$/', '', $host);

            foreach ($this->get_papers() as $paper) {
                if ($host === $paper . '.agrinews.jp' || $host === 'stg-' . $paper . '.agrinews.jp') {
                    return $paper;
                }
                if (strpos($host, $paper . '.') === 0 || strpos($host, 'stg-' . $paper . '.') === 0) {
                    return $paper;
                }
            }

            return 'tomato';
        }

        private function get_settings() {
            $saved = get_option(self::OPTION_KEY, array());
            $settings = array();
            foreach ($this->get_papers() as $paper) {
                $defaults = $this->get_default_paper_settings($paper);
                $current  = isset($saved[$paper]) && is_array($saved[$paper]) ? $saved[$paper] : array();
                $settings[$paper] = wp_parse_args($current, $defaults);
            }
            return $settings;
        }

        private function sanitize_settings(array $raw) {
            $sanitized = array();
            foreach ($this->get_papers() as $paper) {
                $defaults = $this->get_default_paper_settings($paper);
                $row = isset($raw[$paper]) && is_array($raw[$paper]) ? $raw[$paper] : array();
                $sanitized[$paper] = array(
                    'enabled'    => empty($row['enabled']) ? 0 : 1,
                    'from_email' => !empty($row['from_email']) ? sanitize_email($row['from_email']) : $defaults['from_email'],
                    'from_name'  => !empty($row['from_name']) ? sanitize_text_field($row['from_name']) : $defaults['from_name'],
                    'subject'    => !empty($row['subject']) ? sanitize_text_field($row['subject']) : $defaults['subject'],
                    'body'       => isset($row['body']) ? trim((string) $row['body']) : $defaults['body'],
                );
            }
            return $sanitized;
        }

        private function get_papers() {
            $terms = get_terms(array(
                'taxonomy'   => 'category',
                'hide_empty' => false,
            ));

            $papers = array();
            if (!is_wp_error($terms)) {
                foreach ($terms as $term) {
                    if (empty($term->slug) || $term->slug === 'uncategorized') {
                        continue;
                    }
                    $papers[] = sanitize_key($term->slug);
                }
            }

            $papers = array_values(array_unique(array_filter($papers)));
            if (empty($papers)) {
                $papers = array('tomato', 'leek', 'strawberry');
            }
            return $papers;
        }

        private function sanitize_paper_slug($paper) {
            $paper = sanitize_key((string) $paper);
            $papers = $this->get_papers();
            if (!$paper || !in_array($paper, $papers, true)) {
                return 'tomato';
            }
            return $paper;
        }

        private function get_default_paper_settings($paper) {
            $label = $this->get_paper_label($paper);
            return array(
                'enabled'    => 1,
                'from_email' => 'noreply@tomato.agrinews.jp',
                'from_name'  => $label,
                'subject'    => $label . '会員登録完了のお知らせ',
                'body'       => $this->get_default_body_template($paper),
            );
        }

        private function get_default_body_template($paper) {
            $label = $this->get_paper_label($paper);
            return implode("\n", array(
                '※このメールは自動返信メールです。',
                '',
                '{{nickname}} 様',
                '',
                $label . 'の会員登録が完了いたしました。',
                'ご登録ありがとうございます。',
                '',
                '■登録情報',
                '{{registration_info}}',
                '',
                '■会員ページのURL',
                '{{member_page_url}}',
                '',
                '※会員情報の変更は、会員ページよりお手続きください。',
                '',
                'それでは今後ともよろしくお願い申し上げます。',
                '',
                '━━━━━━━━━━━━━━━━━━━━━━━━',
                $label . '運営事務局',
                'Email：info@tomato.agrinews.jp',
                '━━━━━━━━━━━━━━━━━━━━━━━━',
            ));
        }

        private function get_paper_label($paper) {
            $map = array(
                'tomato'     => 'トマト新聞',
                'leek'       => 'リーク新聞',
                'strawberry' => 'ストロベリー新聞',
            );
            if (isset($map[$paper])) {
                return $map[$paper];
            }
            return ucfirst($paper);
        }

        private function get_logs() {
            $logs = get_option(self::LOG_OPTION_KEY, array());
            return is_array($logs) ? $logs : array();
        }

        private function add_log(array $log) {
            $logs = $this->get_logs();
            array_unshift($logs, array(
                'created_at' => current_time('Y-m-d H:i:s'),
                'type'       => isset($log['type']) ? sanitize_text_field($log['type']) : '',
                'paper'      => isset($log['paper']) ? sanitize_text_field($log['paper']) : '',
                'to'         => isset($log['to']) ? sanitize_email($log['to']) : '',
                'success'    => !empty($log['success']) ? 1 : 0,
                'message'    => isset($log['message']) ? sanitize_textarea_field($log['message']) : '',
            ));
            if (count($logs) > self::LOG_LIMIT) {
                $logs = array_slice($logs, 0, self::LOG_LIMIT);
            }
            update_option(self::LOG_OPTION_KEY, $logs, false);
        }
    }

    new Member_Registration_Manager();
}
