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

// --------------------------------------------------
// Require Featured Image (アイキャッチ画像) for posts
// - Prevent publishing without a featured image in Gutenberg
// - Server-side safety net: revert publish to draft if missing
// --------------------------------------------------

// Gutenberg: lock "Publish/Update" until a featured image is set
add_action('admin_enqueue_scripts', function ($hook) {
  if (!in_array($hook, ['post.php', 'post-new.php'], true)) {
    return;
  }

  $screen = function_exists('get_current_screen') ? get_current_screen() : null;
  if (!$screen || $screen->post_type !== 'post') {
    return;
  }

  wp_register_script(
    'tomato-require-featured-image',
    false,
    ['wp-data', 'wp-edit-post', 'wp-notices', 'wp-i18n'],
    false,
    true
  );
  wp_enqueue_script('tomato-require-featured-image');

  $inline = <<<'JS'
(function(wp){
  if (!wp || !wp.data || !wp.data.select || !wp.data.dispatch) return;

  var lockKey = 'tomato-require-featured-image';
  var snackbarKey = 'tomato-featured-image-required-snackbar';
  var locked = false;
  var lastLocked = null; // track lock condition (not just hasFeatured)
  var wasSaving = false;

  function ensureNotice(message){
    try {
      wp.data.dispatch('core/notices').createNotice(
        'error',
        message,
        { id: lockKey, isDismissible: true }
      );
    } catch (e) {}
  }

  function removeNotice(){
    try {
      wp.data.dispatch('core/notices').removeNotice(lockKey);
    } catch (e) {}
  }

  function showSnackbar(message){
    try {
      wp.data.dispatch('core/notices').removeNotice(snackbarKey);
      wp.data.dispatch('core/notices').createNotice(
        'error',
        message,
        { id: snackbarKey, type: 'snackbar', isDismissible: true }
      );
    } catch (e) {}
  }

  function isDefined(v){
    return !(v === undefined || v === null);
  }

  function getFeaturedMediaId(editorSelect){
    // IMPORTANT:
    // Gutenberg sometimes returns `featured_media: 0` from getEditedPostAttribute
    // even when an existing post already HAS a featured image, because the value
    // is not an "edit". If we treat that 0 as truth, we incorrectly lock saving.
    // So:
    //   - If `featured_media` exists in the actual edits object => trust it (even 0)
    //   - Otherwise, fall back to current post/entity record.

    // 1) Trust explicit edits first (includes 0 when user removed the image)
    var edits = editorSelect.getPostEdits ? editorSelect.getPostEdits() : null;
    if (edits && Object.prototype.hasOwnProperty.call(edits, 'featured_media')) {
      return edits.featured_media;
    }

    // 2) If edited attribute is defined AND non-zero, it's safe to use
    var edited = editorSelect.getEditedPostAttribute
      ? editorSelect.getEditedPostAttribute('featured_media')
      : undefined;

    if (isDefined(edited) && edited !== 0) {
      return edited;
    }

    // Fallback 1: current post attribute (some WP versions)
    var currentAttr = editorSelect.getCurrentPostAttribute
      ? editorSelect.getCurrentPostAttribute('featured_media')
      : undefined;

    if (isDefined(currentAttr) && currentAttr !== 0) {
      return currentAttr;
    }

    // Fallback 2: full current post object
    var currentPost = editorSelect.getCurrentPost ? editorSelect.getCurrentPost() : null;
    if (currentPost && isDefined(currentPost.featured_media) && currentPost.featured_media !== 0) {
      return currentPost.featured_media;
    }

    // Fallback 3: entity record from core store (async)
    var postId = editorSelect.getCurrentPostId ? editorSelect.getCurrentPostId() : null;
    var postType = editorSelect.getCurrentPostType ? editorSelect.getCurrentPostType() : 'post';
    if (postId && wp.data.select('core') && wp.data.select('core').getEntityRecord) {
      var rec = wp.data.select('core').getEntityRecord('postType', postType, postId);
      if (rec && isDefined(rec.featured_media)) {
        return rec.featured_media;
      }
      // Some builds may not expose featured_media yet; try meta thumbnail id if present
      if (rec && rec.meta && isDefined(rec.meta._thumbnail_id)) {
        return rec.meta._thumbnail_id;
      }
    }

    // Fallback 3.5: edited entity record (some WP versions populate featured_media here)
    if (postId && wp.data.select('core') && wp.data.select('core').getEditedEntityRecord) {
      var erec = wp.data.select('core').getEditedEntityRecord('postType', postType, postId);
      if (erec && isDefined(erec.featured_media)) {
        return erec.featured_media;
      }
    }

    // Fallback 4: meta on edited post (some installs expose _thumbnail_id)
    var meta = editorSelect.getEditedPostAttribute ? editorSelect.getEditedPostAttribute('meta') : null;
    if (meta) {
      if (isDefined(meta._thumbnail_id)) return meta._thumbnail_id;
      if (isDefined(meta.thumbnail_id)) return meta.thumbnail_id;
    }

    // Final fallback: check DOM preview (works even if editor data store is stale)
    try {
      var img = document.querySelector(
        '.editor-post-featured-image__preview img, ' +
        '.editor-post-featured-image img, ' +
        '.editor-post-featured-image__container img, ' +
        '[aria-label*="アイキャッチ"] img, ' +
        '[aria-label*="Featured image"] img, ' +
        '.components-panel__body.is-opened .components-responsive-wrapper img'
      );
      if (img) {
        // If preview exists, treat as "has featured". Return 1 as truthy sentinel.
        return 1;
      }
    } catch (e) {}

    return 0;
  }

  function hasTitleAndContent(editorSelect){
    var title = editorSelect.getEditedPostAttribute ? (editorSelect.getEditedPostAttribute('title') || '') : '';
    title = ('' + title).trim();

    // Prefer getEditedPostContent when available
    var content = '';
    if (editorSelect.getEditedPostContent) {
      content = editorSelect.getEditedPostContent() || '';
    } else if (editorSelect.getEditedPostAttribute) {
      content = editorSelect.getEditedPostAttribute('content') || '';
    }
    content = ('' + content).trim();

    return (title.length > 0 && content.length > 0);
  }

  function shouldLockSaving(editorSelect){
    // Only enforce when title AND content exist (per your requirement)
    var ready = hasTitleAndContent(editorSelect);
    if (!ready) return false;

    var featured = getFeaturedMediaId(editorSelect);
    var hasFeatured = !!featured && featured !== 0;

    return !hasFeatured;
  }

  function applyLockState(needLock){
    if (lastLocked === needLock) return;
    lastLocked = needLock;

    if (needLock) {
      if (!locked && wp.data.dispatch('core/editor') && wp.data.dispatch('core/editor').lockPostSaving) {
        wp.data.dispatch('core/editor').lockPostSaving(lockKey);
        locked = true;
      }
      ensureNotice(wp.i18n ? wp.i18n.__('アイキャッチ画像を設定してください。', 'tomato-news-wp') : 'アイキャッチ画像を設定してください。');
    } else {
      if (locked && wp.data.dispatch('core/editor') && wp.data.dispatch('core/editor').unlockPostSaving) {
        wp.data.dispatch('core/editor').unlockPostSaving(lockKey);
        locked = false;
      }
      removeNotice();
    }
  }

  function check(){
    var editorSelect = wp.data.select('core/editor');
    if (!editorSelect || !editorSelect.getCurrentPostType) return;

    var postType = editorSelect.getCurrentPostType();
    if (postType !== 'post') return;

    var needLock = shouldLockSaving(editorSelect);
    applyLockState(needLock);

    var isSaving = editorSelect.isSavingPost ? editorSelect.isSavingPost() : false;
    var isAutosaving = editorSelect.isAutosavingPost ? editorSelect.isAutosavingPost() : false;

    // Edge: save finished (true -> false)
    if (wasSaving && !isSaving) {
      if (!isAutosaving) {
        // If user attempted to save while locked, show a snackbar explaining why.
        var lockedNow = shouldLockSaving(editorSelect);
        if (lockedNow) {
          showSnackbar(wp.i18n ? wp.i18n.__('アイキャッチ画像は必須項目です。保存できません。', 'tomato-news-wp') : 'アイキャッチ画像は必須項目です。保存できません。');
        }
      }
    }

    wasSaving = isSaving;
  }

  wp.data.subscribe(check);
  check();
})(window.wp);
JS;

  wp_add_inline_script('tomato-require-featured-image', $inline);
});

// --------------------------------------------------
// Server-side guard (REST): prevent publishing without a featured image
// - Gutenberg saves/publishes via REST.
// - IMPORTANT: Gutenberg may omit featured_media from requests even when an existing
//   post already has a featured image, so we must fall back to checking the stored thumbnail.
// --------------------------------------------------
add_filter('rest_pre_insert_post', function ($prepared_post, $request) {
  // Only for posts
  if (empty($prepared_post->post_type) || $prepared_post->post_type !== 'post') {
    return $prepared_post;
  }

  // Only when attempting to publish
  if (empty($prepared_post->post_status) || $prepared_post->post_status !== 'publish') {
    return $prepared_post;
  }

  // 1) If featured_media is present and valid, allow publish
  if (isset($request['featured_media'])) {
    $featured_media = intval($request['featured_media']);
    if ($featured_media > 0) {
      return $prepared_post;
    }
  }

  // 2) Fallback: if editing an existing post, allow publish when the stored thumbnail exists
  $post_id = 0;
  if (method_exists($request, 'get_param')) {
    $post_id = intval($request->get_param('id'));
  }
  if ($post_id <= 0 && !empty($prepared_post->ID)) {
    $post_id = intval($prepared_post->ID);
  }

  if ($post_id > 0) {
    $thumb_id = get_post_thumbnail_id($post_id);
    if (!empty($thumb_id)) {
      return $prepared_post;
    }
  }

  // Otherwise, block publishing
  return new WP_Error(
    'featured_image_required',
    'アイキャッチ画像は必須項目です。アイキャッチ画像を設定してから公開してください。',
    ['status' => 400]
  );
}, 10, 2);
