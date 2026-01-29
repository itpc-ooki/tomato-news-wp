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

});
