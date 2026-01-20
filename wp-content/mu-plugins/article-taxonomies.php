<?php
/**
 * Plugin Name: Article Taxonomies
 * Description: Adds article type + article tag taxonomies shared by all papers, and hides default WP tags.
 */

// --------------------------------------------------
// Custom taxonomies
// --------------------------------------------------
add_action('init', function () {

  // 記事タイプ（チェックボックス / カテゴリー型）
  register_taxonomy('article_type', ['post'], [
    'labels' => [
      'name'              => '記事タイプ',
      'singular_name'     => '記事タイプ',
      'menu_name'         => '記事タイプ',
      'all_items'         => 'すべての記事タイプ',
      'add_new_item'      => '新しい記事タイプを追加',
      'edit_item'         => '記事タイプを編集',
      'update_item'       => '記事タイプを更新',
      'search_items'      => '記事タイプを検索',
    ],
    'public'            => true,
    'show_ui'           => true,
    'show_admin_column' => true,
    'hierarchical'      => true,  // チェックボックス（親子あり）
    'show_in_rest'      => true,
    'rewrite'           => ['slug' => 'article-type'],
  ]);

  // 記事タグ（通常のタグ型 / 親カテゴリなし）
  register_taxonomy('article_tag', ['post'], [
    'labels' => [
      'name'                       => '記事タグ',
      'singular_name'              => '記事タグ',
      'menu_name'                  => '記事タグ',
      'all_items'                  => 'すべての記事タグ',
      'edit_item'                  => '記事タグを編集',
      'update_item'                => '記事タグを更新',
      'search_items'               => '記事タグを検索',
      'popular_items'              => 'よく使われる記事タグ',
      'separate_items_with_commas' => '複数のタグはカンマで区切ってください',
      'add_or_remove_items'        => '記事タグを追加または削除',
      'choose_from_most_used'      => 'よく使われる記事タグから選択',
      'add_new_item'               => '新しい記事タグを追加',
      'new_item_name'              => '新しい記事タグ名',
    ],
    'public'            => true,
    'show_ui'           => true,
    'show_admin_column' => true,
    'hierarchical'      => false,             // ★ここが重要：タグ型（親なし）
    'meta_box_cb'       => 'post_tags_meta_box', // ★タグ用UIにする（親カテゴリ欄が消える）
    'show_in_rest'      => true,
    'rewrite'           => ['slug' => 'article-tag'],
  ]);

}, 10);

// --------------------------------------------------
// Hide default WordPress tags (post_tag)
// - Gutenbergの右サイド「タグ」を消すには、post から紐付け解除が必要
// --------------------------------------------------
add_action('init', function () {
  // これが効くとブロックエディタの「タグ」パネル自体が消えます
  if (function_exists('unregister_taxonomy_for_object_type')) {
    unregister_taxonomy_for_object_type('post_tag', 'post');
  }
}, 20);

// 左メニューの「投稿 > タグ」も消す（念のため）
add_action('admin_menu', function () {
  remove_submenu_page('edit.php', 'edit-tags.php?taxonomy=post_tag');
});

// クラシックエディタ用のタグメタボックスも消す（念のため）
add_action('add_meta_boxes', function () {
  remove_meta_box('tagsdiv-post_tag', 'post', 'side');
}, 99);
