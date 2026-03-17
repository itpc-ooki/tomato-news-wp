<?php
/**
 * Plugin Name: Contact Inquiry Manager
 * Description: Handles お問い合わせ form submissions from the static frontend, stores them in WordPress admin, and emails notifications.
 * Version: 1.0.2
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!class_exists('Tomato_Contact_Inquiry_Manager')) {
    final class Tomato_Contact_Inquiry_Manager {
        const POST_TYPE = 'tomato_contact';
        const REST_NAMESPACE = 'tomato-contact/v1';
        const OPTION_KEY = 'tomato_contact_settings';
        const META_PREFIX = '_tomato_contact_';

        public function __construct() {
            add_action('init', array($this, 'register_post_type'));
            add_action('add_meta_boxes', array($this, 'register_meta_boxes'));
            add_action('rest_api_init', array($this, 'register_rest_routes'));
            add_filter('manage_' . self::POST_TYPE . '_posts_columns', array($this, 'filter_admin_columns'));
            add_action('manage_' . self::POST_TYPE . '_posts_custom_column', array($this, 'render_admin_columns'), 10, 2);
            add_filter('manage_edit-' . self::POST_TYPE . '_sortable_columns', array($this, 'register_sortable_columns'));
            add_action('pre_get_posts', array($this, 'apply_admin_sorting'));
        }

        public function register_post_type() {
            register_post_type(self::POST_TYPE, array(
                'labels' => array(
                    'name'               => 'お問い合わせ',
                    'singular_name'      => 'お問い合わせ',
                    'menu_name'          => 'お問い合わせ',
                    'name_admin_bar'     => 'お問い合わせ',
                    'add_new'            => '新規追加',
                    'add_new_item'       => 'お問い合わせを追加',
                    'edit_item'          => 'お問い合わせを編集',
                    'new_item'           => '新しいお問い合わせ',
                    'view_item'          => 'お問い合わせを表示',
                    'search_items'       => 'お問い合わせを検索',
                    'not_found'          => 'お問い合わせはありません',
                    'not_found_in_trash' => 'ゴミ箱にお問い合わせはありません',
                    'all_items'          => 'お問い合わせ一覧',
                ),
                'public'              => false,
                'show_ui'             => true,
                'show_in_menu'        => true,
                'menu_position'       => 26,
                'menu_icon'           => 'dashicons-email-alt',
                'supports'            => array('title', 'editor'),
                'capability_type'     => 'post',
                'map_meta_cap'        => true,
                'has_archive'         => false,
                'rewrite'             => false,
                'show_in_rest'        => false,
            ));
        }

        public function register_meta_boxes() {
            add_meta_box(
                'tomato-contact-inquiry-details',
                'お問い合わせ詳細',
                array($this, 'render_details_meta_box'),
                self::POST_TYPE,
                'normal',
                'high'
            );
        }

        public function render_details_meta_box($post) {
            $fields = array(
                'paper'        => '紙面',
                'category'     => 'お問い合わせ種別',
                'name'         => 'お名前',
                'organization' => '所属（会社・JA名など）',
                'email'        => 'メールアドレス',
                'tel'          => '電話番号',
                'agreement'    => '同意状況',
                'page_url'     => '送信ページ',
                'submitted_at' => '受信日時',
                'mail_sent'    => '通知メール送信',
                'ip_hash'      => 'IPハッシュ',
            );

            echo '<table class="form-table" role="presentation"><tbody>';
            foreach ($fields as $key => $label) {
                $value = get_post_meta($post->ID, self::META_PREFIX . $key, true);
                if ($key === 'page_url' && $value) {
                    $display = sprintf('<a href="%s" target="_blank" rel="noopener noreferrer">%s</a>', esc_url($value), esc_html($value));
                } else {
                    $display = esc_html((string) $value);
                }
                echo '<tr>';
                echo '<th scope="row" style="width:220px;">' . esc_html($label) . '</th>';
                echo '<td>' . ($display !== '' ? $display : '—') . '</td>';
                echo '</tr>';
            }
            echo '</tbody></table>';
            echo '<p><strong>お問い合わせ内容</strong></p>';
            echo '<div style="white-space:pre-wrap; background:#fff; border:1px solid #dcdcde; padding:12px;">' . esc_html($post->post_content) . '</div>';
        }

        public function filter_admin_columns($columns) {
            $new = array();
            foreach ($columns as $key => $label) {
                if ($key === 'title') {
                    $new['title'] = '管理タイトル';
                    $new['paper'] = '紙面';
                    $new['category'] = 'お問い合わせ種別';
                    $new['sender_name'] = 'お名前';
                    $new['organization'] = '所属（会社・JA名など）';
                    $new['sender_email'] = 'メールアドレス';
                    $new['sender_tel'] = '電話番号';
                    $new['inquiry_message'] = 'お問い合わせ内容';
                    $new['agreement'] = '同意';
                    $new['mail_sent'] = '通知';
                } elseif ($key === 'date') {
                    $new['date'] = '受信日時';
                } else {
                    $new[$key] = $label;
                }
            }
            return $new;
        }

        public function render_admin_columns($column, $post_id) {
            switch ($column) {
                case 'paper':
                    echo esc_html(get_post_meta($post_id, self::META_PREFIX . 'paper', true));
                    break;
                case 'category':
                    echo esc_html(get_post_meta($post_id, self::META_PREFIX . 'category', true));
                    break;
                case 'sender_name':
                    echo esc_html(get_post_meta($post_id, self::META_PREFIX . 'name', true));
                    break;
                case 'organization':
                    $organization = get_post_meta($post_id, self::META_PREFIX . 'organization', true);
                    echo esc_html($organization !== '' ? $organization : '—');
                    break;
                case 'sender_email':
                    $email = get_post_meta($post_id, self::META_PREFIX . 'email', true);
                    if ($email) {
                        echo sprintf('<a href="mailto:%s">%s</a>', esc_attr($email), esc_html($email));
                    } else {
                        echo '—';
                    }
                    break;
                case 'sender_tel':
                    $tel = get_post_meta($post_id, self::META_PREFIX . 'tel', true);
                    echo esc_html($tel !== '' ? $tel : '—');
                    break;
                case 'inquiry_message':
                    $message = get_post_field('post_content', $post_id);
                    if ($message !== '') {
                        $message = wp_strip_all_tags((string) $message, true);
                        if (function_exists('mb_strimwidth')) {
                            $message = mb_strimwidth($message, 0, 120, '…', 'UTF-8');
                        } else {
                            $message = strlen($message) > 60 ? substr($message, 0, 60) . '…' : $message;
                        }
                        echo esc_html($message);
                    } else {
                        echo '—';
                    }
                    break;
                case 'agreement':
                    $agreement = get_post_meta($post_id, self::META_PREFIX . 'agreement', true);
                    echo esc_html($agreement !== '' ? $agreement : '—');
                    break;
                case 'mail_sent':
                    $mail_sent = get_post_meta($post_id, self::META_PREFIX . 'mail_sent', true);
                    echo esc_html($mail_sent !== '' ? $mail_sent : '—');
                    break;
            }
        }

        public function register_sortable_columns($columns) {
            $columns['paper'] = 'paper';
            $columns['category'] = 'category';
            $columns['sender_name'] = 'sender_name';
            $columns['organization'] = 'organization';
            $columns['sender_email'] = 'sender_email';
            $columns['sender_tel'] = 'sender_tel';
            $columns['agreement'] = 'agreement';
            return $columns;
        }

        public function apply_admin_sorting($query) {
            if (!is_admin() || !$query->is_main_query()) {
                return;
            }

            if ($query->get('post_type') !== self::POST_TYPE) {
                return;
            }

            $orderby = $query->get('orderby');
            $meta_key = '';
            if ($orderby === 'paper') {
                $meta_key = self::META_PREFIX . 'paper';
            } elseif ($orderby === 'category') {
                $meta_key = self::META_PREFIX . 'category';
            } elseif ($orderby === 'sender_name') {
                $meta_key = self::META_PREFIX . 'name';
            } elseif ($orderby === 'organization') {
                $meta_key = self::META_PREFIX . 'organization';
            } elseif ($orderby === 'sender_email') {
                $meta_key = self::META_PREFIX . 'email';
            } elseif ($orderby === 'sender_tel') {
                $meta_key = self::META_PREFIX . 'tel';
            } elseif ($orderby === 'agreement') {
                $meta_key = self::META_PREFIX . 'agreement';
            }

            if ($meta_key) {
                $query->set('meta_key', $meta_key);
                $query->set('orderby', 'meta_value');
            }
        }

        public function register_rest_routes() {
            register_rest_route(self::REST_NAMESPACE, '/submit', array(
                'methods'             => 'POST',
                'callback'            => array($this, 'handle_submit'),
                'permission_callback' => '__return_true',
            ));
        }

        public function handle_submit(WP_REST_Request $request) {
            $params = $request->get_json_params();
            if (!is_array($params) || empty($params)) {
                $params = $request->get_params();
            }

            $category = sanitize_text_field(isset($params['category']) ? $params['category'] : '');
            $name = sanitize_text_field(isset($params['name']) ? $params['name'] : '');
            $organization = sanitize_text_field(isset($params['organization']) ? $params['organization'] : '');
            $email = sanitize_email(isset($params['email']) ? $params['email'] : '');
            $tel = sanitize_text_field(isset($params['tel']) ? $params['tel'] : '');
            $message = trim((string) (isset($params['message']) ? $params['message'] : ''));
            $agreement = !empty($params['agreement']);
            $page_url = esc_url_raw(isset($params['page_url']) ? $params['page_url'] : '');
            $paper = $this->resolve_paper(isset($params['paper']) ? $params['paper'] : '', $request);

            if ($category === '' || $name === '' || $email === '' || $message === '') {
                return new WP_REST_Response(array(
                    'success' => false,
                    'message' => '必須項目を入力してください。',
                ), 400);
            }

            if (!is_email($email)) {
                return new WP_REST_Response(array(
                    'success' => false,
                    'message' => 'メールアドレスの形式が正しくありません。',
                ), 400);
            }

            if (!$agreement) {
                return new WP_REST_Response(array(
                    'success' => false,
                    'message' => 'プライバシーポリシーおよび利用規約への同意が必要です。',
                ), 400);
            }

            $submitted_at = current_time('mysql');
            $title = sprintf('[%s] %s / %s', $paper, $this->get_category_label($category), $name);
            $post_id = wp_insert_post(array(
                'post_type'    => self::POST_TYPE,
                'post_status'  => 'publish',
                'post_title'   => $title,
                'post_content' => $message,
            ), true);

            if (is_wp_error($post_id)) {
                return new WP_REST_Response(array(
                    'success' => false,
                    'message' => 'お問い合わせの保存に失敗しました。',
                ), 500);
            }

            $ip_address = isset($_SERVER['REMOTE_ADDR']) ? (string) $_SERVER['REMOTE_ADDR'] : '';
            $ip_hash = $ip_address ? wp_hash($ip_address) : '';

            update_post_meta($post_id, self::META_PREFIX . 'paper', $paper);
            update_post_meta($post_id, self::META_PREFIX . 'category', $this->get_category_label($category));
            update_post_meta($post_id, self::META_PREFIX . 'name', $name);
            update_post_meta($post_id, self::META_PREFIX . 'organization', $organization);
            update_post_meta($post_id, self::META_PREFIX . 'email', $email);
            update_post_meta($post_id, self::META_PREFIX . 'tel', $tel);
            update_post_meta($post_id, self::META_PREFIX . 'agreement', $agreement ? '同意済み' : '未同意');
            update_post_meta($post_id, self::META_PREFIX . 'page_url', $page_url);
            update_post_meta($post_id, self::META_PREFIX . 'submitted_at', $submitted_at);
            update_post_meta($post_id, self::META_PREFIX . 'ip_hash', $ip_hash);

            $mail_result = $this->send_notification_mail(array(
                'paper'        => $paper,
                'category'     => $this->get_category_label($category),
                'name'         => $name,
                'organization' => $organization,
                'email'        => $email,
                'tel'          => $tel,
                'message'      => $message,
                'page_url'     => $page_url,
                'submitted_at' => $submitted_at,
            ));

            update_post_meta($post_id, self::META_PREFIX . 'mail_sent', $mail_result['success'] ? '送信済み' : '失敗');

            return new WP_REST_Response(array(
                'success'   => true,
                'message'   => $mail_result['success'] ? 'お問い合わせを受け付けました。' : 'お問い合わせを受け付けました。通知メール送信は失敗しましたが、WordPress管理画面には保存されています。',
                'post_id'   => (int) $post_id,
                'mail_sent' => (bool) $mail_result['success'],
            ), 200);
        }

        private function send_notification_mail(array $data) {
            $to = get_option('admin_email');
            if (!$to || !is_email($to)) {
                return array('success' => false, 'message' => 'admin_email is not configured.');
            }

            $paper_label = $this->get_paper_label($data['paper']);
            $subject = sprintf('【%s】お問い合わせが届きました（%s）', $paper_label, $data['category']);
            $body = implode("\n", array(
                'お問い合わせを受信しました。',
                '',
                '紙面：' . $paper_label,
                'お問い合わせ種別：' . $data['category'],
                'お名前：' . $data['name'],
                '所属：' . ($data['organization'] !== '' ? $data['organization'] : '未入力'),
                'メールアドレス：' . $data['email'],
                '電話番号：' . ($data['tel'] !== '' ? $data['tel'] : '未入力'),
                '受信日時：' . $data['submitted_at'],
                '送信ページ：' . ($data['page_url'] !== '' ? $data['page_url'] : '不明'),
                '',
                'お問い合わせ内容',
                '------------------------------',
                $data['message'],
                '------------------------------',
            ));

            $headers = array(
                'Content-Type: text/plain; charset=UTF-8',
                'Reply-To: ' . sprintf('%s <%s>', $data['name'], $data['email']),
            );

            $sent = wp_mail($to, $subject, $body, $headers);
            return array(
                'success' => (bool) $sent,
                'message' => $sent ? 'sent' : 'failed',
            );
        }

        private function resolve_paper($paper, WP_REST_Request $request) {
            $paper = sanitize_key((string) $paper);
            if ($paper !== '') {
                return $paper;
            }

            $origin = (string) $request->get_header('origin');
            $referer = (string) $request->get_header('referer');
            $source = $referer ?: $origin;
            if ($source && preg_match('#/static/([a-z0-9-]+)/#i', $source, $matches)) {
                return sanitize_key($matches[1]);
            }

            return 'tomato';
        }

        private function get_category_label($category) {
            $labels = array(
                'membership'    => '会員登録・ログインについて',
                'content'       => 'コンテンツ・記事について',
                'seminar'       => 'WEBセミナーについて',
                'advertisement' => '広告掲載について',
                'other'         => 'その他',
            );

            return isset($labels[$category]) ? $labels[$category] : $category;
        }

        private function get_paper_label($paper) {
            $labels = array(
                'tomato'     => 'トマト新聞',
                'leek'       => 'ねぎ新聞',
                'strawberry' => 'いちご新聞',
            );

            return isset($labels[$paper]) ? $labels[$paper] : $paper;
        }
    }

    new Tomato_Contact_Inquiry_Manager();
}
