<?php
/**
 * Tomato News - Ad Items (Placements)
 *
 * Creates a CPT for placements and taxonomies:
 * - post_type: ad_item
 * - taxonomy:  paper   (tomato / leek / strawberry ...)
 * - taxonomy:  ad_type (ads / pr / sponsor_ad / sponsor_video)
 *
 * Adds:
 * - Dropdown UI (no free text) for paper/ad_type on ad_item edit screen
 * - Limit setting on ad_type term screen (per paper x type)  ※limit is global per type, applied per paper
 * - Validation: prevents publishing ad_item if over limit
 * - Show "limit" column before "count" on ad_type term list
 */

if (!defined('ABSPATH')) {
  exit;
}

const TOMATO_ADTYPE_LIMIT_META_KEY = 'tomato_ad_type_limit_per_paper';

add_action('init', function () {

  // ---------------------------------------------------------------------------
  // Taxonomy: paper (for ad_item)
  // ---------------------------------------------------------------------------
  $paper_labels = [
    'name'              => '紙（paper）',
    'singular_name'     => '紙（paper）',
    'search_items'      => '紙を検索',
    'all_items'         => 'すべての紙',
    'edit_item'         => '紙を編集',
    'update_item'       => '紙を更新',
    'add_new_item'      => '新しい紙を追加',
    'new_item_name'     => '新しい紙名',
    'menu_name'         => '紙',
  ];

  register_taxonomy('paper', ['ad_item'], [
    'hierarchical'      => false,
    'labels'            => $paper_labels,
    'show_ui'           => true,
    'show_admin_column' => true,
    'show_in_rest'      => true,
    'query_var'         => true,
    'rewrite'           => ['slug' => 'paper'],
    // Disable default "tag-style" metabox (free text input)
    'meta_box_cb'       => false,
  ]);

  // ---------------------------------------------------------------------------
  // Taxonomy: ad_type (for ad_item)
  // ---------------------------------------------------------------------------
  $type_labels = [
    'name'              => '枠タイプ',
    'singular_name'     => '枠タイプ',
    'search_items'      => '枠タイプを検索',
    'all_items'         => 'すべての枠タイプ',
    'edit_item'         => '枠タイプを編集',
    'update_item'       => '枠タイプを更新',
    'add_new_item'      => '新しい枠タイプを追加',
    'new_item_name'     => '新しい枠タイプ名',
    'menu_name'         => '枠タイプ',
  ];

  register_taxonomy('ad_type', ['ad_item'], [
    'hierarchical'      => false,
    'labels'            => $type_labels,
    'show_ui'           => true,
    'show_admin_column' => true,
    'show_in_rest'      => true,
    'query_var'         => true,
    'rewrite'           => ['slug' => 'ad-type'],
    // Disable default "tag-style" metabox (free text input)
    'meta_box_cb'       => false,
  ]);

  // ---------------------------------------------------------------------------
  // CPT: ad_item
  // ---------------------------------------------------------------------------
  $labels = [
    'name'               => '広告枠',
    'singular_name'      => '広告枠',
    'menu_name'          => '広告枠',
    'name_admin_bar'     => '広告枠',
    'add_new'            => '新規追加',
    'add_new_item'       => '広告枠を追加',
    'new_item'           => '新しい広告枠',
    'edit_item'          => '広告枠を編集',
    'view_item'          => '広告枠を表示',
    'all_items'          => '広告枠一覧',
    'search_items'       => '広告枠を検索',
    'not_found'          => '広告枠が見つかりません',
    'not_found_in_trash' => 'ゴミ箱に広告枠はありません',
  ];

  register_post_type('ad_item', [
    'labels'             => $labels,
    'public'             => false,
    'show_ui'            => true,
    'show_in_menu'       => true,
    'menu_position'      => 26,
    'menu_icon'          => 'dashicons-megaphone',
    'supports'           => ['title', 'page-attributes'], // page-attributes => menu_order
    'hierarchical'       => false,
    'has_archive'        => false,
    'rewrite'            => false,
    'query_var'          => false,
    'show_in_rest'       => true,
    'capability_type'    => 'post',
  ]);

  // ---------------------------------------------------------------------------
  // Seed default terms (non-destructive)
  // ---------------------------------------------------------------------------
  $default_types = [
    'ads'           => '広告（ads）',
    'pr'            => 'PR（pr）',
    'sponsor_ad'    => 'スポンサー広告（sponsor_ad）',
    'sponsor_video' => 'スポンサー動画広告紹介（sponsor_video）',
  ];

  foreach ($default_types as $slug => $name) {
    if (!term_exists($slug, 'ad_type')) {
      wp_insert_term($name, 'ad_type', ['slug' => $slug]);
    }
  }

}, 0);

//
// -----------------------------------------------------------------------------
// 1) Admin: ad_type term screen - add "limit" field (per paper x type)
// -----------------------------------------------------------------------------
//

add_action('ad_type_add_form_fields', function () {
  ?>
  <div class="form-field term-limit-wrap">
    <label for="tomato_ad_type_limit"><?php echo esc_html('上限数（1紙あたり）'); ?></label>
    <input type="number" name="tomato_ad_type_limit" id="tomato_ad_type_limit" value="" min="0" step="1" />
    <p class="description">
      <?php echo esc_html('0 または空欄 = 制限なし。例）広告=3 / PR=2 / スポンサー広告=4 / スポンサー動画=3'); ?>
    </p>
  </div>
  <?php
});

add_action('ad_type_edit_form_fields', function ($term) {
  $limit = get_term_meta($term->term_id, TOMATO_ADTYPE_LIMIT_META_KEY, true);
  $limit = is_numeric($limit) ? (int) $limit : '';
  ?>
  <tr class="form-field term-limit-wrap">
    <th scope="row">
      <label for="tomato_ad_type_limit"><?php echo esc_html('上限数（1紙あたり）'); ?></label>
    </th>
    <td>
      <input type="number" name="tomato_ad_type_limit" id="tomato_ad_type_limit" value="<?php echo esc_attr($limit); ?>" min="0" step="1" />
      <p class="description">
        <?php echo esc_html('0 または空欄 = 制限なし。紙（paper）ごとにこの上限が適用されます（枠タイプは全紙共通設定）。'); ?>
      </p>
    </td>
  </tr>
  <?php
}, 10, 1);

function tomato_save_ad_type_limit_term_meta($term_id) {
  if (!isset($_POST['tomato_ad_type_limit'])) return;

  $raw = $_POST['tomato_ad_type_limit'];
  if ($raw === '' || $raw === null) {
    delete_term_meta($term_id, TOMATO_ADTYPE_LIMIT_META_KEY);
    return;
  }

  $limit = (int) $raw;
  if ($limit <= 0) {
    // 0 means unlimited -> remove meta
    delete_term_meta($term_id, TOMATO_ADTYPE_LIMIT_META_KEY);
    return;
  }

  update_term_meta($term_id, TOMATO_ADTYPE_LIMIT_META_KEY, $limit);
}

add_action('created_ad_type', 'tomato_save_ad_type_limit_term_meta', 10, 1);
add_action('edited_ad_type',  'tomato_save_ad_type_limit_term_meta', 10, 1);

//
// -----------------------------------------------------------------------------
// 1.5) Admin: ad_type list table - show "limit" column before Count
// -----------------------------------------------------------------------------

add_filter('manage_edit-ad_type_columns', function ($columns) {
  $new = [];
  foreach ($columns as $key => $label) {
    // Insert our column just before "posts" (Count)
    if ($key === 'posts') {
      $new['tomato_limit'] = '上限数';
    }
    $new[$key] = $label;
  }
  return $new;
});

add_filter('manage_ad_type_custom_column', function ($content, $column_name, $term_id) {
  if ($column_name !== 'tomato_limit') return $content;

  $limit = get_term_meta($term_id, TOMATO_ADTYPE_LIMIT_META_KEY, true);
  $limit = is_numeric($limit) ? (int) $limit : 0;

  // 0/empty = unlimited
  return $limit > 0 ? (string) $limit : '—';
}, 10, 3);

//
// -----------------------------------------------------------------------------
// 2) Admin: replace free-text taxonomy UI with dropdown (single select)
// -----------------------------------------------------------------------------
//

add_action('add_meta_boxes', function () {
  $screen = function_exists('get_current_screen') ? get_current_screen() : null;
  if (!$screen || $screen->post_type !== 'ad_item') return;

  add_meta_box(
    'ad_item_paper_dropdown',
    '紙（paper）',
    'tomato_render_tax_dropdown_metabox_paper',
    'ad_item',
    'side',
    'default'
  );

  add_meta_box(
    'ad_item_ad_type_dropdown',
    '枠タイプ',
    'tomato_render_tax_dropdown_metabox_ad_type',
    'ad_item',
    'side',
    'default'
  );
});

function tomato_render_tax_dropdown_metabox_paper($post) {
  tomato_render_tax_dropdown_metabox($post, 'paper', 'tax_input_paper', '紙を選択してください（例: tomato / leek / strawberry）');
}

function tomato_render_tax_dropdown_metabox_ad_type($post) {
  tomato_render_tax_dropdown_metabox($post, 'ad_type', 'tax_input_ad_type', '枠タイプを選択してください（ads / pr / sponsor_ad / sponsor_video）');
}

function tomato_render_tax_dropdown_metabox($post, $taxonomy, $field_name, $help_text) {
  $taxonomy = (string) $taxonomy;

  wp_nonce_field('tomato_ad_item_tax_save', 'tomato_ad_item_tax_nonce');

  $selected = '';
  $terms = get_the_terms($post->ID, $taxonomy);
  if (is_array($terms) && !empty($terms)) {
    $selected = (string) $terms[0]->term_id;
  }

  echo '<p style="margin: 6px 0 10px; color:#555;">' . esc_html($help_text) . '</p>';

  wp_dropdown_categories([
    'taxonomy'          => $taxonomy,
    'hide_empty'        => 0,
    'name'              => $field_name,
    'orderby'           => 'name',
    'selected'          => $selected,
    'show_option_none'  => '— 選択してください —',
    'option_none_value' => '',
    'hierarchical'      => 0,
  ]);

  echo '<p style="margin-top:8px; color:#666; font-size:12px;">※ 自由入力はできません。選択肢は「広告枠 → 紙 / 枠タイプ」画面で管理します。</p>';
}

add_action('save_post_ad_item', function ($post_id, $post, $update) {
  if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) return;
  if (!($post instanceof WP_Post) || $post->post_type !== 'ad_item') return;

  if (!isset($_POST['tomato_ad_item_tax_nonce']) || !wp_verify_nonce((string) $_POST['tomato_ad_item_tax_nonce'], 'tomato_ad_item_tax_save')) {
    return;
  }

  if (!current_user_can('edit_post', $post_id)) return;

  // paper
  if (array_key_exists('tax_input_paper', $_POST)) {
    $term_id = (int) $_POST['tax_input_paper'];
    if ($term_id > 0) {
      $term = get_term($term_id, 'paper');
      if ($term && !is_wp_error($term)) {
        wp_set_object_terms($post_id, [$term_id], 'paper', false);
      } else {
        wp_set_object_terms($post_id, [], 'paper', false);
      }
    } else {
      wp_set_object_terms($post_id, [], 'paper', false);
    }
  }

  // ad_type
  if (array_key_exists('tax_input_ad_type', $_POST)) {
    $term_id = (int) $_POST['tax_input_ad_type'];
    if ($term_id > 0) {
      $term = get_term($term_id, 'ad_type');
      if ($term && !is_wp_error($term)) {
        wp_set_object_terms($post_id, [$term_id], 'ad_type', false);
      } else {
        wp_set_object_terms($post_id, [], 'ad_type', false);
      }
    } else {
      wp_set_object_terms($post_id, [], 'ad_type', false);
    }
  }

}, 10, 3);

//

// -----------------------------------------------------------------------------
// 2.5) Ensure only ONE "SP固定バナーに表示（index.html）" per paper
// - Field: show_on_index_sticky (ACF true_false)
// - When this is turned ON for a post, all other ad_item in the same paper are forced OFF
// -----------------------------------------------------------------------------
add_action('acf/save_post', function ($post_id) {

  // Guard
  static $running = false;
  if ($running) return;

  $pid = (int) $post_id;
  if ($pid <= 0) return;

  if (wp_is_post_revision($pid) || wp_is_post_autosave($pid)) return;
  if (get_post_type($pid) !== 'ad_item') return;

  if (!function_exists('get_field') || !function_exists('update_field')) return;

  $show = get_field('show_on_index_sticky', $pid);
  if (!$show) return;

  // Paper slug
  $paper_slugs = wp_get_object_terms($pid, 'paper', ['fields' => 'slugs']);
  $paper_slug = (is_array($paper_slugs) && !empty($paper_slugs)) ? sanitize_title((string) $paper_slugs[0]) : '';
  if ($paper_slug === '') return;

  $q = new WP_Query([
    'post_type'      => 'ad_item',
    'post_status'    => 'any',
    'posts_per_page' => -1,
    'fields'         => 'ids',
    'post__not_in'   => [$pid],
    'tax_query'      => [
      [
        'taxonomy' => 'paper',
        'field'    => 'slug',
        'terms'    => [$paper_slug],
      ],
    ],
    'meta_query'     => [
      [
        'key'     => 'show_on_index_sticky',
        'value'   => '1',
        'compare' => '=',
      ],
    ],
  ]);

  if (!empty($q->posts)) {
    $running = true;
    foreach ($q->posts as $other_id) {
      $oid = (int) $other_id;
      if ($oid <= 0) continue;
      // Turn OFF (store as 0)
      update_field('show_on_index_sticky', 0, $oid);
    }
    $running = false;
  }

}, 20);

// -----------------------------------------------------------------------------
// 3) Validation: enforce limit on publish (paper x ad_type)
// - If over limit, force status back to draft and show admin notice
// -----------------------------------------------------------------------------

function tomato_get_selected_term_id_from_post($taxonomy, $post_id) {
  $terms = get_the_terms($post_id, $taxonomy);
  if (is_array($terms) && !empty($terms)) {
    return (int) $terms[0]->term_id;
  }
  return 0;
}

function tomato_count_published_ad_items($paper_term_id, $ad_type_term_id, $exclude_post_id = 0) {
  if ($paper_term_id <= 0 || $ad_type_term_id <= 0) return 0;

  $q = new WP_Query([
    'post_type'      => 'ad_item',
    'post_status'    => 'publish',
    'posts_per_page' => 1,     // we only need found_posts
    'fields'         => 'ids',
    'post__not_in'   => $exclude_post_id ? [(int) $exclude_post_id] : [],
    'tax_query'      => [
      'relation' => 'AND',
      [
        'taxonomy' => 'paper',
        'field'    => 'term_id',
        'terms'    => [(int) $paper_term_id],
      ],
      [
        'taxonomy' => 'ad_type',
        'field'    => 'term_id',
        'terms'    => [(int) $ad_type_term_id],
      ],
    ],
  ]);

  return (int) $q->found_posts;
}

function tomato_set_limit_error_notice($message) {
  $key = 'tomato_ad_limit_error_' . get_current_user_id();
  set_transient($key, (string) $message, 60);
}

add_action('admin_notices', function () {
  $key = 'tomato_ad_limit_error_' . get_current_user_id();
  $msg = get_transient($key);
  if (!$msg) return;

  delete_transient($key);

  echo '<div class="notice notice-error is-dismissible"><p>' . esc_html($msg) . '</p></div>';
});

add_filter('wp_insert_post_data', function ($data, $postarr) {

  if (empty($data['post_type']) || $data['post_type'] !== 'ad_item') return $data;

  // Only validate when user tries to publish
  if (empty($data['post_status']) || $data['post_status'] !== 'publish') return $data;

  $post_id = isset($postarr['ID']) ? (int) $postarr['ID'] : 0;

  // Get selected terms from submitted dropdowns if present, otherwise fallback to current terms.
  $paper_term_id = 0;
  $ad_type_term_id = 0;

  if (isset($_POST['tax_input_paper'])) {
    $paper_term_id = (int) $_POST['tax_input_paper'];
  } elseif ($post_id > 0) {
    $paper_term_id = tomato_get_selected_term_id_from_post('paper', $post_id);
  }

  if (isset($_POST['tax_input_ad_type'])) {
    $ad_type_term_id = (int) $_POST['tax_input_ad_type'];
  } elseif ($post_id > 0) {
    $ad_type_term_id = tomato_get_selected_term_id_from_post('ad_type', $post_id);
  }

  // If not selected, block publish (prevents "unknown bucket")
  if ($paper_term_id <= 0 || $ad_type_term_id <= 0) {
    $data['post_status'] = 'draft';
    tomato_set_limit_error_notice('紙（paper）と枠タイプは必須です。選択してから公開してください。');
    return $data;
  }

  // Read limit from ad_type term meta
  $limit = get_term_meta($ad_type_term_id, TOMATO_ADTYPE_LIMIT_META_KEY, true);
  $limit = is_numeric($limit) ? (int) $limit : 0;

  // 0/empty => unlimited
  if ($limit <= 0) return $data;

  $count = tomato_count_published_ad_items($paper_term_id, $ad_type_term_id, $post_id);

  // If already reached limit, block publish
  if ($count >= $limit) {
    $paper = get_term($paper_term_id, 'paper');
    $type  = get_term($ad_type_term_id, 'ad_type');

    $paper_slug = ($paper && !is_wp_error($paper)) ? $paper->slug : '';
    $type_slug  = ($type && !is_wp_error($type)) ? $type->slug : '';

    $data['post_status'] = 'draft';
    tomato_set_limit_error_notice("上限超過のため公開できません：paper={$paper_slug}, type={$type_slug} は最大 {$limit} 件までです。");
  }

  return $data;
}, 10, 2);

//
// -----------------------------------------------------------------------------
// 4) Admin list improvements (ad_item list)
// -----------------------------------------------------------------------------

add_filter('manage_ad_item_posts_columns', function ($columns) {
  $new = [];
  foreach ($columns as $key => $label) {
    $new[$key] = $label;
    if ($key === 'title') {
      $new['paper'] = '紙';
      $new['ad_type'] = '枠タイプ';
      $new['menu_order'] = '並び順';
    }
  }
  return $new;
});

add_action('manage_ad_item_posts_custom_column', function ($column, $post_id) {
  if ($column === 'paper') {
    $terms = get_the_terms($post_id, 'paper');
    if (is_array($terms)) {
      echo esc_html(implode(', ', array_map(fn($t) => $t->slug, $terms)));
    } else {
      echo '—';
    }
    return;
  }

  if ($column === 'ad_type') {
    $terms = get_the_terms($post_id, 'ad_type');
    if (is_array($terms)) {
      echo esc_html(implode(', ', array_map(fn($t) => $t->slug, $terms)));
    } else {
      echo '—';
    }
    return;
  }

  if ($column === 'menu_order') {
    $p = get_post($post_id);
    echo $p ? (int) $p->menu_order : '—';
    return;
  }
}, 10, 2);

add_filter('manage_edit-ad_item_sortable_columns', function ($columns) {
  $columns['menu_order'] = 'menu_order';
  return $columns;
});

add_action('pre_get_posts', function ($q) {
  if (!is_admin() || !$q->is_main_query()) return;

  $screen = function_exists('get_current_screen') ? get_current_screen() : null;
  if (!$screen || $screen->post_type !== 'ad_item') return;

  if (!$q->get('orderby')) {
    $q->set('orderby', 'menu_order');
    $q->set('order', 'ASC');
  }
});
