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

  function setQueryParam(name, value) {
    const url = new URL(window.location.href);
    if (value === null || value === undefined || value === "") {
      url.searchParams.delete(name);
    } else {
      url.searchParams.set(name, String(value));
    }
    return url;
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

  function getListArticleTiles() {
    const grid = document.querySelector(".grid");
    if (!grid) return [];
    // Only article tiles (exclude ads)
    return Array.from(grid.querySelectorAll(".tile:not(.ad)"));
  }

  function renderListTiles(postsForThisPage) {
    const tiles = getListArticleTiles();
    if (tiles.length === 0) return;

    if (!Array.isArray(postsForThisPage) || postsForThisPage.length === 0) {
      tiles.forEach((t) => (t.style.display = "none"));
      return;
    }

    tiles.forEach((tile, idx) => {
      const post = postsForThisPage[idx];

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

  // ========= Pagination (list.html) =========
  function clampInt(n, min, max) {
    const x = Number.isFinite(n) ? n : parseInt(String(n), 10);
    if (!Number.isFinite(x)) return min;
    return Math.max(min, Math.min(max, x));
  }

  function getCurrentPageFromUrl() {
    const raw = getQueryParam("page");
    const n = parseInt(raw || "1", 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
  }

  function buildPaginationNav(totalItems, perPage, currentPage) {
    const nav = document.querySelector("nav.pagination");
    if (!nav) return;

    const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
    const page = clampInt(currentPage, 1, totalPages);

    // Clear existing hardcoded pagination (we rebuild it)
    nav.innerHTML = "";

    function mkBtn(label, pageNum, opts) {
      const b = document.createElement("button");
      b.className = "pagination-btn";
      b.type = "button";
      b.textContent = label;

      if (opts && opts.active) b.classList.add("active");
      if (opts && opts.disabled) b.disabled = true;

      if (!b.disabled && pageNum != null) {
        b.addEventListener("click", () => {
          goToPage(pageNum);
        });
      }
      return b;
    }

    function mkEllipsis() {
      const s = document.createElement("span");
      s.className = "pagination-info";
      s.textContent = "...";
      return s;
    }

    function goToPage(targetPage) {
      const next = clampInt(targetPage, 1, totalPages);

      // Update URL (?page=)
      const url = setQueryParam("page", next);
      window.history.pushState({ page: next }, "", url);

      // Re-render tiles + pagination
      renderListPageState(next);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    // Expose goToPage to inner funcs
    function addPageNumberButtons() {
      // Strategy:
      // - If <= 7 pages: show all.
      // - Else: show 1, [..window..], last with ellipsis like the mock.
      const maxSimple = 7;
      if (totalPages <= maxSimple) {
        for (let p = 1; p <= totalPages; p++) {
          nav.appendChild(mkBtn(String(p), p, { active: p === page }));
        }
        return;
      }

      const windowSize = 3; // pages around current
      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);

      // 1
      nav.appendChild(mkBtn("1", 1, { active: page === 1 }));

      // left ellipsis
      if (start > 2) nav.appendChild(mkEllipsis());

      // middle window
      for (let p = start; p <= end; p++) {
        nav.appendChild(mkBtn(String(p), p, { active: p === page }));
      }

      // right ellipsis
      if (end < totalPages - 1) nav.appendChild(mkEllipsis());

      // last
      nav.appendChild(
        mkBtn(String(totalPages), totalPages, { active: page === totalPages })
      );
    }

    // Prev
    nav.appendChild(mkBtn("前へ", page - 1, { disabled: page <= 1 }));

    // Pages
    addPageNumberButtons();

    // Next
    nav.appendChild(mkBtn("次へ", page + 1, { disabled: page >= totalPages }));

    // Range info (1-20件 / 全196件)
    const info = document.createElement("div");
    info.className = "pagination-info";
    const startItem = totalItems === 0 ? 0 : (page - 1) * perPage + 1;
    const endItem = Math.min(totalItems, page * perPage);
    info.textContent = `${startItem}-${endItem}件 / 全${totalItems}件`;
    nav.appendChild(info);

    // Handle browser back/forward
    window.onpopstate = (ev) => {
      const p =
        (ev && ev.state && ev.state.page) != null
          ? ev.state.page
          : getCurrentPageFromUrl();
      renderListPageState(p);
    };

    // Store for inner usage
    nav.dataset.totalPages = String(totalPages);
    nav.dataset.perPage = String(perPage);
  }

  // Shared state for list pagination
  let __listAllPosts = null;
  let __listPerPage = null;

  function renderListPageState(pageNum) {
    if (!Array.isArray(__listAllPosts)) return;

    const totalItems = __listAllPosts.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / __listPerPage));
    const page = clampInt(pageNum, 1, totalPages);

    const start = (page - 1) * __listPerPage;
    const end = start + __listPerPage;
    const slice = __listAllPosts.slice(start, end);

    renderListTiles(slice);
    buildPaginationNav(totalItems, __listPerPage, page);
  }
  // ========= END Pagination =========

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

    // List page (tile grid + pagination)
    if (hasTileGrid) {
      const url = `/static/${paper}/posts.json`;
      const posts = await fetchJson(url);

      // per page = number of non-ad tiles in your layout (matches mockup)
      const tiles = getListArticleTiles();
      const perPage = tiles.length > 0 ? tiles.length : 20;

      __listAllPosts = Array.isArray(posts) ? posts : [];
      __listPerPage = perPage;

      const page = getCurrentPageFromUrl();
      renderListPageState(page);
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
