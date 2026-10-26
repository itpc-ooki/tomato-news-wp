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

/**
 * Find exactly one term with:
 * - the requested display name; and
 * - existing Ichigo ownership.
 *
 * Same-name terms owned by Tomato or another paper are ignored.
 */
function ichigo_menu_find_existing_term(string $name)
{
    $terms = get_terms([
        'taxonomy'   => 'article_type',
        'hide_empty' => false,
        'name'       => $name,
    ]);

    if (is_wp_error($terms)) {
        WP_CLI::error(
            'Failed to search article types: ' .
            $terms->get_error_message()
        );
    }

    $matches = [];

    foreach ($terms as $term) {
        if ($term->name !== $name) {
            continue;
        }

        $papers = ichigo_menu_normalize_papers(
            get_term_meta(
                $term->term_id,
                'article_type_papers',
                true
            )
        );

        if (in_array('ichigo', $papers, true)) {
            $matches[] = $term;
        }
    }

    if (count($matches) > 1) {
        WP_CLI::error(
            sprintf(
                'Multiple Ichigo article types named "%s" already exist. ' .
                'No changes were made for this menu.',
                $name
            )
        );
    }

    return $matches[0] ?? null;
}

/**
 * Choose an unused slug for a newly created Ichigo term.
 *
 * Existing terms belonging to Tomato or another paper are never modified.
 */
function ichigo_menu_choose_new_slug(string $preferred_slug): string
{
    $candidate = sanitize_title($preferred_slug);

    if ($candidate === '') {
        WP_CLI::error('The requested Ichigo term slug is empty.');
    }

    if (!get_term_by('slug', $candidate, 'article_type')) {
        return $candidate;
    }

    $base = str_starts_with($candidate, 'ichigo-')
        ? $candidate
        : 'ichigo-' . $candidate;

    $candidate = $base;
    $number = 2;

    while (get_term_by('slug', $candidate, 'article_type')) {
        $candidate = $base . '-' . $number;
        $number++;
    }

    return $candidate;
}

/**
 * Reuse an existing exact-name Ichigo term or create a missing one.
 *
 * This function never:
 * - modifies an existing term;
 * - changes existing term ownership;
 * - renames a term;
 * - deletes a term; or
 * - attaches an other-paper term to Ichigo.
 */
function ichigo_menu_ensure_term(
    string $name,
    string $preferred_slug
) {
    $existing = ichigo_menu_find_existing_term($name);

    if ($existing) {
        echo sprintf(
            "EXISTS: %s (term_id=%d, slug=%s)\n",
            $existing->name,
            $existing->term_id,
            $existing->slug
        );

        return $existing;
    }

    $new_slug = ichigo_menu_choose_new_slug($preferred_slug);

    $result = wp_insert_term(
        $name,
        'article_type',
        ['slug' => $new_slug]
    );

    if (is_wp_error($result)) {
        WP_CLI::error(
            sprintf(
                'Failed to create Ichigo article type "%s": %s',
                $name,
                $result->get_error_message()
            )
        );
    }

    $term_id = (int) $result['term_id'];

    /*
     * A creation hook may initially assign a new term to Tomato.
     * This write applies only to the newly created term.
     */
    update_term_meta(
        $term_id,
        'article_type_papers',
        ['ichigo']
    );

    $term = get_term($term_id, 'article_type');

    if (!$term || is_wp_error($term)) {
        WP_CLI::error(
            'Failed to reload newly created Ichigo term: ' .
            $name
        );
    }

    echo sprintf(
        "CREATED ICHIGO-ONLY: %s (term_id=%d, slug=%s)\n",
        $term->name,
        $term->term_id,
        $term->slug
    );

    return $term;
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

$master_ids = array_values(array_unique(array_map(
    'intval',
    $master_ids
)));

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

$menu_definitions = [
    [
        'name' => '日本農業新聞記事',
        'slug' => 'agricultural-news',
        'order' => 2,
        'url' => './list.html?article_type=' .
            rawurlencode('日本農業新聞記事'),
    ],
    [
        'name' => 'お役立ちコラム',
        'slug' => 'helpful-articles',
        'order' => 3,
        'url' => './list.html?article_type=' .
            rawurlencode('お役立ちコラム'),
    ],
    [
        'name' => 'セミナー・産地動画',
        'slug' => 'ichigo-seminar-production-area-video',
        'order' => 4,
        'url' => './web-seminar.html',
    ],
    [
        'name' => '独自ニュース',
        'slug' => 'ichigo-original-news',
        'order' => 5,
        'url' => './list.html?article_type=' .
            rawurlencode('独自ニュース'),
    ],
    [
        'name' => '病害虫情報',
        'slug' => 'ichigo-pest-information',
        'order' => 6,
        'url' => './pest-control.html',
    ],
];

$requested_menu_keys = [];

foreach ($menu_definitions as $definition) {
    $term = ichigo_menu_ensure_term(
        $definition['name'],
        $definition['slug']
    );

    $key = sanitize_title($term->slug);

    if ($key === '') {
        WP_CLI::error(
            'The generated menu key is empty for: ' .
            $definition['name']
        );
    }

    $suffix = str_replace('-', '_', $key);

    /*
     * Write only the two metadata fields belonging to this requested
     * Ichigo menu. Existing unrelated menu metadata is retained.
     */
    update_post_meta(
        $master_id,
        'menu_order_' . $suffix,
        (int) $definition['order']
    );

    update_post_meta(
        $master_id,
        'menu_url_' . $suffix,
        $definition['url']
    );

    $requested_menu_keys[] = $key;

    echo sprintf(
        "MENU: order=%d, label=%s, slug=%s, url=%s\n",
        $definition['order'],
        $term->name,
        $term->slug,
        $definition['url']
    );
}

/*
 * Make only the five requested menus visible.
 * Every unrelated hidden-menu entry is preserved.
 */
$hidden = get_post_meta(
    $master_id,
    'hidden_menu_items',
    true
);

if (is_array($hidden)) {
    $updated_hidden = array_values(array_filter(
        $hidden,
        static function ($key) use ($requested_menu_keys): bool {
            return !in_array(
                sanitize_title((string) $key),
                $requested_menu_keys,
                true
            );
        }
    ));

    if ($updated_hidden !== $hidden) {
        update_post_meta(
            $master_id,
            'hidden_menu_items',
            $updated_hidden
        );

        echo "VISIBLE: Requested Ichigo menus were removed from the hidden list.\n";
    }
}

clean_post_cache($master_id);

echo "SUCCESS: Requested Ichigo menus are configured; existing menus and other papers were retained.\n";
