<?php
/**
 * Sponsor category support for ad_item.
 *
 * Adds:
 * - ACF local field: sponsor_category
 * - Admin column with colored labels
 * - Admin filter dropdown
 * - REST field exposure
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('acf/init', function () {
    if (!function_exists('acf_add_local_field_group')) {
        return;
    }

    acf_add_local_field_group([
        'key' => 'group_tomato_sponsor_category',
        'title' => '協賛社カテゴリ',
        'fields' => [
            [
                'key' => 'field_tomato_sponsor_category',
                'label' => '協賛社カテゴリ',
                'name' => 'sponsor_category',
                'type' => 'select',
                'instructions' => 'スポンサー広告（sponsor_ad）の場合に選択してください。協賛社のご紹介ページでカテゴリフィルターに使用されます。',
                'required' => 0,
                'choices' => [
                    '' => '— 未設定 —',
                    'seedling' => '種苗',
                    'fertilizer' => '肥料・農薬',
                    'service' => '資機材・サービス',
                ],
                'default_value' => '',
                'allow_null' => 1,
                'return_format' => 'value',
                'ui' => 1,
            ],
        ],
        'location' => [
            [
                [
                    'param' => 'post_type',
                    'operator' => '==',
                    'value' => 'ad_item',
                ],
            ],
        ],
        'menu_order' => 6,
        'position' => 'normal',
        'style' => 'default',
        'label_placement' => 'top',
        'instruction_placement' => 'label',
        'active' => true,
    ]);
});

function tomato_get_sponsor_category_labels(): array {
    return [
        'seedling' => [
            'label' => '種苗',
            'color' => '#78bc25',
        ],
        'fertilizer' => [
            'label' => '肥料・農薬',
            'color' => '#cc4624',
        ],
        'service' => [
            'label' => '資機材・サービス',
            'color' => '#12b7d1',
        ],
    ];
}

add_action('rest_api_init', function () {
    register_rest_field('ad_item', 'sponsor_category', [
        'get_callback' => function ($post_arr) {
            $post_id = isset($post_arr['id']) ? (int) $post_arr['id'] : 0;
            if ($post_id <= 0) {
                return '';
            }
            $value = get_field('sponsor_category', $post_id);
            return is_string($value) ? sanitize_title($value) : '';
        },
        'schema' => [
            'description' => '協賛社カテゴリ (seedling | fertilizer | service)',
            'type' => 'string',
            'context' => ['view', 'edit'],
        ],
    ]);
});

add_filter('manage_ad_item_posts_columns', function ($columns) {
    $new = [];
    foreach ($columns as $key => $label) {
        $new[$key] = $label;
        if ($key === 'ad_type') {
            $new['sponsor_category'] = '協賛社カテゴリ';
        }
    }

    if (!isset($new['sponsor_category'])) {
        $new['sponsor_category'] = '協賛社カテゴリ';
    }

    return $new;
}, 20);

add_action('manage_ad_item_posts_custom_column', function ($column, $post_id) {
    if ($column !== 'sponsor_category') {
        return;
    }

    $value = get_field('sponsor_category', $post_id);
    $value = is_string($value) ? sanitize_title($value) : '';
    $labels = tomato_get_sponsor_category_labels();

    if (!$value || !isset($labels[$value])) {
        echo '<span style="color:#94a3b8;">—</span>';
        return;
    }

    $label = $labels[$value];
    printf(
        '<span style="display:inline-flex;align-items:center;min-height:24px;padding:2px 10px;border-radius:999px;background:%1$s;color:#fff;font-size:12px;font-weight:700;">%2$s</span>',
        esc_attr($label['color']),
        esc_html($label['label'])
    );
}, 20, 2);

add_action('restrict_manage_posts', function () {
    global $typenow;
    if ($typenow !== 'ad_item') {
        return;
    }

    $selected = isset($_GET['sponsor_cat_filter']) ? sanitize_title(wp_unslash($_GET['sponsor_cat_filter'])) : '';
    $labels = tomato_get_sponsor_category_labels();
    ?>
    <select name="sponsor_cat_filter">
        <option value=""><?php echo esc_html__('協賛社カテゴリ', 'default'); ?></option>
        <?php foreach ($labels as $value => $data) : ?>
            <option value="<?php echo esc_attr($value); ?>" <?php selected($selected, $value); ?>><?php echo esc_html($data['label']); ?></option>
        <?php endforeach; ?>
    </select>
    <?php
});

add_action('pre_get_posts', function ($query) {
    if (!is_admin() || !$query->is_main_query()) {
        return;
    }

    global $pagenow;
    if ($pagenow !== 'edit.php') {
        return;
    }

    $post_type = isset($_GET['post_type']) ? sanitize_key(wp_unslash($_GET['post_type'])) : 'post';
    if ($post_type !== 'ad_item') {
        return;
    }

    $filter = isset($_GET['sponsor_cat_filter']) ? sanitize_title(wp_unslash($_GET['sponsor_cat_filter'])) : '';
    if ($filter === '') {
        return;
    }

    $meta_query = (array) $query->get('meta_query');
    $meta_query[] = [
        'key' => 'sponsor_category',
        'value' => $filter,
        'compare' => '=',
    ];
    $query->set('meta_query', $meta_query);
});
