/*!
 * TomatoAuth (LocalStorage demo)
 * - LocalStorage session for current frontend UI
 * - Registration is submitted to WordPress REST API when available
 */
(function(global){
  const AUTH_TOKEN_KEY = 'tomato_member_auth_token_v1';
  const CURRENT_USER_KEY = 'tomato_member_current_user_v1';

  function nowIso(){ return new Date().toISOString(); }

  function dispatchAuthChanged(){
    try{
      window.dispatchEvent(new CustomEvent('authChanged'));
    }catch(_e){}
  }

  function readJsonStorage(key){
    try{
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }catch(_e){
      return null;
    }
  }

  function getCachedCurrentUser(){
    const user = readJsonStorage(CURRENT_USER_KEY);
    return user && typeof user === 'object' ? user : null;
  }

  function getAuthToken(){
    try{
      return String(localStorage.getItem(AUTH_TOKEN_KEY) || '').trim();
    }catch(_e){}
    return '';
  }

  function setAuthSession(token, user){
    if (token) {
      try{ localStorage.setItem(AUTH_TOKEN_KEY, String(token)); }catch(_e){}
    }
    if (user && typeof user === 'object') {
      try{ localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user)); }catch(_e){}
      try {
        if (user.paper) localStorage.setItem('tomato_active_paper_v1', String(user.paper));
      } catch (_e) {}
    }
    dispatchAuthChanged();
  }

  function clearAuthSession(){
    try{ localStorage.removeItem(AUTH_TOKEN_KEY); }catch(_e){}
    try{ localStorage.removeItem(CURRENT_USER_KEY); }catch(_e){}
    dispatchAuthChanged();
  }

  function normalizeEmail(email){
    return String(email || '').trim().toLowerCase();
  }

  async function sha256Hex(text){
    const enc = new TextEncoder().encode(String(text));
    const buf = await crypto.subtle.digest('SHA-256', enc);
    const bytes = Array.from(new Uint8Array(buf));
    return bytes.map(b => b.toString(16).padStart(2,'0')).join('');
  }

  function logout(){
    clearAuthSession();
  }

  function passwordPatternOk(pw){
    // uppercase + lowercase + digit, 8-20
    const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,20}$/;
    return re.test(String(pw || ''));
  }
  function normalizeApiRoot(root){
    const value = String(root || '').trim();
    if (!value) return '';
    return value.replace(/\/$/, '');
  }

  function normalizeCmsUrl(url){
    const value = String(url || '').trim();
    if (!value) return '';
    return value.replace(/\/$/, '');
  }

  function normalizeBase64Url(value){
    return String(value || '').trim().replace(/-/g, '+').replace(/_/g, '/');
  }

  function decodeCmsHint(value){
    const raw = String(value || '').trim();
    if (!raw) return '';

    try{
      const decoded = decodeURIComponent(raw);
      if (/^https?:\/\//i.test(decoded)) {
        return normalizeCmsUrl(decoded);
      }
    }catch(_e){}

    try{
      const normalized = normalizeBase64Url(raw);
      const padding = normalized.length % 4;
      const padded = padding ? normalized + '='.repeat(4 - padding) : normalized;
      const decoded = atob(padded);
      if (/^https?:\/\//i.test(decoded)) {
        return normalizeCmsUrl(decoded);
      }
    }catch(_e){}

    return '';
  }

  function getQueryCmsHint(searchParams){
    try{
      const sp = searchParams instanceof URLSearchParams ? searchParams : new URLSearchParams(window.location.search || '');
      return decodeCmsHint(sp.get('cms_hint') || '');
    }catch(_e){}
    return '';
  }

  function isStaticFrontendHost(hostname){
    const host = String(hostname || '').trim().toLowerCase();
    if (!host) return false;
    return /(?:^|\.)agrinews\.jp$/i.test(host) && /^(?:stg-)?[a-z0-9-]+\.agrinews\.jp$/i.test(host);
  }

  function isStaticFrontendRequestContext(){
    try{
      const pathname = String(window.location.pathname || '');
      if (/^\/static\//.test(pathname) || /\/static\//.test(pathname)) return true;
    }catch(_e){}
    try{
      return isStaticFrontendHost(window.location.hostname);
    }catch(_e){}
    return false;
  }

  function isCloudFrontMethodBlocked(result, status){
    const text = String(result && result.text || '');
    return Number(status) === 403 && /The request could not be satisfied/i.test(text) && /distribution is not configured to allow the HTTP request method/i.test(text);
  }

  function isLikelyMixedContentError(err){
    const message = String(err && err.message || '');
    return /Failed to fetch|Load failed|NetworkError/i.test(message);
  }

  function isHttpsPage(){
    try{
      return String(window.location.protocol || '').toLowerCase() === 'https:';
    }catch(_e){}
    return false;
  }

  function isInsecureHttpUrl(url){
    return /^http:\/\//i.test(String(url || '').trim());
  }

  function persistApiHints(){
    try{
      const sp = new URLSearchParams(window.location.search || '');
      const apiRoot = normalizeApiRoot(sp.get('api_root') || sp.get('wp_api_root') || '');
      const cmsUrl = normalizeCmsUrl(getQueryCmsHint(sp) || sp.get('cms_url') || sp.get('cms_origin') || '');
      if (apiRoot) localStorage.setItem('tomato_auth_api_root_v1', apiRoot);
      if (cmsUrl) localStorage.setItem('tomato_auth_cms_url_v1', cmsUrl);
    }catch(_e){}

    try{
      const apiRoot = normalizeApiRoot(global && global.TOMATO_AUTH_API_ROOT);
      const cmsUrl = normalizeCmsUrl(global && global.TOMATO_AUTH_CMS_URL);
      if (apiRoot) localStorage.setItem('tomato_auth_api_root_v1', apiRoot);
      if (cmsUrl) localStorage.setItem('tomato_auth_cms_url_v1', cmsUrl);
    }catch(_e){}

    try{
      if (global && global.wpApiSettings && global.wpApiSettings.root) {
        const root = normalizeApiRoot(global.wpApiSettings.root);
        if (root) localStorage.setItem('tomato_auth_api_root_v1', root);
      }
    }catch(_e){}
  }

  function getLikelyCmsOrigins(){
    const seen = new Set();
    const origins = [];

    function add(origin){
      const value = normalizeCmsUrl(origin);
      if (!value || seen.has(value)) return;
      seen.add(value);
      origins.push(value);
    }

    try{
      const sp = new URLSearchParams(window.location.search || '');
      add(getQueryCmsHint(sp) || sp.get('cms_url') || sp.get('cms_origin') || '');
    }catch(_e){}

    try{
      add(global && global.TOMATO_AUTH_CMS_URL);
    }catch(_e){}

    try{
      add(localStorage.getItem('tomato_auth_cms_url_v1') || '');
    }catch(_e){}

    try{
      const host = String(window.location.hostname || '').toLowerCase();
      const protocol = String(window.location.protocol || '').toLowerCase();
      const isHttpsPage = protocol === 'https:';

      if (/^stg-[a-z0-9-]+\.agrinews\.jp$/i.test(host)) {
        if (!isHttpsPage) {
          add('http://54.92.118.106:8080');
          add('http://13.231.151.241:8080');
        }
      }
      if (/^(localhost|127\.0\.0\.1)$/i.test(host)) {
        add('http://localhost:8080');
        add('http://127.0.0.1:8080');
      }
    }catch(_e){}

    return origins;
  }

  function getRegisterApiCandidates(){
    const seen = new Set();
    const urls = [];

    function addUrl(url){
      const value = String(url || '').trim();
      if (!value || seen.has(value)) return;
      seen.add(value);
      urls.push(value);
    }

    function addRoot(root){
      const normalized = normalizeApiRoot(root);
      if (!normalized) return;
      addUrl(normalized + '/tomato-members/v1/register');
    }

    function addCmsUrl(cmsUrl){
      const normalized = normalizeCmsUrl(cmsUrl);
      if (!normalized) return;
      addRoot(normalized + '/wp-json');
    }

    persistApiHints();

    try{
      const sameOrigin = String(window.location.origin || '').replace(/\/$/, '');
      if (sameOrigin) {
        addRoot(sameOrigin + '/wp-json');
      }
      addUrl('/wp-json/tomato-members/v1/register');
    }catch(_e){}

    try{
      if (global.wpApiSettings && wpApiSettings.root) {
        addRoot(wpApiSettings.root);
      }
    }catch(_e){}

    try{
      if (global.TOMATO_AUTH_API_ROOT) {
        addRoot(global.TOMATO_AUTH_API_ROOT);
      }
      if (global.TOMATO_AUTH_CMS_URL) {
        addCmsUrl(global.TOMATO_AUTH_CMS_URL);
      }
    }catch(_e){}

    try{
      const savedApiRoot = localStorage.getItem('tomato_auth_api_root_v1');
      if (savedApiRoot) addRoot(savedApiRoot);
      const savedCmsUrl = localStorage.getItem('tomato_auth_cms_url_v1');
      if (savedCmsUrl) addCmsUrl(savedCmsUrl);
    }catch(_e){}

    try{
      const sp = new URLSearchParams(window.location.search || '');
      const apiRoot = sp.get('api_root') || sp.get('wp_api_root') || '';
      const cmsUrl = getQueryCmsHint(sp) || sp.get('cms_url') || sp.get('cms_origin') || '';
      if (apiRoot) addRoot(apiRoot);
      if (cmsUrl) addCmsUrl(cmsUrl);
    }catch(_e){}

    getLikelyCmsOrigins().forEach(addCmsUrl);

    return urls.filter(function(url){
      if (!isHttpsPage()) return true;
      return !isInsecureHttpUrl(url);
    });
  }

  function getMemberApiCandidates(endpointPath){
    const seen = new Set();
    const urls = [];
    const suffix = String(endpointPath || '').trim().replace(/^\/+/, '');
    if (!suffix) return urls;

    function addUrl(url){
      const value = String(url || '').trim();
      if (!value || seen.has(value)) return;
      seen.add(value);
      urls.push(value);
    }

    function addRoot(root){
      const normalized = normalizeApiRoot(root);
      if (!normalized) return;
      addUrl(normalized + '/' + suffix);
    }

    function addCmsUrl(cmsUrl){
      const normalized = normalizeCmsUrl(cmsUrl);
      if (!normalized) return;
      addRoot(normalized + '/wp-json');
    }

    persistApiHints();

    try{
      const sameOrigin = String(window.location.origin || '').replace(/\/$/, '');
      if (sameOrigin) addRoot(sameOrigin + '/wp-json');
      addUrl('/wp-json/' + suffix);
    }catch(_e){}

    try{
      if (global.wpApiSettings && wpApiSettings.root) addRoot(wpApiSettings.root);
    }catch(_e){}

    try{
      if (global.TOMATO_AUTH_API_ROOT) addRoot(global.TOMATO_AUTH_API_ROOT);
      if (global.TOMATO_AUTH_CMS_URL) addCmsUrl(global.TOMATO_AUTH_CMS_URL);
    }catch(_e){}

    try{
      const savedApiRoot = localStorage.getItem('tomato_auth_api_root_v1');
      if (savedApiRoot) addRoot(savedApiRoot);
      const savedCmsUrl = localStorage.getItem('tomato_auth_cms_url_v1');
      if (savedCmsUrl) addCmsUrl(savedCmsUrl);
    }catch(_e){}

    try{
      const sp = new URLSearchParams(window.location.search || '');
      const apiRoot = sp.get('api_root') || sp.get('wp_api_root') || '';
      const cmsUrl = getQueryCmsHint(sp) || sp.get('cms_url') || sp.get('cms_origin') || '';
      if (apiRoot) addRoot(apiRoot);
      if (cmsUrl) addCmsUrl(cmsUrl);
    }catch(_e){}

    getLikelyCmsOrigins().forEach(addCmsUrl);

    return urls.filter(function(url){
      if (!isHttpsPage()) return true;
      return !isInsecureHttpUrl(url);
    });
  }

  function getFallbackCmsOrigins(){
    const seen = new Set();
    const origins = [];

    function add(origin){
      const value = normalizeCmsUrl(origin);
      if (!value || seen.has(value)) return;
      seen.add(value);
      origins.push(value);
    }

    try{
      const sp = new URLSearchParams(window.location.search || '');
      add(getQueryCmsHint(sp) || sp.get('cms_url') || sp.get('cms_origin') || '');
    }catch(_e){}

    try{
      if (global && global.TOMATO_AUTH_CMS_URL) add(global.TOMATO_AUTH_CMS_URL);
    }catch(_e){}

    try{
      add(localStorage.getItem('tomato_auth_cms_url_v1') || '');
    }catch(_e){}

    try{
      const host = String(window.location.hostname || '').toLowerCase();
      const protocol = String(window.location.protocol || '').toLowerCase();
      const isHttpsPage = protocol === 'https:';

      if (/^stg-[a-z0-9-]+\.agrinews\.jp$/i.test(host)) {
        if (!isHttpsPage) {
          add('http://54.92.118.106:8080');
          add('http://13.231.151.241:8080');
        }
      }
      if (/^(localhost|127\.0\.0\.1)$/i.test(host)) {
        add('http://localhost:8080');
        add('http://127.0.0.1:8080');
      }
    }catch(_e){}

    return origins;
  }

  function buildFormPostCandidates(){
    const seen = new Set();
    const urls = [];

    function add(url){
      const value = String(url || '').trim();
      if (!value || seen.has(value)) return;
      seen.add(value);
      urls.push(value);
    }

    getFallbackCmsOrigins().forEach(function(origin){
      const root = normalizeCmsUrl(origin);
      if (!root) return;
      add(root + '/wp-json/tomato-members/v1/register');
    });

    return urls.filter(function(url){
      if (!isHttpsPage()) return true;
      return !isInsecureHttpUrl(url);
    });
  }

  function buildFormPostCandidatesForEndpoint(endpointPath){
    const seen = new Set();
    const urls = [];
    const suffix = String(endpointPath || '').trim().replace(/^\/+/, '');
    if (!suffix) return urls;

    function add(url){
      const value = String(url || '').trim();
      if (!value || seen.has(value)) return;
      seen.add(value);
      urls.push(value);
    }

    getFallbackCmsOrigins().forEach(function(origin){
      const root = normalizeCmsUrl(origin);
      if (!root) return;
      add(root + '/wp-json/' + suffix);
    });

    return urls.filter(function(url){
      if (!isHttpsPage()) return true;
      return !isInsecureHttpUrl(url);
    });
  }

  function submitViaHiddenForm(url, payload, timeoutMs){
    return new Promise(function(resolve, reject){
      const actionUrl = String(url || '').trim();
      if (!actionUrl) {
        reject(new Error('会員登録に失敗しました。CMS URL が未設定です。'));
        return;
      }

      const frameName = 'tomato_register_iframe_' + Math.random().toString(36).slice(2);
      const iframe = document.createElement('iframe');
      const form = document.createElement('form');
      const ms = Number(timeoutMs) > 0 ? Number(timeoutMs) : 15000;
      let done = false;
      let timer = null;

      function cleanup(){
        try{ if (timer) clearTimeout(timer); }catch(_e){}
        try{ form.remove(); }catch(_e){}
        try{ iframe.remove(); }catch(_e){}
      }

      function finish(err){
        if (done) return;
        done = true;
        cleanup();
        if (err) reject(err);
        else resolve({ success: true, viaFormPost: true, url: actionUrl });
      }

      iframe.name = frameName;
      iframe.style.display = 'none';
      form.method = 'POST';
      form.action = actionUrl;
      form.target = frameName;
      form.style.display = 'none';
      form.acceptCharset = 'UTF-8';
      form.enctype = 'application/x-www-form-urlencoded';

      Object.keys(payload || {}).forEach(function(key){
        const value = payload[key];
        if (Array.isArray(value)) {
          value.forEach(function(item){
            const input = document.createElement('input');
            input.type = 'hidden';
            input.name = key;
            input.value = item == null ? '' : String(item);
            form.appendChild(input);
          });
          return;
        }
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = key;
        input.value = value == null ? '' : String(value);
        form.appendChild(input);
      });

      iframe.addEventListener('load', function(){
        setTimeout(function(){ finish(); }, 250);
      }, { once: true });

      timer = setTimeout(function(){
        finish(new Error('会員登録の送信は開始されましたが、CMS からの応答を確認できませんでした。CMS URL / mixed content 設定を確認してください。'));
      }, ms);

      document.body.appendChild(iframe);
      document.body.appendChild(form);

      try{
        form.submit();
      }catch(err){
        finish(err instanceof Error ? err : new Error(String(err || 'フォーム送信に失敗しました。')));
      }
    });
  }

  async function submitRegistrationViaFormFallback(payload){
    const candidates = buildFormPostCandidates();
    let lastErr = null;

    if (!candidates.length) {
      throw new Error('会員登録に失敗しました。HTTPS ページから送信可能な CMS URL が見つかりません。');
    }

    for (let i = 0; i < candidates.length; i++) {
      try{
        await submitViaHiddenForm(candidates[i], payload, 15000);
        return {
          success: true,
          user: {
            email: payload.email,
            nickname: payload.nickname,
            gender: payload.gender,
            prefecture: payload.prefecture,
            city: payload.city,
            occupation: payload.occupation,
            farm_scale: payload.farm_scale,
            crop_1: payload.crop_1,
            crop_2: payload.crop_2,
            future_crop: payload.future_crop,
            interests: payload.interests,
            newsletter_preference: payload.newsletter_preference,
            paper: payload.paper,
            created_at: nowIso(),
            updated_at: nowIso()
          }
        };
      }catch(err){
        lastErr = err;
      }
    }

    throw lastErr || new Error('会員登録に失敗しました。CMS 側へフォーム送信できませんでした。');
  }


  async function submitMemberEndpoint(endpointPath, payload, options){
    const opts = options || {};
    const allowFormFallback = !!opts.allowFormFallback;
    const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : 4500;
    const candidates = getMemberApiCandidates(endpointPath);
    let apiData = null;
    let lastErrorMessage = '';
    let sawCloudFront403 = false;
    let sawNetworkFetchError = false;

    if (!candidates.length) {
      throw new Error(opts.noCandidateMessage || 'API URL が見つかりません。');
    }

    for (let i = 0; i < candidates.length; i++) {
      const apiUrl = candidates[i];
      try{
        const headers = Object.assign({
          'Accept': 'application/json'
        }, opts.headers || {});
        const method = String(opts.method || 'POST').toUpperCase();
        const requestOptions = {
          method: method,
          headers: headers,
          credentials: 'include'
        };
        if (method !== 'GET') {
          if (!headers['Content-Type']) {
            headers['Content-Type'] = 'application/json';
          }
          requestOptions.body = JSON.stringify(payload || {});
        }

        const response = await fetchWithTimeout(apiUrl, requestOptions, timeoutMs);

        const parsed = await parseResponseBody(response);
        apiData = parsed.json;

        if (response.ok && apiData && apiData.success === true) {
          return apiData;
        }

        const message = buildRegistrationErrorMessage(parsed) || ((opts.actionLabel || '処理') + 'に失敗しました。（HTTP ' + response.status + '）');
        lastErrorMessage = message;

        if (isCloudFrontMethodBlocked(parsed, response.status)) {
          sawCloudFront403 = true;
          continue;
        }

        if (response.status === 404 || response.status === 405) {
          continue;
        }

        throw new Error(message);
      }catch(err){
        if (isLikelyMixedContentError(err)) {
          sawNetworkFetchError = true;
        }
        lastErrorMessage = buildRegistrationErrorMessage({ error: err }) || ((err && err.message) ? String(err.message) : lastErrorMessage);
        if (i === candidates.length - 1) break;
      }
    }

    if (allowFormFallback && isStaticFrontendRequestContext() && sawCloudFront403) {
      const formCandidates = buildFormPostCandidatesForEndpoint(endpointPath);
      let lastErr = null;
      for (let i = 0; i < formCandidates.length; i++) {
        try{
          await submitViaHiddenForm(formCandidates[i], payload || {}, 15000);
          return { success: true, viaFormPost: true };
        }catch(err){
          lastErr = err;
        }
      }
      if (lastErr) {
        throw new Error(buildRegistrationErrorMessage({ error: lastErr }) || lastErrorMessage || ((opts.actionLabel || '処理') + 'に失敗しました。'));
      }
    }

    if (sawNetworkFetchError && isHttpsPage()) {
      throw new Error(lastErrorMessage || ((opts.actionLabel || '処理') + 'に失敗しました。現在のページは HTTPS ですが、接続先 CMS が HTTP のためブラウザで遮断されています。'));
    }

    throw new Error(lastErrorMessage || ((opts.actionLabel || '処理') + 'に失敗しました。'));
  }


  async function fetchWithTimeout(url, options, timeoutMs){
    const ms = Number(timeoutMs) > 0 ? Number(timeoutMs) : 4500;

    if (typeof AbortController === 'undefined') {
      return fetch(url, options);
    }

    const controller = new AbortController();
    const timer = setTimeout(function(){
      try { controller.abort(); } catch(_e) {}
    }, ms);

    try{
      const merged = Object.assign({}, options || {}, { signal: controller.signal });
      return await fetch(url, merged);
    }catch(err){
      if (err && (err.name === 'AbortError' || /aborted|timeout/i.test(String(err.message || '')))) {
        throw new Error('会員登録APIへの接続がタイムアウトしました。');
      }
      throw err;
    }finally{
      clearTimeout(timer);
    }
  }

  async function parseResponseBody(response){
    const contentType = String(response && response.headers && response.headers.get('content-type') || '').toLowerCase();
    const rawText = await response.text().catch(function(){ return ''; });
    let json = null;

    if (rawText) {
      try{
        json = JSON.parse(rawText);
      }catch(_e){
        json = null;
      }
    }

    return {
      json,
      text: rawText,
      contentType
    };
  }

  function buildRegistrationErrorMessage(result){
    if (result && result.json && result.json.message) {
      return String(result.json.message);
    }

    if (result && result.text) {
      const compact = String(result.text).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      if (compact) return compact.slice(0, 220);
    }

    if (result && result.error && result.error.message) {
      const message = String(result.error.message || '');
      if (/Failed to fetch|Load failed|NetworkError/i.test(message)) {
        if (isHttpsPage()) {
          return '会員登録APIに接続できませんでした。現在の公開ページは HTTPS ですが、登録API候補に HTTP の CMS URL が含まれているか、公開側 /wp-json への POST が CloudFront で遮断されています。HTTPS で到達できる WordPress REST API URL を設定してください。';
        }
        return '会員登録APIに接続できませんでした。公開サイト配下の /wp-json ではなく、WordPress 側の REST API を参照できているか確認してください。';
      }
      return message;
    }

    return '会員登録に失敗しました。';
  }


  function detectActivePaper(){
    try{
      if (typeof window.__detectPaper === 'function') {
        const byHelper = String(window.__detectPaper() || '').toLowerCase();
        if (byHelper) {
          localStorage.setItem('tomato_active_paper_v1', byHelper);
          return byHelper;
        }
      }
    }catch(_e){}

    try{
      const host = String(window.location.hostname || '').toLowerCase().replace(/:\d+$/, '');
      const m = host.match(/^(?:stg-)?([a-z0-9-]+)\.agrinews\.jp$/i);
      if (m && m[1] && m[1] !== 'www') {
        localStorage.setItem('tomato_active_paper_v1', m[1]);
        return m[1];
      }
    }catch(_e){}

    try{
      const sp = new URLSearchParams(window.location.search || '');
      const paper = String(sp.get('paper') || sp.get('p') || '').toLowerCase();
      if (paper) {
        localStorage.setItem('tomato_active_paper_v1', paper);
        return paper;
      }
    }catch(_e){}

    try{
      const bodyPaper = String(document.body && document.body.getAttribute('data-paper') || '').toLowerCase();
      if (bodyPaper) {
        localStorage.setItem('tomato_active_paper_v1', bodyPaper);
        return bodyPaper;
      }
    }catch(_e){}

    try{
      const m = String(window.location.pathname || '').match(/\/static\/([^\/]+)\//);
      if (m && m[1] && m[1] !== 'account') {
        const byPath = String(m[1]).toLowerCase();
        localStorage.setItem('tomato_active_paper_v1', byPath);
        return byPath;
      }
    }catch(_e){}

    try{
      const saved = String(localStorage.getItem('tomato_active_paper_v1') || '').toLowerCase();
      if (saved) return saved;
    }catch(_e){}

    return 'tomato';
  }

  async function registerFromFormData(formData){
    const email = normalizeEmail(formData.get('email'));
    const password = String(formData.get('password') || '');
    const passwordConfirm = String(formData.get('password_confirm') || '');

    if (!email) throw new Error('メールアドレスを入力してください。');
    if (!password) throw new Error('パスワードを入力してください。');
    if (password !== passwordConfirm) throw new Error('パスワードが一致しません。');
    if (!passwordPatternOk(password)) {
      throw new Error('パスワードはアルファベット大文字・小文字、数字を含む8文字以上20字以内で入力してください。');
    }

    const interests = formData.getAll('interest')?.length ? formData.getAll('interest')
                    : formData.getAll('interests'); // support both names
    const newsletterPreference = String(formData.get('newsletter_preference') || '希望する');
    const paper = detectActivePaper();

    const payload = {
      email,
      password,
      password_confirm: passwordConfirm,
      nickname: String(formData.get('nickname') || ''),
      gender: String(formData.get('gender') || ''),
      prefecture: String(formData.get('prefecture') || ''),
      city: String(formData.get('city') || ''),
      occupation: String(formData.get('occupation') || ''),
      farm_scale: String(formData.get('farm_scale') || ''),
      crop_1: String(formData.get('crop_1') || ''),
      crop_2: String(formData.get('crop_2') || ''),
      future_crop: String(formData.get('future_crop') || ''),
      interests: Array.isArray(interests) ? interests.filter(Boolean) : [],
      newsletter_preference: newsletterPreference,
      paper
    };

    let apiData = null;
    let apiError = '';
    let lastErrorMessage = '';
    let sawCloudFront403 = false;
    let sawNetworkFetchError = false;
    const apiCandidates = getRegisterApiCandidates();

    if (!apiCandidates.length) {
      throw new Error('会員登録に失敗しました。HTTPS で到達可能な WordPress REST API URL が見つかりません。');
    }

    for (let i = 0; i < apiCandidates.length; i++) {
      const apiUrl = apiCandidates[i];
      try{
        const response = await fetchWithTimeout(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify(payload)
        }, 4500);

        const parsed = await parseResponseBody(response);
        apiData = parsed.json;

        if (response.ok && apiData && apiData.success === true) {
          break;
        }

        const message = buildRegistrationErrorMessage(parsed) || ('会員登録に失敗しました。（HTTP ' + response.status + '）');
        lastErrorMessage = message;

        if (isCloudFrontMethodBlocked(parsed, response.status)) {
          sawCloudFront403 = true;
          continue;
        }

        if (response.status === 404 || response.status === 405) {
          continue;
        }

        throw new Error(message);
      }catch(err){
        if (isLikelyMixedContentError(err)) {
          sawNetworkFetchError = true;
        }
        lastErrorMessage = buildRegistrationErrorMessage({ error: err }) || ((err && err.message) ? String(err.message) : lastErrorMessage);
        if (i === apiCandidates.length - 1) {
          break;
        }
      }
    }

    if (!apiData || apiData.success !== true) {
      if (isStaticFrontendRequestContext() && sawCloudFront403) {
        try{
          apiData = await submitRegistrationViaFormFallback(payload);
        }catch(formErr){
          throw new Error(buildRegistrationErrorMessage({ error: formErr }) || (formErr && formErr.message) || lastErrorMessage || apiError || '会員登録に失敗しました。');
        }
      } else if (sawNetworkFetchError && isHttpsPage()) {
        throw new Error(lastErrorMessage || '会員登録に失敗しました。現在のページは HTTPS ですが、登録先 CMS が HTTP のためブラウザで遮断されています。HTTPS で公開された WordPress REST API または HTTPS プロキシが必要です。');
      } else {
        throw new Error(lastErrorMessage || apiError || '会員登録に失敗しました。');
      }
    }

    const returnedUser = apiData && apiData.user ? apiData.user : {};
    const user = {
      id: returnedUser.id || '',
      email: String(returnedUser.email || email),
      nickname: String(returnedUser.nickname || payload.nickname || ''),
      gender: String(returnedUser.gender || payload.gender || ''),
      prefecture: String(returnedUser.prefecture || payload.prefecture || ''),
      city: String(returnedUser.city || payload.city || ''),
      occupation: String(returnedUser.occupation || payload.occupation || ''),
      farm_scale: String(returnedUser.farm_scale || payload.farm_scale || ''),
      crop_1: String(returnedUser.crop_1 || payload.crop_1 || ''),
      crop_2: String(returnedUser.crop_2 || payload.crop_2 || ''),
      future_crop: String(returnedUser.future_crop || payload.future_crop || ''),
      interests: Array.isArray(returnedUser.interests) ? returnedUser.interests.filter(Boolean) : payload.interests,
      newsletter_preference: String(returnedUser.newsletter_preference || payload.newsletter_preference || '希望する'),
      paper: String(returnedUser.paper || paper || 'tomato'),
      created_at: String(returnedUser.created_at || nowIso()),
      updated_at: String(returnedUser.updated_at || nowIso())
    };

    setAuthSession(apiData && apiData.token ? apiData.token : '', user);
    return user;
  }

  async function requestPasswordReset(email, paper){
    const payload = {
      email: normalizeEmail(email),
      paper: String(paper || detectActivePaper() || 'tomato')
    };

    if (!payload.email) {
      throw new Error('メールアドレスを入力してください。');
    }

    return submitMemberEndpoint('tomato-members/v1/password-reset/request', payload, {
      actionLabel: 'パスワード再設定メール送信',
      allowFormFallback: true,
      timeoutMs: 4500,
      noCandidateMessage: 'パスワード再設定APIの送信先が見つかりません。'
    });
  }

  async function confirmPasswordReset(params){
    const payload = {
      login: String(params && params.login || ''),
      key: String(params && params.key || ''),
      password: String(params && params.password || ''),
      password_confirm: String(params && params.password_confirm || ''),
      paper: String(params && params.paper || detectActivePaper() || 'tomato')
    };

    const result = await submitMemberEndpoint('tomato-members/v1/password-reset/confirm', payload, {
      actionLabel: 'パスワード再設定',
      allowFormFallback: true,
      timeoutMs: 4500,
      noCandidateMessage: 'パスワード再設定APIの送信先が見つかりません。'
    });

    if (result && result.success && result.user && result.user.email) {
      const user = Object.assign({
        gender: '',
        prefecture: '',
        city: '',
        occupation: '',
        farm_scale: '',
        crop_1: '',
        crop_2: '',
        future_crop: '',
        interests: [],
        newsletter_preference: '希望する',
        updated_at: nowIso()
      }, result.user || {});
      setAuthSession(result.token || '', user);
    }

    return result;
  }

  async function login({email, password, remember}){
    const e = normalizeEmail(email);
    const pw = String(password || '');
    if (!e || !pw) throw new Error('メールアドレスとパスワードを入力してください。');

    const result = await submitMemberEndpoint('tomato-members/v1/login', {
      email: e,
      password: pw,
      paper: detectActivePaper(),
      remember: !!remember
    }, {
      actionLabel: 'ログイン',
      timeoutMs: 4500,
      noCandidateMessage: 'ログインAPIの送信先が見つかりません。'
    });

    if (!result || !result.success || !result.user || !result.token) {
      throw new Error('ログインに失敗しました。入力内容をご確認ください。');
    }

    setAuthSession(result.token, result.user);
    return result.user;
  }

  function currentUser(){
    return getCachedCurrentUser();
  }

  async function refreshCurrentUser(){
    const token = getAuthToken();
    if (!token) return null;
    const result = await submitMemberEndpoint('tomato-members/v1/me', {}, {
      actionLabel: '会員情報取得',
      timeoutMs: 4500,
      noCandidateMessage: '会員情報取得APIの送信先が見つかりません。',
      headers: {
        'Authorization': 'Bearer ' + token
      }
    });
    if (!result || !result.success || !result.user) {
      clearAuthSession();
      return null;
    }
    setAuthSession(token, result.user);
    return result.user;
  }

  function requireLogin(loginPath){
    const user = currentUser();
    if (!user){
      if (loginPath) window.location.href = loginPath;
      return null;
    }
    return user;
  }

  function setValue(form, name, value){
    const el = form.querySelector(`[name="${CSS.escape(name)}"]`);
    if (!el) return;
    if (el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA'){
      el.value = value ?? '';
    }
  }

  function setRadio(form, name, value){
    const nodes = form.querySelectorAll(`input[type="radio"][name="${CSS.escape(name)}"]`);
    nodes.forEach(n => {
      n.checked = (String(n.value) === String(value));
      const wrap = n.closest('.radio-item');
      if (wrap){
        wrap.classList.toggle('selected', n.checked);
      }
    });
  }

  function setCheckboxGroup(form, name, values){
    const set = new Set((values || []).map(String));
    const nodes = form.querySelectorAll(`input[type="checkbox"][name="${CSS.escape(name)}"]`);
    nodes.forEach(n => {
      n.checked = set.has(String(n.value));
      const wrap = n.closest('.checkbox-item') || n.closest('.crop-item');
      if (wrap){
        wrap.classList.toggle('selected', n.checked);
      }
    });
  }

  function prefillMypageForm(form, user){
    if (!form || !user) return;
    setValue(form, 'email', user.email);
    setValue(form, 'nickname', user.nickname);
    setRadio(form, 'gender', user.gender);
    setValue(form, 'prefecture', user.prefecture);
    setValue(form, 'city', user.city);
    setRadio(form, 'occupation', user.occupation);
    setValue(form, 'farm_scale', user.farm_scale);
    setValue(form, 'crop_1', user.crop_1);
    setValue(form, 'crop_2', user.crop_2);
    setValue(form, 'future_crop', user.future_crop);
    setCheckboxGroup(form, 'interests', user.interests);
    setRadio(form, 'newsletter_preference', user.newsletter_preference || (Array.isArray(user.newsletter) && user.newsletter.length ? '希望する' : '希望する'));
  }

  async function updateProfileFromMypageForm(form){
    const user = currentUser();
    const token = getAuthToken();
    if (!user || !token) throw new Error('ログインが必要です。');

    const email = normalizeEmail(form.querySelector('[name="email"]')?.value);
    const nickname = String(form.querySelector('[name="nickname"]')?.value || '');
    const gender = String(form.querySelector('input[name="gender"]:checked')?.value || '');
    const prefecture = String(form.querySelector('[name="prefecture"]')?.value || '');
    const city = String(form.querySelector('[name="city"]')?.value || '');
    const occupation = String(form.querySelector('input[name="occupation"]:checked')?.value || '');
    const farm_scale = String(form.querySelector('[name="farm_scale"]')?.value || '');
    const crop_1 = String(form.querySelector('[name="crop_1"]')?.value || '');
    const crop_2 = String(form.querySelector('[name="crop_2"]')?.value || '');
    const future_crop = String(form.querySelector('[name="future_crop"]')?.value || '');
    const interests = Array.from(form.querySelectorAll('input[name="interests"]:checked')).map(n => n.value);
    const newsletter_preference = String(form.querySelector('input[name="newsletter_preference"]:checked')?.value || '希望する');
    const pw = String(form.querySelector('[name="password"]')?.value || '');
    const pwc = String(form.querySelector('[name="password_confirm"]')?.value || '');

    if (!email) throw new Error('メールアドレスを入力してください。');
    if ((pw || pwc) && pw !== pwc) {
      throw new Error('パスワードが一致しません。');
    }
    if ((pw || pwc) && !passwordPatternOk(pw)){
      throw new Error('パスワードはアルファベット大文字・小文字、数字を含む8文字以上20字以内で入力してください。');
    }

    const payload = {
      email,
      nickname,
      gender,
      prefecture,
      city,
      occupation,
      farm_scale,
      crop_1,
      crop_2,
      future_crop,
      interests,
      newsletter_preference,
      paper: String(user.paper || detectActivePaper() || 'tomato')
    };
    if (pw) {
      payload.password = pw;
      payload.password_confirm = pwc;
    }

    const result = await submitMemberEndpoint('tomato-members/v1/profile', payload, {
      actionLabel: '会員情報更新',
      timeoutMs: 4500,
      noCandidateMessage: '会員情報更新APIの送信先が見つかりません。',
      headers: {
        'Authorization': 'Bearer ' + token
      }
    });

    if (!result || !result.success || !result.user) {
      throw new Error('保存に失敗しました。');
    }

    setAuthSession(token, result.user);
    return result.user;
  }

  global.TomatoAuth = {
    login,
    logout,
    currentUser,
    refreshCurrentUser,
    requireLogin,
    registerFromFormData,
    requestPasswordReset,
    confirmPasswordReset,
    prefillMypageForm,
    updateProfileFromMypageForm
  };

  try {
    if (getAuthToken() && !getCachedCurrentUser()) {
      refreshCurrentUser().catch(function(){ clearAuthSession(); });
    }
  } catch (_e) {}
})(window);


// ===============================
// ✅ ADDED: Active paper memory (for account-page redirects)
// - Stores the last visited paper in localStorage so /account/* pages can redirect back correctly
// ===============================
(function(){
  try{
    const allowed = ['tomato','leek','strawberry'];
    let paper = '';

    // 1) Query param (login/register links should pass ?paper=)
    try{
      const sp = new URLSearchParams(location.search || '');
      paper = String(sp.get('paper') || sp.get('p') || '').toLowerCase();
    }catch(e){}

    // 2) Pathname: /static/{paper}/...
    if (!paper){
      const m = (location.pathname || '').match(/\/static\/([^\/]+)\//);
      if (m && m[1]) paper = String(m[1]).toLowerCase();
    }

    // Avoid saving "account/common/components" as paper
    if (allowed.indexOf(paper) >= 0){
      localStorage.setItem('tomato_active_paper_v1', paper); // contains "paper" so account pages can detect it
    }
  }catch(_e){}
})();


// ===============================
// Header Login/Logout Toggle (safe)
// - Works even when header is injected by components.js (innerHTML)
// - Uses `headerLoaded` event + short polling (NO MutationObserver to avoid infinite loops)
// - Staging/Prod safe: computes static root from current path
// ===============================
(function(){
  function staticRoot(){
    const p = location.pathname || '';
    const idx = p.indexOf('/static/');
    if (idx >= 0) return p.slice(0, idx + '/static/'.length);
    return '/static/';
  }

  function detectPaper(){
    try {
      const qp = new URLSearchParams(location.search).get('paper');
      if (qp) return qp;
    } catch(e){}

    const m = location.pathname.match(/\/static\/([^\/]+)\//);
    if (m && m[1] && m[1] !== 'account' && m[1] !== 'common' && m[1] !== 'components'){
      return m[1];
    }
    return 'tomato';
  }

  function setVisible(el, visible){
    if (!el) return;
    el.hidden = !visible;
    el.setAttribute('aria-hidden', visible ? 'false' : 'true');

    if (visible) {
      try { el.style.removeProperty('display'); } catch(_e) { el.style.display = ''; }
      try { el.style.removeProperty('visibility'); } catch(_e) { el.style.visibility = ''; }
      try { el.style.removeProperty('pointer-events'); } catch(_e) { el.style.pointerEvents = ''; }
    } else {
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
    }
  }

  function applyHeaderAuth(){
    const btn = document.getElementById('loginLogoutBtn');
    const registerBtn = document.getElementById('registerBtn');
    const mobileRegisterBtn = document.getElementById('mobileRegisterBtn');
    const mypageBtn = document.getElementById('mypageBtn');
    const mobileMypageBtn = document.getElementById('mobileMypageBtn');
    const heroRegisterBtn = document.getElementById('heroRegisterBtn');
    const hasAuthTargets = !!(btn || registerBtn || mobileRegisterBtn || mypageBtn || mobileMypageBtn || heroRegisterBtn);
    if (!hasAuthTargets) return false;

    const user = (window.TomatoAuth && TomatoAuth.currentUser) ? TomatoAuth.currentUser() : null;
    const paper = detectPaper();
    const root = staticRoot();

    if (btn){
      if (user){
        if (btn.textContent !== 'ログアウト') btn.textContent = 'ログアウト';
        btn.href = 'javascript:void(0)';
        btn.onclick = function(){
          TomatoAuth.logout();
          location.href = `${root}${paper}/index.html`;
          return false;
        };
      } else {
        if (btn.textContent !== 'ログイン') btn.textContent = 'ログイン';
        btn.onclick = null;
        btn.href = `${root}account/login.html?paper=${encodeURIComponent(paper)}`;
      }
    }

    if (user){
      setVisible(registerBtn, false);
      setVisible(mobileRegisterBtn, false);
      setVisible(heroRegisterBtn, false);
      setVisible(mypageBtn, true);
      setVisible(mobileMypageBtn, true);
    } else {
      setVisible(registerBtn, true);
      setVisible(mobileRegisterBtn, true);
      setVisible(heroRegisterBtn, true);
      setVisible(mypageBtn, false);
      setVisible(mobileMypageBtn, false);
    }
    return true;
  }

  function startPolling(){
    let tries = 0;
    const maxTries = 200; // ~10s at 50ms
    const timer = setInterval(function(){
      tries++;
      if (applyHeaderAuth() || tries >= maxTries){
        clearInterval(timer);
      }
    }, 50);
  }

  // Try immediately
  if (!applyHeaderAuth()){
    // Header may be injected later by components.js
    startPolling();
  }

  // When components.js injects header, it dispatches this event
  window.addEventListener('headerLoaded', function(){
    applyHeaderAuth();
  });
})();


// ===============================
// Login / password-reset page behavior
// ===============================
(function(){
  const path = String(location.pathname || '');
  const isLoginPage = /\/account\/login\.html$/i.test(path) || /\/static\/account\/login\.html$/i.test(path);
  if (!isLoginPage) return;

  const allowed = ['tomato','leek','strawberry'];

  function detectPaper(){
    try{
      const sp = new URLSearchParams(location.search || '');
      const p = String(sp.get('paper') || sp.get('p') || '').toLowerCase();
      if (allowed.indexOf(p) >= 0) return p;
    }catch(e){}

    try{
      const ref = String(document.referrer || '');
      for (let i=0;i<allowed.length;i++){
        if (ref.indexOf('/static/' + allowed[i] + '/') >= 0) return allowed[i];
      }
    }catch(e){}

    try{
      const saved = String(localStorage.getItem('tomato_active_paper_v1') || '').toLowerCase();
      if (allowed.indexOf(saved) >= 0) return saved;
      for (let j=0;j<localStorage.length;j++){
        const k = localStorage.key(j);
        if (!k || !/paper/i.test(k)) continue;
        const v = String(localStorage.getItem(k) || '').toLowerCase();
        if (allowed.indexOf(v) >= 0) return v;
      }
    }catch(e){}

    return 'tomato';
  }

  function searchParam(name){
    try{
      const rawSearch = String(location.search || '').replace(/^\?/, '');
      if (!rawSearch) return '';
      const pairs = rawSearch.split('&');
      const target = String(name || '');
      for (let i = 0; i < pairs.length; i++) {
        const part = String(pairs[i] || '');
        if (!part) continue;
        const eqIndex = part.indexOf('=');
        const rawKey = eqIndex >= 0 ? part.slice(0, eqIndex) : part;
        const rawValue = eqIndex >= 0 ? part.slice(eqIndex + 1) : '';
        let decodedKey = '';
        try {
          decodedKey = decodeURIComponent(rawKey);
        } catch (_err) {
          decodedKey = rawKey;
        }
        if (decodedKey !== target) continue;
        try {
          return decodeURIComponent(rawValue);
        } catch (_err) {
          return rawValue;
        }
      }
    }catch(_e){}
    return '';
  }

  function isResetMode(){
    return searchParam('mode') === 'reset' && !!searchParam('login') && !!searchParam('key');
  }

  function showPanel(name){
    const panels = document.querySelectorAll('[data-login-panel]');
    panels.forEach(function(panel){
      panel.hidden = panel.getAttribute('data-login-panel') !== name;
    });
  }

  function setText(id, value){
    const el = document.getElementById(id);
    if (el) el.textContent = String(value || '');
  }

  function goToLogin(){
    showPanel('login');
  }

  function goToForgot(){
    showPanel('forgot-request');
    const input = document.getElementById('forgotEmail');
    if (input && !input.value) {
      const loginEmail = document.getElementById('email');
      if (loginEmail && loginEmail.value) input.value = loginEmail.value;
    }
  }

  function goToForgotSent(email){
    setText('forgotSentEmail', email || '');
    showPanel('forgot-sent');
  }

  function goToReset(){
    showPanel('reset-password');
  }

  function goToResetDone(){
    showPanel('reset-complete');
  }

  try{
    const paper = detectPaper();
    const user = (window.TomatoAuth && TomatoAuth.currentUser) ? TomatoAuth.currentUser() : null;
    if (user && !isResetMode()){
      location.replace('../' + paper + '/index.html');
      return;
    }
  }catch(_e){}

  function bindClick(id, handler){
    const el = document.getElementById(id);
    if (!el || el.__wired) return;
    el.__wired = true;
    el.addEventListener('click', handler);
  }

  function wireLogin(){
    const paper = detectPaper();
    try{ localStorage.setItem('tomato_active_paper_v1', paper); }catch(_e){}

    const form = document.getElementById('loginForm');
    if (form && !form.__wired){
      form.__wired = true;
      form.addEventListener('submit', async function(ev){
        ev.preventDefault();
        const email = String(document.getElementById('email')?.value || '').trim();
        const password = String(document.getElementById('password')?.value || '');
        const remember = !!document.getElementById('remember')?.checked;

        try{
          await TomatoAuth.login({ email, password, remember });
          window.location.href = './mypage.html?paper=' + encodeURIComponent(paper);
        }catch(err){
          alert(err?.message || 'ログインに失敗しました。入力内容をご確認ください。');
        }
      });
    }

    const forgotForm = document.getElementById('forgotPasswordForm');
    if (forgotForm && !forgotForm.__wired){
      forgotForm.__wired = true;
      forgotForm.addEventListener('submit', async function(ev){
        ev.preventDefault();
        const email = String(document.getElementById('forgotEmail')?.value || '').trim();
        try{
          await TomatoAuth.requestPasswordReset(email, paper);
          goToForgotSent(email);
        }catch(err){
          alert(err?.message || 'パスワード再設定メールの送信に失敗しました。');
        }
      });
    }

    const resetForm = document.getElementById('resetPasswordForm');
    if (resetForm && !resetForm.__wired){
      resetForm.__wired = true;
      resetForm.addEventListener('submit', async function(ev){
        ev.preventDefault();
        const password = String(document.getElementById('resetPassword')?.value || '');
        const passwordConfirm = String(document.getElementById('resetPasswordConfirm')?.value || '');
        try{
          await TomatoAuth.confirmPasswordReset({
            login: searchParam('login'),
            key: searchParam('key'),
            password: password,
            password_confirm: passwordConfirm,
            paper: paper
          });
          goToResetDone();
        }catch(err){
          alert(err?.message || 'パスワードの再設定に失敗しました。');
        }
      });
    }

    bindClick('forgotPasswordLink', function(ev){
      ev.preventDefault();
      goToForgot();
    });
    bindClick('backToLoginFromForgot', function(ev){ ev.preventDefault(); goToLogin(); });
    bindClick('backToLoginFromSent', function(ev){ ev.preventDefault(); goToLogin(); });
    bindClick('backToLoginFromReset', function(ev){ ev.preventDefault(); goToLogin(); });
    bindClick('backToLoginFromResetDone', function(ev){ ev.preventDefault(); goToLogin(); });
    bindClick('backToLoginLink', function(ev){ ev.preventDefault(); goToLogin(); });
    bindClick('goToLoginAfterReset', function(ev){
      ev.preventDefault();
      window.location.href = './login.html?paper=' + encodeURIComponent(paper);
    });

    const register = document.getElementById('registerLink');
    if (register){
      register.setAttribute('href', './register.html?paper=' + encodeURIComponent(paper));
    }

    if (isResetMode()) {
      goToReset();
    } else {
      goToLogin();
    }
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', wireLogin);
  } else {
    wireLogin();
  }
})();

/* Paper-aware helpers (account pages)
   - Provides window.__detectPaper() and window.__paperTop(paper)
   - Used by account pages (login/register/mypage) for correct redirects across envs
*/
(function(){
  if (window.__detectPaper && window.__paperTop) return;

  var allowed = ['tomato','leek','strawberry'];
  window.__tomatoAllowedPapers = allowed;

  function staticRoot(){
    try{
      var p = location.pathname || '';
      var idx = p.indexOf('/static/');
      if (idx >= 0) return p.slice(0, idx + '/static/'.length);
    }catch(_e){}
    return '/static/';
  }

  window.__detectPaper = function(){
    try{
      var sp = new URLSearchParams(location.search || '');
      var p = (sp.get('paper') || sp.get('p') || '').toLowerCase();
      if (allowed.indexOf(p) >= 0) return p;

      // Prefer /static/{paper}/... path
      var m = (location.pathname || '').match(/\/static\/([^\/]+)\//);
      if (m && m[1] && allowed.indexOf(String(m[1]).toLowerCase()) >= 0) return String(m[1]).toLowerCase();

      // Referrer fallback (/static/{paper}/...)
      var ref = String(document.referrer || '');
      for (var i=0;i<allowed.length;i++){
        if (ref.indexOf('/static/' + allowed[i] + '/') >= 0) return allowed[i];
      }

      // Any localStorage key that includes "paper"
      for (var j=0;j<localStorage.length;j++){
        var k = localStorage.key(j);
        if (!k) continue;
        if (!/paper/i.test(k)) continue;
        var v = String(localStorage.getItem(k) || '').toLowerCase();
        if (allowed.indexOf(v) >= 0) return v;
      }
    }catch(_e){}
    return 'tomato';
  };

  window.__paperTop = function(paper){
    var p = (paper || window.__detectPaper() || 'tomato').toLowerCase();
    if (allowed.indexOf(p) < 0) p = 'tomato';
    return staticRoot() + p + '/index.html';
  };
})();

/* mypage.html behaviors (moved from mypage.html)
   - Requires login
   - Prefills profile form
   - Saves updates via WordPress REST API
*/
(function(){
  function initMypage(){
    var form = document.getElementById('mypageForm');
    if (!form) return;

    try{
      if (!window.TomatoAuth || typeof window.TomatoAuth.currentUser !== 'function') {
        location.replace(window.__paperTop ? window.__paperTop() : '/static/tomato/index.html');
        return;
      }

      var user = window.TomatoAuth.currentUser();
      if (!user){
        location.replace(window.__paperTop ? window.__paperTop() : '/static/tomato/index.html');
        return;
      }

      // Fill form with saved profile
      if (typeof window.TomatoAuth.prefillMypageForm === 'function'){
        window.TomatoAuth.prefillMypageForm(form, user);
      }

      var radioItems = document.querySelectorAll('.radio-item');
      var checkboxItems = document.querySelectorAll('.checkbox-item');

      radioItems.forEach(function(item){
        var input = item.querySelector('input[type="radio"]');
        if (!input) return;
        input.addEventListener('change', function(){
          var group = document.querySelectorAll('input[name="'+ CSS.escape(this.name) +'"]');
          group.forEach(function(radio){
            var wrap = radio.closest('.radio-item');
            if (wrap) wrap.classList.remove('selected');
          });
          if (this.checked) item.classList.add('selected');
        });

        // initial state
        if (input.checked) item.classList.add('selected');
      });

      checkboxItems.forEach(function(item){
        var input = item.querySelector('input[type="checkbox"]');
        if (!input) return;
        input.addEventListener('change', function(){
          if (this.checked) item.classList.add('selected');
          else item.classList.remove('selected');
        });

        // initial state
        if (input.checked) item.classList.add('selected');
      });

      form.addEventListener('submit', function(e){
        e.preventDefault();
        if (typeof window.TomatoAuth.updateProfileFromMypageForm !== 'function'){
          alert('保存に失敗しました。');
          return;
        }
        window.TomatoAuth.updateProfileFromMypageForm(form).then(function(){
          var successMessage = document.getElementById('successMessage');
          if (successMessage){
            successMessage.classList.add('show');
            window.scrollTo({top:0,behavior:'smooth'});
            setTimeout(function(){ successMessage.classList.remove('show'); }, 3000);
          }
        }).catch(function(err){
          alert((err && err.message) || '保存に失敗しました。');
        });
      });
    }catch(_e){
      location.replace(window.__paperTop ? window.__paperTop() : '/static/tomato/index.html');
    }
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', initMypage);
  } else {
    initMypage();
  }
})();

// ===============================
// Register page behavior (moved from account/register.html)
// - Early redirect if already logged in
// - Multi-step form UI + submit via TomatoAuth.registerFromFormData
// ===============================
(function(){
  const path = String(location.pathname || '');
  const isRegisterPage = /\/account\/register\.html$/i.test(path) || /\/static\/account\/register\.html$/i.test(path);
  if (!isRegisterPage) return;

  // If already logged in, block access to register and redirect to paper top
  try{
    var currentUser = (window.TomatoAuth && typeof window.TomatoAuth.currentUser === 'function') ? window.TomatoAuth.currentUser() : null;
    if (currentUser) location.replace(window.__paperTop());
  }catch(_e){}

var currentStep = 1;
        var totalSteps = 4;

        // キャンセル処理
        function cancelRegistration() {
            if (confirm('会員登録を中止してよろしいですか？\n入力した情報は保存されません。')) {
                window.location.href = window.__paperTop();
            }
        }

        // フォームの初期化
        document.addEventListener('DOMContentLoaded', function() {
            // paper-aware TOP links
            document.querySelectorAll('[data-paper-top-link="1"]').forEach(function(a){ a.href = window.__paperTop(); });


            // --- Edit mode (when already logged in) ---
            // If user is logged in, this page works as "profile edit":
            // - Prefill with current user's saved data
            // - Password fields become optional (only when changing)
            // - Submit updates the existing user instead of creating a new one
            var __currentUser = (window.TomatoAuth && typeof window.TomatoAuth.currentUser === 'function')
              ? window.TomatoAuth.currentUser()
              : null;
            window.__REGISTER_EDIT_MODE__ = !!__currentUser;

            if (window.__REGISTER_EDIT_MODE__) {
                // Prefill all fields (email/nickname/gender/prefecture/city/occupation/farm_scale/crops/interests/newsletter_preference)
                try {
                    var formElForPrefill = document.getElementById('registrationForm');
                    window.TomatoAuth.prefillMypageForm(formElForPrefill, __currentUser);

                    // Password becomes optional in edit mode
                    var pw = formElForPrefill.querySelector('input[name="password"]');
                    var pwc = formElForPrefill.querySelector('input[name="password_confirm"]');
                    if (pw) {
                        pw.required = false;
                        pw.placeholder = '変更する場合のみ入力（8〜20文字：英大文字・小文字・数字）';
                    }
                    if (pwc) {
                        pwc.required = false;
                        pwc.placeholder = '変更する場合のみ入力';
                    }

                    // Update page title (optional)
                    var t = document.querySelector('.progress-title');
                    if (t) t.textContent = '会員情報の変更';

                    // Update header buttons (optional)
                    var cancelBtn = document.querySelector('.btn-header.cancel');
                    if (cancelBtn) cancelBtn.textContent = '戻る';
                } catch (e) {
                    console.warn('Prefill failed:', e);
                }
            }

            // ラジオボタンとチェックボックスのスタイル制御
            var radioItems = document.querySelectorAll('.radio-item');
            var checkboxItems = document.querySelectorAll('.checkbox-item');

            radioItems.forEach(function(item) {
                var input = item.querySelector('input[type="radio"]');
                input.addEventListener('change', function() {
                    var group = document.querySelectorAll('input[name="' + this.name + '"]');
                    group.forEach(function(radio) {
                        radio.closest('.radio-item').classList.remove('selected');
                    });
                    if (this.checked) {
                        item.classList.add('selected');
                    }
                });
            });

            checkboxItems.forEach(function(item) {
                var input = item.querySelector('input[type="checkbox"]');
                input.addEventListener('change', function() {
                    if (this.checked) {
                        item.classList.add('selected');
                    } else {
                        item.classList.remove('selected');
                    }
                });
            });

            // フォーム送信処理
            document.getElementById('registrationForm').addEventListener('submit', function(e) {
                e.preventDefault();
                submitForm();
            });
        });

        function updateProgressBar() {
            for (var i = 1; i <= totalSteps; i++) {
                var stepCircle = document.getElementById('step-' + i);
                stepCircle.classList.remove('active', 'completed');
                
                if (i < currentStep) {
                    stepCircle.classList.add('completed');
                    stepCircle.innerHTML = '✓';
                } else if (i === currentStep) {
                    stepCircle.classList.add('active');
                    stepCircle.innerHTML = i;
                } else {
                    stepCircle.innerHTML = i;
                }
            }
        }

        function showStep(step) {
            // すべてのステップを非表示
            document.querySelectorAll('.form-step').forEach(function(s) {
                s.classList.remove('active');
            });
            
            // 指定されたステップを表示
            var targetStep = document.getElementById('form-step-' + step);
            if (targetStep) {
                targetStep.classList.add('active');
            }
            
            // ボタンの表示制御
            var prevBtn = document.getElementById('prevBtn');
            var nextBtn = document.getElementById('nextBtn');
            var submitBtn = document.getElementById('submitBtn');
            
            if (step === 1) {
                prevBtn.style.display = 'none';
                nextBtn.style.display = 'inline-flex';
                submitBtn.style.display = 'none';
            } else if (step === totalSteps) {
                prevBtn.style.display = 'inline-flex';
                nextBtn.style.display = 'none';
                submitBtn.style.display = 'inline-flex';
                showSummary();
            } else {
                prevBtn.style.display = 'inline-flex';
                nextBtn.style.display = 'inline-flex';
                submitBtn.style.display = 'none';
            }
            
            updateProgressBar();
            
            // ページの上部にスクロール
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function validateStep(step) {
            const currentStepElement = document.getElementById('form-step-' + step);
            const requiredFields = currentStepElement.querySelectorAll('[required]');
            let isValid = true;
            
            // まず必須フィールドのチェック
            requiredFields.forEach(function(field) {
                if (field.type === 'radio') {
                    const radioGroup = currentStepElement.querySelectorAll('input[name="' + field.name + '"]');
                    const isChecked = Array.from(radioGroup).some(function(radio) { return radio.checked; });
                    if (!isChecked) {
                        isValid = false;
                    }
                } else if (field.type === 'checkbox') {
                    if (!field.checked) {
                        isValid = false;
                    }
                } else {
                    if (!field.value.trim()) {
                        isValid = false;
                        field.classList.add('error');
                    } else {
                        field.classList.remove('error');
                    }
                }
            });
            
            if (!isValid) {
                alert('必須項目をすべて入力してください。');
                return false;
            }
            
            // パスワード確認のチェック（ステップ1の場合、必須チェック後に実行）
            if (step === 1) {
                const passwordEl = document.querySelector('input[name="password"]');
                const passwordConfirmEl = document.querySelector('input[name="password_confirm"]');
                const password = passwordEl ? passwordEl.value : '';
                const passwordConfirm = passwordConfirmEl ? passwordConfirmEl.value : '';

                // Edit mode:
                // - if both are empty => OK (no password change)
                // - if either is filled => validate match + pattern
                const isEditMode = !!window.__REGISTER_EDIT_MODE__;
                if (isEditMode && !password && !passwordConfirm) {
                    return true;
                }

                // New registration OR password-change in edit mode
                if (password !== passwordConfirm) {
                    alert('パスワードが一致しません。');
                    return false;
                }

                // パスワードの形式チェック
                const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,20}$/;

                if (!password) {
                    // 新規登録時は必須
                    if (!isEditMode) {
                        alert('パスワードを入力してください。');
                        return false;
                    }
                    return false;
                }

                if (!passwordPattern.test(password)) {
                    alert('パスワードはアルファベット大文字・小文字、数字を含む8文字以上20字以内で入力してください。');
                    return false;
                }
            }

            return true;
        }

        function nextStep() {
            if (validateStep(currentStep)) {
                if (currentStep < totalSteps) {
                    currentStep++;
                    showStep(currentStep);
                }
            }
        }

        function previousStep() {
            if (currentStep > 1) {
                currentStep--;
                showStep(currentStep);
            }
        }

        function goToStep(step) {
            // 既に完了したステップにのみ直接移動可能
            if (step < currentStep) {
                currentStep = step;
                showStep(currentStep);
            }
        }

        function showSummary() {
            var formData = new FormData(document.getElementById('registrationForm'));
            var summary = document.getElementById('form-summary');
            
            var summaryHTML = '<h3>入力内容の確認</h3>';
            summaryHTML += '<div style="background: #f8f9fa; padding: 20px; border-radius: 10px;">';
            
            // 基本情報
            summaryHTML += '<p><strong>メールアドレス:</strong> ' + (formData.get('email') || '') + '</p>';
            summaryHTML += '<p><strong>ニックネーム:</strong> ' + (formData.get('nickname') || '') + '</p>';
            summaryHTML += '<p><strong>性別:</strong> ' + (formData.get('gender') || '') + '</p>';
            summaryHTML += '<p><strong>都道府県:</strong> ' + (formData.get('prefecture') || '') + '</p>';
            summaryHTML += '<p><strong>市町村:</strong> ' + (formData.get('city') || '') + '</p>';
            summaryHTML += '<p><strong>職業:</strong> ' + (formData.get('occupation') || '') + '</p>';
            
            // 栽培情報
            summaryHTML += '<p><strong>営農規模:</strong> ' + (formData.get('farm_scale') || '') + '</p>';
            var crop1 = formData.get('crop_1');
            var crop2 = formData.get('crop_2');
            if (crop1) {
                summaryHTML += '<p><strong>栽培品目（1品目目）:</strong> ' + crop1 + '</p>';
            }
            if (crop2) {
                summaryHTML += '<p><strong>栽培品目（2品目目）:</strong> ' + crop2 + '</p>';
            }
            var futureCrop = formData.get('future_crop');
            if (futureCrop) {
                summaryHTML += '<p><strong>今後栽培したい品目:</strong> ' + futureCrop + '</p>';
            }
            
// 興味・関心
            var interests = formData.getAll('interests') || [];
            if (interests.length > 0) {
                summaryHTML += '<p><strong>興味・関心:</strong> ' + interests.join('、') + '</p>';
            } else {
                summaryHTML += '<p><strong>興味・関心:</strong> （未選択）</p>';
            }
            // 情報配信の希望（複数選択）
            var newsletterPreference = formData.get('newsletter_preference') || '';
            if (newsletterPreference) {
                summaryHTML += '<p><strong>情報配信の希望:</strong> ' + newsletterPreference + '</p>';
            }

            summaryHTML += '</div>';
            summary.innerHTML = summaryHTML;
            summary.style.display = 'block';
        }

        function submitForm() {
            var agreeCheckbox = document.querySelector('input[name="agree"]');
            if (!agreeCheckbox.checked) {
                alert('個人情報の取扱いについて同意してください。');
                return;
            }

            var formEl = document.getElementById('registrationForm');
            var formData = new FormData(formEl);

            // WordPress REST API へ登録／更新
            var isEditMode = !!window.__REGISTER_EDIT_MODE__;
            var p = isEditMode
                ? TomatoAuth.updateProfileFromMypageForm(formEl)
                : TomatoAuth.registerFromFormData(formData);

            p.then(function(){
                // 完了画面を表示
                formEl.style.display = 'none';
                document.querySelector('.progress-header').style.display = 'none';
                document.getElementById('completionMessage').style.display = 'block';
            }).catch(function(err){
                alert(err?.message || (isEditMode ? '更新に失敗しました。入力内容をご確認ください。' : '登録に失敗しました。入力内容をご確認ください。'));
            });
        }


  // expose functions for inline onclick handlers
  window.cancelRegistration = cancelRegistration;
  window.goToStep = goToStep;
  window.nextStep = nextStep;
  window.previousStep = previousStep;
  window.showStep = showStep;
  window.showSummary = showSummary;
  window.submitForm = submitForm;
  window.updateProgressBar = updateProgressBar;
  window.validateStep = validateStep;

})();
