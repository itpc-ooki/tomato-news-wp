<?php
/**
 * Plugin Name: トマト新聞 - コラムニスト管理
 * Description: 管理画面に「コラムニスト」メニューを追加し、コラムニスト（氏名・職業/肩書き・紹介文）を複数登録できるようにします。
 * Version: 1.1.0
 * Author: Tomato News
 */

if (!defined('ABSPATH')) {
  exit;
}

/**
 * Register Columnist post type
 * - Classic-style admin (like 市況データ): title + meta boxes (no Gutenberg block editor)
 * - 3 input fields:
 *   1) 氏名（タイトル）
 *   2) 職業 / 肩書き（メタ）
 *   3) 紹介文（メタ）
 */
add_action('init', function () {
  $labels = [
    'name'               => 'コラムニスト',
    'singular_name'      => 'コラムニスト',
    'menu_name'          => 'コラムニスト',
    'name_admin_bar'     => 'コラムニスト',
    'add_new'            => '新規追加',
    'add_new_item'       => 'コラムニストを追加',
    'new_item'           => '新しいコラムニスト',
    'edit_item'          => 'コラムニストを編集',
    'view_item'          => 'コラムニストを表示',
    'all_items'          => 'コラムニスト一覧',
    'search_items'       => 'コラムニストを検索',
    'not_found'          => 'コラムニストが見つかりませんでした。',
    'not_found_in_trash' => 'ゴミ箱にコラムニストはありません。',
  ];

  register_post_type('tomato_columnist', [
    'labels' => $labels,
    'public' => false,
    'show_ui' => true,
    'show_in_menu' => true,
    'show_in_admin_bar' => true,
    'show_in_nav_menus' => false,
    'exclude_from_search' => true,
    'publicly_queryable' => false,
    'has_archive' => false,
    'rewrite' => false,
    'menu_position' => 26,
    'menu_icon' => 'dashicons-admin-users',

    // We only need title; the rest is handled by meta boxes below.
    'supports' => ['title'],

    // Disable REST so WP uses classic editor UI by default for this CPT.
    'show_in_rest' => false,
  ]);
});

/**
 * Disable block editor for this CPT (force classic meta-box UI)
 */
add_filter('use_block_editor_for_post_type', function ($use_block_editor, $post_type) {
  if ($post_type === 'tomato_columnist') return false;
  return $use_block_editor;
}, 10, 2);

/**
 * Meta boxes: Profession + Description
 */
add_action('add_meta_boxes', function () {
  add_meta_box(
    'tomato_columnist_profession',
    '職業 / 肩書き',
    'tomato_columnist_profession_metabox_cb',
    'tomato_columnist',
    'normal',
    'high'
  );

  add_meta_box(
    'tomato_columnist_description',
    '紹介文',
    'tomato_columnist_description_metabox_cb',
    'tomato_columnist',
    'normal',
    'default'
  );
});

function tomato_columnist_profession_metabox_cb($post) {
  $value = get_post_meta($post->ID, '_tomato_columnist_profession', true);
  wp_nonce_field('tomato_columnist_save_meta', 'tomato_columnist_meta_nonce');

  echo '<p style="margin:0 0 8px;color:#555;">例：千葉大学 園芸学研究院 教授 / 農研機構 研究員 など</p>';
  echo '<input type="text" name="tomato_columnist_profession" value="' . esc_attr($value) . '" style="width:100%;max-width:680px;" />';
}

function tomato_columnist_description_metabox_cb($post) {
  $value = get_post_meta($post->ID, '_tomato_columnist_description', true);

  echo '<p style="margin:0 0 8px;color:#555;">コラムニスト紹介文を入力してください。</p>';
  echo '<textarea name="tomato_columnist_description" rows="6" style="width:100%;max-width:860px;">' . esc_textarea($value) . '</textarea>';
}

/**
 * Save meta
 */
add_action('save_post_tomato_columnist', function ($post_id, $post, $update) {
  if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
  if (wp_is_post_revision($post_id)) return;
  if (!current_user_can('edit_post', $post_id)) return;

  if (!isset($_POST['tomato_columnist_meta_nonce']) || !wp_verify_nonce($_POST['tomato_columnist_meta_nonce'], 'tomato_columnist_save_meta')) {
    return;
  }

  $profession = isset($_POST['tomato_columnist_profession']) ? sanitize_text_field(wp_unslash($_POST['tomato_columnist_profession'])) : '';
  $desc = isset($_POST['tomato_columnist_description']) ? wp_unslash($_POST['tomato_columnist_description']) : '';
  // keep line breaks; store as plain text
  $desc = trim(wp_kses_post($desc));

  update_post_meta($post_id, '_tomato_columnist_profession', $profession);
  update_post_meta($post_id, '_tomato_columnist_description', $desc);
}, 10, 3);

/**
 * Admin list columns
 */
add_filter('manage_tomato_columnist_posts_columns', function ($columns) {
  $new = [];
  foreach ($columns as $key => $label) {
    $new[$key] = $label;
    if ($key === 'title') {
      $new['tomato_columnist_profession'] = '職業 / 肩書き';
    }
  }
  return $new;
});

add_action('manage_tomato_columnist_posts_custom_column', function ($column, $post_id) {
  if ($column === 'tomato_columnist_profession') {
    $v = get_post_meta($post_id, '_tomato_columnist_profession', true);
    echo esc_html($v);
  }
}, 10, 2);

/**
 * Helper: get columnist data by IDs (max 4)
 */
function tomato_get_columnists_by_ids(array $ids) {
  $ids = array_values(array_filter(array_map('intval', $ids), function ($v) { return $v > 0; }));
  $ids = array_slice($ids, 0, 4);
  if (!$ids) return [];

  $posts = get_posts([
    'post_type' => 'tomato_columnist',
    'post__in' => $ids,
    'orderby' => 'post__in',
    'posts_per_page' => 4,
    'post_status' => 'publish',
  ]);

  $out = [];
  foreach ($posts as $p) {
    $out[] = [
      'id' => (int) $p->ID,
      'name' => get_the_title($p),
      'profession' => (string) get_post_meta($p->ID, '_tomato_columnist_profession', true),
      'description' => (string) get_post_meta($p->ID, '_tomato_columnist_description', true),
      'featured_image' => get_the_post_thumbnail_url($p->ID, 'full') ?: '',
    ];
  }
  return $out;
}
