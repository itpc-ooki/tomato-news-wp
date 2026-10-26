<?php

if (!defined('ABSPATH')) {
    fwrite(STDERR, "ERROR: WordPress is not loaded.\n");
    exit(1);
}

if (!taxonomy_exists('article_type')) {
    WP_CLI::error('The article_type taxonomy is unavailable.');
}

echo "===== CONFIGURE ICHIGO ARTICLE TYPES AND MENU =====\n";

function ichigo_menu_normalize_papers($value): array
{
    if (!is_array($value)) {
        return [];
    }

    return array_values(array_unique(array_filter(
        array_map('sanitize_key', $value)
    )));
}

function ichigo_menu_get_term_by_name(string $name)
{
    $term = get_term_by('name', $name, 'article_type');

    return ($term && !is_wp_error($term)) ? $term : null;
}

function ichigo_menu_create_term(string $name, string $slug)
{
    $result = wp_insert_term(
        $name,
        'article_type',
        ['slug' => $slug]
    );

    if (is_wp_error($result)) {
        WP_CLI::error(
            sprintf(
                'Failed to create article type "%s": %s',
                $name,
                $result->get_error_message()
            )
        );
    }

    $term = get_term((int) $result['term_id'], 'article_type');

    if (!$term || is_wp_error($term)) {
        WP_CLI::error('Failed to reload article type: ' . $name);
    }

    echo sprintf(
        "CREATED: %s (term_id=%d, slug=%s)\n",
        $term->name,
        $term->term_id,
        $term->slug
    );

    return $term;
}

function ichigo_menu_ensure_term(
    string $name,
    string $slug
) {
    $term = ichigo_menu_get_term_by_name($name);

    if (!$term) {
        $slug_term = get_term_by('slug', $slug, 'article_type');

        if ($slug_term && !is_wp_error($slug_term)) {
            WP_CLI::error(
                sprintf(
                    'Slug "%s" already belongs to "%s".',
                    $slug,
                    $slug_term->name
                )
            );
        }

        $term = ichigo_menu_create_term($name, $slug);
    } else {
        echo sprintf(
            "EXISTS: %s (term_id=%d, slug=%s)\n",
            $term->name,
            $term->term_id,
            $term->slug
        );
    }

    $papers = ichigo_menu_normalize_papers(
        get_term_meta(
            $term->term_id,
            'article_type_papers',
            true
        )
    );

/*
 * These requested terms belong exclusively to Ichigo.
 * The existing creation hook may initially assign a new term to Tomato,
 * so always normalize its ownership after creation.
 */
$desired_papers = ['ichigo'];

if ($papers !== $desired_papers) {
    update_term_meta(
        $term->term_id,
        'article_type_papers',
        $desired_papers
    );

    echo "SET ICHIGO-ONLY OWNERSHIP: {$term->name}\n";
}

    return get_term($term->term_id, 'article_type');
}

function ichigo_menu_ensure_seminar_term()
{
    $new_name = 'セミナー・産地動画';
    $new_slug = 'ichigo-seminar-production-area-video';
    $old_name = '無料セミナー動画';

    $target = ichigo_menu_get_term_by_name($new_name);

    if ($target) {
        return ichigo_menu_ensure_term(
            $new_name,
            $target->slug
        );
    }

    $old = ichigo_menu_get_term_by_name($old_name);

    if ($old) {
        $papers = ichigo_menu_normalize_papers(
            get_term_meta(
                $old->term_id,
                'article_type_papers',
                true
            )
        );

        sort($papers);

        if ($papers === ['ichigo']) {
            $slug_conflict = get_term_by(
                'slug',
                $new_slug,
                'article_type'
            );

            if (
                $slug_conflict &&
                !is_wp_error($slug_conflict) &&
                (int) $slug_conflict->term_id !== (int) $old->term_id
            ) {
                WP_CLI::error(
                    'The new Ichigo seminar slug is already in use.'
                );
            }

            $result = wp_update_term(
                $old->term_id,
                'article_type',
                [
                    'name' => $new_name,
                    'slug' => $new_slug,
                ]
            );

            if (is_wp_error($result)) {
                WP_CLI::error(
                    'Failed to rename the Ichigo seminar term: ' .
                    $result->get_error_message()
                );
            }

            echo sprintf(
                "RENAMED ICHIGO TERM: %s -> %s (term_id=%d)\n",
                $old_name,
                $new_name,
                $old->term_id
            );

            return get_term($old->term_id, 'article_type');
        }

        if (in_array('ichigo', $papers, true)) {
            WP_CLI::error(
                'The old seminar term is shared with another paper. ' .
                'No automatic rename was performed.'
            );
        }
    }

    return ichigo_menu_ensure_term($new_name, $new_slug);
}

global $wpdb;

$master_ids = $wpdb->get_col(
    $wpdb->prepare(
        "SELECT post_id
         FROM {$wpdb->postmeta}
         WHERE meta_key = %s
           AND meta_value = %s",
        'newspaper_slug',
        'ichigo'
    )
);

$master_ids = array_values(array_unique(array_map('intval', $master_ids)));

if (count($master_ids) !== 1) {
    WP_CLI::error(
        sprintf(
            'Expected exactly one Ichigo newspaper master; found %d.',
            count($master_ids)
        )
    );
}

$master_id = $master_ids[0];
$master = get_post($master_id);

if (!$master || $master->post_type !== 'newspaper') {
    WP_CLI::error('The Ichigo newspaper master is invalid.');
}

echo sprintf(
    "ICHIGO MASTER: ID=%d, title=%s\n",
    $master_id,
    $master->post_title
);

$agricultural = ichigo_menu_ensure_term(
    '日本農業新聞記事',
    'agricultural-news'
);

$helpful = ichigo_menu_ensure_term(
    'お役立ちコラム',
    'helpful-articles'
);

$seminar = ichigo_menu_ensure_seminar_term();

$original = ichigo_menu_ensure_term(
    '独自ニュース',
    'ichigo-original-news'
);

$pest = ichigo_menu_ensure_term(
    '病害虫情報',
    'ichigo-pest-information'
);

$menu_items = [
    [
        'term'  => $agricultural,
        'order' => 2,
        'url'   => './list.html?article_type=' .
            rawurlencode('日本農業新聞記事'),
    ],
    [
        'term'  => $helpful,
        'order' => 3,
        'url'   => './list.html?article_type=' .
            rawurlencode('お役立ちコラム'),
    ],
    [
        'term'  => $seminar,
        'order' => 4,
        'url'   => './web-seminar.html',
    ],
    [
        'term'  => $original,
        'order' => 5,
        'url'   => './list.html?article_type=' .
            rawurlencode('独自ニュース'),
    ],
    [
        'term'  => $pest,
        'order' => 6,
        'url'   => './pest-control.html',
    ],
];

update_post_meta($master_id, 'menu_order_featured', 1);
update_post_meta($master_id, 'menu_url_featured', './feature.html');

foreach ($menu_items as $item) {
    $key = sanitize_title($item['term']->slug);

    if ($key === '') {
        WP_CLI::error(
            'A generated menu key was empty for ' .
            $item['term']->name
        );
    }

    $suffix = str_replace('-', '_', $key);

    update_post_meta(
        $master_id,
        'menu_order_' . $suffix,
        (int) $item['order']
    );

    update_post_meta(
        $master_id,
        'menu_url_' . $suffix,
        $item['url']
    );

    echo sprintf(
        "MENU: order=%d, label=%s, url=%s\n",
        $item['order'],
        $item['term']->name,
        $item['url']
    );
}

/*
 * Remove only the obsolete Ichigo-specific seminar menu metadata.
 * This does not touch Tomato's newspaper master or Tomato terms.
 */
delete_post_meta($master_id, 'menu_order_web_seminar_2');
delete_post_meta($master_id, 'menu_url_web_seminar_2');

$hidden = get_post_meta($master_id, 'hidden_menu_items', true);
$hidden = is_array($hidden) ? $hidden : [];

$visible_keys = array_map(
    static function (array $item): string {
        return sanitize_title($item['term']->slug);
    },
    $menu_items
);

$hidden = array_values(array_filter(
    $hidden,
    static function ($key) use ($visible_keys): bool {
        return !in_array(
            sanitize_title((string) $key),
            $visible_keys,
            true
        );
    }
));

update_post_meta($master_id, 'hidden_menu_items', $hidden);

clean_post_cache($master_id);

echo "SUCCESS: Ichigo article types and menu settings are configured.\n";
