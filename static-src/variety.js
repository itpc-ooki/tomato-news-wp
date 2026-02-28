/**
 * Variety page (tabs + filters + list/grid view) - universal for all papers
 *
 * It automatically detects the current "paper" from URL path:
 *   /static/<paper>/variety.html  -> paper = <paper>
 * and loads JSON from:
 *   /static/<paper>/varieties.json
 *
 * Supported fallback:
 *   - query param ?paper=tomato
 *   - default paper = "tomato"
 *
 * Expected JSON schema (either [] or { items: [] }):
 * {
 *   "id": 1,
 *   "name": "品種名",
 *   "category": "large" | "midi" | "mini" | "rootstock",
 *   "company": "種苗会社",
 *   "description": "品種の特徴",
 *   "image": "/static/<paper>/assets/varieties/xxx.jpg",
 *   "tomvType": "Tm-2a",
 *   "res": { "黄化葉巻病": "○", "青枯病": "◎", ... }
 * }
 */
(function () {
  /** Detect paper from URL: /static/<paper>/... */
  function detectPaper() {
    const path = (window.location && window.location.pathname) ? window.location.pathname : "";
    const m = path.match(/\/static\/([^\/]+)\//);
    if (m && m[1]) return m[1];

    const sp = new URLSearchParams(window.location.search || "");
    const qp = sp.get("paper");
    if (qp) return qp;

    return "tomato";
  }

  const paper = detectPaper();
  const DATA_URL = `/static/${paper}/varieties.json`;

  const TAB_KEYS = ["all", "large", "midi", "mini", "rootstock"];
  const CATEGORY_LABELS = {
    all: "全品種検索",
    large: "大玉トマト",
    midi: "ミディトマト",
    mini: "ミニトマト",
    rootstock: "台木用トマト",
  };

  // Order & labels for disease filter (pulldown)
  const DISEASE_FILTER_OPTIONS = [
    { key: "", label: "指定なし" },
    { key: "青枯病", label: "青枯病" },
    { key: "褐色根腐病", label: "褐色根腐病" },
    { key: "萎凋病", label: "萎凋病" },
    { key: "半身萎凋病", label: "半身萎凋病" },
    { key: "ToMV", label: "ToMV（モザイクウイルス）" },
    { key: "黄化葉巻病", label: "黄化葉巻病（TYLCV）" },
    { key: "葉かび病", label: "葉かび病" },
    { key: "ネコブセンチュウ", label: "ネコブセンチュウ" },
  ];

  const TABLE_COLUMNS = [
    // Header row 1 & 2 is fixed (matches mock)
    { key: "果実肥大性", label: "果実肥大性", kind: "trait", defaultSymbol: "○" },
    { key: "着果性", label: "着果性", kind: "trait", defaultSymbol: "○" },
    { key: "耐裂果性", label: "耐裂果性", kind: "trait", defaultSymbol: "○" },
    { key: "耐尻腐れ", label: "耐尻腐れ", kind: "trait", defaultSymbol: "○" },

    { key: "黄化葉巻病", label: "黄化葉巻病", kind: "disease" },
    { key: "葉かび病", label: "葉かび病", kind: "disease" },
    { key: "根腐萎凋病", label: "根腐萎凋病", kind: "disease" },
    { key: "萎凋病R1", label: "萎凋病R1", kind: "disease", defaultSymbol: "○" },
    { key: "萎凋病R2", label: "萎凋病R2", kind: "disease", defaultSymbol: "○" },
    { key: "斑点病", label: "斑点病", kind: "disease" },
    { key: "半身萎凋病", label: "半身萎凋病", kind: "disease" },
    { key: "ネコブセンチュウ", label: "ネコブセンチュウ", kind: "disease" },
    { key: "ToMV", label: "ToMV", kind: "tomv" },
  ];

  /** @type {Array<any>} */
  let allVarieties = [];
  let currentTab = "all";
  let currentView = "list"; // 'grid' | 'list'

  const el = {
    tabButtons: Array.from(document.querySelectorAll(".tab-button")),
    // filters
    searchInput: document.getElementById("searchInput"),
    categoryFilter: document.getElementById("categoryFilter"),
    companyFilter: document.getElementById("companyFilter"),
    diseaseFilter: document.getElementById("diseaseFilter"),
    clearBtn: document.getElementById("clearFilters"),
    pills: document.getElementById("activePills"),

    filterToggle: document.getElementById("filterToggle"),
    filterRow: document.getElementById("filterRow"),

    // view
    gridBtn: document.getElementById("gridViewBtn"),
    listBtn: document.getElementById("listViewBtn"),

    // results
    resultsCount: document.getElementById("resultsCount"),
    grid: document.getElementById("varietyGrid"),
    gridInner: document.getElementById("varietyGridInner"),
    emptyState: document.getElementById("emptyState"),
    tableLegend: document.getElementById("tableLegend"),
  };

  function normalize(s) {
    return (s ?? "").toString().trim().toLowerCase();
  }

  function escapeHtml(s) {
    return (s ?? "")
      .toString()
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function uniqueSorted(arr) {
    return Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b, "ja"));
  }

  function setActiveTab(tabKey, { syncCategorySelect = true } = {}) {
    currentTab = TAB_KEYS.includes(tabKey) ? tabKey : "all";

    el.tabButtons.forEach((btn) => {
      const active = btn.dataset.tab === currentTab;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });

    if (syncCategorySelect && el.categoryFilter) {
      // keep dropdown in sync with tabs
      el.categoryFilter.value = currentTab === "all" ? "" : currentTab;
    }

    render();
  }

  function setView(viewKey) {
    currentView = (viewKey === "grid" || viewKey === "list") ? viewKey : "list";

    if (el.gridBtn) el.gridBtn.classList.toggle("active", currentView === "grid");
    if (el.listBtn) el.listBtn.classList.toggle("active", currentView === "list");

    // We render both views inside #varietyGrid (to match latest mock).
    // Toggle parent class to switch layout.
    if (el.grid) {
      el.grid.classList.toggle("list-view", currentView === "list");
      el.grid.classList.toggle("grid-view", currentView === "grid");
      el.grid.style.display = "";
    }

    if (el.tableLegend) el.tableLegend.style.display = (currentView === "list") ? "" : "none";

    render();
  }


  function getRes(v, keys) {
    const res = (v && typeof v.res === "object" && v.res) ? v.res : {};
    for (const k of keys) {
      if (res[k] != null && res[k] !== "") return res[k];
    }


  // Use ToMV value under `res` as the source of truth (ignore root-level `tomvType`)
  function getTomvType(v) {
    const val = getRes(v, ["tomvType", "ToMV"]);
    return (val ?? "").toString().trim();
  }
    return "";
  }

  function isResPresent(symbol) {
    // treat '-' or empty as not present
    const s = (symbol ?? "").toString().trim();
    if (!s || s === "-" || s === "—") return false;
    return true;
  }

  function cellSymbol(symbol) {
    const s = (symbol ?? "").toString().trim();
    if (!s || s === "-" || s === "—") return `<span class="cell-empty">-</span>`;

    // Class names are defined in style.css (table view)
    if (s === "◎" || s === "○") return `<span class="cell-high">${escapeHtml(s)}</span>`;
    if (s === "△") return `<span class="cell-medium">${escapeHtml(s)}</span>`;
    if (s === "●") return `<span class="cell-filled">${escapeHtml(s)}</span>`;
    return `<span>${escapeHtml(s)}</span>`;
  }

  function createNameCell(v) {
    const hasImg = !!(v && v.image);
    const url = (v && v.link) ? String(v.link).trim() : "";

    // Make at least the image clickable (fallback if row click doesn't work).
    // The anchor fills the cell, while keeping the existing overlay text intact.
    const bg = hasImg
      ? (url
          ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" aria-label="${escapeHtml((v.name || "") + " の詳細へ")}" style="position:absolute; inset:0; z-index:1; display:block;">
               <img class="name-cell-bg" src="${escapeHtml(v.image)}" alt="${escapeHtml(v.name)}" onerror="this.style.display='none'">
             </a>`
          : `<img class="name-cell-bg" src="${escapeHtml(v.image)}" alt="${escapeHtml(v.name)}" onerror="this.style.display='none'">`)
      : "";
    const nameHtml = url
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="variety-name-link">${escapeHtml(v.name)}</a>`
      : `${escapeHtml(v.name)}`;

    return `
      <td class="name-cell" rowspan="2">
        ${bg}
        <div class="name-cell-inner"><span>${nameHtml}</span></div>
      </td>
    `;
  }


  function buildTableForCategory(categoryKey, varieties) {
    const headerClass =
      categoryKey === "midi" ? "midi" :
      categoryKey === "mini" ? "mini" :
      categoryKey === "rootstock" ? "rootstock" : "large";

    const label = CATEGORY_LABELS[categoryKey] || categoryKey;
    const count = varieties.length;
    // Table header (matches TOMATO_VARIETY_20260123_modified.html)

    const thead = `
      <thead>
        <tr>
          <th class="name-col" rowspan="2">品種名</th>
          <th colspan="4">※1 高温期の</th>
          <th rowspan="2">黄化葉巻病<br>※2</th>
          <th rowspan="2">葉かび病<br>※3</th>
          <th rowspan="2">根腐<br>萎凋病<br>※4</th>
          <th colspan="2">萎ちょう病 ※4</th>
          <th rowspan="2">斑点病<br>※4</th>
          <th rowspan="2">半身<br>萎ちょう病<br>※4</th>
          <th rowspan="2">ネコブ<br>センチュウ</th>
          <th rowspan="2">ToMV</th>
        </tr>
        <tr>
          <th>果実<br>肥大性</th>
          <th>着果性</th>
          <th>耐裂<br>果性</th>
          <th>耐尻<br>腐れ</th>
          <th>R1</th>
          <th>R2</th>
        </tr>
      </thead>
    `;


    
    const rows = varieties.map((v) => {
      const r = (k, fallback) => {
        const val = getRes(v, [k]);
        if (val) return val;
        return fallback || "";
      };

      const tomv = (v.tomvType || getRes(v, ["ToMV"])).toString().trim();
      const url = (v && v.link) ? String(v.link).trim() : "";
      const rowClass = url ? "clickable-row" : "";
      const rowAttrs = url
        ? `data-link="${escapeHtml(url)}" role="link" tabindex="0" aria-label="${escapeHtml((v.name || "") + " の詳細へ")}" `
        : "";

      return `
        <tr class="variety-row-top ${rowClass}" ${rowAttrs}>
          ${createNameCell(v)}
          <td>${cellSymbol(r("果実肥大性", "○"))}</td>
          <td>${cellSymbol(r("着果性", "○"))}</td>
          <td>${cellSymbol(r("耐裂果性", "○"))}</td>
          <td>${cellSymbol(r("耐尻腐れ", "○"))}</td>
          <td>${cellSymbol(r("黄化葉巻病", ""))}</td>
          <td>${cellSymbol(r("葉かび病", ""))}</td>
          <td>${cellSymbol(r("根腐萎凋病", ""))}</td>
          <td>${cellSymbol(r("萎凋病R1", "○"))}</td>
          <td>${cellSymbol(r("萎凋病R2", "○"))}</td>
          <td>${cellSymbol(r("斑点病", ""))}</td>
          <td>${cellSymbol(r("半身萎凋病", ""))}</td>
          <td>${cellSymbol(r("ネコブセンチュウ", ""))}</td>
          <td class="cell-tomv">${escapeHtml(tomv || "-")}</td>
        </tr>
        <tr class="variety-row-bottom ${rowClass}" ${rowAttrs}>
          <td class="cell-features" colspan="12">${escapeHtml(v.description || "")}</td>
          <td class="cell-company">${escapeHtml(v.company || "")}</td>
        </tr>
      `;
    }).join("");


    return `
      <section class="category-section">
        <div class="category-header ${headerClass}">
          <span>${escapeHtml(label)}</span>
          <span class="category-count">${escapeHtml(String(count))}品種</span>
        </div>
        <div class="variety-table-wrapper">
          <table class="variety-table variety-table-2row">
            ${thead}
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderGridCard(v) {
    const img = v.image
      ? `<img src="${escapeHtml(v.image)}" alt="${escapeHtml(v.name)}">`
      : "";

    const categoryKey = (v.category || "").toString().trim();
    const categoryLabel = CATEGORY_LABELS[categoryKey] || categoryKey || "";
    const categoryClass = categoryKey ? ` ${escapeHtml(categoryKey)}` : "";

    // Traits (match mock chips)
    const traits = [
      { key: "果実肥大性", label: "果実肥大性" },
      { key: "着果性", label: "着果性" },
      { key: "耐裂果性", label: "耐裂果性" },
      { key: "耐尻腐れ", label: "耐尻腐れ" },
    ];

    function traitClass(symbol) {
      const s = (symbol || "").toString().trim();
      if (s === "◎" || s === "○" || s === "●") return "is-good";
      if (s === "△") return "is-medium";
      return "is-none";
    }

    const traitPills = traits.map((t) => {
      const sym = getRes(v, [t.key]) || "";
      const cls = traitClass(sym);
      const symLabel = sym ? `<span class="trait-symbol">${escapeHtml(sym)}</span>` : "";
      return `
        <span class="trait-pill ${cls}">
          <span class="trait-dot" aria-hidden="true"></span>
          <span class="trait-label">${escapeHtml(t.label)}</span>
          ${symLabel}
        </span>
      `.trim();
    }).join("");

    // small badge (ToMV)
    const tomv = (v.tomvType || getRes(v, ["ToMV"])).toString().trim();
    const tomvBadge = tomv ? `<span class="resistance-badge">ToMV ${escapeHtml(tomv)}</span>` : "";

    return `
      <div class="variety-card ${v.image ? "" : "no-image"}" tabindex="0">
        <div class="card-image-hero">
          ${img}
          <div class="card-category${categoryClass}">${escapeHtml(categoryLabel)}</div>
        </div>

        <div class="card-header">
          <h3 class="card-title">${escapeHtml(v.name)}</h3>
          <div class="card-company"><span class="company-icon" aria-hidden="true"></span>${escapeHtml(v.company || "")}</div>
        </div>

        <div class="card-summary">
          <div class="trait-pills">${traitPills}</div>
          ${tomvBadge ? `<div class="resistance-row">${tomvBadge}</div>` : ""}
          <p class="card-description">${escapeHtml(v.description || "")}</p>
        </div>
      </div>
    `;
  }

  function getFilters() {
    const keyword = normalize(el.searchInput?.value);
    const category = el.categoryFilter?.value || ""; // '' means all
    const company = el.companyFilter?.value || "";
    const disease = el.diseaseFilter?.value || "";

    // currentTab acts as an additional constraint, but we keep it synced with category select
    const tabConstraint = (currentTab !== "all") ? currentTab : "";

    return { keyword, category, company, disease, tabConstraint };
  }

  function matchKeyword(v, keyword) {
    if (!keyword) return true;

    const base = [
      v.name,
      v.company,
      v.description,
      v.category,
      CATEGORY_LABELS[v.category] || "",
    ].join(" ").toLowerCase();

    if (base.includes(keyword)) return true;

    // also search resistance keys
    const res = (v && typeof v.res === "object" && v.res) ? v.res : {};
    for (const [k, val] of Object.entries(res)) {
      const s = `${k} ${val}`.toLowerCase();
      if (s.includes(keyword)) return true;
    }
    return false;
  }

  function getFilteredList() {
    const { keyword, category, company, disease, tabConstraint } = getFilters();

    return allVarieties.filter((v) => {
      const cat = v.category || "";

      // tab / category constraint
      if (tabConstraint && cat !== tabConstraint) return false;
      if (category && cat !== category) return false;

      // company
      if (company && (v.company || "") !== company) return false;

      // disease resistance filter (requires value present and not "-")
      if (disease) {
        if (disease === "ToMV") {
          const tomv = (v.tomvType || getRes(v, ["ToMV"])).toString().trim();
          if (!tomv || tomv === "-" || tomv === "—") return false;
        } else if (disease === "萎凋病") {
          const r1 = getRes(v, ["萎凋病R1"]);
          const r2 = getRes(v, ["萎凋病R2"]);
          if (!isResPresent(r1) && !isResPresent(r2)) return false;
        } else {
          const sym = getRes(v, [disease]);
          if (!isResPresent(sym)) return false;
        }
      }

      // keyword
      return matchKeyword(v, keyword);
    });
  }

  function renderPills() {
    if (!el.pills) return;
    const { keyword, category, company, disease } = getFilters();

    /** @type {{key:string,label:string,onRemove:()=>void}[]} */
    const pills = [];

    if (category) {
      pills.push({
        key: "category",
        label: `カテゴリ: ${CATEGORY_LABELS[category] || category}`,
        onRemove: () => {
          if (el.categoryFilter) el.categoryFilter.value = "";
          setActiveTab("all");
        },
      });
    } else if (currentTab !== "all") {
      pills.push({
        key: "tab",
        label: `カテゴリ: ${CATEGORY_LABELS[currentTab]}`,
        onRemove: () => setActiveTab("all"),
      });
    }

    if (company) {
      pills.push({
        key: "company",
        label: `メーカー: ${company}`,
        onRemove: () => { if (el.companyFilter) el.companyFilter.value = ""; render(); },
      });
    }

    if (disease) {
      const opt = DISEASE_FILTER_OPTIONS.find((o) => o.key === disease);
      pills.push({
        key: "disease",
        label: `病害: ${(opt && opt.label) ? opt.label : disease}`,
        onRemove: () => { if (el.diseaseFilter) el.diseaseFilter.value = ""; render(); },
      });
    }

    if (keyword) {
      pills.push({
        key: "keyword",
        label: `検索: ${keyword}`,
        onRemove: () => { if (el.searchInput) el.searchInput.value = ""; render(); },
      });
    }

    if (pills.length === 0) {
      el.pills.innerHTML = "";
      return;
    }

    el.pills.innerHTML = pills.map((p) => `
      <span class="pill" data-pill="${escapeHtml(p.key)}">
        ${escapeHtml(p.label)}
        <span class="pill-remove" role="button" tabindex="0" aria-label="削除">×</span>
      </span>
    `).join("");

    // bind remove
    Array.from(el.pills.querySelectorAll(".pill")).forEach((pillEl, idx) => {
      const btn = pillEl.querySelector(".pill-remove");
      const pill = pills[idx];
      if (!btn || !pill) return;

      const act = () => pill.onRemove();
      btn.addEventListener("click", act);
      btn.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          act();
        }
      });
    });
  }

  

  function bindClickableVarietyRows(root) {
    if (!root) return;

    const tables = root.querySelectorAll(".variety-table");
    tables.forEach((table) => {
      if (table.dataset && table.dataset.rowClickBound === "1") return;
      if (table.dataset) table.dataset.rowClickBound = "1";

      table.addEventListener("click", function (e) {
        const target = e.target;
        if (!target || !target.closest) return;

        // If the user clicked an actual link, let it behave normally.
        const a = target.closest("a");
        if (a) return;

        const tr = target.closest("tr.clickable-row");
        if (!tr || !table.contains(tr)) return;

        const link = tr.getAttribute("data-link");
        if (!link) return;

        window.open(link, "_blank", "noopener");
      });

      table.addEventListener("keydown", function (e) {
        const key = e.key;
        if (key !== "Enter" && key !== " ") return;

        const target = e.target;
        if (!target || !target.closest) return;

        const tr = target.closest("tr.clickable-row");
        if (!tr || !table.contains(tr)) return;

        const link = tr.getAttribute("data-link");
        if (!link) return;

        e.preventDefault();
        window.open(link, "_blank", "noopener");
      });
    });
  }
function render() {
    const list = getFilteredList();
    renderPills();

    if (el.resultsCount) {
      el.resultsCount.innerHTML = `検索結果: <strong>${escapeHtml(String(list.length))}</strong> 品種`;
    }

    const isEmpty = (list.length === 0);
    if (el.emptyState) el.emptyState.style.display = isEmpty ? "" : "none";

    if (!el.gridInner) return;

    if (isEmpty) {
      el.gridInner.innerHTML = "";
      return;
    }

    if (currentView === "grid") {
      el.gridInner.innerHTML = list.map(renderGridCard).join("");
      return;
    }

    // list view (table): group by category
    const grouped = {
      large: [],
      midi: [],
      mini: [],
      rootstock: [],
    };
    list.forEach((v) => {
      const c = v.category || "large";
      if (!grouped[c]) grouped[c] = [];
      grouped[c].push(v);
    });

    // render in the standard order
    const sections = ["large", "midi", "mini", "rootstock"]
      .filter((k) => grouped[k] && grouped[k].length > 0)
      .map((k) => buildTableForCategory(k, grouped[k]))
      .join("");

    el.gridInner.innerHTML = sections || "";
    bindClickableVarietyRows(el.gridInner);
  }

  function populateSelectOptions() {
    // category dropdown (keys match tabs)
    if (el.categoryFilter) {
      el.categoryFilter.innerHTML =
        `<option value="">すべて</option>` +
        ["large", "midi", "mini", "rootstock"]
          .map((k) => `<option value="${escapeHtml(k)}">${escapeHtml(CATEGORY_LABELS[k] || k)}</option>`)
          .join("");
    }

    // company dropdown
    if (el.companyFilter) {
      const companies = uniqueSorted(allVarieties.map((v) => v.company));
      el.companyFilter.innerHTML =
        `<option value="">すべて</option>` +
        companies.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
    }

    // disease dropdown (fixed order)
    if (el.diseaseFilter) {
      el.diseaseFilter.innerHTML = DISEASE_FILTER_OPTIONS
        .map((o) => `<option value="${escapeHtml(o.key)}">${escapeHtml(o.label)}</option>`)
        .join("");
    }
  }

  async function loadData() {
    const res = await fetch(DATA_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load ${DATA_URL}: ${res.status}`);
    const json = await res.json();

    const items = Array.isArray(json) ? json : (json?.items ?? []);
    allVarieties = (items || []).map((v) => ({
      id: v.id,
      link: v.link ?? "",
      name: v.name ?? "",
      category: v.category ?? "large",
      company: v.company ?? "",
      description: v.description ?? v.features ?? "",
      image: v.image ?? "",
      res: (v && typeof v.res === "object" && v.res) ? v.res : {},
    }));

    populateSelectOptions();
    render();
  }

  function bindEvents() {
    // tabs
    el.tabButtons.forEach((btn) => {
      btn.addEventListener("click", () => setActiveTab(btn.dataset.tab));
    });

    // filters
    const onChange = () => {
      // keep tabs synced with category dropdown
      const selectedCategory = el.categoryFilter?.value || "";
      if (selectedCategory) {
        setActiveTab(selectedCategory, { syncCategorySelect: false });
      } else {
        setActiveTab("all", { syncCategorySelect: false });
      }
      render();
    };

    el.searchInput?.addEventListener("input", render);
    el.categoryFilter?.addEventListener("change", onChange);
    el.companyFilter?.addEventListener("change", render);
    el.diseaseFilter?.addEventListener("change", render);

    el.clearBtn?.addEventListener("click", () => {
      if (el.searchInput) el.searchInput.value = "";
      if (el.categoryFilter) el.categoryFilter.value = "";
      if (el.companyFilter) el.companyFilter.value = "";
      if (el.diseaseFilter) el.diseaseFilter.value = "";
      setActiveTab("all");
      render();
    });

    // view
    el.gridBtn?.addEventListener("click", () => setView("grid"));
    el.listBtn?.addEventListener("click", () => setView("list"));

    // mobile filter toggle (if present in CSS)
    el.filterToggle?.addEventListener("click", () => {
      if (!el.filterRow) return;
      const isOpen = el.filterRow.classList.toggle("active");
      el.filterToggle?.classList.toggle("active", isOpen);
      el.filterToggle?.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
  }


  /* =====================================================================
   * SP: 「品種選びのポイント」アコーディオン
   * - Mockup (TOMATO_VARIETY_20260123_modified.html) と同じ挙動に合わせる
   * - 画面幅 < 768px のときだけ .point-card に open をトグル
   * ===================================================================== */
  function bindPointCardAccordion() {
    const cards = Array.from(document.querySelectorAll('.point-card'));
    if (!cards.length) return;

    cards.forEach((card) => {
      const title = card.querySelector('.point-title');
      if (!title) return;

      // avoid duplicate binding
      if (title.dataset && title.dataset.accBound === '1') return;
      if (title.dataset) title.dataset.accBound = '1';

      title.addEventListener('click', function (e) {
        if (window.innerWidth < 768) {
          e.preventDefault();
          card.classList.toggle('open');
        }
      });
    });
  }


  // init
  bindEvents();
  bindPointCardAccordion();
  setView("list");
  loadData().catch((err) => {
    console.error(err);
    const msg =
      `<div class="loading">データの読み込みに失敗しました。<br>` +
      `URL: ${escapeHtml(DATA_URL)}<br>` +
      `console を確認してください。</div>`;

    if (el.grid) el.grid.innerHTML = msg;
  });
})();
