/**
 * Component Loader - Loads header and footer components dynamically
 * コンポーネントローダー - ヘッダーとフッターを動的に読み込む
 */

// Load header component
(async function() {
    try {
      const response = await fetch('/static-src/components/header.html');
      const html = await response.text();
      const headerContainer = document.getElementById('header-container');
      if (headerContainer) {
        headerContainer.innerHTML = html;
        // Dispatch event when header is loaded
        window.dispatchEvent(new CustomEvent('headerLoaded'));
      }
    } catch (error) {
      console.error('Error loading header:', error);
    }
  })();
  
  // Load footer component
  (async function() {
    try {
      const response = await fetch('/static-src/components/footer.html');
      const html = await response.text();
      const footerContainer = document.getElementById('footer-container');
      if (footerContainer) {
        footerContainer.innerHTML = html;
      }
    } catch (error) {
      console.error('Error loading footer:', error);
    }
  })();

/* ===== Mobile Menu Toggle Function ===== */
function toggleMobileMenu() {
  const menu = document.getElementById('mobileMenu');
  const overlay = document.getElementById('mobileMenuOverlay');
  if (menu && overlay) {
    menu.classList.toggle('active');
    overlay.classList.toggle('active');
  }
}

/* ===== Footer Accordion Function ===== */
function toggleFooterMenu(element) {
  if (window.innerWidth <= 768) {
    element.classList.toggle('active');
  }
}

/* ===== Demo Modal Function ===== */
function openModal(kind) {
  alert(kind === 'signin' ? 'ログイン（ダミー）' : kind === 'signup' ? '会員登録（ダミー）' : 'マイページ（ダミー）');
}
  