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

  // ========= TOP PAGE CARD GRID (index.html with #post-grid) =========
  function formatDateSlash(dateStr) {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return parts.join("/");
    }
    return dateStr;
  }

  function createTopPageCardHtml(post) {
    const title = escapeHtml(post.title || "(タイトルなし)");
    const date = formatDateSlash(post.date_ymd);
    const url = post.url || "detail.html?id=" + post.id;
    const image = post.featured_image || "/static-src/tomato/img/latest_1.jpg";

    return `
      <a class="card" href="${url}">
        <div class="image">
          <img src="${image}" alt="${title}" loading="lazy">
        </div>
        <div class="body">
          <div class="meta">${date}</div>
          <h3>${title}</h3>
        </div>
      </a>
    `;
  }

  function renderTopPageGrid(posts) {
    const grid = document.getElementById("post-grid");
    if (!grid) return;

    // Filter only published posts (status === 'publish', or all if no status field)
    const publishedPosts = posts.filter(function (p) {
      if (!p.hasOwnProperty("status")) return true;
      return p.status === "publish";
    });

    if (publishedPosts.length === 0) {
      grid.innerHTML =
        '<p style="grid-column: span 12; text-align: center; padding: 40px; color: #64748b;">公開済みの記事がありません</p>';
      return;
    }

    grid.innerHTML = publishedPosts.map(createTopPageCardHtml).join("");
  }
  // ========= END TOP PAGE CARD GRID =========

  // Helper function to get top page vtile elements
  function getTopVtiles() {
    return Array.from(document.querySelectorAll('a.vtile'));
  }

  async function main() {
    const paper = getPaperFromPath();
    if (!paper) return;

    // index.html uses #post-list
    const hasPostList = !!$("#post-list");
    // Top page (card grid with #post-grid)
    const hasPostGrid = !!document.getElementById("post-grid");
    // TOP page uses a.vtile
    const hasVtiles = getTopVtiles().length > 0;
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

    // Top page (card grid with #post-grid)
    if (hasPostGrid) {
      const url = `/static/${paper}/posts.json`;
      const posts = await fetchJson(url);
      renderTopPageGrid(posts);
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


/* ========================================
   TOP PAGE SCRIPTS (from tomato/js/script.js)
   ======================================== */

/**
 * Tomato News - Main JavaScript
 * トマト新聞メインスクリプト
 */

/* ===== Header Height Calculation ===== */
function updateHeaderHeight(){
  var hdr = document.querySelector('header');
  if(hdr){
    // Use double requestAnimationFrame to ensure media queries are evaluated
    requestAnimationFrame(function(){
      requestAnimationFrame(function(){
        var height = Math.ceil(hdr.getBoundingClientRect().height);
        if(height > 0){
          document.documentElement.style.setProperty('--hdrH', height + 'px');
        }
      });
    });
  }
}

// Update keyword bar height
function updateKeywordHeight(){
  var kwBar = document.querySelector('.kw-bar');
  if(kwBar){
    var height = Math.ceil(kwBar.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--kwH', height + 'px');
  } else {
    document.documentElement.style.setProperty('--kwH', '0px');
  }
}

// Initialize with defaults
document.documentElement.style.setProperty('--kwH', '0px');
document.documentElement.style.setProperty('--hdrH', '64px'); // Default mobile height

// Function to setup height tracking once header is found
function setupHeaderHeightTracking(){
  var hdr = document.querySelector('header');
  if(!hdr) return;
  
  // Header found, update heights
  updateHeaderHeight();
  updateKeywordHeight();
  
  // Update multiple times to catch media query changes
  setTimeout(updateHeaderHeight, 50);
  setTimeout(updateHeaderHeight, 150);
  setTimeout(updateHeaderHeight, 300);
  setTimeout(updateHeaderHeight, 500);
  
  // Watch for resize to recalculate
  var resizeTimer;
  window.addEventListener('resize', function(){
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function(){
      updateHeaderHeight();
      updateKeywordHeight();
    }, 100);
  });
  
  // Also update after window loads
  window.addEventListener('load', function(){
    updateHeaderHeight();
    updateKeywordHeight();
  });
}

// Wait for header to load - check immediately and also listen for event from components.js
(function checkHeader(){
  var hdr = document.querySelector('header');
  if(hdr){
    setupHeaderHeightTracking();
  } else {
    // Header not loaded yet, check again shortly
    setTimeout(checkHeader, 50);
  }
})();

// Listen for headerLoaded event from components.js
window.addEventListener('headerLoaded', function(){
  setupHeaderHeightTracking();
});

// Chips handling (unchanged)
(function(){
  var chips = document.querySelector('.pill-bar, .chip-row, .category-chips');
  if(chips){
    var ch = Math.ceil(chips.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--chipsH', ch + 'px');
    document.body.classList.add('has-chips');
    var ph = document.createElement('div'); ph.style.height = ch + 'px';
    chips.parentNode.insertBefore(ph, chips.nextSibling);
  }
})();

/* ===== Footer Accordion Function ===== */
function toggleFooterMenu(element) {
  if (window.innerWidth <= 768) {
    element.classList.toggle('active');
  }
}

/* ===== Utilities ===== */
const once = (fn) => { let done=false; return (...a)=>{ if(done) return; done=true; fn(...a); }; };
const debounce = (fn,ms=240)=>{ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; };

/* ===== Demo Modal ===== */
function openModal(kind){ alert(kind==='signin' ? 'ログイン（ダミー）' : '会員登録（ダミー）'); }

/* ===== Seamless Horizontal Lanes ===== */
function prepareSeamless(id){
  const track = document.getElementById(id);
  if(!track || track.dataset.cloned) return;
  const children = Array.from(track.children);
  children.forEach(el => track.appendChild(el.cloneNode(true)));
  track.dataset.cloned = "1";
}

/* ===== Vertical Columns ===== */
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
  if(window.matchMedia('(max-width:900px)').matches){
    setTimeout(()=>sticky.classList.add('active'), 1200);
  }else{
    sticky.classList.remove('active');
  }
}

document.addEventListener('DOMContentLoaded', boot);
window.addEventListener('load', boot);
window.addEventListener('resize', debounce(boot, 200));
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='visible') boot(); });

/* ===== Ad Thumbnail Background Assignment ===== */
(function(){
  var slots = document.querySelectorAll('.right-gallery .ad-slot');
  for (var i = 0; i < slots.length; i++) {
    var n = i + 1;
    slots[i].style.setProperty('--ad-img', 'url(./img/ad_' + n + '.jpg)');
  }
})();

/* ===== Local Image Mapping for Extra Sections ===== */
(function(){
  // 新着NEWS（latest_X.jpg）
  document.querySelectorAll('.latest-news img').forEach(function(el, i){
    el.src = './img/latest_' + (i + 1) + '.jpg';
  });

  // 新聞広告紹介（paperad_X.jpg）
  document.querySelectorAll('.paper-ad img').forEach(function(el, i){
    el.src = './img/paperad_' + (i + 1) + '.jpg';
  });

  // 紙面プレビュー（preview_X.jpg）
  document.querySelectorAll('.preview-paper img').forEach(function(el, i){
    el.src = './img/preview_' + (i + 1) + '.jpg';
  });

  // フッター広告（footerad_X.jpg） — 疑似要素背景で割当
  document.querySelectorAll('.footer-ad').forEach(function(el, i){
    el.style.setProperty('--footerad-img', 'url(./img/footerad_' + (i + 1) + '.jpg)');
  });
})();

/* ===== Override Selectors and Local Image Fix ===== */
(function(){
  // 新着NEWS: section#news 内の .card .image img
  document.querySelectorAll('#news .card .image img').forEach(function(el, i){
    el.src = './img/latest_' + (i + 1) + '.jpg';
  });

  // 新聞広告紹介枠: section#newspaper-ads 内の .card .image img
  document.querySelectorAll('#newspaper-ads .card .image img').forEach(function(el, i){
    el.src = './img/paperad_' + (i + 1) + '.jpg';
  });

  // 紙面プレビュー: section#paper 内の .card .image img
  document.querySelectorAll('#paper .card .image img').forEach(function(el, i){
    el.src = './img/preview_' + (i + 1) + '.jpg';
  });

  // フッター広告: alt="フッター広告" のimgを置換（タグはそのまま）
  var fimg = document.querySelector('footer img[alt="フッター広告"]');
  if (fimg){ fimg.src = './img/footerad_1.jpg'; }
})();

/* ===== KW Slider Boot ===== */
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

/* ===== KW Slider Boot v2 ===== */
(function(){
  function headerHeight(){
    var h=64;
    var hdr = document.querySelector('header, .header, [data-header]');
    if(hdr){ h = Math.ceil(hdr.getBoundingClientRect().height); }
    document.documentElement.style.setProperty('--hdrH', h+'px');
  }
  function kwHeight(){
    var kb = document.querySelector('.kw-bar');
    if(!kb) return;
    var h = Math.ceil(kb.getBoundingClientRect().height);
    document.documentElement.style.setProperty('--kwH', h+'px');
    document.body.classList.add('has-kw');
  }
  function init(){
    headerHeight(); kwHeight();
  }
  if(document.readyState==='loading'){ document.addEventListener('DOMContentLoaded', init); }
  else { init(); }
  window.addEventListener('resize', function(){ clearTimeout(window.__kw_r); window.__kw_r=setTimeout(init, 120); });
})();

/* ===== Square Thumbs Boot ===== */
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

/* ===== Mobile Menu Toggle ===== */
function toggleMobileMenu() {
  const menu = document.getElementById('mobileMenu');
  const overlay = document.getElementById('mobileMenuOverlay');
  menu.classList.toggle('active');
  overlay.classList.toggle('active');
}

/* ===== Dynamic Market Data Fetching - 4品種対応 ===== */
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
        },
        {
          item_code: 34410,
          item_name: "ファーストトマト",
          quantity_ton: null, // オフシーズン
          avg_price: null,
          diff_prev: { sign: null, value: null },
          file_date: "2025-11-26"
        }
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

