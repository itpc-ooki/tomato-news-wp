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

      [
        'key' => 'field_newspaper_hidden_menu_items',
        'label' => '非表示メニュー（グローバルメニュー）',
        'name' => 'hidden_menu_items',
        'type' => 'checkbox',
        'instructions' => "この新聞（paper）で非表示にしたいメニューを選択してください。
未選択の場合はすべて表示されます。",
        'required' => 0,
        'choices' => [
          'featured'    => '特集記事',
          'news'        => 'トマトNEWS',
          'variety'     => '品種情報',
          'cultivation' => '栽培技術',
          'market'      => '市場動向',
          'pest'        => '病害虫対策',
          'seminar'     => 'WEBセミナー',
          'column'      => 'コラム',
          'video'       => '動画',
          'paper'       => '紙面',
          'survey'      => 'JA部会アンケート',
        ],
        'layout' => 'vertical',
        'return_format' => 'value',
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
 * Admin UI: show red asterisk for required fields (品種マスタ: カテゴリ / 種苗会社)
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
