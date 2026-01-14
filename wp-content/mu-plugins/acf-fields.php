<?php
/**
 * Plugin Name: Tomato WP - ACF Fields (MU)
 * Description: Register CPT "newspaper" and ACF field groups via PHP. (Template is resolved from slug: template-{slug}-index.php)
 */

if (!defined('ABSPATH')) exit;

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
 * 2) ACF Field Group: 新聞マスタ設定
 * - ②-2方針：テンプレは管理画面で選ばない（増えるたびにchoices追加が必要になるため）
 * - slug からテンプレを自動決定:
 *   template-{slug}-index.php
 * - 出力先:
 *   /var/www/static/{output_subdir}/index.html
 *   ※ output_subdir が空なら slug を使う
 */
add_action('acf/init', function () {

  // ACFが無効の環境では何もしない
  if (!function_exists('acf_add_local_field_group')) return;

  acf_add_local_field_group([
    'key' => 'group_newspaper_master',
    'title' => '新聞マスタ設定',
    'fields' => [
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
      // 任意：表示名（テンプレ内で使いたい場合）
      [
        'key' => 'field_newspaper_display_name',
        'label' => '表示名（任意）',
        'name' => 'display_name',
        'type' => 'text',
        'instructions' => '例: トマト新聞（未入力ならタイトルを利用）',
        'required' => 0,
      ],
    ],
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
});
