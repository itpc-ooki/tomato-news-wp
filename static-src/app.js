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
   * 産地データ大全: early-safe initializer
   * - page-survey is data-driven from /static/{paper}/survey.json
   * - define this early so later unrelated runtime errors do not block survey
   * ===================================================================== */
  (function ensureJaSurveyPageEarly() {
    if (!document.body || !document.body.classList.contains("page-survey")) return;
    if (window.__JA_SURVEY_EARLY_BOUND__) return;
    window.__JA_SURVEY_EARLY_BOUND__ = true;

    const REGION_ORDER = ["北海道", "東北", "関東", "中部", "近畿", "中国", "四国", "九州"];
    const PREF_TO_REGION = {
      "北海道":"北海道",
      "青森県":"東北","岩手県":"東北","宮城県":"東北","秋田県":"東北","山形県":"東北","福島県":"東北",
      "茨城県":"関東","栃木県":"関東","群馬県":"関東","埼玉県":"関東","千葉県":"関東","東京都":"関東","神奈川県":"関東",
      "新潟県":"中部","富山県":"中部","石川県":"中部","福井県":"中部","山梨県":"中部","長野県":"中部","岐阜県":"中部","静岡県":"中部","愛知県":"中部",
      "三重県":"近畿","滋賀県":"近畿","京都府":"近畿","大阪府":"近畿","兵庫県":"近畿","奈良県":"近畿","和歌山県":"近畿",
      "鳥取県":"中国","島根県":"中国","岡山県":"中国","広島県":"中国","山口県":"中国",
      "徳島県":"四国","香川県":"四国","愛媛県":"四国","高知県":"四国",
      "福岡県":"九州","佐賀県":"九州","長崎県":"九州","熊本県":"九州","大分県":"九州","宮崎県":"九州","鹿児島県":"九州","沖縄県":"九州"
    };

    function getPaperLocal() {
      try {
        const parts = window.location.pathname.split("/").filter(Boolean);
        const idx = parts.indexOf("static");
        if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
      } catch (_e) {}
      return "tomato";
    }

    async function fetchJsonLocal(url) {
      const res = await fetch(url, { cache: "no-store" });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      if (/^\s*</.test(text)) throw new Error(`HTML returned instead of JSON for ${url}`);
      return JSON.parse(text);
    }

    function stripHtmlLocal(text) {
      const tmp = document.createElement("div");
      tmp.innerHTML = String(text || "");
      return (tmp.textContent || tmp.innerText || "").trim();
    }

    function escapeHtmlLocal(text) {
      return String(text || "").replace(/[&<>"']/g, function(ch) {
        return ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[ch];
      });
    }

    function resolveImageUrlLocal(path) {
      if (!path) return "";
      if (/^https?:\/\//i.test(path)) return path;
      try {
        return new URL(String(path), window.location.origin).href;
      } catch (_e) {
        return String(path);
      }
    }

    function normalizePrefectureName(name) {
      return String(name || "").trim();
    }

    function getPostPrefectures(post) {
      const fromArray = Array.isArray(post && post.prefectures)
        ? post.prefectures.map(normalizePrefectureName).filter(Boolean)
        : [];
      if (fromArray.length) return Array.from(new Set(fromArray));
      const fallback = normalizePrefectureName(post && post.prefecture);
      return fallback ? [fallback] : [];
    }

    function getRegionName(prefecture, post) {
      const normalized = normalizePrefectureName(prefecture);
      if (normalized && PREF_TO_REGION[normalized]) return PREF_TO_REGION[normalized];
      const regions = Array.isArray(post && post.regions)
        ? post.regions.map(function(v){ return String(v || "").trim(); }).filter(Boolean)
        : [];
      if (regions.length) return regions[0];
      return "その他";
    }

    function getDetailHref(post) {
      if (post && post.url) return String(post.url);
      if (post && post.id) return `detail.html?id=${encodeURIComponent(post.id)}`;
      return "#";
    }

    function buildAssociationTile(post, prefectureName) {
      const a = document.createElement("a");
      a.className = "association-tile";
      a.href = getDetailHref(post);

      const image = resolveImageUrlLocal(post && post.featured_image);
      const title = stripHtmlLocal(post && post.title);
      const excerpt = stripHtmlLocal(post && post.excerpt);

      a.innerHTML =
        `<div class="association-tile-img">${
          image
            ? `<img src="${escapeHtmlLocal(image)}" alt="${escapeHtmlLocal(title)}" loading="lazy">`
            : `<div class="association-tile-placeholder">産地データ大全</div>`
        }</div>` +
        `<div class="association-tile-overlay">` +
          `<div class="association-tile-prefecture">${escapeHtmlLocal(prefectureName)}</div>` +
          `<h3 class="association-tile-name">${escapeHtmlLocal(title || "名称未設定")}</h3>` +
          (excerpt ? `<p class="association-tile-excerpt">${escapeHtmlLocal(excerpt)}</p>` : ``) +
        `</div>`;

      return a;
    }

    function sortPrefectures(names) {
      return names.slice().sort(function(a, b) {
        return String(a).localeCompare(String(b), "ja");
      });
    }

    async function loadSurveyData() {
      const paper = getPaperLocal();
      const candidates = [
        `/static/${encodeURIComponent(paper)}/survey.json`,
        `./survey.json`,
        `survey.json`
      ];

      let data = null;
      let lastError = null;
      for (const url of candidates) {
        try {
          data = await fetchJsonLocal(url);
          if (Array.isArray(data)) return data;
        } catch (e) {
          lastError = e;
        }
      }
      throw lastError || new Error("survey.json could not be loaded");
    }

    function buildPrefectureIndex(posts) {
      const map = new Map();
      (Array.isArray(posts) ? posts : []).forEach(function(post) {
        const prefs = getPostPrefectures(post);
        prefs.forEach(function(prefName) {
          const current = map.get(prefName) || [];
          current.push(post);
          map.set(prefName, current);
        });
      });
      return map;
    }

    function renderPrefectureGroups(prefectureMap, onSelect, selectedPrefecture) {
      const root = document.getElementById("prefectureList");
      if (!root) return;

      const grouped = {};
      Array.from(prefectureMap.keys()).forEach(function(prefName) {
        const regionName = getRegionName(prefName, (prefectureMap.get(prefName) || [])[0]);
        if (!grouped[regionName]) grouped[regionName] = [];
        grouped[regionName].push(prefName);
      });

      const outer = document.createElement("div");
      outer.className = "survey-region-groups";

      const orderedRegions = REGION_ORDER
        .filter(function(name){ return Array.isArray(grouped[name]) && grouped[name].length; })
        .concat(
          Object.keys(grouped)
            .filter(function(name){ return !REGION_ORDER.includes(name); })
            .sort(function(a, b){ return a.localeCompare(b, "ja"); })
        );

      orderedRegions.forEach(function(regionName) {
        const section = document.createElement("section");
        section.className = "survey-region-group";

        const title = document.createElement("h3");
        title.className = "survey-region-title";
        title.textContent = regionName;
        section.appendChild(title);

        const grid = document.createElement("div");
        grid.className = "prefecture-list";

        sortPrefectures(grouped[regionName]).forEach(function(prefName) {
          const count = (prefectureMap.get(prefName) || []).length;
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "prefecture-card" + (selectedPrefecture === prefName ? " selected is-active" : "");
          btn.setAttribute("data-prefecture", prefName);
          btn.innerHTML =
            `<div class="prefecture-name">${escapeHtmlLocal(prefName)}</div>` +
            `<div class="prefecture-count">${count}部会</div>`;
          btn.addEventListener("click", function() {
            onSelect(prefName);
          });
          grid.appendChild(btn);
        });

        section.appendChild(grid);
        outer.appendChild(section);
      });

      root.innerHTML = "";
      root.appendChild(outer);
    }

    function renderSelectOptions(prefectureMap, selectedPrefecture) {
      const select = document.getElementById("prefectureSelect");
      if (!select) return;

      const prefectures = sortPrefectures(Array.from(prefectureMap.keys()));
      select.innerHTML = `<option value="">すべての都道府県</option>`;
      prefectures.forEach(function(prefName) {
        const option = document.createElement("option");
        option.value = prefName;
        option.textContent = prefName;
        if (prefName === selectedPrefecture) option.selected = true;
        select.appendChild(option);
      });
    }

    function renderAssociationList(prefectureMap, selectedPrefecture) {
      const section = document.getElementById("associationSection");
      const title = document.getElementById("selectedPrefectureTitle");
      const list = document.getElementById("associationList");
      const empty = document.getElementById("associationEmptyMessage");
      if (!section || !title || !list || !empty) return;

      if (!selectedPrefecture) {
        section.style.display = "none";
        list.innerHTML = "";
        empty.hidden = true;
        title.textContent = "部会一覧";
        return;
      }

      const posts = prefectureMap.get(selectedPrefecture) || [];
      title.textContent = `${selectedPrefecture}の部会一覧`;
      list.innerHTML = "";

      if (!posts.length) {
        section.style.display = "";
        empty.hidden = false;
        return;
      }

      empty.hidden = true;
      posts
        .slice()
        .sort(function(a, b) {
          const at = Date.parse(String((a && (a.date || a.date_ymd)) || "")) || 0;
          const bt = Date.parse(String((b && (b.date || b.date_ymd)) || "")) || 0;
          return bt - at;
        })
        .forEach(function(post) {
          list.appendChild(buildAssociationTile(post, selectedPrefecture));
        });

      section.style.display = "";
    }

    function updateStats(prefectureMap) {
      const prefCountEl = document.getElementById("surveyPrefectureCount");
      const assocCountEl = document.getElementById("surveyAssociationCount");

      if (prefCountEl) prefCountEl.textContent = String(prefectureMap.size);

      if (assocCountEl) {
        const uniquePostIds = new Set();
        Array.from(prefectureMap.values()).forEach(function(items) {
          (Array.isArray(items) ? items : []).forEach(function(post) {
            const key = String((post && (post.id || post.url || post.title)) || "").trim();
            if (key) uniquePostIds.add(key);
          });
        });
        assocCountEl.textContent = String(uniquePostIds.size);
      }
    }

    function maybeSelectFromQuery(prefectureMap) {
      try {
        const sp = new URLSearchParams(window.location.search || "");
        const pref = normalizePrefectureName(sp.get("prefecture") || "");
        return pref && prefectureMap.has(pref) ? pref : "";
      } catch (_e) {
        return "";
      }
    }

    function syncQuery(prefectureName) {
      try {
        const url = new URL(window.location.href);
        if (prefectureName) url.searchParams.set("prefecture", prefectureName);
        else url.searchParams.delete("prefecture");
        window.history.replaceState({}, "", url.toString());
      } catch (_e) {}
    }

    function scrollToAssociations() {
      const section = document.getElementById("associationSection");
      if (!section || section.style.display === "none") return;
      try {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (_e) {
        section.scrollIntoView();
      }
    }


    async function loadSurveyTopData() {
      const paper = getPaperLocal();
      const candidates = [
        `/static/${encodeURIComponent(paper)}/survey-top.json`,
        `./survey-top.json`,
        `survey-top.json`
      ];

      let data = null;
      let lastError = null;
      for (const url of candidates) {
        try {
          data = await fetchJsonLocal(url);
          if (data) return data;
        } catch (e) {
          lastError = e;
        }
      }
      if (lastError) throw lastError;
      return null;
    }

    function normalizeGraphItems(items) {
      if (!Array.isArray(items)) return [];
      return items.map(function(item) {
        if (!item || typeof item !== "object") return null;
        const label = String(item.label || item.name || "").trim();
        const raw = item.value != null ? item.value : item.percent;
        let value = Number(raw);
        if (!Number.isFinite(value)) value = 0;
        value = Math.max(0, Math.min(100, value));
        return label ? { label: label, value: value } : null;
      }).filter(Boolean);
    }

    function normalizeSurveyTopEntry(entry) {
      if (!entry || typeof entry !== "object") return null;
      const graphDefaults = [
        { id: "graph1", title: "困っている害虫" },
        { id: "graph2", title: "困っている病害" },
        { id: "graph3", title: "困っている生理障害" },
        { id: "graph4", title: "導入したい資機材" }
      ];

      const rawGraphs = Array.isArray(entry.graphs) ? entry.graphs : [];
      const graphs = graphDefaults.map(function(def, index) {
        const source = rawGraphs[index] || entry[def.id] || {};
        const sourceItems = Array.isArray(source.items) ? source.items : (Array.isArray(source.categories) ? source.categories : []);
        return {
          id: String(source.id || def.id),
          title: String(source.title || def.title),
          section_title: String(source.section_title || source.sectionTitle || source.title || def.title).trim(),
          section_text: String(source.section_text || source.sectionText || "").trim(),
          section_highlight: String(source.section_highlight || source.sectionHighlight || "").trim(),
          items: normalizeGraphItems(sourceItems)
        };
      }).filter(function(graph){ return graph.items.length; });

      return {
        id: Number(entry.id || 0),
        survey_year: String(entry.survey_year || entry.year || entry.survey_top_year || "").trim(),
        survey_season: String(entry.survey_season || entry.season || "").trim(),
        survey_season_slug: String(entry.survey_season_slug || entry.season_slug || "").trim(),
        page_title: String(entry.page_title || entry.title || "").trim(),
        page_subtitle: String(entry.page_subtitle || entry.lead_subtitle || "").trim(),
        hero_title: String(entry.hero_title || "").trim(),
        hero_description: String(entry.hero_description || "").trim(),
        detail_title: String(entry.detail_title || "").trim(),
        detail_subtitle: String(entry.detail_subtitle || "").trim(),
        detail_description: String(entry.detail_description || "").trim(),
        total_producers: String(entry.total_producers || entry.stats_total_producers || "").trim(),
        response_rate: String(entry.response_rate || entry.stats_response_rate || "").trim(),
        graphs: graphs
      };
    }

    function getRequestedSurveyKey() {
      let year = "";
      let season = "";
      try {
        const sp = new URLSearchParams(window.location.search || "");
        year = String(sp.get("survey_year") || "").trim();
        season = String(sp.get("survey_season") || "").trim();
      } catch (_e) {}
      if (!year && document.body) year = String(document.body.getAttribute("data-survey-year") || "").trim();
      if (!season && document.body) season = String(document.body.getAttribute("data-survey-season") || "").trim();
      return { year: year, season: season };
    }

    function normalizeSurveySeasonValue(value) {
      const raw = String(value || "").trim().toLowerCase();
      if (!raw) return "";
      if (
        raw === "winter" ||
        raw === "winter-spring" ||
        raw === "winter_spring" ||
        raw === "winter spring" ||
        raw === "fuyu-haru" ||
        raw === "fuyuharu" ||
        raw === "冬春"
      ) return "winter";
      if (
        raw === "summer" ||
        raw === "summer-autumn" ||
        raw === "summer_autumn" ||
        raw === "summer autumn" ||
        raw === "summer-fall" ||
        raw === "summer_fall" ||
        raw === "summer fall" ||
        raw === "natsu-aki" ||
        raw === "natsuaki" ||
        raw === "夏秋"
      ) return "summer";
      return raw;
    }

    function pickSurveyTopEntry(data) {
      const rawItems = Array.isArray(data) ? data : (Array.isArray(data && data.items) ? data.items : (data ? [data] : []));
      const items = rawItems.map(normalizeSurveyTopEntry).filter(Boolean);
      if (!items.length) return null;

      const requested = getRequestedSurveyKey();
      const requestedYear = String(requested.year || "").trim();
      const requestedSeason = normalizeSurveySeasonValue(requested.season);

      if (requestedYear || requestedSeason) {
        const exact = items.find(function(item) {
          const itemYear = String(item && item.survey_year || "").trim();
          const itemSeason = normalizeSurveySeasonValue((item && (item.survey_season_slug || item.survey_season)) || "");
          const sameYear = !requestedYear || itemYear === requestedYear;
          const sameSeason = !requestedSeason || itemSeason === requestedSeason;
          return sameYear && sameSeason;
        });
        if (exact) return exact;
        return null;
      }
      return items[0];
    }

    function getPostSurveyYear(post) {
      const direct = String((post && (post.survey_year || post.year)) || "").trim();
      return direct;
    }

    function getPostSurveySeason(post) {
      return normalizeSurveySeasonValue(
        (post && (post.survey_season_slug || post.season_slug || post.survey_season || post.season)) || ""
      );
    }

    function filterSurveyPostsByCurrentState(posts) {
      const requested = getRequestedSurveyKey();
      const requestedYear = String(requested.year || "").trim();
      const requestedSeason = normalizeSurveySeasonValue(requested.season);
      const list = Array.isArray(posts) ? posts : [];

      return list.filter(function(post) {
        const postYear = getPostSurveyYear(post);
        const postSeason = getPostSurveySeason(post);
        const sameYear = !requestedYear ? true : postYear === requestedYear;
        const sameSeason = !requestedSeason ? true : postSeason === requestedSeason;
        return sameYear && sameSeason;
      });
    }

    function formatStatValue(value, suffix) {
      const raw = String(value || "").trim();
      if (!raw) return "";
      if (/[%％]$/.test(raw) || /人$/.test(raw)) return raw;
      if (suffix === "%") return raw + "%";
      try {
        const num = Number(raw.replace(/,/g, ""));
        if (Number.isFinite(num) && suffix !== "%") return num.toLocaleString("ja-JP");
      } catch (_e) {}
      return raw;
    }
    function renderParagraphBlocks(text) {
      const normalized = String(text || "").replaceAll("\r\n", "\n").replaceAll("\r", "\n").trim();
      if (!normalized) return "";
      return normalized
        .split(/\n{2,}/)
        .map(function(block) {
          const html = escapeHtmlLocal(block).split("\n").join("<br>");
          return `<p>${html}</p>`;
        })
        .join("");
    }

function renderGraphItems(items) {
      return items.map(function(item) {
        const width = Math.max(0, Math.min(100, Number(item.value) || 0));
        const pct = `${Math.round(width)}%`;
        return `
          <div class="simple-bar-item">
            <div class="simple-bar-label">${escapeHtmlLocal(item.label)}</div>
            <div class="simple-bar-track">
              <div class="simple-bar-fill${width === 0 ? " is-zero" : ""}" style="width:${width}%">${escapeHtmlLocal(pct)}</div>
            </div>
          </div>`;
      }).join("");
    }

    function renderSurveyTopContent(entry) {
      const root = document.getElementById("surveyTopDynamicContent");
      if (!root || !entry || !entry.graphs.length) return;

      const detailTitle = entry.detail_title || "部会アンケート詳細";
      const detailSubtitle = entry.detail_subtitle || "アンケート集計結果";
      const detailDescription = entry.detail_description || "全国の回答結果をもとに主な課題をまとめています。";

      const icons = [
        '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"></path></svg>',
        '<svg viewBox="0 0 24 24"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"></path></svg>',
        '<svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14h-2v-2h2v2zm0-4h-2V7h2v6z"></path></svg>'
      ];

      const sections = entry.graphs.map(function(graph, index) {
        const sectionTitle = graph.section_title || graph.title;
        const sectionTextHtml = renderParagraphBlocks(graph.section_text);
        const sectionHighlightHtml = renderParagraphBlocks(graph.section_highlight);
        const hasTextContent = Boolean(sectionTextHtml || sectionHighlightHtml);

        return `
          <div class="detail-section">
            <div class="detail-section-header">
              <div class="detail-section-icon">${icons[Math.min(index, icons.length - 1)] || icons[icons.length - 1]}</div>
              <h3 class="detail-section-title">${escapeHtmlLocal(sectionTitle)}</h3>
            </div>
            <div class="detail-content${hasTextContent ? " has-text" : ""}">
              <div class="detail-text${hasTextContent ? "" : " is-empty"}">
                ${sectionTextHtml}
                ${sectionHighlightHtml ? `<div class="detail-highlight">${sectionHighlightHtml}</div>` : ""}
              </div>
              <div class="detail-chart">
                <p class="chart-title-small">グラフ${index + 1}「${escapeHtmlLocal(graph.title)}」</p>
                <div class="simple-bar-chart">${renderGraphItems(graph.items)}</div>
              </div>
            </div>
          </div>`;
      });

      root.innerHTML = `
        <div class="survey-detail-header">
          <h2 class="survey-detail-title">${escapeHtmlLocal(detailTitle)}</h2>
          <p class="survey-detail-subtitle">${escapeHtmlLocal(detailSubtitle)}</p>
          <p class="survey-detail-description">${escapeHtmlLocal(detailDescription)}</p>
        </div>
        ${sections.join("") || '<div class="survey-top-empty">グラフデータがありません。</div>'}`;
    }


    function renderSurveyTopEmptyState() {
      const pageTitle = document.getElementById("surveyPageTitle");
      const pageSubtitle = document.getElementById("surveyPageSubtitle");
      const heroTitle = document.getElementById("surveyHeroTitle");
      const heroDescription = document.getElementById("surveyHeroDescription");
      const totalProducers = document.getElementById("surveyTotalProducers");
      const responseRate = document.getElementById("surveyResponseRate");
      const root = document.getElementById("surveyTopDynamicContent");
      const requested = getRequestedSurveyKey();
      const requestedYear = String(requested.year || "").trim();
      const requestedSeason = normalizeSurveySeasonValue(requested.season);
      const seasonLabel = requestedSeason === "winter" ? "冬春" : (requestedSeason === "summer" ? "夏秋" : "");
      const heading = [requestedYear ? requestedYear + "年" : "", seasonLabel].filter(Boolean).join(" ") || "選択中の条件";

      if (pageTitle) pageTitle.textContent = "産地データ大全";
      if (pageSubtitle) pageSubtitle.textContent = heading + " のTOPデータはまだありません。";
      if (heroTitle) heroTitle.textContent = heading + " のデータ準備中";
      if (heroDescription) heroDescription.textContent = "選択された年度・シーズンに一致する産地データTOPが見つかりませんでした。";
      if (totalProducers) totalProducers.textContent = "—";
      if (responseRate) responseRate.textContent = "—";
      if (root) {
        root.innerHTML = '<div class="survey-top-empty">選択された年度・シーズンに一致する産地データTOPデータがありません。</div>';
      }
    }

    function applySurveyTopEntry(entry) {
      if (!entry) return;
      const pageTitle = document.getElementById("surveyPageTitle");
      const pageSubtitle = document.getElementById("surveyPageSubtitle");
      const heroTitle = document.getElementById("surveyHeroTitle");
      const heroDescription = document.getElementById("surveyHeroDescription");
      const totalProducers = document.getElementById("surveyTotalProducers");
      const responseRate = document.getElementById("surveyResponseRate");

      if (pageTitle && entry.page_title) pageTitle.textContent = entry.page_title;
      if (pageSubtitle && entry.page_subtitle) pageSubtitle.textContent = entry.page_subtitle;
      if (heroTitle && entry.hero_title) heroTitle.textContent = entry.hero_title;
      if (heroDescription && entry.hero_description) heroDescription.textContent = entry.hero_description;
      if (totalProducers && entry.total_producers) totalProducers.textContent = formatStatValue(entry.total_producers, "");
      if (responseRate && entry.response_rate) responseRate.textContent = formatStatValue(entry.response_rate, "%");
      renderSurveyTopContent(entry);
    }

    async function run() {
      if (window.__JA_SURVEY_RENDERED__) return;
      try {
        const posts = await loadSurveyData();
        const filteredPosts = filterSurveyPostsByCurrentState(posts);
        const prefectureMap = buildPrefectureIndex(filteredPosts);
        const select = document.getElementById("prefectureSelect");
        const searchBtn = document.getElementById("surveySearchButton");

        try {
          const surveyTopData = await loadSurveyTopData();
          const entry = pickSurveyTopEntry(surveyTopData);
          if (entry) {
            applySurveyTopEntry(entry);
          } else if (getRequestedSurveyKey().year || getRequestedSurveyKey().season) {
            renderSurveyTopEmptyState();
          }
        } catch (_e) {
          if (getRequestedSurveyKey().year || getRequestedSurveyKey().season) {
            renderSurveyTopEmptyState();
          }
        }

        if (!prefectureMap.size) {
          const empty = document.getElementById("associationEmptyMessage");
          const section = document.getElementById("associationSection");
          if (section) section.style.display = "";
          if (empty) {
            empty.hidden = false;
            empty.textContent = "産地データ大全のデータがまだありません。";
          }
          return;
        }

        window.__JA_SURVEY_RENDERED__ = true;
        let selectedPrefecture = maybeSelectFromQuery(prefectureMap);

        function rerender() {
          updateStats(prefectureMap);
          renderSelectOptions(prefectureMap, selectedPrefecture);
          renderPrefectureGroups(prefectureMap, function(prefName) {
            selectedPrefecture = prefName;
            syncQuery(selectedPrefecture);
            rerender();
            scrollToAssociations();
          }, selectedPrefecture);
          renderAssociationList(prefectureMap, selectedPrefecture);
        }

        if (select && !select.dataset.jaSurveyBound) {
          select.dataset.jaSurveyBound = "1";
          select.addEventListener("change", function() {
            selectedPrefecture = normalizePrefectureName(this.value);
          });
        }

        if (searchBtn && !searchBtn.dataset.jaSurveyBound) {
          searchBtn.dataset.jaSurveyBound = "1";
          searchBtn.addEventListener("click", function() {
            syncQuery(selectedPrefecture);
            rerender();
            scrollToAssociations();
          });
        }

        rerender();
      } catch (error) {
        console.error("[産地データ大全] render failed:", error);
        const section = document.getElementById("associationSection");
        const empty = document.getElementById("associationEmptyMessage");
        if (section) section.style.display = "";
        if (empty) {
          empty.hidden = false;
          empty.textContent = "産地データ大全の読み込みに失敗しました。survey.json を確認してください。";
        }
      }
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run);
    } else {
      run();
    }
    window.addEventListener("load", run);
    setTimeout(run, 0);
    setTimeout(run, 300);
  })();

  /* =====================================================================
   * Mobile menu globals (must be defined early)
   * - header.html uses inline onclick="toggleMobileMenu()"
   * - If any later logic throws, we still want the mobile menu to work.
   * ===================================================================== */
  (function ensureMobileMenuGlobals(){
    function getEls(){
      return {
        menu: document.getElementById("mobileMenu"),
        overlay: document.getElementById("mobileMenuOverlay"),
      };
    }

    if (typeof window.toggleMobileMenu !== "function") {
      window.toggleMobileMenu = function toggleMobileMenu(){
        const els = getEls();
        if (!els.menu || !els.overlay) return;
        els.menu.classList.toggle("active");
        els.overlay.classList.toggle("active");
        // Prevent background scroll when menu is open
        if (els.menu.classList.contains("active")) {
          document.body.style.overflow = "hidden";
        } else {
          document.body.style.overflow = "";
        }
      };
    }

    if (typeof window.closeMobileMenu !== "function") {
      window.closeMobileMenu = function closeMobileMenu(){
        const els = getEls();
        if (!els.menu || !els.overlay) return;
        els.menu.classList.remove("active");
        els.overlay.classList.remove("active");
        document.body.style.overflow = "";
      };
    }

    // Safe bindings (only if elements exist)
    function bind(){
      const els = getEls();
      if (els.overlay) {
        els.overlay.addEventListener("click", window.closeMobileMenu);
      }
      if (els.menu) {
        const closeBtn = els.menu.querySelector(".mobile-menu-close");
        if (closeBtn) closeBtn.addEventListener("click", window.closeMobileMenu);
      }
      document.addEventListener("keydown", function(e){
        if (e.key === "Escape") window.closeMobileMenu();
      });
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
    else bind();
  })();


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
        gate: document.getElementById("paywall-gate"),
        wrapper: document.querySelector(".video-player-wrapper"),
        footer: document.querySelector("#videoModal .modal-footer"),
      };
    }

    function isWebSeminarUserLoggedIn(){
      try {
        if (window.TomatoAuth) {
          if (typeof window.TomatoAuth.currentUser === "function") {
            const u = window.TomatoAuth.currentUser();
            if (u && (u.email || u.id || u.name)) return true;
          }
          if (typeof window.TomatoAuth.isLoggedIn === "function") {
            return !!window.TomatoAuth.isLoggedIn();
          }
        }

        if (window.TOMATO_AUTH && typeof window.TOMATO_AUTH.isLoggedIn === "function") {
          return !!window.TOMATO_AUTH.isLoggedIn();
        }

        try {
          const ls = window.localStorage;
          const ss = window.sessionStorage;
          const currentUserRaw = ls ? ls.getItem("tomato_member_current_user_v1") : "";
          const authToken = ls ? ls.getItem("tomato_member_auth_token_v1") : "";
          if ((authToken && String(authToken).trim()) || (currentUserRaw && String(currentUserRaw).trim())) {
            return true;
          }
          const email1 = ls ? ls.getItem("tomato_session_email_v1") : "";
          const email2 = ss ? ss.getItem("tomato_session_email_session_v1") : "";
          if ((email1 && email1.trim()) || (email2 && email2.trim())) return true;
        } catch (_storageError) {}

        return false;
      } catch (_e) {
        return false;
      }
    }

    function renderWebSeminarPaywallGate(){
      const els = getEls();
      const gate = els.gate;
      if (!gate) return;

      const paper = (typeof getCurrentPaper === "function" && getCurrentPaper()) || "tomato";
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

    function showWebSeminarPaywallGate(){
      const els = getEls();
      if (!els.gate) return;
      renderWebSeminarPaywallGate();
      els.gate.style.display = "flex";
      if (els.wrapper) els.wrapper.classList.add("is-paywalled");
      if (els.footer) els.footer.classList.add("is-paywalled");
    }

    function hideWebSeminarPaywallGate(){
      const els = getEls();
      if (els.gate) els.gate.style.display = "none";
      if (els.wrapper) els.wrapper.classList.remove("is-paywalled");
      if (els.footer) els.footer.classList.remove("is-paywalled");
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

        els.modal.classList.add("active");
        document.body.style.overflow = "hidden";

        if (isWebSeminarUserLoggedIn()) {
          hideWebSeminarPaywallGate();
          els.player.src = embedUrl;
        } else {
          els.player.src = "";
          showWebSeminarPaywallGate();
        }
      };
    }

    if (typeof window.closeVideoModal !== "function") {
      window.closeVideoModal = function closeVideoModal(){
        const els = getEls();
        if (!els.modal || !els.player) return;
        els.modal.classList.remove("active");
        els.player.src = "";
        hideWebSeminarPaywallGate();
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

  /* =====================================================================
   * WEBセミナー: 採録紙面（posts.json から動的表示）
   * - 記事タイプ（article_type）が「採録紙面」の記事を最大3件表示
   * - 0件: すべての .seminar-article を非表示（DOMから削除）
   * - 1-2件: その数だけ表示（残りは削除）
   * - 3件以上: 3つすべて表示
   *
   * NOTE:
   * - この処理は「できるだけ早く」定義しておき、他の処理で例外が起きても
   *   WEBセミナーの採録紙面表示が止まらないようにしています。
   * ===================================================================== */
  (function initWebSeminarRecordArticlesEarly() {
    const section = document.querySelector(".past-seminars-section");
    if (!section) return;

    function stripHtmlLocal(text) {
      const tmp = document.createElement("div");
      tmp.innerHTML = String(text ?? "");
      return (tmp.textContent || tmp.innerText || "").trim();
    }

    function resolveUrlMaybeRelativeLocal(path) {
      if (!path) return "";
      if (/^https?:\/\//i.test(path)) return path;
      try {
        return new URL(path, window.location.origin).href;
      } catch (_e) {
        return String(path);
      }
    }

    function safeDateValue(p) {
      const d = (p && (p.date || p.date_ymd)) || "";
      const t = Date.parse(String(d));
      return Number.isFinite(t) ? t : 0;
    }

    function isNewPost(p) {
      const publishedAt = safeDateValue(p);
      if (!publishedAt) return false;
      const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
      return Date.now() - publishedAt <= ONE_WEEK_MS;
    }

    function syncTopNewBadge(tileEl, post) {
      if (!tileEl) return;

      const existing = tileEl.querySelector('.vtile-badge-new');
      if (!isNewPost(post)) {
        if (existing) existing.remove();
        return;
      }

      if (existing) return;

      const badge = document.createElement('span');
      badge.className = 'vtile-badge-new';
      badge.textContent = 'NEW';
      tileEl.appendChild(badge);
    }

    function getPaperFromPathLocal() {
      const parts = window.location.pathname.split("/").filter(Boolean);
      const idx = parts.indexOf("static");
      if (idx !== -1 && parts.length >= idx + 2) return parts[idx + 1];
      return null;
    }

    async function fetchJsonLocal(url) {
      const res = await fetch(url, { cache: "no-store" });
      const contentType = res.headers.get("content-type") || "";
      const text = await res.text();

      if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}\n${text.slice(0, 200)}`);
      }

      if (contentType.includes("text/html") || text.trim().startsWith("<")) {
        throw new Error(`Not JSON response from ${url} (received HTML)`);
      }

      return JSON.parse(text);
    }

    function buildRecordCard(post) {
      const a = document.createElement("a");
      a.className = "seminar-article-link";
      a.href =
        post && post.url
          ? String(post.url)
          : post && post.id
          ? `detail.html?id=${post.id}`
          : "#";

      const thumb = document.createElement("div");
      thumb.className = "article-thumbnail";
      const img = document.createElement("img");
      const title = stripHtmlLocal((post && post.title) || "");
      const imgUrl = resolveUrlMaybeRelativeLocal((post && post.featured_image) || "");
      if (imgUrl) {
        img.src = imgUrl;
        img.alt = title;
        img.loading = "lazy";
      } else {
        img.alt = "";
        img.style.display = "none";
      }
      thumb.appendChild(img);

      const badge = document.createElement("span");
      badge.className = "article-badge";
      badge.textContent = "採録紙面";

      const h3 = document.createElement("h3");
      // NOTE: style.css currently styles ".seminar-card .article-title",
      // so we add both classes to match either selector.
      h3.className = "article-title";
      h3.textContent = title;

      const p = document.createElement("p");
      p.className = "article-excerpt";
      p.textContent = stripHtmlLocal((post && post.excerpt) || "");

      const more = document.createElement("span");
      more.className = "article-read-more";
      more.innerHTML =
        '記事を読む\n' +
        '<svg width="16" height="16" viewBox="0 0 16 16" fill="none">\n' +
        '  <path d="M6 12L10 8L6 4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>\n' +
        '</svg>';

      a.appendChild(thumb);
      a.appendChild(badge);
      a.appendChild(h3);
      a.appendChild(p);
      a.appendChild(more);

      return a;
    }


    async function loadSurveyTopData() {
      const paper = getPaperLocal();
      const candidates = [
        `/static/${encodeURIComponent(paper)}/survey-top.json`,
        `./survey-top.json`,
        `survey-top.json`
      ];

      let data = null;
      let lastError = null;
      for (const url of candidates) {
        try {
          data = await fetchJsonLocal(url);
          if (data) return data;
        } catch (e) {
          lastError = e;
        }
      }
      if (lastError) throw lastError;
      return null;
    }

    function normalizeGraphItems(items) {
      if (!Array.isArray(items)) return [];
      return items.map(function(item) {
        if (!item || typeof item !== "object") return null;
        const label = String(item.label || item.name || "").trim();
        const raw = item.value != null ? item.value : item.percent;
        let value = Number(raw);
        if (!Number.isFinite(value)) value = 0;
        value = Math.max(0, Math.min(100, value));
        return label ? { label: label, value: value } : null;
      }).filter(Boolean);
    }

    function normalizeSurveyTopEntry(entry) {
      if (!entry || typeof entry !== "object") return null;
      const graphDefaults = [
        { id: "graph1", title: "困っている害虫" },
        { id: "graph2", title: "困っている病害" },
        { id: "graph3", title: "困っている生理障害" },
        { id: "graph4", title: "導入したい資機材" }
      ];

      const rawGraphs = Array.isArray(entry.graphs) ? entry.graphs : [];
      const graphs = graphDefaults.map(function(def, index) {
        const source = rawGraphs[index] || entry[def.id] || {};
        const sourceItems = Array.isArray(source.items) ? source.items : (Array.isArray(source.categories) ? source.categories : []);
        return {
          id: String(source.id || def.id),
          title: String(source.title || def.title),
          section_title: String(source.section_title || source.sectionTitle || source.title || def.title).trim(),
          section_text: String(source.section_text || source.sectionText || "").trim(),
          section_highlight: String(source.section_highlight || source.sectionHighlight || "").trim(),
          items: normalizeGraphItems(sourceItems)
        };
      }).filter(function(graph){ return graph.items.length; });

      return {
        id: Number(entry.id || 0),
        survey_year: String(entry.survey_year || entry.year || entry.survey_top_year || "").trim(),
        survey_season: String(entry.survey_season || entry.season || "").trim(),
        survey_season_slug: String(entry.survey_season_slug || entry.season_slug || "").trim(),
        page_title: String(entry.page_title || entry.title || "").trim(),
        page_subtitle: String(entry.page_subtitle || entry.lead_subtitle || "").trim(),
        hero_title: String(entry.hero_title || "").trim(),
        hero_description: String(entry.hero_description || "").trim(),
        detail_title: String(entry.detail_title || "").trim(),
        detail_subtitle: String(entry.detail_subtitle || "").trim(),
        detail_description: String(entry.detail_description || "").trim(),
        total_producers: String(entry.total_producers || entry.stats_total_producers || "").trim(),
        response_rate: String(entry.response_rate || entry.stats_response_rate || "").trim(),
        graphs: graphs
      };
    }

    function getRequestedSurveyKey() {
      let year = "";
      let season = "";
      try {
        const sp = new URLSearchParams(window.location.search || "");
        year = String(sp.get("survey_year") || "").trim();
        season = String(sp.get("survey_season") || "").trim();
      } catch (_e) {}
      if (!year && document.body) year = String(document.body.getAttribute("data-survey-year") || "").trim();
      if (!season && document.body) season = String(document.body.getAttribute("data-survey-season") || "").trim();
      return { year: year, season: season };
    }

    function normalizeSurveySeasonValue(value) {
      const raw = String(value || "").trim().toLowerCase();
      if (!raw) return "";
      if (
        raw === "winter" ||
        raw === "winter-spring" ||
        raw === "winter_spring" ||
        raw === "winter spring" ||
        raw === "fuyu-haru" ||
        raw === "fuyuharu" ||
        raw === "冬春"
      ) return "winter";
      if (
        raw === "summer" ||
        raw === "summer-autumn" ||
        raw === "summer_autumn" ||
        raw === "summer autumn" ||
        raw === "summer-fall" ||
        raw === "summer_fall" ||
        raw === "summer fall" ||
        raw === "natsu-aki" ||
        raw === "natsuaki" ||
        raw === "夏秋"
      ) return "summer";
      return raw;
    }

    function pickSurveyTopEntry(data) {
      const rawItems = Array.isArray(data) ? data : (Array.isArray(data && data.items) ? data.items : (data ? [data] : []));
      const items = rawItems.map(normalizeSurveyTopEntry).filter(Boolean);
      if (!items.length) return null;

      const requested = getRequestedSurveyKey();
      const requestedYear = String(requested.year || "").trim();
      const requestedSeason = normalizeSurveySeasonValue(requested.season);

      if (requestedYear || requestedSeason) {
        const exact = items.find(function(item) {
          const itemYear = String(item && item.survey_year || "").trim();
          const itemSeason = normalizeSurveySeasonValue((item && (item.survey_season_slug || item.survey_season)) || "");
          const sameYear = !requestedYear || itemYear === requestedYear;
          const sameSeason = !requestedSeason || itemSeason === requestedSeason;
          return sameYear && sameSeason;
        });
        if (exact) return exact;
        return null;
      }
      return items[0];
    }

    function getPostSurveyYear(post) {
      const direct = String((post && (post.survey_year || post.year)) || "").trim();
      return direct;
    }

    function getPostSurveySeason(post) {
      return normalizeSurveySeasonValue(
        (post && (post.survey_season_slug || post.season_slug || post.survey_season || post.season)) || ""
      );
    }

    function filterSurveyPostsByCurrentState(posts) {
      const requested = getRequestedSurveyKey();
      const requestedYear = String(requested.year || "").trim();
      const requestedSeason = normalizeSurveySeasonValue(requested.season);
      const list = Array.isArray(posts) ? posts : [];

      return list.filter(function(post) {
        const postYear = getPostSurveyYear(post);
        const postSeason = getPostSurveySeason(post);
        const sameYear = !requestedYear ? true : postYear === requestedYear;
        const sameSeason = !requestedSeason ? true : postSeason === requestedSeason;
        return sameYear && sameSeason;
      });
    }

    function formatStatValue(value, suffix) {
      const raw = String(value || "").trim();
      if (!raw) return "";
      if (/[%％]$/.test(raw) || /人$/.test(raw)) return raw;
      if (suffix === "%") return raw + "%";
      try {
        const num = Number(raw.replace(/,/g, ""));
        if (Number.isFinite(num) && suffix !== "%") return num.toLocaleString("ja-JP");
      } catch (_e) {}
      return raw;
    }
    function renderParagraphBlocks(text) {
      const normalized = String(text || "").replaceAll("\r\n", "\n").replaceAll("\r", "\n").trim();
      if (!normalized) return "";
      return normalized
        .split(/\n{2,}/)
        .map(function(block) {
          const html = escapeHtmlLocal(block).split("\n").join("<br>");
          return `<p>${html}</p>`;
        })
        .join("");
    }

function renderGraphItems(items) {
      return items.map(function(item) {
        const width = Math.max(0, Math.min(100, Number(item.value) || 0));
        const pct = `${Math.round(width)}%`;
        return `
          <div class="simple-bar-item">
            <div class="simple-bar-label">${escapeHtmlLocal(item.label)}</div>
            <div class="simple-bar-track">
              <div class="simple-bar-fill${width === 0 ? " is-zero" : ""}" style="width:${width}%">${escapeHtmlLocal(pct)}</div>
            </div>
          </div>`;
      }).join("");
    }

    function renderSurveyTopContent(entry) {
      const root = document.getElementById("surveyTopDynamicContent");
      if (!root || !entry || !entry.graphs.length) return;

      const detailTitle = entry.detail_title || "部会アンケート詳細";
      const detailSubtitle = entry.detail_subtitle || "アンケート集計結果";
      const detailDescription = entry.detail_description || "全国の回答結果をもとに主な課題をまとめています。";

      const icons = [
        '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"></path></svg>',
        '<svg viewBox="0 0 24 24"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"></path></svg>',
        '<svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14h-2v-2h2v2zm0-4h-2V7h2v6z"></path></svg>'
      ];

      const sections = entry.graphs.map(function(graph, index) {
        const sectionTitle = graph.section_title || graph.title;
        const sectionTextHtml = renderParagraphBlocks(graph.section_text);
        const sectionHighlightHtml = renderParagraphBlocks(graph.section_highlight);
        const hasTextContent = Boolean(sectionTextHtml || sectionHighlightHtml);

        return `
          <div class="detail-section">
            <div class="detail-section-header">
              <div class="detail-section-icon">${icons[Math.min(index, icons.length - 1)] || icons[icons.length - 1]}</div>
              <h3 class="detail-section-title">${escapeHtmlLocal(sectionTitle)}</h3>
            </div>
            <div class="detail-content${hasTextContent ? " has-text" : ""}">
              <div class="detail-text${hasTextContent ? "" : " is-empty"}">
                ${sectionTextHtml}
                ${sectionHighlightHtml ? `<div class="detail-highlight">${sectionHighlightHtml}</div>` : ""}
              </div>
              <div class="detail-chart">
                <p class="chart-title-small">グラフ${index + 1}「${escapeHtmlLocal(graph.title)}」</p>
                <div class="simple-bar-chart">${renderGraphItems(graph.items)}</div>
              </div>
            </div>
          </div>`;
      });

      root.innerHTML = `
        <div class="survey-detail-header">
          <h2 class="survey-detail-title">${escapeHtmlLocal(detailTitle)}</h2>
          <p class="survey-detail-subtitle">${escapeHtmlLocal(detailSubtitle)}</p>
          <p class="survey-detail-description">${escapeHtmlLocal(detailDescription)}</p>
        </div>
        ${sections.join("") || '<div class="survey-top-empty">グラフデータがありません。</div>'}`;
    }


    function renderSurveyTopEmptyState() {
      const pageTitle = document.getElementById("surveyPageTitle");
      const pageSubtitle = document.getElementById("surveyPageSubtitle");
      const heroTitle = document.getElementById("surveyHeroTitle");
      const heroDescription = document.getElementById("surveyHeroDescription");
      const totalProducers = document.getElementById("surveyTotalProducers");
      const responseRate = document.getElementById("surveyResponseRate");
      const root = document.getElementById("surveyTopDynamicContent");
      const requested = getRequestedSurveyKey();
      const requestedYear = String(requested.year || "").trim();
      const requestedSeason = normalizeSurveySeasonValue(requested.season);
      const seasonLabel = requestedSeason === "winter" ? "冬春" : (requestedSeason === "summer" ? "夏秋" : "");
      const heading = [requestedYear ? requestedYear + "年" : "", seasonLabel].filter(Boolean).join(" ") || "選択中の条件";

      if (pageTitle) pageTitle.textContent = "産地データ大全";
      if (pageSubtitle) pageSubtitle.textContent = heading + " のTOPデータはまだありません。";
      if (heroTitle) heroTitle.textContent = heading + " のデータ準備中";
      if (heroDescription) heroDescription.textContent = "選択された年度・シーズンに一致する産地データTOPが見つかりませんでした。";
      if (totalProducers) totalProducers.textContent = "—";
      if (responseRate) responseRate.textContent = "—";
      if (root) {
        root.innerHTML = '<div class="survey-top-empty">選択された年度・シーズンに一致する産地データTOPデータがありません。</div>';
      }
    }

    function applySurveyTopEntry(entry) {
      if (!entry) return;
      const pageTitle = document.getElementById("surveyPageTitle");
      const pageSubtitle = document.getElementById("surveyPageSubtitle");
      const heroTitle = document.getElementById("surveyHeroTitle");
      const heroDescription = document.getElementById("surveyHeroDescription");
      const totalProducers = document.getElementById("surveyTotalProducers");
      const responseRate = document.getElementById("surveyResponseRate");

      if (pageTitle && entry.page_title) pageTitle.textContent = entry.page_title;
      if (pageSubtitle && entry.page_subtitle) pageSubtitle.textContent = entry.page_subtitle;
      if (heroTitle && entry.hero_title) heroTitle.textContent = entry.hero_title;
      if (heroDescription && entry.hero_description) heroDescription.textContent = entry.hero_description;
      if (totalProducers && entry.total_producers) totalProducers.textContent = formatStatValue(entry.total_producers, "");
      if (responseRate && entry.response_rate) responseRate.textContent = formatStatValue(entry.response_rate, "%");
      renderSurveyTopContent(entry);
    }

    async function run() {
      try {
        const paper = getPaperFromPathLocal();
        if (!paper) return;

        const candidates = [
          `/static/${encodeURIComponent(paper)}/posts.json`,
          `./posts.json`,
          `posts.json`,
          `../${encodeURIComponent(paper)}/posts.json`,
        ];

        let posts = null;
        let lastErr = null;

        for (const url of candidates) {
          try {
            posts = await fetchJsonLocal(url);
            if (Array.isArray(posts)) break;
          } catch (e) {
            lastErr = e;
            posts = null;
          }
        }

        const all = Array.isArray(posts) ? posts : [];
        if (!all.length && lastErr) {
          console.error("[WEBセミナー] posts.json load failed:", lastErr);
        }

        const recordPosts = all
          .filter((p) => p && String(p.article_type || "") === "採録紙面")
          .sort((a, b) => safeDateValue(b) - safeDateValue(a));

        const picks = recordPosts.slice(0, 3);

        const seminarItems = Array.from(section.querySelectorAll(".seminar-item"));
        seminarItems.forEach((itemEl, i) => {
          const articleEl = itemEl.querySelector(".seminar-article");
          if (!articleEl) return;

          if (i >= picks.length) {
            articleEl.remove();
            return;
          }

          articleEl.innerHTML = "";
          articleEl.appendChild(buildRecordCard(picks[i]));
        });

        if (picks.length === 0) {
          section.querySelectorAll(".seminar-article").forEach((el) => el.remove());
        }
      } catch (e) {
        console.error("[WEBセミナー] render failed:", e);
      }
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
    else run();
  })();


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

  // Load keyword bar component
  (async function() {
    try {
      const response = await fetch('/static/components/kw-bar.html', { cache: 'no-store' });
      const html = await response.text();
      const kwContainer = document.getElementById('kwbar-container');
      if (kwContainer) {
        kwContainer.innerHTML = html;
        window.dispatchEvent(new CustomEvent('kwLoaded'));
      }
    } catch (error) {
      console.error('Error loading kw-bar:', error);
    }
  })();

  

  // --------------------------------------------------
  // Keyword bar: build kw pills dynamically from 記事タイプ (article_type)
  // - Source: /static/{paper}/posts.json (unique article_type values)
  // - Link: list.html?article_type={term name}
  // --------------------------------------------------
  function getKwPaper() {
    // Prefer /static/{paper}/... from path
    try {
      var parts = window.location.pathname.split("/").filter(Boolean);
      var idx = parts.indexOf("static");
      if (idx !== -1 && parts.length >= idx + 2) {
        var p = parts[idx + 1];
        if (p && p !== "account") return p;
      }
    } catch (_e) {}

    // Fallback: query param ?paper=
    try {
      var sp = new URLSearchParams(window.location.search || "");
      var qp = sp.get("paper");
      return qp ? String(qp) : null;
    } catch (_e2) {
      return null;
    }
  }

  async function renderKwBarDynamic() {
    var track = document.getElementById("kwTrack");
    if (!track) return;

    var paper = getKwPaper();
    if (!paper) return;

    var posts = [];
    try {
      posts = await fetchJson(`/static/${encodeURIComponent(paper)}/posts.json`);
    } catch (e) {
      // posts.json might not exist on some pages/environments
      console.warn("[kw-bar] posts.json load failed:", e);
      return;
    }

    var set = new Set();
    (Array.isArray(posts) ? posts : []).forEach(function (p) {
      var t = p && p.article_type;
      if (typeof t !== "string") return;
      t = t.trim();
      if (!t) return;
      set.add(t);
    });

    var types = Array.from(set);

    // Make order stable/predictable (Japanese locale)
    try {
      types.sort(function (a, b) {
        return String(a).localeCompare(String(b), "ja");
      });
    } catch (_e3) {
      types.sort();
    }

    // Clear existing (hardcoded) pills and rebuild
    track.innerHTML = "";

    function appendType(typeName) {
      var a = document.createElement("a");
      a.className = "kw-pill";
      a.textContent = typeName;
      a.setAttribute("href", "list.html?article_type=" + encodeURIComponent(typeName));
      track.appendChild(a);
    }

    // First pass
    types.forEach(appendType);

    // Duplicate once for seamless scroll animation
    types.forEach(appendType);
  }

  // When kw-bar HTML is injected, build pills
  window.addEventListener("kwLoaded", function () {
    renderKwBarDynamic();
  });

  // Safety: if kw-bar exists directly in HTML (not injected)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      renderKwBarDynamic();
    });
  } else {
    renderKwBarDynamic();
  }

  // --------------------------------------------------
  // Dynamic navigation menu
  // - Preferred source: /static/{paper}/menu.json
  // - Fallback: /static/{paper}/archive-filters.json
  // - Article types become navigation items
  // --------------------------------------------------
  function escapeHtml(text) {
    return String(text == null ? "" : text).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function getDynamicMenuSpecialConfig(typeName) {
    var name = String(typeName || "").trim();
    var map = {
      "品種情報": { key: "variety", url: "./variety.html" },
      "病害虫対策": { key: "pest", url: "./pest-control.html" },
      "WEBセミナー": { key: "seminar", url: "./web-seminar.html" },
      "JA部会アンケート": { key: "survey", url: "./survey.html" },
      "特集記事": { key: "featured", url: "./feature.html" },
      "トマト特集": { key: "featured", url: "./feature.html", label: "特集記事" },
      "採録紙面": { key: "paper", url: "./list.html?article_type=" + encodeURIComponent(name), label: "採録紙面" },
      "紙面": { key: "paper", url: "./list.html?article_type=" + encodeURIComponent(name), label: "紙面" },
      "動画": { key: "video", url: "./list.html?article_type=" + encodeURIComponent(name) },
      "トマトNEWS": { key: "news", url: "./list.html?article_type=" + encodeURIComponent(name) },
      "栽培技術": { key: "cultivation", url: "./list.html?article_type=" + encodeURIComponent(name) },
      "市場動向": { key: "market", url: "./list.html?article_type=" + encodeURIComponent(name) },
      "コラム": { key: "column", url: "./list.html?article_type=" + encodeURIComponent(name) }
    };
    return map[name] || null;
  }

  function buildMenuItemFromArticleType(typeName) {
    var name = String(typeName || "").trim();
    if (!name) return null;

    var special = getDynamicMenuSpecialConfig(name);
    if (special) {
      return {
        key: special.key,
        label: special.label || name,
        url: special.url
      };
    }

    return {
      key: name.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "menu-item",
      label: name,
      url: "./list.html?article_type=" + encodeURIComponent(name)
    };
  }

  function getDynamicMenuPreferredOrder() {
    return ["featured", "news", "variety", "cultivation", "market", "pest", "seminar", "column", "video", "paper", "survey"];
  }

  function sortDynamicMenuItems(items) {
    var order = getDynamicMenuPreferredOrder();
    var rank = {};
    order.forEach(function (key, index) {
      rank[key] = index;
    });

    return items.slice().sort(function (a, b) {
      var aHasExplicitOrder = Number.isFinite(Number(a && a.order));
      var bHasExplicitOrder = Number.isFinite(Number(b && b.order));
      var aOrder = aHasExplicitOrder ? Number(a.order) : 999;
      var bOrder = bHasExplicitOrder ? Number(b.order) : 999;

      if (aOrder !== bOrder) return aOrder - bOrder;
      if (aHasExplicitOrder !== bHasExplicitOrder) return aHasExplicitOrder ? -1 : 1;

      var aRank = Object.prototype.hasOwnProperty.call(rank, a.key) ? rank[a.key] : 999;
      var bRank = Object.prototype.hasOwnProperty.call(rank, b.key) ? rank[b.key] : 999;
      if (aRank !== bRank) return aRank - bRank;
      return String(a.label || "").localeCompare(String(b.label || ""), "ja");
    });
  }

  function dedupeDynamicMenuItems(items) {
    var map = new Map();
    (Array.isArray(items) ? items : []).forEach(function (item) {
      if (!item || !item.label || !item.url) return;
      var key = String(item.key || "").trim() + "__" + String(item.label || "").trim();
      if (!map.has(key)) map.set(key, item);
    });
    return Array.from(map.values());
  }

  async function loadDynamicMenuItems() {
    var paper = getCurrentPaper() || getKwPaper();
    if (!paper) return [];

    try {
      var menuData = await fetchJson('/static/' + encodeURIComponent(paper) + '/menu.json');
      var sourceItems = Array.isArray(menuData)
        ? menuData
        : (Array.isArray(menuData && menuData.items) ? menuData.items : []);

      return sortDynamicMenuItems(dedupeDynamicMenuItems(sourceItems.map(function (item) {
        if (!item || typeof item !== 'object') return null;
        var label = String(item.label || "").trim();
        var url = String(item.url || "").trim();
        if (!label || !url) return null;
        var rawOrder = Number(item.order);
        return {
          key: String(item.key || "").trim() || label.toLowerCase().replace(/[^a-z0-9_-]+/g, '-'),
          label: label,
          url: url,
          order: Number.isFinite(rawOrder) ? rawOrder : null
        };
      }).filter(Boolean)));
    } catch (menuError) {
      try {
        var filters = await fetchJson('/static/' + encodeURIComponent(paper) + '/archive-filters.json');
        var articleTypes = Array.isArray(filters && filters.article_types) ? filters.article_types : [];
        var fallbackItems = [{ key: 'featured', label: '特集記事', url: './feature.html' }];

        articleTypes.forEach(function (typeName) {
          var next = buildMenuItemFromArticleType(typeName);
          if (next) fallbackItems.push(next);
        });

        return sortDynamicMenuItems(dedupeDynamicMenuItems(fallbackItems));
      } catch (fallbackError) {
        console.warn('[menu] menu.json and archive-filters.json load failed:', menuError, fallbackError);
        return [];
      }
    }
  }

  function renderDynamicMenuInto(root, items) {
    if (!root || !Array.isArray(items) || !items.length) return;
    root.innerHTML = items.map(function (item) {
      return '<li data-menu-key="' + escapeHtml(item.key) + '"><a href="' + escapeHtml(item.url) + '">' + escapeHtml(item.label) + '</a></li>';
    }).join('');
  }

  async function renderDynamicMenus() {
    var items = await loadDynamicMenuItems();
    if (!items.length) return;

    renderDynamicMenuInto(document.getElementById('header-main-menu'), items);
    renderDynamicMenuInto(document.getElementById('mobile-main-menu'), items);
    renderDynamicMenuInto(document.getElementById('footer-content-menu'), items);

    updatePaperMenuLinks();
    updateHeaderMenuVisibility();
  }

  window.addEventListener('headerLoaded', renderDynamicMenus);
  window.addEventListener('footerLoaded', renderDynamicMenus);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderDynamicMenus);
  } else {
    renderDynamicMenus();
  }
// Load footer component
  (async function() {
    try {
      const response = await fetch('/static/components/footer.html', { cache: 'no-store' });
      const html = await response.text();
      const footerContainer = document.getElementById('footer-container');
      if (footerContainer) {
        footerContainer.innerHTML = html;
        window.dispatchEvent(new CustomEvent('footerLoaded'));
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

    // Run after kw-bar is injected
    window.addEventListener("kwLoaded", function () {
      updateOffsets();
      // Layout may settle after injection
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
      heroRegisterBtn: registerHref,
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

  // =========================================================
  // Header/Footer paper menu links: fix relative links when opened
  // from /static/account/* pages.
  //
  // Example bug:
  //   /static/account/register.html?paper=tomato
  //   click "特集記事" (href="./feature.html")
  //   -> navigates to /static/account/feature.html (404)
  //
  // Fix:
  //   rewrite header/footer relative links to /static/{paper}/...
  // =========================================================
  function updatePaperMenuLinks() {
    const paper = getCurrentPaper();
    if (!paper) return;

    const base = `/static/${encodeURIComponent(paper)}/`;

    const roots = [];
    const headerEl = document.querySelector("header");
    const footerEl = document.querySelector("footer");
    if (headerEl) roots.push(headerEl);
    if (footerEl) roots.push(footerEl);

        const mobileMenuEl = document.getElementById("mobileMenu");
    if (mobileMenuEl) roots.push(mobileMenuEl);

function shouldSkipHref(href) {
      if (!href) return true;
      const h = String(href).trim();
      if (!h) return true;
      if (h.startsWith("#")) return true;
      if (/^javascript:/i.test(h)) return true;
      if (/^mailto:/i.test(h)) return true;
      if (/^tel:/i.test(h)) return true;
      if (/^https?:\/\//i.test(h)) return true;
      // Account pages must stay under /static/account/
      if (/\baccount\//i.test(h)) return true;
      return false;
    }

    function rewriteHref(rawHref) {
      const href = String(rawHref || "").trim();

      // If already absolute under /static/{paper}/..., keep.
      if (href.startsWith(base)) return href;

      // If absolute under /static/{otherPaper}/..., rewrite to current paper.
      const m = href.match(/^\/static\/([^\/]+)\/(.+)$/);
      if (m && m[1] && m[2]) {
        const rest = m[2];
        return base + rest;
      }

      // For other absolute paths (e.g. /static/common/...), keep.
      if (href.startsWith("/")) return href;

      // Rewrite relative html links (./feature.html, feature.html, list.html?...)
      const normalized = href.replace(/^\.\//, "");
      // If it looks like a site page, rewrite to /static/{paper}/...
      if (/\.html(\?|#|$)/i.test(normalized)) {
        return base + normalized;
      }

      // Otherwise keep (e.g. empty placeholders)
      return href;
    }

    roots.forEach((root) => {
      root.querySelectorAll("a[href]").forEach((a) => {
        const href = a.getAttribute("href");
        if (shouldSkipHref(href)) return;

        const next = rewriteHref(href);
        if (next && next !== href) a.setAttribute("href", next);
      });
    });
  }

  // Run after header is injected
  window.addEventListener("headerLoaded", updateHeaderAccountLinks);
  window.addEventListener("headerLoaded", updatePaperMenuLinks);
  window.addEventListener("footerLoaded", updatePaperMenuLinks);

  // Also run on first load (for pages that already have header in HTML)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", updateHeaderAccountLinks);
    document.addEventListener("DOMContentLoaded", updatePaperMenuLinks);
  } else {
    updateHeaderAccountLinks();
    updatePaperMenuLinks();
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


  const ARCHIVE_REGION_ORDER = ["北海道", "東北", "関東", "中部", "近畿", "中国", "四国", "九州"];
  const ARCHIVE_DEFAULT_ARTICLE_TYPES = ["トマトNEWS", "ニュース", "トマト特集", "品種情報", "栽培技術", "市場動向", "病害虫対策", "WEBセミナー", "採録紙面", "コラム", "JA部会アンケート"];
  const ARCHIVE_DEFAULT_VARIETY_CATEGORIES = ["大玉トマト", "ミディトマト", "ミニトマト", "台木用トマト"];

  function getArchiveSearchForm() {
    return document.getElementById("archive-search-form");
  }

  function normalizeTextForSearch(value) {
    return String(value || "")
      .replace(/<[^>]+>/g, " ")
      .replace(/　/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function normalizeDateValue(value) {
    const s = String(value || "").trim();
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const t = Date.parse(s);
    if (!Number.isFinite(t)) return "";
    return new Date(t).toISOString().slice(0, 10);
  }

  function getPostDateForFilter(post) {
    return normalizeDateValue((post && (post.date_ymd || post.date)) || "");
  }

  function getPostArticleTypes(post) {
    const items = Array.isArray(post && post.article_types) ? post.article_types : [];
    if (items.length) return items.map(function (v) { return String(v || "").trim(); }).filter(Boolean);
    const first = String((post && post.article_type) || "").trim();
    return first ? [first] : [];
  }

  function deriveRegionsFromPrefectures(prefectures) {
    const prefToRegion = {
      "北海道": "北海道",
      "青森県": "東北", "岩手県": "東北", "宮城県": "東北", "秋田県": "東北", "山形県": "東北", "福島県": "東北",
      "茨城県": "関東", "栃木県": "関東", "群馬県": "関東", "埼玉県": "関東", "千葉県": "関東", "東京都": "関東", "神奈川県": "関東",
      "新潟県": "中部", "富山県": "中部", "石川県": "中部", "福井県": "中部", "山梨県": "中部", "長野県": "中部", "岐阜県": "中部", "静岡県": "中部", "愛知県": "中部",
      "三重県": "近畿", "滋賀県": "近畿", "京都府": "近畿", "大阪府": "近畿", "兵庫県": "近畿", "奈良県": "近畿", "和歌山県": "近畿",
      "鳥取県": "中国", "島根県": "中国", "岡山県": "中国", "広島県": "中国", "山口県": "中国",
      "徳島県": "四国", "香川県": "四国", "愛媛県": "四国", "高知県": "四国",
      "福岡県": "九州", "佐賀県": "九州", "長崎県": "九州", "熊本県": "九州", "大分県": "九州", "宮崎県": "九州", "鹿児島県": "九州", "沖縄県": "九州"
    };
    const src = Array.isArray(prefectures) ? prefectures : [];
    return Array.from(new Set(src.map(function (v) {
      return prefToRegion[String(v || '').trim()] || '';
    }).filter(Boolean)));
  }

  function getPostRegions(post) {
    const items = Array.isArray(post && post.regions) ? post.regions : [];
    if (items.length) return items.map(function (v) { return String(v || "").trim(); }).filter(Boolean);
    const first = String((post && post.region) || "").trim();
    if (first) return [first];
    return deriveRegionsFromPrefectures(Array.isArray(post && post.prefectures) ? post.prefectures : []);
  }

  function getPostVarietyCategories(post) {
    const items = Array.isArray(post && post.variety_categories) ? post.variety_categories : [];
    if (items.length) return items.map(function (v) { return String(v || "").trim(); }).filter(Boolean);
    const first = String((post && post.variety_category) || "").trim();
    return first ? [first] : [];
  }

  function getPostTagNames(post) {
    const raw = Array.isArray(post && post.article_tags) ? post.article_tags : [];
    return raw.map(function (tag) {
      if (tag && typeof tag === 'object') return String(tag.name || '').trim();
      return String(tag || '').trim();
    }).filter(Boolean);
  }

  function buildArchiveKeywordHaystack(post) {
    return normalizeTextForSearch([
      post && post.title,
      post && post.excerpt,
      post && post.search_text,
      post && post.content_plain,
      post && post.article_type,
      ...(Array.isArray(post && post.article_types) ? post.article_types : []),
      ...getPostRegions(post),
      ...(Array.isArray(post && post.prefectures) ? post.prefectures : []),
      ...getPostVarietyCategories(post),
      ...getPostTagNames(post)
    ].join(' '));
  }

  function matchesQueryValue(values, wanted) {
    if (!wanted) return true;
    return (Array.isArray(values) ? values : []).some(function (value) {
      return String(value || "").trim() === wanted;
    });
  }

  function matchesKeyword(post, keyword) {
    if (!keyword) return true;
    const tokens = normalizeTextForSearch(keyword).split(/\s+/).filter(Boolean);
    if (!tokens.length) return true;
    const haystack = buildArchiveKeywordHaystack(post);
    return tokens.every(function (token) {
      return haystack.indexOf(token) !== -1;
    });
  }

  function filterArchivePosts(posts, filters) {
    const all = Array.isArray(posts) ? posts : [];
    const keyword = String((filters && filters.keyword) || "").trim();
    const articleType = String((filters && filters.article_type) || "").trim();
    const region = String((filters && filters.region) || "").trim();
    const varietyCategory = String((filters && filters.variety_category) || "").trim();
    const memberScope = String((filters && filters.member_scope) || "").trim();
    const dateFrom = normalizeDateValue(filters && filters.date_from);
    const dateTo = normalizeDateValue(filters && filters.date_to);

    return all.filter(function (post) {
      if (!matchesKeyword(post, keyword)) return false;
      if (!matchesQueryValue(getPostArticleTypes(post), articleType)) return false;
      if (!matchesQueryValue(getPostRegions(post), region)) return false;
      if (!matchesQueryValue(getPostVarietyCategories(post), varietyCategory)) return false;

      if (memberScope === "free" && Number(post && post.free_viewable) !== 1) return false;
      if (memberScope === "member" && Number(post && post.free_viewable) === 1) return false;

      const postDate = getPostDateForFilter(post);
      if (dateFrom && (!postDate || postDate < dateFrom)) return false;
      if (dateTo && (!postDate || postDate > dateTo)) return false;
      return true;
    });
  }

  function buildArchiveSearchParamsFromForm(form) {
    const fd = new FormData(form);
    const params = new URLSearchParams();
    ["keyword", "article_type", "region", "variety_category", "date_from", "date_to", "member_scope"].forEach(function (key) {
      const value = String(fd.get(key) || "").trim();
      if (value) params.set(key, value);
    });
    params.delete("page");
    return params;
  }

  function buildArchiveSearchSummary(filters, total) {
    const chips = [];
    if (filters.keyword) chips.push('キーワード: ' + filters.keyword);
    if (filters.article_type) chips.push('カテゴリ: ' + filters.article_type);
    if (filters.region) chips.push('産地: ' + filters.region);
    if (filters.variety_category) chips.push('品種: ' + filters.variety_category);
    if (filters.date_from) chips.push('開始: ' + filters.date_from);
    if (filters.date_to) chips.push('終了: ' + filters.date_to);
    if (filters.member_scope === 'free') chips.push('会員限定: 無料記事のみ');
    if (filters.member_scope === 'member') chips.push('会員限定: 会員限定のみ');
    if (!chips.length) return '全ての記事を表示しています（' + total + '件）。';
    return '検索条件: ' + chips.join(' / ') + '（' + total + '件）';
  }

  function ensureArchiveSearchEmptyState() {
    let el = document.getElementById('archive-search-empty-state');
    if (el) return el;
    const grid = document.querySelector('.grid');
    if (!grid || !grid.parentNode) return null;
    el = document.createElement('div');
    el.id = 'archive-search-empty-state';
    el.style.display = 'none';
    el.style.maxWidth = '900px';
    el.style.margin = '24px auto 0';
    el.style.padding = '24px';
    el.style.border = '1px solid #e5e7eb';
    el.style.borderRadius = '12px';
    el.style.background = '#fff';
    el.style.textAlign = 'center';
    el.style.color = '#64748b';
    grid.parentNode.insertBefore(el, grid.nextSibling);
    return el;
  }

  function updateListSearchHeader(filters, total, master) {
    const titleEl = document.querySelector('.page-header .page-title');
    const descEl = document.querySelector('.page-header .page-desc');
    const hasFilters = !!(
      filters && (
        filters.keyword ||
        filters.article_type ||
        filters.region ||
        filters.variety_category ||
        filters.date_from ||
        filters.date_to ||
        filters.member_scope
      )
    );
    const selectedArticleType = String(filters && filters.article_type || '').trim();
    const pageHeaderContent = document.querySelector('.page-header .page-header-content');
    let termDescEl = pageHeaderContent ? pageHeaderContent.querySelector('.page-term-description') : null;

    if (pageHeaderContent && !termDescEl && titleEl) {
      termDescEl = document.createElement('p');
      termDescEl.className = 'page-term-description';
      titleEl.insertAdjacentElement('afterend', termDescEl);
    }

    if (titleEl) {
      titleEl.textContent = selectedArticleType ? selectedArticleType : (hasFilters ? '検索結果' : '記事一覧');
    }

    if (termDescEl) {
      const detail = master && master.article_type_details && master.article_type_details[selectedArticleType]
        ? master.article_type_details[selectedArticleType]
        : null;
      const description = String(detail && detail.description || '').trim();
      if (selectedArticleType && description) {
        termDescEl.textContent = description;
        termDescEl.style.display = '';
      } else {
        termDescEl.textContent = '';
        termDescEl.style.display = 'none';
      }
    }

    if (descEl) {
      if (hasFilters) {
        descEl.textContent = buildArchiveSearchSummary(filters, total);
      } else {
        descEl.textContent = 'トマト新聞の最新記事をカテゴリー別にご覧いただけます。';
      }
    }
  }

  function toggleArchiveEmptyState(total) {
    const grid = document.querySelector('.grid');
    const nav = document.querySelector('nav.pagination');
    const empty = ensureArchiveSearchEmptyState();
    if (grid) grid.style.display = total > 0 ? '' : 'none';
    if (nav) nav.style.display = total > 0 ? '' : 'none';
    if (empty) {
      empty.style.display = total > 0 ? 'none' : 'block';
      empty.textContent = '該当する記事がありません。検索条件を変更して再度お試しください。';
    }
  }

  function populateSelectOptions(select, values, placeholder, preferredOrder) {
    if (!select) return;
    const currentValue = String(select.value || '').trim();
    const unique = Array.from(new Set((Array.isArray(values) ? values : []).map(function (v) { return String(v || '').trim(); }).filter(Boolean)));
    let ordered = unique.slice();
    if (Array.isArray(preferredOrder) && preferredOrder.length) {
      const set = new Set(unique);
      ordered = preferredOrder.filter(function (item) { return set.has(item); }).concat(
        unique.filter(function (item) { return preferredOrder.indexOf(item) === -1; }).sort(function (a, b) { return a.localeCompare(b, 'ja'); })
      );
    } else {
      ordered.sort(function (a, b) { return a.localeCompare(b, 'ja'); });
    }

    select.innerHTML = '';
    const first = document.createElement('option');
    first.value = '';
    first.textContent = placeholder;
    select.appendChild(first);
    ordered.forEach(function (value) {
      const opt = document.createElement('option');
      opt.value = value;
      opt.textContent = value;
      if (value === currentValue) opt.selected = true;
      select.appendChild(opt);
    });
  }

  function buildArchiveFilterMasterFromPosts(posts) {
    const all = Array.isArray(posts) ? posts : [];
    const postRegions = all.flatMap(function (post) { return getPostRegions(post); });
    return {
      article_types: Array.from(new Set(
        ARCHIVE_DEFAULT_ARTICLE_TYPES.concat(
          all.flatMap(function (post) { return getPostArticleTypes(post); })
        )
      )),
      regions: Array.from(new Set(ARCHIVE_REGION_ORDER.concat(postRegions))),
      variety_categories: Array.from(new Set(
        ARCHIVE_DEFAULT_VARIETY_CATEGORIES.concat(
          all.flatMap(function (post) { return getPostVarietyCategories(post); })
        )
      ))
    };
  }

  function normalizeArchiveFilterMaster(data, posts) {
    const fallback = buildArchiveFilterMasterFromPosts(posts);
    const src = data && typeof data === 'object' ? data : {};

    const articleTypes = Array.isArray(src.article_types) && src.article_types.length
      ? src.article_types
      : fallback.article_types;

    const regions = Array.isArray(src.regions) && src.regions.length
      ? src.regions
      : fallback.regions;

    const varietyCategories = Array.isArray(src.variety_categories) && src.variety_categories.length
      ? src.variety_categories
      : fallback.variety_categories;

    const articleTypeDetails = {};
    const rawDetails = Array.isArray(src.article_type_details) ? src.article_type_details : [];
    rawDetails.forEach(function (item) {
      const name = String(item && item.name || '').trim();
      if (!name) return;
      articleTypeDetails[name] = {
        name: name,
        slug: String(item && item.slug || '').trim(),
        description: String(item && item.description || '').trim()
      };
    });

    return {
      article_types: Array.from(new Set(articleTypes.concat(fallback.article_types))),
      article_type_details: articleTypeDetails,
      regions: Array.from(new Set(ARCHIVE_REGION_ORDER.concat(regions))),
      variety_categories: Array.from(new Set(varietyCategories.concat(fallback.variety_categories)))
    };
  }

  async function loadArchiveFilterMaster(paper, posts) {
    const candidates = [
      `/static/${encodeURIComponent(paper)}/archive-filters.json`,
      `./archive-filters.json`,
      `archive-filters.json`
    ];

    for (const url of candidates) {
      try {
        const data = await fetchJson(url);
        return normalizeArchiveFilterMaster(data, posts);
      } catch (_error) {}
    }

    return buildArchiveFilterMasterFromPosts(posts);
  }

  async function loadArchivePostsForSearch(paper) {
    const candidates = [
      `/static/${encodeURIComponent(paper)}/posts.json`,
      `./posts.json`,
      `posts.json`,
      `../${encodeURIComponent(paper)}/posts.json`
    ];

    let lastError = null;
    for (const url of candidates) {
      try {
        const data = await fetchJson(url);
        if (Array.isArray(data)) return data;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('posts.json could not be loaded for archive search.');
  }

  function bindArchiveSearchScrollButton() {
    const trigger = document.getElementById('scroll-to-archive-search');
    const target = document.getElementById('search');
    if (!trigger || !target) return;
    if (trigger.dataset.archiveScrollBound === '1') return;

    trigger.addEventListener('click', function () {
      const header = document.querySelector('header');
      const kwBar = document.querySelector('.kw-bar');
      const headerHeight = header ? header.getBoundingClientRect().height : 0;
      const kwBarHeight = kwBar ? kwBar.getBoundingClientRect().height : 0;
      const extraGap = 16;
      const top = window.pageYOffset + target.getBoundingClientRect().top - headerHeight - kwBarHeight - extraGap;

      window.scrollTo({
        top: Math.max(top, 0),
        behavior: 'smooth'
      });
    });

    trigger.dataset.archiveScrollBound = '1';
  }

  function populateArchiveSearchForm(form, master) {
    if (!form) return;

    populateSelectOptions(
      form.querySelector('#archive-category'),
      master.article_types,
      'すべて',
      ARCHIVE_DEFAULT_ARTICLE_TYPES
    );
    populateSelectOptions(
      form.querySelector('#archive-region'),
      master.regions,
      'すべて',
      ARCHIVE_REGION_ORDER
    );
    populateSelectOptions(
      form.querySelector('#archive-variety'),
      master.variety_categories,
      'すべて',
      ARCHIVE_DEFAULT_VARIETY_CATEGORIES
    );
  }

  async function initArchiveSearchTopPage(paper) {
    const form = getArchiveSearchForm();
    if (!form) return;
    if (form.dataset.archiveSearchBound === '1') return;

    form.setAttribute('method', 'get');
    if (!form.getAttribute('action')) {
      form.setAttribute('action', './list.html');
    }

    bindArchiveSearchScrollButton();

    populateArchiveSearchForm(form, buildArchiveFilterMasterFromPosts([]));

    let master = buildArchiveFilterMasterFromPosts([]);
    try {
      const posts = await loadArchivePostsForSearch(paper);
      const all = Array.isArray(posts) ? posts : [];
      master = await loadArchiveFilterMaster(paper, all);
      populateArchiveSearchForm(form, master);
    } catch (error) {
      console.warn('[archive-search] option master load failed:', error);
    }

    const dateFrom = form.querySelector('#archive-date-from');
    const dateTo = form.querySelector('#archive-date-to');
    const syncDateRange = function () {
      if (dateFrom) {
        if (dateTo && dateTo.value) dateFrom.max = dateTo.value;
        else dateFrom.removeAttribute('max');
      }
      if (dateTo) {
        if (dateFrom && dateFrom.value) dateTo.min = dateFrom.value;
        else dateTo.removeAttribute('min');
      }
    };

    if (dateFrom && dateTo) {
      dateFrom.addEventListener('change', syncDateRange);
      dateTo.addEventListener('change', syncDateRange);
      syncDateRange();
    }

    const submitArchiveSearch = function () {
      const params = buildArchiveSearchParamsFromForm(form);
      const url = new URL('./list.html', window.location.href);
      params.forEach(function (value, key) { url.searchParams.set(key, value); });
      window.location.href = url.toString();
    };

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      submitArchiveSearch();
    });

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn && !submitBtn.dataset.archiveSearchClickBound) {
      submitBtn.dataset.archiveSearchClickBound = '1';
      submitBtn.addEventListener('click', function (event) {
        event.preventDefault();
        submitArchiveSearch();
      });
    }

    const clearBtn = document.getElementById('archive-search-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        form.reset();
        if (dateFrom) dateFrom.removeAttribute('max');
        if (dateTo) dateTo.removeAttribute('min');
        populateArchiveSearchForm(form, master);
        syncDateRange();
      });
    }

    form.dataset.archiveSearchBound = '1';
  }

  // =========================================================
  // List page: Filter tab active state
  // - list.html (no query)            -> "すべて" active
  // - list.html?article_type=栽培技術 -> "栽培技術" active
  // - list.html?article_type=市場動向 -> "市場動向" active
  // - list.html?article_type=コラム   -> "コラム" active
  // - Also tolerates accidental trailing "S" like "?article_type=市場動向S"
  // =========================================================
  function normalizeArticleType(value) {
    let s = String(value || "").trim();
    if (!s) return "";
    // tolerate accidental trailing ASCII 'S'
    if (s.endsWith("S")) s = s.slice(0, -1);
    return s.trim();
  }

  function updateListFilterTabsActive(requestedArticleType) {
    const tabs = document.querySelectorAll(".filter-tabs .filter-tab");
    if (!tabs || tabs.length === 0) return;

    const wanted = normalizeArticleType(requestedArticleType);

    tabs.forEach((tab) => tab.classList.remove("active"));

    let match = null;

    tabs.forEach((tab, idx) => {
      const a = tab.querySelector("a");
      if (!a) return;

      const href = a.getAttribute("href") || "";
      try {
        const u = new URL(href, window.location.href);
        const tabType = normalizeArticleType(u.searchParams.get("article_type"));
        const path = (u.pathname || "").toLowerCase();

        // "すべて": ONLY list.html without article_type
        if (!wanted) {
          const isList =
            path.endsWith("/list.html") || path.endsWith("list.html");
          if (isList && !tabType) match = tab;
          return;
        }

        // Exact match (after normalization)
        if (wanted && tabType === wanted) match = tab;
      } catch (_e) {
        // Fallback: simple heuristic
        if (!wanted) {
          // ONLY list.html without article_type (avoid matching other pages like pest-control.html)
          const isList =
            /(^|\/)(list\.html)(\?|$)/i.test(href) || /^\.\/list\.html$/i.test(href);
          const hasType = href.indexOf("article_type=") !== -1;
          if (isList && !hasType) match = tab;
          return;
        }

        if (wanted && href.indexOf("article_type=" + encodeURIComponent(wanted)) !== -1) match = tab;
      }
    });

    // Default to the first tab ("すべて") if no match found
    (match || tabs[0]).classList.add("active");
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

  // =========================================================
  // Detail sidebar: 人気記事 (most accessed 5 posts)
  // - Uses localStorage view counts per paper (no server dependency)
  // - Falls back to latest 5 posts when no view data exists
  // =========================================================
  function getViewsStorageKey(paper) {
    return `tn_views_${String(paper || "").trim()}`;
  }

  function readViewCounts(paper) {
    try {
      const raw = localStorage.getItem(getViewsStorageKey(paper));
      const obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === "object" ? obj : {};
    } catch (_e) {
      return {};
    }
  }

  function writeViewCounts(paper, map) {
    try {
      localStorage.setItem(getViewsStorageKey(paper), JSON.stringify(map || {}));
    } catch (_e) {
      // ignore (storage might be disabled)
    }
  }

  function incrementPostView(paper, postId) {
    if (!paper || !postId) return;
    const id = String(postId);
    const map = readViewCounts(paper);
    map[id] = (Number(map[id]) || 0) + 1;
    writeViewCounts(paper, map);
  }

  function formatDateYmdToDots(dateStr) {
    const s = String(dateStr || "").trim();
    // Prefer YYYY-MM-DD if present
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}.${m[2]}.${m[3]}`;
    // Try Date parse
    const t = Date.parse(s);
    if (!Number.isFinite(t)) return "";
    const d = new Date(t);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}.${mm}.${dd}`;
  }

  function safeTimeValue(p) {
    const d = (p && (p.date || p.date_ymd)) || "";
    const t = Date.parse(String(d));
    return Number.isFinite(t) ? t : 0;
  }

  function buildPopularItem(post, rank) {
    const a = document.createElement("a");
    a.className = "popular-article";

    // Prefer posts.json's url; fallback to detail.html?id=
    const href =
      (post && post.url) ? String(post.url) :
      (post && post.id) ? `detail.html?id=${encodeURIComponent(post.id)}` :
      "#";
    a.setAttribute("href", href);

    const rankEl = document.createElement("div");
    rankEl.className = "popular-rank";
    rankEl.textContent = String(rank);

    const contentEl = document.createElement("div");
    contentEl.className = "popular-content";

    const titleEl = document.createElement("div");
    titleEl.className = "popular-title";
    titleEl.textContent = stripHtml((post && post.title) || "");

    const metaEl = document.createElement("div");
    metaEl.className = "popular-meta";
    const dateTxt = formatDateYmdToDots((post && (post.date_ymd || post.date)) || "");
    const typeTxt = String((post && post.article_type) || "").trim();
    metaEl.textContent = [dateTxt, typeTxt].filter(Boolean).join("｜");

    contentEl.appendChild(titleEl);
    contentEl.appendChild(metaEl);

    a.appendChild(rankEl);
    a.appendChild(contentEl);

    return a;
  }

  async function renderPopularSidebar(paper, currentPostId) {
    const root = document.getElementById("sidebar-popular");
    if (!root) return;

    const list = root.querySelector(".popular-list");
    if (!list) return;

    // Ensure we have at least one view recorded for current post
    incrementPostView(paper, currentPostId);

    let posts = [];
    try {
      posts = await fetchJson(`/static/${encodeURIComponent(paper)}/posts.json`);
    } catch (_e) {
      // If posts.json isn't available, keep the list empty.
      return;
    }

    const all = Array.isArray(posts) ? posts : [];
    if (!all.length) return;

    const views = readViewCounts(paper);

    // Build ranking:
    // - If there are view counts, sort by count desc, then date desc
    // - If no view counts at all, fallback to newest 5
    const hasAnyViews = Object.keys(views).some((k) => (Number(views[k]) || 0) > 0);

    const ranked = all
      .slice()
      .sort((a, b) => {
        if (hasAnyViews) {
          const av = Number(views[String(a && a.id)]) || 0;
          const bv = Number(views[String(b && b.id)]) || 0;
          if (bv !== av) return bv - av;
        }
        return safeTimeValue(b) - safeTimeValue(a);
      })
      .slice(0, 5);

    list.innerHTML = "";
    ranked.forEach((p, i) => {
      list.appendChild(buildPopularItem(p, i + 1));
    });
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
  const newsPosts = all.filter((p) => {
    if (!p) return false;
    const primaryType = String((p && p.article_type) || "").trim();
    const typeList = Array.isArray(p && p.article_types)
      ? p.article_types.map((t) => String(t || "").trim()).filter(Boolean)
      : [];
    return primaryType === "トマトNEWS" || typeList.includes("トマトNEWS");
  });

  // Load PR from placements.json (if available)
  let prItems = [];
  try {
    const placements = await fetchJson(`/static/${paper}/placements.json`);
    prItems = Array.isArray(placements && placements.pr) ? placements.pr : [];
  } catch (e) {
    // Keep working even if placements.json is missing
    prItems = [];
  }

  const totalSlots = 8;
  const prToUse = prItems.slice(0, totalSlots);
  const prCount = prToUse.length;
  const maxNews = Math.max(0, totalSlots - prCount);
  const newsToShow = newsPosts.slice(0, maxNews);

  // If nothing to show, hide whole section
  if (newsToShow.length === 0 && prCount === 0) {
    if (section) section.style.display = "none";
    grid.innerHTML = "";
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
    badge.className = "ad-badge";
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

  // Rebuild grid deterministically:
  // - first PR goes right after the first news card when news exists
  // - remaining PR cards stay at the end
  grid.innerHTML = "";

  const firstNews = newsToShow.length > 0 ? newsToShow[0] : null;
  const remainingNews = newsToShow.length > 1 ? newsToShow.slice(1) : [];

  const firstPr = prToUse.length > 0 ? prToUse[0] : null;
  const remainingPr = prToUse.length > 1 ? prToUse.slice(1) : [];

  if (firstNews) grid.appendChild(buildNewsCard(firstNews));
  if (firstPr && firstNews) {
    grid.appendChild(buildNativePrCard(firstPr));
  }

  if (!firstNews && firstPr) {
    grid.appendChild(buildNativePrCard(firstPr));
  }

  remainingNews.forEach((p) => grid.appendChild(buildNewsCard(p)));
  remainingPr.forEach((pr) => grid.appendChild(buildNativePrCard(pr)));
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

  function safeTopBadgeDateValue(post) {
    const raw = (post && (post.date_ymd || post.date)) || "";
    const time = Date.parse(String(raw));
    return Number.isFinite(time) ? time : 0;
  }

  function isTopBadgeNewPost(post) {
    const publishedAt = safeTopBadgeDateValue(post);
    if (!publishedAt) return false;
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    return Date.now() - publishedAt <= ONE_WEEK_MS;
  }

  function syncTopNewBadge(tileEl, post) {
    if (!tileEl) return;

    const existing = tileEl.querySelector('.vtile-badge-new');
    if (!isTopBadgeNewPost(post)) {
      if (existing) existing.remove();
      return;
    }

    if (existing) return;

    const badge = document.createElement('span');
    badge.className = 'vtile-badge-new';
    badge.textContent = 'NEW';
    tileEl.appendChild(badge);
  }

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

      syncTopNewBadge(a, post);
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

  let __listFilteredPosts = null;

  function getListSortValue() {
    const select = document.querySelector('.sort-select');
    return String((select && select.value) || '最新順').trim() || '最新順';
  }

  function getPostSortDate(post) {
    const raw = String((post && (post.date || post.date_ymd)) || '').trim();
    const time = Date.parse(raw);
    return Number.isFinite(time) ? time : 0;
  }

  function compareListPosts(a, b, sortValue) {
    const av = a || {};
    const bv = b || {};
    switch (sortValue) {
      case '投稿順': {
        const aid = Number(av.id) || 0;
        const bid = Number(bv.id) || 0;
        return aid - bid;
      }
      case '人気順':
        return String(av.title || '').localeCompare(String(bv.title || ''), 'ja');
      case 'カテゴリー順':
        return String((getPostArticleTypes(av)[0] || '')).localeCompare(String((getPostArticleTypes(bv)[0] || '')), 'ja');
      case '最新順':
      default: {
        const ad = getPostSortDate(av);
        const bd = getPostSortDate(bv);
        if (bd !== ad) return bd - ad;
        return (Number(bv.id) || 0) - (Number(av.id) || 0);
      }
    }
  }

  function sortListPosts(posts, sortValue) {
    return (Array.isArray(posts) ? posts : []).slice().sort(function (a, b) {
      return compareListPosts(a, b, sortValue);
    });
  }

  function renderListPageState(pageNum) {
    if (!Array.isArray(__listAllPosts)) return;

    const sortedPosts = sortListPosts(__listAllPosts, getListSortValue());
    __listFilteredPosts = sortedPosts;

    const totalItems = sortedPosts.length;
    toggleArchiveEmptyState(totalItems);

    if (totalItems === 0) {
      renderListTiles([]);
      const nav = document.querySelector("nav.pagination");
      if (nav) nav.innerHTML = "";
      return;
    }

    const totalPages = Math.max(1, Math.ceil(totalItems / __listPerPage));
    const page = clampInt(pageNum, 1, totalPages);

    const start = (page - 1) * __listPerPage;
    const end = start + __listPerPage;
    const slice = sortedPosts.slice(start, end);

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
  // ✅ Detail: render Sidebar Ad (記事ごとに1枠)
  // - Reads exported field from cli-static-build.php:
  //   post.sidebar_ad: {id, title, url, image} | null
  // - Renders into: <div class="sidebar-section" id="sidebar-ads"></div>
  // =========================================================
  function normalizeSidebarAd(post) {
    const raw = post && (post.sidebar_ad || post.sidebarAd || post.sidebar_ad_item);
    if (!raw) return null;

    // If already an object with image/url
    if (typeof raw === "object" && !Array.isArray(raw)) {
      const url = typeof raw.url === "string" ? raw.url.trim() : "";
      const image = typeof raw.image === "string" ? raw.image.trim() : "";
      const title = typeof raw.title === "string" ? raw.title.trim() : "";
      if (!image && !url) return null;
      return {
        id: raw.id != null ? raw.id : null,
        title,
        url,
        image,
      };
    }

    // If only an id is present, we can't resolve it here without extra fetch.
    // Keep it null to avoid wrong display.
    return null;
  }

  
  // =============================
  // Columnists (コラムニスト紹介) on detail.html
  // - Reads post.columnists from /static/{paper}/posts/{id}.json
  // - Up to 4 items
  // - If none: hide the whole section
  // =============================
  function renderColumnists(post) {
    const section = document.getElementById("columnists-section");
    const grid = document.getElementById("columnists-grid");
    if (!section || !grid) return;

    const items = (post && Array.isArray(post.columnists)) ? post.columnists : [];
    const picks = items.slice(0, 4);

    if (!picks.length) {
      section.style.display = "none";
      grid.innerHTML = "";
      return;
    }

    const gradients = [
      "linear-gradient(135deg, #e0523d 0%, #ff9a7d 100%)",
      "linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)",
      "linear-gradient(135deg, #10b981 0%, #34d399 100%)",
      "linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)",
    ];

    function esc(s) {
      return escapeHtml(String(s ?? ""));
    }

    grid.innerHTML = picks.map((c, idx) => {
      const name = esc(c && (c.name || c.title) || "");
      const prof = esc(c && (c.profession || c.affiliation) || "");
      const bio = esc(c && (c.description || c.bio) || "");
      const bg = gradients[idx % gradients.length];

      // Optional image (if you want later): currently the UI uses an icon circle, so we keep the SVG.
      return `
        <div class="columnist-card">
          <div class="columnist-icon" style="background: ${bg};">
            <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="30" cy="22" r="10" fill="white"/>
              <path d="M15 50C15 41.7157 21.7157 35 30 35C38.2843 35 45 41.7157 45 50V52H15V50Z" fill="white"/>
            </svg>
          </div>
          <div class="columnist-info">
            <h3 class="columnist-name">${name}</h3>
            <p class="columnist-affiliation">${prof}</p>
            <p class="columnist-bio">${bio}</p>
          </div>
        </div>
      `;
    }).join("");

    section.style.display = "";
  }

function renderSidebarAd(post) {
    const box = document.getElementById("sidebar-ads");
    if (!box) return;

    // Ensure markup matches requested structure
    box.classList.add("sidebar-section");
    box.classList.add("sidebar-ad");

    const ad = normalizeSidebarAd(post);

    // Clear previous
    box.innerHTML = "";

    // Label
    const label = document.createElement("div");
    label.className = "ad-label";
    label.textContent = "ADVERTISEMENT";

    // Slot (fixed 300x300 as requested)
    const slot = document.createElement("div");
    slot.setAttribute(
      "style",
      "height:300px; display:flex; align-items:center; justify-content:center; margin:0 auto;"
    );

    // No placement selected -> show placeholder text
    if (!ad || !ad.image || !ad.url) {
      slot.textContent = "広告スペース";
      box.appendChild(label);
      box.appendChild(slot);
      box.style.display = "";
      return;
    }

    // 1 placement selected -> show linked image (no class on <a>)
    const a = document.createElement("a");
    a.href = String(ad.url);
    a.target = "_blank";
    a.rel = "noopener";
    a.setAttribute("aria-label", ad.title ? ad.title : "広告");

    const img = document.createElement("img");
    img.src = resolveUrlMaybeRelative(ad.image);
    img.alt = ad.title ? ad.title : "広告";
    img.loading = "lazy";
    img.style.maxWidth = "100%";
    img.style.maxHeight = "100%";
    img.style.objectFit = "contain";
    img.style.display = "block";

    a.appendChild(img);
    slot.appendChild(a);

    box.appendChild(label);
    box.appendChild(slot);
    box.style.display = "";
  }



  // =========================================================
  // Member-only gating (per post flag)
  // - If post.free_viewable === 1 (or true): show full content even if not logged in
  // - Else: show teaser (~10%) for non-logged-in users, and show gate UI
  // =========================================================
  function isUserLoggedIn() {
    try {
      // If some page exposes a dedicated helper, prefer it.
      // Guard against accidental self-recursion when this function is also assigned globally.
      if (typeof window.isUserLoggedIn === "function" && window.isUserLoggedIn !== isUserLoggedIn) {
        return !!window.isUserLoggedIn();
      }

      // Member login is handled by the frontend member auth system (auth.js),
      // not by the WordPress admin login cookie.
      // Therefore, DO NOT treat wordpress_logged_in_* as a valid member session here.
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

      // Direct storage fallback so paywall still works even if auth.js loads slightly later.
      try {
        const ls = window.localStorage;
        const ss = window.sessionStorage;

        const currentUserRaw = ls ? ls.getItem("tomato_member_current_user_v1") : "";
        const authToken = ls ? ls.getItem("tomato_member_auth_token_v1") : "";
        if ((authToken && String(authToken).trim()) || (currentUserRaw && String(currentUserRaw).trim())) {
          return true;
        }

        // Backward compatibility with older local/session storage keys, if any remain.
        const email1 = ls ? ls.getItem("tomato_session_email_v1") : "";
        const email2 = ss ? ss.getItem("tomato_session_email_session_v1") : "";
        if ((email1 && email1.trim()) || (email2 && email2.trim())) return true;
      } catch (e2) {
        // ignore storage access errors
      }

      return false;
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

      try {
        applyFeaturedImageDisplayMode(
          __PAYWALL_STATE.mainImageWrap,
          __PAYWALL_STATE.mainImageBox,
          'full'
        );
      } catch (_e) {}

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
    mainImageWrap: null,
    mainImageBox: null,
  };

  function syncPaywallState() {
    try {
      const st = __PAYWALL_STATE;
      if (!st.post || !st.target) return;

      // Only apply on detail pages where we rendered mock article
      if (!st.isMock) return;

      const wantGate = shouldGatePost(st.post);
      const isPaywalled = st.target.classList.contains("is-paywalled");
      const desiredImageMode = wantGate ? getEffectiveFeaturedImageDisplayMode(st.post) : 'full';

      // Always re-sync the featured image mode as auth state can become available
      // after the initial render without necessarily changing the article HTML state.
      applyFeaturedImageDisplayMode(st.mainImageWrap, st.mainImageBox, desiredImageMode);

      if (!wantGate && isPaywalled) {
        // Logged in (or free viewable) -> show full and hide gate
        st.target.classList.remove("is-paywalled");
        st.target.innerHTML = st.fullHtml;

        hidePaywallGate();
        setAncillaryDetailVisibility(true);
        applyFeaturedImageDisplayMode(st.mainImageWrap, st.mainImageBox, 'full');

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
        applyFeaturedImageDisplayMode(st.mainImageWrap, st.mainImageBox, desiredImageMode);

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

function normalizeDetailArticleTypeLabel(value) {
  const raw = String(value || "").trim();
  return raw || "コラム";
}

function buildArticleTypeListHref(articleType) {
  const paper = getPaperFromPath() || "tomato";
  const base = `/static/${encodeURIComponent(paper)}/list.html`;
  const label = normalizeDetailArticleTypeLabel(articleType);
  return `${base}?article_type=${encodeURIComponent(label)}`;
}

function updateDetailBreadcrumb(post) {
  const breadcrumb = document.querySelector('nav.breadcrumb[aria-label="パンくずリスト"]');
  if (!breadcrumb) return;

  const articleType = normalizeDetailArticleTypeLabel(post && post.article_type);
  const listHref = buildArticleTypeListHref(articleType);

  const homeLink = breadcrumb.querySelector('a[href*="index.html"]');
  if (homeLink) {
    homeLink.textContent = 'ホーム';
    homeLink.setAttribute('href', `/static/${encodeURIComponent(getPaperFromPath() || 'tomato')}/index.html`);
  }

  let currentLink = null;
  const links = breadcrumb.querySelectorAll('a');
  if (links.length >= 2) currentLink = links[1];
  if (!currentLink) currentLink = breadcrumb.querySelector('a[href*="list.html"]');

  if (currentLink) {
    currentLink.textContent = articleType;
    currentLink.setAttribute('href', listHref);
  }

  let currentLabel = breadcrumb.querySelector('.breadcrumb-current');
  if (!currentLabel) {
    const childNodes = Array.from(breadcrumb.childNodes).filter(function(node) {
      return node.nodeType === Node.TEXT_NODE && String(node.textContent || '').trim();
    });
    currentLabel = childNodes.length ? childNodes[childNodes.length - 1] : null;
  }

  if (currentLabel) {
    if (currentLabel.nodeType === Node.ELEMENT_NODE) currentLabel.textContent = '記事詳細';
    else currentLabel.textContent = '記事詳細';
  }
}

function getFeaturedImageDisplayMode(post) {
  const mode = String(post && post.featured_image_display_mode ? post.featured_image_display_mode : '').trim().toLowerCase();
  return mode === 'third' ? 'third' : 'full';
}

function getEffectiveFeaturedImageDisplayMode(post) {
  if (shouldGatePost(post)) {
    return getFeaturedImageDisplayMode(post);
  }
  return 'full';
}

function applyFeaturedImageDisplayMode(mainImageWrap, mainImageBox, mode) {
  if (!mainImageWrap || !mainImageBox) return;

  const normalizedMode = mode === 'third' ? 'third' : 'full';
  const THIRD_IMAGE_VISIBLE_HEIGHT = 80;

  mainImageWrap.classList.remove('is-full-image', 'is-third-image');
  mainImageWrap.classList.add(normalizedMode === 'third' ? 'is-third-image' : 'is-full-image');

  const clearInlineCrop = () => {
    mainImageWrap.style.height = '';
    mainImageWrap.style.maxHeight = '';
    mainImageBox.style.height = '';
    mainImageBox.style.maxHeight = '';
  };

  const updateThirdCrop = () => {
    if (normalizedMode !== 'third') {
      clearInlineCrop();
      return;
    }

    mainImageWrap.style.height = `${THIRD_IMAGE_VISIBLE_HEIGHT}px`;
    mainImageWrap.style.maxHeight = `${THIRD_IMAGE_VISIBLE_HEIGHT}px`;
    mainImageBox.style.height = 'auto';
    mainImageBox.style.maxHeight = 'none';
  };

  if (normalizedMode !== 'third') {
    clearInlineCrop();
    return;
  }

  if (mainImageBox.complete) {
    updateThirdCrop();
  } else {
    mainImageBox.addEventListener('load', updateThirdCrop, { once: true });
  }

  try {
    if (!window.__featuredImageThirdCropResizeBound) {
      window.addEventListener('resize', function () {
        document.querySelectorAll('.main-image-full.is-third-image').forEach(function (wrapEl) {
          wrapEl.style.height = `${THIRD_IMAGE_VISIBLE_HEIGHT}px`;
          wrapEl.style.maxHeight = `${THIRD_IMAGE_VISIBLE_HEIGHT}px`;
        });
      });
      window.__featuredImageThirdCropResizeBound = true;
    }
  } catch (_e) {}
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

      // Breadcrumb
      updateDetailBreadcrumb(post);

      // Main Image
      const mainImageWrap = document.querySelector(".main-image-full");
      const mainImageBox = mainImageWrap ? mainImageWrap.querySelector("img") : null;
      if (mainImageBox && post.featured_image) {
        mainImageBox.src = post.featured_image;
        mainImageBox.alt = post.title || "";
      }
      applyFeaturedImageDisplayMode(mainImageWrap, mainImageBox, getEffectiveFeaturedImageDisplayMode(post));

      // Article body (member gating if needed)
      const fullHtml = content;

      // Store for later re-check (auth.js may load after app.js)
      try {
        __PAYWALL_STATE.post = post;
        __PAYWALL_STATE.fullHtml = fullHtml;
        __PAYWALL_STATE.target = target;
        __PAYWALL_STATE.isMock = true;
        __PAYWALL_STATE.mainImageWrap = mainImageWrap;
        __PAYWALL_STATE.mainImageBox = mainImageBox;
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

      // ✅ Columnists (コラムニスト紹介)
      renderColumnists(post);

      // ✅ Sidebar ad (single placement per post)
      renderSidebarAd(post);
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

    // ✅ Sidebar ad (single placement per post)
    renderSidebarAd(post);
  }


// =========================================================
// ✅ Detail: dynamic "関連記事" (8) and "おすすめ特集" (3)
// - Replaces the hard-coded mock cards in detail.html with dynamic cards from posts.json
// - "おすすめ特集" shows posts where article_type === "トマト特集"
// =========================================================
function buildDetailRelatedCard(post) {
  const root = document.createElement("div");
  root.className = "related-item";
  root.style.cursor = "pointer";

  const href =
    (post && post.url) ? String(post.url) :
    (post && post.id) ? `detail.html?id=${encodeURIComponent(post.id)}` :
    "#";

  root.addEventListener("click", function () {
    if (href && href !== "#") window.location.href = href;
  });

  const thumb = document.createElement("div");
  thumb.className = "related-thumb";

  const img = document.createElement("img");
  const title = stripHtml((post && post.title) || "");
  const imgUrl = resolveUrlMaybeRelative((post && post.featured_image) || "");
  img.src = imgUrl || "https://placehold.co/400x400?text=No+Image";
  img.alt = title;
  img.loading = "lazy";
  thumb.appendChild(img);

  const info = document.createElement("div");
  info.className = "related-info";

  const meta = document.createElement("div");
  meta.className = "meta";

  const cat = document.createElement("span");
  cat.className = "category";
  cat.textContent = String((post && post.article_type) || "").trim();

  const date = document.createElement("span");
  date.textContent = formatDateYmdToDots((post && (post.date_ymd || post.date)) || "");

  meta.appendChild(cat);
  if (date.textContent) meta.appendChild(date);

  const h4 = document.createElement("h4");
  h4.textContent = title;

  info.appendChild(meta);
  info.appendChild(h4);

  root.appendChild(thumb);
  root.appendChild(info);

  return root;
}

function sharedTagCount(a, b) {
  try {
    const at = normalizeArticleTags(a).map((x) => x && x.name ? String(x.name) : "").filter(Boolean);
    const bt = normalizeArticleTags(b).map((x) => x && x.name ? String(x.name) : "").filter(Boolean);
    if (!at.length || !bt.length) return 0;
    const set = new Set(at);
    let n = 0;
    bt.forEach((t) => { if (set.has(t)) n += 1; });
    return n;
  } catch (_e) {
    return 0;
  }
}

async function renderDetailRelatedAndTokushu(paper, currentPost) {
  const relatedRoot = document.getElementById("detail-related-list");
  const tokushuRoot = document.getElementById("detail-tokushu-list");
  if (!relatedRoot && !tokushuRoot) return;

  let posts = [];
  try {
    posts = await fetchJson(`/static/${encodeURIComponent(paper)}/posts.json`);
  } catch (_e) {
    return;
  }

  const all = Array.isArray(posts) ? posts : [];
  const currentId = currentPost && currentPost.id ? String(currentPost.id) : "";
  const currentType = String((currentPost && currentPost.article_type) || "").trim();

  // おすすめ特集（記事タイプ: トマト特集）3件
  if (tokushuRoot) {
    const tokushu = all
      .filter((p) => p && String(p.id) !== currentId)
      .filter((p) => String((p && p.article_type) || "").trim() === "トマト特集")
      .slice()
      .sort((a, b) => safeTimeValue(b) - safeTimeValue(a))
      .slice(0, 3);

    tokushuRoot.innerHTML = "";
    tokushu.forEach((p) => tokushuRoot.appendChild(buildDetailRelatedCard(p)));
  }

  // 関連記事（8件）
  if (relatedRoot) {
    const candidates = all
      .filter((p) => p && String(p.id) !== currentId)
      // keep 特集 out of 関連記事 (it's shown in おすすめ特集)
      .filter((p) => String((p && p.article_type) || "").trim() !== "トマト特集");

    const scored = candidates
      .map((p) => {
        const t = String((p && p.article_type) || "").trim();
        const sameType = currentType && t && t === currentType;
        const shared = sharedTagCount(currentPost, p);
        const score = (sameType ? 100 : 0) + (shared * 5);
        return { p, score };
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return safeTimeValue(b.p) - safeTimeValue(a.p);
      })
      .map((x) => x.p)
      .slice(0, 8);

    relatedRoot.innerHTML = "";
    scored.forEach((p) => relatedRoot.appendChild(buildDetailRelatedCard(p)));
  }
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
      (!!document.querySelector("#vcolA .v-track") ||
        !!document.querySelector("#vcolB .v-track"))
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

  function removeKnownAdWrapperNextTo(slot) {
    if (!slot) return;
    const next = slot.nextElementSibling;
    if (
      next &&
      next.classList &&
      (next.classList.contains("mpu-ad-wrapper") || next.classList.contains("halfpage-ad-wrapper"))
    ) {
      next.remove();
    }
  }

  function setSlotHidden(slot, hidden) {
    if (!slot) return;

    if (hidden) {
      slot.setAttribute("data-hidden", "true");
      slot.style.setProperty("display", "none", "important");
      removeKnownAdWrapperNextTo(slot);
      return;
    }

    slot.removeAttribute("data-hidden");
    slot.style.removeProperty("display");
  }



  // Ensure the SP (small screen) wrapper markup matches the ad size class.
  // - ad-half-vertical  -> .halfpage-ad-wrapper > .halfpage-inner > .ad-badge + <img>
  // - ad-rect-vertical  -> .mpu-ad-wrapper      > .mpu-inner      > .ad-badge + <img>
  // The SP wrapper is expected to be the nextElementSibling of the PC slot.
  function ensureSpWrapperForSlot(slot, sizeClass, title, imgUrl, href) {
    if (!slot) return null;

    const wantHalf = sizeClass === "ad-half-vertical";
    const wantMpu = sizeClass === "ad-rect-vertical" || !sizeClass;

    const existing = slot.nextElementSibling;
    const existingIsHalf = !!(existing && existing.classList && existing.classList.contains("halfpage-ad-wrapper"));
    const existingIsMpu = !!(existing && existing.classList && existing.classList.contains("mpu-ad-wrapper"));

    // If the existing wrapper matches, just update its contents/handlers and return it
    if ((wantHalf && existingIsHalf) || (wantMpu && existingIsMpu)) {
      const wrapperImg = existing.querySelector("img");
      if (wrapperImg && imgUrl) wrapperImg.src = imgUrl;
      if (wrapperImg) wrapperImg.alt = title || "";

      if (href) {
        existing.style.cursor = "pointer";
        existing.onclick = () => window.open(href, "_blank", "noopener");
      } else {
        existing.style.cursor = "";
        existing.onclick = null;
      }
      return existing;
    }

    // If the existing element is a known SP wrapper but the wrong type, replace it
    if (existing && (existingIsHalf || existingIsMpu)) {
      existing.remove();
    }

    // Build the correct wrapper
    const wrapper = document.createElement("div");
    const inner = document.createElement("div");
    const badge = document.createElement("div");
    const img = document.createElement("img");

    badge.className = "ad-badge";
    badge.textContent = "広告";

    if (wantHalf) {
      wrapper.className = "halfpage-ad-wrapper";
      inner.className = "halfpage-inner";
    } else {
      // default to MPU
      wrapper.className = "mpu-ad-wrapper";
      inner.className = "mpu-inner";
    }

    if (imgUrl) img.src = imgUrl;
    img.alt = title || "広告";

    inner.appendChild(badge);
    inner.appendChild(img);
    wrapper.appendChild(inner);

    if (href) {
      wrapper.style.cursor = "pointer";
      wrapper.onclick = () => window.open(href, "_blank", "noopener");
    }

    // Insert right after the slot
    if (slot.parentNode) {
      if (slot.nextSibling) slot.parentNode.insertBefore(wrapper, slot.nextSibling);
      else slot.parentNode.appendChild(wrapper);
    }

    return wrapper;
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

    // SP wrapper must match the selected size class (medium=halfpage, small=mpu)
    ensureSpWrapperForSlot(slot, sizeClass, title, imgUrl, href);

  }

  function renderSideAdsIntoDom(placements) {
    if (!hasSideAdsUi()) return;

    const items = Array.isArray(placements && placements.ads) ? placements.ads : [];

    function resetVerticalColumnForRebuild(root) {
      if (!root) return;

      if (root.dataset && root.dataset.inited === "1" && typeof root._destroy === "function") {
        root._destroy();
      }

      const track = root.querySelector(".v-track");
      if (!track) return;

      if (track.dataset && track.dataset.cloned === "1") {
        const children = Array.from(track.children);
        const half = Math.floor(children.length / 2);
        children.slice(half).forEach((child) => child.remove());
        track.dataset.cloned = "";
      }

      track.style.transform = "";
    }

    function getTrack(root) {
      return root ? root.querySelector(".v-track") : null;
    }

    function getBaseTemplateSlot(track) {
      return track ? track.querySelector(".ad-slot") : null;
    }

    function clearSlotState(slot) {
      if (!slot) return;

      Array.from(slot.classList).forEach((cls) => {
        if (
          cls === "ad-half-vertical" ||
          cls === "ad-rect-vertical" ||
          cls === "pc-only-ad" ||
          cls === "ad-slot"
        ) {
          return;
        }
        if (/^(ad-|sponsor-|mpu-|halfpage-)/.test(cls)) {
          slot.classList.remove(cls);
        }
      });

      slot.classList.remove("ad-half-vertical", "ad-rect-vertical");
      slot.removeAttribute("data-hidden");
      slot.removeAttribute("data-dynamic-ad");
      slot.removeAttribute("data-ad-type");
      slot.style.removeProperty("display");
      slot.onclick = null;
      slot.style.cursor = "";

      const img = slot.querySelector("img");
      if (img) {
        img.removeAttribute("src");
        img.alt = "広告";
      }
    }

    function createFallbackTemplateSlot() {
      const slot = document.createElement("div");
      slot.className = "ad-slot pc-only-ad";

      const badge = document.createElement("div");
      badge.className = "ad-badge";
      badge.textContent = "広告";

      const img = document.createElement("img");
      img.alt = "広告";

      slot.appendChild(badge);
      slot.appendChild(img);
      clearSlotState(slot);
      return slot;
    }

    function createSlotFromTemplate(templateSlot) {
      const slot = (templateSlot || createFallbackTemplateSlot()).cloneNode(true);
      clearSlotState(slot);
      slot.setAttribute("data-dynamic-ad", "1");
      return slot;
    }

    function captureInitialSnapshot(root) {
      if (!root) return null;
      if (root._adSnapshot) return root._adSnapshot;

      const track = getTrack(root);
      if (!track) return null;

      const original = Array.from(track.children).map((child) => child.cloneNode(true));
      const templateSlot =
        original.find((child) => child.classList && child.classList.contains("ad-slot")) ||
        getBaseTemplateSlot(track) ||
        createFallbackTemplateSlot();

      const adPositions = [];
      let nonAdIndex = 0;

      original.forEach((child) => {
        if (child.classList && child.classList.contains("ad-slot")) {
          adPositions.push(nonAdIndex);
          return;
        }
        if (
          child.classList &&
          (child.classList.contains("halfpage-ad-wrapper") || child.classList.contains("mpu-ad-wrapper"))
        ) {
          return;
        }
        nonAdIndex += 1;
      });

      const contentChildren = original.filter((child) => {
        return !(
          child.classList &&
          (child.classList.contains("ad-slot") ||
            child.classList.contains("halfpage-ad-wrapper") ||
            child.classList.contains("mpu-ad-wrapper"))
        );
      });

      root._adSnapshot = {
        templateSlot: templateSlot.cloneNode(true),
        adPositions: adPositions.slice(),
        contentChildren: contentChildren.map((child) => child.cloneNode(true)),
      };

      return root._adSnapshot;
    }

    function clearKnownWrappers(track) {
      if (!track) return;
      track.querySelectorAll(".halfpage-ad-wrapper, .mpu-ad-wrapper").forEach((node) => node.remove());
    }

    function rebuildColumn(root, columnItems) {
      if (!root) return;
      const snapshot = captureInitialSnapshot(root);
      if (!snapshot) return;

      resetVerticalColumnForRebuild(root);

      const track = getTrack(root);
      if (!track) return;

      const templateSlot = snapshot.templateSlot || createFallbackTemplateSlot();
      const contentChildren = (snapshot.contentChildren || []).map((child) => child.cloneNode(true));
      const adPositions = snapshot.adPositions && snapshot.adPositions.length ? snapshot.adPositions.slice() : [];

      track.innerHTML = "";
      clearKnownWrappers(track);

      const defaultAdPosition = (index) => {
        // When the HTML has no hard-coded ad placeholders, place ads every 2 tiles.
        // Example: 1st ad after 2 tiles, 2nd ad after 4 tiles, then append the rest.
        const pos = 2 * (index + 1);
        return Math.min(pos, contentChildren.length);
      };

      const insertMap = new Map();
      (Array.isArray(columnItems) ? columnItems : []).forEach((item, index) => {
        const position = typeof adPositions[index] === "number"
          ? adPositions[index]
          : defaultAdPosition(index);
        if (!insertMap.has(position)) insertMap.set(position, []);
        insertMap.get(position).push(item);
      });

      function appendAdsAt(position) {
        const list = insertMap.get(position) || [];
        list.forEach((item) => {
          const slot = createSlotFromTemplate(templateSlot);
          applyAdToSlot(slot, item);
          track.appendChild(slot);
        });
      }

      appendAdsAt(0);

      contentChildren.forEach((child, index) => {
        track.appendChild(child);
        appendAdsAt(index + 1);
      });

      if (contentChildren.length === 0) {
        appendAdsAt(1);
      }
    }

    const colARoot = document.getElementById("vcolA");
    const colBRoot = document.getElementById("vcolB");

    const itemsA = items.filter((item) => normalizeAdColumn(item) !== "B");
    const itemsB = items.filter((item) => normalizeAdColumn(item) === "B");

    rebuildColumn(colARoot, itemsA);
    rebuildColumn(colBRoot, itemsB);

    if (document.readyState === "complete") {
      setTimeout(() => {
        try { boot(); } catch (_e) {}
      }, 0);
    }
  }



  // =========================================================
  // ✅ Added: placements.json rendering for SP sticky banner (index.html)
  // - Reads placements.json "sticky_banner" and renders into #stickyAd
  // - If sticky_banner is null/undefined -> removes #stickyAd entirely
  // =========================================================
  function hasStickyAdUi() {
    return !!document.getElementById("stickyAd");
  }

  function renderStickyBannerIntoDom(placements) {
    const root = document.getElementById("stickyAd");
    if (!root) return;

    const item = placements && placements.sticky_banner ? placements.sticky_banner : null;

    if (!item) {
      // Not selected -> remove whole banner
      root.remove();
      return;
    }

    const title = stripHtml(item && item.title ? item.title : "");
    const imgUrl = resolveUrlMaybeRelative(item && item.image ? item.image : "");
    const href = item && item.url ? String(item.url) : "";

    // If required data is missing, hide safely
    if (!href || !imgUrl) {
      root.remove();
      return;
    }

    // Build markup (same structure as static-src hardcode)
    root.innerHTML = `
      <div class="sticky-inner">
        <div class="sticky-thumb"><img src="${imgUrl}" alt="${title}"></div>
        <div>
          <div style="font-weight:600">${title}</div>
          <div class="meta">タップして詳しく見る</div>
        </div>
        <a class="btn accent" href="${href}" target="_blank" rel="noopener">詳しく</a>
        <button class="sticky-close" aria-label="広告を閉じる">閉じる</button>
      </div>
    `.trim();

    root.classList.add("active");

    const closeBtn = root.querySelector(".sticky-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        root.classList.remove("active");
      });
    }
  }

async function loadAndRenderPlacementsJson(paper) {
    // Only for pages that actually have placements UI
    if (!hasSponsorAdsUi() && !hasNewspaperAdsUi() && !hasSideAdsUi() && !hasStickyAdUi()) return;

    const url = `/static/${paper}/placements.json`;
    try {
      const placements = await fetchJson(url);
      renderSponsorVideosIntoDom(placements);
      renderNewspaperSponsorAdsIntoDom(placements);
      renderSideAdsIntoDom(placements);
      renderStickyBannerIntoDom(placements);
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

  function bindArchiveSearchStandalone() {
    const form = getArchiveSearchForm();
    const paper = getPaperFromPath();
    if (!form || !paper) return;
    initArchiveSearchTopPage(paper).catch(function (e) {
      console.warn('[archive-search] standalone init failed:', e);
    });
  }

  async function main() {
    const paper = getPaperFromPath();
    if (!paper) return;

    try {
      await initArchiveSearchTopPage(paper);
    } catch (e) {
      console.warn('[archive-search] init failed:', e);
    }

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

      const filters = {
        keyword: getQueryParam("keyword") || "",
        article_type: getQueryParam("article_type") || "",
        region: getQueryParam("region") || "",
        variety_category: getQueryParam("variety_category") || "",
        date_from: getQueryParam("date_from") || "",
        date_to: getQueryParam("date_to") || "",
        member_scope: getQueryParam("member_scope") || ""
      };

      // Update active state of category filter tabs based on current URL
      updateListFilterTabsActive(filters.article_type);
      const all = Array.isArray(posts) ? posts : [];
      const master = await loadArchiveFilterMaster(paper, all);
      const filtered = filterArchivePosts(all, filters);

      __listAllPosts = filtered;
      __listPerPage = perPage;

      updateListSearchHeader(filters, filtered.length, master);

      const sortSelect = document.querySelector('.sort-select');
      if (sortSelect && !sortSelect.dataset.archiveSortBound) {
        sortSelect.dataset.archiveSortBound = '1';
        sortSelect.addEventListener('change', function () {
          const url = setQueryParam('page', 1);
          window.history.replaceState({ page: 1 }, '', url);
          renderListPageState(1);
        });
      }

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
      // ✅ Detail: dynamic 関連記事 / おすすめ特集
      renderDetailRelatedAndTokushu(paper, post).catch(() => {});
      // 人気記事（most accessed 5）
      renderPopularSidebar(paper, id).catch(() => {});
      return;
    }
  }

  bindArchiveSearchStandalone();
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
      if (img.closest('.seminar-video-wrapper')) return;
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
function openModal(kind) {
  // Support mockup-style kinds (signin/signup/mypage) while keeping backward compatibility
  if (kind === "signin") {
    alert("ログイン（ダミー）");
    return;
  }
  if (kind === "signup") {
    alert("会員登録（ダミー）");
    return;
  }
  if (kind === "mypage") {
    alert("マイページ（ダミー）");
    return;
  }

  alert(kind + " モーダル（仮）");
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
  if (!grid) return;

  const cards = Array.from(grid.querySelectorAll('.market-card'));
  const totalCards = cards.length;
  if (!totalCards) return;

  marketCarouselIndex.sp = ((pageIndex % totalCards) + totalCards) % totalCards;

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


function enableMarketSwipeSP() {
  const grid = document.getElementById('market-grid-sp');
  if (!grid || grid.dataset.swipeBound === '1') return;

  grid.dataset.swipeBound = '1';
  grid.style.touchAction = 'pan-y';
  grid.style.userSelect = 'none';
  grid.style.webkitUserSelect = 'none';

  const state = {
    startX: 0,
    startY: 0,
    tracking: false,
    pointerId: null
  };

  function isSmallScreenMarket() {
    return window.matchMedia('(max-width:1179px)').matches;
  }

  function getTotalCards() {
    return grid.querySelectorAll('.market-card').length;
  }

  function resetState() {
    state.startX = 0;
    state.startY = 0;
    state.tracking = false;
    state.pointerId = null;
  }

  function beginSwipe(x, y, pointerId) {
    state.startX = x;
    state.startY = y;
    state.tracking = true;
    state.pointerId = pointerId != null ? pointerId : null;
  }

  function finishSwipe(x, y) {
    if (!state.tracking || !isSmallScreenMarket()) {
      resetState();
      return;
    }

    const deltaX = x - state.startX;
    const deltaY = y - state.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const totalCards = getTotalCards();
    const threshold = 40;

    if (totalCards > 1 && absX >= threshold && absX > (absY * 1.2)) {
      const nextIndex = deltaX < 0
        ? (marketCarouselIndex.sp + 1) % totalCards
        : (marketCarouselIndex.sp - 1 + totalCards) % totalCards;
      goToMarketPageSP(nextIndex);
    }

    resetState();
  }

  function onTouchStart(e) {
    if (!isSmallScreenMarket() || !e.touches || e.touches.length !== 1) return;
    const touch = e.touches[0];
    beginSwipe(touch.clientX, touch.clientY, null);
  }

  function onTouchEnd(e) {
    if (!state.tracking) return;
    const touch = (e.changedTouches && e.changedTouches[0]) ? e.changedTouches[0] : null;
    if (!touch) {
      resetState();
      return;
    }
    finishSwipe(touch.clientX, touch.clientY);
  }

  function onTouchCancel() {
    resetState();
  }

  function onPointerDown(e) {
    if (!isSmallScreenMarket()) return;
    if (e.pointerType !== 'touch' && e.pointerType !== 'pen') return;
    beginSwipe(e.clientX, e.clientY, e.pointerId);
  }

  function onPointerUp(e) {
    if (state.pointerId !== null && e.pointerId !== state.pointerId) return;
    finishSwipe(e.clientX, e.clientY);
  }

  function onPointerCancel(e) {
    if (state.pointerId !== null && e.pointerId !== state.pointerId) return;
    resetState();
  }

  function bindSwipeTarget(target) {
    if (!target || target.dataset.marketSwipeTargetBound === '1') return;
    target.dataset.marketSwipeTargetBound = '1';

    target.addEventListener('touchstart', onTouchStart, { passive: true });
    target.addEventListener('touchend', onTouchEnd, { passive: true });
    target.addEventListener('touchcancel', onTouchCancel, { passive: true });

    target.addEventListener('pointerdown', onPointerDown, { passive: true });
    target.addEventListener('pointerup', onPointerUp, { passive: true });
    target.addEventListener('pointercancel', onPointerCancel, { passive: true });
  }

  bindSwipeTarget(grid);
  Array.from(grid.querySelectorAll('.market-card')).forEach(bindSwipeTarget);
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
        card.style.order = '2'; // 左側の次に表示
      } else {
        card.style.display = 'none';
        card.style.order = '99';
      }
    });
    // 初期状態のドットを設定
    updateMarketIndicatorsSP();
    enableMarketSwipeSP();
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
        gate: document.getElementById("paywall-gate"),
        wrapper: document.querySelector(".video-player-wrapper"),
        footer: document.querySelector("#videoModal .modal-footer"),
      };
    }

    function isWebSeminarUserLoggedIn() {
      try {
        if (window.TomatoAuth) {
          if (typeof window.TomatoAuth.currentUser === "function") {
            const u = window.TomatoAuth.currentUser();
            if (u && (u.email || u.id || u.name)) return true;
          }
          if (typeof window.TomatoAuth.isLoggedIn === "function") {
            return !!window.TomatoAuth.isLoggedIn();
          }
        }

        if (window.TOMATO_AUTH && typeof window.TOMATO_AUTH.isLoggedIn === "function") {
          return !!window.TOMATO_AUTH.isLoggedIn();
        }

        try {
          const ls = window.localStorage;
          const ss = window.sessionStorage;
          const currentUserRaw = ls ? ls.getItem("tomato_member_current_user_v1") : "";
          const authToken = ls ? ls.getItem("tomato_member_auth_token_v1") : "";
          if ((authToken && String(authToken).trim()) || (currentUserRaw && String(currentUserRaw).trim())) {
            return true;
          }
          const email1 = ls ? ls.getItem("tomato_session_email_v1") : "";
          const email2 = ss ? ss.getItem("tomato_session_email_session_v1") : "";
          if ((email1 && email1.trim()) || (email2 && email2.trim())) return true;
        } catch (_storageError) {}

        return false;
      } catch (_e) {
        return false;
      }
    }

    function renderWebSeminarPaywallGate() {
      const { gate } = getModalEls();
      if (!gate) return;

      const paper = (typeof getCurrentPaper === "function" && getCurrentPaper()) || "tomato";
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

    function showWebSeminarPaywallGate() {
      const { gate, wrapper, footer } = getModalEls();
      if (!gate) return;
      renderWebSeminarPaywallGate();
      gate.style.display = "flex";
      if (wrapper) wrapper.classList.add("is-paywalled");
      if (footer) footer.classList.add("is-paywalled");
    }

    function hideWebSeminarPaywallGate() {
      const { gate, wrapper, footer } = getModalEls();
      if (gate) gate.style.display = "none";
      if (wrapper) wrapper.classList.remove("is-paywalled");
      if (footer) footer.classList.remove("is-paywalled");
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

        modal.classList.add("active");
        document.body.style.overflow = "hidden";

        if (isWebSeminarUserLoggedIn()) {
          hideWebSeminarPaywallGate();
          player.src = embedUrl;
        } else {
          player.src = "";
          showWebSeminarPaywallGate();
        }
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
          hideWebSeminarPaywallGate();
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
  // WEBセミナー: 採録紙面（posts.json から動的表示）
  // - 記事タイプ（article_type）が「採録紙面」の記事を最大3件表示
  // - 0件: すべての .seminar-article を非表示（DOMから削除）
  // - 1-2件: その数だけ表示（残りは削除）
  // - 3件以上: 3つすべて表示
  // ==========================
  

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

/* =========================================================
   Feature page (feature.html)
   - Moved from TOMATO_TOKUSHU_MODAL版_20260122.html
   - Guarded so other pages are unaffected
   ========================================================= */

if (typeof window.openContentModal !== "function") {
  window.openContentModal = function openContentModal(type, id) {
    const overlay = document.getElementById("modalOverlay");
    if (!overlay) return;

    const panels = document.querySelectorAll(".modal-panel");
    panels.forEach((p) => p.classList.remove("active"));

    if (type === "article") {
      const p = document.getElementById("modal-article");
      if (p) p.classList.add("active");
    } else if (type === "variety") {
      const p = document.getElementById("modal-variety");
      if (p) p.classList.add("active");
    } else if (type === "pest") {
      const p = document.getElementById("modal-pest");
      if (p) p.classList.add("active");
    }

    overlay.classList.add("active");
    document.body.classList.add("modal-open");

    // Reset scroll position inside overlay
    overlay.scrollTop = 0;
  };
}

if (typeof window.closeModal !== "function") {
  window.closeModal = function closeModal() {
    const overlay = document.getElementById("modalOverlay");
    if (!overlay) return;
    overlay.classList.remove("active");
    document.body.classList.remove("modal-open");
  };
}

if (typeof window.switchVarietyTab !== "function") {
  window.switchVarietyTab = function switchVarietyTab(tabId, ev) {
    const e = ev || window.event;
    document.querySelectorAll(".variety-tab").forEach((t) => t.classList.remove("active"));
    if (e && e.target) e.target.classList.add("active");

    document
      .querySelectorAll(".variety-content-panel")
      .forEach((p) => p.classList.remove("active"));
    const panel = document.getElementById("variety-" + tabId);
    if (panel) panel.classList.add("active");
  };
}

if (typeof window.toggleVarietyItem !== "function") {
  window.toggleVarietyItem = function toggleVarietyItem(header) {
    if (!header || !header.closest) return;
    const item = header.closest(".variety-item");
    if (!item) return;

    const wasOpen = item.classList.contains("open");
    const accordion = item.closest(".variety-accordion");
    if (accordion) {
      accordion.querySelectorAll(".variety-item").forEach((i) => i.classList.remove("open"));
    }
    if (!wasOpen) item.classList.add("open");
  };
}

if (typeof window.switchPestTab !== "function") {
  window.switchPestTab = function switchPestTab(tabId, ev) {
    const e = ev || window.event;
    document.querySelectorAll(".pest-search-tab").forEach((t) => t.classList.remove("active"));
    if (e && e.target) e.target.classList.add("active");
    // Note: content switching is handled by existing markup/CSS in feature.html
  };
}

(function () {
  if (!document.body || !document.body.classList.contains("page-feature")) return;

  // -------------------------------------------------------------------
  // Feature page local helpers (self-contained)
  // - This block intentionally defines helpers inside this IIFE so the
  //   feature page works even if common helpers are not in scope.
  // -------------------------------------------------------------------
  function getPaperFromPathLocal() {
    const parts = String(window.location.pathname || "").split("/").filter(Boolean);
    const idx = parts.indexOf("static");
    if (idx !== -1 && parts.length >= idx + 2) {
      const paper = parts[idx + 1];
      return paper && paper !== "account" ? paper : null;
    }
    return null;
  }

  function getCurrentPaperLocal() {
    // Prefer paper from path: /static/{paper}/...
    const fromPath = getPaperFromPathLocal();
    if (fromPath) return fromPath;

    // Fallback to query param (?paper=tomato)
    try {
      const qp = new URLSearchParams(window.location.search).get("paper");
      return qp ? String(qp) : null;
    } catch (_e) {
      return null;
    }
  }

  async function fetchJsonLocal(url) {
    const res = await fetch(url, { cache: "no-store" });
    const text = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    try {
      return JSON.parse(text);
    } catch (e) {
      throw new Error(`Invalid JSON from ${url}: ${String(e)}`);
    }
  }

  function stripHtmlLocal(text) {
    const tmp = document.createElement("div");
    tmp.innerHTML = String(text ?? "");
    return (tmp.textContent || tmp.innerText || "").trim();
  }

  function resolveUrlMaybeRelativeLocal(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    try {
      return new URL(path, window.location.origin).href;
    } catch (_e) {
      return String(path);
    }
  }

  function formatSlashDateLocal(ymd) {
    if (!ymd) return "";
    const parts = String(ymd).split("-");
    if (parts.length !== 3) return String(ymd);
    return `${parts[0]}/${parts[1]}/${parts[2]}`;
  }

  function formatSlashDateFromPostLocal(post) {
    if (post && post.date_ymd) return formatSlashDateLocal(post.date_ymd);
    if (post && post.date) return formatSlashDateLocal(String(post.date).slice(0, 10));
    return "";
  }

  function buildDynamicYearButtons() {
    const container = document.getElementById("yearSelector");
    if (!container) return;

    // If buttons already exist, keep them (avoid duplicates)
    if (container.querySelector(".selector-btn")) return;

    const thisYear = new Date().getFullYear();
    const lastYear = thisYear - 1;
    const nextYear = thisYear + 1;

    // Left: last year, Middle: this year, Right: next year
    const years = [lastYear, thisYear, nextYear];

    years.forEach((year, idx) => {
      const btn = document.createElement("button");
      btn.className = "selector-btn";
      btn.dataset.year = String(year);
      btn.textContent = `${year}年`;
      if (idx === 1) btn.classList.add("active"); // middle
      container.appendChild(btn);
    });
  }

  function getSelectedYear() {
    const active = document.querySelector("#yearSelector .selector-btn.active");
    if (active && active.dataset.year) return parseInt(active.dataset.year, 10);
    return new Date().getFullYear();
  }

  function getSelectedSeason() {
    const active = document.querySelector("#seasonSelector .selector-btn.active");
    if (active && active.dataset.season) return String(active.dataset.season);
    // Fallback to first button (if any)
    const first = document.querySelector("#seasonSelector .selector-btn");
    if (first && first.dataset.season) return String(first.dataset.season);
    return "";
  }

  function setActiveButton(groupSelector, btn) {
    const buttons = document.querySelectorAll(`${groupSelector} .selector-btn`);
    buttons.forEach((b) => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
  }

  function renderNoContent(message) {
    const grid = document.getElementById("featureArticlesGrid");
    const noContent = document.getElementById("featureNoContent");
    const msg = document.getElementById("featureNoContentMessage");

    if (grid) grid.innerHTML = "";
    if (msg) msg.textContent = message || "準備中です";
    if (noContent) noContent.style.display = "";
  }

  function hideNoContent() {
    const noContent = document.getElementById("featureNoContent");
    if (noContent) noContent.style.display = "none";
  }

  function buildArticleCard(post, index) {
    const a = document.createElement("a");
    a.className = "article-card";
    a.href = post && post.url ? String(post.url) : `detail.html?id=${encodeURIComponent(post && post.id ? post.id : "")}`;

    const imgWrap = document.createElement("div");
    imgWrap.className = "article-card-image";
    const img = document.createElement("img");
    const title = stripHtmlLocal(post && post.title ? post.title : "");
    const imgUrl = resolveUrlMaybeRelativeLocal(post && post.featured_image ? post.featured_image : "");
    if (imgUrl) {
      img.src = imgUrl;
      img.alt = title;
      img.loading = "lazy";
    } else {
      img.alt = title;
      img.style.display = "none";
    }
    imgWrap.appendChild(img);

    const overlay = document.createElement("div");
    overlay.className = "article-card-overlay";

    const content = document.createElement("div");
    content.className = "article-card-content";

    const meta = document.createElement("span");
    meta.className = "article-card-number";
    const count = (typeof index === "number" && isFinite(index)) ? (index + 1) : null;
    meta.textContent = count ? `${count}面` : "特集";

    const h2 = document.createElement("h2");
    h2.className = "article-card-title";
    h2.textContent = title;

    const excerptRaw = post && post.excerpt ? String(post.excerpt) : "";
    const excerpt = stripHtmlLocal(excerptRaw);
    const p = document.createElement("p");
    p.className = "article-card-subtitle";
    p.textContent = excerpt;

    content.appendChild(meta);
    content.appendChild(h2);
    if (excerpt) content.appendChild(p);

    const arrow = document.createElement("div");
    arrow.className = "article-card-arrow";
    arrow.innerHTML =
      '<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>';

    a.appendChild(imgWrap);
    a.appendChild(overlay);
    a.appendChild(content);
    a.appendChild(arrow);

    return a;
  }

  async function loadPostsForFeature(paper) {
    if (!paper) return [];
    try {
      const posts = await fetchJsonLocal(`/static/${encodeURIComponent(paper)}/posts.json`);
      return Array.isArray(posts) ? posts : [];
    } catch (e) {
      console.error(e);
      return [];
    }
  }

  function getPostYear(post) {
    const ymd = post && (post.date_ymd || (post.date ? String(post.date).slice(0, 10) : ""));
    const y = ymd ? parseInt(String(ymd).slice(0, 4), 10) : NaN;
    return Number.isFinite(y) ? y : null;
  }

  function renderFeature(posts, thisYear) {
    const grid = document.getElementById("featureArticlesGrid");
    if (!grid) return;

    const selectedYear = getSelectedYear();
    const selectedSeason = getSelectedSeason(); // "冬春" or "夏秋"

    // Next year always shows "no-content" (even if future data exists)
    if (selectedYear === thisYear + 1) {
      renderNoContent(`${selectedYear}年は準備中です`);
      return;
    }

    const filtered = (Array.isArray(posts) ? posts : [])
      .filter((p) => p && String(p.article_type || "") === "トマト特集")
      .filter((p) => getPostYear(p) === selectedYear)
      .filter((p) => {
        if (!selectedSeason) return true;
        return String(p.season || "") === selectedSeason;
      });

    if (!filtered.length) {
      renderNoContent(`${selectedYear}年${selectedSeason ? selectedSeason : ""}号は準備中です`);
      return;
    }

    hideNoContent();
    grid.innerHTML = "";
    filtered.forEach((post, i) => grid.appendChild(buildArticleCard(post, i)));
  }

  async function initFeaturePage() {
    buildDynamicYearButtons();

    const paper = (typeof getCurrentPaper === 'function' ? getCurrentPaper() : getCurrentPaperLocal()) || 'tomato';
    const posts = await loadPostsForFeature(paper);

    const thisYear = new Date().getFullYear();

    const yearBtns = document.querySelectorAll("#yearSelector .selector-btn");
    const seasonBtns = document.querySelectorAll("#seasonSelector .selector-btn");

    yearBtns.forEach((btn) => {
      btn.addEventListener("click", function () {
        setActiveButton("#yearSelector", this);
        renderFeature(posts, thisYear);
      });
    });

    seasonBtns.forEach((btn) => {
      btn.addEventListener("click", function () {
        setActiveButton("#seasonSelector", this);
        renderFeature(posts, thisYear);
      });
    });

    renderFeature(posts, thisYear);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initFeaturePage);
  } else {
    initFeaturePage();
  }

  /* =====================================================================
   * 産地データ大全: survey.json から動的表示
   * - Source: /static/{paper}/survey.json
   * - 都道府県プルダウン、地域別都道府県一覧、部会一覧を動的生成
   * - 既存の静的HTMLは残し、該当DOMがある場合のみ動作
   * ===================================================================== */
  (function initJaSurveyPage() {
    if (!document.body || !document.body.classList.contains("page-survey")) return;
    if (window.__JA_SURVEY_RENDERED__ || window.__JA_SURVEY_EARLY_BOUND__) return;

    const REGION_ORDER = ["北海道", "東北", "関東", "中部", "近畿", "中国", "四国", "九州"];
    const PREF_TO_REGION = {
      "北海道":"北海道",
      "青森県":"東北","岩手県":"東北","宮城県":"東北","秋田県":"東北","山形県":"東北","福島県":"東北",
      "茨城県":"関東","栃木県":"関東","群馬県":"関東","埼玉県":"関東","千葉県":"関東","東京都":"関東","神奈川県":"関東",
      "新潟県":"中部","富山県":"中部","石川県":"中部","福井県":"中部","山梨県":"中部","長野県":"中部","岐阜県":"中部","静岡県":"中部","愛知県":"中部",
      "三重県":"近畿","滋賀県":"近畿","京都府":"近畿","大阪府":"近畿","兵庫県":"近畿","奈良県":"近畿","和歌山県":"近畿",
      "鳥取県":"中国","島根県":"中国","岡山県":"中国","広島県":"中国","山口県":"中国",
      "徳島県":"四国","香川県":"四国","愛媛県":"四国","高知県":"四国",
      "福岡県":"九州","佐賀県":"九州","長崎県":"九州","熊本県":"九州","大分県":"九州","宮崎県":"九州","鹿児島県":"九州","沖縄県":"九州"
    };

    function getPaperLocal() {
      try {
        if (typeof getCurrentPaper === "function") {
          const paper = getCurrentPaper();
          if (paper) return paper;
        }
      } catch (_e) {}
      try {
        const parts = window.location.pathname.split("/").filter(Boolean);
        const idx = parts.indexOf("static");
        if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
      } catch (_e2) {}
      return "tomato";
    }

    async function fetchJsonLocal(url) {
      const res = await fetch(url, { cache: "no-store" });
      const text = await res.text();
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      if (/^\s*</.test(text)) throw new Error(`HTML returned instead of JSON for ${url}`);
      return JSON.parse(text);
    }

    function stripHtmlLocal(text) {
      const tmp = document.createElement("div");
      tmp.innerHTML = String(text || "");
      return (tmp.textContent || tmp.innerText || "").trim();
    }

    function escapeHtmlLocal(text) {
      return String(text || "").replace(/[&<>"']/g, function(ch) {
        return ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[ch];
      });
    }

    function resolveImageUrl(path) {
      if (!path) return "";
      if (/^https?:\/\//i.test(path)) return path;
      try {
        return new URL(String(path), window.location.origin).href;
      } catch (_e) {
        return String(path);
      }
    }

    function normalizePrefectureName(name) {
      return String(name || "").trim();
    }

    function getPostPrefectures(post) {
      const fromArray = Array.isArray(post && post.prefectures)
        ? post.prefectures.map(normalizePrefectureName).filter(Boolean)
        : [];
      if (fromArray.length) return Array.from(new Set(fromArray));
      const fallback = normalizePrefectureName(post && post.prefecture);
      return fallback ? [fallback] : [];
    }

    function getRegionName(prefecture, post) {
      const normalized = normalizePrefectureName(prefecture);
      if (normalized && PREF_TO_REGION[normalized]) return PREF_TO_REGION[normalized];

      const regions = Array.isArray(post && post.regions)
        ? post.regions.map(function(v){ return String(v || "").trim(); }).filter(Boolean)
        : [];
      if (regions.length) return regions[0];
      return "その他";
    }

    function getDetailHref(post) {
      if (post && post.url) return String(post.url);
      if (post && post.id) return `detail.html?id=${encodeURIComponent(post.id)}`;
      return "#";
    }

    function buildAssociationTile(post, prefectureName) {
      const a = document.createElement("a");
      a.className = "association-tile";
      a.href = getDetailHref(post);

      const image = resolveImageUrl(post && post.featured_image);
      const title = stripHtmlLocal(post && post.title);
      const excerpt = stripHtmlLocal(post && post.excerpt);

      a.innerHTML =
        `<div class="association-tile-img">${
          image
            ? `<img src="${escapeHtmlLocal(image)}" alt="${escapeHtmlLocal(title)}" loading="lazy">`
            : `<div class="association-tile-placeholder">産地データ大全</div>`
        }</div>` +
        `<div class="association-tile-overlay">` +
          `<div class="association-tile-prefecture">${escapeHtmlLocal(prefectureName)}</div>` +
          `<h3 class="association-tile-name">${escapeHtmlLocal(title || "名称未設定")}</h3>` +
          (excerpt ? `<p class="association-tile-excerpt">${escapeHtmlLocal(excerpt)}</p>` : ``) +
        `</div>`;

      return a;
    }

    function sortPrefectures(names) {
      return names.slice().sort(function(a, b) {
        return String(a).localeCompare(String(b), "ja");
      });
    }

    async function loadSurveyData() {
      const paper = getPaperLocal();
      const candidates = [
        `/static/${encodeURIComponent(paper)}/survey.json`,
        `./survey.json`,
        `survey.json`
      ];

      let data = null;
      let lastError = null;
      for (const url of candidates) {
        try {
          data = await fetchJsonLocal(url);
          if (Array.isArray(data)) return data;
        } catch (e) {
          lastError = e;
        }
      }
      throw lastError || new Error("survey.json could not be loaded");
    }

    function buildPrefectureIndex(posts) {
      const map = new Map();
      (Array.isArray(posts) ? posts : []).forEach(function(post) {
        const prefs = getPostPrefectures(post);
        prefs.forEach(function(prefName) {
          const current = map.get(prefName) || [];
          current.push(post);
          map.set(prefName, current);
        });
      });
      return map;
    }

    function renderPrefectureGroups(prefectureMap, onSelect, selectedPrefecture) {
      const root = document.getElementById("prefectureList");
      if (!root) return;

      const grouped = {};
      Array.from(prefectureMap.keys()).forEach(function(prefName) {
        const regionName = getRegionName(prefName, (prefectureMap.get(prefName) || [])[0]);
        if (!grouped[regionName]) grouped[regionName] = [];
        grouped[regionName].push(prefName);
      });

      const outer = document.createElement("div");
      outer.className = "survey-region-groups";

      const orderedRegions = REGION_ORDER
        .filter(function(name){ return Array.isArray(grouped[name]) && grouped[name].length; })
        .concat(
          Object.keys(grouped)
            .filter(function(name){ return !REGION_ORDER.includes(name); })
            .sort(function(a, b){ return a.localeCompare(b, "ja"); })
        );

      orderedRegions.forEach(function(regionName) {
        const section = document.createElement("section");
        section.className = "survey-region-group";

        const title = document.createElement("h3");
        title.className = "survey-region-title";
        title.textContent = regionName;
        section.appendChild(title);

        const grid = document.createElement("div");
        grid.className = "prefecture-list";

        sortPrefectures(grouped[regionName]).forEach(function(prefName) {
          const count = (prefectureMap.get(prefName) || []).length;
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "prefecture-card" + (selectedPrefecture === prefName ? " selected is-active" : "");
          btn.setAttribute("data-prefecture", prefName);
          btn.innerHTML =
            `<div class="prefecture-name">${escapeHtmlLocal(prefName)}</div>` +
            `<div class="prefecture-count">${count}部会</div>`;
          btn.addEventListener("click", function() {
            onSelect(prefName);
          });
          grid.appendChild(btn);
        });

        section.appendChild(grid);
        outer.appendChild(section);
      });

      root.innerHTML = "";
      root.appendChild(outer);
    }

    function renderSelectOptions(prefectureMap, selectedPrefecture) {
      const select = document.getElementById("prefectureSelect");
      if (!select) return;

      const prefectures = sortPrefectures(Array.from(prefectureMap.keys()));
      select.innerHTML = `<option value="">すべての都道府県</option>`;
      prefectures.forEach(function(prefName) {
        const option = document.createElement("option");
        option.value = prefName;
        option.textContent = prefName;
        if (prefName === selectedPrefecture) option.selected = true;
        select.appendChild(option);
      });
    }

    function renderAssociationList(prefectureMap, selectedPrefecture) {
      const section = document.getElementById("associationSection");
      const title = document.getElementById("selectedPrefectureTitle");
      const list = document.getElementById("associationList");
      const empty = document.getElementById("associationEmptyMessage");
      if (!section || !title || !list || !empty) return;

      if (!selectedPrefecture) {
        section.style.display = "none";
        list.innerHTML = "";
        empty.hidden = true;
        title.textContent = "部会一覧";
        return;
      }

      const posts = prefectureMap.get(selectedPrefecture) || [];
      title.textContent = `${selectedPrefecture}の部会一覧`;
      list.innerHTML = "";

      if (!posts.length) {
        section.style.display = "";
        empty.hidden = false;
        return;
      }

      empty.hidden = true;
      posts
        .slice()
        .sort(function(a, b) {
          const at = Date.parse(String((a && (a.date || a.date_ymd)) || "")) || 0;
          const bt = Date.parse(String((b && (b.date || b.date_ymd)) || "")) || 0;
          return bt - at;
        })
        .forEach(function(post) {
          list.appendChild(buildAssociationTile(post, selectedPrefecture));
        });

      section.style.display = "";
    }

    function updateStats(prefectureMap) {
      const prefCountEl = document.getElementById("surveyPrefectureCount");
      const assocCountEl = document.getElementById("surveyAssociationCount");

      if (prefCountEl) prefCountEl.textContent = String(prefectureMap.size);

      if (assocCountEl) {
        const uniquePostIds = new Set();
        Array.from(prefectureMap.values()).forEach(function(items) {
          (Array.isArray(items) ? items : []).forEach(function(post) {
            const key = String((post && (post.id || post.url || post.title)) || "").trim();
            if (key) uniquePostIds.add(key);
          });
        });
        assocCountEl.textContent = String(uniquePostIds.size);
      }
    }

    function maybeSelectFromQuery(prefectureMap) {
      try {
        const sp = new URLSearchParams(window.location.search || "");
        const pref = normalizePrefectureName(sp.get("prefecture") || "");
        return pref && prefectureMap.has(pref) ? pref : "";
      } catch (_e) {
        return "";
      }
    }

    function syncQuery(prefectureName) {
      try {
        const url = new URL(window.location.href);
        if (prefectureName) url.searchParams.set("prefecture", prefectureName);
        else url.searchParams.delete("prefecture");
        window.history.replaceState({}, "", url.toString());
      } catch (_e) {}
    }

    function scrollToAssociations() {
      const section = document.getElementById("associationSection");
      if (!section || section.style.display === "none") return;
      try {
        section.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (_e) {
        section.scrollIntoView();
      }
    }


    async function loadSurveyTopData() {
      const paper = getPaperLocal();
      const candidates = [
        `/static/${encodeURIComponent(paper)}/survey-top.json`,
        `./survey-top.json`,
        `survey-top.json`
      ];

      let data = null;
      let lastError = null;
      for (const url of candidates) {
        try {
          data = await fetchJsonLocal(url);
          if (data) return data;
        } catch (e) {
          lastError = e;
        }
      }
      if (lastError) throw lastError;
      return null;
    }

    function normalizeGraphItems(items) {
      if (!Array.isArray(items)) return [];
      return items.map(function(item) {
        if (!item || typeof item !== "object") return null;
        const label = String(item.label || item.name || "").trim();
        const raw = item.value != null ? item.value : item.percent;
        let value = Number(raw);
        if (!Number.isFinite(value)) value = 0;
        value = Math.max(0, Math.min(100, value));
        return label ? { label: label, value: value } : null;
      }).filter(Boolean);
    }

    function normalizeSurveyTopEntry(entry) {
      if (!entry || typeof entry !== "object") return null;
      const graphDefaults = [
        { id: "graph1", title: "困っている害虫" },
        { id: "graph2", title: "困っている病害" },
        { id: "graph3", title: "困っている生理障害" },
        { id: "graph4", title: "導入したい資機材" }
      ];

      const rawGraphs = Array.isArray(entry.graphs) ? entry.graphs : [];
      const graphs = graphDefaults.map(function(def, index) {
        const source = rawGraphs[index] || entry[def.id] || {};
        const sourceItems = Array.isArray(source.items) ? source.items : (Array.isArray(source.categories) ? source.categories : []);
        return {
          id: String(source.id || def.id),
          title: String(source.title || def.title),
          section_title: String(source.section_title || source.sectionTitle || source.title || def.title).trim(),
          section_text: String(source.section_text || source.sectionText || "").trim(),
          section_highlight: String(source.section_highlight || source.sectionHighlight || "").trim(),
          items: normalizeGraphItems(sourceItems)
        };
      }).filter(function(graph){ return graph.items.length; });

      return {
        id: Number(entry.id || 0),
        survey_year: String(entry.survey_year || entry.year || entry.survey_top_year || "").trim(),
        survey_season: String(entry.survey_season || entry.season || "").trim(),
        survey_season_slug: String(entry.survey_season_slug || entry.season_slug || "").trim(),
        page_title: String(entry.page_title || entry.title || "").trim(),
        page_subtitle: String(entry.page_subtitle || entry.lead_subtitle || "").trim(),
        hero_title: String(entry.hero_title || "").trim(),
        hero_description: String(entry.hero_description || "").trim(),
        detail_title: String(entry.detail_title || "").trim(),
        detail_subtitle: String(entry.detail_subtitle || "").trim(),
        detail_description: String(entry.detail_description || "").trim(),
        total_producers: String(entry.total_producers || entry.stats_total_producers || "").trim(),
        response_rate: String(entry.response_rate || entry.stats_response_rate || "").trim(),
        graphs: graphs
      };
    }

    function getRequestedSurveyKey() {
      let year = "";
      let season = "";
      try {
        const sp = new URLSearchParams(window.location.search || "");
        year = String(sp.get("survey_year") || "").trim();
        season = String(sp.get("survey_season") || "").trim();
      } catch (_e) {}
      if (!year && document.body) year = String(document.body.getAttribute("data-survey-year") || "").trim();
      if (!season && document.body) season = String(document.body.getAttribute("data-survey-season") || "").trim();
      return { year: year, season: season };
    }

    function normalizeSurveySeasonValue(value) {
      const raw = String(value || "").trim().toLowerCase();
      if (!raw) return "";
      if (
        raw === "winter" ||
        raw === "winter-spring" ||
        raw === "winter_spring" ||
        raw === "winter spring" ||
        raw === "fuyu-haru" ||
        raw === "fuyuharu" ||
        raw === "冬春"
      ) return "winter";
      if (
        raw === "summer" ||
        raw === "summer-autumn" ||
        raw === "summer_autumn" ||
        raw === "summer autumn" ||
        raw === "summer-fall" ||
        raw === "summer_fall" ||
        raw === "summer fall" ||
        raw === "natsu-aki" ||
        raw === "natsuaki" ||
        raw === "夏秋"
      ) return "summer";
      return raw;
    }

    function pickSurveyTopEntry(data) {
      const rawItems = Array.isArray(data) ? data : (Array.isArray(data && data.items) ? data.items : (data ? [data] : []));
      const items = rawItems.map(normalizeSurveyTopEntry).filter(Boolean);
      if (!items.length) return null;

      const requested = getRequestedSurveyKey();
      const requestedYear = String(requested.year || "").trim();
      const requestedSeason = normalizeSurveySeasonValue(requested.season);

      if (requestedYear || requestedSeason) {
        const exact = items.find(function(item) {
          const itemYear = String(item && item.survey_year || "").trim();
          const itemSeason = normalizeSurveySeasonValue((item && (item.survey_season_slug || item.survey_season)) || "");
          const sameYear = !requestedYear || itemYear === requestedYear;
          const sameSeason = !requestedSeason || itemSeason === requestedSeason;
          return sameYear && sameSeason;
        });
        if (exact) return exact;
        return null;
      }
      return items[0];
    }

    function getPostSurveyYear(post) {
      const direct = String((post && (post.survey_year || post.year)) || "").trim();
      return direct;
    }

    function getPostSurveySeason(post) {
      return normalizeSurveySeasonValue(
        (post && (post.survey_season_slug || post.season_slug || post.survey_season || post.season)) || ""
      );
    }

    function filterSurveyPostsByCurrentState(posts) {
      const requested = getRequestedSurveyKey();
      const requestedYear = String(requested.year || "").trim();
      const requestedSeason = normalizeSurveySeasonValue(requested.season);
      const list = Array.isArray(posts) ? posts : [];

      return list.filter(function(post) {
        const postYear = getPostSurveyYear(post);
        const postSeason = getPostSurveySeason(post);
        const sameYear = !requestedYear ? true : postYear === requestedYear;
        const sameSeason = !requestedSeason ? true : postSeason === requestedSeason;
        return sameYear && sameSeason;
      });
    }

    function formatStatValue(value, suffix) {
      const raw = String(value || "").trim();
      if (!raw) return "";
      if (/[%％]$/.test(raw) || /人$/.test(raw)) return raw;
      if (suffix === "%") return raw + "%";
      try {
        const num = Number(raw.replace(/,/g, ""));
        if (Number.isFinite(num) && suffix !== "%") return num.toLocaleString("ja-JP");
      } catch (_e) {}
      return raw;
    }
    function renderParagraphBlocks(text) {
      const normalized = String(text || "").replaceAll("\r\n", "\n").replaceAll("\r", "\n").trim();
      if (!normalized) return "";
      return normalized
        .split(/\n{2,}/)
        .map(function(block) {
          const html = escapeHtmlLocal(block).split("\n").join("<br>");
          return `<p>${html}</p>`;
        })
        .join("");
    }

function renderGraphItems(items) {
      return items.map(function(item) {
        const width = Math.max(0, Math.min(100, Number(item.value) || 0));
        const pct = `${Math.round(width)}%`;
        return `
          <div class="simple-bar-item">
            <div class="simple-bar-label">${escapeHtmlLocal(item.label)}</div>
            <div class="simple-bar-track">
              <div class="simple-bar-fill${width === 0 ? " is-zero" : ""}" style="width:${width}%">${escapeHtmlLocal(pct)}</div>
            </div>
          </div>`;
      }).join("");
    }

    function renderSurveyTopContent(entry) {
      const root = document.getElementById("surveyTopDynamicContent");
      if (!root || !entry || !entry.graphs.length) return;

      const detailTitle = entry.detail_title || "部会アンケート詳細";
      const detailSubtitle = entry.detail_subtitle || "アンケート集計結果";
      const detailDescription = entry.detail_description || "全国の回答結果をもとに主な課題をまとめています。";

      const icons = [
        '<svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"></path></svg>',
        '<svg viewBox="0 0 24 24"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"></path></svg>',
        '<svg viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14h-2v-2h2v2zm0-4h-2V7h2v6z"></path></svg>'
      ];

      const sections = entry.graphs.map(function(graph, index) {
        const sectionTitle = graph.section_title || graph.title;
        const sectionTextHtml = renderParagraphBlocks(graph.section_text);
        const sectionHighlightHtml = renderParagraphBlocks(graph.section_highlight);
        const hasTextContent = Boolean(sectionTextHtml || sectionHighlightHtml);

        return `
          <div class="detail-section">
            <div class="detail-section-header">
              <div class="detail-section-icon">${icons[Math.min(index, icons.length - 1)] || icons[icons.length - 1]}</div>
              <h3 class="detail-section-title">${escapeHtmlLocal(sectionTitle)}</h3>
            </div>
            <div class="detail-content${hasTextContent ? " has-text" : ""}">
              <div class="detail-text${hasTextContent ? "" : " is-empty"}">
                ${sectionTextHtml}
                ${sectionHighlightHtml ? `<div class="detail-highlight">${sectionHighlightHtml}</div>` : ""}
              </div>
              <div class="detail-chart">
                <p class="chart-title-small">グラフ${index + 1}「${escapeHtmlLocal(graph.title)}」</p>
                <div class="simple-bar-chart">${renderGraphItems(graph.items)}</div>
              </div>
            </div>
          </div>`;
      });

      root.innerHTML = `
        <div class="survey-detail-header">
          <h2 class="survey-detail-title">${escapeHtmlLocal(detailTitle)}</h2>
          <p class="survey-detail-subtitle">${escapeHtmlLocal(detailSubtitle)}</p>
          <p class="survey-detail-description">${escapeHtmlLocal(detailDescription)}</p>
        </div>
        ${sections.join("") || '<div class="survey-top-empty">グラフデータがありません。</div>'}`;
    }


    function renderSurveyTopEmptyState() {
      const pageTitle = document.getElementById("surveyPageTitle");
      const pageSubtitle = document.getElementById("surveyPageSubtitle");
      const heroTitle = document.getElementById("surveyHeroTitle");
      const heroDescription = document.getElementById("surveyHeroDescription");
      const totalProducers = document.getElementById("surveyTotalProducers");
      const responseRate = document.getElementById("surveyResponseRate");
      const root = document.getElementById("surveyTopDynamicContent");
      const requested = getRequestedSurveyKey();
      const requestedYear = String(requested.year || "").trim();
      const requestedSeason = normalizeSurveySeasonValue(requested.season);
      const seasonLabel = requestedSeason === "winter" ? "冬春" : (requestedSeason === "summer" ? "夏秋" : "");
      const heading = [requestedYear ? requestedYear + "年" : "", seasonLabel].filter(Boolean).join(" ") || "選択中の条件";

      if (pageTitle) pageTitle.textContent = "産地データ大全";
      if (pageSubtitle) pageSubtitle.textContent = heading + " のTOPデータはまだありません。";
      if (heroTitle) heroTitle.textContent = heading + " のデータ準備中";
      if (heroDescription) heroDescription.textContent = "選択された年度・シーズンに一致する産地データTOPが見つかりませんでした。";
      if (totalProducers) totalProducers.textContent = "—";
      if (responseRate) responseRate.textContent = "—";
      if (root) {
        root.innerHTML = '<div class="survey-top-empty">選択された年度・シーズンに一致する産地データTOPデータがありません。</div>';
      }
    }

    function applySurveyTopEntry(entry) {
      if (!entry) return;
      const pageTitle = document.getElementById("surveyPageTitle");
      const pageSubtitle = document.getElementById("surveyPageSubtitle");
      const heroTitle = document.getElementById("surveyHeroTitle");
      const heroDescription = document.getElementById("surveyHeroDescription");
      const totalProducers = document.getElementById("surveyTotalProducers");
      const responseRate = document.getElementById("surveyResponseRate");

      if (pageTitle && entry.page_title) pageTitle.textContent = entry.page_title;
      if (pageSubtitle && entry.page_subtitle) pageSubtitle.textContent = entry.page_subtitle;
      if (heroTitle && entry.hero_title) heroTitle.textContent = entry.hero_title;
      if (heroDescription && entry.hero_description) heroDescription.textContent = entry.hero_description;
      if (totalProducers && entry.total_producers) totalProducers.textContent = formatStatValue(entry.total_producers, "");
      if (responseRate && entry.response_rate) responseRate.textContent = formatStatValue(entry.response_rate, "%");
      renderSurveyTopContent(entry);
    }

    async function run() {
      try {
        const posts = await loadSurveyData();
        const filteredPosts = filterSurveyPostsByCurrentState(posts);
        const prefectureMap = buildPrefectureIndex(filteredPosts);
        const select = document.getElementById("prefectureSelect");
        const searchBtn = document.getElementById("surveySearchButton");

        try {
          const surveyTopData = await loadSurveyTopData();
          const entry = pickSurveyTopEntry(surveyTopData);
          if (entry) {
            applySurveyTopEntry(entry);
          } else if (getRequestedSurveyKey().year || getRequestedSurveyKey().season) {
            renderSurveyTopEmptyState();
          }
        } catch (_e) {
          if (getRequestedSurveyKey().year || getRequestedSurveyKey().season) {
            renderSurveyTopEmptyState();
          }
        }

        if (!prefectureMap.size) {
          const empty = document.getElementById("associationEmptyMessage");
          const section = document.getElementById("associationSection");
          if (section) section.style.display = "";
          if (empty) {
            empty.hidden = false;
            empty.textContent = "産地データ大全のデータがまだありません。";
          }
          return;
        }

        let selectedPrefecture = maybeSelectFromQuery(prefectureMap);

        function rerender() {
          updateStats(prefectureMap);
          renderSelectOptions(prefectureMap, selectedPrefecture);
          renderPrefectureGroups(prefectureMap, function(prefName) {
            selectedPrefecture = prefName;
            syncQuery(selectedPrefecture);
            rerender();
            scrollToAssociations();
          }, selectedPrefecture);
          renderAssociationList(prefectureMap, selectedPrefecture);
        }

        if (select) {
          select.addEventListener("change", function() {
            selectedPrefecture = normalizePrefectureName(this.value);
          });
        }

        if (searchBtn) {
          searchBtn.addEventListener("click", function() {
            syncQuery(selectedPrefecture);
            rerender();
            scrollToAssociations();
          });
        }

        rerender();
      } catch (error) {
        console.error("[産地データ大全] render failed:", error);
        const section = document.getElementById("associationSection");
        const empty = document.getElementById("associationEmptyMessage");
        if (section) section.style.display = "";
        if (empty) {
          empty.hidden = false;
          empty.textContent = "産地データ大全の読み込みに失敗しました。survey.json を確認してください。";
        }
      }
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run);
    } else {
      run();
    }
  })();

})();

/* ==============================================
JA Survey Year + Season Switching
============================================== */

(function(){
  if (!document.body || !document.body.classList.contains("page-survey")) return;

  const yearTabs = Array.from(document.querySelectorAll("#surveyYearTabs .selector-tab"));
  const seasonTabs = Array.from(document.querySelectorAll("#surveySeasonTabs .selector-tab"));
  if (!yearTabs.length && !seasonTabs.length) return;

  function getCurrentState() {
    let year = "";
    let season = "";

    try {
      const params = new URLSearchParams(window.location.search || "");
      year = String(params.get("survey_year") || "").trim();
      season = String(params.get("survey_season") || "").trim();
    } catch (_e) {}

    if (!year && document.body) year = String(document.body.getAttribute("data-survey-year") || "").trim();
    if (!season && document.body) season = String(document.body.getAttribute("data-survey-season") || "").trim();

    return { year, season };
  }

  let state = getCurrentState();

  function setActive(tabGroup, value, attr) {
    tabGroup.forEach(function(btn) {
      if (String(btn.dataset[attr] || "") === String(value || "")) {
        btn.classList.add("active");
      } else {
        btn.classList.remove("active");
      }
    });
  }

  function syncTabs() {
    setActive(yearTabs, state.year, "year");
    setActive(seasonTabs, state.season, "season");
  }

  function navigateWithState() {
    if (document.body) {
      document.body.setAttribute("data-survey-year", state.year || "");
      document.body.setAttribute("data-survey-season", state.season || "");
    }

    const params = new URLSearchParams(window.location.search || "");

    if (state.year) params.set("survey_year", state.year);
    else params.delete("survey_year");

    if (state.season) params.set("survey_season", state.season);
    else params.delete("survey_season");

    const query = params.toString();
    const nextUrl = window.location.pathname + (query ? "?" + query : "") + window.location.hash;
    window.location.href = nextUrl;
  }

  yearTabs.forEach(function(btn) {
    btn.addEventListener("click", function() {
      const nextYear = String(btn.dataset.year || "").trim();
      if (!nextYear || nextYear === state.year) return;
      state.year = nextYear;
      syncTabs();
      navigateWithState();
    });
  });

  seasonTabs.forEach(function(btn) {
    btn.addEventListener("click", function() {
      const nextSeason = String(btn.dataset.season || "").trim();
      if (!nextSeason || nextSeason === state.season) return;
      state.season = nextSeason;
      syncTabs();
      navigateWithState();
    });
  });

  syncTabs();
})();


/* ==============================================
Desktop header nav auto-fit (single line)
- Keep current size when items already fit in one line.
- If they do not fit, reduce font size step-by-step until they fit.
============================================== */
(function(){
  function isDesktop(){
    try { return window.matchMedia('(min-width: 1180px)').matches; }
    catch(_e){ return window.innerWidth >= 1180; }
  }

  function getMenu(){
    return document.getElementById('header-main-menu');
  }

  function clearDesktopNavInlineStyles(menu){
    if (!menu) return;
    menu.style.fontSize = '';
    menu.style.gap = '';
    menu.style.flexWrap = '';
    Array.from(menu.children || []).forEach(function(li){
      li.style.minWidth = '';
      li.style.flex = '';
      li.style.whiteSpace = '';
      const a = li.querySelector('a');
      if (a) {
        a.style.fontSize = '';
        a.style.whiteSpace = '';
        a.style.lineHeight = '';
        a.style.wordBreak = '';
      }
    });
  }

  function getElementLineHeight(el){
    if (!el) return 0;
    const cs = window.getComputedStyle(el);
    const fontSize = parseFloat(cs.fontSize) || 16;
    const lineHeight = parseFloat(cs.lineHeight);
    return Number.isFinite(lineHeight) ? lineHeight : (fontSize * 1.4);
  }

  function anchorIsWrapped(a){
    if (!a || a.offsetParent === null) return false;
    const rect = a.getBoundingClientRect();
    const lineHeight = getElementLineHeight(a);
    return rect.height > (lineHeight * 1.45);
  }

  function menuFitsSingleLine(menu){
    if (!menu) return true;

    const items = Array.from(menu.children || []).filter(function(li){
      return li && li.offsetParent !== null;
    });
    if (!items.length) return true;

    const firstRect = items[0].getBoundingClientRect();
    const firstTop = Math.round(firstRect.top);
    const firstBottom = Math.round(firstRect.bottom);
    const scrollFits = menu.scrollWidth <= (menu.clientWidth + 1);

    const allItemsSameRow = items.every(function(li){
      const rect = li.getBoundingClientRect();
      return Math.abs(Math.round(rect.top) - firstTop) <= 1 && Math.abs(Math.round(rect.bottom) - firstBottom) <= 2;
    });

    const anchorsSingleLine = items.every(function(li){
      const a = li.querySelector('a');
      return !a || !anchorIsWrapped(a);
    });

    return scrollFits && allItemsSameRow && anchorsSingleLine;
  }

  function applyDesktopNavAutofit(){
    const menu = getMenu();
    if (!menu) return;

    clearDesktopNavInlineStyles(menu);

    if (!isDesktop()) return;

    if (menuFitsSingleLine(menu)) return;

    const anchors = Array.from(menu.querySelectorAll('a'));
    const firstAnchor = anchors[0];
    if (!firstAnchor) return;

    menu.style.flexWrap = 'nowrap';
    Array.from(menu.children || []).forEach(function(li){
      li.style.whiteSpace = 'nowrap';
      li.style.minWidth = '0';
      const a = li.querySelector('a');
      if (a) {
        a.style.whiteSpace = 'nowrap';
        a.style.wordBreak = 'keep-all';
        a.style.lineHeight = '1.2';
        a.style.display = 'inline-block';
      }
    });

    if (menuFitsSingleLine(menu)) return;

    const baseFontSize = parseFloat(window.getComputedStyle(firstAnchor).fontSize) || 16;
    for (var size = baseFontSize - 0.5; size >= 11; size -= 0.5) {
      anchors.forEach(function(a){
        a.style.fontSize = size + 'px';
      });
      if (menuFitsSingleLine(menu)) return;
    }
  }

  var navFitTimer = null;
  function scheduleDesktopNavAutofit(){
    if (navFitTimer) window.clearTimeout(navFitTimer);
    navFitTimer = window.setTimeout(function(){
      try { applyDesktopNavAutofit(); } catch (e) { console.error('[header nav auto-fit] failed:', e); }
    }, 0);
  }

  window.addEventListener('headerLoaded', function(){
    scheduleDesktopNavAutofit();
    window.setTimeout(scheduleDesktopNavAutofit, 100);
    window.setTimeout(scheduleDesktopNavAutofit, 300);
  });

  window.addEventListener('resize', scheduleDesktopNavAutofit);
  window.addEventListener('load', scheduleDesktopNavAutofit);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleDesktopNavAutofit);
  } else {
    scheduleDesktopNavAutofit();
  }
})();


// ==========================
// Contact form submit
// ==========================
(function initContactFormSubmit() {
  function normalizeApiRoot(root){
    var value = String(root || '').trim();
    return value ? value.replace(/\/$/, '') : '';
  }

  function normalizeCmsUrl(url){
    var value = String(url || '').trim();
    return value ? value.replace(/\/$/, '') : '';
  }

  function isHttpsPage(){
    try {
      return String(window.location.protocol || '').toLowerCase() === 'https:';
    } catch(_e) {
      return false;
    }
  }

  function isInsecureHttpUrl(url){
    return /^http:\/\//i.test(String(url || '').trim());
  }

  function getLikelyCmsOrigins(){
    var seen = new Set();
    var origins = [];

    function add(origin){
      var value = normalizeCmsUrl(origin);
      if (!value || seen.has(value)) return;
      seen.add(value);
      origins.push(value);
    }

    try {
      var sp = new URLSearchParams(window.location.search || '');
      add(sp.get('cms_url') || sp.get('cms_origin') || '');
    } catch(_e) {}

    try {
      add(window.TOMATO_AUTH_CMS_URL || '');
    } catch(_e) {}

    try {
      add(localStorage.getItem('tomato_auth_cms_url_v1') || '');
    } catch(_e) {}

    try {
      var host = String(window.location.hostname || '').toLowerCase();
      var protocol = String(window.location.protocol || '').toLowerCase();
      var https = protocol === 'https:';
      if (/^stg-[a-z0-9-]+\.agrinews\.jp$/i.test(host)) {
        if (!https) {
          add('http://54.92.118.106:8080');
          add('http://13.231.151.241:8080');
        }
      }
      if (/^(localhost|127\.0\.0\.1)$/i.test(host)) {
        add('http://localhost:8080');
        add('http://127.0.0.1:8080');
      }
    } catch(_e) {}

    return origins;
  }

  function getContactApiCandidates(){
    var seen = new Set();
    var urls = [];

    function addUrl(url){
      var value = String(url || '').trim();
      if (!value || seen.has(value)) return;
      seen.add(value);
      urls.push(value);
    }

    function addRoot(root){
      var normalized = normalizeApiRoot(root);
      if (!normalized) return;
      addUrl(normalized + '/tomato-contact/v1/submit');
    }

    function addCmsUrl(cmsUrl){
      var normalized = normalizeCmsUrl(cmsUrl);
      if (!normalized) return;
      addRoot(normalized + '/wp-json');
    }

    try {
      var sameOrigin = String(window.location.origin || '').replace(/\/$/, '');
      if (sameOrigin) addRoot(sameOrigin + '/wp-json');
      addUrl('/wp-json/tomato-contact/v1/submit');
    } catch(_e) {}

    try {
      if (window.wpApiSettings && window.wpApiSettings.root) addRoot(window.wpApiSettings.root);
    } catch(_e) {}

    try {
      if (window.TOMATO_AUTH_API_ROOT) addRoot(window.TOMATO_AUTH_API_ROOT);
      if (window.TOMATO_AUTH_CMS_URL) addCmsUrl(window.TOMATO_AUTH_CMS_URL);
    } catch(_e) {}

    try {
      var savedApiRoot = localStorage.getItem('tomato_auth_api_root_v1');
      if (savedApiRoot) addRoot(savedApiRoot);
      var savedCmsUrl = localStorage.getItem('tomato_auth_cms_url_v1');
      if (savedCmsUrl) addCmsUrl(savedCmsUrl);
    } catch(_e) {}

    try {
      var searchParams = new URLSearchParams(window.location.search || '');
      var apiRoot = searchParams.get('api_root') || searchParams.get('wp_api_root') || '';
      var cmsUrl = searchParams.get('cms_url') || searchParams.get('cms_origin') || '';
      if (apiRoot) addRoot(apiRoot);
      if (cmsUrl) addCmsUrl(cmsUrl);
    } catch(_e) {}

    getLikelyCmsOrigins().forEach(addCmsUrl);

    return urls.filter(function(url){
      if (!isHttpsPage()) return true;
      return !isInsecureHttpUrl(url);
    });
  }

  function resolvePaperSlug(){
    try {
      var classes = Array.from(document.body.classList || []);
      for (var i = 0; i < classes.length; i++) {
        var match = classes[i].match(/^paper-([a-z0-9-]+)$/);
        if (match) return match[1];
      }
    } catch(_e) {}

    try {
      var host = String(window.location.hostname || '').toLowerCase();
      var match = host.match(/^(?:stg-)?([a-z0-9-]+)\.agrinews\.jp$/i);
      if (match && match[1] && match[1] !== 'www') return match[1];
    } catch(_e) {}

    try {
      var path = String(window.location.pathname || '');
      var pathMatch = path.match(/\/static\/([^\/]+)\//i);
      if (pathMatch && pathMatch[1]) return pathMatch[1].toLowerCase();
    } catch(_e) {}

    return 'tomato';
  }

  function setMessage(el, html, isError){
    if (!el) return;
    el.hidden = false;
    el.innerHTML = html;
    if (isError) {
      el.style.borderColor = '#dc2626';
      el.style.background = '#fef2f2';
      el.style.color = '#991b1b';
    } else {
      el.style.borderColor = '';
      el.style.background = '';
      el.style.color = '';
    }
  }

  async function submitContactForm(event){
    var form = event && event.currentTarget ? event.currentTarget : document.getElementById('contactForm');
    if (!form) return;
    event.preventDefault();

    var submitButton = document.getElementById('contactSubmitButton') || form.querySelector('button[type="submit"]');
    var successBox = document.getElementById('formSuccess');
    var errorBox = document.getElementById('formError');

    if (successBox) successBox.hidden = true;
    if (errorBox) errorBox.hidden = true;

    if (!form.reportValidity()) return;

    var formData = new FormData(form);
    var payload = {
      paper: resolvePaperSlug(),
      category: String(formData.get('category') || '').trim(),
      name: String(formData.get('name') || '').trim(),
      organization: String(formData.get('organization') || '').trim(),
      email: String(formData.get('email') || '').trim(),
      tel: String(formData.get('tel') || '').trim(),
      message: String(formData.get('message') || '').trim(),
      agreement: formData.get('agreement') ? 1 : 0,
      page_url: String(window.location.href || ''),
      user_agent: String(navigator.userAgent || '')
    };

    if (!payload.category || !payload.name || !payload.email || !payload.message || !payload.agreement) {
      setMessage(errorBox, '<h3>送信に失敗しました</h3><p>必須項目を入力し、同意チェックを入れてください。</p>', true);
      return;
    }

    var originalText = submitButton ? submitButton.textContent : '';
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = '送信中...';
    }

    var candidates = getContactApiCandidates();
    var lastError = '';

    try {
      if (!candidates.length) {
        throw new Error('お問い合わせ送信先の WordPress REST API URL が見つかりませんでした。');
      }

      for (var i = 0; i < candidates.length; i++) {
        var url = candidates[i];
        try {
          var response = await fetch(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(payload),
            credentials: 'omit'
          });

          var result = null;
          try {
            result = await response.json();
          } catch(_jsonError) {
            result = null;
          }

          if (!response.ok || !result || result.success !== true) {
            var message = result && result.message ? result.message : ('HTTP ' + response.status);
            throw new Error(message);
          }

          form.reset();
          setMessage(successBox, '<h3>✓ 送信が完了しました</h3><p>お問い合わせいただきありがとうございます。<br>内容を確認の上、担当者よりご連絡いたします。<br>通常3営業日以内にご返信いたします。</p>', false);
          form.hidden = true;
          if (successBox && typeof successBox.scrollIntoView === 'function') {
            successBox.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          return;
        } catch (err) {
          lastError = err && err.message ? err.message : '送信に失敗しました。';
        }
      }

      throw new Error(lastError || 'お問い合わせ送信に失敗しました。');
    } catch (error) {
      setMessage(errorBox, '<h3>送信に失敗しました</h3><p>' + String(error && error.message ? error.message : 'お問い合わせ送信に失敗しました。時間をおいて再度お試しください。') + '</p>', true);
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = originalText || '送信する';
      }
    }
  }

  function setup(){
    var form = document.getElementById('contactForm');
    if (!form || form.dataset.contactSubmitReady === '1') return;
    form.dataset.contactSubmitReady = '1';
    form.addEventListener('submit', submitContactForm);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})();

(function () {
  function isSharedAccountPage() {
    return window.location.pathname.includes('/static/account/');
  }

  function getPaper() {
    try {
      const sp = new URLSearchParams(window.location.search || "");
      return sp.get("paper") || "tomato";
    } catch (e) {
      return "tomato";
    }
  }

  function applyFavicon() {
    if (!isSharedAccountPage()) return;

    const paper = getPaper();
    const href = `/static/${paper}/assets/images/favicon.ico`;

    document.querySelectorAll("link[rel='icon'], link[rel='shortcut icon']").forEach(function (el) {
      el.remove();
    });

    const icon = document.createElement("link");
    icon.rel = "icon";
    icon.href = href;
    icon.type = "image/x-icon";

    const shortcut = document.createElement("link");
    shortcut.rel = "shortcut icon";
    shortcut.href = href;
    shortcut.type = "image/x-icon";

    document.head.appendChild(icon);
    document.head.appendChild(shortcut);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applyFavicon);
  } else {
    applyFavicon();
  }
})();