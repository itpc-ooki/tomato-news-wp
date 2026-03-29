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
    'hierarchical'      => true,              // チェックボックス表示（Gutenbergでも一覧選択式）
    'meta_box_cb'       => 'post_categories_meta_box', // チェックボックスUI（クラシックエディタ用）
    'show_in_rest'      => true,
    'rewrite'           => ['slug' => 'article-tag'],
  ]);



  // SEASON（冬春 / 夏秋）
  // - チェックボックスUIで 1つ選択（想定）
  register_taxonomy('season', ['post'], [
    'labels' => [
      'name'              => 'SEASON',
      'singular_name'     => 'SEASON',
      'menu_name'         => 'SEASON',
      'all_items'         => 'すべてのSEASON',
      'add_new_item'      => '新しいSEASONを追加',
      'edit_item'         => 'SEASONを編集',
      'update_item'       => 'SEASONを更新',
      'search_items'      => 'SEASONを検索',
    ],
    'public'            => true,
    'show_ui'           => true,
    'show_admin_column' => true,
    'hierarchical'      => true,  // チェックボックス表示
    'meta_box_cb'       => 'post_categories_meta_box', // チェックボックスUI
    'show_in_rest'      => true,
    'rewrite'           => ['slug' => 'season'],
  ]);


  // アンケート年度（JA部会アンケート詳細用）
  // - 通常投稿の JA部会アンケート記事に年度を明示的に紐付ける
  register_taxonomy('survey_year', ['post'], [
    'labels' => [
      'name'              => 'アンケート年度',
      'singular_name'     => 'アンケート年度',
      'menu_name'         => 'アンケート年度',
      'all_items'         => 'すべてのアンケート年度',
      'add_new_item'      => '新しいアンケート年度を追加',
      'edit_item'         => 'アンケート年度を編集',
      'update_item'       => 'アンケート年度を更新',
      'search_items'      => 'アンケート年度を検索',
    ],
    'public'            => true,
    'show_ui'           => true,
    'show_admin_column' => true,
    'hierarchical'      => true,
    'meta_box_cb'       => 'post_categories_meta_box',
    'show_in_rest'      => true,
    'rewrite'           => ['slug' => 'survey-year'],
  ]);

  // Region（産地）
  register_taxonomy('region', ['post'], [
    'labels' => [
      'name'              => '産地',
      'singular_name'     => '産地',
      'menu_name'         => '産地',
      'all_items'         => 'すべての産地',
      'add_new_item'      => '新しい産地を追加',
      'edit_item'         => '産地を編集',
      'update_item'       => '産地を更新',
      'search_items'      => '産地を検索',
    ],
    'public'            => true,
    'show_ui'           => true,
    'show_admin_column' => true,
    'hierarchical'      => true,  // チェックボックス表示
    'meta_box_cb'       => 'tn_region_meta_box', // チェックボックスUI
    // NOTE:
    // Block Editor (Gutenberg) renders taxonomy panels via REST.
    // For Region we need a strict single-select UI + dependent Prefecture filtering.
    // Disabling REST for these taxonomies hides the Gutenberg panels and ensures
    // the classic meta boxes (meta_box_cb) are used.
    'show_in_rest'      => false,
    'rewrite'           => ['slug' => 'region'],
  ]);

  // Prefecture（都道府県）
  register_taxonomy('prefecture', ['post'], [
    'labels' => [
      'name'              => '都道府県',
      'singular_name'     => '都道府県',
      'menu_name'         => '産地（都道府県）',
      'all_items'         => 'すべての都道府県',
      'add_new_item'      => '新しい都道府県を追加',
      'edit_item'         => '都道府県を編集',
      'update_item'       => '都道府県を更新',
      'search_items'      => '都道府県を検索',
    ],
    'public'            => true,
    'show_ui'           => true,
    'show_admin_column' => true,
    'hierarchical'      => true,  // チェックボックス表示
    'meta_box_cb'       => 'post_categories_meta_box', // チェックボックスUI
    // See Region taxonomy note above.
    'show_in_rest'      => true,
    'rewrite'           => ['slug' => 'prefecture'],
  ]);


}, 10);

// --------------------------------------------------
// Ensure default SEASON terms exist
// --------------------------------------------------
add_action('init', function () {
  if (!taxonomy_exists('season')) {
    return;
  }

  $defaults = [
    ['name' => '冬春', 'slug' => 'winter-spring'],
    ['name' => '夏秋', 'slug' => 'summer-autumn'],
  ];

  foreach ($defaults as $t) {
    if (!term_exists($t['slug'], 'season')) {
      wp_insert_term($t['name'], 'season', ['slug' => $t['slug']]);
    }
  }
}, 11);



// --------------------------------------------------
// Ensure default survey year terms exist
// --------------------------------------------------
add_action('init', function () {
  if (!taxonomy_exists('survey_year')) {
    return;
  }

  $defaults = ['2024', '2025', '2026', '2027'];
  foreach ($defaults as $year) {
    if (!term_exists($year, 'survey_year')) {
      wp_insert_term($year, 'survey_year', ['slug' => $year]);
    }
  }
}, 11);



// --------------------------------------------------
// Survey year term visibility for survey.html year tabs
// - Admin can choose which 年度 are shown in the frontend selector.
// - Backward-compatible fallback keeps 2025 / 2026 / 2027 visible until explicitly changed.
// --------------------------------------------------
function tn_survey_year_default_visible($term = null): bool {
  $slug = '';
  $name = '';

  if ($term instanceof WP_Term) {
    $slug = (string) $term->slug;
    $name = (string) $term->name;
  } elseif (is_numeric($term)) {
    $maybe_term = get_term((int) $term, 'survey_year');
    if ($maybe_term instanceof WP_Term) {
      $slug = (string) $maybe_term->slug;
      $name = (string) $maybe_term->name;
    }
  } elseif (is_string($term)) {
    $slug = $term;
    $name = $term;
  }

  $check = trim($slug !== '' ? $slug : $name);
  return in_array($check, ['2025', '2026', '2027'], true);
}

function tn_get_survey_year_front_visible($term): bool {
  $term_id = 0;
  $term_obj = null;

  if ($term instanceof WP_Term) {
    $term_id = (int) $term->term_id;
    $term_obj = $term;
  } elseif (is_numeric($term)) {
    $term_id = (int) $term;
    $maybe_term = get_term($term_id, 'survey_year');
    if ($maybe_term instanceof WP_Term) {
      $term_obj = $maybe_term;
    }
  }

  if ($term_id <= 0) {
    return tn_survey_year_default_visible($term_obj ?: $term);
  }

  $raw = get_term_meta($term_id, 'show_in_survey_selector', true);
  if ($raw === '' || $raw === null) {
    return tn_survey_year_default_visible($term_obj ?: $term_id);
  }

  return $raw === '1';
}

function tn_render_survey_year_visibility_field($term = null): void {
  $term_obj = $term instanceof WP_Term ? $term : null;
  $checked = tn_get_survey_year_front_visible($term_obj ?: 0);
  $field_name = 'show_in_survey_selector';

  if ($term_obj instanceof WP_Term) {
    wp_nonce_field('tn_save_survey_year_visibility', 'tn_survey_year_visibility_nonce');
    ?>
    <tr class="form-field term-show-in-survey-selector-wrap">
      <th scope="row"><label for="<?php echo esc_attr($field_name); ?>">survey.html 表示</label></th>
      <td>
        <label>
          <input type="checkbox" name="<?php echo esc_attr($field_name); ?>" id="<?php echo esc_attr($field_name); ?>" value="1" <?php checked($checked); ?>>
          survey.html の「年度」タブに表示する
        </label>
        <p class="description">チェックした年度だけを survey.html の年度切替に表示します。</p>
      </td>
    </tr>
    <?php
    return;
  }

  wp_nonce_field('tn_save_survey_year_visibility', 'tn_survey_year_visibility_nonce');
  ?>
  <div class="form-field term-show-in-survey-selector-wrap">
    <label for="<?php echo esc_attr($field_name); ?>">survey.html 表示</label>
    <label>
      <input type="checkbox" name="<?php echo esc_attr($field_name); ?>" id="<?php echo esc_attr($field_name); ?>" value="1">
      survey.html の「年度」タブに表示する
    </label>
    <p>チェックした年度だけを survey.html の年度切替に表示します。</p>
  </div>
  <?php
}
add_action('survey_year_add_form_fields', 'tn_render_survey_year_visibility_field');
add_action('survey_year_edit_form_fields', 'tn_render_survey_year_visibility_field');

function tn_save_survey_year_visibility_meta(int $term_id): void {
  if (!current_user_can('manage_categories')) {
    return;
  }

  if (!isset($_POST['tn_survey_year_visibility_nonce']) || !wp_verify_nonce(sanitize_text_field(wp_unslash($_POST['tn_survey_year_visibility_nonce'])), 'tn_save_survey_year_visibility')) {
    return;
  }

  $visible = isset($_POST['show_in_survey_selector']) ? '1' : '0';
  update_term_meta($term_id, 'show_in_survey_selector', $visible);
}
add_action('created_survey_year', 'tn_save_survey_year_visibility_meta');
add_action('edited_survey_year', 'tn_save_survey_year_visibility_meta');

// --------------------------------------------------
// Ensure default Region / Prefecture terms exist
// - Prefecture terms store their Region name in term meta: region_name
//   (used by cli-static-build.php to derive region when needed)
// --------------------------------------------------
add_action('init', function () {
  // Region terms
  if (taxonomy_exists('region')) {
    $regions = [
      ['name' => '北海道', 'slug' => 'hokkaido'],
      ['name' => '東北',   'slug' => 'tohoku'],
      ['name' => '関東',   'slug' => 'kanto'],
      ['name' => '中部',   'slug' => 'chubu'],
      ['name' => '近畿',   'slug' => 'kinki'],
      ['name' => '中国',   'slug' => 'chugoku'],
      ['name' => '四国',   'slug' => 'shikoku'],
      ['name' => '九州',   'slug' => 'kyushu'],
    ];

    foreach ($regions as $t) {
      if (!term_exists($t['slug'], 'region')) {
        wp_insert_term($t['name'], 'region', ['slug' => $t['slug']]);
      }
    }
  }

  // Prefecture terms (47)
  if (taxonomy_exists('prefecture')) {
    $pref_map = [
      '北海道' => [
        ['name' => '北海道', 'slug' => 'hokkaido'],
      ],
      '東北' => [
        ['name' => '青森県', 'slug' => 'aomori'],
        ['name' => '岩手県', 'slug' => 'iwate'],
        ['name' => '宮城県', 'slug' => 'miyagi'],
        ['name' => '秋田県', 'slug' => 'akita'],
        ['name' => '山形県', 'slug' => 'yamagata'],
        ['name' => '福島県', 'slug' => 'fukushima'],
      ],
      '関東' => [
        ['name' => '茨城県', 'slug' => 'ibaraki'],
        ['name' => '栃木県', 'slug' => 'tochigi'],
        ['name' => '群馬県', 'slug' => 'gunma'],
        ['name' => '埼玉県', 'slug' => 'saitama'],
        ['name' => '千葉県', 'slug' => 'chiba'],
        ['name' => '東京都', 'slug' => 'tokyo'],
        ['name' => '神奈川県', 'slug' => 'kanagawa'],
      ],
      '中部' => [
        ['name' => '新潟県', 'slug' => 'niigata'],
        ['name' => '富山県', 'slug' => 'toyama'],
        ['name' => '石川県', 'slug' => 'ishikawa'],
        ['name' => '福井県', 'slug' => 'fukui'],
        ['name' => '山梨県', 'slug' => 'yamanashi'],
        ['name' => '長野県', 'slug' => 'nagano'],
        ['name' => '岐阜県', 'slug' => 'gifu'],
        ['name' => '静岡県', 'slug' => 'shizuoka'],
        ['name' => '愛知県', 'slug' => 'aichi'],
      ],
      '近畿' => [
        ['name' => '三重県', 'slug' => 'mie'],
        ['name' => '滋賀県', 'slug' => 'shiga'],
        ['name' => '京都府', 'slug' => 'kyoto'],
        ['name' => '大阪府', 'slug' => 'osaka'],
        ['name' => '兵庫県', 'slug' => 'hyogo'],
        ['name' => '奈良県', 'slug' => 'nara'],
        ['name' => '和歌山県', 'slug' => 'wakayama'],
      ],
      '中国' => [
        ['name' => '鳥取県', 'slug' => 'tottori'],
        ['name' => '島根県', 'slug' => 'shimane'],
        ['name' => '岡山県', 'slug' => 'okayama'],
        ['name' => '広島県', 'slug' => 'hiroshima'],
        ['name' => '山口県', 'slug' => 'yamaguchi'],
      ],
      '四国' => [
        ['name' => '徳島県', 'slug' => 'tokushima'],
        ['name' => '香川県', 'slug' => 'kagawa'],
        ['name' => '愛媛県', 'slug' => 'ehime'],
        ['name' => '高知県', 'slug' => 'kochi'],
      ],
      '九州' => [
        ['name' => '福岡県', 'slug' => 'fukuoka'],
        ['name' => '佐賀県', 'slug' => 'saga'],
        ['name' => '長崎県', 'slug' => 'nagasaki'],
        ['name' => '熊本県', 'slug' => 'kumamoto'],
        ['name' => '大分県', 'slug' => 'oita'],
        ['name' => '宮崎県', 'slug' => 'miyazaki'],
        ['name' => '鹿児島県', 'slug' => 'kagoshima'],
        ['name' => '沖縄県', 'slug' => 'okinawa'],
      ],
    ];

    foreach ($pref_map as $region_name => $prefs) {
      foreach ($prefs as $t) {
        $term = term_exists($t['slug'], 'prefecture');
        if (!$term) {
          $term = wp_insert_term($t['name'], 'prefecture', ['slug' => $t['slug']]);
        }
        if (!is_wp_error($term) && isset($term['term_id'])) {
          update_term_meta((int) $term['term_id'], 'region_name', $region_name);
        }
      }
    }
  }
}, 11);




// --------------------------------------------------
// Custom meta box: Region (single select) + Prefecture filter by Region
// --------------------------------------------------

/**
 * Render Region taxonomy as single-select (radio buttons).
 * This replaces the default checkbox meta box for 'region'.
 */
function tn_region_meta_box($post, $box) {
  $taxonomy = isset($box['args']['taxonomy']) ? $box['args']['taxonomy'] : 'region';
  $tax = get_taxonomy($taxonomy);
  if (!$tax) return;

  // Nonce for save handler
  wp_nonce_field('tn_region_metabox', 'tn_region_metabox_nonce');

  // Desired display order (by term name)
  $desired_order = ['北海道', '東北', '関東', '中部', '近畿', '中国', '四国', '九州'];

  $terms = get_terms([
    'taxonomy'   => $taxonomy,
    'hide_empty' => false,
  ]);

  if (!is_wp_error($terms) && !empty($terms)) {
    usort($terms, function($a, $b) use ($desired_order) {
      $ai = array_search($a->name, $desired_order, true);
      $bi = array_search($b->name, $desired_order, true);
      $ai = ($ai === false) ? 999 : $ai;
      $bi = ($bi === false) ? 999 : $bi;
      if ($ai === $bi) {
        // Fallback stable ordering
        return strcmp((string)$a->name, (string)$b->name);
      }
      return $ai - $bi;
    });
  }

  $current_ids = wp_get_post_terms($post->ID, $taxonomy, ['fields' => 'ids']);
  $current_ids = (!is_wp_error($current_ids) && !empty($current_ids)) ? array_map('intval', (array)$current_ids) : [];

  echo '<div id="taxonomy-' . esc_attr($taxonomy) . '" class="categorydiv">';
  echo '<p style="margin:6px 0 10px; font-size:12px; color:#50575e;">複数選択できます（解除するにはチェックを外してください）。</p>';
  echo '<ul id="' . esc_attr($taxonomy) . 'checklist" class="categorychecklist form-no-clear">';

  if (!is_wp_error($terms) && !empty($terms)) {
    foreach ($terms as $t) {
      $tid = (int)$t->term_id;
      $checked = in_array($tid, $current_ids, true) ? ' checked="checked"' : '';
      echo '<li id="' . esc_attr($taxonomy) . '-' . esc_attr($tid) . '"><label class="selectit">';
      echo '<input type="checkbox" name="tax_input[' . esc_attr($taxonomy) . '][]" value="' . esc_attr($tid) . '"' . $checked . ' /> ';
      echo esc_html($t->name);
      echo '</label></li>';
    }
  }

  echo '</ul></div>';
}

/**
 * Enforce:
 * - Region: single term only
 * - Prefecture: only terms belonging to selected Region
 */
add_action('save_post', function ($post_id, $post, $update) {
  // Only for posts (same as taxonomy registration)
  if (!is_object($post) || $post->post_type !== 'post') return;

  // Autosave / permissions
  if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
  if (!current_user_can('edit_post', $post_id)) return;

  // Nonce check (only if our meta box was present)
  if (isset($_POST['tn_region_metabox_nonce']) && !wp_verify_nonce($_POST['tn_region_metabox_nonce'], 'tn_region_metabox')) {
    return;
  }

  // --- Region (multi) ---
  $region_ids = [];
  if (isset($_POST['tax_input']['region']) && is_array($_POST['tax_input']['region'])) {
    $region_ids = array_map('intval', $_POST['tax_input']['region']);
    $region_ids = array_values(array_filter($region_ids, function ($v) { return $v > 0; }));
  }

  if (!empty($region_ids)) {
    wp_set_object_terms($post_id, $region_ids, 'region', false);
  } else {
    wp_set_object_terms($post_id, [], 'region', false);
  }

  // Resolve selected region names for prefecture filtering
  $region_names = [];
  if (!empty($region_ids)) {
    $r_terms = get_terms([
      'taxonomy'   => 'region',
      'hide_empty' => false,
      'include'    => $region_ids,
    ]);
    if (!is_wp_error($r_terms) && !empty($r_terms)) {
      foreach ($r_terms as $rt) {
        if (isset($rt->name) && $rt->name !== '') $region_names[] = $rt->name;
      }
    }
  }
  $region_names = array_values(array_unique($region_names));

  // --- Prefecture (multi, filtered) ---
  if (!isset($_POST['tax_input']['prefecture']) || !is_array($_POST['tax_input']['prefecture'])) {
    // If no input, do nothing (WP will clear via its own handler when metabox is present)
    return;
  }

  $raw_ids = array_map('intval', $_POST['tax_input']['prefecture']);
  $raw_ids = array_values(array_filter($raw_ids, function ($v) { return $v > 0; }));

  // If no region selected, do NOT allow prefecture selection (clear)
  if (empty($region_names)) {
    wp_set_object_terms($post_id, [], 'prefecture', false);
    return;
  }

  $allowed_ids = [];
  foreach ($raw_ids as $pid) {
    $p_region = get_term_meta($pid, 'region_name', true);
    if ($p_region && in_array($p_region, $region_names, true)) {
      $allowed_ids[] = $pid;
    }
  }

  wp_set_object_terms($post_id, $allowed_ids, 'prefecture', false);

}, 10, 3);


/**
 * Admin UI: filter Prefecture checklist based on selected Region (radio)
 * - hides/disables prefectures not in the selected region
 */
add_action('admin_footer-post.php', 'tn_region_prefecture_admin_script');
add_action('admin_footer-post-new.php', 'tn_region_prefecture_admin_script');
function tn_region_prefecture_admin_script() {
  $screen = function_exists('get_current_screen') ? get_current_screen() : null;
  if (!$screen || $screen->base !== 'post') return;
  if ($screen->post_type !== 'post') return;

  // Build mapping: region term_id -> region name
  $region_terms = get_terms(['taxonomy' => 'region', 'hide_empty' => false]);
  $regionIdToName = [];
  if (!is_wp_error($region_terms)) {
    foreach ($region_terms as $rt) {
      $regionIdToName[(string)$rt->term_id] = $rt->name;
    }
  }

  // Build mapping: region name -> allowed prefecture term_ids
  $pref_terms = get_terms(['taxonomy' => 'prefecture', 'hide_empty' => false]);
  $regionNameToPrefIds = [];
  if (!is_wp_error($pref_terms)) {
    foreach ($pref_terms as $pt) {
      $rname = get_term_meta($pt->term_id, 'region_name', true);
      if (!$rname) continue;
      if (!isset($regionNameToPrefIds[$rname])) $regionNameToPrefIds[$rname] = [];
      $regionNameToPrefIds[$rname][] = (int)$pt->term_id;
    }
  }

  ?>
<script>
(function(){
  var prefChecklist = document.getElementById('prefecturechecklist');
  if(!prefChecklist) return;

  var regionIdToName = <?php echo wp_json_encode($regionIdToName); ?>;
  var regionNameToPrefIds = <?php echo wp_json_encode($regionNameToPrefIds); ?>;

  function ensureNotice(){
    var existing = document.getElementById('tn-prefecture-note');
    if(existing) return existing;
    var note = document.createElement('div');
    note.id = 'tn-prefecture-note';
    note.style.margin = '8px 0';
    note.style.padding = '8px 10px';
    note.style.border = '1px solid #dcdcde';
    note.style.background = '#fff';
    note.style.borderRadius = '4px';
    note.style.fontSize = '12px';
    note.style.color = '#50575e';
    note.textContent = 'まず「産地」を選択してください。選択した産地に属する都道府県のみ表示されます（複数選択可）。';
    prefChecklist.parentNode.insertBefore(note, prefChecklist);
    return note;
  }

  function getSelectedRegionIds(){
    var els = document.querySelectorAll('input[name="tax_input[region][]"]:checked');
    if(!els || !els.length) return [];
    var ids = [];
    els.forEach(function(el){
      var v = parseInt(el.value, 10);
      if(v) ids.push(v);
    });
    return ids;
  }

  function computeAllowedPrefectureIds(regionIds){
    var allowed = [];
    regionIds.forEach(function(rid){
      var rname = regionIdToName[String(rid)];
      if(!rname) return;
      var pids = regionNameToPrefIds[rname] || [];
      pids.forEach(function(pid){
        allowed.push(String(pid));
      });
    });
    // unique
    return Array.from(new Set(allowed));
  }

  function applyPrefFilter(){
    var regionIds = getSelectedRegionIds();
    var allowed = computeAllowedPrefectureIds(regionIds);

    var note = ensureNotice();
    if(regionIds.length){
      var names = regionIds.map(function(id){ return regionIdToName[String(id)] || ''; }).filter(Boolean);
      if(note) note.textContent = '都道府県（複数選択可）：' + names.join(' / ') + ' に属する都道府県のみ表示しています。';
    } else {
      if(note) note.textContent = 'まず「産地」を選択してください。選択した産地に属する都道府県のみ表示されます（複数選択可）。';
    }

    var inputs = prefChecklist.querySelectorAll('input[type="checkbox"]');
    inputs.forEach(function(cb){
      var termId = String(cb.value);
      var li = cb.closest('li');

      if(!regionIds.length){
        cb.checked = false;
        cb.disabled = true;
        if(li) li.style.display = 'none';
        return;
      }

      var ok = allowed.indexOf(termId) !== -1;
      if(ok){
        if(li) li.style.display = '';
        cb.disabled = false;
      } else {
        cb.checked = false;
        cb.disabled = true;
        if(li) li.style.display = 'none';
      }
    });
  }

  document.addEventListener('change', function(e){
    if(e.target && e.target.name === 'tax_input[region][]'){
      applyPrefFilter();
    }
  });

  applyPrefFilter();
})();
</script>
  <?php
}




// --------------------------------------------------
// Custom meta box: アンケートサンプル (single post globally)
// - Only one post can be assigned as the survey sample.
// - Shown in post side menu above the prefecture panel.
// --------------------------------------------------
function tn_render_survey_sample_meta_box($post) {
  wp_nonce_field('tn_survey_sample_metabox', 'tn_survey_sample_metabox_nonce');

  $current_value = get_post_meta($post->ID, '_tn_is_survey_sample', true);
  $is_checked = ($current_value === '1');

  $current_sample_id = 0;
  $sample_posts = get_posts([
    'post_type'      => 'post',
    'post_status'    => ['publish', 'future', 'draft', 'pending', 'private'],
    'posts_per_page' => 1,
    'post__not_in'   => [$post->ID],
    'meta_key'       => '_tn_is_survey_sample',
    'meta_value'     => '1',
    'fields'         => 'ids',
    'no_found_rows'  => true,
  ]);
  if (!empty($sample_posts)) {
    $current_sample_id = (int) $sample_posts[0];
  }

  echo '<p style="margin:0 0 10px; font-size:12px; color:#50575e;">アンケートサンプルとして使用する投稿を 1 件だけ指定できます。</p>';
  echo '<label style="display:block; margin-bottom:8px;">';
  echo '<input type="checkbox" name="tn_is_survey_sample" value="1"' . checked($is_checked, true, false) . ' /> ';
  echo 'この投稿をアンケートサンプルにする';
  echo '</label>';

  if ($current_sample_id > 0) {
    $title = get_the_title($current_sample_id);
    if (!is_string($title) || $title == '') {
      $title = '(タイトルなし)';
    }

    echo '<p style="margin:8px 0 0; font-size:12px; color:#50575e;">';
    echo '現在の設定投稿: ' . esc_html($title);
    echo '（ID: ' . esc_html((string) $current_sample_id) . '）';
    echo '</p>';
    echo '<p style="margin:6px 0 0; font-size:12px; color:#50575e;">';
    echo 'この投稿を保存してチェックを入れると、既存の設定は自動で解除されます。';
    echo '</p>';
  }
}

add_action('add_meta_boxes', function () {
  add_meta_box(
    'tn-survey-sample',
    'アンケートサンプル',
    'tn_render_survey_sample_meta_box',
    'post',
    'side',
    'high'
  );
}, 20);

add_action('save_post', function ($post_id, $post, $update) {
  if (!is_object($post) || $post->post_type !== 'post') return;
  if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return;
  if (wp_is_post_revision($post_id)) return;
  if (!current_user_can('edit_post', $post_id)) return;

  if (!isset($_POST['tn_survey_sample_metabox_nonce'])) return;
  if (!wp_verify_nonce($_POST['tn_survey_sample_metabox_nonce'], 'tn_survey_sample_metabox')) return;

  $is_sample = isset($_POST['tn_is_survey_sample']) && $_POST['tn_is_survey_sample'] === '1';

  if ($is_sample) {
    update_post_meta($post_id, '_tn_is_survey_sample', '1');

    $other_posts = get_posts([
      'post_type'      => 'post',
      'post_status'    => ['publish', 'future', 'draft', 'pending', 'private'],
      'posts_per_page' => -1,
      'post__not_in'   => [$post_id],
      'meta_key'       => '_tn_is_survey_sample',
      'meta_value'     => '1',
      'fields'         => 'ids',
      'no_found_rows'  => true,
    ]);

    if (!empty($other_posts)) {
      foreach ($other_posts as $other_post_id) {
        delete_post_meta((int) $other_post_id, '_tn_is_survey_sample');
      }
    }
  } else {
    delete_post_meta($post_id, '_tn_is_survey_sample');
  }
}, 20, 3);

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
// Hide Parent UI for article_tag (we want checkbox selection but no parent concept)
// --------------------------------------------------
add_action('admin_head-edit-tags.php', function () {
  if (!isset($_GET['taxonomy']) || !in_array($_GET['taxonomy'], ['article_tag', 'season', 'region', 'prefecture'], true)) {
    return;
  }
  echo '<style>
    .term-parent-wrap { display:none !important; }
    .column-parent { display:none !important; }
  </style>';
});

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
