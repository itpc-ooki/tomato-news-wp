/**
 * Global app.js for all papers (tomato/leek/strawberry/...)
 *
 * Expected generated files:
 *  - /static/{paper}/posts.json         (list)
 *  - /static/{paper}/posts/{id}.json    (detail)
 *
 * Page detection:
 *  - /static/{paper}/index.html  -> renders #post-list
 *  - /static/{paper}/detail.html -> renders article.article-content (preferred) OR #post-detail by ?id=
 */
(function () {
  "use strict";

  function $(sel) {
    return document.querySelector(sel);
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getPaperFromPath() {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const idx = parts.indexOf("static");
    if (idx !== -1 && parts.length >= idx + 2) return parts[idx + 1];
    return null;
  }

  function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: "no-store" });
    const contentType = res.headers.get("content-type") || "";
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}\n${text.slice(0, 200)}`);
    }

    if (contentType.includes("text/html") || text.trim().startsWith("<")) {
      throw new Error(
        `Not JSON response from ${url}\nReceived HTML (maybe redirected to WP).`
      );
    }

    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(
        `Invalid JSON from ${url}\n${String(e)}\nBody head: ${text
          .slice(0, 200)
          .replace(/\s+/g, " ")}`
      );
    }
  }

  function getDetailContentTarget() {
    const article = document.querySelector("article.article-content");
    if (article) return article;
    return $("#post-detail");
  }

  function showError(msg) {
    const listEl = $("#post-list");
    const detailTarget = getDetailContentTarget();
    const target = listEl || detailTarget;
    if (!target) return;

    target.innerHTML = `<div style="color:#c00; white-space:pre-wrap;">${escapeHtml(
      msg
    )}</div>`;
  }

  function renderList(posts, paper) {
    const el = $("#post-list");
    if (!el) return;

    if (!Array.isArray(posts) || posts.length === 0) {
      el.innerHTML = "<p>記事がありません</p>";
      return;
    }

    const html = posts
      .map((p) => {
        const id = p.id;
        const title = escapeHtml(p.title || "(no title)");
        const date = escapeHtml(p.date_ymd || "");
        const url = p.url || `detail.html?id=${id}`;
        const img = p.featured_image || "";
        const imgHtml = img
          ? `<div style="margin:6px 0;">
              <img src="${img}" alt="${title}" style="max-width:320px; width:100%; height:auto; display:block;" loading="lazy">
            </div>`
          : "";

        return `<div style="margin: 14px 0; padding: 8px 0; border-bottom: 1px solid #eee;">
          <a href="${url}">${title}</a> <span>(${date})</span>
          ${imgHtml}
        </div>`;
      })
      .join("");

    el.innerHTML = html;
  }

  function formatJapaneseDate(dateStr) {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    const y = parts[0];
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    return `${y}年${m}月${d}日`;
  }

  // ========= LIST TILE RENDERING (for list.html grid) =========
  function resolveUrlMaybeRelative(path) {
    if (!path) return "";
    // If already absolute (http/https), keep it
    if (/^https?:\/\//i.test(path)) return path;

    // Otherwise resolve relative to current origin
    // e.g. "/wp-content/uploads/..." -> "http://localhost:8080/wp-content/uploads/..."
    try {
      return new URL(path, window.location.origin).href;
    } catch (e) {
      return path;
    }
  }

  function formatJapaneseDateFromPost(post) {
    // Prefer date_ymd (YYYY-MM-DD)
    if (post && post.date_ymd) return formatJapaneseDate(post.date_ymd);

    // Fallback: ISO date like "2026-01-19T17:56:00+09:00"
    if (post && post.date) {
      const ymd = String(post.date).slice(0, 10);
      return formatJapaneseDate(ymd);
    }
    return "";
  }

  function renderListTiles(posts) {
    const grid = document.querySelector(".grid");
    if (!grid) return;

    // Only article tiles (exclude ads)
    const tiles = Array.from(grid.querySelectorAll(".tile:not(.ad)"));

    if (!Array.isArray(posts) || posts.length === 0) {
      tiles.forEach((t) => (t.style.display = "none"));
      return;
    }

    tiles.forEach((tile, idx) => {
      const post = posts[idx];

      // If there are more tiles than posts, hide extra tiles
      if (!post) {
        tile.style.display = "none";
        return;
      }

      tile.style.display = "";

      // Category (your JSON currently has no category -> fallback)
      const catEl = tile.querySelector(".tile-category");
      if (catEl) catEl.textContent = post.category || "記事";

      // Date
      const timeEl = tile.querySelector("time");
      if (timeEl) timeEl.textContent = formatJapaneseDateFromPost(post);

      // Title
      const titleEl = tile.querySelector(".tile-title");
      if (titleEl) titleEl.textContent = post.title || "";

      // Image
      const imgEl = tile.querySelector(".tile-img img");
      const imgUrl = resolveUrlMaybeRelative(post.featured_image || "");

      if (imgEl) {
        if (imgUrl) {
          imgEl.src = imgUrl;
          imgEl.alt = post.title || "";
          imgEl.loading = "lazy";
          imgEl.style.display = "";
        } else {
          // No featured image -> hide image
          imgEl.removeAttribute("src");
          imgEl.alt = "";
          imgEl.style.display = "none";
        }
      }

      // Link
      const href = post.url || `detail.html?id=${post.id}`;

      // Override old inline onclick from mockup
      tile.onclick = () => {
        window.location.href = href;
      };

      // Optional: accessibility
      tile.setAttribute("role", "link");
      tile.setAttribute("tabindex", "0");
      tile.onkeydown = (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          window.location.href = href;
        }
      };
    });
  }
  // ========= END LIST TILE RENDERING =========

  function renderDetail(post) {
    const target = getDetailContentTarget();
    if (!target) return;

    if (!post || !post.id) {
      target.innerHTML = "<p>記事が見つかりません</p>";
      return;
    }

    const hasMockArticle = !!document.querySelector("article.article-content");
    const content = post.content || "";

    if (hasMockArticle) {
      /* ===== NEW PART START ===== */

      // Title
      const titleEl = document.querySelector("h1.article-title");
      if (titleEl) {
        titleEl.textContent = post.title || "";
      }

      // Meta (date & author)
      const meta = document.querySelector(".article-meta");
      if (meta) {
        const timeEl = meta.querySelector("time");
        const spans = meta.querySelectorAll("span");

        // Date → 2026年1月15日
        if (timeEl) {
          const rawDate = post.date_ymd || "";
          timeEl.textContent = formatJapaneseDate(rawDate);
        }

        // Author
        if (spans.length >= 2) {
          spans[1].textContent = post.author ? `筆者：${post.author}` : "";
        }
      }

      // Main Image
      const mainImageBox = document.querySelector(".main-image-full img");
      if (mainImageBox && post.featured_image) {
        mainImageBox.src = post.featured_image;
        mainImageBox.alt = post.title || "";
      }

      // Article body
      target.innerHTML = content;

      /* ===== NEW PART END ===== */
      return;
    }

    // Fallback rendering (unchanged)
    const title = escapeHtml(post.title || "(no title)");
    const date = escapeHtml(post.date_ymd || "");
    const img = post.featured_image || "";
    const imgHtml = img
      ? `<div style="margin: 10px 0 14px;">
          <img src="${img}" alt="${title}" style="max-width:720px; width:100%; height:auto; display:block;">
        </div>`
      : "";

    target.innerHTML = `
      <h3>${title}</h3>
      <div style="color:#666; margin: 6px 0;">${date}</div>
      ${imgHtml}
      <div>${content}</div>
    `;
  }

  async function main() {
    const paper = getPaperFromPath();
    if (!paper) return;

    // index.html uses #post-list
    const hasPostList = !!$("#post-list");
    // list.html uses .grid .tile
    const hasTileGrid = !!document.querySelector(".grid .tile");
    // detail.html uses article.article-content OR #post-detail
    const isDetail = !!getDetailContentTarget();

    // Index (simple list)
    if (hasPostList) {
      const url = `/static/${paper}/posts.json`;
      const posts = await fetchJson(url);
      renderList(posts, paper);
      return;
    }

    // List page (tile grid)
    if (hasTileGrid) {
      const url = `/static/${paper}/posts.json`;
      const posts = await fetchJson(url);
      renderListTiles(posts);
      return;
    }

    // Detail page
    if (isDetail) {
      const id = getQueryParam("id");
      if (!id) {
        showError("Error: id is required. e.g. detail.html?id=9");
        return;
      }
      const url = `/static/${paper}/posts/${id}.json`;
      const post = await fetchJson(url);
      renderDetail(post);
      return;
    }
  }

  main().catch((e) => showError(String(e && e.message ? e.message : e)));
})();
