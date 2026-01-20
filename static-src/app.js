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
          spans[1].textContent = post.author
            ? `筆者：${post.author}`
            : "";
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

    const isList = !!$("#post-list");
    const isDetail = !!getDetailContentTarget();

    if (isList) {
      const url = `/static/${paper}/posts.json`;
      const posts = await fetchJson(url);
      renderList(posts, paper);
      return;
    }

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
