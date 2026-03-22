<?php
/**
 * Plugin Name: Tomato WP - ACF Fields (MU)
 * Description: Register CPT "newspaper" and ACF field groups via PHP. (Template is resolved from slug: template-{slug}-index.php)
 */

if (!defined('ABSPATH')) exit;


/**
 * Dynamic global menu helpers
 * - Keep the admin menu settings in sync with the menu.json builder.
 * - This allows clients to add a new 記事タイプ term and immediately control
 *   visibility, order, and URL from the newspaper edit screen.
 */
if (!function_exists('tomato_normalize_global_menu_item_from_term')) {
  function tomato_normalize_global_menu_item_from_term($term): ?array {
    if (!($term instanceof WP_Term)) return null;

    $name = isset($term->name) ? trim((string) $term->name) : '';
    $slug = isset($term->slug) ? trim((string) $term->slug) : '';
    if ($name === '') return null;

    $key = $slug !== '' ? $slug : sanitize_title($name);
    $label = $name;
    $url = './list.html?article_type=' . rawurlencode($name);

    switch ($name) {
      case 'トマトNEWS':
        $key = 'news';
        break;

      case '栽培技術':
        $key = 'cultivation';
        break;

      case '市場動向':
        $key = 'market';
        break;

      case 'コラム':
        $key = 'column';
        break;

      case '動画':
        $key = 'video';
        break;

      case '紙面':
        $key = 'paper';
        $label = '紙面';
        break;

      case '採録紙面':
        $key = 'paper';
        $label = '採録紙面';
        break;

      case '品種情報':
        $key = 'variety';
        $url = './variety.html';
        break;

      case '病害虫対策':
        $key = 'pest';
        $url = './pest-control.html';
        break;

      case 'WEBセミナー':
        $key = 'seminar';
        $url = './web-seminar.html';
        break;

      case 'JA部会アンケート':
        $key = 'survey';
        $url = './survey.html';
        break;

      case '特集記事':
      case 'トマト特集':
        $key = 'featured';
        $label = '特集記事';
        $url = './feature.html';
        break;
    }

    $key = trim((string) $key);
    if ($key === '') {
      $key = 'menu-item';
    }

    return [
      'key' => $key,
      'label' => $label,
      'url' => $url,
    ];
  }
}

if (!function_exists('tomato_get_global_menu_default_items')) {
  function tomato_get_global_menu_default_items(): array {
    $items = [
      'featured' => [
        'key' => 'featured',
        'label' => '特集記事',
        'url' => './feature.html',
      ],
    ];

    $terms = get_terms([
      'taxonomy' => 'article_type',
      'hide_empty' => false,
      'orderby' => 'id',
      'order' => 'ASC',
    ]);
    if (!is_wp_error($terms) && !empty($terms)) {
      foreach ($terms as $term) {
        $item = tomato_normalize_global_menu_item_from_term($term);
        if (!is_array($item)) continue;

        $key = isset($item['key']) ? sanitize_title((string) $item['key']) : '';
        $label = isset($item['label']) ? trim((string) $item['label']) : '';
        if ($key === '' || $label === '') continue;

        $current = isset($items[$key]) && is_array($items[$key]) ? $items[$key] : [];
        $current_label = isset($current['label']) ? trim((string) $current['label']) : '';
        $current_url = isset($current['url']) ? trim((string) $current['url']) : '';
        $next_url = isset($item['url']) ? trim((string) $item['url']) : '';

        if ($current_label === '' || $current_label === $key) {
          $current_label = $label;
        }
        if ($next_url !== '') {
          $current_url = $next_url;
        }

        if ($key === 'featured') {
          $current_label = '特集記事';
          $current_url = './feature.html';
        } elseif ($key === 'paper' && $label === '採録紙面') {
          $current_label = '採録紙面';
          if ($next_url !== '') {
            $current_url = $next_url;
          }
        } elseif ($current_label === '') {
          $current_label = $label;
        }

        $items[$key] = [
          'key' => $key,
          'label' => $current_label,
          'url' => $current_url,
        ];
      }
    }

    $items = array_values($items);

    $preferred_order = [
      'featured',
      'news',
      'variety',
      'cultivation',
      'market',
      'pest',
      'seminar',
      'column',
      'video',
      'paper',
      'survey',
    ];
    $preferred_rank = array_flip($preferred_order);

    usort($items, static function($a, $b) use ($preferred_rank) {
      $a_key = isset($a['key']) ? (string) $a['key'] : '';
      $b_key = isset($b['key']) ? (string) $b['key'] : '';
      $a_rank = array_key_exists($a_key, $preferred_rank) ? (int) $preferred_rank[$a_key] : 999;
      $b_rank = array_key_exists($b_key, $preferred_rank) ? (int) $preferred_rank[$b_key] : 999;

      if ($a_rank !== $b_rank) {
        return $a_rank <=> $b_rank;
      }

      $a_label = isset($a['label']) ? (string) $a['label'] : '';
      $b_label = isset($b['label']) ? (string) $b['label'] : '';
      return strcmp($a_label, $b_label);
    });

    foreach ($items as $index => &$item) {
      $item['order'] = $index + 1;
    }
    unset($item);

    return $items;
  }
}

if (!function_exists('tomato_get_global_menu_choices')) {
  function tomato_get_global_menu_choices(): array {
    $choices = [];
    foreach (tomato_get_global_menu_default_items() as $item) {
      $key = isset($item['key']) ? (string) $item['key'] : '';
      $label = isset($item['label']) ? (string) $item['label'] : '';
      if ($key === '' || $label === '') continue;
      $choices[$key] = $label;
    }
    return $choices;
  }
}

if (!function_exists('tomato_get_global_menu_default_settings_rows')) {
  function tomato_get_global_menu_default_settings_rows(): array {
    $rows = [];
    foreach (tomato_get_global_menu_default_items() as $item) {
      $rows[] = [
        'menu_item_key' => isset($item['key']) ? (string) $item['key'] : '',
        'menu_order' => isset($item['order']) ? (int) $item['order'] : 0,
        'menu_url' => isset($item['url']) ? (string) $item['url'] : '',
      ];
    }
    return $rows;
  }
}


if (!function_exists('tomato_get_global_menu_setting_field_name')) {
  function tomato_get_global_menu_setting_field_name(string $prefix, string $menu_key): string {
    $menu_key = sanitize_title($menu_key);
    if ($menu_key === '') $menu_key = 'menu_item';
    return $prefix . '_' . str_replace('-', '_', $menu_key);
  }
}

if (!function_exists('tomato_get_global_menu_individual_setting_fields')) {
  function tomato_get_global_menu_individual_setting_fields(): array {
    $fields = [
      [
        'key' => 'field_newspaper_menu_settings_message',
        'label' => 'メニュー設定（順番 / URL）',
        'name' => '',
        'type' => 'message',
        'message' => '各メニューの順番とURLをここで直接編集できます。順番の小さいものほど先に表示されます。URL未入力時は既定URLを使用します。',
        'new_lines' => 'wpautop',
        'esc_html' => 0,
      ],
    ];

    foreach (tomato_get_global_menu_default_items() as $index => $item) {
      $menu_key = isset($item['key']) ? sanitize_title((string) $item['key']) : '';
      $menu_label = isset($item['label']) ? (string) $item['label'] : $menu_key;
      $default_order = isset($item['order']) ? (int) $item['order'] : ($index + 1);
      if ($menu_key === '') continue;

      $order_name = tomato_get_global_menu_setting_field_name('menu_order', $menu_key);
      $url_name = tomato_get_global_menu_setting_field_name('menu_url', $menu_key);

      $fields[] = [
        'key' => 'field_newspaper_menu_order_' . $menu_key,
        'label' => sprintf('%s の順番', $menu_label),
        'name' => $order_name,
        'type' => 'number',
        'required' => 0,
        'wrapper' => ['width' => '20'],
        'default_value' => $default_order,
        'min' => 1,
        'step' => 1,
      ];

      $fields[] = [
        'key' => 'field_newspaper_menu_url_' . $menu_key,
        'label' => sprintf('%s のURL', $menu_label),
        'name' => $url_name,
        'type' => 'text',
        'required' => 0,
        'wrapper' => ['width' => '80'],
        'placeholder' => isset($item['url']) ? (string) $item['url'] : '',
      ];
    }

    return $fields;
  }
}

if (!function_exists('tomato_merge_global_menu_settings_rows')) {
  function tomato_merge_global_menu_settings_rows($value): array {
    $defaults = tomato_get_global_menu_default_settings_rows();
    $default_map = [];
    foreach ($defaults as $row) {
      $row_key = isset($row['menu_item_key']) ? sanitize_title((string) $row['menu_item_key']) : '';
      if ($row_key === '') continue;
      $default_map[$row_key] = $row;
    }

    $merged = [];
    if (is_array($value)) {
      foreach ($value as $row) {
        if (!is_array($row)) continue;
        $row_key = isset($row['menu_item_key']) ? sanitize_title((string) $row['menu_item_key']) : '';
        if ($row_key === '') continue;

        $base = isset($default_map[$row_key]) ? $default_map[$row_key] : [
          'menu_item_key' => $row_key,
          'menu_order' => 999,
          'menu_url' => '',
        ];

        $menu_order = isset($row['menu_order']) && $row['menu_order'] !== '' ? (int) $row['menu_order'] : (int) $base['menu_order'];
        if ($menu_order <= 0) {
          $menu_order = (int) $base['menu_order'];
          if ($menu_order <= 0) $menu_order = 999;
        }

        $menu_url = isset($row['menu_url']) ? trim((string) $row['menu_url']) : '';
        if ($menu_url === '') {
          $menu_url = isset($base['menu_url']) ? (string) $base['menu_url'] : '';
        }

        $merged[$row_key] = [
          'menu_item_key' => $row_key,
          'menu_order' => $menu_order,
          'menu_url' => $menu_url,
        ];
      }
    }

    foreach ($default_map as $row_key => $row) {
      if (!isset($merged[$row_key])) {
        $merged[$row_key] = $row;
      }
    }

    uasort($merged, static function($a, $b) {
      $a_order = isset($a['menu_order']) ? (int) $a['menu_order'] : 999;
      $b_order = isset($b['menu_order']) ? (int) $b['menu_order'] : 999;
      if ($a_order !== $b_order) {
        return $a_order <=> $b_order;
      }

      $choices = tomato_get_global_menu_choices();
      $a_label = isset($choices[$a['menu_item_key']]) ? (string) $choices[$a['menu_item_key']] : (string) $a['menu_item_key'];
      $b_label = isset($choices[$b['menu_item_key']]) ? (string) $choices[$b['menu_item_key']] : (string) $b['menu_item_key'];
      return strcmp($a_label, $b_label);
    });

    return array_values($merged);
  }
}


/**
 * 1) Custom Post Type: newspaper（新聞マスタ）
 * - 管理用（CMS用）
 * - 公開用ではない想定なので public=false
 */
add_action('init', function () {
  register_post_type('newspaper', [
    'label' => '新聞マスタ',
    'public' => false,          // 公開ページとしては使わない（管理用）
    'show_ui' => true,          // 管理画面には出す
    'show_in_menu' => true,
    'menu_position' => 20,
    'supports' => ['title'],    // とりあえずタイトルのみ
    'has_archive' => false,
    'show_in_rest' => true,     // ブロック/RESTが必要ならON
  ]);
});


/**
 * 1b) Custom Post Type: variety（品種マスタ）
 * - 品種情報（varieties.json）生成用の管理データ
 * - 公開ページは静的側で表示するため public=false（管理用）
 */
add_action('init', function () {
  register_post_type('variety', [
    'label' => '品種マスタ',
    'public' => false,
    'show_ui' => true,
    'show_in_menu' => true,
    'menu_position' => 21,
    'supports' => ['title'],
    'has_archive' => false,
    'show_in_rest' => true,
    // 紙（tomato/leek/strawberry）の区別は既存の「カテゴリー（category）」を流用する
    'taxonomies' => ['category'],
  ]);
});

/**
 * 1c) Taxonomy: variety_category（品種カテゴリ）
 * - ACF「カテゴリ（variety_category）」のプルダウンを、管理画面で編集可能にするための分類
 * - term slug を varieties.json の category 値として利用（例: large / midi / mini / rootstock）
 */
add_action('init', function () {
  $tax = 'variety_category';

  register_taxonomy($tax, ['variety','post'], [
    'label' => '品種カテゴリ',

    // Keep it editable in admin, but do not expose public archives/queries.
    // NOTE: Some WP/Gutenberg setups can fail to persist taxonomy selections when public=false,
    // even if show_in_rest=true. Using public=true + publicly_queryable=false keeps it admin-only
    // while ensuring term assignment works reliably.
    'public' => true,
    'publicly_queryable' => false,
    'query_var' => false,
    'rewrite' => false,

    'show_ui' => true,
    'show_in_menu' => true,
    'show_admin_column' => true,

    // IMPORTANT:
    // - hierarchical=true makes it behave like Categories (no "Add Tag" UI)
    // - show_in_rest=true is required for Gutenberg to show the taxonomy panel in the post sidebar
    'hierarchical' => true,
    'show_in_rest' => true,
    'rest_base' => $tax,
    'rest_controller_class' => 'WP_REST_Terms_Controller',
  ]);

  // Seed default terms (only if missing)
  // NOTE: Admin can freely add/edit/delete terms later from WP admin.
  $defaults = [
    'large'     => '大玉トマト',
    'midi'      => 'ミディトマト',
    'mini'      => 'ミニトマト',
    'rootstock' => '台木用トマト',
  ];

  foreach ($defaults as $slug => $name) {
    if (!term_exists($slug, $tax)) {
      wp_insert_term($name, $tax, ['slug' => $slug]);
    }
  }
});



/**
 * 1d) Meta box: 品種カテゴリ (variety_category) dropdown on Post edit screen
 * - Places a single-select dropdown in the sidebar so editors can choose ONE 品種カテゴリ for a post.
 * - We remove the default tags-style meta box and replace it with a dropdown.
 */
add_action('add_meta_boxes', function () {
  $post_types = ['post', 'variety'];
  $tax = 'variety_category';

  foreach ($post_types as $pt) {
    // If the block editor is enabled for this post type, Gutenberg will render the taxonomy UI
    // in the right sidebar (because show_in_rest=true). In that case, DO NOT add a custom meta box
    // (Gutenberg does not reliably submit meta-box POST fields, so selections may not persist).
    if (function_exists('use_block_editor_for_post_type') && use_block_editor_for_post_type($pt)) {
      // Still remove any legacy meta boxes if present.
      remove_meta_box('tagsdiv-' . $tax, $pt, 'side');
      remove_meta_box($tax . 'div', $pt, 'side');
      continue;
    }

    // Default non-hierarchical taxonomy box id is "tagsdiv-{$tax}" (tags UI). Remove if present.
    remove_meta_box('tagsdiv-' . $tax, $pt, 'side');
    // (Just in case) hierarchical-style id would be "{$tax}div"
    remove_meta_box($tax . 'div', $pt, 'side');

    add_meta_box(
      'tn-' . $tax . '-dropdown',
      '品種カテゴリ',
      function ($post) use ($tax) {
        $terms = get_terms([
          'taxonomy' => $tax,
          'hide_empty' => false,
          'orderby' => 'name',
          'order' => 'ASC',
        ]);

        $current_terms = wp_get_post_terms($post->ID, $tax, ['fields' => 'ids']);
        $current = (!is_wp_error($current_terms) && !empty($current_terms)) ? intval($current_terms[0]) : 0;

        $nonce_key = 'tn_' . $tax . '_nonce';
        wp_nonce_field('tn_save_' . $tax, $nonce_key);

        echo '<select name="tn_' . esc_attr($tax) . '_term" style="width:100%;">';
        echo '<option value="0">— 選択してください —</option>';

        if (!is_wp_error($terms) && !empty($terms)) {
          foreach ($terms as $t) {
            if (!isset($t->term_id)) continue;
            $tid = intval($t->term_id);
            $name = isset($t->name) ? $t->name : '';
            printf(
              '<option value="%d"%s>%s</option>',
              $tid,
              selected($current, $tid, false),
              esc_html($name)
            );
          }
        }

        echo '</select>';
        echo '<p class="description" style="margin-top:8px;">※ 1つだけ選択できます。</p>';
      },
      $pt,
      'side',
      'default'
    );
  }
}, 30);


/**
 * Save handler for 品種カテゴリ dropdown
 */
add_action('save_post', function ($post_id) {

  $tax = 'variety_category';

  // Only for supported post types
  $pt = get_post_type($post_id);
  if (!in_array($pt, ['post','variety'], true)) return;

  // Autosave / revisions
  if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
  if (wp_is_post_revision($post_id)) return;

  // Permission
  if (!current_user_can('edit_post', $post_id)) return;

  // Nonce
  $nonce_key = 'tn_' . $tax . '_nonce';
  if (!isset($_POST[$nonce_key]) || !wp_verify_nonce($_POST[$nonce_key], 'tn_save_' . $tax)) return;

  // Value
  $term_key = 'tn_' . $tax . '_term';
  if (!isset($_POST[$term_key])) return;

  $term_id = intval($_POST[$term_key]);

  if ($term_id > 0) {
    wp_set_object_terms($post_id, [$term_id], $tax, false);
  } else {
    // Clear selection
    wp_set_object_terms($post_id, [], $tax, false);
  }
}, 20);




/**
 * 1e) Gutenberg/REST save support for variety_category (品種カテゴリ)
 * Gutenberg saves taxonomies through the REST API. In some environments (mu-plugins load order / custom meta-box logic),
 * the taxonomy selection can appear in the sidebar but not persist after saving.
 *
 * This hook ensures the selected term IDs sent by REST are actually assigned to the post.
 */
add_action('rest_after_insert_post', function ($post, $request, $creating) {
  if (!is_object($post) || !isset($post->ID)) return;
  if (!isset($post->post_type) || !in_array($post->post_type, ['post','variety'], true)) return;

  $tax = 'variety_category';
  if (!taxonomy_exists($tax)) return;

  if (!is_object($request) || !method_exists($request, 'get_param')) return;

  // Gutenberg/REST usually sends the taxonomy terms as an array of term IDs under the taxonomy rest_base.
  // Some setups instead send it under tax_input.{taxonomy}. Support both.
  $param = $request->get_param($tax);

  if ($param === null) {
    $tax_input = $request->get_param('tax_input');
    if (is_array($tax_input) && isset($tax_input[$tax])) {
      $param = $tax_input[$tax];
    }
  }

  // If the param is not present, do not touch existing terms.
  if ($param === null) return;

  // Normalize to a flat array.
  $raw = [];
  if (is_array($param)) {
    $raw = $param;
  } elseif (is_string($param) && $param !== '') {
    $raw = array_map('trim', explode(',', $param));
  } elseif (is_int($param)) {
    $raw = [$param];
  }

  $term_ids = [];

  foreach ((array)$raw as $v) {
    // Support numeric IDs, slugs, or names.
    if (is_int($v) || (is_string($v) && ctype_digit($v))) {
      $tid = intval($v);
      if ($tid > 0) $term_ids[] = $tid;
      continue;
    }

    if (is_string($v) && $v !== '') {
      $t = get_term_by('slug', $v, $tax);
      if (!$t) {
        $t = get_term_by('name', $v, $tax);
      }
      if ($t && !is_wp_error($t) && isset($t->term_id)) {
        $term_ids[] = intval($t->term_id);
      }
    }
  }

  $term_ids = array_values(array_unique(array_filter($term_ids, function ($x) { return $x > 0; })));

  // Assign (or clear) the terms.
  wp_set_object_terms($post->ID, $term_ids, $tax, false);
}, 10, 3);


/**
 * 2) ACF Field Groups
 * - 新聞マスタ設定
 * - 広告枠（ad_item）設定
 */
add_action('acf/init', function () {

  // ACFが無効の環境では何もしない
  if (!function_exists('acf_add_local_field_group')) return;

  // ---------------------------------------------------------------------------
  // ACF Field Group: 新聞マスタ設定
  // ---------------------------------------------------------------------------
  acf_add_local_field_group([
    'key' => 'group_newspaper_master',
    'title' => '新聞マスタ設定',
    'fields' => array_merge([
      [
        'key' => 'field_newspaper_slug',
        'label' => '新聞スラッグ',
        'name' => 'newspaper_slug',
        'type' => 'text',
        'instructions' => '例: tomato / leek / strawberry（英小文字・ハイフン推奨）',
        'required' => 1,
        'wrapper' => ['width' => '50'],
      ],
      [
        'key' => 'field_newspaper_output_subdir',
        'label' => '出力サブディレクトリ名',
        'name' => 'output_subdir',
        'type' => 'text',
        'instructions' => '基本は空でOK（空ならslugを使う）例: tomato',
        'required' => 0,
        'wrapper' => ['width' => '50'],
      ],
      [
        'key' => 'field_newspaper_display_name',
        'label' => '表示名（任意）',
        'name' => 'display_name',
        'type' => 'text',
        'instructions' => '例: トマト新聞（未入力ならタイトルを利用）',
        'required' => 0,
      ],
      [
        'key' => 'field_newspaper_hidden_menu_items',
        'label' => '非表示メニュー（グローバルメニュー）',
        'name' => 'hidden_menu_items',
        'type' => 'checkbox',
        'instructions' => "この新聞（paper）で非表示にしたいメニューを選択してください。
未選択の場合はすべて表示されます。",
        'required' => 0,
        'choices' => tomato_get_global_menu_choices(),
        'layout' => 'vertical',
        'return_format' => 'value',
      ],
    ]),
    'location' => [
      [
        [
          'param' => 'post_type',
          'operator' => '==',
          'value' => 'newspaper',
        ],
      ],
    ],
    'position' => 'normal',
    'style' => 'default',
    'label_placement' => 'top',
    'instruction_placement' => 'label',
    'active' => true,
  ]);

  // Keep the hidden menu checkbox list synced with article_type terms.
  // This lets the client add a new menu term and control its visibility
  // from WordPress admin without code changes.
  add_filter('acf/load_field/name=hidden_menu_items', function ($field) {
    if (!is_array($field)) $field = [];
    $field['choices'] = tomato_get_global_menu_choices();
    return $field;
  });


if (!function_exists('tomato_get_global_menu_setting_value')) {
  function tomato_get_global_menu_setting_value(int $post_id, string $field_name, $default = '') {
    if ($post_id <= 0 || $field_name === '') return $default;

    if (function_exists('get_field')) {
      $value = get_field($field_name, $post_id);
      if ($value !== null && $value !== false && $value !== '') {
        return $value;
      }
    }

    $meta = get_post_meta($post_id, $field_name, true);
    if ($meta !== '' && $meta !== null) return $meta;

    return $default;
  }
}

add_action('add_meta_boxes', function () {
  add_meta_box(
    'tomato_newspaper_menu_settings_box',
    'メニュー設定（順番 / URL）',
    function ($post) {
      if (!($post instanceof WP_Post) || $post->post_type !== 'newspaper') return;

      wp_nonce_field('tomato_save_newspaper_menu_settings', 'tomato_newspaper_menu_settings_nonce');

      echo '<p>各メニューの順番とURLをここで直接編集できます。順番の小さいものほど先に表示されます。URL未入力時は既定URLを使用します。</p>';
      echo '<table class="form-table" role="presentation"><tbody>';

      foreach (tomato_get_global_menu_default_items() as $item) {
        $menu_key = isset($item['key']) ? sanitize_title((string) $item['key']) : '';
        $menu_label = isset($item['label']) ? (string) $item['label'] : $menu_key;
        if ($menu_key === '') continue;

        $order_name = tomato_get_global_menu_setting_field_name('menu_order', $menu_key);
        $url_name = tomato_get_global_menu_setting_field_name('menu_url', $menu_key);

        $default_order = isset($item['order']) ? (int) $item['order'] : 999;
        if ($default_order <= 0) $default_order = 999;

        $order_value = tomato_get_global_menu_setting_value((int) $post->ID, $order_name, $default_order);
        $url_value = tomato_get_global_menu_setting_value((int) $post->ID, $url_name, isset($item['url']) ? (string) $item['url'] : '');

        echo '<tr>';
        echo '<th scope="row" style="width:220px;">' . esc_html($menu_label) . '</th>';
        echo '<td>';
        echo '<div style="display:flex;gap:16px;align-items:flex-start;flex-wrap:wrap;">';
        echo '<div style="min-width:180px;">';
        echo '<label for="' . esc_attr($order_name) . '" style="display:block;font-weight:600;margin-bottom:6px;">順番</label>';
        echo '<input type="number" min="1" step="1" class="small-text" id="' . esc_attr($order_name) . '" name="' . esc_attr($order_name) . '" value="' . esc_attr((string) $order_value) . '">';
        echo '</div>';
        echo '<div style="flex:1;min-width:320px;">';
        echo '<label for="' . esc_attr($url_name) . '" style="display:block;font-weight:600;margin-bottom:6px;">URL</label>';
        echo '<input type="text" class="regular-text" style="width:100%;max-width:100%;" id="' . esc_attr($url_name) . '" name="' . esc_attr($url_name) . '" value="' . esc_attr((string) $url_value) . '" placeholder="' . esc_attr(isset($item['url']) ? (string) $item['url'] : '') . '">';
        echo '</div>';
        echo '</div>';
        echo '</td>';
        echo '</tr>';
      }

      echo '</tbody></table>';
    },
    'newspaper',
    'normal',
    'default'
  );
});

add_action('save_post_newspaper', function ($post_id, $post, $update) {
  if (!($post instanceof WP_Post) || $post->post_type !== 'newspaper') return;
  if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
  if (wp_is_post_revision($post_id)) return;
  if (!current_user_can('edit_post', $post_id)) return;

  $nonce = isset($_POST['tomato_newspaper_menu_settings_nonce']) ? wp_unslash($_POST['tomato_newspaper_menu_settings_nonce']) : '';
  if (!$nonce || !wp_verify_nonce($nonce, 'tomato_save_newspaper_menu_settings')) return;

  foreach (tomato_get_global_menu_default_items() as $item) {
    $menu_key = isset($item['key']) ? sanitize_title((string) $item['key']) : '';
    if ($menu_key === '') continue;

    $order_name = tomato_get_global_menu_setting_field_name('menu_order', $menu_key);
    $url_name = tomato_get_global_menu_setting_field_name('menu_url', $menu_key);

    $default_order = isset($item['order']) ? (int) $item['order'] : 999;
    if ($default_order <= 0) $default_order = 999;

    $raw_order = isset($_POST[$order_name]) ? wp_unslash($_POST[$order_name]) : '';
    $order_value = is_numeric($raw_order) ? (int) $raw_order : $default_order;
    if ($order_value <= 0) $order_value = $default_order;
    update_post_meta($post_id, $order_name, $order_value);

    $raw_url = isset($_POST[$url_name]) ? wp_unslash($_POST[$url_name]) : '';
    $url_value = trim((string) $raw_url);
    update_post_meta($post_id, $url_name, $url_value);
  }
}, 10, 3);


  // ---------------------------------------------------------------------------
  // ACF Field Group: 記事詳細（参考資料 / 執筆者） - 右サイドバー
  // ---------------------------------------------------------------------------
  acf_add_local_field_group([
    'key' => 'group_post_detail_meta',
    'title' => '記事詳細（参考資料 / 執筆者）',
    'fields' => [
      [
        'key' => 'field_post_reference_materials',
        'label' => '参考資料',
        'name' => 'reference_materials',
        'type' => 'textarea',
        'instructions' => "記事下部に表示する参考資料を入力してください。\n複数ある場合は改行で区切ってください。",
        'required' => 0,
        'new_lines' => 'br',
        'rows' => 4,
      ],
      [
        'key' => 'field_post_writer_name',
        'label' => '執筆者',
        'name' => 'writer_name',
        'type' => 'text',
        'instructions' => '記事下部に表示する執筆者名（所属含む）を入力してください。',
        'required' => 0,
      ],
      [
        'key' => 'field_post_free_viewable',
        'label' => '非ログイン閲覧を許可（無料公開）',
        'name' => 'free_viewable',
        'type' => 'true_false',
        'instructions' => 'ON の場合：ログインしていないユーザーでも記事全文を閲覧できます。OFF の場合：冒頭のみ表示してログイン/会員登録を促します。',
        'required' => 0,
        'ui' => 1,
        'default_value' => 0,
      ],
      [
        'key' => 'field_post_featured_image_display_mode',
        'label' => 'アイキャッチ画像の表示方法',
        'name' => 'featured_image_display_mode',
        'type' => 'radio',
        'instructions' => '記事詳細ページでのアイキャッチ画像の見せ方を選択してください。',
        'required' => 0,
        'choices' => [
          'full' => '全体表示',
          'third' => '上1/3のみ表示',
        ],
        'default_value' => 'full',
        'layout' => 'vertical',
        'return_format' => 'value',
      ],

      // 記事ごとのコラムニスト（最大4名）
      [
        'key' => 'field_post_columnists',
        'label' => 'コラムニスト（最大4名）',
        'name' => 'columnists',
        'type' => 'post_object',
        'instructions' => "この記事に紐づけるコラムニストを最大4名まで選択してください。\n未選択の場合はコラムニスト紹介セクションは表示しません。",
        'required' => 0,
        'post_type' => ['tomato_columnist'],
        'multiple' => 1,
        'return_format' => 'id',
        'ui' => 1,
      ],

      // 記事ごとのサイドバー広告（広告枠=ad_item から1つ選択）
      [
        'key' => 'field_post_sidebar_ad_item',
        'label' => 'サイドバー広告（記事ごとに1枠）',
        'name' => 'sidebar_ad_item',
        'type' => 'post_object',
        'instructions' => "この記事の右サイドバーに表示する広告枠（広告枠CPT）を1つ選択してください。\n未選択の場合は表示しません。",
        'required' => 0,
        'post_type' => ['ad_item'],
        'taxonomy' => '',
        'allow_null' => 1,
        'multiple' => 0,
        'return_format' => 'id',
        'ui' => 1,
      ],
    ],
    'location' => [
      [
        [
          'param' => 'post_type',
          'operator' => '==',
          'value' => 'post',
        ],
      ],
    ],
    'position' => 'side',
    'menu_order' => 50,
    'style' => 'default',
    'label_placement' => 'top',
    'instruction_placement' => 'label',
    'active' => true,
  ]);


  // ---------------------------------------------------------------------------
  // ACF Field Group: 広告枠（ad_item）設定
  // ---------------------------------------------------------------------------
  acf_add_local_field_group([
    'key' => 'group_ad_item_fields',
    'title' => '広告枠：画像 / URL / 動画',
    'fields' => [

      // リンクURL
      [
        'key' => 'field_ad_item_link_url',
        'label' => 'リンクURL',
        'name' => 'link_url',
        'type' => 'url',
        'instructions' => 'クリック先のURLを入力してください。',
        'required' => 0,
        'wrapper' => ['width' => '100'],
        'default_value' => '',
        'placeholder' => 'https://example.com/',
      ],

      // 画像
      [
        'key' => 'field_ad_item_image',
        'label' => '画像',
        'name' => 'image',
        'type' => 'image',
        'instructions' => '広告 / PR / スポンサー枠に表示する画像を選択してください。',
        'required' => 0,
        'wrapper' => ['width' => '100'],
        'return_format' => 'array',   // array | id | url すべて対応（cli-static-build.php側で対応済）
        'preview_size' => 'medium',
        'library' => 'all',
        'mime_types' => 'jpg,jpeg,png,gif,webp',
      ],

      // 動画（スポンサー動画用）
      [
        'key' => 'field_ad_item_video',
        'label' => '動画（スポンサー動画用）',
        'name' => 'video',
        'type' => 'file',
        'instructions' => "スポンサー動画広告紹介（sponsor_video）の場合に設定してください。\n他の枠タイプでは空でOKです。",
        'required' => 0,
        'wrapper' => ['width' => '100'],
        'return_format' => 'array',   // array | id | url すべて対応
        'library' => 'all',
        'mime_types' => 'mp4,webm,mov',
      ],

      // 表示カラム（広告=ads用）
      [
        'key' => 'field_ad_item_column',
        'label' => '表示位置（ads用）',
        'name' => 'ad_column',
        'type' => 'select',
        'instructions' => "広告（ads）の場合に、どちらの縦カラムに表示するかを選択してください。\n左: vcolA / 右: vcolB",
        'required' => 0,
        'wrapper' => ['width' => '50'],
        'choices' => [
          'A' => '左（vcolA）',
          'B' => '右（vcolB）',
        ],
        'default_value' => 'A',
        'allow_null' => 0,
        'ui' => 1,
      ],

      // 広告サイズ（広告=ads用）
      [
        'key' => 'field_ad_item_size',
        'label' => '広告サイズ（ads用）',
        'name' => 'ad_size',
        'type' => 'select',
        'instructions' => "広告（ads）の場合に、サイズを選択してください。\n中サイズ: ad-half-vertical / 小サイズ: ad-rect-vertical",
        'required' => 0,
        'wrapper' => ['width' => '50'],
        'choices' => [
          'medium' => '中サイズ',
          'small'  => '小サイズ',
        ],
        'default_value' => 'small',
        'allow_null' => 0,
        'ui' => 1,
      ],

      // 追加クラス（任意）
      [
        'key' => 'field_ad_item_extra_class',
        'label' => '追加CSSクラス（任意）',
        'name' => 'ad_extra_class',
        'type' => 'text',
        'instructions' => '必要な場合のみ、ad-slotに追加したいクラス名を入力してください（スペース区切り可）。',
        'required' => 0,
        'wrapper' => ['width' => '100'],
        'default_value' => '',
        'placeholder' => '例: my-custom-class',
      ],


      // SP 固定バナーに表示（index.html）
      [
        'key' => 'field_ad_item_show_on_index_sticky',
        'label' => 'SP固定バナーに表示（index.html）',
        'name' => 'show_on_index_sticky',
        'type' => 'true_false',
        'instructions' => 'ONにした広告枠が、スマホ下部の固定バナーとして index.html に表示されます（紙ごとに1つのみ）。',
        'required' => 0,
        'wrapper' => ['width' => '50'],
        'message' => '表示する',
        'default_value' => 0,
        'ui' => 1,
        'ui_on_text' => 'ON',
        'ui_off_text' => 'OFF',
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
    'position' => 'normal',
    'style' => 'default',
    'label_placement' => 'top',
    'instruction_placement' => 'label',
    'active' => true,
  ]);
  // ---------------------------------------------------------------------------
  // ACF Field Group: 品種マスタ設定（variety）
  // - static/{paper}/varieties.json の生成元
  // ---------------------------------------------------------------------------
  acf_add_local_field_group([
    'key' => 'group_variety_master',
    'title' => '品種マスタ設定',
    'fields' => [
      [
        'key' => 'field_variety_category',
        'label' => 'カテゴリ',
        'name' => 'variety_category',
        'type' => 'select',
        // choices are populated dynamically from taxonomy terms (variety_category)
        // so admin users can edit/add options from WP admin.
        'choices' => [],
        'default_value' => 'large',
        'return_format' => 'value',
        'ui' => 1,
        'required' => 1,
        'wrapper' => [
          'class' => 'acf-required-label',
        ],
      ],
      [
        'key' => 'field_variety_company',
        'label' => '種苗会社',
        'name' => 'company',
        'type' => 'text',
        'default_value' => '',
        'placeholder' => '例: サカタのタネ',
        'required' => 1,
        'wrapper' => [
          'class' => 'acf-required-label',
        ],
      ],
      [
        'key' => 'field_variety_season',
        'label' => 'SEASON',
        'name' => 'season',
        'type' => 'select',
        'choices' => [
          'winter-spring' => '冬春',
          'summer-autumn' => '夏秋',
        ],
        'default_value' => 'summer-autumn',
        'return_format' => 'value',
        'ui' => 1,
        'required' => 1,
        'wrapper' => [
          'class' => 'acf-required-label',
        ],
      ],
      [
        'key' => 'field_variety_image',
        'label' => '画像',
        'name' => 'image',
        'type' => 'image',
        'return_format' => 'url',
        'preview_size' => 'medium',
        'library' => 'all',
      ],
      [
        'key' => 'field_variety_link',
        'label' => 'リンクURL',
        'name' => 'link',
        'type' => 'url',
        'default_value' => '',
        'placeholder' => '例: https://example.com/variety-page',
      ],
[
        'key' => 'field_variety_description',
        'label' => '品種の特徴',
        'name' => 'description',
        'type' => 'textarea',
        'rows' => 4,
        'new_lines' => 'br',
      ],

      [
        'key' => 'field_variety_res_group',
        'label' => '抵抗性（凡例: ◎ / ○ / ● / △ / -）',
        'name' => 'res',
        'type' => 'group',
        'layout' => 'block',
        'sub_fields' => [
          [
            'key' => 'field_variety_res_01',
            'label' => '果実肥大性',
            'name' => '果実肥大性',
            'type' => 'select',
            'choices' => [ '◎' => '◎', '○' => '○', '●' => '●', '△' => '△', '-' => '-' ],
            'return_format' => 'value',
            'ui' => 1,
            'default_value' => '-',
          ],
          [
            'key' => 'field_variety_res_02',
            'label' => '着果性',
            'name' => '着果性',
            'type' => 'select',
            'choices' => [ '◎' => '◎', '○' => '○', '●' => '●', '△' => '△', '-' => '-' ],
            'return_format' => 'value',
            'ui' => 1,
            'default_value' => '-',
          ],
          [
            'key' => 'field_variety_res_03',
            'label' => '耐裂果性',
            'name' => '耐裂果性',
            'type' => 'select',
            'choices' => [ '◎' => '◎', '○' => '○', '●' => '●', '△' => '△', '-' => '-' ],
            'return_format' => 'value',
            'ui' => 1,
            'default_value' => '-',
          ],
          [
            'key' => 'field_variety_res_04',
            'label' => '耐尻腐れ',
            'name' => '耐尻腐れ',
            'type' => 'select',
            'choices' => [ '◎' => '◎', '○' => '○', '●' => '●', '△' => '△', '-' => '-' ],
            'return_format' => 'value',
            'ui' => 1,
            'default_value' => '-',
          ],
          [
            'key' => 'field_variety_res_05',
            'label' => '黄化葉巻病',
            'name' => '黄化葉巻病',
            'type' => 'select',
            'choices' => [ '◎' => '◎', '○' => '○', '●' => '●', '△' => '△', '-' => '-' ],
            'return_format' => 'value',
            'ui' => 1,
            'default_value' => '-',
          ],
          [
            'key' => 'field_variety_res_06',
            'label' => '葉かび病',
            'name' => '葉かび病',
            'type' => 'select',
            'choices' => [ '◎' => '◎', '○' => '○', '●' => '●', '△' => '△', '-' => '-' ],
            'return_format' => 'value',
            'ui' => 1,
            'default_value' => '-',
          ],
          [
            'key' => 'field_variety_res_07',
            'label' => '根腐萎凋病',
            'name' => '根腐萎凋病',
            'type' => 'select',
            'choices' => [ '◎' => '◎', '○' => '○', '●' => '●', '△' => '△', '-' => '-' ],
            'return_format' => 'value',
            'ui' => 1,
            'default_value' => '-',
          ],
          [
            'key' => 'field_variety_res_08',
            'label' => '萎凋病R1',
            'name' => '萎凋病R1',
            'type' => 'select',
            'choices' => [ '◎' => '◎', '○' => '○', '●' => '●', '△' => '△', '-' => '-' ],
            'return_format' => 'value',
            'ui' => 1,
            'default_value' => '-',
          ],
          [
            'key' => 'field_variety_res_09',
            'label' => '萎凋病R2',
            'name' => '萎凋病R2',
            'type' => 'select',
            'choices' => [ '◎' => '◎', '○' => '○', '●' => '●', '△' => '△', '-' => '-' ],
            'return_format' => 'value',
            'ui' => 1,
            'default_value' => '-',
          ],
          [
            'key' => 'field_variety_res_10',
            'label' => '斑点病',
            'name' => '斑点病',
            'type' => 'select',
            'choices' => [ '◎' => '◎', '○' => '○', '●' => '●', '△' => '△', '-' => '-' ],
            'return_format' => 'value',
            'ui' => 1,
            'default_value' => '-',
          ],
          [
            'key' => 'field_variety_res_11',
            'label' => '半身萎凋病',
            'name' => '半身萎凋病',
            'type' => 'select',
            'choices' => [ '◎' => '◎', '○' => '○', '●' => '●', '△' => '△', '-' => '-' ],
            'return_format' => 'value',
            'ui' => 1,
            'default_value' => '-',
          ],
          [
            'key' => 'field_variety_res_12',
            'label' => 'ネコブセンチュウ',
            'name' => 'ネコブセンチュウ',
            'type' => 'select',
            'choices' => [ '◎' => '◎', '○' => '○', '●' => '●', '△' => '△', '-' => '-' ],
            'return_format' => 'value',
            'ui' => 1,
            'default_value' => '-',
          ],
          [
            'key' => 'field_variety_res_13',
            'label' => 'ToMV',
            'name' => 'ToMV',
            'type' => 'text',
            'default_value' => '',
            'placeholder' => '例: Tm-2a',
          ],
          [
            'key' => 'field_variety_res_14',
            'label' => '青枯病',
            'name' => '青枯病',
            'type' => 'select',
            'choices' => [ '◎' => '◎', '○' => '○', '●' => '●', '△' => '△', '-' => '-' ],
            'return_format' => 'value',
            'ui' => 1,
            'default_value' => '-',
          ],
          [
            'key' => 'field_variety_res_15',
            'label' => '褐色根腐病',
            'name' => '褐色根腐病',
            'type' => 'select',
            'choices' => [ '◎' => '◎', '○' => '○', '●' => '●', '△' => '△', '-' => '-' ],
            'return_format' => 'value',
            'ui' => 1,
            'default_value' => '-',
          ],
        ],
      ],

      [
        'key' => 'field_variety_sort_order',
        'label' => '表示順（小さいほど上）',
        'name' => 'sort_order',
        'type' => 'number',
        'default_value' => 0,
        'min' => 0,
        'step' => 1,
      ],
    ],
    'location' => [
      [
        [
          'param' => 'post_type',
          'operator' => '==',
          'value' => 'variety',
        ],
      ],
    ],
    'position' => 'normal',
    'style' => 'default',
    'label_placement' => 'top',
    'instruction_placement' => 'label',
    'active' => true,
  ]);



});


/**
 * ACF: Populate 品種マスタ「カテゴリ（variety_category）」 choices from taxonomy terms.
 * - key/value: { term_slug => term_name }
 * - This keeps the stored value as the slug (compatible with existing varieties.json export).
 */
add_filter('acf/load_field/name=variety_category', function ($field) {
  $tax = 'variety_category';
  if (!taxonomy_exists($tax)) return $field;

  $terms = get_terms([
    'taxonomy' => $tax,
    'hide_empty' => false,
    'orderby' => 'name',
    'order' => 'ASC',
  ]);

  $choices = [];
  if (!is_wp_error($terms) && is_array($terms)) {
    foreach ($terms as $t) {
      if (!isset($t->slug) || !isset($t->name)) continue;
      $choices[(string) $t->slug] = (string) $t->name;
    }
  }

  // If no terms exist for some reason, keep the field usable.
  if (count($choices) === 0) {
    $choices = [
      'large'     => '大玉トマト',
      'midi'      => 'ミディトマト',
      'mini'      => 'ミニトマト',
      'rootstock' => '台木用トマト',
    ];
  }

  $field['choices'] = $choices;

  // Default value safety
  if (empty($field['default_value']) || !isset($choices[$field['default_value']])) {
    $field['default_value'] = array_key_first($choices);
  }

  return $field;
});


/**
 * Admin UI: show red asterisk for required fields (品種マスタ: カテゴリ / 種苗会社 / SEASON)
 */
add_action('admin_head', function () {
  if (!function_exists('get_current_screen')) return;
  $screen = get_current_screen();
  if (!$screen || ($screen->post_type ?? '') !== 'variety') return;

  echo '<style>
    /* Show required mark only once (before label) for selected fields */
    .acf-field.acf-required-label > .acf-label label:before{
      content:"*";
      color:#e11d48;
      margin-right:2px;
      font-weight:700;
    }
    /* Hide ACF default required asterisk (after label) */
    .acf-field.acf-required-label > .acf-label .acf-required{
      display:none !important;
    }
  </style>';
});

/**
 * JA部会アンケート TOP 用CPT / taxonomy / ACF
 */
add_action('init', function () {
  register_post_type('ja_survey_top', [
    'label' => 'JA部会アンケートTOP',
    'public' => false,
    'show_ui' => true,
    'show_in_menu' => true,
    'menu_position' => 22,
    'supports' => ['title', 'thumbnail'],
    'has_archive' => false,
    'show_in_rest' => true,
  ]);

  // survey_year taxonomy is defined in article-taxonomies.php.
  // Here we only attach that existing taxonomy to ja_survey_top.
  // Re-registering the same taxonomy here would override the object type
  // and cause the sidebar panel to disappear from normal posts.
  if (taxonomy_exists('survey_year')) {
    register_taxonomy_for_object_type('survey_year', 'ja_survey_top');
  }

  $year_terms = ['2024' => '2024', '2025' => '2025', '2026' => '2026', '2027' => '2027'];
  foreach ($year_terms as $slug => $name) {
    if (!term_exists($slug, 'survey_year')) {
      wp_insert_term($name, 'survey_year', ['slug' => $slug]);
    }
  }

  // JA部会アンケートTOP は TOPサマリー専用のため、既存の投稿側にある
  // カテゴリー / SEASON と重複する taxonomy を持たせない。
  if (function_exists('unregister_taxonomy_for_object_type')) {
    unregister_taxonomy_for_object_type('category', 'ja_survey_top');
    unregister_taxonomy_for_object_type('season', 'ja_survey_top');
    unregister_taxonomy_for_object_type('survey_season', 'ja_survey_top');
    unregister_taxonomy_for_object_type('post_tag', 'ja_survey_top');
  }
}, 20);

add_action('admin_menu', function () {
  remove_submenu_page('edit.php?post_type=ja_survey_top', 'edit-tags.php?taxonomy=category&amp;post_type=ja_survey_top');
  remove_submenu_page('edit.php?post_type=ja_survey_top', 'edit-tags.php?taxonomy=category&post_type=ja_survey_top');
  remove_submenu_page('edit.php?post_type=ja_survey_top', 'edit-tags.php?taxonomy=season&amp;post_type=ja_survey_top');
  remove_submenu_page('edit.php?post_type=ja_survey_top', 'edit-tags.php?taxonomy=season&post_type=ja_survey_top');
  remove_submenu_page('edit.php?post_type=ja_survey_top', 'edit-tags.php?taxonomy=survey_season&amp;post_type=ja_survey_top');
  remove_submenu_page('edit.php?post_type=ja_survey_top', 'edit-tags.php?taxonomy=survey_season&post_type=ja_survey_top');
  remove_submenu_page('edit.php?post_type=ja_survey_top', 'edit-tags.php?taxonomy=post_tag&amp;post_type=ja_survey_top');
  remove_submenu_page('edit.php?post_type=ja_survey_top', 'edit-tags.php?taxonomy=post_tag&post_type=ja_survey_top');
}, 99);

add_action('acf/init', function () {
  if (!function_exists('acf_add_local_field_group')) return;

  acf_add_local_field_group([
    'key' => 'group_ja_survey_top_fields',
    'title' => 'JA部会アンケートTOP設定',
    'fields' => [
      [
        'key' => 'field_ja_survey_page_title',
        'label' => 'ページタイトル',
        'name' => 'page_title',
        'type' => 'text',
        'default_value' => 'JA部会アンケート結果',
      ],
      [
        'key' => 'field_ja_survey_page_subtitle',
        'label' => 'ページサブタイトル',
        'name' => 'page_subtitle',
        'type' => 'textarea',
        'rows' => 3,
      ],
      [
        'key' => 'field_ja_survey_hero_title',
        'label' => 'ヒーロータイトル',
        'name' => 'hero_title',
        'type' => 'text',
      ],
      [
        'key' => 'field_ja_survey_hero_description',
        'label' => 'ヒーロー説明文',
        'name' => 'hero_description',
        'type' => 'textarea',
        'rows' => 4,
      ],
      [
        'key' => 'field_ja_survey_detail_title',
        'label' => 'グラフセクションタイトル',
        'name' => 'detail_title',
        'type' => 'text',
        'default_value' => '部会アンケート詳細',
      ],
      [
        'key' => 'field_ja_survey_detail_subtitle',
        'label' => 'グラフセクションサブタイトル',
        'name' => 'detail_subtitle',
        'type' => 'text',
      ],
      [
        'key' => 'field_ja_survey_detail_description',
        'label' => 'グラフセクション説明',
        'name' => 'detail_description',
        'type' => 'textarea',
        'rows' => 3,
      ],
      [
        'key' => 'field_ja_survey_total_producers',
        'label' => '総生産者数',
        'name' => 'total_producers',
        'type' => 'text',
        'instructions' => '例: 12400',
      ],
      [
        'key' => 'field_ja_survey_response_rate',
        'label' => '回答率',
        'name' => 'response_rate',
        'type' => 'text',
        'instructions' => '例: 95',
      ],
      [
        'key' => 'field_ja_survey_target_paper',
        'label' => '対象紙面',
        'name' => 'survey_target_paper',
        'type' => 'select',
        'choices' => [
          'tomato' => 'tomato',
          'leek' => 'leek',
          'strawberry' => 'strawberry',
        ],
        'default_value' => 'tomato',
        'ui' => 1,
        'return_format' => 'value',
        'instructions' => 'JA部会アンケートTOPを出力する紙面を選択してください。',
      ],
      [
        'key' => 'field_ja_survey_top_year',
        'label' => 'アンケート年度（出力用）',
        'name' => 'survey_top_year',
        'type' => 'select',
        'choices' => [
          '2024' => '2024',
          '2025' => '2025',
          '2026' => '2026',
          '2027' => '2027',
        ],
        'default_value' => '2025',
        'ui' => 1,
        'return_format' => 'value',
        'instructions' => 'フロントの YEAR 切替に使う年度です。未設定時はアンケート年度 taxonomy を参照します。',
      ],
      [
        'key' => 'field_ja_survey_top_season',
        'label' => 'アンケートシーズン',
        'name' => 'survey_top_season',
        'type' => 'select',
        'choices' => [
          'winter' => '冬春',
          'summer' => '夏秋',
        ],
        'default_value' => 'summer',
        'ui' => 1,
        'return_format' => 'value',
        'instructions' => 'TOPサマリーに表示するシーズンを選択してください。',
      ],
      [
        'key' => 'field_ja_survey_graph_1',
        'label' => 'survey_graph_1（困っている害虫）',
        'name' => 'survey_graph_1',
        'type' => 'textarea',
        'rows' => 8,
        'instructions' => 'JSON配列で入力してください。例: [{"label":"コナジラミ類","value":72},{"label":"トマトキバガ","value":45}]',
      ],
      [
        'key' => 'field_ja_survey_graph_2',
        'label' => 'survey_graph_2（困っている病害）',
        'name' => 'survey_graph_2',
        'type' => 'textarea',
        'rows' => 8,
        'instructions' => 'JSON配列で入力してください。',
      ],
      [
        'key' => 'field_ja_survey_graph_3',
        'label' => 'survey_graph_3（困っている生理障害）',
        'name' => 'survey_graph_3',
        'type' => 'textarea',
        'rows' => 8,
        'instructions' => 'JSON配列で入力してください。',
      ],
      [
        'key' => 'field_ja_survey_graph_4',
        'label' => 'survey_graph_4（導入したい資機材）',
        'name' => 'survey_graph_4',
        'type' => 'textarea',
        'rows' => 8,
        'instructions' => 'JSON配列で入力してください。',
      ],

      [
        'key' => 'field_ja_survey_detail_section_1_title',
        'label' => '詳細セクション1タイトル（困っている害虫）',
        'name' => 'detail_section_1_title',
        'type' => 'text',
        'default_value' => '害虫　コナジラミ類対策に苦戦',
      ],
      [
        'key' => 'field_ja_survey_detail_section_1_text',
        'label' => '詳細セクション1本文（困っている害虫）',
        'name' => 'detail_section_1_text',
        'type' => 'textarea',
        'rows' => 8,
        'instructions' => '改行で段落を分けて入力してください。',
      ],
      [
        'key' => 'field_ja_survey_detail_section_1_highlight',
        'label' => '詳細セクション1強調ボックス（困っている害虫）',
        'name' => 'detail_section_1_highlight',
        'type' => 'textarea',
        'rows' => 4,
        'instructions' => 'オレンジの強調ボックスに表示する文章です。改行可。',
      ],
      [
        'key' => 'field_ja_survey_detail_section_2_title',
        'label' => '詳細セクション2タイトル（困っている病害）',
        'name' => 'detail_section_2_title',
        'type' => 'text',
        'default_value' => '病害　黄化葉巻病 天敵導入の動きも',
      ],
      [
        'key' => 'field_ja_survey_detail_section_2_text',
        'label' => '詳細セクション2本文（困っている病害）',
        'name' => 'detail_section_2_text',
        'type' => 'textarea',
        'rows' => 8,
        'instructions' => '改行で段落を分けて入力してください。',
      ],
      [
        'key' => 'field_ja_survey_detail_section_2_highlight',
        'label' => '詳細セクション2強調ボックス（困っている病害）',
        'name' => 'detail_section_2_highlight',
        'type' => 'textarea',
        'rows' => 4,
        'instructions' => 'オレンジの強調ボックスに表示する文章です。改行可。',
      ],
      [
        'key' => 'field_ja_survey_detail_section_3_title',
        'label' => '詳細セクション3タイトル（困っている生理障害）',
        'name' => 'detail_section_3_title',
        'type' => 'text',
        'default_value' => '生理障害　高温・かん水管理が課題',
      ],
      [
        'key' => 'field_ja_survey_detail_section_3_text',
        'label' => '詳細セクション3本文（困っている生理障害）',
        'name' => 'detail_section_3_text',
        'type' => 'textarea',
        'rows' => 8,
        'instructions' => '改行で段落を分けて入力してください。',
      ],
      [
        'key' => 'field_ja_survey_detail_section_3_highlight',
        'label' => '詳細セクション3強調ボックス（困っている生理障害）',
        'name' => 'detail_section_3_highlight',
        'type' => 'textarea',
        'rows' => 4,
        'instructions' => 'オレンジの強調ボックスに表示する文章です。改行可。',
      ],
      [
        'key' => 'field_ja_survey_detail_section_4_title',
        'label' => '詳細セクション4タイトル（導入したい資機材）',
        'name' => 'detail_section_4_title',
        'type' => 'text',
        'default_value' => '導入したい資機材　現場ニーズの高い設備',
      ],
      [
        'key' => 'field_ja_survey_detail_section_4_text',
        'label' => '詳細セクション4本文（導入したい資機材）',
        'name' => 'detail_section_4_text',
        'type' => 'textarea',
        'rows' => 8,
        'instructions' => '改行で段落を分けて入力してください。',
      ],
      [
        'key' => 'field_ja_survey_detail_section_4_highlight',
        'label' => '詳細セクション4強調ボックス（導入したい資機材）',
        'name' => 'detail_section_4_highlight',
        'type' => 'textarea',
        'rows' => 4,
        'instructions' => 'オレンジの強調ボックスに表示する文章です。改行可。',
      ],
    ],
    'location' => [
      [
        [
          'param' => 'post_type',
          'operator' => '==',
          'value' => 'ja_survey_top',
        ],
      ],
    ],
    'position' => 'normal',
    'style' => 'default',
    'label_placement' => 'top',
    'instruction_placement' => 'label',
    'active' => true,
  ]);
});


/**
 * 品種選びのポイント設定（variety.html / points-grid）
 * - Menu: 品種マスタ > 品種選びのポイント
 * - Per paper + per season (冬春 / 夏秋)
 */
function tomato_get_variety_points_option_name(): string {
  return 'tomato_variety_points_settings';
}

function tomato_get_available_papers_for_variety_points(): array {
  $papers = [];

  $static_src_root = rtrim(ABSPATH, '/\\') . '/static-src';
  if (is_dir($static_src_root)) {
    $dirs = glob($static_src_root . '/*', GLOB_ONLYDIR);
    if (is_array($dirs)) {
      foreach ($dirs as $dir) {
        $slug = basename((string) $dir);
        if ($slug === '' || $slug === 'common' || str_starts_with($slug, '.')) continue;
        if (is_file($dir . '/list.html') && is_file($dir . '/detail.html')) {
          $papers[$slug] = $slug;
        }
      }
    }
  }

  if (empty($papers) && taxonomy_exists('category')) {
    $terms = get_terms([
      'taxonomy'   => 'category',
      'hide_empty' => false,
      'orderby'    => 'name',
      'order'      => 'ASC',
    ]);
    if (!is_wp_error($terms) && is_array($terms)) {
      foreach ($terms as $term) {
        if (!empty($term->slug)) {
          $papers[(string) $term->slug] = (string) $term->name;
        }
      }
    }
  }

  if (empty($papers)) {
    $papers['tomato'] = 'tomato';
  }

  return $papers;
}

function tomato_get_default_variety_points_cards(): array {
  return [
    1 => [
      'title' => '着果不良',
      'text'  => "着果不良が生じる主な原因として、高温による花粉稔性（ねんせい）の低下が挙げられる。トマトの花粉は25度を超えると稔性が低くなり、30度以上になると極端に低下し、着果不良が多発する。\n\nこの着果性を改善するために、細霧冷房、遮光カーテン、遮光塗料などの活用が効果的であるが、高温期の着果性に優れた品種の選択も重要である。近年、高温期の着果性が優れた品種も開発されており、各種苗会社のコメントを参考にして、栽培する品種を選択したい。",
    ],
    2 => [
      'title' => '障害果の発生',
      'text'  => "高温時に発生が懸念される障害果として、日焼け果、裂果、尻腐れ果などが挙げられる。\n\n日焼け果は果実が葉に隠れるように整理する、裂果は給水量の急激な変化を避ける、尻腐れ果はカルシウムを多施用し十分な水分を供給するなどの対策があるが、裂果と尻腐れ果は相反する対応が求められるため、日々の適切な栽培管理が重要になる。\n\n近年は、これら障害に対して強い耐性を持つ品種が開発されており、本紙に掲載されている情報を有効に活用したい。また、以前は問題が大きかったミニトマトの裂果についても、耐裂果性を持つ品種が多く開発されているので、こちらも各社のコメントを参考にしたい。",
    ],
    3 => [
      'title' => '果実の肥大不足',
      'text'  => "高温期には葉からの蒸散が活発になるため、茎葉に流れる水分は多くなるが、果実に供給される水分が少なくなり、小果が増加する。\n\nそのため、果実肥大性の優れた品種を選択したいが、その場合、既述のように裂果の発生が懸念される。最近ではこの両形質とも優れた品種も開発されつつあるので注目したい。",
    ],
    4 => [
      'title' => '青枯病対策',
      'text'  => "青枯病は、高温時に発生しやすい土壌病害で、夏秋期のトマト栽培では被害が最も大きな病害の一つである。\n\n青枯病対策として、還元消毒や太陽熱消毒などの土壌消毒は一定の効果が認められるが、抵抗性台木用品種への接ぎ木が有効な手段とされている。近年開発されたトマト台木用品種の中には、青枯病抵抗性がかなり強い品種もあるため、青枯病の被害に悩んでいる栽培地では、適切な土壌消毒を施した上、強い青枯病抵抗性を示す台木用品種を選びたい。\n\nなお、種苗メーカー各社は、台木用品種の青枯病抵抗性強度をランク付けしていることが多いので、その情報も参考にしたい。",
    ],
  ];
}

function tomato_get_default_variety_points_payload(): array {
  $cards = tomato_get_default_variety_points_cards();
  return [
    'winter-spring' => $cards,
    'summer-autumn' => $cards,
  ];
}

function tomato_get_raw_variety_points_settings(): array {
  $raw = get_option(tomato_get_variety_points_option_name(), []);
  return is_array($raw) ? $raw : [];
}

function tomato_variety_points_paper_has_registered_content($paper_data): bool {
  if (!is_array($paper_data)) {
    return false;
  }

  foreach (['winter-spring', 'summer-autumn'] as $season_slug) {
    $season_data = isset($paper_data[$season_slug]) && is_array($paper_data[$season_slug]) ? $paper_data[$season_slug] : [];
    foreach ([1, 2, 3, 4] as $index) {
      $card = isset($season_data[$index]) && is_array($season_data[$index]) ? $season_data[$index] : [];
      $title = isset($card['title']) ? trim((string) $card['title']) : '';
      $text = isset($card['text']) ? trim((string) $card['text']) : '';
      if ($title !== '' || $text !== '') {
        return true;
      }
    }
  }

  return false;
}

function tomato_get_registered_variety_points_papers(): array {
  $papers = tomato_get_available_papers_for_variety_points();
  $raw = tomato_get_raw_variety_points_settings();
  $registered = [];

  if (!is_array($raw)) {
    return $registered;
  }

  foreach ($raw as $paper_slug => $paper_data) {
    $paper_slug = sanitize_title((string) $paper_slug);
    if ($paper_slug === '') {
      continue;
    }

    if (!tomato_variety_points_paper_has_registered_content($paper_data)) {
      continue;
    }

    $normalized_paper = tomato_normalize_variety_points_settings([$paper_slug => $paper_data]);
    $normalized_payload = $normalized_paper[$paper_slug] ?? [];
    if ($normalized_payload === tomato_get_default_variety_points_payload()) {
      continue;
    }

    $season_labels = [];
    $default_payload = tomato_get_default_variety_points_payload();
    foreach (['winter-spring' => '冬春', 'summer-autumn' => '夏秋'] as $season_slug => $season_label) {
      $normalized_season = isset($normalized_payload[$season_slug]) && is_array($normalized_payload[$season_slug]) ? $normalized_payload[$season_slug] : [];
      $default_season = isset($default_payload[$season_slug]) && is_array($default_payload[$season_slug]) ? $default_payload[$season_slug] : [];

      if ($normalized_season !== $default_season) {
        $season_labels[] = $season_label;
      }
    }

    $registered[$paper_slug] = [
      'label' => (string) ($papers[$paper_slug] ?? $paper_slug),
      'seasons' => $season_labels,
    ];
  }

  return $registered;
}

function tomato_get_variety_points_papers_list_rows(): array {
  $papers = tomato_get_available_papers_for_variety_points();
  $registered_papers = tomato_get_registered_variety_points_papers();
  $rows = [];

  foreach ($papers as $paper_slug => $paper_label) {
    $registered_info = isset($registered_papers[$paper_slug]) && is_array($registered_papers[$paper_slug]) ? $registered_papers[$paper_slug] : [];
    $season_labels = isset($registered_info['seasons']) && is_array($registered_info['seasons']) ? $registered_info['seasons'] : [];

    $rows[$paper_slug] = [
      'slug' => (string) $paper_slug,
      'label' => (string) $paper_label,
      'is_registered' => !empty($registered_info),
      'seasons' => $season_labels,
    ];
  }

  return $rows;
}

function tomato_normalize_variety_points_settings($settings): array {
  $papers = tomato_get_available_papers_for_variety_points();
  $defaults = tomato_get_default_variety_points_payload();
  $normalized = [];

  if (!is_array($settings)) {
    $settings = [];
  }

  foreach ($papers as $paper_slug => $paper_label) {
    $paper_data = isset($settings[$paper_slug]) && is_array($settings[$paper_slug]) ? $settings[$paper_slug] : [];
    $normalized[$paper_slug] = [];

    foreach (['winter-spring', 'summer-autumn'] as $season_slug) {
      $season_data = isset($paper_data[$season_slug]) && is_array($paper_data[$season_slug]) ? $paper_data[$season_slug] : [];
      $normalized[$paper_slug][$season_slug] = [];

      foreach ([1, 2, 3, 4] as $index) {
        $card = isset($season_data[$index]) && is_array($season_data[$index]) ? $season_data[$index] : [];
        $default_card = $defaults[$season_slug][$index] ?? ['title' => '', 'text' => ''];

        $title = isset($card['title']) ? sanitize_text_field((string) $card['title']) : (string) $default_card['title'];
        $text  = isset($card['text']) ? sanitize_textarea_field((string) $card['text']) : (string) $default_card['text'];

        if ($title === '' && $text === '') {
          $title = (string) $default_card['title'];
          $text  = (string) $default_card['text'];
        }

        $normalized[$paper_slug][$season_slug][$index] = [
          'title' => $title,
          'text'  => $text,
        ];
      }
    }
  }

  return $normalized;
}

function tomato_get_variety_points_settings(): array {
  $raw = tomato_get_raw_variety_points_settings();
  return tomato_normalize_variety_points_settings($raw);
}

function tomato_get_variety_points_for_paper(string $paper): array {
  $paper = sanitize_title($paper);
  $all = tomato_get_variety_points_settings();
  if (isset($all[$paper]) && is_array($all[$paper])) {
    return $all[$paper];
  }

  if (isset($all['tomato']) && is_array($all['tomato'])) {
    return $all['tomato'];
  }

  return tomato_get_default_variety_points_payload();
}

add_action('admin_menu', function () {
  add_submenu_page(
    'edit.php?post_type=variety',
    '品種選びのポイント',
    '品種選びのポイント',
    'manage_options',
    'variety-points-settings',
    'tomato_render_variety_points_settings_page'
  );
}, 30);

function tomato_render_variety_points_settings_page(): void {
  if (!current_user_can('manage_options')) {
    wp_die('このページにアクセスする権限がありません。');
  }

  $papers = tomato_get_available_papers_for_variety_points();
  $selected_paper = '';
  if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['selected_paper'])) {
    $selected_paper = sanitize_title((string) $_POST['selected_paper']);
  }
  if ($selected_paper === '' && isset($_GET['paper'])) {
    $selected_paper = sanitize_title((string) $_GET['paper']);
  }
  if ($selected_paper !== '' && !isset($papers[$selected_paper])) {
    $selected_paper = '';
  }

  if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['tomato_variety_points_nonce'])) {
    check_admin_referer('tomato_save_variety_points', 'tomato_variety_points_nonce');

    if ($selected_paper === '') {
      $selected_paper = array_key_first($papers);
    }

    $existing = tomato_get_raw_variety_points_settings();
    $posted = isset($_POST['variety_points']) && is_array($_POST['variety_points']) ? $_POST['variety_points'] : [];
    $paper_payload = [$selected_paper => $posted];
    $normalized_paper_payload = tomato_normalize_variety_points_settings($paper_payload);

    $existing[$selected_paper] = $normalized_paper_payload[$selected_paper] ?? tomato_get_default_variety_points_payload();
    update_option(tomato_get_variety_points_option_name(), $existing, false);

    if (class_exists('Tomato_Auto_Static_Build_Queue')) {
      Tomato_Auto_Static_Build_Queue::request_build([$selected_paper], 'variety_points_settings_saved');
    }

    echo '<div class="notice notice-success is-dismissible"><p>品種選びのポイントを保存しました。静的ビルドキューにも追加しました。</p></div>';
  }

  $is_edit_mode = ($selected_paper !== '');
  $base_url = admin_url('edit.php?post_type=variety&page=variety-points-settings');

  echo '<div class="wrap">';
  echo '<h1 class="wp-heading-inline">品種選びのポイント</h1>';

  if (!$is_edit_mode) {
    echo ' <a href="' . esc_url($base_url . '&paper=' . rawurlencode((string) array_key_first($papers))) . '" class="page-title-action">品種選びのポイントを追加</a>';
  }

  echo '<p>variety.html の「品種選びのポイント」4件を、紙面ごと・SEASONごとに設定できます。</p>';

  if (!$is_edit_mode) {
    $rows = tomato_get_variety_points_papers_list_rows();

    echo '<table class="wp-list-table widefat fixed striped table-view-list" style="margin-top:16px;">';
    echo '<thead><tr>';
    echo '<th scope="col" style="width:30%;">紙面</th>';
    echo '<th scope="col" style="width:20%;">登録状況</th>';
    echo '<th scope="col" style="width:30%;">登録済みSEASON</th>';
    echo '<th scope="col" style="width:20%;">操作</th>';
    echo '</tr></thead>';
    echo '<tbody>';

    foreach ($rows as $row) {
      $paper_slug = (string) ($row['slug'] ?? '');
      $paper_label = (string) ($row['label'] ?? $paper_slug);
      $is_registered = !empty($row['is_registered']);
      $seasons = isset($row['seasons']) && is_array($row['seasons']) ? $row['seasons'] : [];
      $edit_url = $base_url . '&paper=' . rawurlencode($paper_slug);

      echo '<tr>';
      echo '<td><strong><a href="' . esc_url($edit_url) . '">' . esc_html($paper_label) . '</a></strong>';
      echo '<div class="row-actions"><span class="edit"><a href="' . esc_url($edit_url) . '">編集</a></span></div>';
      echo '</td>';
      echo '<td>' . ($is_registered ? '登録済み' : '未登録') . '</td>';
      echo '<td>' . (!empty($seasons) ? esc_html(implode(' / ', $seasons)) : '—') . '</td>';
      echo '<td><a class="button button-secondary" href="' . esc_url($edit_url) . '">' . ($is_registered ? '編集' : '新規登録') . '</a></td>';
      echo '</tr>';
    }

    echo '</tbody>';
    echo '</table>';
    echo '</div>';
    return;
  }

  $paper_settings = tomato_get_variety_points_for_paper($selected_paper);
  $season_labels = [
    'winter-spring' => '冬春',
    'summer-autumn' => '夏秋',
  ];

  echo '<hr class="wp-header-end">';
  echo '<p><a href="' . esc_url($base_url) . '">&larr; 一覧へ戻る</a></p>';
  echo '<h2 style="margin-top:16px;">紙面: ' . esc_html((string) ($papers[$selected_paper] ?? $selected_paper)) . '</h2>';

  echo '<form method="post">';
  wp_nonce_field('tomato_save_variety_points', 'tomato_variety_points_nonce');
  echo '<input type="hidden" name="selected_paper" value="' . esc_attr((string) $selected_paper) . '">';

  foreach ($season_labels as $season_slug => $season_label) {
    echo '<div style="background:#fff; border:1px solid #dcdcde; padding:20px; margin-bottom:24px;">';
    echo '<h2 style="margin-top:0;">SEASON: ' . esc_html($season_label) . '</h2>';
    echo '<p style="margin-top:0; color:#50575e;">4つのポイントカードのタイトルと本文を入力してください。</p>';

    for ($i = 1; $i <= 4; $i++) {
      $card = $paper_settings[$season_slug][$i] ?? ['title' => '', 'text' => ''];
      echo '<div style="border:1px solid #e2e4e7; padding:16px; margin-bottom:16px; border-radius:6px;">';
      echo '<h3 style="margin-top:0;">ポイント' . intval($i) . '</h3>';
      echo '<table class="form-table" role="presentation"><tbody>';
      echo '<tr>';
      echo '<th scope="row"><label for="vp_' . esc_attr($season_slug . '_' . $i . '_title') . '">タイトル</label></th>';
      echo '<td><input type="text" class="regular-text" id="vp_' . esc_attr($season_slug . '_' . $i . '_title') . '" name="variety_points[' . esc_attr($season_slug) . '][' . intval($i) . '][title]" value="' . esc_attr((string) ($card['title'] ?? '')) . '"></td>';
      echo '</tr>';
      echo '<tr>';
      echo '<th scope="row"><label for="vp_' . esc_attr($season_slug . '_' . $i . '_text') . '">本文</label></th>';
      echo '<td><textarea class="large-text" rows="8" id="vp_' . esc_attr($season_slug . '_' . $i . '_text') . '" name="variety_points[' . esc_attr($season_slug) . '][' . intval($i) . '][text]">' . esc_textarea((string) ($card['text'] ?? '')) . '</textarea><p class="description">改行すると、フロント側では段落ごとに表示されます。</p></td>';
      echo '</tr>';
      echo '</tbody></table>';
      echo '</div>';
    }

    echo '</div>';
  }

  submit_button('保存する');
  echo '</form>';
  echo '</div>';
}

