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
        'choices' => [
          'large' => '大玉トマト',
          'midi' => 'ミディトマト',
          'mini' => 'ミニトマト',
          'rootstock' => '台木用トマト',
        ],
        'default_value' => 'large',
        'return_format' => 'value',
        'ui' => 1,
      ],
      [
        'key' => 'field_variety_company',
        'label' => '種苗会社',
        'name' => 'company',
        'type' => 'text',
        'default_value' => '',
        'placeholder' => '例: サカタのタネ',
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
        'key' => 'field_variety_tomv',
        'label' => 'ToMV（例: Tm-2a）',
        'name' => 'tomvType',
        'type' => 'text',
        'default_value' => '',
        'placeholder' => '例: Tm-2a',
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
