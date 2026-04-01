<?php
/**
 * Tomato News - Market Data (MU Plugin)
 *
 * 管理画面で「最新の市況データ（価格/取引量）」を入力し、
 * static/{paper}/market.json を生成する。
 *
 * - CPT: market_data
 * - taxonomy: paper（既存があればそれを利用）
 * - meta:
 *   - market_date (Y-m-d)
 *   - market_variety (slug)
 *   - market_price (int)   // 円/kg
 *   - market_volume (int)  // トン
 *
 * JSONは「品目ごと」に最新1件＋直前1件を比較して差分と↑↓を入れる
 */

if (!defined('ABSPATH')) exit;

class Tomato_Market_Data {
    const CPT = 'market_data';
    const TAX_PAPER = 'paper';

    // 品目（必要に応じて増やせます）
    const VARIETIES = [
        'big'   => '大玉トマト',
        'mid'   => '中玉トマト',
        'mini'  => 'ミニトマト',
        'first' => 'ファーストトマト',
    ];

    public static function init(): void {
        add_action('init', [__CLASS__, 'register_cpt']);
        add_action('init', [__CLASS__, 'maybe_register_paper_taxonomy'], 20);

        add_action('add_meta_boxes', [__CLASS__, 'add_metabox']);
        add_action('save_post_' . self::CPT, [__CLASS__, 'save_meta'], 10, 2);
        add_action('trashed_post', [__CLASS__, 'handle_status_change'], 10, 1);
        add_action('untrashed_post', [__CLASS__, 'handle_status_change'], 10, 1);
        add_action('before_delete_post', [__CLASS__, 'handle_status_change'], 10, 1);
        add_action('set_object_terms', [__CLASS__, 'handle_term_change'], 10, 6);

        add_filter('manage_' . self::CPT . '_posts_columns', [__CLASS__, 'columns']);
        add_action('manage_' . self::CPT . '_posts_custom_column', [__CLASS__, 'column_content'], 10, 2);

        // 生成は重いので即時ではなく、短時間で1回だけ実行する（連続保存対策）
        add_action('tomato_market_export_event', [__CLASS__, 'export_json_for_paper']);

        // WP-CLIコマンド（手動生成用）
        if (defined('WP_CLI') && WP_CLI) {
            WP_CLI::add_command('tomato market export', [__CLASS__, 'cli_export']);
        }
    }

    public static function register_cpt(): void {
        register_post_type(self::CPT, [
            'labels' => [
                'name' => '市況データ',
                'singular_name' => '市況データ',
                'add_new' => '新規追加',
                'add_new_item' => '市況データを追加',
                'edit_item' => '市況データを編集',
            ],
            'public' => false,
            'show_ui' => true,
            'menu_position' => 25,
            'menu_icon' => 'dashicons-chart-line',
            'supports' => ['title'],
            'has_archive' => false,
        ]);
    }

    /**
     * 既に paper taxonomy がある前提のプロジェクトなので、
     * 無い場合だけ最低限のtaxonomyを作る（安全策）
     */
    public static function maybe_register_paper_taxonomy(): void {
        if (taxonomy_exists(self::TAX_PAPER)) return;

        register_taxonomy(self::TAX_PAPER, [self::CPT], [
            'labels' => ['name' => '紙（paper）'],
            'public' => false,
            'show_ui' => true,
            'hierarchical' => false,
            'show_admin_column' => true,
        ]);
    }

    public static function add_metabox(): void {
        add_meta_box(
            'tomato_market_meta',
            '市況データ入力',
            [__CLASS__, 'render_metabox'],
            self::CPT,
            'normal',
            'high'
        );
    }

    public static function render_metabox(\WP_Post $post): void {
        wp_nonce_field('tomato_market_save', 'tomato_market_nonce');

        $market_date  = get_post_meta($post->ID, 'market_date', true);
        $variety      = get_post_meta($post->ID, 'market_variety', true);
        $price        = get_post_meta($post->ID, 'market_price', true);
        $volume       = get_post_meta($post->ID, 'market_volume', true);

        if (!$market_date) $market_date = current_time('Y-m-d');

        ?>
        <style>
          .tm-row { display:flex; gap:16px; margin: 10px 0; flex-wrap: wrap; }
          .tm-field { min-width: 240px; }
          .tm-field label { display:block; font-weight:600; margin-bottom:6px; }
          .tm-field input, .tm-field select { width:100%; }
          .tm-help { color:#666; font-size:12px; margin-top:6px; }
        </style>

        <div class="tm-row">
          <div class="tm-field">
            <label>日付</label>
            <input type="date" name="market_date" value="<?php echo esc_attr($market_date); ?>">
            <div class="tm-help">例：2026-02-03（この日付で「前回データ」と比較します）</div>
          </div>

          <div class="tm-field">
            <label>品目</label>
            <select name="market_variety">
              <?php foreach (self::VARIETIES as $k => $label): ?>
                <option value="<?php echo esc_attr($k); ?>" <?php selected($variety, $k); ?>>
                  <?php echo esc_html($label); ?>
                </option>
              <?php endforeach; ?>
            </select>
          </div>
        </div>

        <div class="tm-row">
          <div class="tm-field">
            <label>価格（円/kg）</label>
            <input type="number" name="market_price" value="<?php echo esc_attr($price); ?>" min="0" step="1" placeholder="例：878">
          </div>

          <div class="tm-field">
            <label>取引量（トン）</label>
            <input type="number" name="market_volume" value="<?php echo esc_attr($volume); ?>" min="0" step="1" placeholder="例：47">
          </div>
        </div>

        <div class="tm-help">
          保存すると <code>static/{paper}/market.json</code> を自動生成します（paper が未設定の場合は tomato 扱い）。
        </div>
        <?php
    }

    public static function save_meta(int $post_id, \WP_Post $post): void {
        if (!isset($_POST['tomato_market_nonce']) || !wp_verify_nonce($_POST['tomato_market_nonce'], 'tomato_market_save')) return;
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
        if (!current_user_can('edit_post', $post_id)) return;

        $market_date = isset($_POST['market_date']) ? sanitize_text_field($_POST['market_date']) : '';
        $variety     = isset($_POST['market_variety']) ? sanitize_text_field($_POST['market_variety']) : '';
        $price       = isset($_POST['market_price']) ? intval($_POST['market_price']) : 0;
        $volume      = isset($_POST['market_volume']) ? intval($_POST['market_volume']) : 0;

        if (!$market_date) $market_date = current_time('Y-m-d');
        if (!array_key_exists($variety, self::VARIETIES)) $variety = array_key_first(self::VARIETIES);

        update_post_meta($post_id, 'market_date', $market_date);
        update_post_meta($post_id, 'market_variety', $variety);
        update_post_meta($post_id, 'market_price', $price);
        update_post_meta($post_id, 'market_volume', $volume);

        // paper taxonomy 取得（未設定なら tomato）
        $paper = self::get_paper_slug($post_id);

        // 連続保存でも1回にまとめる
        wp_clear_scheduled_hook('tomato_market_export_event', [$paper]);
        wp_schedule_single_event(time() + 5, 'tomato_market_export_event', [$paper]);
    }


    public static function handle_status_change(int $post_id): void {
        $post = get_post($post_id);
        if (!($post instanceof \WP_Post) || ($post->post_type ?? '') !== self::CPT) {
            return;
        }

        self::export_json_for_paper(self::get_paper_slug($post_id));
    }

    public static function handle_term_change(int $object_id, $terms, $tt_ids, string $taxonomy, bool $append, $old_tt_ids): void {
        if ($taxonomy !== self::TAX_PAPER) {
            return;
        }

        $post = get_post($object_id);
        if (!($post instanceof \WP_Post) || ($post->post_type ?? '') !== self::CPT) {
            return;
        }

        self::export_json_for_paper(self::get_paper_slug((int)$object_id));
    }

    private static function get_paper_slug(int $post_id): string {
        $paper = 'tomato';
        $terms = wp_get_post_terms($post_id, self::TAX_PAPER);
        if (!is_wp_error($terms) && !empty($terms)) {
            $paper = $terms[0]->slug ?: $paper;
        }
        return $paper;
    }

    public static function columns(array $cols): array {
        $cols['paper'] = '紙';
        $cols['market_date'] = '日付';
        $cols['market_variety'] = '品目';
        $cols['market_price'] = '価格（円/kg）';
        $cols['market_volume'] = '取引量（トン）';
        return $cols;
    }

    public static function column_content(string $col, int $post_id): void {
        if ($col === 'paper') {
            $terms = wp_get_post_terms($post_id, self::TAX_PAPER);
            if (!is_wp_error($terms) && !empty($terms)) {
                echo esc_html($terms[0]->slug);
            } else {
                echo 'tomato';
            }
            return;
        }
        if ($col === 'market_date') {
            echo esc_html(get_post_meta($post_id, 'market_date', true));
            return;
        }
        if ($col === 'market_variety') {
            $v = get_post_meta($post_id, 'market_variety', true);
            echo esc_html(self::VARIETIES[$v] ?? $v);
            return;
        }
        if ($col === 'market_price') {
            echo esc_html((int)get_post_meta($post_id, 'market_price', true));
            return;
        }
        if ($col === 'market_volume') {
            echo esc_html((int)get_post_meta($post_id, 'market_volume', true));
            return;
        }
    }

    /**
     * static/{paper}/market.json を生成する
     */
    public static function export_json_for_paper(string $paper): void {
        $paper = $paper ?: 'tomato';

        // 品目ごとに「最新1件」と「その直前1件」を取得して比較
        $items = [];
        $as_of_date = null;

        foreach (self::VARIETIES as $slug => $label) {
            $latest = self::get_latest_entry($paper, $slug);
            if (!$latest) {
                // データが無い品目は空で出す（フロントで “—” 表示しやすい）
                $items[] = [
                    'variety' => $label,
                    'variety_key' => $slug,
                    'price' => null,
                    'volume' => null,
                    'diff' => null,
                    'trend' => 'none',
                ];
                continue;
            }

            if (!empty($latest['date']) && ($as_of_date === null || strcmp($latest['date'], $as_of_date) > 0)) {
                $as_of_date = $latest['date'];
            }

            $prev = self::get_previous_entry($paper, $slug, $latest['date'], $latest['post_id']);

            $diff = null;
            $trend = 'none';
            if ($prev && is_numeric($prev['price'])) {
                $diff = (int)$latest['price'] - (int)$prev['price'];
                if ($diff > 0) $trend = 'up';
                elseif ($diff < 0) $trend = 'down';
                else $trend = 'same';
            }

            $items[] = [
                'variety' => $label,
                'variety_key' => $slug,
                'price' => (int)$latest['price'],
                'volume' => (int)$latest['volume'],
                'diff' => $diff,         // 例: 131 / -58 / 0 / null
                'trend' => $trend,       // up / down / same / none
            ];
        }

        $payload = [
            'paper' => $paper,
            'as_of' => $as_of_date ?: current_time('Y-m-d'),
            'unit' => ['price' => '円/kg', 'volume' => 'トン'],
            'items' => $items,
        ];

        $json = wp_json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);

        $base_dir = self::get_static_dir();
        $out_dir  = trailingslashit($base_dir) . $paper;

        if (!is_dir($out_dir)) {
            wp_mkdir_p($out_dir);
        }

        $out_path = trailingslashit($out_dir) . 'market.json';
        file_put_contents($out_path, $json);
    }

    private static function get_static_dir(): string {
        // /var/www/html/static を狙う（README の構成に合わせる）
        // WP のABSPATHが /var/www/html/ なら ABSPATH . 'static' でOK
        return trailingslashit(ABSPATH) . 'static';
    }

    private static function get_latest_entry(string $paper, string $variety): ?array {
        $args = [
            'post_type' => self::CPT,
            'post_status' => ['publish', 'draft', 'pending', 'private'],
            'posts_per_page' => 1,
            'orderby' => 'meta_value',
            'order' => 'DESC',
            'meta_key' => 'market_date',
            'meta_query' => [
                [
                    'key' => 'market_variety',
                    'value' => $variety,
                    'compare' => '=',
                ],
            ],
            'tax_query' => [
                [
                    'taxonomy' => self::TAX_PAPER,
                    'field' => 'slug',
                    'terms' => [$paper],
                    'include_children' => false,
                    'operator' => 'IN',
                ],
            ],
        ];

        // paper未付与のデータも拾えるようにする（tomato扱い）
        // taxonomyが付いていない場合、tax_queryで弾かれるので、tomatoだけはfallbackで再検索
        $q = new WP_Query($args);
        if (!$q->have_posts() && $paper === 'tomato') {
            unset($args['tax_query']);
            $q = new WP_Query($args);
        }

        if (!$q->have_posts()) return null;

        $p = $q->posts[0];
        return [
            'post_id' => $p->ID,
            'date' => (string)get_post_meta($p->ID, 'market_date', true),
            'price' => (int)get_post_meta($p->ID, 'market_price', true),
            'volume' => (int)get_post_meta($p->ID, 'market_volume', true),
        ];
    }

    private static function get_previous_entry(string $paper, string $variety, string $before_date, int $exclude_post_id): ?array {
        $args = [
            'post_type' => self::CPT,
            'post_status' => ['publish', 'draft', 'pending', 'private'],
            'posts_per_page' => 1,
            'orderby' => 'meta_value',
            'order' => 'DESC',
            'meta_key' => 'market_date',
            'post__not_in' => [$exclude_post_id],
            'meta_query' => [
                'relation' => 'AND',
                [
                    'key' => 'market_variety',
                    'value' => $variety,
                    'compare' => '=',
                ],
                [
                    'key' => 'market_date',
                    'value' => $before_date,
                    'compare' => '<',
                    'type' => 'DATE',
                ],
            ],
            'tax_query' => [
                [
                    'taxonomy' => self::TAX_PAPER,
                    'field' => 'slug',
                    'terms' => [$paper],
                    'include_children' => false,
                    'operator' => 'IN',
                ],
            ],
        ];

        $q = new WP_Query($args);
        if (!$q->have_posts() && $paper === 'tomato') {
            unset($args['tax_query']);
            $q = new WP_Query($args);
        }
        if (!$q->have_posts()) return null;

        $p = $q->posts[0];
        return [
            'post_id' => $p->ID,
            'date' => (string)get_post_meta($p->ID, 'market_date', true),
            'price' => (int)get_post_meta($p->ID, 'market_price', true),
            'volume' => (int)get_post_meta($p->ID, 'market_volume', true),
        ];
    }

    /**
     * WP-CLI:
     *   wp tomato market export --paper=tomato
     *   wp tomato market export --paper=all
     */
    public static function cli_export(array $args, array $assoc_args): void {
        $paper = $assoc_args['paper'] ?? 'tomato';

        if ($paper === 'all') {
            // 既存のpaper taxonomyの全termを回す
            $papers = ['tomato'];
            if (taxonomy_exists(self::TAX_PAPER)) {
                $terms = get_terms(['taxonomy' => self::TAX_PAPER, 'hide_empty' => false]);
                if (!is_wp_error($terms)) {
                    $papers = array_values(array_unique(array_map(fn($t) => $t->slug, $terms)));
                }
            }
            foreach ($papers as $p) {
                self::export_json_for_paper($p);
                if (defined('WP_CLI') && WP_CLI) \WP_CLI::log("exported: static/{$p}/market.json");
            }
            return;
        }

        self::export_json_for_paper($paper);
        if (defined('WP_CLI') && WP_CLI) \WP_CLI::success("exported: static/{$paper}/market.json");
    }
}

Tomato_Market_Data::init();
