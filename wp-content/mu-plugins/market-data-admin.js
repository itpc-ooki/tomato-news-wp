(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    const paperSelect = document.getElementById('market_paper');
    const varietySelect = document.getElementById('market_variety');
    const config = window.TomatoMarketDataConfig;

    if (!paperSelect || !varietySelect || !config || !config.varietiesByPaper) {
      return;
    }

    function updateVarietyOptions() {
      const currentValue = varietySelect.value;
      const varieties = config.varietiesByPaper[paperSelect.value] || {};

      varietySelect.replaceChildren();

      Object.keys(varieties).forEach(function (key) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = varieties[key];
        varietySelect.appendChild(option);
      });

      if (Object.prototype.hasOwnProperty.call(varieties, currentValue)) {
        varietySelect.value = currentValue;
      }
    }

    paperSelect.addEventListener('change', updateVarietyOptions);
  });
})();
