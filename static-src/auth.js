/*!
 * TomatoAuth (LocalStorage demo)
 * - No backend / No cookies
 * - For production: replace with real API + secure auth
 */
(function(global){
  const USERS_KEY = 'tomato_users_v1';
  const SESSION_LOCAL_KEY = 'tomato_session_email_v1';
  const SESSION_SESSION_KEY = 'tomato_session_email_session_v1';

  function nowIso(){ return new Date().toISOString(); }

  function loadUsers(){
    try{
      const raw = localStorage.getItem(USERS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    }catch(_e){
      return [];
    }
  }

  function saveUsers(users){
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
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

  function getSessionEmail(){
    return localStorage.getItem(SESSION_LOCAL_KEY) || sessionStorage.getItem(SESSION_SESSION_KEY) || '';
  }

  // ✅ FIX: Always persist so login state is shared across pages/tabs
  function setSessionEmail(email, remember){
    const e = normalizeEmail(email);
    localStorage.removeItem(SESSION_LOCAL_KEY);
    sessionStorage.removeItem(SESSION_SESSION_KEY);
    if (!e) return;

    // Always persist for consistent behavior across pages/tabs
    localStorage.setItem(SESSION_LOCAL_KEY, e);

    // Optional: keep sessionStorage too when remember is false
    if (!remember){
      sessionStorage.setItem(SESSION_SESSION_KEY, e);
    }
  }

  function logout(){
    localStorage.removeItem(SESSION_LOCAL_KEY);
    sessionStorage.removeItem(SESSION_SESSION_KEY);
  }

  function findUserByEmail(users, email){
    const e = normalizeEmail(email);
    return users.find(u => normalizeEmail(u.email) === e) || null;
  }

  function passwordPatternOk(pw){
    // uppercase + lowercase + digit, 8-20
    const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,20}$/;
    return re.test(String(pw || ''));
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

    const users = loadUsers();
    if (findUserByEmail(users, email)) {
      throw new Error('このメールアドレスは既に登録されています。');
    }

    const interests = formData.getAll('interest')?.length ? formData.getAll('interest')
                    : formData.getAll('interests'); // support both names
    const newsletters = formData.getAll('newsletter');

    const user = {
      id: 'u_' + Math.random().toString(36).slice(2, 10),
      email,
      passwordHash: await sha256Hex(password),
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
      newsletter: Array.isArray(newsletters) ? newsletters.filter(Boolean) : [],
      created_at: nowIso(),
      updated_at: nowIso()
    };

    users.push(user);
    saveUsers(users);
    setSessionEmail(email, true);
    return user;
  }

  async function login({email, password, remember}){
    const e = normalizeEmail(email);
    const pw = String(password || '');
    if (!e || !pw) throw new Error('メールアドレスとパスワードを入力してください。');

    const users = loadUsers();
    const user = findUserByEmail(users, e);
    if (!user) throw new Error('メールアドレスまたはパスワードが違います。');

    const hash = await sha256Hex(pw);
    if (hash !== user.passwordHash) throw new Error('メールアドレスまたはパスワードが違います。');

    setSessionEmail(e, !!remember);
    return user;
  }

  function currentUser(){
    const email = getSessionEmail();
    if (!email) return null;
    const users = loadUsers();
    return findUserByEmail(users, email);
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
    setCheckboxGroup(form, 'newsletter', user.newsletter);
  }

  async function updateProfileFromMypageForm(form){
    const user = currentUser();
    if (!user) throw new Error('ログインが必要です。');

    const users = loadUsers();
    const idx = users.findIndex(u => normalizeEmail(u.email) === normalizeEmail(user.email));
    if (idx < 0) throw new Error('ユーザーが見つかりません。');

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
    const newsletter = Array.from(form.querySelectorAll('input[name="newsletter"]:checked')).map(n => n.value);

    if (!email) throw new Error('メールアドレスを入力してください。');

    const other = users.find(u => normalizeEmail(u.email) === email && u.id !== users[idx].id);
    if (other) throw new Error('このメールアドレスは既に使用されています。');

    const pw = String(form.querySelector('[name="password"]')?.value || '');
    const pwc = String(form.querySelector('[name="password_confirm"]')?.value || '');
    if (pw || pwc){
      if (pw !== pwc) throw new Error('パスワードが一致しません。');
      if (!passwordPatternOk(pw)){
        throw new Error('パスワードはアルファベット大文字・小文字、数字を含む8文字以上20字以内で入力してください。');
      }
      users[idx].passwordHash = await sha256Hex(pw);
    }

    users[idx] = {
      ...users[idx],
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
      newsletter,
      updated_at: nowIso()
    };

    saveUsers(users);

    const remember = !!localStorage.getItem(SESSION_LOCAL_KEY);
    setSessionEmail(email, remember);
    return users[idx];
  }

  global.TomatoAuth = {
    login,
    logout,
    currentUser,
    requireLogin,
    registerFromFormData,
    prefillMypageForm,
    updateProfileFromMypageForm
  };
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

  function applyHeaderAuth(){
    const btn = document.getElementById('loginLogoutBtn');
    if (!btn) return false;

    const user = (window.TomatoAuth && TomatoAuth.currentUser) ? TomatoAuth.currentUser() : null;
    const paper = detectPaper();
    const root = staticRoot();

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
// Login page behavior (moved from login.html)
// - Early redirect if already logged in
// - Handle login form submit
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
      // Saved by auth.js (Active paper memory)
      const saved = String(localStorage.getItem('tomato_active_paper_v1') || '').toLowerCase();
      if (allowed.indexOf(saved) >= 0) return saved;

      // Back-compat: find any localStorage key/value that looks like it stores the paper name
      for (let j=0;j<localStorage.length;j++){
        const k = localStorage.key(j);
        if (!k) continue;
        if (!/paper/i.test(k)) continue;
        const v = String(localStorage.getItem(k) || '').toLowerCase();
        if (allowed.indexOf(v) >= 0) return v;
      }
    }catch(e){}

    return 'tomato';
  }

  // ---- Early redirect: already logged in -> go back to paper top ----
  try{
    const paper = detectPaper();
    const user = (window.TomatoAuth && TomatoAuth.currentUser) ? TomatoAuth.currentUser() : null;
    if (user){
      location.replace('../' + paper + '/index.html');
      return;
    }
  }catch(_e){}

  function wireLogin(){
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
          const paper = detectPaper();
          window.location.href = './mypage.html?paper=' + encodeURIComponent(paper);
        }catch(err){
          alert(err?.message || 'ログインに失敗しました。入力内容をご確認ください。');
        }
      });
    }

    const forgot = document.getElementById('forgotPasswordLink');
    if (forgot && !forgot.__wired){
      forgot.__wired = true;
      forgot.addEventListener('click', function(ev){
        ev.preventDefault();
        alert('パスワード再設定（仮）');
      });
    }

    const register = document.getElementById('registerLink');
    if (register){
      const paper = detectPaper();
      // Keep existing relative link, just ensure paper is preserved
      const base = './register.html';
      register.setAttribute('href', base + '?paper=' + encodeURIComponent(paper));
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
   - Saves updates back to localStorage
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
    var USERS_KEY='tomato_users_v1';
    var SESSION_LOCAL_KEY='tomato_session_email_v1';
    var SESSION_SESSION_KEY='tomato_session_email_session_v1';
    var email=(localStorage.getItem(SESSION_LOCAL_KEY)||sessionStorage.getItem(SESSION_SESSION_KEY)||'').trim().toLowerCase();
    if(email){
      var raw=localStorage.getItem(USERS_KEY)||'[]';
      var users=JSON.parse(raw); if(!Array.isArray(users)) users=[];
      var ok=users.some(function(u){ return (String(u && u.email || '').trim().toLowerCase()===email); });
      if(ok) location.replace(window.__paperTop());
    }
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
                // Prefill all fields (email/nickname/gender/prefecture/city/occupation/farm_scale/crops/interests/newsletter)
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
            var newsletters = formData.getAll('newsletter') || [];
            if (newsletters.length > 0) {
                summaryHTML += '<p><strong>情報配信の希望:</strong> ' + newsletters.join('、') + '</p>';
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

            // LocalStorageへ登録／更新（デモ実装）
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
