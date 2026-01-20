/**
 * Global app.js for all papers (tomato/leek/strawberry/...)
 *
 * Expected generated files:
 *  - /static/{paper}/posts.json         (list)
 *  - /static/{paper}/posts/{id}.json    (detail)
 *
 * Page detection:
 *  - /static/{paper}/index.html  -> renders into .vtile (top page) + SP lanes (.sp-lanes .tile)
 *  - /static/{paper}/list.html   -> renders .grid .tile (pagination)
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
    // Try best-effort targets on current page
    const detailTarget = getDetailContentTarget();
    const tileGrid = document.querySelector(".grid");
    const vtile = document.querySelector("a.vtile");
    const laneTile = document.querySelector(".sp-lanes .lane-track a.tile");
    const target = detailTarget || tileGrid || vtile || laneTile;
    if (!target) return;

    target.innerHTML = `<div style="color:#c00; white-space:pre-wrap;">${escapeHtml(
      msg
    )}</div>`;
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

  function resolveUrlMaybeRelative(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    try {
      return new URL(path, window.location.origin).href;
    } catch (e) {
      return path;
    }
  }

  function formatJapaneseDateFromPost(post) {
    if (post && post.date_ymd) return formatJapaneseDate(post.date_ymd);
    if (post && post.date) {
      const ymd = String(post.date).slice(0, 10);
      return formatJapaneseDate(ymd);
    }
    return "";
  }

  // ===== Added: normalize title + prefer tag text for .meta =====
  function stripHtml(text) {
    const tmp = document.createElement("div");
    tmp.innerHTML = String(text ?? "");
    return (tmp.textContent || tmp.innerText || "").trim();
  }

  function getPostTag(post) {
    // Prefer "tag-like" fields for the .meta label (do NOT fallback to date here)
    const candidates = [
      post?.tag,
      Array.isArray(post?.tags) ? post.tags[0] : null,
      post?.category,
      post?.term,
      post?.pref,
      post?.area,
    ];
    const t = candidates.find((v) => typeof v === "string" && v.trim() !== "");
    return t ? t.trim() : "記事";
  }
  // ===== End Added =====

  // ========= TOP PAGE (.vtile) RENDERING =========
  function getTopVtiles() {
    // Only anchors with class vtile (ads are divs, so they won't be touched)
    return Array.from(document.querySelectorAll("a.vtile"));
  }

  function renderTopVtiles(posts) {
    const vtiles = getTopVtiles();
    if (vtiles.length === 0) return;

    if (!Array.isArray(posts) || posts.length === 0) {
      // If no posts, hide the vtile anchors (do not touch ads)
      vtiles.forEach((a) => (a.style.display = "none"));
      return;
    }

    vtiles.forEach((a, idx) => {
      const post = posts[idx];

      // If more vtiles than posts, hide extras
      if (!post) {
        a.style.display = "none";
        return;
      }

      a.style.display = "";

      const title = stripHtml(post.title || "");
      const metaText = getPostTag(post);

      // href
      const href = post.url || `detail.html?id=${post.id}`;
      a.setAttribute("href", href);

      // image
      const imgEl = a.querySelector(".thumb img");
      const imgUrl = resolveUrlMaybeRelative(post.featured_image || "");
      if (imgEl) {
        if (imgUrl) {
          imgEl.src = imgUrl;
          imgEl.alt = title;
          imgEl.loading = "lazy";
          imgEl.style.display = "";
        } else {
          imgEl.removeAttribute("src");
          imgEl.alt = "";
          imgEl.style.display = "none";
        }
      }

      // caption (meta + title)
      const cap = a.querySelector(".cap");
      if (cap) {
        const metaEl = cap.querySelector(".meta");
        if (metaEl) metaEl.textContent = metaText;

        // In your markup: <div class="cap"><div class="meta">...</div><div>タイトル</div></div>
        // So we pick the "second div" inside .cap as title container
        const capDivs = cap.querySelectorAll("div");
        if (capDivs && capDivs.length >= 2) {
          capDivs[1].textContent = title;
        }
      }
    });
  }
  // ========= END TOP PAGE RENDERING =========

  // ========= TOP PAGE SP LANES (.sp-lanes .tile) RENDERING =========
  function getTopLaneTiles() {
    // IMPORTANT: Only inside ".sp-lanes" (so sponsor lanes in other sections are untouched)
    return Array.from(
      document.querySelectorAll(".sp-lanes .lane-track.animate-x a.tile")
    );
  }

  function renderTopLaneTiles(posts) {
    const tiles = getTopLaneTiles();
    if (tiles.length === 0) return;

    if (!Array.isArray(posts) || posts.length === 0) {
      tiles.forEach((a) => (a.style.display = "none"));
      return;
    }

    tiles.forEach((a, idx) => {
      const post = posts[idx];

      if (!post) {
        a.style.display = "none";
        return;
      }

      a.style.display = "";

      const title = stripHtml(post.title || "");
      const metaText = getPostTag(post);

      // href
      const href = post.url || `detail.html?id=${post.id}`;
      a.setAttribute("href", href);

      // image
      const imgEl = a.querySelector(".thumb img");
      const imgUrl = resolveUrlMaybeRelative(post.featured_image || "");
      if (imgEl) {
        if (imgUrl) {
          imgEl.src = imgUrl;
          imgEl.alt = title;
          imgEl.loading = "lazy";
          imgEl.style.display = "";
        } else {
          imgEl.removeAttribute("src");
          imgEl.alt = "";
          imgEl.style.display = "none";
        }
      }

      // caption (meta + title)
      const cap = a.querySelector(".cap");
      if (cap) {
        const metaEl = cap.querySelector(".meta");
        if (metaEl) metaEl.textContent = metaText;

        const capDivs = cap.querySelectorAll("div");
        if (capDivs && capDivs.length >= 2) {
          capDivs[1].textContent = title;
        }
      }
    });
  }
  // ========= END TOP PAGE SP LANES =========

  // ========= LIST TILE RENDERING (for list.html grid) =========
  function getListArticleTiles() {
    const grid = document.querySelector(".grid");
    if (!grid) return [];
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

      if (!post) {
        tile.style.display = "none";
        return;
      }

      tile.style.display = "";

      const catEl = tile.querySelector(".tile-category");
      if (catEl) catEl.textContent = post.category || "記事";

      const timeEl = tile.querySelector("time");
      if (timeEl) timeEl.textContent = formatJapaneseDateFromPost(post);

      const titleEl = tile.querySelector(".tile-title");
      if (titleEl) titleEl.textContent = post.title || "";

      const imgEl = tile.querySelector(".tile-img img");
      const imgUrl = resolveUrlMaybeRelative(post.featured_image || "");

      if (imgEl) {
        if (imgUrl) {
          imgEl.src = imgUrl;
          imgEl.alt = post.title || "";
          imgEl.loading = "lazy";
          imgEl.style.display = "";
        } else {
          imgEl.removeAttribute("src");
          imgEl.alt = "";
          imgEl.style.display = "none";
        }
      }

      const href = post.url || `detail.html?id=${post.id}`;

      tile.onclick = () => {
        window.location.href = href;
      };

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

      const url = setQueryParam("page", next);
      window.history.pushState({ page: next }, "", url);

      renderListPageState(next);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function addPageNumberButtons() {
      const maxSimple = 7;
      if (totalPages <= maxSimple) {
        for (let p = 1; p <= totalPages; p++) {
          nav.appendChild(mkBtn(String(p), p, { active: p === page }));
        }
        return;
      }

      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);

      nav.appendChild(mkBtn("1", 1, { active: page === 1 }));

      if (start > 2) nav.appendChild(mkEllipsis());

      for (let p = start; p <= end; p++) {
        nav.appendChild(mkBtn(String(p), p, { active: p === page }));
      }

      if (end < totalPages - 1) nav.appendChild(mkEllipsis());

      nav.appendChild(
        mkBtn(String(totalPages), totalPages, { active: page === totalPages })
      );
    }

    nav.appendChild(mkBtn("前へ", page - 1, { disabled: page <= 1 }));
    addPageNumberButtons();
    nav.appendChild(mkBtn("次へ", page + 1, { disabled: page >= totalPages }));

    const info = document.createElement("div");
    info.className = "pagination-info";
    const startItem = totalItems === 0 ? 0 : (page - 1) * perPage + 1;
    const endItem = Math.min(totalItems, page * perPage);
    info.textContent = `${startItem}-${endItem}件 / 全${totalItems}件`;
    nav.appendChild(info);

    window.onpopstate = (ev) => {
      const p =
        (ev && ev.state && ev.state.page) != null
          ? ev.state.page
          : getCurrentPageFromUrl();
      renderListPageState(p);
    };

    nav.dataset.totalPages = String(totalPages);
    nav.dataset.perPage = String(perPage);
  }

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

        if (timeEl) {
          const rawDate = post.date_ymd || "";
          timeEl.textContent = formatJapaneseDate(rawDate);
        }

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
      return;
    }

    // Fallback rendering
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

    // TOP page uses a.vtile
    const hasVtiles = getTopVtiles().length > 0;

    // list.html uses .grid .tile
    const hasTileGrid = !!document.querySelector(".grid .tile");

    // detail.html uses article.article-content OR #post-detail
    const isDetail = !!getDetailContentTarget();

    // Top page (index.html) -> fill .vtile + SP lanes .tile
    if (hasVtiles) {
      const url = `/static/${paper}/posts.json`;
      const posts = await fetchJson(url);
      renderTopVtiles(posts);
      renderTopLaneTiles(posts); // ✅ add: fill .sp-lanes tiles too
      return;
    }

    // List page (tile grid + pagination)
    if (hasTileGrid) {
      const url = `/static/${paper}/posts.json`;
      const posts = await fetchJson(url);

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
