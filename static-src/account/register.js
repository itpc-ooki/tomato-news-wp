/* トマト新聞 会員登録 — フォーム制御（依存なし） */
(() => {
  'use strict';

  const PREFECTURES = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
  const FARM_SCALES = ['家庭菜園','10a未満','10a～25a未満','25a～50a未満','50a～1ha未満','1ha～10ha未満','10ha～20ha未満','20ha～30ha未満','30ha以上','農業をしていない'];
  const CROPS = ['大玉トマト','中玉トマト','ミニトマト','トマト台木','水稲','麦類','豆類','スイートコーン','ハクサイ','キャベツ','レタス','ホウレンソウ','小松菜','長ネギ（白ネギ）','青ネギ（葉ネギ）','キュウリ','ナス','タマネギ','カボチャ','サツマイモ','じゃがいも','ニンジン','イチゴ','果樹類','畜産','酪農','ブロッコリー','アスパラガス','お茶','ピーマン'];
  const INTERESTS = ['栽培技術','病害虫対策','品種情報','市況・流通','スマート農業','環境制御','有機栽培','補助金・支援制度'];
  const NO_FARMING = '農業をしていない';
  const STEP_NAMES = ['アカウント','プロフィール','栽培・関心','確認'];

  function track(eventName, params = {}) {
    try {
      if (typeof window.gtag === 'function') window.gtag('event', eventName, params);
      else if (Array.isArray(window.dataLayer)) window.dataLayer.push({ event: eventName, ...params });
    } catch (e) {}
  }
  let formStarted = false;

  const MESSAGES = {
    email:            { valueMissing:'メールアドレスを入力してください', typeMismatch:'メールアドレスの形が正しくありません。「@」が入っているかご確認ください（例：tomato@example.jp）', customError:'このメールアドレスは既に登録されています。上の「ログイン」からお入りください' },
    password:         { valueMissing:'パスワードを入力してください', patternMismatch:'下の4つの条件がすべて緑色になるように入力してください', tooShort:'8文字以上で入力してください' },
    password_confirm: { valueMissing:'確認のため、もう一度同じパスワードを入力してください', customError:'1つ目のパスワードと一致していません。「表示」を押して見比べてください' },
    nickname:         { valueMissing:'ニックネームを入力してください' },
    gender:           { valueMissing:'性別を選んでください' },
    prefecture:       { valueMissing:'都道府県を選んでください' },
    city:             { valueMissing:'市町村を入力してください' },
    occupation:       { valueMissing:'職業を選んでください' },
    farm_scale:       { valueMissing:'営農規模を選んでください' },
    crop1:            { valueMissing:'主な栽培品目を選んでください' },
    mail_optin:       { valueMissing:'「希望する」「希望しない」のどちらかを選んでください' },
    privacy_agree:    { valueMissing:'登録には、個人情報の取扱いへの同意（チェック）が必要です' },
  };
  const VALIDITY_KEYS = ['valueMissing','typeMismatch','patternMismatch','tooShort','tooLong','customError'];
  const SUMMARY = [
    { step:1, title:'アカウント',   rows:[['メールアドレス','email'],['パスワード','password']] },
    { step:2, title:'プロフィール', rows:[['ニックネーム','nickname'],['性別','gender'],['お住まい','prefecture+city'],['職業','occupation']] },
    { step:3, title:'栽培・ご関心', rows:[['営農規模','farm_scale'],['主な栽培品目','crop1'],['2品目目','crop2'],['今後作りたい品目','crop_future'],['興味のある分野','interests'],['ご案内メール','mail_optin']] },
  ];

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const form = $('#rg-form'), card = $('#register');
  const panels = $$('.rg-panel', form), steps = $$('.rg-step');
  const fill = $('.rg-steps__fill');
  const btnBack = $('#rg-back'), btnNext = $('#rg-next'), btnSubmit = $('#rg-submit');
  const TOTAL = panels.length;
  let current = 1, maxReached = 1, dirty = false, done = false;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scrollToY = y => window.scrollTo({ top: Math.max(0, y), behavior: reduceMotion ? 'auto' : 'smooth' });
  const headerH = () => { const h = document.querySelector('header.site-header'); return h ? h.getBoundingClientRect().height : 0; };
  function revealCard() {
    const r = card.getBoundingClientRect();
    const top = headerH() + 8;
    if (r.top < top - 4 || r.top > window.innerHeight * 0.5) scrollToY(window.scrollY + r.top - top);
  }
  function centerEl(el) {
    const r = el.getBoundingClientRect();
    scrollToY(window.scrollY + r.top - window.innerHeight / 2 + r.height / 2);
  }

  /* 初期化 */
  const addOptions = (sel, items) => items.forEach(v => sel.add(new Option(v, v)));
  addOptions($('#prefecture'), PREFECTURES);
  addOptions($('#farm_scale'), FARM_SCALES);
  addOptions($('#crop1'), [...CROPS, NO_FARMING, 'その他']);
  addOptions($('#crop2'), [...CROPS, 'その他']);
  addOptions($('#crop_future'), [...CROPS, 'その他']);
  $('#interests-list').innerHTML = INTERESTS.map(v =>
    `<label class="rg-choice rg-choice--check"><input type="checkbox" name="interests[]" value="${v}">${v}</label>`).join('');

  const qs = new URLSearchParams(location.search);
  const detectedPaper = (() => {
    try {
      const value = typeof window.__detectPaper === 'function'
        ? String(window.__detectPaper() || '').toLowerCase()
        : '';
      if (/^[a-z0-9_-]+$/.test(value)) return value;
    } catch (e) {}
    return 'tomato';
  })();
  form.elements.paper.value = detectedPaper;
  ['utm_source','utm_medium','utm_campaign','utm_content'].forEach(k => {
    if (qs.get(k) && form.elements[k]) form.elements[k].value = qs.get(k);
  });

  /* 選択カードの状態（:has() 非対応の古い端末向けにクラスで制御） */
  function syncChoices(scope = form) {
    $$('.rg-choice', scope).forEach(l => {
      const i = l.querySelector('input');
      l.classList.toggle('is-checked', !!(i && i.checked));
    });
  }
  form.addEventListener('focusin', e => { const l = e.target.closest('.rg-choice'); if (l) l.classList.add('is-focus'); });
  form.addEventListener('focusout', e => { const l = e.target.closest('.rg-choice'); if (l) l.classList.remove('is-focus'); });

  /* バリデーション */
  const fieldEls = name => {
    const el = form.elements[name];
    if (!el) return [];
    return (el instanceof RadioNodeList) ? [...el] : [el];
  };
  function validateField(name, { showOk = false } = {}) {
    const els = fieldEls(name);
    if (!els.length) return true;
    const el = els[0];
    if (name === 'password_confirm') el.setCustomValidity(el.value && el.value !== form.elements.password.value ? 'mismatch' : '');
    let msg = '';
    if (!el.validity.valid) {
      const key = VALIDITY_KEYS.find(k => el.validity[k]);
      msg = (MESSAGES[name] && MESSAGES[name][key]) || '入力内容をご確認ください';
    }
    const wrap = form.querySelector(`[data-field="${name}"]`);
    wrap.classList.toggle('is-invalid', !!msg);
    if (el.tagName === 'INPUT' && (el.type === 'email' || el.type === 'text')) wrap.classList.toggle('is-valid', !msg && showOk && el.value.trim() !== '');
    const err = $(`#${name}-error`);
    if (err) err.textContent = msg;
    els.forEach(e => e.setAttribute('aria-invalid', msg ? 'true' : 'false'));
    return !msg;
  }
  function validatePanel(stepNo) {
    const names = [...new Set($$('[data-field]', panels[stepNo - 1]).map(w => w.dataset.field))].filter(n => MESSAGES[n]);
    let firstInvalid = null;
    names.forEach(n => { if (!validateField(n) && !firstInvalid) firstInvalid = fieldEls(n)[0]; });
    if (firstInvalid) { firstInvalid.focus({ preventScroll: true }); centerEl(firstInvalid.closest('.rg-field')); return false; }
    return true;
  }

  form.addEventListener('input', e => {
    dirty = true;
    if (!formStarted) { formStarted = true; track('form_start', { form_id: 'tomato_register' }); }
    const name = e.target.name;
    if (name === 'password') updatePwRules(e.target.value);
    if (name === 'email') e.target.setCustomValidity('');
    const wrap = e.target.closest('[data-field]');
    if (wrap && (wrap.classList.contains('is-invalid') || wrap.classList.contains('is-valid'))) validateField(wrap.dataset.field, { showOk: true });
    if (name === 'password' && form.elements.password_confirm.value) validateField('password_confirm');
  });
  form.addEventListener('change', e => {
    syncChoices();
    const wrap = e.target.closest('[data-field]');
    if (wrap && MESSAGES[wrap.dataset.field]) validateField(wrap.dataset.field);
    if (e.target.name === 'farm_scale' && e.target.value === NO_FARMING && !form.elements.crop1.value) {
      form.elements.crop1.value = NO_FARMING; validateField('crop1');
    }
  });
  form.addEventListener('focusout', e => {
    const t = e.target;
    if (!t.name || t.type === 'radio' || t.type === 'checkbox') return;
    if (t.value.trim() !== '' && MESSAGES[t.name]) validateField(t.name, { showOk: true });
  });

  const RULES = { len: v => v.length >= 8 && v.length <= 20, upper: v => /[A-Z]/.test(v), lower: v => /[a-z]/.test(v), num: v => /\d/.test(v) };
  function updatePwRules(v) { $$('#password-rules [data-rule]').forEach(li => li.classList.toggle('is-ok', RULES[li.dataset.rule](v))); }

  const EYE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
  $$('[data-toggle-pw]').forEach(btn => {
    btn.innerHTML = EYE + '<span>表示</span>';
    btn.addEventListener('click', () => {
      const input = $('#' + btn.dataset.togglePw);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.querySelector('span').textContent = show ? '隠す' : '表示';
      btn.setAttribute('aria-pressed', String(show));
    });
  });

  /* ステップ遷移 */
  function goTo(n, { focus = true } = {}) {
    current = Math.min(Math.max(n, 1), TOTAL);
    maxReached = Math.max(maxReached, current);
    panels.forEach((p, i) => { p.hidden = (i + 1) !== current; });
    steps.forEach((s, i) => {
      const no = i + 1;
      s.classList.toggle('is-current', no === current);
      s.classList.toggle('is-done', no !== current && no <= maxReached);
      if (no === current) s.setAttribute('aria-current', 'step'); else s.removeAttribute('aria-current');
      s.tabIndex = (no <= maxReached && no !== current) ? 0 : -1;
    });
    fill.style.width = `${(current - 1) / (TOTAL - 1) * 75}%`;
    $('#rg-progress').innerHTML = `ただいま <b>4つのうち ${current} 番目</b>：${STEP_NAMES[current - 1]}`;
    btnBack.hidden = current === 1;
    btnNext.hidden = current === TOTAL;
    btnSubmit.hidden = current !== TOTAL;
    if (current === TOTAL) renderSummary();
    track('register_step_view', { step: current, step_name: STEP_NAMES[current - 1] });
    if (focus) { revealCard(); $('.rg-panel__title', panels[current - 1]).focus({ preventScroll: true }); }
  }
  btnNext.addEventListener('click', () => { if (validatePanel(current)) goTo(current + 1); });
  btnBack.addEventListener('click', () => goTo(current - 1));
  steps.forEach(s => s.addEventListener('click', () => {
    const n = Number(s.dataset.goto);
    if (n < current) goTo(n);
    else if (n <= maxReached && n > current) {
      for (let i = current; i < n; i++) { if (!validatePanel(i)) { goTo(i); validatePanel(i); return; } }
      goTo(n);
    }
  }));

  /* 確認画面 */
  function valueOf(key) {
    const fd = new FormData(form);
    if (key === 'password') return '●'.repeat(form.elements.password.value.length) + '（非表示）';
    if (key === 'prefecture+city') return [fd.get('prefecture'), fd.get('city')].filter(Boolean).join(' ');
    if (key === 'interests') return fd.getAll('interests[]').join('、');
    if (key === 'gender') return ({ '男':'男性', '女':'女性' })[fd.get('gender')] || '';
    return fd.get(key) || '';
  }
  function renderSummary() {
    const root = $('#rg-summary');
    root.textContent = '';
    SUMMARY.forEach(sec => {
      const box = document.createElement('section'); box.className = 'rg-summary';
      const head = document.createElement('div'); head.className = 'rg-summary__head';
      const h = document.createElement('span'); h.textContent = sec.title;
      const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'rg-summary__edit';
      edit.textContent = '修正する'; edit.setAttribute('aria-label', `${sec.title}を修正する`);
      edit.addEventListener('click', () => goTo(sec.step));
      head.append(h, edit);
      const dl = document.createElement('dl');
      sec.rows.forEach(([label, key]) => {
        const row = document.createElement('div'); row.className = 'rg-summary__row';
        const dt = document.createElement('dt'); dt.textContent = label;
        const dd = document.createElement('dd'); dd.textContent = valueOf(key) || '—';
        row.append(dt, dd); dl.append(row);
      });
      box.append(head, dl); root.append(box);
    });
  }

  /* 送信 */
  async function submitRegistration(formData) {
    if (!window.TomatoAuth || typeof window.TomatoAuth.registerFromFormData !== 'function') {
      throw new Error('会員登録機能を読み込めませんでした。');
    }

    const apiData = new FormData();
    const names = [
      'email', 'password', 'password_confirm', 'nickname', 'gender',
      'prefecture', 'city', 'occupation', 'farm_scale'
    ];
    names.forEach(name => apiData.set(name, String(formData.get(name) || '')));
    apiData.set('crop_1', String(formData.get('crop1') || ''));
    apiData.set('crop_2', String(formData.get('crop2') || ''));
    apiData.set('future_crop', String(formData.get('crop_future') || ''));
    formData.getAll('interests[]').filter(Boolean).forEach(value => {
      apiData.append('interests', String(value));
    });
    apiData.set('newsletter_preference', String(formData.get('mail_optin') || '希望する'));
    apiData.set('paper', detectedPaper);

    return window.TomatoAuth.registerFromFormData(apiData);
  }
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (current < TOTAL) { btnNext.click(); return; }
    for (let i = 1; i <= TOTAL; i++) { if (!validatePanel(i)) { if (i !== current) { goTo(i); validatePanel(i); } return; } }
    const alertEl = $('#rg-submit-error');
    alertEl.hidden = true;
    btnSubmit.disabled = true; btnBack.disabled = true;
    btnSubmit.classList.add('is-loading'); btnSubmit.textContent = '登録しています…';
    try {
      const resultUser = await submitRegistration(new FormData(form));
      done = true;
      track('sign_up', { method: 'email', form_id: 'tomato_register' });
      if (typeof window.pushRegistrationCompleteEvent === 'function') {
        window.pushRegistrationCompleteEvent(resultUser);
      }
      $('#rg-form-area').hidden = true;
      const doneEl = $('#rg-done'); doneEl.hidden = false;
      revealCard(); doneEl.focus({ preventScroll: true });
    } catch (err) {
      const errorMessage = String(err && err.message ? err.message : '');
      if (
        (err && err.code === 'EMAIL_DUPLICATE') ||
        /既に登録|登録済み|すでに登録/.test(errorMessage)
      ) {
        goTo(1); form.elements.email.setCustomValidity('duplicate'); validateField('email'); form.elements.email.focus();
      } else {
        alertEl.textContent = errorMessage || '通信エラーが発生しました。電波の良い場所で、時間をおいてもう一度お試しください。';
        alertEl.hidden = false;
      }
    } finally {
      btnSubmit.disabled = false; btnBack.disabled = false;
      btnSubmit.classList.remove('is-loading'); btnSubmit.textContent = '同意して登録する';
    }
  });

  /* ページ内の「登録する」ボタン → フォームへ */
  $$('[data-to-form]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    track('register_cta_click', { location: a.dataset.toForm });
    if (current !== 1 || done) { revealCard(); return; }
    revealCard();
    setTimeout(() => form.elements.email.focus({ preventScroll: true }), 350);
  }));

  window.addEventListener('beforeunload', e => { if (dirty && !done) { e.preventDefault(); e.returnValue = ''; } });

  /* 共通ヘッダー／フッター（本番 app.js の toggleMobileMenu / toggleFooterMenu 相当） */
  window.toggleMobileMenu = () => { $('#mobileMenu').classList.toggle('active'); $('#mobileMenuOverlay').classList.toggle('active'); };
  window.toggleFooterMenu = el => { if (window.innerWidth <= 768) el.classList.toggle('active'); };

  syncChoices();
  goTo(1, { focus: false });
})();

/* ============ 新聞別の会員記事・ライブ配信 ============ */
(() => {
  'use strict';

  const paper = (() => {
    try {
      const value = typeof window.__detectPaper === 'function'
        ? String(window.__detectPaper() || '').toLowerCase()
        : '';
      return /^[a-z0-9_-]+$/.test(value) ? value : 'tomato';
    } catch (e) {
      return 'tomato';
    }
  })();
  const LOCK = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="#fff"/><path d="M5 7V5a3 3 0 016 0v2" fill="none" stroke="#fff" stroke-width="1.6"/></svg>';

  function text(value) {
    return String(value === null || value === undefined ? '' : value);
  }

  function isEnabled(value) {
    if (value === true || value === 1) return true;
    const normalized = text(value).trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'on' || normalized === 'yes';
  }

  function imageUrl(value) {
    const url = text(value).trim();
    if (!url) return '';
    if (/^(?:https?:)?\/\//i.test(url) || url.startsWith('/')) return url;
    return `/static/${encodeURIComponent(paper)}/${url.replace(/^\.\//, '')}`;
  }

  function postUrl(post) {
    const supplied = text(post && post.url).trim();
    if (/^(?:https?:)?\/\//i.test(supplied) || supplied.startsWith('/')) return supplied;
    if (supplied) {
      return `/static/${encodeURIComponent(paper)}/${supplied.replace(/^\.\//, '')}`;
    }
    const id = text(post && post.id).trim();
    return id
      ? `/static/${encodeURIComponent(paper)}/detail.html?id=${encodeURIComponent(id)}`
      : `/static/${encodeURIComponent(paper)}/list.html`;
  }

  function paperProfile() {
    const profiles = {
      tomato: {
        name: 'トマト新聞',
        description: '日本農業新聞が運営する、トマト生産者のための総合情報サイトです。'
      },
      ichigo: {
        name: 'イチゴ新聞',
        description: '日本農業新聞が運営する、イチゴ生産者のための総合情報サイトです。'
      }
    };
    return profiles[paper] || {
      name: '品目別新聞',
      description: '日本農業新聞が運営する、品目別の総合情報サイトです。'
    };
  }

  function renderPaperBranding() {
    const profile = paperProfile();
    document.title = `会員登録（無料）｜${profile.name}`;

    const description = document.getElementById('rg-page-description');
    if (description) {
      description.setAttribute(
        'content',
        `${profile.description}無料会員登録は約2分で完了します。`
      );
    }
    const eyebrow = document.getElementById('rg-eyebrow');
    if (eyebrow) eyebrow.innerHTML = `<b>無料</b>${profile.name} 会員登録`;
    const paperDescription = document.getElementById('rg-paper-description');
    if (paperDescription) paperDescription.textContent = profile.description;

    const topUrl = `/static/${encodeURIComponent(paper)}/index.html`;
    const loginUrl = `/static/account/login.html?paper=${encodeURIComponent(paper)}`;
    const topLink = document.getElementById('rg-top-link');
    const loginLink = document.getElementById('rg-login-link');
    const doneTopLink = document.getElementById('rg-done-top-link');
    const doneTopLabel = document.getElementById('rg-done-top-label');
    if (topLink) topLink.href = topUrl;
    if (loginLink) loginLink.href = loginUrl;
    if (doneTopLink) doneTopLink.href = topUrl;
    if (doneTopLabel) doneTopLabel.textContent = `${profile.name}トップへ`;
  }

  async function fetchJson(name) {
    const response = await fetch(
      `/static/${encodeURIComponent(paper)}/${name}?v=${Date.now()}`,
      { cache: 'no-store', credentials: 'same-origin' }
    );
    if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
    return response.json();
  }

  function latestMemberPosts(rawPosts) {
    const posts = Array.isArray(rawPosts) ? rawPosts : [];
    return posts
      .filter(post => post && text(post.member_scope).trim() === 'member')
      .sort((a, b) => {
        const aTime = Date.parse(text(a.date || a.published_at || a.modified)) || 0;
        const bTime = Date.parse(text(b.date || b.published_at || b.modified)) || 0;
        return bTime - aTime;
      })
      .slice(0, 5);
  }

  function appendArchiveCard(list) {
    const item = document.createElement('li');
    item.className = 'rg-art';
    item.innerHTML = '<div class="rg-art__img" style="display:grid;place-items:center;background:linear-gradient(135deg,#fff5f2,#ffe4dc)"><div style="text-align:center;color:#c2412d;font-weight:800;line-height:1.4"><span style="font-size:30px;display:block">100+</span><span style="font-size:13px">本の記事が<br>読み放題</span></div></div><div class="rg-art__body"><span class="rg-art__cat">アーカイブ検索</span><p class="rg-art__title">産地・品種・期間で過去記事を探せます</p></div>';
    list.appendChild(item);
  }

  function renderArticles(posts) {
    const list = document.getElementById('rg-articles');
    if (!list) return;
    list.textContent = '';

    posts.forEach(post => {
      const item = document.createElement('li');
      item.className = 'rg-art';

      const media = document.createElement('div');
      media.className = 'rg-art__img';
      const src = imageUrl(post.featured_image);
      if (src) {
        const img = document.createElement('img');
        img.src = src;
        img.alt = '';
        img.loading = 'lazy';
        media.appendChild(img);
      }
      const lock = document.createElement('span');
      lock.className = 'rg-lock';
      lock.innerHTML = LOCK + '会員限定';
      media.appendChild(lock);

      const body = document.createElement('div');
      body.className = 'rg-art__body';
      const category = document.createElement('span');
      category.className = 'rg-art__cat';
      category.textContent = text(post.article_type || post.category || '会員限定記事');
      const title = document.createElement('p');
      title.className = 'rg-art__title';
      title.textContent = text(post.title);
      body.append(category, title);
      item.append(media, body);
      list.appendChild(item);
    });

    appendArchiveCard(list);
  }

  function renderSummit(config) {
    const summit = document.getElementById('rg-summit');
    if (!summit) return;
    summit.hidden = true;
    if (!config || !isEnabled(config.enabled)) return;

    const img = summit.querySelector('.rg-summit__img img');
    const thumbnailUrl = text(config.thumbnail_url).trim();
    const youtubeId = text(config.youtube_id).trim();
    if (img) {
      if (thumbnailUrl) {
        img.src = thumbnailUrl;
      } else if (youtubeId) {
        img.src = `https://i.ytimg.com/vi/${encodeURIComponent(youtubeId)}/hqdefault.jpg`;
      }
      img.alt = text(config.title || 'ライブ配信');
    }
    const badge = summit.querySelector('.rg-live');
    const title = summit.querySelector('h3');
    const description = summit.querySelector('p');
    if (badge) badge.textContent = text(config.status_label || 'ライブ配信');
    if (title) title.textContent = text(config.title || 'ライブ配信');
    if (description) {
      description.textContent = text(config.description || [config.date_text, config.time_text].filter(Boolean).join(' '));
    }
    summit.hidden = false;
  }

  function marketLabel(item) {
    const supplied = text(item && (item.label || item.name || item.variety_name)).trim();
    if (supplied) return supplied;
    const labels = {
      big: '大玉トマト',
      mid: '中玉トマト',
      mini: 'ミニトマト',
      first: 'ファーストトマト',
      ichigo: 'イチゴ',
      benihoppe: '紅ほっぺ',
      amaou: 'あまおう',
      tochiotome: 'とちおとめ'
    };
    return labels[text(item && item.variety_key).toLowerCase()] || '市況';
  }

  function renderMarket(market) {
    const grid = document.getElementById('rg-market-grid');
    if (!grid) return;
    grid.textContent = '';
    const items = market && Array.isArray(market.items) ? market.items : [];

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'rg-mcard';
      card.dataset.v = text(item.variety_key || 'market');

      const heading = document.createElement('h4');
      heading.textContent = marketLabel(item);
      const price = document.createElement('div');
      price.className = 'rg-mcard__num';
      const priceValue = typeof item.price === 'number'
        ? item.price.toLocaleString('ja-JP')
        : '—';
      price.append(document.createTextNode(priceValue));
      const unit = document.createElement('small');
      unit.textContent = '円';
      price.appendChild(unit);

      const change = document.createElement('span');
      change.className = 'rg-mcard__chg';
      const trend = text(item.trend).toLowerCase();
      const icon = trend === 'up' ? '↗' : trend === 'down' ? '↘' : trend === 'same' ? '→' : '—';
      const diff = typeof item.diff === 'number'
        ? Math.abs(item.diff).toLocaleString('ja-JP') + '円'
        : '—';
      change.textContent = `${icon} ${diff}`;
      card.append(heading, price, change);
      grid.appendChild(card);
    });

    const marketBox = grid.closest('.rg-market');
    if (marketBox) marketBox.hidden = items.length === 0;
  }

  function renderDoneRecommendations(posts) {
    const root = document.getElementById('rg-done-next');
    if (!root) return;
    root.textContent = '';

    posts.slice(0, 3).forEach(post => {
      const link = document.createElement('a');
      link.href = postUrl(post);
      const src = imageUrl(post.featured_image);
      if (src) {
        const img = document.createElement('img');
        img.src = src;
        img.alt = '';
        img.loading = 'lazy';
        link.appendChild(img);
      }
      const label = document.createElement('span');
      label.textContent = text(post.title);
      link.appendChild(label);
      root.appendChild(link);
    });

    root.hidden = root.children.length === 0;
  }

  function renderHero(posts) {
    const hero = document.getElementById('rg-heroV');
    const now = document.getElementById('rg-heroV-now');
    const dotsBox = document.getElementById('rg-heroV-dots');
    if (!hero || !now || !dotsBox) return;

    hero.querySelectorAll('.rg-heroV__slide').forEach(el => el.remove());
    dotsBox.textContent = '';
    const scrim = hero.querySelector('.rg-heroV__scrim');
    const usable = posts.filter(post => imageUrl(post.featured_image));
    if (!usable.length) {
      hero.hidden = true;
      now.hidden = true;
      dotsBox.hidden = true;
      return;
    }

    const slides = usable.map((post, index) => {
      const slide = document.createElement('div');
      slide.className = 'rg-heroV__slide' + (index === 0 ? ' is-on' : '');
      const img = document.createElement('img');
      img.src = imageUrl(post.featured_image);
      img.alt = '';
      img.loading = index === 0 ? 'eager' : 'lazy';
      img.decoding = 'async';
      slide.appendChild(img);
      hero.insertBefore(slide, scrim);
      const dot = document.createElement('i');
      if (index === 0) dot.classList.add('is-on');
      dotsBox.appendChild(dot);
      return slide;
    });
    const dots = [...dotsBox.children];
    const mqSp = window.matchMedia('(max-width:640px)');
    const mqRm = window.matchMedia('(prefers-reduced-motion: reduce)');
    let index = 0;
    let timer = null;

    function show(next) {
      slides[index].classList.remove('is-on');
      dots[index].classList.remove('is-on');
      index = (next + slides.length) % slides.length;
      slides[index].classList.add('is-on');
      dots[index].classList.add('is-on');
      now.innerHTML = LOCK + '<span></span>';
      now.querySelector('span').textContent = `会員限定：${text(usable[index].title)}`;
    }
    function stop() {
      if (timer) clearInterval(timer);
      timer = null;
    }
    function start() {
      if (timer || mqRm.matches || !mqSp.matches || document.hidden || slides.length < 2) return;
      timer = setInterval(() => show(index + 1), 4500);
    }

    show(0);
    start();
    document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
    const onMq = () => mqSp.matches ? start() : stop();
    mqSp.addEventListener ? mqSp.addEventListener('change', onMq) : mqSp.addListener(onMq);
  }

  async function loadPaperContent() {
    const articleList = document.getElementById('rg-articles');
    if (articleList) articleList.textContent = '';
    const summit = document.getElementById('rg-summit');
    if (summit) summit.hidden = true;

    renderPaperBranding();

    const results = await Promise.allSettled([
      fetchJson('posts.json'),
      fetchJson('livestream.json'),
      fetchJson('market.json')
    ]);
    const posts = results[0].status === 'fulfilled'
      ? latestMemberPosts(results[0].value)
      : [];
    renderArticles(posts);
    renderHero(posts);
    renderSummit(results[1].status === 'fulfilled' ? results[1].value : null);
    renderMarket(results[2].status === 'fulfilled' ? results[2].value : null);
    renderDoneRecommendations(posts);

    results.forEach(result => {
      if (result.status === 'rejected') console.warn('[register redesign]', result.reason);
    });
  }

  loadPaperContent().catch(error => {
    console.error('[register redesign] dynamic content failed:', error);
    const list = document.getElementById('rg-articles');
    if (list && !list.children.length) appendArchiveCard(list);
  });
})();
