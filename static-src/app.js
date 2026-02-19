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

  /* =====================================================================
   * WEBセミナー: Video modal globals (must be defined early)
   * - Some pages don't have certain DOM nodes used elsewhere in app.js.
   * - If any earlier logic throws, inline onclick="openVideoModal(...)" would break.
   * - So we define these globals first (no side effects unless modal elements exist).
   * ===================================================================== */
  (function ensureWebSeminarModalGlobals(){
    let __currentVideoId = "";

    function getEls(){
      return {
        modal: document.getElementById("videoModal"),
        player: document.getElementById("videoPlayer"),
      };
    }

    if (typeof window.openVideoModal !== "function") {
      window.openVideoModal = function openVideoModal(videoId){
        const els = getEls();
        if (!els.modal || !els.player) return;

        __currentVideoId = String(videoId || "");
        const embedUrl =
          "https://www.youtube.com/embed/" +
          encodeURIComponent(__currentVideoId) +
          "?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1";

        els.player.src = embedUrl;
        els.modal.classList.add("active");
        document.body.style.overflow = "hidden";
      };
    }

    if (typeof window.closeVideoModal !== "function") {
      window.closeVideoModal = function closeVideoModal(){
        const els = getEls();
        if (!els.modal || !els.player) return;
        els.modal.classList.remove("active");
        els.player.src = "";
        document.body.style.overflow = "";
      };
    }

    if (typeof window.openCurrentVideoInYouTube !== "function") {
      window.openCurrentVideoInYouTube = function openCurrentVideoInYouTube(){
        const vid = __currentVideoId;
        if (!vid) return;
        window.open("https://www.youtube.com/watch?v=" + encodeURIComponent(vid), "_blank", "noopener");
      };
    }

    // Close on overlay click / ESC (safe even if modal doesn't exist)
    function bindCloseHandlers(){
      const els = getEls();
      if (!els.modal) return;

      const closeBtn = els.modal.querySelector(".modal-close");
      if (closeBtn) closeBtn.addEventListener("click", window.closeVideoModal);

      els.modal.addEventListener("click", function(e){
        if (e.target === els.modal) window.closeVideoModal();
      });

      document.addEventListener("keydown", function(e){
        if (e.key === "Escape") window.closeVideoModal();
      });

      const ytBtn = els.modal.querySelector(".youtube-open-btn");
      if (ytBtn) ytBtn.addEventListener("click", window.openCurrentVideoInYouTube);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bindCloseHandlers);
    else bindCloseHandlers();
  })();

  /* =====================================================================
   * Common component loader (header/footer) + sticky offsets
   * (merged from /static/common/js/components.js)
   * ===================================================================== */

  // Load header component
  (async function() {
    try {
      const response = await fetch('/static/components/header.html', { cache: 'no-store' });
      const html = await response.text();
      const headerContainer = document.getElementById('header-container');
      if (headerContainer) {
        headerContainer.innerHTML = html;
        window.dispatchEvent(new CustomEvent('headerLoaded'));
      }
    } catch (error) {
      console.error('Error loading header:', error);
    }
  })();

  // Load footer component
  (async function() {
    try {
      const response = await fetch('/static/components/footer.html', { cache: 'no-store' });
      const html = await response.text();
      const footerContainer = document.getElementById('footer-container');
      if (footerContainer) {
        footerContainer.innerHTML = html;
      }
    } catch (error) {
      console.error('Error loading footer:', error);
    }
  })();


  // ===== Sticky offsets (header / kw-bar) =====
  (function () {
    "use strict";

    function setCssVar(name, value) {
      document.documentElement.style.setProperty(name, value);
    }

    function updateOffsets() {
      const header = document.querySelector("header");
      if (header) {
        const h = Math.ceil(header.getBoundingClientRect().height);
        setCssVar("--hdrH", h + "px");
        // Keep compatibility with CSS that uses --header-height
        setCssVar("--header-height", h + "px");
      }

      const kb = document.querySelector(".kw-bar");
      if (!kb) {
        document.body.classList.remove("has-kw");
        setCssVar("--kwH", "0px");
        return;
      }

      const kbStyle = window.getComputedStyle(kb);
      const isVisible = kbStyle.display !== "none" && kbStyle.visibility !== "hidden";
      if (!isVisible) {
        document.body.classList.remove("has-kw");
        setCssVar("--kwH", "0px");
        return;
      }

      const kwH = Math.ceil(kb.getBoundingClientRect().height) || 0;
      setCssVar("--kwH", kwH + "px");
      document.body.classList.add("has-kw");
    }

    const debounced = (function () {
      let t = 0;
      return function () {
        clearTimeout(t);
        t = setTimeout(updateOffsets, 100);
      };
    })();

    // Run after header is injected
    window.addEventListener("headerLoaded", function () {
      updateOffsets();
      // Images/fonts may change header height after injection
      setTimeout(updateOffsets, 0);
      setTimeout(updateOffsets, 250);
    });

    // Also run on first load (for pages that already have header in HTML)
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", updateOffsets);
    } else {
      updateOffsets();
    }

    window.addEventListener("resize", debounced);
  })();


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

  // =========================================================
  // Header account links: keep ?paper=... in sync with current paper
  // - Works on /static/{paper}/* pages (paper from path)
  // - Works on /static/account/* pages (paper from query param)
  // =========================================================
  function getCurrentPaper() {
    const fromPath = getPaperFromPath();
    // If we are on /static/account/... then the "paper" lives in query string
    if (!fromPath || fromPath === "account") {
      const qp = getQueryParam("paper");
      return qp ? String(qp) : null;
    }
    return fromPath;
  }

  function updateHeaderAccountLinks() {
    const paper = getCurrentPaper();
    if (!paper) return;

    // Variety page enhancement (clickable images)
    enhanceVarietyImageLinks();

    const loginHref = `/static/account/login.html?paper=${encodeURIComponent(paper)}`;
    const registerHref = `/static/account/register.html?paper=${encodeURIComponent(paper)}`;
    const mypageHref = `/static/account/mypage.html?paper=${encodeURIComponent(paper)}`;

    const ids = {
      loginLogoutBtn: loginHref,
      mobileLoginBtn: loginHref,
      registerBtn: registerHref,
      mobileRegisterBtn: registerHref,
      mypageBtn: mypageHref,
      mobileMypageBtn: mypageHref,
    };

    Object.keys(ids).forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      // anchors only (buttons should not exist anymore, but keep it safe)
      if (el.tagName && el.tagName.toLowerCase() === "a") {
        el.setAttribute("href", ids[id]);
      }
    });
  }

  // Run after header is injected
  window.addEventListener("headerLoaded", updateHeaderAccountLinks);

  // Also run on first load (for pages that already have header in HTML)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", updateHeaderAccountLinks);
  } else {
    updateHeaderAccountLinks();
  }


  // =========================================================
  // Header global menu visibility (per paper)
  // - Reads `menu_hidden` from /static/{paper}/placements.json
  // - Hides items that match [data-menu-key="..."] in header.html
  // =========================================================
  function updateHeaderMenuVisibility() {
    const paper = getCurrentPaper();
    if (!paper) return;

    // Variety page enhancement (clickable images)
    enhanceVarietyImageLinks();

    fetchJson(`/static/${encodeURIComponent(paper)}/placements.json`)
      .then((data) => {
        const hidden = Array.isArray(data && data.menu_hidden) ? data.menu_hidden : [];
        if (!hidden.length) return;

        hidden.forEach((key) => {
          const k = String(key || "").trim();
          if (!k) return;

          const nodes = document.querySelectorAll(`[data-menu-key="${k}"]`);
          nodes.forEach((node) => {
            const li = node.closest ? node.closest("li") : null;
            const target = li || node;
            if (target && target.style) target.style.display = "none";
          });
        });
      })
      .catch(() => {
        // placements.json may not exist; ignore
      });
  }

  // Run after header is injected
  window.addEventListener("headerLoaded", updateHeaderMenuVisibility);

  // Also run on first load (for pages that already have header in HTML)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", updateHeaderMenuVisibility);
  } else {
    updateHeaderMenuVisibility();
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


  function formatSlashDate(ymd) {
    if (!ymd) return "";
    const parts = String(ymd).split("-");
    if (parts.length !== 3) return String(ymd);
    return `${parts[0]}/${parts[1]}/${parts[2]}`;
  }

  function formatSlashDateFromPost(post) {
    if (post && post.date_ymd) return formatSlashDate(post.date_ymd);
    if (post && post.date) return formatSlashDate(String(post.date).slice(0, 10));
    return "";
  }

  function buildNewsCard(post) {
    const article = document.createElement("article");
    article.className = "card";

    const href = post.url || `detail.html?id=${post.id}`;
    article.setAttribute("role", "link");
    article.setAttribute("tabindex", "0");
    article.addEventListener("click", () => {
      window.location.href = href;
    });
    article.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        window.location.href = href;
      }
    });

    const imgWrap = document.createElement("div");
    imgWrap.className = "image";
    const img = document.createElement("img");
    const title = stripHtml(post.title || "");
    const imgUrl = resolveUrlMaybeRelative(post.featured_image || "");
    if (imgUrl) {
      img.src = imgUrl;
      img.alt = title;
      img.loading = "lazy";
    } else {
      // keep layout but avoid broken image icon
      img.alt = "";
      img.style.display = "none";
    }
    imgWrap.appendChild(img);

    const body = document.createElement("div");
    body.className = "body";

    const meta = document.createElement("div");
    meta.className = "meta";
    const dateText = formatSlashDateFromPost(post);
    const typeText = post.article_type ? String(post.article_type) : "";
    meta.textContent = typeText ? `${dateText} / ${typeText}` : dateText;

    const h3 = document.createElement("h3");
    h3.textContent = title;

    body.appendChild(meta);
    body.appendChild(h3);

    article.appendChild(imgWrap);
    article.appendChild(body);

    return article;
  }

  
async function renderNewsSection(posts, paper) {
  const section = document.getElementById("news");
  const grid = document.querySelector("#news .grid");
  if (!grid) return;

  const all = Array.isArray(posts) ? posts : [];
  const newsPosts = all.filter((p) => p && p.article_type === "ニュース");

  // Load PR from placements.json (if available)
  let prItems = [];
  try {
    const placements = await fetchJson(`/static/${paper}/placements.json`);
    prItems = Array.isArray(placements && placements.pr) ? placements.pr : [];
  } catch (e) {
    // Keep working even if placements.json is missing
    prItems = [];
  }

  const prCount = prItems.length;

  // If nothing to show, hide whole section
  if (newsPosts.length === 0 && prCount === 0) {
    if (section) section.style.display = "none";
    return;
  }
  if (section) section.style.display = "";

  function buildNativePrCard(item) {
    const a = document.createElement("a");
    a.className = "native-card";
    a.href = item && item.url ? String(item.url) : "#";
    a.target = "_blank";
    a.rel = "noopener";
    a.setAttribute("aria-label", "記事タイアップ（PR）へ");

    const title = stripHtml(item && item.title ? item.title : "");
    const imgUrl = resolveUrlMaybeRelative(item && item.image ? item.image : "");

    const badge = document.createElement("div");
    badge.className = "badge";
    badge.textContent = "PR";

    const image = document.createElement("div");
    image.className = "image";
    const img = document.createElement("img");
    if (imgUrl) img.src = imgUrl;
    img.alt = title;
    img.loading = "lazy";
    image.appendChild(img);

    const body = document.createElement("div");
    body.className = "body";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = "記事広告／タイアップ";

    const h3 = document.createElement("h3");
    h3.textContent = title || "PR";

    body.appendChild(meta);
    body.appendChild(h3);

    a.appendChild(badge);
    a.appendChild(image);
    a.appendChild(body);

    return a;
  }

  // Decide how many news cards to show
  let newsToShow = [];

  if (prCount > 0) {
    const total = 8;
    const prToUse = prItems.slice(0, total);
    const maxNews = Math.max(0, total - prToUse.length);
    newsToShow = newsPosts.slice(0, maxNews);

    // Rebuild grid deterministically:
    // - If there is at least 1 "ニュース", place the first PR right after the first news card
    // - If there are 2+ PR items, place the remaining PR items at the very end
    //   (this avoids PR being side-by-side near the top and keeps placement stable)
    grid.innerHTML = "";

    const firstNews = newsToShow.length > 0 ? newsToShow[0] : null;
    const remainingNews = newsToShow.length > 1 ? newsToShow.slice(1) : [];

    const firstPr = prToUse.length > 0 ? prToUse[0] : null;
    const remainingPr = prToUse.length > 1 ? prToUse.slice(1) : [];

    if (firstNews) grid.appendChild(buildNewsCard(firstNews));
    if (firstPr && firstNews) {
      // Place first PR as the 2nd item (after the first news card)
      grid.appendChild(buildNativePrCard(firstPr));
    }

    // If there are no news cards, just render PR(s) normally
    if (!firstNews && firstPr) {
      grid.appendChild(buildNativePrCard(firstPr));
    }

    remainingNews.forEach((p) => grid.appendChild(buildNewsCard(p)));

    // If there are multiple PR items, keep the remaining PR items at the end
    remainingPr.forEach((pr) => grid.appendChild(buildNativePrCard(pr)));

    return;
  }

  // No PR:
  // - If news < 6 -> show only news (all)
  // - Else -> cap to 8
  if (newsPosts.length < 6) {
    newsToShow = newsPosts;
  } else {
    newsToShow = newsPosts.slice(0, 8);
  }

  grid.innerHTML = "";
  newsToShow.forEach((p) => grid.appendChild(buildNewsCard(p)));
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
      if (catEl) catEl.textContent = post.article_type || post.category || "";

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

  
  // =========================================================
  // ✅ Detail: render Article Tags (記事タグ)
  // - Reads taxonomy data exported by cli-static-build.php:
  //   post.article_tags: [{name, slug}, ...]
  // - Renders into #article-tags in detail.html
  // - Hides the whole tag row when there are no tags
  // =========================================================
  function normalizeArticleTags(post) {
    const raw = post && (post.article_tags || post.article_tag || post.tags);
    if (!raw) return [];

    // [{name, slug}]
    if (Array.isArray(raw)) {
      const out = [];
      raw.forEach((t) => {
        if (!t) return;
        if (typeof t === "string") {
          const name = t.trim();
          if (name) out.push({ name, slug: "" });
          return;
        }
        if (typeof t === "object") {
          const name = typeof t.name === "string" ? t.name.trim() : "";
          const slug = typeof t.slug === "string" ? t.slug.trim() : "";
          if (name) out.push({ name, slug });
        }
      });
      // de-dup by name
      const seen = new Set();
      return out.filter((x) => {
        const key = x.name;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    // "tag1,tag2" or single string
    if (typeof raw === "string") {
      return raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((name) => ({ name, slug: "" }));
    }

    return [];
  }

  function renderArticleTags(post) {
    const container = document.getElementById("article-tags");
    if (!container) return;

    const tags = normalizeArticleTags(post);

    // Clear old
    container.innerHTML = "";

    // Hide the whole block (the parent is the row wrapper in detail.html)
    const row = container.parentElement;
    if (!tags.length) {
      if (row) row.style.display = "none";
      return;
    }
    if (row) row.style.display = "";

    // Render tags using CSS classes (match mockup: <a class="tag">...</a>)
    tags.forEach((t) => {
      const a = document.createElement("a");
      a.textContent = t.name;
      a.className = "tag";
      a.setAttribute("href", "#");
      if (t.slug) a.dataset.slug = t.slug;
      container.appendChild(a);
    });
  }


  // =========================================================
  // ✅ Detail: render 参考資料 / 執筆者
  // - Reads exported fields from cli-static-build.php:
  //   post.reference_materials (string)
  //   post.writer_name (string)
  // - Renders into #reference-text and #writer-text in detail.html
  // - Hides each block when empty
  // =========================================================
  function renderReferenceAndWriter(post) {
    const refBox = document.getElementById("reference-box");
    const refText = document.getElementById("reference-text");
    const writerBox = document.getElementById("writer-box");
    const writerText = document.getElementById("writer-text");

    const refRaw = post && (post.reference_materials || post.reference || post.refs || "");
    const writerRaw = post && (post.writer_name || post.writer || "");

    const ref = typeof refRaw === "string" ? refRaw.trim() : "";
    const writer = typeof writerRaw === "string" ? writerRaw.trim() : "";

    if (refBox) {
      if (!ref) {
        refBox.style.display = "none";
      } else {
        refBox.style.display = "";
        if (refText) {
          let html = escapeHtml(ref).replace(/\n/g, "<br>");
          // Allow <br> from ACF "new_lines=br"
          html = html.replace(/&lt;br\s*\/?&gt;/gi, "<br>");
          refText.innerHTML = html;
        }
      }
    }

    if (writerBox) {
      if (!writer) {
        writerBox.style.display = "none";
      } else {
        writerBox.style.display = "";
        if (writerText) writerText.textContent = writer;
      }
    }
  }



  // =========================================================
  // Member-only gating (per post flag)
  // - If post.free_viewable === 1 (or true): show full content even if not logged in
  // - Else: show teaser (~10%) for non-logged-in users, and show gate UI
  // =========================================================
  function isUserLoggedIn() {
    try {
      // If some page exposes a global helper, prefer it
      if (typeof window.isUserLoggedIn === "function") {
        return !!window.isUserLoggedIn();
      }

      // Our account system (auth.js) exposes TomatoAuth and stores session in web storage
      if (window.TomatoAuth) {
        if (typeof window.TomatoAuth.currentUser === "function") {
          const u = window.TomatoAuth.currentUser();
          if (u && (u.email || u.id || u.name)) return true;
        }
        if (typeof window.TomatoAuth.isLoggedIn === "function") {
          return !!window.TomatoAuth.isLoggedIn();
        }
      }

      // Legacy / other auth helper (if present)
      if (window.TOMATO_AUTH && typeof window.TOMATO_AUTH.isLoggedIn === "function") {
        return !!window.TOMATO_AUTH.isLoggedIn();
      }

      // Directly check the session keys used by auth.js (works even if auth.js loads later)
      try {
        const ls = window.localStorage;
        const ss = window.sessionStorage;
        const email1 = ls ? ls.getItem("tomato_session_email_v1") : "";
        const email2 = ss ? ss.getItem("tomato_session_email_session_v1") : "";
        if ((email1 && email1.trim()) || (email2 && email2.trim())) return true;
      } catch (e2) {
        // ignore storage access errors
      }

      // WordPress sets "wordpress_logged_in_*" cookie after WP login (fallback)
      const c = String(document.cookie || "");
      return /wordpress_logged_in_/i.test(c);
    } catch (e) {
      return false;
    }
  }

  function isFreeViewable(post) {
    const v = post && post.free_viewable;
    return v === 1 || v === true || v === "1";
  }

  function shouldGatePost(post) {
    return !!post && !isFreeViewable(post) && !isUserLoggedIn();
  }

  

  // If auth.js loads after app.js (common when header is injected),
  // the first render may incorrectly show the paywall even though the user is logged in.
  // This helper re-checks login shortly after and re-renders the full article when login becomes true.
  function maybeUngateDetailAfterLogin(post, fullHtml, target) {
    if (!post || !target) return;

    function tryUngate() {
      if (!isUserLoggedIn()) return false;

      target.classList.remove("is-paywalled");
      target.innerHTML = fullHtml;

      hidePaywallGate();
      setAncillaryDetailVisibility(true);

      // Keep ancillary blocks consistent with the full view
      renderReferenceAndWriter(post);
      renderArticleTags(post);

      return true;
    }

    // Try immediately (next tick) and again after header injection
    setTimeout(tryUngate, 0);
    window.addEventListener("headerLoaded", tryUngate);

    // Also poll briefly (covers cases where storage is written slightly later)
    let attempts = 0;
    const timer = setInterval(function () {
      attempts += 1;
      if (tryUngate() || attempts >= 15) clearInterval(timer); // ~3 seconds max
    }, 200);
  }

  // =========================================================
  // Paywall state sync (fix for: already logged-in users still seeing gate)
  // - Stores last rendered detail post so we can re-evaluate after auth.js loads
  // - Re-runs when:
  //    * headerLoaded (header injection can load auth.js later)
  //    * authChanged (login/logout on other pages, then navigate back)
  // =========================================================
  const __PAYWALL_STATE = {
    post: null,
    fullHtml: "",
    target: null,
    isMock: false,
  };

  function syncPaywallState() {
    try {
      const st = __PAYWALL_STATE;
      if (!st.post || !st.target) return;

      // Only apply on detail pages where we rendered mock article
      if (!st.isMock) return;

      const wantGate = shouldGatePost(st.post);
      const isPaywalled = st.target.classList.contains("is-paywalled");

      if (!wantGate && isPaywalled) {
        // Logged in (or free viewable) -> show full and hide gate
        st.target.classList.remove("is-paywalled");
        st.target.innerHTML = st.fullHtml;

        hidePaywallGate();
        setAncillaryDetailVisibility(true);

        renderReferenceAndWriter(st.post);
        renderArticleTags(st.post);
        return;
      }

      if (wantGate && !isPaywalled) {
        // Not logged in -> show teaser and gate
        st.target.classList.add("is-paywalled");
        st.target.innerHTML = buildTeaserHtmlFromFullHtml(st.fullHtml, 2);

        renderPaywallGate(st.post);
        showPaywallGate();
        setAncillaryDetailVisibility(false);

        // keep trying to ungate if auth becomes available
        maybeUngateDetailAfterLogin(st.post, st.fullHtml, st.target);
      }
    } catch (_e) {
      // no-op
    }
  }

  // Re-check after header injection and after auth changes
  window.addEventListener("headerLoaded", syncPaywallState);
  window.addEventListener("authChanged", syncPaywallState);

function buildTeaserHtmlFromFullHtml(fullHtml, ratioOrCount) {
    // Requirement:
    // - For member-only posts viewed by non-logged-in users, show only the "top 2 tags" of the post content,
    //   then display the paywall gate (login/register).
    //
    // Backward compatible behavior:
    // - If ratioOrCount is <= 1, treat it as a ratio (legacy teaser behavior).
    // - If ratioOrCount is > 1, treat it as the number of top-level nodes to show.
    const arg = typeof ratioOrCount === "number" ? ratioOrCount : 0.10;

    const tmp = document.createElement("div");
    tmp.innerHTML = String(fullHtml || "");

    const nodes = Array.from(tmp.childNodes).filter((n) => {
      // ignore empty text nodes
      if (n.nodeType === Node.TEXT_NODE) {
        return (String(n.textContent || "").trim()).length > 0;
      }
      return true;
    });

    // If we don't have enough structure, just return original (gate will still show below).
    if (!nodes.length) return String(fullHtml || "");

    // New spec: show top N tags (top-level nodes)
    if (arg > 1) {
      const count = Math.max(1, Math.min(10, Math.floor(arg)));
      const out = document.createElement("div");
      for (let i = 0; i < Math.min(count, nodes.length); i++) {
        out.appendChild(nodes[i].cloneNode(true));
      }
      return out.innerHTML;
    }

    // Legacy: ratio-based teaser (~10%)
    const r = Math.max(0.05, Math.min(0.3, arg));
    const totalText = (tmp.textContent || "").trim();
    const totalLen = totalText.length;

    // If content is very short, don't bother truncating (still show gate below)
    if (!totalLen || totalLen < 200) {
      return String(fullHtml || "");
    }

    const targetLen = Math.max(200, Math.floor(totalLen * r));

    const out = document.createElement("div");
    let acc = 0;

    // Copy top-level nodes until we reach target text length
    for (const n of nodes) {
      const clone = n.cloneNode(true);
      out.appendChild(clone);
      acc += ((clone.textContent || "").trim()).length;
      if (acc >= targetLen) break;
    }

    return out.innerHTML;
  }

  function ensurePaywallGateNode() {
    let gate = document.getElementById("paywall-gate");
    if (gate) return gate;

    gate = document.createElement("div");
    gate.id = "paywall-gate";
    gate.className = "paywall-gate";
    document.body.appendChild(gate);
    return gate;
  }

  function renderPaywallGate(post) {
    const gate = ensurePaywallGateNode();

    // Place gate after the article on detail page (if possible)
    const article = document.querySelector("article.article-content");
    const mainContent = document.querySelector(".main-content");
    if (article && article.parentNode) {
      // If gate is not right after article, move it
      if (article.nextSibling !== gate) {
        article.parentNode.insertBefore(gate, article.nextSibling);
      }
    } else if (mainContent) {
      mainContent.appendChild(gate);
    }

    const paper = getCurrentPaper() || "tomato";
    const loginHref = `/static/account/login.html?paper=${encodeURIComponent(paper)}`;
    const registerHref = `/static/account/register.html?paper=${encodeURIComponent(paper)}`;

    gate.innerHTML = `
      <div class="paywall-inner">
        <div class="paywall-lock" aria-hidden="true">🔒</div>
        <div class="paywall-text">
          <div class="paywall-title">この記事は会員限定記事です</div>
          <div class="paywall-subtitle">登録すると続き（全文）をお読みいただけます。</div>
        </div>
        <div class="paywall-actions">
          <a class="paywall-btn paywall-btn-register" href="${registerHref}">★ 新規会員登録（無料）</a>
          <a class="paywall-btn paywall-btn-login" href="${loginHref}">→ ログイン</a>
        </div>
      </div>
    `;
  }

  function hidePaywallGate() {
    const gate = document.getElementById("paywall-gate");
    if (gate) gate.style.display = "none";
  }

  function showPaywallGate() {
    const gate = document.getElementById("paywall-gate");
    if (gate) gate.style.display = "";
  }

  function setAncillaryDetailVisibility(isVisible) {
    // Hide sections that should not be shown on teaser view
    const ids = ["reference-box", "writer-box", "article-tags"];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      // article-tags is inside tags section; hide whole tags section for neatness
      if (id === "article-tags") {
        const section = el.closest ? el.closest(".tags-section") : null;
        (section || el).style.display = isVisible ? "" : "none";
      } else {
        el.style.display = isVisible ? "" : "none";
      }
    });
  }

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

        // Category badge (記事タイプ)
        // detail.html has a placeholder text, but we always override it with JSON value when available.
        if (spans.length >= 1) {
          spans[0].textContent = post.article_type ? String(post.article_type) : spans[0].textContent;
        }

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

      // Article body (member gating if needed)
      const fullHtml = content;

      // Store for later re-check (auth.js may load after app.js)
      try {
        __PAYWALL_STATE.post = post;
        __PAYWALL_STATE.fullHtml = fullHtml;
        __PAYWALL_STATE.target = target;
        __PAYWALL_STATE.isMock = true;
        // next tick sync (covers cases where auth is already ready)
        setTimeout(syncPaywallState, 0);
      } catch (_e) {}
      if (shouldGatePost(post)) {
        target.classList.add("is-paywalled");
        target.innerHTML = buildTeaserHtmlFromFullHtml(fullHtml, 2);
        renderPaywallGate(post);
        showPaywallGate();
        setAncillaryDetailVisibility(false);
        maybeUngateDetailAfterLogin(post, fullHtml, target);
      } else {
        target.classList.remove("is-paywalled");
        target.innerHTML = fullHtml;
        hidePaywallGate();
        setAncillaryDetailVisibility(true);
      }


      // ✅ Reference materials / writer
      renderReferenceAndWriter(post);

      // ✅ Article tags
      renderArticleTags(post);
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

    // ✅ Article tags
    renderArticleTags(post);
  }

  // =========================================================
  // ✅ Added: Market.json rendering for index.html
  // - Updates existing DOM ids in index.html (PC + SP)
  // - Does NOT touch other pages
  // =========================================================
  function hasMarketUi() {
    return (
      !!document.querySelector(".market-carousel") ||
      !!document.querySelector(".sp-only-market") ||
      !!document.querySelector("[id^='price-'][id$='-sp']") ||
      !!document.querySelector("[id^='price-']")
    );
  }

  function mapVarietyKeyToCode(varietyKey) {
    // Based on your current index.html IDs:
    // big -> 34400, mid -> 34480, mini -> 34460, first -> 34410
    switch (String(varietyKey || "").toLowerCase()) {
      case "big":
        return "34400";
      case "mid":
        return "34480";
      case "mini":
        return "34460";
      case "first":
        return "34410";
      default:
        return null;
    }
  }

  function normalizeTrend(trend, diff) {
    const t = String(trend || "").toLowerCase();
    if (t === "up" || t === "down" || t === "same" || t === "none") return t;

    // fallback from diff
    const n = typeof diff === "number" ? diff : parseFloat(String(diff || ""));
    if (!Number.isFinite(n)) return "none";
    if (n > 0) return "up";
    if (n < 0) return "down";
    return "same";
  }

  function applyTrendUi(changeEl, trend, diff) {
    if (!changeEl) return;

    const t = normalizeTrend(trend, diff);

    // remove existing trend-* classes (safe even if not present)
    changeEl.classList.remove("trend-up", "trend-down", "trend-same");

    const iconEl = changeEl.querySelector(".change-icon");
    const valueEl = changeEl.querySelector(".change-value");

    if (t === "up") {
      changeEl.classList.add("trend-up");
      if (iconEl) iconEl.textContent = "↗";
      if (valueEl)
        valueEl.textContent =
          typeof diff === "number" ? String(Math.abs(diff)) : "—";
      return;
    }

    if (t === "down") {
      changeEl.classList.add("trend-down");
      if (iconEl) iconEl.textContent = "↘";
      if (valueEl)
        valueEl.textContent =
          typeof diff === "number" ? String(Math.abs(diff)) : "—";
      return;
    }

    if (t === "same") {
      changeEl.classList.add("trend-same");
      if (iconEl) iconEl.textContent = "→";
      if (valueEl)
        valueEl.textContent =
          typeof diff === "number" ? String(Math.abs(diff)) : "0";
      return;
    }

    // none (no data)
    if (iconEl) iconEl.textContent = "—";
    if (valueEl) valueEl.textContent = "—";
  }

  function setTextById(id, value) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = value;
  }

  function renderMarketDataIntoDom(market) {
    if (!market || !Array.isArray(market.items)) return;

    // Update "market-date" text (PC and SP blocks share the same class)
    const asOf = market.as_of ? formatJapaneseDate(String(market.as_of)) : "";
    const unitPrice =
      market.unit && market.unit.price ? String(market.unit.price) : "円/kg";
    const dateLabel = asOf
      ? `${asOf}現在 / 日農平均価格（${unitPrice}）`
      : `— / 日農平均価格（${unitPrice}）`;

    document.querySelectorAll(".market-date").forEach((el) => {
      el.textContent = dateLabel;
    });

    market.items.forEach((item) => {
      const code = mapVarietyKeyToCode(item && item.variety_key);
      if (!code) return;

      const price = typeof item.price === "number" ? String(item.price) : "—";
      const volume = typeof item.volume === "number" ? String(item.volume) : "—";

      // PC ids
      setTextById(`price-${code}`, price);
      setTextById(`quantity-${code}`, volume);

      const pcChange = document.getElementById(`change-${code}`);
      applyTrendUi(pcChange, item.trend, item.diff);

      // SP ids
      setTextById(`price-${code}-sp`, price);
      setTextById(`quantity-${code}-sp`, volume);

      const spChange = document.getElementById(`change-${code}-sp`);
      applyTrendUi(spChange, item.trend, item.diff);
    });
  }

  async function loadAndRenderMarketJson(paper) {
    // Only for pages that actually have market UI
    if (!hasMarketUi()) return;

    const url = `/static/${paper}/market.json`;
    try {
      const market = await fetchJson(url);
      renderMarketDataIntoDom(market);
    } catch (e) {
      // Do not break the page; just log
      console.warn("[market.json] failed:", e && e.message ? e.message : e);
    }
  }
  // =========================================================
  // ✅ End Added: Market.json rendering
  // =========================================================

  // =========================================================
  // ✅ Added: placements.json rendering for sponsor videos (index.html)
  // - Renders placements.json "sponsor_videos" into #laneTrackVideo under #sponsor-ads
  // - If sponsor_videos is 0/undefined -> hides #sponsor-ads
  // - Keeps existing hard-coded markup as fallback (we clear & rebuild only when data exists)
  // =========================================================
  function hasSponsorAdsUi() {
    return (
      !!document.getElementById("laneTrackVideo") &&
      !!document.getElementById("sponsor-ads")
    );
  }

  function buildSponsorVideoTile(item) {
    const a = document.createElement("a");
    a.className = "tile";
    a.href = item && item.url ? String(item.url) : "#";
    a.target = "_blank";
    a.rel = "noopener";

    const title = stripHtml(item && item.title ? item.title : "");
    const imgUrl = resolveUrlMaybeRelative(item && item.image ? item.image : "");

    const thumb = document.createElement("div");
    thumb.className = "thumb";

    const img = document.createElement("img");
    if (imgUrl) img.src = imgUrl;
    img.alt = title;
    img.loading = "lazy";
    thumb.appendChild(img);

    const cap = document.createElement("div");
    cap.className = "cap";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = "PR";

    const capTitle = document.createElement("div");
    capTitle.textContent = title;

    cap.appendChild(meta);
    cap.appendChild(capTitle);

    a.appendChild(thumb);
    a.appendChild(cap);

    return a;
  }

  function renderSponsorVideosIntoDom(placements) {
    if (!hasSponsorAdsUi()) return;

    const section = document.getElementById("sponsor-ads");
    const track = document.getElementById("laneTrackVideo");
    if (!section || !track) return;

    const items = Array.isArray(placements && placements.sponsor_videos)
      ? placements.sponsor_videos
      : [];

    if (items.length === 0) {
      // If no sponsor videos, hide entire section
      section.style.display = "none";
      return;
    }

    // Show section if it was hidden
    section.style.display = "";

    // Clear current hard-coded tiles and rebuild with JSON data
    track.innerHTML = "";
    items.forEach((item) => {
      track.appendChild(buildSponsorVideoTile(item));
    });
  }

  // =========================================================
  // ✅ Added: placements.json rendering for sponsor ads (index.html)
  // - Renders placements.json "sponsor_ads" into <section id="newspaper-ads"> .grid a.card
  // - If sponsor_ads is 0/undefined -> hides #newspaper-ads
  // - Uses existing <a class="card"> as placeholders; creates more if needed
  // =========================================================
  function hasNewspaperAdsUi() {
    return (
      !!document.querySelector("#newspaper-ads .grid") &&
      !!document.getElementById("newspaper-ads")
    );
  }

  function buildSponsorAdCard(item) {
    const a = document.createElement("a");
    a.className = "card";
    a.href = item && item.url ? String(item.url) : "#";
    a.target = "_blank";
    a.rel = "noopener";

    const title = stripHtml(item && item.title ? item.title : "");
    const imgUrl = resolveUrlMaybeRelative(item && item.image ? item.image : "");

    const imgWrap = document.createElement("div");
    imgWrap.className = "image";

    const img = document.createElement("img");
    if (imgUrl) img.src = imgUrl;
    img.alt = title;
    img.loading = "lazy";
    imgWrap.appendChild(img);

    const body = document.createElement("div");
    body.className = "body";

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = "スポンサー";

    const h3 = document.createElement("h3");
    h3.textContent = title;

    body.appendChild(meta);
    body.appendChild(h3);

    a.appendChild(imgWrap);
    a.appendChild(body);

    return a;
  }

  function renderNewspaperSponsorAdsIntoDom(placements) {
    if (!hasNewspaperAdsUi()) return;

    const section = document.getElementById("newspaper-ads");
    const grid = document.querySelector("#newspaper-ads .grid");
    if (!section || !grid) return;

    const items = Array.isArray(placements && placements.sponsor_ads)
      ? placements.sponsor_ads
      : [];

    if (items.length === 0) {
      section.style.display = "none";
      return;
    }

    section.style.display = "";

    // Use existing <a.card> placeholders (from static-src), create more if needed
    let cards = Array.from(grid.querySelectorAll("a.card"));
    if (cards.length < items.length) {
      const needed = items.length - cards.length;
      for (let i = 0; i < needed; i++) {
        const a = document.createElement("a");
        a.className = "card";
        a.href = "#";
        a.target = "_blank";
        a.rel = "noopener";
        grid.appendChild(a);
      }
      cards = Array.from(grid.querySelectorAll("a.card"));
    }

    cards.forEach((a, idx) => {
      const item = items[idx];

      if (!item) {
        a.style.display = "none";
        return;
      }

      a.style.display = "";

      // Replace card content
      a.href = item && item.url ? String(item.url) : "#";
      a.target = "_blank";
      a.rel = "noopener";

      const title = stripHtml(item && item.title ? item.title : "");
      const imgUrl = resolveUrlMaybeRelative(item && item.image ? item.image : "");

      a.innerHTML = "";

      const imgWrap = document.createElement("div");
      imgWrap.className = "image";

      const img = document.createElement("img");
      if (imgUrl) img.src = imgUrl;
      img.alt = title;
      img.loading = "lazy";
      imgWrap.appendChild(img);

      const body = document.createElement("div");
      body.className = "body";

      const meta = document.createElement("div");
      meta.className = "meta";
      meta.textContent = "スポンサー";

      const h3 = document.createElement("h3");
      h3.textContent = title;

      body.appendChild(meta);
      body.appendChild(h3);

      a.appendChild(imgWrap);
      a.appendChild(body);
    });
  }
  // =========================================================
  // ✅ End Added: placements.json rendering for sponsor ads
  // =========================================================


  

  // =========================================================
  // ✅ Added: placements.json rendering for side ads (index.html)
  // - Renders placements.json "ads" into .right-gallery .ad-slot under #vcolA / #vcolB
  // - Admin controls:
  //   - item.column: "A" (left/vcolA) or "B" (right/vcolB)
  //   - item.size: "medium" or "small" -> class "ad-half-vertical" / "ad-rect-vertical"
  //   - item.extra_class: optional additional class(es)
  // - If no ads -> hides all existing .ad-slot + their SP wrappers
  // =========================================================
  function hasSideAdsUi() {
    return (
      !!document.querySelector(".right-gallery") &&
      (!!document.querySelector("#vcolA .ad-slot") ||
        !!document.querySelector("#vcolB .ad-slot"))
    );
  }

  function getAdSlotClassFromItem(item) {
    // Allow server to provide explicit class, otherwise derive from size
    const explicit = item && typeof item.class === "string" ? item.class.trim() : "";
    if (explicit) return explicit;

    const size = item && typeof item.size === "string" ? item.size.trim().toLowerCase() : "";
    return size === "medium" ? "ad-half-vertical" : "ad-rect-vertical";
  }

  function normalizeAdColumn(item) {
    const c = item && typeof item.column === "string" ? item.column.trim().toUpperCase() : "";
    if (c === "B") return "B";
    return "A";
  }

  function setSlotHidden(slot, hidden) {
    if (!slot) return;
    slot.style.display = hidden ? "none" : "";
    // Also hide the adjacent SP wrapper if it exists
    const next = slot.nextElementSibling;
    if (next && (next.classList.contains("mpu-ad-wrapper") || next.classList.contains("halfpage-ad-wrapper"))) {
      next.style.display = hidden ? "none" : "";
    }
  }

  function applyAdToSlot(slot, item) {
    if (!slot || !item) return;

    // Reset size classes
    slot.classList.remove("ad-half-vertical", "ad-rect-vertical");

    const sizeClass = getAdSlotClassFromItem(item);
    if (sizeClass) slot.classList.add(sizeClass);

    const extra = item && typeof item.extra_class === "string" ? item.extra_class.trim() : "";
    if (extra) {
      extra.split(/\s+/).filter(Boolean).forEach((cls) => slot.classList.add(cls));
    }

    const title = stripHtml(item && item.title ? item.title : "");
    const href = item && item.url ? String(item.url) : "";
    const imgUrl = resolveUrlMaybeRelative(item && item.image ? item.image : "");

    // Update img inside slot
    const img = slot.querySelector("img");
    if (img && imgUrl) img.src = imgUrl;
    if (img) img.alt = title;

    // Make clickable (keep markup as-is; just add a click handler)
    if (href) {
      slot.style.cursor = "pointer";
      slot.onclick = () => window.open(href, "_blank", "noopener");
    } else {
      slot.style.cursor = "";
      slot.onclick = null;
    }

    // Also update SP wrapper image if present
    const next = slot.nextElementSibling;
    if (next && (next.classList.contains("mpu-ad-wrapper") || next.classList.contains("halfpage-ad-wrapper"))) {
      const wrapperImg = next.querySelector("img");
      if (wrapperImg && imgUrl) wrapperImg.src = imgUrl;
      if (wrapperImg) wrapperImg.alt = title;

      if (href) {
        next.style.cursor = "pointer";
        next.onclick = () => window.open(href, "_blank", "noopener");
      } else {
        next.style.cursor = "";
        next.onclick = null;
      }
    }
  }

  function renderSideAdsIntoDom(placements) {
    if (!hasSideAdsUi()) return;

    const items = Array.isArray(placements && placements.ads) ? placements.ads : [];

    const slotsA = Array.from(document.querySelectorAll("#vcolA .ad-slot"));
    const slotsB = Array.from(document.querySelectorAll("#vcolB .ad-slot"));

    // Hide everything first (so "no ads" case is clean)
    slotsA.forEach((s) => setSlotHidden(s, true));
    slotsB.forEach((s) => setSlotHidden(s, true));

    if (items.length === 0) return;

    let idxA = 0;
    let idxB = 0;

    items.forEach((item) => {
      const col = normalizeAdColumn(item);
      if (col === "B") {
        const slot = slotsB[idxB++];
        if (!slot) return;
        applyAdToSlot(slot, item);
        setSlotHidden(slot, false);
      } else {
        const slot = slotsA[idxA++];
        if (!slot) return;
        applyAdToSlot(slot, item);
        setSlotHidden(slot, false);
      }
    });
  }
async function loadAndRenderPlacementsJson(paper) {
    // Only for pages that actually have placements UI
    if (!hasSponsorAdsUi() && !hasNewspaperAdsUi() && !hasSideAdsUi()) return;

    const url = `/static/${paper}/placements.json`;
    try {
      const placements = await fetchJson(url);
      renderSponsorVideosIntoDom(placements);
      renderNewspaperSponsorAdsIntoDom(placements);
      renderSideAdsIntoDom(placements);
    } catch (e) {
      // Do not break the page; keep hard-coded fallback
      console.warn("[placements.json] failed:", e && e.message ? e.message : e);
    }
  }
  // =========================================================
  // ✅ End Added: placements.json rendering for sponsor videos
  // =========================================================



  // =========================================================
  // Variety page: make images clickable using admin-defined link
  // - Reads /static/{paper}/varieties.json and expects each item to have "link"
  // - Makes images inside:
  //     .variety-thumb img
  //     .card-image-hero img
  //   clickable and navigates to the link.
  // - Works even if the variety cards are rendered later (MutationObserver)
  // =========================================================
  function enhanceVarietyImageLinks() {
    try {
      if (!document.body || !document.body.classList.contains("page-variety")) return;

      const paper = getPaperFromPath() || getCurrentPaper();
      if (!paper || paper === "account") return;

      const gridRoot = document.getElementById("varietyGrid");
      const listRoot = document.getElementById("varietyList");
      const roots = [gridRoot, listRoot].filter(Boolean);
      if (roots.length === 0) return;

      function normalizeSrc(src) {
        const s = String(src || "").trim();
        if (!s) return "";
        try {
          // strip origin + query/hash
          const u = new URL(s, window.location.origin);
          return (u.pathname || "") + (u.search ? "" : "");
        } catch (_e) {
          return s.split("?")[0].split("#")[0];
        }
      }

      function buildMaps(items) {
        const byId = new Map();
        const byName = new Map();
        const byImgPath = new Map();

        (Array.isArray(items) ? items : []).forEach((it) => {
          if (!it) return;
          const id = it.id != null ? String(it.id) : "";
          const name = typeof it.name === "string" ? it.name.trim() : "";
          const link = typeof it.link === "string" ? it.link.trim() : "";

          if (id && link) byId.set(id, link);
          if (name && link) byName.set(name, link);

          const img = typeof it.image === "string" ? it.image.trim() : "";
          const nimg = normalizeSrc(img);
          if (nimg && link) byImgPath.set(nimg, link);
        });

        return { byId, byName, byImgPath };
      }

      function findVarietyLinkForImg(imgEl, maps) {
        if (!imgEl || !maps) return "";

        // 1) nearest data attributes
        const host =
          imgEl.closest("[data-variety-id]") ||
          imgEl.closest("[data-id]") ||
          imgEl.closest("[data-item-id]") ||
          imgEl.closest("[data-post-id]");

        if (host) {
          const did =
            host.getAttribute("data-variety-id") ||
            host.getAttribute("data-id") ||
            host.getAttribute("data-item-id") ||
            host.getAttribute("data-post-id") ||
            "";
          const id = String(did || "").trim();
          if (id && maps.byId.has(id)) return maps.byId.get(id) || "";
        }

        // 2) img alt (often variety name)
        const alt = String(imgEl.getAttribute("alt") || "").trim();
        if (alt && maps.byName.has(alt)) return maps.byName.get(alt) || "";

        // 3) match by image path
        const src = normalizeSrc(imgEl.getAttribute("src") || "");
        if (src && maps.byImgPath.has(src)) return maps.byImgPath.get(src) || "";

        // 4) match by last path segment (fallback)
        if (src) {
          const seg = src.split("/").filter(Boolean).pop() || "";
          if (seg) {
            for (const [k, v] of maps.byImgPath.entries()) {
              const kseg = String(k).split("/").filter(Boolean).pop() || "";
              if (kseg && kseg === seg) return v || "";
            }
          }
        }

        return "";
      }

      function makeImgClickable(imgEl, link) {
        if (!imgEl) return;
        if (!link) return;

        // avoid double-binding
        if (imgEl.dataset && imgEl.dataset.varietyLinkApplied === "1") return;

        // If image is already inside an anchor, respect it
        if (imgEl.closest("a")) {
          if (imgEl.dataset) imgEl.dataset.varietyLinkApplied = "1";
          return;
        }

        // Visual affordance
        imgEl.style.cursor = "pointer";

        // Click + keyboard
        imgEl.setAttribute("role", "link");
        imgEl.setAttribute("tabindex", "0");

        const go = function () {
          try {
            const href = resolveUrlMaybeRelative(link);
            if (href) window.location.href = href;
          } catch (_e) {}
        };

        imgEl.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          go();
        });

        imgEl.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            go();
          }
        });

        if (imgEl.dataset) imgEl.dataset.varietyLinkApplied = "1";
      }

      function applyOnce(root, maps) {
        if (!root) return;

        const imgs = root.querySelectorAll(".variety-thumb img, .card-image-hero img");
        imgs.forEach((imgEl) => {
          const link = findVarietyLinkForImg(imgEl, maps);
          makeImgClickable(imgEl, link);
        });
      }

      fetchJson(`/static/${encodeURIComponent(paper)}/varieties.json`)
        .then((payload) => {
          const items = payload && Array.isArray(payload.items) ? payload.items : [];
          const maps = buildMaps(items);

          // initial apply
          roots.forEach((r) => applyOnce(r, maps));

          // observe later renders (variety.js)
          roots.forEach((r) => {
            const obs = new MutationObserver(function () {
              applyOnce(r, maps);
            });
            obs.observe(r, { childList: true, subtree: true });
          });
        })
        .catch(() => {
          // varieties.json may be missing; ignore
        });
    } catch (_e) {
      // ignore
    }
  }

  async function main() {
    const paper = getPaperFromPath();
    if (!paper) return;

    // Variety page enhancement (clickable images)
    enhanceVarietyImageLinks();

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
      // ✅ Added: fill "トマトNEWS" cards (#news) from posts.json (article_type)
      await renderNewsSection(posts, paper);

      // ✅ Added: fill market UI from market.json (PC + SP)
      await loadAndRenderMarketJson(paper);

      // ✅ Added: fill sponsor videos from placements.json
      await loadAndRenderPlacementsJson(paper);

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


/* =====================================================================
 * Legacy inline scripts migrated from index_latest.html
 * (kept isolated and guarded where appropriate)
 * ===================================================================== */

/* --- from list_latest.html <script> (css href fix) --- */
/* When opened as file://, "/static/style.css" points to the filesystem root and won't load.
   Use a relative path only for file:// previews. */
(function(){
  var l = document.getElementById('app-css');
  if(!l) return;
  if (location.protocol === 'file:') l.setAttribute('href', 'static/style.css');
})();

/* --- from index_latest.html <script> (block #2) --- */
(function(){
  var hdr = document.querySelector('header');
  if(hdr){ document.documentElement.style.setProperty('--hdrH', Math.ceil(hdr.getBoundingClientRect().height) + 'px'); }
  var chips = document.querySelector('.pill-bar, .chip-row, .category-chips');
  if(chips){
    var ch = Math.ceil(chips.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--chipsH', ch + 'px');
    document.body.classList.add('has-chips');
    var ph = document.createElement('div'); ph.style.height = ch + 'px';
    chips.parentNode.insertBefore(ph, chips.nextSibling);
  }
})();


/* --- from list_latest.html <script> (header height) --- */
// ヘッダー高さを動的に取得
document.addEventListener('DOMContentLoaded', function() {
  const header = document.querySelector('header');
  if(header){
    function setHeaderHeight() {
      const h = header.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--header-height', h + 'px');
    }
    setHeaderHeight();
    window.addEventListener('resize', setHeaderHeight);
  }
});

/* --- from index_latest.html <script> (block #3) --- */
// フッターアコーディオン機能
function toggleFooterMenu(element) {
  if (window.innerWidth <= 768) {
    element.classList.toggle('active');
  }
}

/* --- from index_latest.html <script> (block #4) --- */
/* ===== utilities ===== */
const once = (fn) => { let done=false; return (...a)=>{ if(done) return; done=true; fn(...a); }; };
const debounce = (fn,ms=240)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };

/* ===== demo modal ===== */
/* ===== seamless horizontal lanes ===== */
function prepareSeamless(id){
  const track = document.getElementById(id);
  if(!track || track.dataset.cloned) return;
  const children = Array.from(track.children);
  children.forEach(el => track.appendChild(el.cloneNode(true)));
  track.dataset.cloned = "1";
}

/* ===== vertical columns ===== */
function initVCol(colId, {speed=0.34, direction=1}={}){
  const col = document.getElementById(colId);
  if(!col) return;
  if(col.dataset.inited==="1") return;
  const track = col.querySelector('.v-track');
  if(!track) return;
  const items = Array.from(track.children);
  if(!track.dataset.cloned){
    items.forEach(el => track.appendChild(el.cloneNode(true)));
    track.dataset.cloned = "1";
  }
  let y = 0, playing = true, rafId = 0;
  const loopH = () => track.scrollHeight/2;
  const setY = val => { y=val; track.style.transform = `translateY(${y}px)`; };
  const step = () => {
    if(playing){
      setY(y - speed*direction);
      if(direction===1 && -y >= loopH()) setY(0);
      if(direction===-1 && y >= 0) setY(-loopH());
    }
    rafId = requestAnimationFrame(step);
  };
  const start = once(()=>{ setY(direction===1 ? 0 : -loopH()/2); rafId=requestAnimationFrame(step); });
  const stop = ()=>{ playing=false; };
  const resume = ()=>{ playing=true; };
  col.addEventListener('mouseenter',stop);
  col.addEventListener('mouseleave',resume);
  const ro = new ResizeObserver(()=> start());
  ro.observe(track);
  col.dataset.inited = "1";
  col._destroy = ()=>{ cancelAnimationFrame(rafId); ro.disconnect(); col.dataset.inited=""; };
}

function destroyVCols(){
  ['vcolA','vcolB'].forEach(id=>{
    const el = document.getElementById(id);
    if(el && el.dataset.inited==="1" && typeof el._destroy === 'function'){ el._destroy(); }
    // SP版では複製された要素を削除
    const track = el ? el.querySelector('.v-track') : null;
    if(track && track.dataset.cloned === "1"){
      const children = Array.from(track.children);
      const half = Math.floor(children.length / 2);
      // 後半（複製された要素）を削除
      children.slice(half).forEach(child => child.remove());
      track.dataset.cloned = "";
    }
  });
}

function boot(){
  ['laneTrackA','laneTrackB','laneTrackVideo'].forEach(prepareSeamless);
  const isPC = window.matchMedia('(min-width:1180px)').matches;
  if(isPC){
    initVCol('vcolA',{speed:0.32, direction:1});
    initVCol('vcolB',{speed:0.27, direction:-1});
  }else{
    destroyVCols();
  }
  // mobile sticky ad: show after delay if viewport <= 900px
  const sticky = document.getElementById('stickyAd');
  if (sticky) {
    if (window.matchMedia('(max-width:900px)').matches) {
      setTimeout(() => sticky.classList.add('active'), 1200);
    } else {
      sticky.classList.remove('active');
    }
  }
}

document.addEventListener('DOMContentLoaded', boot);
window.addEventListener('load', boot);
window.addEventListener('resize', debounce(boot, 200));
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') boot(); });

/* --- from index_latest.html <script> (block #5) --- */
(function(){
  var isLegacy = (location && (location.protocol==='file:' || /index_latest\.html$/.test(location.pathname||'') || /detail_latest\.html$/.test(location.pathname||'')));
  if(!isLegacy) return;
// 広告タグはそのままに、JSで順番にサムネファイルを割り当てる
  (function(){
    var slots = document.querySelectorAll('.right-gallery .ad-slot');
    for (var i = 0; i < slots.length; i++) {
      var n = i + 1;
      slots[i].style.setProperty('--ad-img', 'url(./ad_' + n + '.jpg)');
    }
  })();
})();

/* --- from index_latest.html <script> (block #6) --- */
(function(){
  var isLegacy = (location && (location.protocol==='file:' || /index_latest\.html$/.test(location.pathname||'') || /detail_latest\.html$/.test(location.pathname||'')));
  if(!isLegacy) return;
// ローカル画像の自動割当（命名規則に従う）
(function(){
  // 新着NEWS（latest_X.jpg）
  document.querySelectorAll('.latest-news img').forEach(function(el, i){
    el.src = './latest_' + (i + 1) + '.jpg';
  });

  // 新聞広告紹介（paperad_X.jpg）
  document.querySelectorAll('.paper-ad img').forEach(function(el, i){
    el.src = './paperad_' + (i + 1) + '.jpg';
  });

  // 紙面プレビュー（preview_X.jpg）
  document.querySelectorAll('.preview-paper img').forEach(function(el, i){
    el.src = './preview_' + (i + 1) + '.jpg';
  });

  // フッター広告（footerad_X.jpg） — 疑似要素背景で割当
  document.querySelectorAll('.footer-ad').forEach(function(el, i){
    el.style.setProperty('--footerad-img', 'url(./footerad_' + (i + 1) + '.jpg)');
  });
})();
})();

/* --- from index_latest.html <script> (block #7) --- */
(function(){
  var isLegacy = (location && (location.protocol==='file:' || /index_latest\.html$/.test(location.pathname||'') || /detail_latest\.html$/.test(location.pathname||'')));
  if(!isLegacy) return;
(function(){
  // 新着NEWS: section#news 内の .card .image img
  document.querySelectorAll('#news .card .image img').forEach(function(el, i){
    el.src = './latest_' + (i + 1) + '.jpg';
  });

  // 新聞広告紹介枠: section#newspaper-ads 内の .card .image img
  document.querySelectorAll('#newspaper-ads .card .image img').forEach(function(el, i){
    el.src = './paperad_' + (i + 1) + '.jpg';
  });

  // 紙面プレビュー: section#paper 内の .card .image img
  document.querySelectorAll('#paper .card .image img').forEach(function(el, i){
    el.src = './preview_' + (i + 1) + '.jpg';
  });

  // フッター広告: alt="フッター広告" のimgを置換（タグはそのまま）
  var fimg = document.querySelector('footer img[alt="フッター広告"]');
  if (fimg){ fimg.src = './footerad_1.jpg'; }
})();
})();

/* --- from index_latest.html <script id="kw-slider-boot"> (block #8) --- */
(function(){
  // Measure kw-bar height and set --kwH, then add body class for padding compensation
  function applyKWPadding(){
    var kb = document.querySelector('.kw-bar');
    if(!kb) return;
    var h = Math.ceil(kb.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--kwH', h + 'px');
    document.body.classList.add('has-kw');
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyKWPadding);
  } else {
    applyKWPadding();
  }
  window.addEventListener('resize', function(){ clearTimeout(window.__kw_t); window.__kw_t=setTimeout(applyKWPadding, 150); });
})();

/* --- from list_latest.html <script id="kw-slider-boot-v2"> --- */
(function(){
  function headerHeight(){
    var h=64;
    var hdr = document.querySelector("header, .header, [data-header]");
    if(hdr){ h = Math.ceil(hdr.getBoundingClientRect().height); }
    document.documentElement.style.setProperty("--hdrH", h+"px");
    document.documentElement.style.setProperty("--header-height", h+"px");
  }
  function kwHeight(){
    var kb = document.querySelector(".kw-bar");
    if(!kb){
      document.documentElement.style.setProperty("--kwH", "0px");
      document.body.classList.remove("has-kw");
      return;
    }
    var st = window.getComputedStyle(kb);
    var visible = st.display !== "none" && st.visibility !== "hidden";
    if(!visible){
      document.documentElement.style.setProperty("--kwH", "0px");
      document.body.classList.remove("has-kw");
      return;
    }
    var h = Math.ceil(kb.getBoundingClientRect().height) || 0;
    document.documentElement.style.setProperty("--kwH", h+"px");
    document.body.classList.add("has-kw");
  }
  function init(){
    headerHeight(); kwHeight();
  }
  if(document.readyState==="loading"){ document.addEventListener("DOMContentLoaded", init); }
  else { init(); }

  // header is injected by components.js on most pages
  window.addEventListener("headerLoaded", function(){ setTimeout(init, 0); setTimeout(init, 250); });

  window.addEventListener("resize", function(){ clearTimeout(window.__kw_r); window.__kw_r=setTimeout(init, 120); });
})();
/* --- from index_latest.html <script id="square-thumbs-boot"> (block #10) --- */
(function(){
  function forceSquares(){
    var scope = document.querySelector('main') || document.body;
    var imgs = scope.querySelectorAll('img');
    imgs.forEach(function(img){
      if (img.closest('header, nav, footer')) return;
      var p = img.parentElement;
      if(!p) return;
      var cs = getComputedStyle(p);
      // if parent has no aspect ratio, set it to square for thumbnails that look like cards
      if (!cs.aspectRatio || cs.aspectRatio == 'auto') {
        if (p.className.match(/card|list|slider|thumb|image|media|ad|paper|feature|column|video|news/i)) {
          p.style.aspectRatio = '1 / 1';
          p.style.overflow = 'hidden';
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'cover';
          img.style.aspectRatio = '1 / 1';
        }
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', forceSquares);
  } else {
    forceSquares();
  }
  window.addEventListener('resize', function(){ clearTimeout(window.__sq_t); window.__sq_t=setTimeout(forceSquares, 150); });
})();

/* --- from index_latest.html <script> (block #11) --- */
function openModal(type) {
  alert(type + ' モーダル（仮）');
  // 実際の実装では適切なモーダル表示処理
}

// 画像拡大モーダル機能
function openImageModal() {
  const modal = document.getElementById('imageModal');
  const modalImg = document.getElementById('modalImage');
  const img = document.getElementById('mainImage');

  if (!modal || !modalImg || !img) return;

  modal.classList.add('active');
  modalImg.src = img.src;
  document.body.style.overflow = 'hidden'; // スクロール防止
}

function closeImageModal() {
  const modal = document.getElementById('imageModal');
  if (!modal) return;
  modal.classList.remove('active');
  document.body.style.overflow = ''; // スクロール復帰
}

// ESCキーでモーダルを閉じる
document.addEventListener('keydown', function(event) {
  if (event.key === 'Escape') {
    closeImageModal();
  }
});


// 市況データカルーセル機能（1カードずつスライド、常に2カード表示）
let marketCarouselIndex = { pc: 0, sp: 0 };

function slideMarket(direction, version) {
  const grid = document.getElementById('market-grid-' + version);
  const cards = Array.from(grid.querySelectorAll('.market-card'));
  const totalCards = cards.length;
  
  // 現在のインデックスを更新（1カードずつ移動）
  marketCarouselIndex[version] += direction;
  
  // ループ処理
  if (marketCarouselIndex[version] < 0) {
    marketCarouselIndex[version] = totalCards - 1;
  } else if (marketCarouselIndex[version] >= totalCards) {
    marketCarouselIndex[version] = 0;
  }
  
  // カードの表示/非表示と順序を切り替え
  const currentIdx = marketCarouselIndex[version];
  const nextIdx = (currentIdx + 1) % totalCards;
  
  cards.forEach((card, index) => {
    if (index === currentIdx) {
      card.style.display = 'block';
      card.style.order = '1'; // 左側に表示
    } else if (index === nextIdx) {
      card.style.display = 'block';
      card.style.order = '2'; // 右側に表示
    } else {
      card.style.display = 'none';
      card.style.order = '99';
    }
  });
  
  // ドットインジケーターを更新
  if (version === 'pc') {
    updateMarketIndicators();
  } else {
    updateMarketIndicatorsSP();
  }
}

// ページインジケーターを更新
function updateMarketIndicators() {
  // PC版のtomato-market-data内のドットのみを取得
  const pcSection = document.querySelector('.left-hero .tomato-market-data');
  if (!pcSection) return;
  
  const dots = pcSection.querySelectorAll('.indicator-dot');
  const currentPage = marketCarouselIndex.pc;
  
  dots.forEach((dot, index) => {
    if (index === currentPage) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });
}

// 特定のページに移動（1カードずつ）
function goToMarketPage(pageIndex) {
  const grid = document.getElementById('market-grid-pc');
  const cards = Array.from(grid.querySelectorAll('.market-card'));
  const totalCards = cards.length;
  
  marketCarouselIndex.pc = pageIndex;
  
  const currentIdx = marketCarouselIndex.pc;
  const nextIdx = (currentIdx + 1) % totalCards;
  
  cards.forEach((card, index) => {
    if (index === currentIdx) {
      card.style.display = 'block';
      card.style.order = '1'; // 左側に表示
    } else if (index === nextIdx) {
      card.style.display = 'block';
      card.style.order = '2'; // 右側に表示
    } else {
      card.style.display = 'none';
      card.style.order = '99';
    }
  });
  
  updateMarketIndicators();
  
  // 自動スライドをリセット（手動操作時）
  resetAutoSlide();
}

// 特定のページに移動（SP版、1カードずつ）
function goToMarketPageSP(pageIndex) {
  const grid = document.getElementById('market-grid-sp');
  const cards = Array.from(grid.querySelectorAll('.market-card'));
  const totalCards = cards.length;
  
  marketCarouselIndex.sp = pageIndex;
  
  const currentIdx = marketCarouselIndex.sp;
  const nextIdx = (currentIdx + 1) % totalCards;
  
  cards.forEach((card, index) => {
    if (index === currentIdx) {
      card.style.display = 'block';
      card.style.order = '1'; // 左側に表示
    } else if (index === nextIdx) {
      card.style.display = 'block';
      card.style.order = '2'; // 右側に表示
    } else {
      card.style.display = 'none';
      card.style.order = '99';
    }
  });
  
  updateMarketIndicatorsSP();
  
  // 自動スライドをリセット（手動操作時）
  resetAutoSlide();
}

// ページインジケーターを更新（SP版）
function updateMarketIndicatorsSP() {
  const spSection = document.querySelector('.tomato-market-data.sp-only-market');
  if (!spSection) return;
  
  const dots = spSection.querySelectorAll('.indicator-dot');
  const currentPage = marketCarouselIndex.sp;
  
  dots.forEach((dot, index) => {
    if (index === currentPage) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });
}

// ページ読み込み時にナビゲーションボタンの状態を初期化
document.addEventListener('DOMContentLoaded', function() {
  const pcGrid = document.getElementById('market-grid-pc');
  const spGrid = document.getElementById('market-grid-sp');
  
  // 初期状態で最初の2つのカードのみ表示（インデックス0と1）
  if (pcGrid) {
    const pcCards = pcGrid.querySelectorAll('.market-card');
    pcCards.forEach((card, index) => {
      if (index === 0) {
        card.style.display = 'block';
        card.style.order = '1'; // 左側に表示
      } else if (index === 1) {
        card.style.display = 'block';
        card.style.order = '2'; // 右側に表示
      } else {
        card.style.display = 'none';
        card.style.order = '99';
      }
    });
    // 初期状態のドットを設定
    updateMarketIndicators();
  }
  
  if (spGrid) {
    const spCards = spGrid.querySelectorAll('.market-card');
    spCards.forEach((card, index) => {
      if (index === 0) {
        card.style.display = 'block';
        card.style.order = '1'; // 左側に表示
      } else if (index === 1) {
        card.style.display = 'block';
        card.style.order = '2'; // 右側に表示
      } else {
        card.style.display = 'none';
        card.style.order = '99';
      }
    });
    // 初期状態のドットを設定
    updateMarketIndicatorsSP();
  }
  
  // 自動スライド機能を開始
  startAutoSlide();
});

// 自動スライド用のタイマーID
let autoSlideTimer = null;

// 自動スライドを開始（1カードずつスライド）
function startAutoSlide() {
  // 既存のタイマーがあればクリア
  if (autoSlideTimer) {
    clearInterval(autoSlideTimer);
  }
  
  // 5秒ごとに次のカードに移動（1カードずつ）
  autoSlideTimer = setInterval(() => {
    // PC版
    const pcGrid = document.getElementById('market-grid-pc');
    if (pcGrid && window.matchMedia('(min-width:1180px)').matches) {
      const cards = Array.from(pcGrid.querySelectorAll('.market-card'));
      const totalCards = cards.length;
      const nextIndex = (marketCarouselIndex.pc + 1) % totalCards;
      goToMarketPage(nextIndex);
    }
    
    // SP版
    const spGrid = document.getElementById('market-grid-sp');
    if (spGrid && window.matchMedia('(max-width:1179px)').matches) {
      const cards = Array.from(spGrid.querySelectorAll('.market-card'));
      const totalCards = cards.length;
      const nextIndex = (marketCarouselIndex.sp + 1) % totalCards;
      goToMarketPageSP(nextIndex);
    }
  }, 5000); // 5秒ごと
}

// 自動スライドを停止
function stopAutoSlide() {
  if (autoSlideTimer) {
    clearInterval(autoSlideTimer);
    autoSlideTimer = null;
  }
}

// 自動スライドをリセット（ユーザーが手動操作した時に呼ぶ）
function resetAutoSlide() {
  stopAutoSlide();
  startAutoSlide();
}

/* --- from index_latest.html <script> (block #12) --- */
(function(){
  var isLegacy = (location && (/index_latest\.html$/.test(location.pathname||'') || /detail_latest\.html$/.test(location.pathname||'') || document.title.indexOf('社長レク用') !== -1));
  if(!isLegacy) return;
(function() {
  // トマト市況データ管理 - 4品種対応
  class TomatoMarketData {
    constructor() {
      this.items = [];
      this.lastUpdate = null;
    }

    // デモデータの生成（PDFの仕様に基づく）
    generateDemoData() {
      this.items = [
        {
          item_code: 34400,
          item_name: "大玉トマト",
          quantity_ton: 47,
          avg_price: 878,
          diff_prev: { sign: "UP", value: 131 },
          file_date: "2025-11-26"
        },
        {
          item_code: 34480,
          item_name: "中玉トマト",
          quantity_ton: 32,
          avg_price: 945,
          diff_prev: { sign: "DOWN", value: 58 },
          file_date: "2025-11-26"
        },
        {
          item_code: 34460,
          item_name: "ミニトマト",
          quantity_ton: 28,
          avg_price: 1120,
          diff_prev: { sign: "UP", value: 89 },
          file_date: "2025-11-26"
        }
        /*
        ,{
          item_code: 34410,
          item_name: "ファーストトマト",
          quantity_ton: null, // オフシーズン
          avg_price: null,
          diff_prev: { sign: null, value: null },
          file_date: "2025-11-26"
        }
        */
      ];
      
      this.lastUpdate = new Date();
      return this;
    }

    // WordPress REST APIからデータを取得
    async fetchRealData() {
      try {
        const response = await fetch('/wp-json/tomato/v1/latest', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          }
        });
        
        if (!response.ok) {
          throw new Error('データ取得に失敗しました');
        }
        
        const data = await response.json();
        this.items = data.items || [];
        this.lastUpdate = new Date(data.updated_at);
        
        return this;
      } catch (error) {
        console.log('APIが利用できないため、デモデータを使用します');
        return this.generateDemoData();
      }
    }
  }

  // UI更新クラス - 4品種カード対応
  class MarketUI {
    updateMarketCards(data) {
      data.items.forEach(item => {
        const code = item.item_code;
        
        // PC版とSP版の両方の価格を更新
        const priceIds = [`price-${code}`, `price-${code}-sp`];
        priceIds.forEach(id => {
          const priceEl = document.getElementById(id);
          if (priceEl) {
            priceEl.textContent = item.avg_price != null ? item.avg_price.toLocaleString() : '—';
          }
        });
        
        // PC版とSP版の両方の前市比を更新
        const changeIds = [`change-${code}`, `change-${code}-sp`];
        changeIds.forEach(id => {
          const changeContainer = document.getElementById(id);
          if (changeContainer) {
            const iconEl = changeContainer.querySelector('.change-icon');
            const valueEl = changeContainer.querySelector('.change-value');
            
            // クラスをリセット
            changeContainer.classList.remove('trend-up', 'trend-down');
            
            if (item.diff_prev && item.diff_prev.value != null) {
              valueEl.textContent = item.diff_prev.value.toLocaleString();
              
              if (item.diff_prev.sign === 'UP') {
                changeContainer.classList.add('trend-up');
                iconEl.textContent = '↗';
              } else if (item.diff_prev.sign === 'DOWN') {
                changeContainer.classList.add('trend-down');
                iconEl.textContent = '↘';
              } else if (item.diff_prev.sign === 'EQUAL') {
                iconEl.textContent = '→';
              }
            } else {
              iconEl.textContent = '—';
              valueEl.textContent = '—';
            }
          }
        });
        
        // PC版とSP版の両方の取引量を更新
        const quantityIds = [`quantity-${code}`, `quantity-${code}-sp`];
        quantityIds.forEach(id => {
          const quantityEl = document.getElementById(id);
          if (quantityEl) {
            quantityEl.textContent = item.quantity_ton != null ? item.quantity_ton.toLocaleString() : '—';
          }
        });
      });
      
      // 更新日時を表示
      if (data.lastUpdate) {
        const dateStr = data.lastUpdate.toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        
        const dateElements = document.querySelectorAll('.market-date');
        dateElements.forEach(el => {
          el.textContent = `${dateStr}現在 / 日農平均価格（円/kg）`;
        });
      }
    }
  }

  // 初期化と定期更新
  async function initMarketData() {
    const marketData = new TomatoMarketData();
    const ui = new MarketUI();
    
    // データ取得と表示を更新する関数
    async function updateMarketData() {
      try {
        await marketData.fetchRealData();
        ui.updateMarketCards(marketData);
        
        console.log('トマト市況データを更新しました:', {
          itemCount: marketData.items.length,
          lastUpdate: marketData.lastUpdate
        });
      } catch (error) {
        console.error('Market Data Update Error:', error);
      }
    }
    
    // 初回読み込み
    await updateMarketData();
    
    // 5分ごとに更新
    setInterval(updateMarketData, 5 * 60 * 1000);
  }
  
  // DOMContentLoadedイベントで初期化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMarketData);
  } else {
    initMarketData();
  }
})();

  /* =====================================================================
   * Common UI helpers (mobile menu / footer accordion)
   * + WEBセミナー page behaviors (video modal / countdown / thumbnails)
   * ===================================================================== */

  // Mobile menu toggle (used by header.html)
  if (typeof window.toggleMobileMenu !== "function") {
    window.toggleMobileMenu = function toggleMobileMenu() {
      const menu = document.getElementById("mobileMenu");
      const overlay = document.getElementById("mobileMenuOverlay");
      if (!menu || !overlay) return;
      menu.classList.toggle("active");
      overlay.classList.toggle("active");
    };
  }

  // Footer accordion (used by footer.html)
  if (typeof window.toggleFooterMenu !== "function") {
    window.toggleFooterMenu = function toggleFooterMenu(col) {
      if (window.innerWidth <= 768 && col && col.classList) col.classList.toggle("active");
    };
  }

  // Dummy modal opener (kept for mockup compatibility)
  if (typeof window.openModal !== "function") {
    window.openModal = function openModal(type) {
      alert(String(type || "") + "モーダル（ダミー）");
    };
  }

  // ==========================
  // WEBセミナー: Video modal
  // ==========================
  (function initWebSeminarVideoModal() {
    let currentVideoId = "";

    function getModalEls() {
      return {
        modal: document.getElementById("videoModal"),
        player: document.getElementById("videoPlayer"),
      };
    }

    if (typeof window.openVideoModal !== "function") {
      window.openVideoModal = function openVideoModal(videoId) {
        const { modal, player } = getModalEls();
        if (!modal || !player) return;

        currentVideoId = String(videoId || "");
        const embedUrl =
          "https://www.youtube.com/embed/" +
          encodeURIComponent(currentVideoId) +
          "?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1";

        player.src = embedUrl;
        modal.classList.add("active");
        document.body.style.overflow = "hidden";
      };
    }

    if (typeof window.openCurrentVideoInYouTube !== "function") {
      window.openCurrentVideoInYouTube = function openCurrentVideoInYouTube(evt) {
        if (evt && typeof evt.stopPropagation === "function") evt.stopPropagation();
        const vid = currentVideoId;
        if (!vid) return;
        const youtubeUrl = "https://www.youtube.com/watch?v=" + encodeURIComponent(vid);
        window.open(youtubeUrl, "_blank", "noopener,noreferrer");
      };
    }

    if (typeof window.closeVideoModal !== "function") {
      window.closeVideoModal = function closeVideoModal(evt) {
        const { modal, player } = getModalEls();
        if (!modal || !player) return;

        const target = evt && evt.target ? evt.target : null;
        const isOverlayClick = target && target.id === "videoModal";
        const isCloseBtnClick =
          target && target.classList && target.classList.contains("modal-close");

        // Allow calling without event (fails safe: close)
        if (!evt || isOverlayClick || isCloseBtnClick) {
          player.src = "";
          modal.classList.remove("active");
          document.body.style.overflow = "";
          currentVideoId = "";
          if (evt && typeof evt.stopPropagation === "function") evt.stopPropagation();
        }
      };
    }
  })();

  // ==========================
  // WEBセミナー: Countdown
  // ==========================
  (function initWebSeminarCountdown() {
    const daysEl = document.getElementById("days");
    const hoursEl = document.getElementById("hours");
    const minutesEl = document.getElementById("minutes");
    const secondsEl = document.getElementById("seconds");
    if (!daysEl && !hoursEl && !minutesEl && !secondsEl) return;

    // 配信開始日時（モック：2026-06-22 14:00 JST）
    const targetDate = new Date("2026-06-22T14:00:00+09:00").getTime();

    function update() {
      const now = Date.now();
      const distance = targetDate - now;

      const clamp = (n) => (Number.isFinite(n) && n > 0 ? n : 0);

      const days = Math.floor(clamp(distance) / (1000 * 60 * 60 * 24));
      const hours = Math.floor((clamp(distance) % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((clamp(distance) % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((clamp(distance) % (1000 * 60)) / 1000);

      if (daysEl) daysEl.textContent = String(days).padStart(2, "0");
      if (hoursEl) hoursEl.textContent = String(hours).padStart(2, "0");
      if (minutesEl) minutesEl.textContent = String(minutes).padStart(2, "0");
      if (secondsEl) secondsEl.textContent = String(seconds).padStart(2, "0");

      if (distance < 0) {
        if (window.__webSeminarCountdownInterval) {
          clearInterval(window.__webSeminarCountdownInterval);
          window.__webSeminarCountdownInterval = null;
        }
      }
    }

    update();
    if (window.__webSeminarCountdownInterval) clearInterval(window.__webSeminarCountdownInterval);
    window.__webSeminarCountdownInterval = setInterval(update, 1000);
  })();

  // ==========================
  // WEBセミナー: Notification (mock)
  // ==========================
  if (typeof window.subscribeNotification !== "function") {
    window.subscribeNotification = function subscribeNotification(evt) {
      const e = evt || window.event;
      const button = e && e.target ? e.target.closest ? e.target.closest("button") : e.target : null;
      if (!button) return;

      const originalText = button.innerHTML;

      button.disabled = true;
      button.innerHTML =
        '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" style="animation: spin 1s linear infinite;"><circle cx="10" cy="10" r="8" stroke="currentColor" stroke-width="2" stroke-dasharray="50" stroke-dashoffset="25" fill="none"/></svg> 登録中...';

      // Ensure spin keyframes exist once
      if (!document.getElementById("countdown-styles")) {
        const style = document.createElement("style");
        style.id = "countdown-styles";
        style.textContent = "@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}";
        document.head.appendChild(style);
      }

      setTimeout(function () {
        button.innerHTML =
          '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M16.25 6.25L7.5 15L3.75 11.25" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> 通知を設定しました';
        button.style.background = "#10b981";

        setTimeout(function () {
          button.disabled = false;
          button.innerHTML = originalText;
          button.style.background = "";
        }, 3000);
      }, 1000);
    };
  }

  // ==========================
  // WEBセミナー: YouTube thumbnail fallback
  // ==========================
  (function initThumbnailFallback() {
    function extractVideoId(url) {
      const m = String(url || "").match(/\/vi\/([^\/]+)\//);
      return m ? m[1] : null;
    }
    function getCurrentQuality(url) {
      const s = String(url || "");
      if (s.includes("maxresdefault")) return "maxresdefault";
      if (s.includes("sddefault")) return "sddefault";
      if (s.includes("hqdefault")) return "hqdefault";
      if (s.includes("mqdefault")) return "mqdefault";
      if (s.includes("default")) return "default";
      return null;
    }
    function getNextQuality(current) {
      const fallbackOrder = {
        maxresdefault: "sddefault",
        sddefault: "hqdefault",
        hqdefault: "mqdefault",
        mqdefault: "default",
        default: null,
      };
      return fallbackOrder[current] || "hqdefault";
    }

    function setup() {
      const thumbnails = document.querySelectorAll(".tile-img img, .seminar-video-wrapper img");
      if (!thumbnails || thumbnails.length === 0) return;

      thumbnails.forEach(function (img) {
        const originalSrc = img.src;

        img.addEventListener("error", function () {
          const videoId = extractVideoId(originalSrc) || extractVideoId(img.src);
          if (!videoId) return;

          const currentQuality = getCurrentQuality(img.src) || "maxresdefault";
          const nextQuality = getNextQuality(currentQuality);

          if (nextQuality) {
            img.src = "https://i.ytimg.com/vi/" + videoId + "/" + nextQuality + ".jpg";
          } else {
            img.style.display = "none";
            if (img.parentElement) {
              img.parentElement.style.background =
                "linear-gradient(135deg, #374151 0%, #1f2937 100%)";

              const placeholder = document.createElement("div");
              placeholder.style.cssText =
                "position:absolute; top:50%; left:50%; transform:translate(-50%, -50%); color:rgba(255,255,255,0.3); font-size:48px;";
              placeholder.textContent = "▶";
              img.parentElement.appendChild(placeholder);
            }
          }
        });

        img.addEventListener("load", function () {
          const currentQuality = getCurrentQuality(img.src);
          if (currentQuality && currentQuality !== "maxresdefault" && currentQuality !== "sddefault") {
            const videoId = extractVideoId(img.src);
            if (!videoId) return;

            const testImg = new Image();
            testImg.onload = function () {
              img.src = testImg.src;
            };
            testImg.src = "https://i.ytimg.com/vi/" + videoId + "/sddefault.jpg";
          }
        });
      });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
    else setup();
  })();

})();


/* =====================================================================
 * Pest Control page scripts
 * - moved from TOMATO_PESTDISEASE_20260122.html
 * - exposed as globals because the page uses inline onclick handlers
 * ===================================================================== */
(function ensurePestControlGlobals(){
  // Tab switcher for the search section
  if (typeof window.switchTab !== "function") {
    window.switchTab = function switchTab(tab){
      const e = window.event;
      document.querySelectorAll(".search-tab").forEach(t => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => c.classList.remove("active"));

      // Activate clicked tab button if we can detect it
      if (e && e.target) {
        e.target.classList.add("active");
      } else {
        // Fallback: activate by order
        const btn = document.querySelector(`.search-tab[onclick*="'${tab}'"]`);
        if (btn) btn.classList.add("active");
      }

      const pane = document.getElementById(String(tab) + "-tab");
      if (pane) pane.classList.add("active");
    };
  }

  function openBoujoSearch(query){
    alert("「" + query + "」を検索しています...\n\n「みんなの防除」サイトで詳細な情報をご覧いただけます。");
    window.open("https://boujo.agrinews.co.jp/", "_blank", "noopener");
  }

  if (typeof window.searchPest !== "function") {
    window.searchPest = function searchPest(){
      const el = document.getElementById("pestSearch");
      openBoujoSearch(el ? el.value : "");
    };
  }

  if (typeof window.searchDisease !== "function") {
    window.searchDisease = function searchDisease(){
      const el = document.getElementById("diseaseSearch");
      openBoujoSearch(el ? el.value : "");
    };
  }

  if (typeof window.searchSymptom !== "function") {
    window.searchSymptom = function searchSymptom(){
      const el = document.getElementById("symptomSearch");
      openBoujoSearch(el ? el.value : "");
    };
  }

  function openBoujoDetail(name, message){
    alert("「" + name + "」" + message + "\n\n「みんなの防除」サイトで詳細な対策方法をご確認ください。");
    window.open("https://boujo.agrinews.co.jp/", "_blank", "noopener");
  }

  if (typeof window.filterPest !== "function") {
    window.filterPest = function filterPest(name){
      openBoujoDetail(name, "の情報を表示します。");
    };
  }

  if (typeof window.filterDisease !== "function") {
    window.filterDisease = function filterDisease(name){
      openBoujoDetail(name, "の情報を表示します。");
    };
  }

  if (typeof window.filterSymptom !== "function") {
    window.filterSymptom = function filterSymptom(name){
      alert("「" + name + "」に関連する病害虫を表示します。\n\n「みんなの防除」サイトで詳細な診断をご確認ください。");
      window.open("https://boujo.agrinews.co.jp/", "_blank", "noopener");
    };
  }

  if (typeof window.switchDetectionTab !== "function") {
    window.switchDetectionTab = function switchDetectionTab(tab){
      const e = window.event;

      document.querySelectorAll(".detection-tab").forEach(t => t.classList.remove("active"));

      if (e && e.target) {
        const btn = e.target.closest(".detection-tab");
        if (btn) btn.classList.add("active");
      } else {
        const btn = document.querySelector(`.detection-tab[onclick*="'${tab}'"]`);
        if (btn) btn.classList.add("active");
      }

      document.querySelectorAll(".detection-content").forEach(c => c.classList.remove("active"));
      const pane = document.getElementById(String(tab) + "-detection");
      if (pane) pane.classList.add("active");
    };
  }
})();

