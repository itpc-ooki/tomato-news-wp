(function (wp, document) {
  'use strict';

  if (!wp || !wp.data || !wp.domReady || !window.tomatoArticleTypeAdmin) {
    return;
  }

  var config = window.tomatoArticleTypeAdmin;
  var terms = Array.isArray(config.terms) ? config.terms : [];
  var paperCategories = config.paperCategories || {};
  var taxonomyLabel = String(config.taxonomyLabel || '記事タイプ').trim();
  var taxonomyRestBase = String(config.taxonomyRestBase || 'article_type').trim();
  var termById = {};
  var termsByName = {};
  var scheduled = false;
  var lastSelectionKey = '';

  terms.forEach(function (term) {
    var id = Number(term.id || 0);
    var name = String(term.name || '').trim();
    var papers = Array.isArray(term.papers) ? term.papers.map(String) : [];

    if (!id) return;
    termById[id] = { id: id, name: name, papers: papers };
    if (name) {
      if (!termsByName[name]) termsByName[name] = [];
      termsByName[name].push(termById[id]);
    }
  });

  Object.keys(termsByName).forEach(function (name) {
    termsByName[name].sort(function (a, b) {
      return a.id - b.id;
    });
  });

  function getEditorSelect() {
    return wp.data.select('core/editor');
  }

  function getSelectedPapers() {
    var editor = getEditorSelect();
    if (!editor || typeof editor.getEditedPostAttribute !== 'function') return [];

    var categoryIds = editor.getEditedPostAttribute('categories');
    if (!Array.isArray(categoryIds)) return [];

    return categoryIds.reduce(function (papers, categoryId) {
      var paper = paperCategories[String(categoryId)];
      if (paper && papers.indexOf(paper) === -1) papers.push(paper);
      return papers;
    }, []);
  }

  function isAllowed(term, selectedPapers) {
    if (!term || selectedPapers.length === 0) return true;
    return term.papers.some(function (paper) {
      return selectedPapers.indexOf(paper) !== -1;
    });
  }

  function getCheckboxLabel(input) {
    var inputId = String(input.id || '');
    var label = inputId ? document.querySelector('label[for="' + inputId.replace(/"/g, '\\"') + '"]') : null;
    return label ? String(label.textContent || '').trim() : '';
  }

  function buildCheckboxTermMap(panel) {
    var groups = {};
    var checkboxTermMap = new Map();
    var editor = getEditorSelect();
    var selectedTerms = editor && typeof editor.getEditedPostAttribute === 'function'
      ? editor.getEditedPostAttribute(taxonomyRestBase)
      : [];
    selectedTerms = Array.isArray(selectedTerms) ? selectedTerms.map(Number) : [];

    panel.querySelectorAll('input[type="checkbox"]').forEach(function (input) {
      var name = getCheckboxLabel(input);
      if (!name || !termsByName[name]) return;
      if (!groups[name]) groups[name] = [];
      groups[name].push(input);
    });

    Object.keys(groups).forEach(function (name) {
      var inputs = groups[name];
      var candidates = termsByName[name].slice();
      var usedIds = {};

      // Gutenberg does not expose a term ID in the checkbox markup. Match any
      // checked controls to the editor's selected term IDs first, then map the
      // remaining same-name controls in stable term-ID order.
      inputs.forEach(function (input) {
        if (!input.checked) return;

        var selectedCandidate = candidates.find(function (term) {
          return !usedIds[term.id] && selectedTerms.indexOf(term.id) !== -1;
        });

        if (selectedCandidate) {
          checkboxTermMap.set(input, selectedCandidate);
          usedIds[selectedCandidate.id] = true;
        }
      });

      inputs.forEach(function (input) {
        if (checkboxTermMap.has(input)) return;

        var candidate = candidates.find(function (term) {
          return !usedIds[term.id];
        });

        if (candidate) {
          checkboxTermMap.set(input, candidate);
          usedIds[candidate.id] = true;
        }
      });
    });

    return checkboxTermMap;
  }

  function findArticleTypePanel() {
    var toggles = document.querySelectorAll('.components-panel__body-toggle');
    for (var index = 0; index < toggles.length; index += 1) {
      var title = String(toggles[index].textContent || '').trim();
      if (title === taxonomyLabel) {
        return toggles[index].closest('.components-panel__body');
      }
    }
    return null;
  }

  function filterPanel(selectedPapers) {
    var panel = findArticleTypePanel();
    if (!panel) return;

    var checkboxTermMap = buildCheckboxTermMap(panel);
    var checkboxes = panel.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(function (input) {
      var term = checkboxTermMap.get(input);
      if (!term) return;

      var choice = input.closest(
        '.editor-post-taxonomies__hierarchical-terms-choice, .components-checkbox-control'
      );
      if (!choice) return;

      var shouldHide = !isAllowed(term, selectedPapers);
      if (choice.hidden !== shouldHide) choice.hidden = shouldHide;
    });
  }

  function removeIncompatibleSelections(selectedPapers) {
    if (selectedPapers.length === 0 || !taxonomyRestBase) return;

    var editor = getEditorSelect();
    if (!editor || typeof editor.getEditedPostAttribute !== 'function') return;

    var selectedTerms = editor.getEditedPostAttribute(taxonomyRestBase);
    if (!Array.isArray(selectedTerms)) return;

    var allowedTerms = selectedTerms.filter(function (termId) {
      return isAllowed(termById[Number(termId)], selectedPapers);
    });

    if (allowedTerms.length === selectedTerms.length) return;

    var changes = {};
    changes[taxonomyRestBase] = allowedTerms;
    wp.data.dispatch('core/editor').editPost(changes);
  }

  function applyFilter() {
    scheduled = false;
    var selectedPapers = getSelectedPapers();
    var selectionKey = selectedPapers.slice().sort().join('|');

    filterPanel(selectedPapers);
    if (selectionKey !== lastSelectionKey) {
      lastSelectionKey = selectionKey;
      removeIncompatibleSelections(selectedPapers);
    }
  }

  function scheduleFilter() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(applyFilter);
  }

  wp.domReady(function () {
    scheduleFilter();
    wp.data.subscribe(scheduleFilter);

    var observer = new MutationObserver(scheduleFilter);
    observer.observe(document.body, { childList: true, subtree: true });
  });
})(window.wp, document);
