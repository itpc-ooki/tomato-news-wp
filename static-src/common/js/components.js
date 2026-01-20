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
