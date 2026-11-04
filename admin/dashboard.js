/**
 * Sibaq '26 Admin Dashboard Script
 * Manages sidebar tab navigation (Data, Category, Overview, etc.), search filtering, and logout.
 */

document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logoutBtn');
  const addRecordBtn = document.getElementById('addRecordBtn');
  const searchInput = document.getElementById('searchInput');
  const toastNotice = document.getElementById('toastNotice');
  const breadcrumbParent = document.getElementById('breadcrumbParent');
  const breadcrumbParentSep = document.getElementById('breadcrumbParentSep');
  const breadcrumbLabel = document.getElementById('breadcrumbLabel');
  const panelHeading = document.getElementById('panelHeading');
  const panelSubtitle = document.getElementById('panelSubtitle');
  const dataTableBody = document.getElementById('dataTableBody');
  const navLinks = document.querySelectorAll('.nav-link');
  const filterBtns = document.querySelectorAll('#programsView .filter-btn');

  const urlParams = new URLSearchParams(window.location.search);

  function computeShareSignature(mode, programName, category) {
    const raw = `sibaq26_lock::${String(mode || '').trim().toLowerCase()}::${String(programName || '').trim().toLowerCase()}::${String(category || 'General').trim().toLowerCase()}`;
    let h1 = 0x811c9dc5;
    for (let i = 0; i < raw.length; i++) {
      h1 ^= raw.charCodeAt(i);
      h1 = Math.imul(h1, 0x01000193) >>> 0;
    }
    return h1.toString(36);
  }

  // Enforce strict Shared-Link-Only isolation & Admin Auth Guard
  const rawTabLock = sessionStorage.getItem('sibaq_shared_link_lock');
  let activeTabShareLock = null;
  if (rawTabLock) {
    try {
      activeTabShareLock = JSON.parse(rawTabLock);
    } catch (e) {
      activeTabShareLock = null;
    }
  }

  const reqShareMode =
    urlParams.get('shareExam') === '1'
      ? 'exam'
      : urlParams.get('shareValuation') === '1'
      ? 'valuation'
      : '';
  const reqShareProg = (urlParams.get('program') || '').trim();
  const reqShareCat = (urlParams.get('category') || 'General').trim();
  const reqShareSig = (urlParams.get('sig') || '').trim();

  // If this tab is already locked to a shared link, block any attempt to visit dashboard.html without params or switch program/mode
  if (activeTabShareLock && activeTabShareLock.lockedUrl) {
    const isSameLockTarget =
      reqShareMode === activeTabShareLock.mode &&
      reqShareProg.toLowerCase() === String(activeTabShareLock.program || '').toLowerCase() &&
      reqShareCat.toLowerCase() === String(activeTabShareLock.category || 'General').toLowerCase();

    if (!isSameLockTarget) {
      window.location.replace(activeTabShareLock.lockedUrl);
      return;
    }
  }

  // Verify signature if provided on shared link
  if (reqShareMode && reqShareProg) {
    const expectedSig = computeShareSignature(reqShareMode, reqShareProg, reqShareCat);
    if (reqShareSig && reqShareSig !== expectedSig) {
      if (activeTabShareLock && activeTabShareLock.lockedUrl) {
        window.location.replace(activeTabShareLock.lockedUrl);
        return;
      }
      document.body.innerHTML = `
        <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f8fafc;font-family:'Plus Jakarta Sans',sans-serif;">
          <div style="max-width:440px;width:100%;background:#fff;border:1px solid rgba(220,38,38,0.25);border-radius:16px;padding:32px 28px;text-align:center;box-shadow:0 16px 40px rgba(15,23,42,0.08);">
            <div style="width:48px;height:48px;border-radius:12px;background:rgba(220,38,38,0.1);color:#dc2626;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-weight:800;font-size:1.25rem;">!</div>
            <h1 style="font-size:1.15rem;font-weight:700;color:#0f172a;margin:0 0 8px;">Restricted Shared Link</h1>
            <p style="font-size:0.85rem;color:#64748b;line-height:1.55;margin:0;">This shared link is restricted to its original program only and cannot be modified to access other pages.</p>
          </div>
        </div>
      `;
      return;
    }

    // Canonicalize URL with signature and lock this tab/browser to ONLY this shared link
    const canonicalParams = new URLSearchParams();
    if (reqShareMode === 'exam') canonicalParams.set('shareExam', '1');
    else canonicalParams.set('shareValuation', '1');
    canonicalParams.set('program', reqShareProg);
    canonicalParams.set('category', reqShareCat);
    canonicalParams.set('sig', expectedSig);
    const canonicalLockedUrl = `${window.location.origin}${window.location.pathname}?${canonicalParams.toString()}`;

    const lockPayload = {
      mode: reqShareMode,
      program: reqShareProg,
      category: reqShareCat,
      sig: expectedSig,
      lockedUrl: canonicalLockedUrl
    };
    sessionStorage.setItem('sibaq_shared_link_lock', JSON.stringify(lockPayload));
    localStorage.setItem('sibaq_shared_link_lock', JSON.stringify(lockPayload));
    sessionStorage.removeItem('sibaq_auth');
  } else {
    // Not a shared link URL: require full Admin Authentication, or redirect back to active shared link lock
    const hasAdminAuth = Boolean(sessionStorage.getItem('sibaq_auth'));
    if (!hasAdminAuth) {
      const savedLocalLock = localStorage.getItem('sibaq_shared_link_lock');
      if (savedLocalLock) {
        try {
          const parsedLock = JSON.parse(savedLocalLock);
          if (parsedLock && parsedLock.lockedUrl) {
            window.location.replace(parsedLock.lockedUrl);
            return;
          }
        } catch (e) {}
      }
      window.location.replace('index.html');
      return;
    }
  }

  const isSharedExamStandaloneMode =
    urlParams.get('shareExam') === '1' && Boolean(urlParams.get('program'));
  const isSharedValuationStandaloneMode =
    urlParams.get('shareValuation') === '1' && Boolean(urlParams.get('program'));
  if (isSharedExamStandaloneMode) {
    document.body.classList.add('shared-exam-builder-mode');
  } else if (isSharedValuationStandaloneMode) {
    document.body.classList.add('shared-valuation-mode');
  }

  // Tab configurations
  const tabConfigs = {
    'Data': {
      title: 'Data Panel',
      subtitle: 'Manage festival programs, categories, and registered candidates',
      breadcrumb: 'Data'
    },
    'Question': {
      title: 'Question',
      subtitle: 'View created festival programs with their category and set exam questions',
      breadcrumb: 'Question'
    },
    'Overview': {
      title: 'Festival Overview',
      subtitle: 'High-level metrics, active stage calls, and festival progress',
      breadcrumb: 'Overview'
    },
    'Valuation': {
      title: 'Valuation',
      subtitle: 'Review students\' submitted exams and perform valuation for each program',
      breadcrumb: 'Valuation'
    },
    'Settings': {
      title: 'Settings',
      subtitle: 'Configure exam From & To timer schedules for multiple festival programs',
      breadcrumb: 'Settings'
    }
  };

  // Toast Helper
  function showToast(message, duration = 2400) {
    if (!toastNotice) return;
    toastNotice.textContent = message;
    toastNotice.style.display = 'block';

    setTimeout(() => {
      toastNotice.style.display = 'none';
    }, duration);
  }

  function hideAllMainSubviews() {
    const viewIds = [
      'programsView',
      'candidatesView',
      'questionView',
      'setExamPageView',
      'valuationView',
      'valuationSheetView',
      'settingsView'
    ];
    viewIds.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.classList.remove('active');
        el.style.display = 'none';
      }
    });
  }

  // Sidebar Tab Switching
  navLinks.forEach((link) => {
    link.addEventListener('click', () => {
      if (link.id === 'dataNavBtn' || link.getAttribute('data-tab') === 'Data') {
        const dataGroup = document.getElementById('dataNavGroup');
        const candSub = document.getElementById('submenuCandidates');
        if (dataGroup) {
          if (link.classList.contains('active')) {
            dataGroup.classList.toggle('open');
          } else {
            dataGroup.classList.add('open');
            const isCandidates = candSub && candSub.classList.contains('active');
            switchDataSubpage(isCandidates ? 'candidates' : 'programs');
          }
        }
        return;
      }

      navLinks.forEach((l) => l.classList.remove('active'));
      link.classList.add('active');

      hideAllMainSubviews();

      const tabName = link.getAttribute('data-tab');
      const conf = tabConfigs[tabName] || {
        title: `${tabName} Panel`,
        subtitle: `Manage ${tabName.toLowerCase()} settings and records`,
        breadcrumb: tabName
      };

      if (breadcrumbParent) breadcrumbParent.style.display = 'none';
      if (breadcrumbParentSep) breadcrumbParentSep.style.display = 'none';
      if (breadcrumbLabel) breadcrumbLabel.textContent = conf.breadcrumb;

      if (tabName === 'Question') {
        const questV = document.getElementById('questionView');
        if (questV) {
          questV.classList.add('active');
          questV.style.display = 'flex';
        }
        loadAndRenderQuestionTable();
        showToast('Viewing Question & Exam Setup');
        return;
      }

      if (tabName === 'Valuation') {
        const valV = document.getElementById('valuationView');
        if (valV) {
          valV.classList.add('active');
          valV.style.display = 'flex';
        }
        loadAndRenderValuationTable();
        showToast('Viewing Students Submitted Exams & Valuation');
        return;
      }

      if (tabName === 'Settings') {
        const setV = document.getElementById('settingsView');
        if (setV) {
          setV.classList.add('active');
          setV.style.display = 'flex';
        }
        loadAndRenderScheduledPrograms();
        showToast('Viewing Program Timer Settings');
        return;
      }

      // Overview fallback shows Programs view with Overview header
      const progV = document.getElementById('programsView');
      if (progV) {
        progV.classList.add('active');
        progV.style.display = 'flex';
      }
      if (panelHeading) panelHeading.textContent = conf.title;
      if (panelSubtitle) panelSubtitle.textContent = conf.subtitle;

      showToast(`Switched to ${tabName} view`);
    });
  });

  // Search Input Filtering
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      applyCurrentFilters();
    });
  }

  // Category Filtering
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      applyCurrentFilters();
    });
  });

  // Modal Elements
  const addRecordModal = document.getElementById('addRecordModal');
  const modalBackBtn = document.getElementById('modalBackBtn');
  const modalCloseX = document.getElementById('modalCloseX');
  const modalCancelBtn = document.getElementById('modalCancelBtn');
  const addRecordForm = document.getElementById('addRecordForm');
  const categoryRadioGroup = document.getElementById('categoryRadioGroup');
  const categoryRadios = document.querySelectorAll('input[name="recordCategory"]');
  const recordCategoryError = document.getElementById('recordCategoryError');
  const programsList = document.getElementById('programsList');
  const addAnotherProgramBtn = document.getElementById('addAnotherProgramBtn');
  const submitRecordBtn = document.getElementById('submitRecordBtn');
  const modalTitleEl = document.getElementById('modalTitle');

  let editingRecordId = null;

  // Modal Open & Close Helpers
  function openAddRecordModal() {
    if (!addRecordModal) return;
    resetModalForm();
    addRecordModal.classList.add('open');
    addRecordModal.setAttribute('aria-hidden', 'false');
  }

  function openEditRecordModal(rec) {
    if (!addRecordModal || !rec) return;
    resetModalForm();
    editingRecordId = rec.id;

    if (modalTitleEl) modalTitleEl.textContent = `Edit Record (${rec.id})`;
    if (addAnotherProgramBtn) addAnotherProgramBtn.style.display = 'none';
    if (submitRecordBtn) {
      const btnText = submitRecordBtn.querySelector('.btn-text');
      if (btnText) btnText.textContent = 'Save Changes';
    }

    // Pre-select Category radio
    if (rec.category) {
      categoryRadios.forEach((radio) => {
        radio.checked = radio.value.toLowerCase() === String(rec.category).trim().toLowerCase();
      });
    }

    // Populate first program card with program name and candidate chip
    const firstCard = programsList ? programsList.querySelector('.program-entry-card') : null;
    if (firstCard) {
      const nameInput = firstCard.querySelector('.program-name-input');
      if (nameInput) nameInput.value = rec.programName || '';

      const chipsList = firstCard.querySelector('.selected-students-list');
      const isZeroCand =
        !rec.candidate ||
        rec.candidate === '0 Candidate' ||
        rec.candidate.toLowerCase().includes('0 candidate') ||
        rec.candidate.toLowerCase().includes('unassigned');

      if (!isZeroCand && chipsList) {
        const rawCand = String(rec.candidate || '').trim();
        const match = rawCand.match(/^(.*?)\s*\(#([^)]+)\)\s*$/);
        const parsedName = match ? match[1].trim() : rawCand;
        const parsedChest = String(rec.chestNo || (match ? match[2] : '')).replace(/^#/, '').trim();
        if (parsedName) {
          addStudentChip(chipsList, { chestNo: parsedChest, name: parsedName });
        }
      }
    }

    addRecordModal.classList.add('open');
    addRecordModal.setAttribute('aria-hidden', 'false');
  }

  function closeAddRecordModal() {
    if (!addRecordModal) return;
    addRecordModal.classList.remove('open');
    addRecordModal.setAttribute('aria-hidden', 'true');
    resetModalForm();
  }

  function resetModalForm() {
    editingRecordId = null;
    if (addRecordForm) addRecordForm.reset();
    if (modalTitleEl) modalTitleEl.textContent = 'Add Record';
    if (addAnotherProgramBtn) addAnotherProgramBtn.style.display = '';
    if (submitRecordBtn) {
      const btnText = submitRecordBtn.querySelector('.btn-text');
      if (btnText) btnText.textContent = 'Submit';
    }
    if (recordCategoryError) recordCategoryError.textContent = '';
    if (categoryRadioGroup) categoryRadioGroup.classList.remove('error');
    if (programsList) {
      programsList.innerHTML = '';
      programsList.appendChild(createProgramCard(0));
    }
  }

  // Helper to renumber program cards
  function updateProgramNumbers() {
    if (!programsList) return;
    const cards = programsList.querySelectorAll('.program-entry-card');
    cards.forEach((card, idx) => {
      card.setAttribute('data-program-index', idx);
      const numSpan = card.querySelector('.program-badge-num');
      const labelSpan = card.querySelector('.program-badge-label');
      const removeBtn = card.querySelector('.remove-program-btn');
      if (numSpan) numSpan.textContent = idx + 1;
      if (labelSpan) labelSpan.textContent = `Program #${idx + 1}`;
      if (removeBtn) {
        removeBtn.style.display = cards.length > 1 ? 'inline-flex' : 'none';
      }
    });
  }

  // Create a program card element
  function createProgramCard(index = 0) {
    const card = document.createElement('div');
    card.className = 'program-entry-card';
    card.setAttribute('data-program-index', index);
    card.innerHTML = `
      <div class="program-card-top">
        <div class="program-badge-title">
          <span class="program-badge-num">${index + 1}</span>
          <span class="program-badge-label">Program #${index + 1}</span>
        </div>
        <button type="button" class="remove-program-btn" title="Remove this program" ${index === 0 ? 'style="display:none;"' : ''}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
          <span>Remove</span>
        </button>
      </div>

      <div class="program-field-group">
        <div class="input-wrapper">
          <svg class="input-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 20h9"></path>
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
          </svg>
          <input 
            type="text" 
            class="program-name-input" 
            placeholder="Program Name (e.g. Arabic Calligraphy - Thuluth)" 
            required 
          />
        </div>
        <span class="field-error program-name-error"></span>
      </div>

      <div class="program-students-box">
        <div class="students-box-header">
          <span class="students-box-label">Candidates / Students:</span>
          <span class="students-box-hint">Search from registered students or type candidate</span>
        </div>
        <div class="selected-students-list"></div>
        <div class="student-search-control">
          <div class="input-wrapper student-search-input-wrap">
            <svg class="input-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <input 
              type="text" 
              class="student-search-input" 
              placeholder="Search student by name or chest no (or type name)..." 
              autocomplete="off" 
            />
          </div>
          <div class="student-suggestions-dropdown" style="display: none;"></div>
        </div>
      </div>
    `;

    setupProgramCardListeners(card);
    return card;
  }

  // Setup interactive listeners for a program card
  function setupProgramCardListeners(card) {
    const nameInput = card.querySelector('.program-name-input');
    const nameError = card.querySelector('.program-name-error');
    const searchInput = card.querySelector('.student-search-input');
    const dropdown = card.querySelector('.student-suggestions-dropdown');
    const chipsList = card.querySelector('.selected-students-list');
    const removeBtn = card.querySelector('.remove-program-btn');

    if (nameInput) {
      nameInput.addEventListener('input', () => {
        nameInput.classList.remove('error');
        if (nameError) nameError.textContent = '';
      });
    }

    if (removeBtn) {
      removeBtn.addEventListener('click', () => {
        if (programsList && programsList.querySelectorAll('.program-entry-card').length > 1) {
          card.remove();
          updateProgramNumbers();
        }
      });
    }

    // Student search and dropdown
    if (searchInput && dropdown && chipsList) {
      const showSuggestions = async () => {
        const query = searchInput.value.trim().toLowerCase();
        let students = [];
        try {
          students = await getAllStudentsFromDB();
        } catch (e) {
          students = [];
        }

        const selectedCategory = document.querySelector('input[name="recordCategory"]:checked')?.value || '';
        const existingChests = Array.from(chipsList.querySelectorAll('.student-chip')).map(c => c.getAttribute('data-chest'));

        let filtered = students.filter(s => !existingChests.includes(String(s.chestNo)));
        if (query) {
          filtered = filtered.filter(s => 
            String(s.chestNo).toLowerCase().includes(query) ||
            s.name.toLowerCase().includes(query) ||
            (s.category && s.category.toLowerCase().includes(query))
          );
        } else if (selectedCategory) {
          filtered.sort((a, b) => (a.category === selectedCategory ? -1 : 1));
        }

        dropdown.innerHTML = '';

        if (filtered.length > 0) {
          filtered.slice(0, 6).forEach(std => {
            const item = document.createElement('div');
            item.className = 'student-suggestion-item';
            item.innerHTML = `
              <div class="sugg-info">
                <span class="sugg-name">${escapeHtml(std.name)}</span>
                <span class="sugg-meta">Chest #${escapeHtml(std.chestNo)} • <span class="sugg-cat">${escapeHtml(std.category || 'General')}</span></span>
              </div>
              <button type="button" class="sugg-add-btn">+ Add</button>
            `;
            item.addEventListener('click', () => {
              addStudentChip(chipsList, { chestNo: std.chestNo, name: std.name });
              searchInput.value = '';
              dropdown.style.display = 'none';
            });
            dropdown.appendChild(item);
          });
        }

        // Custom name addition
        if (query.length > 0) {
          const customItem = document.createElement('div');
          customItem.className = 'custom-candidate-item';
          customItem.innerHTML = `<span>+ Add "<strong>${escapeHtml(searchInput.value.trim())}</strong>" as candidate</span>`;
          customItem.addEventListener('click', () => {
            addStudentChip(chipsList, { chestNo: '', name: searchInput.value.trim() });
            searchInput.value = '';
            dropdown.style.display = 'none';
          });
          dropdown.appendChild(customItem);
        }

        if (filtered.length === 0 && !query) {
          dropdown.innerHTML = `<div style="padding: 10px 12px; font-size: 0.75rem; color: var(--text-dim); text-align: center;">No registered students found.<br/>Register students in "Enter Students" below.</div>`;
        }

        dropdown.style.display = 'flex';
      };

      searchInput.addEventListener('focus', showSuggestions);
      searchInput.addEventListener('input', showSuggestions);

      // Add on Enter key
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const val = searchInput.value.trim();
          if (val) {
            addStudentChip(chipsList, { chestNo: '', name: val });
            searchInput.value = '';
            dropdown.style.display = 'none';
          }
        }
      });

      // Remove chip handler
      chipsList.addEventListener('click', (e) => {
        const delBtn = e.target.closest('.chip-del');
        if (delBtn) {
          const chip = delBtn.closest('.student-chip');
          if (chip) chip.remove();
        }
      });
    }
  }

  // Add a student chip to the list
  function addStudentChip(listEl, student) {
    const exists = Array.from(listEl.querySelectorAll('.student-chip')).some(c => 
      c.getAttribute('data-name').toLowerCase() === student.name.toLowerCase()
    );
    if (exists) return;

    const chip = document.createElement('span');
    chip.className = 'student-chip';
    chip.setAttribute('data-chest', student.chestNo || '');
    chip.setAttribute('data-name', student.name);
    chip.innerHTML = `
      ${student.chestNo ? `<span class="chip-chest">#${escapeHtml(student.chestNo)}</span>` : ''}
      <span class="chip-name">${escapeHtml(student.name)}</span>
      <button type="button" class="chip-del" title="Remove">&times;</button>
    `;
    listEl.appendChild(chip);
  }

  // Global click to close suggestion dropdowns
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.student-search-control')) {
      document.querySelectorAll('.student-suggestions-dropdown').forEach(d => {
        d.style.display = 'none';
      });
    }
  });

  // + Add Another Program Button Click
  if (addAnotherProgramBtn && programsList) {
    addAnotherProgramBtn.addEventListener('click', () => {
      const currentCount = programsList.querySelectorAll('.program-entry-card').length;
      const newCard = createProgramCard(currentCount);
      programsList.appendChild(newCard);
      updateProgramNumbers();
      const input = newCard.querySelector('.program-name-input');
      if (input) input.focus();
    });
  }

  // Open modal on Add Record button click
  if (addRecordBtn) {
    addRecordBtn.addEventListener('click', openAddRecordModal);
  }

  // Back button in popup
  if (modalBackBtn) {
    modalBackBtn.addEventListener('click', () => {
      closeAddRecordModal();
      showToast('Returned to Data table');
    });
  }

  // Close X and Cancel buttons
  if (modalCloseX) {
    modalCloseX.addEventListener('click', closeAddRecordModal);
  }
  if (modalCancelBtn) {
    modalCancelBtn.addEventListener('click', closeAddRecordModal);
  }

  // Close on backdrop overlay click
  if (addRecordModal) {
    addRecordModal.addEventListener('click', (e) => {
      if (e.target === addRecordModal) {
        closeAddRecordModal();
      }
    });
  }

  // Close on Escape key press
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && addRecordModal && addRecordModal.classList.contains('open')) {
      closeAddRecordModal();
    }
  });

  // Clear category radio error on change
  categoryRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (categoryRadioGroup) categoryRadioGroup.classList.remove('error');
      if (recordCategoryError) recordCategoryError.textContent = '';
    });
  });

  // ==========================================================================
  // Firebase Cloud Firestore & Auth Data Layer (with Anonymous Sign-In)
  // ==========================================================================
  const STORE_NAME = 'records';
  const STUDENTS_STORE = 'students';
  const DB_NAME = 'SibaqRecordsDB';
  const DB_VERSION = 2;

  // Helper: check if Firebase Firestore is ready
  function getFirebaseDB() {
    return (window.SibaqFirebase && window.SibaqFirebase.db) ? window.SibaqFirebase.db : null;
  }

  // Realtime subscription setup
  let realtimeUnsubRecords = null;
  let realtimeUnsubStudents = null;

  function subscribeRealtimeUpdates() {
    if (!window.SibaqFirebase?.db || !window.SibaqFirebase?.onSnapshot) return;
    const { collection, onSnapshot } = window.SibaqFirebase;
    const fdb = window.SibaqFirebase.db;

    try {
      if (realtimeUnsubRecords) realtimeUnsubRecords();
      realtimeUnsubRecords = onSnapshot(collection(fdb, STORE_NAME), () => {
        if (isSharedExamStandaloneMode) return;
        if (isSharedValuationStandaloneMode) {
          if (!activeValuationSubmission && typeof loadAndRenderValuationTable === 'function') {
            loadAndRenderValuationTable();
          }
          return;
        }
        loadAndRenderTable();
        loadAndRenderQuestionTable();
        if (typeof loadAndRenderValuationTable === 'function') loadAndRenderValuationTable();
        if (typeof loadAndRenderScheduledPrograms === 'function') loadAndRenderScheduledPrograms();
      }, (err) => {
        console.warn('Realtime records listener notice:', err);
      });
    } catch (e) {
      console.warn('Could not bind realtime records listener:', e);
    }

    try {
      if (realtimeUnsubStudents) realtimeUnsubStudents();
      realtimeUnsubStudents = onSnapshot(collection(fdb, STUDENTS_STORE), () => {
        if (isSharedExamStandaloneMode || isSharedValuationStandaloneMode) return;
        loadAndRenderStudentsTable();
      }, (err) => {
        console.warn('Realtime students listener notice:', err);
      });
    } catch (e) {
      console.warn('Could not bind realtime students listener:', e);
    }
  }

  // Open / upgrade local fallback IndexedDB database
  function openIndexedDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB not supported'));
        return;
      }
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('category', 'category', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains(STUDENTS_STORE)) {
          const studentStore = db.createObjectStore(STUDENTS_STORE, { keyPath: 'chestNo' });
          studentStore.createIndex('category', 'category', { unique: false });
          studentStore.createIndex('name', 'name', { unique: false });
          studentStore.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // Local fallback methods
  function getAllRecordsFromIndexedDB() {
    return openIndexedDB().then((db) => {
      return new Promise((resolve) => {
        const tx = db.transaction([STORE_NAME], 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    }).catch(() => []);
  }

  function saveRecordToIndexedDB(record) {
    return openIndexedDB().then((db) => {
      return new Promise((resolve) => {
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(record);
        tx.oncomplete = () => resolve(record);
        tx.onerror = () => resolve(record);
      });
    }).catch(() => record);
  }

  function deleteRecordFromIndexedDB(id) {
    return openIndexedDB().then((db) => {
      return new Promise((resolve) => {
        const tx = db.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }).catch(() => {});
  }

  function getAllStudentsFromIndexedDB() {
    return openIndexedDB().then((db) => {
      return new Promise((resolve) => {
        const tx = db.transaction([STUDENTS_STORE], 'readonly');
        const store = tx.objectStore(STUDENTS_STORE);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => resolve([]);
      });
    }).catch(() => []);
  }

  function saveStudentToIndexedDB(student) {
    return openIndexedDB().then((db) => {
      return new Promise((resolve) => {
        const tx = db.transaction([STUDENTS_STORE], 'readwrite');
        const store = tx.objectStore(STUDENTS_STORE);
        store.put(student);
        tx.oncomplete = () => resolve(student);
        tx.onerror = () => resolve(student);
      });
    }).catch(() => student);
  }

  function deleteStudentFromIndexedDB(chestNo) {
    return openIndexedDB().then((db) => {
      return new Promise((resolve) => {
        const tx = db.transaction([STUDENTS_STORE], 'readwrite');
        const store = tx.objectStore(STUDENTS_STORE);
        store.delete(chestNo);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }).catch(() => {});
  }

  // Retrieve all records from Firebase Firestore (with fallback)
  async function getAllRecordsFromDB() {
    const fdb = getFirebaseDB();
    if (fdb) {
      try {
        const { collection, getDocs } = window.SibaqFirebase;
        const snap = await getDocs(collection(fdb, STORE_NAME));
        const list = [];
        snap.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });
        list.forEach(r => saveRecordToIndexedDB(r).catch(() => {}));
        return list;
      } catch (err) {
        console.warn('Firestore fetch records note (using local cache):', err);
      }
    }
    return getAllRecordsFromIndexedDB();
  }

  // Save (insert or update) record in Firebase Firestore
  async function saveRecordToDB(record) {
    const fdb = getFirebaseDB();
    saveRecordToIndexedDB(record).catch(() => {});

    if (fdb) {
      try {
        const { doc, setDoc } = window.SibaqFirebase;
        const docRef = doc(fdb, STORE_NAME, String(record.id));
        await setDoc(docRef, record, { merge: true });
        return record;
      } catch (err) {
        console.warn('Firestore save record note (stored locally):', err);
      }
    }
    return record;
  }

  // Delete record from Firebase Firestore by ID
  async function deleteRecordFromDB(id) {
    const fdb = getFirebaseDB();
    deleteRecordFromIndexedDB(id).catch(() => {});

    if (fdb) {
      try {
        const { doc, deleteDoc } = window.SibaqFirebase;
        const docRef = doc(fdb, STORE_NAME, String(id));
        await deleteDoc(docRef);
        return;
      } catch (err) {
        console.warn('Firestore delete record note (deleted locally):', err);
      }
    }
  }

  // Retrieve all registered students from Firebase Firestore
  async function getAllStudentsFromDB() {
    const fdb = getFirebaseDB();
    if (fdb) {
      try {
        const { collection, getDocs } = window.SibaqFirebase;
        const snap = await getDocs(collection(fdb, STUDENTS_STORE));
        const list = [];
        snap.forEach((docSnap) => {
          list.push({ ...docSnap.data(), chestNo: docSnap.data().chestNo || docSnap.id });
        });
        list.forEach(s => saveStudentToIndexedDB(s).catch(() => {}));
        return list;
      } catch (err) {
        console.warn('Firestore fetch students note (using local cache):', err);
      }
    }
    return getAllStudentsFromIndexedDB();
  }

  // Save student to Firebase Firestore
  async function saveStudentToDB(student) {
    const fdb = getFirebaseDB();
    saveStudentToIndexedDB(student).catch(() => {});

    if (fdb) {
      try {
        const { doc, setDoc } = window.SibaqFirebase;
        const docRef = doc(fdb, STUDENTS_STORE, String(student.chestNo));
        await setDoc(docRef, student, { merge: true });
        return student;
      } catch (err) {
        console.warn('Firestore save student note (stored locally):', err);
      }
    }
    return student;
  }

  // Delete student from Firebase Firestore by chestNo
  async function deleteStudentFromDB(chestNo) {
    const fdb = getFirebaseDB();
    deleteStudentFromIndexedDB(chestNo).catch(() => {});

    if (fdb) {
      try {
        const { doc, deleteDoc } = window.SibaqFirebase;
        const docRef = doc(fdb, STUDENTS_STORE, String(chestNo));
        await deleteDoc(docRef);
        return;
      } catch (err) {
        console.warn('Firestore delete student note (deleted locally):', err);
      }
    }
  }

  // Initialize DB and load tables (starts empty, connects to Firebase Cloud Firestore)
  async function initDatabase() {
    try {
      if (isSharedExamStandaloneMode) {
        await activateSharedExamBuilderFromUrl();
      } else if (isSharedValuationStandaloneMode) {
        await activateSharedValuationFromUrl();
      }
      subscribeRealtimeUpdates();
      if (!isSharedExamStandaloneMode && !isSharedValuationStandaloneMode) {
        await loadAndRenderTable();
        await loadAndRenderStudentsTable();
        await loadAndRenderQuestionTable();
        if (typeof loadAndRenderValuationTable === 'function') await loadAndRenderValuationTable();
        if (typeof loadAndRenderScheduledPrograms === 'function') await loadAndRenderScheduledPrograms();
      }
    } catch (err) {
      console.warn('Database initialization note:', err);
    }
  }

  // Re-subscribe and refresh when Firebase auth is confirmed
  window.addEventListener('firebase-auth-ready', () => {
    subscribeRealtimeUpdates();
    if (isSharedExamStandaloneMode) {
      activateSharedExamBuilderFromUrl();
      return;
    }
    if (isSharedValuationStandaloneMode) {
      activateSharedValuationFromUrl();
      return;
    }
    loadAndRenderTable();
    loadAndRenderStudentsTable();
    loadAndRenderQuestionTable();
    if (typeof loadAndRenderValuationTable === 'function') loadAndRenderValuationTable();
    if (typeof loadAndRenderScheduledPrograms === 'function') loadAndRenderScheduledPrograms();
  });

  // Sidebar Submenu & Subpage View Navigation (All Programs & Candidates)
  const programsView = document.getElementById('programsView');
  const candidatesView = document.getElementById('candidatesView');
  const questionView = document.getElementById('questionView');
  const setExamPageView = document.getElementById('setExamPageView');
  const submenuAllPrograms = document.getElementById('submenuAllPrograms');
  const submenuCandidates = document.getElementById('submenuCandidates');
  const dataNavGroup = document.getElementById('dataNavGroup');
  const dataNavBtn = document.getElementById('dataNavBtn');

  function switchDataSubpage(subpage) {
    hideAllMainSubviews();
    if (breadcrumbParent) breadcrumbParent.style.display = '';
    if (breadcrumbParentSep) breadcrumbParentSep.style.display = '';

    if (subpage === 'candidates') {
      if (candidatesView) {
        candidatesView.classList.add('active');
        candidatesView.style.display = 'flex';
      }
      if (submenuCandidates) submenuCandidates.classList.add('active');
      if (submenuAllPrograms) submenuAllPrograms.classList.remove('active');
      if (breadcrumbLabel) breadcrumbLabel.textContent = 'Candidates';
      loadAndRenderStudentsTable();
      showToast('Viewing Candidates');
    } else {
      // Default to 'programs'
      if (programsView) {
        programsView.classList.add('active');
        programsView.style.display = 'flex';
      }
      if (submenuAllPrograms) submenuAllPrograms.classList.add('active');
      if (submenuCandidates) submenuCandidates.classList.remove('active');
      if (breadcrumbLabel) breadcrumbLabel.textContent = 'All Programs';
      if (panelHeading) panelHeading.textContent = 'All Programs';
      if (panelSubtitle) panelSubtitle.textContent = 'Manage festival programs, categories, and registered candidates';
      loadAndRenderTable();
      showToast('Viewing All Programs');
    }

    if (dataNavGroup) dataNavGroup.classList.add('open');
    if (dataNavBtn) {
      document.querySelectorAll('.sidebar-menu .nav-link').forEach((l) => l.classList.remove('active'));
      dataNavBtn.classList.add('active');
    }
  }

  if (submenuAllPrograms) {
    submenuAllPrograms.addEventListener('click', (e) => {
      e.stopPropagation();
      switchDataSubpage('programs');
    });
  }

  if (submenuCandidates) {
    submenuCandidates.addEventListener('click', (e) => {
      e.stopPropagation();
      switchDataSubpage('candidates');
    });
  }

  // Render rows from IndexedDB into table
  async function loadAndRenderTable() {
    try {
      const records = await getAllRecordsFromDB();
      // Sort newest first
      records.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      if (!dataTableBody) return;
      dataTableBody.innerHTML = '';

      if (records.length === 0) {
        dataTableBody.innerHTML = `
          <tr class="empty-state-row">
            <td colspan="5" style="text-align: center; padding: 48px 20px; color: var(--text-muted);">
              <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" style="color: var(--text-dim);">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="12" y1="18" x2="12" y2="12"></line>
                  <line x1="9" y1="15" x2="15" y2="15"></line>
                </svg>
                <span style="font-weight: 600; font-size: 0.9rem; color: var(--text-main);">No records yet</span>
                <span style="font-size: 0.8rem;">Click "+ Add Record" above to add your first festival entry</span>
              </div>
            </td>
          </tr>
        `;
        return;
      }

      records.forEach((rec) => {
        const row = createRowElement(rec);
        dataTableBody.appendChild(row);
      });

      // Reapply active filters
      applyCurrentFilters();
    } catch (err) {
      console.error('Error rendering from IndexedDB:', err);
    }
  }

  // Candidate Attempt & Reopen Chance Helpers
  function extractChestFromRecord(rec) {
    if (rec && rec.chestNo && String(rec.chestNo).trim()) {
      return String(rec.chestNo).replace(/^#/, '').trim();
    }
    const candStr = String(rec?.candidate || '');
    const match = candStr.match(/\(#([^)]+)\)/);
    return match ? match[1].trim() : '';
  }

  function getCandidateAttemptsMap() {
    try {
      return JSON.parse(localStorage.getItem('sibaq_candidate_attempts') || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveCandidateAttemptsMap(map) {
    try {
      localStorage.setItem('sibaq_candidate_attempts', JSON.stringify(map));
    } catch (e) {}
  }

  function getRecordAttemptState(rec) {
    const chestNo = extractChestFromRecord(rec);
    const progKey = `${(rec.programName || '').trim().toLowerCase()}__${(rec.category || 'General').trim().toLowerCase()}`;
    const attemptKey = chestNo ? `${chestNo.toLowerCase()}__${progKey}` : '';
    const map = getCandidateAttemptsMap();
    const localAttempt = attemptKey ? map[attemptKey] : null;

    const recReopenCount = Number(rec.reopenCount || 0);
    const localReopenCount = Number(localAttempt?.reopenCount || 0);
    const reopenCount = Math.max(recReopenCount, localReopenCount);

    let isLocked = false;
    let status = rec.examStatus || '';
    let lockReason = rec.lockReason || '';

    if (localAttempt) {
      if (recReopenCount > localReopenCount) {
        isLocked = Boolean(rec.examLocked);
        status = rec.examStatus || 'reopened';
        lockReason = rec.lockReason || '';
      } else {
        isLocked = Boolean(localAttempt.locked);
        status = localAttempt.status || status;
        lockReason = localAttempt.lockReason || lockReason;
      }
    } else if (rec.examLocked) {
      isLocked = true;
      status = rec.examStatus || 'submitted';
    }

    return {
      chestNo,
      attemptKey,
      isLocked,
      status,
      lockReason,
      reopenCount
    };
  }

  async function reopenCandidateChanceRecord(rec) {
    if (!rec) return null;
    const state = getRecordAttemptState(rec);
    const newReopenCount = state.reopenCount + 1;

    const updatedRec = {
      ...rec,
      examLocked: false,
      examStatus: 'reopened',
      lockReason: '',
      reopenCount: newReopenCount,
      reopenedAt: Date.now()
    };

    if (state.attemptKey) {
      const map = getCandidateAttemptsMap();
      const existing = map[state.attemptKey] || {};
      map[state.attemptKey] = {
        ...existing,
        chestNo: state.chestNo,
        locked: false,
        status: 'reopened',
        lockReason: '',
        reopenCount: newReopenCount,
        reopenedAt: Date.now(),
        updatedAt: Date.now()
      };
      saveCandidateAttemptsMap(map);
    }

    await saveRecordToDB(updatedRec);
    return { updatedRec, newReopenCount };
  }

  // Helper to generate a table row element matching header order: ID | Category | Program Name | Candidate | Action
  function createRowElement(rec) {
    const tr = document.createElement('tr');
    tr.setAttribute('data-id', rec.id);

    const isZeroCand = !rec.candidate || 
      rec.candidate === '0 Candidate' || 
      rec.candidate.toLowerCase().includes('0 candidate') || 
      rec.candidate.toLowerCase().includes('unassigned');

    const attemptState = !isZeroCand ? getRecordAttemptState(rec) : null;

    let attemptBadgeHtml = '';
    if (attemptState) {
      if (attemptState.isLocked) {
        const reasonLabel = attemptState.lockReason ? `Locked • ${escapeHtml(attemptState.lockReason)}` : 'Locked • Submitted';
        attemptBadgeHtml = `<span class="exam-attempt-badge locked-badge" title="Exam locked (${escapeHtml(attemptState.lockReason || 'Submitted')})">${reasonLabel}</span>`;
      } else if (attemptState.reopenCount > 0) {
        attemptBadgeHtml = `<span class="exam-attempt-badge reopened-badge">Reopened (Chance #${attemptState.reopenCount + 1})</span>`;
      } else if (attemptState.status === 'in_progress') {
        attemptBadgeHtml = `<span class="exam-attempt-badge progress-badge">In Progress (Auto-Saved)</span>`;
      }
    }

    const candidateHtml = isZeroCand
      ? `<span class="zero-candidate-tag">0 Candidate</span>`
      : `<div class="candidate-cell-wrap">
          <span class="candidate-name">${escapeHtml(rec.candidate)}</span>
          ${attemptBadgeHtml}
        </div>`;

    const reopenBtnHtml = !isZeroCand
      ? `<button type="button" class="reopen-chance-btn ${attemptState?.isLocked ? 'is-locked-highlight' : ''}" title="Reopen another exam chance for ${escapeHtml(rec.candidate)}">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          <span>Reopen Chance</span>
        </button>`
      : '';

    tr.innerHTML = `
      <td><span class="id-tag">${escapeHtml(rec.id)}</span></td>
      <td><span class="category-tag">${escapeHtml(rec.category)}</span></td>
      <td><strong class="program-title">${escapeHtml(rec.programName)}</strong></td>
      <td>${candidateHtml}</td>
      <td>
        <div class="action-cell">
          ${reopenBtnHtml}
          <button type="button" class="row-action-btn edit-btn" title="Edit record">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button type="button" class="row-action-btn delete-btn" title="Delete record">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              <line x1="10" y1="11" x2="10" y2="17"></line>
              <line x1="14" y1="11" x2="14" y2="17"></line>
            </svg>
          </button>
        </div>
      </td>
    `;
    return tr;
  }

  // Reapply search and category filters
  function applyCurrentFilters() {
    const activeCategory = document.querySelector('#programsView .filter-btn.active')?.getAttribute('data-filter') || 'all';
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const rows = dataTableBody ? dataTableBody.querySelectorAll('tr:not(.empty-state-row)') : [];

    rows.forEach((row) => {
      const categoryCol = row.children[1]?.textContent || '';
      const text = row.textContent.toLowerCase();

      const matchCategory = activeCategory === 'all' || categoryCol.toLowerCase().includes(activeCategory.toLowerCase());
      const matchSearch = !query || text.includes(query);

      row.style.display = (matchCategory && matchSearch) ? '' : 'none';
    });
  }

  // Handle Multi-Program Form Submission with Firebase Cloud Firestore persistence
  if (addRecordForm) {
    addRecordForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (recordCategoryError) recordCategoryError.textContent = '';
      if (categoryRadioGroup) categoryRadioGroup.classList.remove('error');

      const selectedCategoryRadio = document.querySelector('input[name="recordCategory"]:checked');
      const category = selectedCategoryRadio ? selectedCategoryRadio.value : '';

      let hasError = false;

      // 1. Validate Category
      if (!category) {
        if (recordCategoryError) recordCategoryError.textContent = 'Please select a Category';
        if (categoryRadioGroup) categoryRadioGroup.classList.add('error');
        hasError = true;
      }

      // 2. Validate all program cards
      const programCards = programsList ? programsList.querySelectorAll('.program-entry-card') : [];
      if (programCards.length === 0) {
        showToast('Please add at least one program');
        return;
      }

      const programsData = [];
      programCards.forEach((card) => {
        const nameInput = card.querySelector('.program-name-input');
        const nameError = card.querySelector('.program-name-error');
        const progName = nameInput ? nameInput.value.trim() : '';

        if (!progName) {
          if (nameError) nameError.textContent = 'Program Name is required';
          if (nameInput) nameInput.classList.add('error');
          hasError = true;
        } else {
          if (nameError) nameError.textContent = '';
          if (nameInput) nameInput.classList.remove('error');
        }

        // Collect student chips
        const studentChips = card.querySelectorAll('.selected-students-list .student-chip');
        const selectedStudents = Array.from(studentChips).map(chip => ({
          chestNo: chip.getAttribute('data-chest') || '',
          name: chip.getAttribute('data-name') || ''
        }));

        programsData.push({
          programName: progName,
          students: selectedStudents
        });
      });

      if (hasError) return;

      // Loading state on button
      if (submitRecordBtn) {
        submitRecordBtn.disabled = true;
        const btnText = submitRecordBtn.querySelector('.btn-text');
        if (btnText) btnText.textContent = 'Saving...';
      }

      try {
        const existingRecords = await getAllRecordsFromDB();

        // Handle Edit Existing Record Mode
        if (editingRecordId) {
          const targetRec = existingRecords.find((r) => String(r.id) === String(editingRecordId)) || {
            id: editingRecordId,
            createdAt: Date.now()
          };
          const prog = programsData[0];
          const oldKey =
            targetRec.programName && targetRec.category
              ? makeProgramExamKey(targetRec.programName, targetRec.category)
              : '';
          const newKey = makeProgramExamKey(prog.programName, category);

          // Copy local exam / schedule metadata if program name or category was renamed
          if (oldKey && oldKey !== newKey) {
            const savedExams = getSavedExamsMap();
            if (savedExams[oldKey] && !savedExams[newKey]) {
              savedExams[newKey] = { ...savedExams[oldKey] };
              localStorage.setItem('sibaq_exams', JSON.stringify(savedExams));
            }
            const schedules = getProgramSchedulesMap();
            if (schedules[oldKey] && !schedules[newKey]) {
              schedules[newKey] = { ...schedules[oldKey] };
              saveProgramSchedulesMap(schedules);
            }
          }

          let updatedPrimaryRecord;
          if (prog.students.length === 0) {
            updatedPrimaryRecord = {
              ...targetRec,
              category,
              programName: prog.programName,
              candidate: '0 Candidate',
              chestNo: '',
              updatedAt: Date.now()
            };
          } else {
            const firstStd = prog.students[0];
            const firstCandLabel = firstStd.chestNo ? `${firstStd.name} (#${firstStd.chestNo})` : firstStd.name;
            updatedPrimaryRecord = {
              ...targetRec,
              category,
              programName: prog.programName,
              candidate: firstCandLabel,
              chestNo: firstStd.chestNo || '',
              updatedAt: Date.now()
            };
          }

          await saveRecordToDB(updatedPrimaryRecord);

          // If additional students were added during edit, create records for them too
          if (prog.students.length > 1) {
            let maxNum = 0;
            existingRecords.forEach((r) => {
              const match = r.id && r.id.match(/^SBQ-(\d+)$/i);
              if (match) {
                const num = parseInt(match[1], 10);
                if (num > maxNum) maxNum = num;
              }
            });
            if (maxNum === 0) maxNum = existingRecords.length;

            for (let s = 1; s < prog.students.length; s++) {
              maxNum++;
              const std = prog.students[s];
              const candLabel = std.chestNo ? `${std.name} (#${std.chestNo})` : std.name;
              const extraRec = {
                ...targetRec,
                id: `SBQ-${String(maxNum).padStart(2, '0')}`,
                category,
                programName: prog.programName,
                candidate: candLabel,
                chestNo: std.chestNo || '',
                createdAt: Date.now() + s
              };
              await saveRecordToDB(extraRec);
            }
          }

          const editedId = editingRecordId;
          await loadAndRenderTable();
          await loadAndRenderQuestionTable();
          if (typeof loadAndRenderValuationTable === 'function') await loadAndRenderValuationTable();
          if (typeof loadAndRenderScheduledPrograms === 'function') await loadAndRenderScheduledPrograms();

          closeAddRecordModal();
          showToast(`Updated record ${editedId} ("${prog.programName}")!`);
          return;
        }

        let maxNum = 0;
        existingRecords.forEach(r => {
          const match = r.id && r.id.match(/^SBQ-(\d+)$/i);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num > maxNum) maxNum = num;
          }
        });
        if (maxNum === 0) maxNum = existingRecords.length;

        let totalRecordsCreated = 0;
        for (let p = 0; p < programsData.length; p++) {
          const prog = programsData[p];
          if (prog.students.length === 0) {
            // Program entered with 0 candidates
            maxNum++;
            const newRecordId = `SBQ-${String(maxNum).padStart(2, '0')}`;
            const newRecord = {
              id: newRecordId,
              category,
              programName: prog.programName,
              candidate: '0 Candidate',
              chestNo: '',
              createdAt: Date.now() + totalRecordsCreated
            };
            await saveRecordToDB(newRecord);
            totalRecordsCreated++;
          } else {
            // Record for each assigned student
            for (let s = 0; s < prog.students.length; s++) {
              maxNum++;
              const std = prog.students[s];
              const candLabel = std.chestNo ? `${std.name} (#${std.chestNo})` : std.name;
              const newRecordId = `SBQ-${String(maxNum).padStart(2, '0')}`;
              const newRecord = {
                id: newRecordId,
                category,
                programName: prog.programName,
                candidate: candLabel,
                chestNo: std.chestNo,
                createdAt: Date.now() + totalRecordsCreated
              };
              await saveRecordToDB(newRecord);
              totalRecordsCreated++;
            }
          }
        }

        // Re-render table with fresh data from IndexedDB
        await loadAndRenderTable();
        await loadAndRenderQuestionTable();

        closeAddRecordModal();
        const progMsg = programsData.length > 1 ? `${programsData.length} programs` : `"${programsData[0].programName}"`;
        showToast(`Saved ${progMsg} (${totalRecordsCreated} record(s)) in Firebase!`);
      } catch (err) {
        console.error('Error saving records to Firebase:', err);
        showToast('Error saving records to database');
      } finally {
        if (submitRecordBtn) {
          submitRecordBtn.disabled = false;
          const btnText = submitRecordBtn.querySelector('.btn-text');
          if (btnText) btnText.textContent = 'Submit';
        }
      }
    });
  }

  // HTML & Attribute Sanitizer helper (escapes &, <, >, ", and ')
  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Table Row Actions (Reopen Chance, Delete from IndexedDB & Edit)
  if (dataTableBody) {
    dataTableBody.addEventListener('click', async (e) => {
      const reopenBtn = e.target.closest('.reopen-chance-btn');
      if (reopenBtn) {
        const row = reopenBtn.closest('tr');
        if (row) {
          const recordId = row.getAttribute('data-id') || row.querySelector('.id-tag')?.textContent?.trim();
          try {
            reopenBtn.disabled = true;
            const allRecs = await getAllRecordsFromDB();
            const targetRec = allRecs.find((r) => String(r.id) === String(recordId));
            if (targetRec) {
              const res = await reopenCandidateChanceRecord(targetRec);
              await loadAndRenderTable();
              await loadAndRenderQuestionTable();
              showToast(`Reopened Chance #${(res?.newReopenCount || 1) + 1} for ${targetRec.candidate}!`);
            }
          } catch (err) {
            console.error('Error reopening chance:', err);
            showToast('Could not reopen chance');
          } finally {
            reopenBtn.disabled = false;
          }
        }
        return;
      }

      const deleteBtn = e.target.closest('.delete-btn');
      if (deleteBtn) {
        const row = deleteBtn.closest('tr');
        if (row) {
          const recordId = row.getAttribute('data-id') || row.querySelector('.id-tag')?.textContent?.trim();
          const programTitle = row.querySelector('.program-title')?.textContent || 'Record';

          row.style.transition = 'all 0.22s ease-out';
          row.style.opacity = '0';
          row.style.transform = 'translateX(-12px)';

          setTimeout(async () => {
            row.remove();
            try {
              if (recordId) {
                await deleteRecordFromDB(recordId);
              }
              showToast(`Deleted "${programTitle}" from Firebase`);
              const remaining = await getAllRecordsFromDB();
              if (remaining.length === 0) {
                await loadAndRenderTable();
              }
              await loadAndRenderQuestionTable();
            } catch (err) {
              console.error('Error deleting from Firebase:', err);
            }
          }, 200);
        }
        return;
      }

      const editBtn = e.target.closest('.edit-btn');
      if (editBtn) {
        const row = editBtn.closest('tr');
        if (row) {
          const recordId = row.getAttribute('data-id') || row.querySelector('.id-tag')?.textContent?.trim();
          const allRecs = await getAllRecordsFromDB();
          const targetRec = allRecs.find((r) => String(r.id) === String(recordId));
          if (targetRec) {
            openEditRecordModal(targetRec);
          } else {
            const catText = row.querySelector('.category-tag')?.textContent?.trim() || '';
            const progText = row.querySelector('.program-title')?.textContent?.trim() || '';
            const candText = row.querySelector('.candidate-name')?.textContent?.trim() || '0 Candidate';
            openEditRecordModal({
              id: recordId || 'SBQ-01',
              category: catText,
              programName: progText,
              candidate: candText
            });
          }
        }
      }
    });
  }

  // Listen for candidate exam auto-save/lock events across browser tabs
  window.addEventListener('storage', (e) => {
    if (e.key === 'sibaq_candidate_attempts' || e.key === 'sibaq_program_schedules') {
      loadAndRenderTable();
      loadAndRenderQuestionTable();
      if (typeof loadAndRenderValuationTable === 'function') loadAndRenderValuationTable();
      if (typeof loadAndRenderScheduledPrograms === 'function') loadAndRenderScheduledPrograms();
    }
  });

  // ==========================================================================
  // Question Page & Full-Page Google Forms-Style Exam Builder
  // ==========================================================================
  const questionTableBody = document.getElementById('questionTableBody');
  const questionProgramsCountBadge = document.getElementById('questionProgramsCountBadge');
  const questionSearchInput = document.getElementById('questionSearchInput');
  const questionFilterBtns = document.querySelectorAll('.question-filter-btn');

  // Full-Page Exam Builder Elements
  const examBuilderBackBtn = document.getElementById('examBuilderBackBtn');
  const setExamForm = document.getElementById('setExamForm');
  const examModalProgramName = document.getElementById('examModalProgramName');
  const examModalCategory = document.getElementById('examModalCategory');
  const examFormDescriptionInput = document.getElementById('examFormDescriptionInput');
  const examDurationInput = document.getElementById('examDurationInput');
  const examQuestionsList = document.getElementById('examQuestionsList');
  const examBuilderQuestionCount = document.getElementById('examBuilderQuestionCount');
  const examBuilderTotalMarks = document.getElementById('examBuilderTotalMarks');
  const addExamQuestionBtn = document.getElementById('addExamQuestionBtn');
  const addExamQuestionTopBtn = document.getElementById('addExamQuestionTopBtn');
  const quickTypeBtns = document.querySelectorAll('.quick-type-btn');
  const saveExamBtn = document.getElementById('saveExamBtn');

  let activeExamProgram = null;

  function getSavedExamsMap() {
    try {
      return JSON.parse(localStorage.getItem('sibaq_exams') || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveExamToLocalMap(key, data) {
    try {
      const map = getSavedExamsMap();
      map[key] = data;
      localStorage.setItem('sibaq_exams', JSON.stringify(map));
    } catch (e) {}
  }

  function makeProgramExamKey(programName, category) {
    return `${(programName || '').trim().toLowerCase()}__${(category || '').trim().toLowerCase()}`;
  }

  async function loadAndRenderQuestionTable() {
    if (!questionTableBody) return;
    try {
      const records = await getAllRecordsFromDB();
      records.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      const savedExams = getSavedExamsMap();
      const uniqueProgramsMap = new Map();

      records.forEach((rec) => {
        if (!rec.programName) return;
        const key = makeProgramExamKey(rec.programName, rec.category);
        const isZeroCand = !rec.candidate ||
          rec.candidate === '0 Candidate' ||
          rec.candidate.toLowerCase().includes('0 candidate') ||
          rec.candidate.toLowerCase().includes('unassigned');
        const attemptState = !isZeroCand ? getRecordAttemptState(rec) : null;

        if (!uniqueProgramsMap.has(key)) {
          const localExam = savedExams[key] || {};
          uniqueProgramsMap.set(key, {
            key,
            programName: rec.programName,
            category: rec.category || 'General',
            examQuestion: rec.examQuestion || localExam.examQuestion || '',
            examDuration: rec.examDuration || localExam.examDuration || '',
            examDescription: rec.examDescription || localExam.examDescription || '',
            examQuestions: Array.isArray(rec.examQuestions) && rec.examQuestions.length > 0
              ? rec.examQuestions
              : (Array.isArray(localExam.examQuestions) ? localExam.examQuestions : []),
            candidateRecords: !isZeroCand ? [rec] : [],
            lockedCount: attemptState?.isLocked ? 1 : 0
          });
        } else {
          const existing = uniqueProgramsMap.get(key);
          if (!existing.examQuestion && rec.examQuestion) {
            existing.examQuestion = rec.examQuestion;
          }
          if (!existing.examDuration && rec.examDuration) {
            existing.examDuration = rec.examDuration;
          }
          if ((!existing.examQuestions || existing.examQuestions.length === 0) && Array.isArray(rec.examQuestions) && rec.examQuestions.length > 0) {
            existing.examQuestions = rec.examQuestions;
          }
          if (!isZeroCand) {
            existing.candidateRecords.push(rec);
            if (attemptState?.isLocked) {
              existing.lockedCount += 1;
            }
          }
        }
      });

      const programs = Array.from(uniqueProgramsMap.values());

      if (questionProgramsCountBadge) {
        questionProgramsCountBadge.textContent = `${programs.length} Program${programs.length === 1 ? '' : 's'}`;
      }

      questionTableBody.innerHTML = '';

      if (programs.length === 0) {
        questionTableBody.innerHTML = `
          <tr class="empty-state-row">
            <td colspan="3" style="text-align: center; padding: 48px 20px; color: var(--text-muted);">
              <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" style="color: var(--text-dim);">
                  <rect x="3" y="3" width="18" height="18" rx="4"></rect>
                  <line x1="3" y1="12" x2="21" y2="12"></line>
                  <line x1="12" y1="3" x2="12" y2="21"></line>
                </svg>
                <span style="font-weight: 600; font-size: 0.9rem; color: var(--text-main);">No programs created yet</span>
                <span style="font-size: 0.8rem;">Create a program in "Data &gt; All Programs" to see it here and set its exam</span>
              </div>
            </td>
          </tr>
        `;
        return;
      }

      programs.forEach((prog) => {
        const tr = document.createElement('tr');
        tr.setAttribute('data-program-name', prog.programName);
        tr.setAttribute('data-category', prog.category);

        const qCount = Array.isArray(prog.examQuestions) ? prog.examQuestions.length : 0;
        const hasExam = qCount > 0 || Boolean(prog.examQuestion && prog.examQuestion.trim());
        const badgeText = qCount > 0
          ? `Exam Set (${qCount} Q${qCount === 1 ? '' : 's'})`
          : 'Exam Set';
        const statusBadge = hasExam
          ? `<span class="exam-status-pill">${badgeText}</span>`
          : '';
        const lockedBadge = prog.lockedCount > 0
          ? `<span class="exam-attempt-badge locked-badge">${prog.lockedCount} Candidate${prog.lockedCount === 1 ? '' : 's'} Locked</span>`
          : '';

        const reopenProgramBtnHtml = prog.candidateRecords.length > 0
          ? `<button type="button" class="reopen-chance-btn reopen-program-chances-btn ${prog.lockedCount > 0 ? 'is-locked-highlight' : ''}" title="Reopen exam chance for candidates in ${escapeHtml(prog.programName)}">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="23 4 23 10 17 10"></polyline>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
              <span>Reopen Chance${prog.lockedCount > 0 ? ` (${prog.lockedCount})` : ''}</span>
            </button>`
          : '';

        tr.innerHTML = `
          <td>
            <div class="question-program-cell">
              <strong class="program-title">${escapeHtml(prog.programName)}</strong>
              ${statusBadge}
              ${lockedBadge}
            </div>
          </td>
          <td><span class="category-tag">${escapeHtml(prog.category)}</span></td>
          <td style="text-align: right;">
            <div class="question-row-actions">
              ${reopenProgramBtnHtml}
              <button type="button" class="share-exam-row-btn" title="Share direct link to ${escapeHtml(prog.programName)} question making">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="18" cy="5" r="3"></circle>
                  <circle cx="6" cy="12" r="3"></circle>
                  <circle cx="18" cy="19" r="3"></circle>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                </svg>
                <span>Share</span>
              </button>
              <button type="button" class="set-exam-btn">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                  <polyline points="14 2 14 8 20 8"></polyline>
                  <line x1="16" y1="13" x2="8" y2="13"></line>
                  <line x1="16" y1="17" x2="8" y2="17"></line>
                  <polyline points="10 9 9 9 8 9"></polyline>
                </svg>
                <span>Set Exam</span>
              </button>
            </div>
          </td>
        `;

        const reopenProgBtn = tr.querySelector('.reopen-program-chances-btn');
        if (reopenProgBtn) {
          reopenProgBtn.addEventListener('click', async () => {
            reopenProgBtn.disabled = true;
            try {
              let reopenedCount = 0;
              for (const rec of prog.candidateRecords) {
                await reopenCandidateChanceRecord(rec);
                reopenedCount++;
              }
              await loadAndRenderTable();
              await loadAndRenderQuestionTable();
              showToast(`Reopened another exam chance for ${reopenedCount} candidate(s) in "${prog.programName}"!`);
            } catch (err) {
              console.error('Error reopening program chances:', err);
              showToast('Could not reopen chance');
            } finally {
              reopenProgBtn.disabled = false;
            }
          });
        }

        const shareRowBtn = tr.querySelector('.share-exam-row-btn');
        if (shareRowBtn) {
          shareRowBtn.addEventListener('click', () => {
            openShareExamModal(prog);
          });
        }

        const setExamBtn = tr.querySelector('.set-exam-btn');
        if (setExamBtn) {
          setExamBtn.addEventListener('click', () => {
            openSetExamPage(prog);
          });
        }

        questionTableBody.appendChild(tr);
      });

      applyQuestionFilters();
    } catch (err) {
      console.error('Error rendering Question programs table:', err);
    }
  }

  function applyQuestionFilters() {
    if (!questionTableBody) return;
    const activeCat = document.querySelector('.question-filter-btn.active')?.getAttribute('data-qfilter') || 'all';
    const query = questionSearchInput ? questionSearchInput.value.toLowerCase().trim() : '';
    const rows = questionTableBody.querySelectorAll('tr:not(.empty-state-row)');

    rows.forEach((row) => {
      const cat = row.getAttribute('data-category') || '';
      const text = row.textContent.toLowerCase();

      const matchCat = activeCat === 'all' || cat.toLowerCase().includes(activeCat.toLowerCase());
      const matchQuery = !query || text.includes(query);

      row.style.display = (matchCat && matchQuery) ? '' : 'none';
    });
  }

  if (questionSearchInput) {
    questionSearchInput.addEventListener('input', applyQuestionFilters);
  }

  questionFilterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      questionFilterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      applyQuestionFilters();
    });
  });

  // ==========================================================================
  // Full-Page Google Forms-Style Unlimited Question Builder + Cloudinary Upload
  // ==========================================================================
  const CLOUDINARY_CLOUD_NAME = 'da6fjyirm';
  const CLOUDINARY_UPLOAD_PRESET = 'sibaaqText';
  const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

  async function uploadQuestionImageToCloudinary(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

    const response = await fetch(CLOUDINARY_UPLOAD_URL, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      let errMsg = `Cloudinary upload failed (${response.status})`;
      try {
        const errJson = await response.json();
        if (errJson?.error?.message) errMsg = errJson.error.message;
      } catch (e) {}
      throw new Error(errMsg);
    }

    const data = await response.json();
    return {
      imageUrl: data.secure_url || data.url || '',
      imagePublicId: data.public_id || ''
    };
  }

  const PAIR_BASED_TYPES = new Set(['match', 'categorize', 'drag_drop', 'match_grid']);
  const OPTION_BASED_TYPES = new Set(['mcq', 'radio', 'checkbox', 'dropdown', 'hotspot']);
  const VISUAL_IMAGE_TYPES = new Set(['labeling', 'image_identify', 'hotspot']);

  function createDefaultQuestionData(type = 'mcq') {
    const isSection = type === 'section';
    const isVisual = VISUAL_IMAGE_TYPES.has(type);
    let defaultOpts = ['Option 1', 'Option 2'];
    if (type === 'reorder') {
      defaultOpts = ['Step 1 (First)', 'Step 2 (Second)', 'Step 3 (Third)'];
    } else if (type === 'hotspot') {
      defaultOpts = ['Zone A (Top-Left)', 'Zone B (Top-Right)', 'Zone C (Center)', 'Zone D (Bottom)'];
    }
    return {
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      questionText: isVisual ? 'Identify / select the target in the picture shown below:' : '',
      sectionContent: '',
      imageUrl: '',
      imagePublicId: '',
      points: isSection ? 0 : 1,
      required: isSection ? false : true,
      options: defaultOpts,
      correctAnswer: '',
      correctOptions: [],
      pairs: [
        { left: 'Item A', right: 'Match 1' },
        { left: 'Item B', right: 'Match 2' }
      ],
      answerKey: ''
    };
  }

  function updateExamBuilderCounters() {
    if (!examQuestionsList) return;
    const cards = examQuestionsList.querySelectorAll('.gform-question-card');
    let totalPts = 0;
    let questionCounter = 0;
    let sectionCounter = 0;

    cards.forEach((card, idx) => {
      card.setAttribute('data-q-index', idx);
      const typeSelect = card.querySelector('.gform-q-type-select');
      const isSection = typeSelect && typeSelect.value === 'section';

      card.classList.toggle('gform-section-card', Boolean(isSection));

      const numBadge = card.querySelector('.gform-q-num');
      if (isSection) {
        sectionCounter++;
        if (numBadge) {
          numBadge.textContent = `SEC ${sectionCounter}`;
          numBadge.classList.add('section-badge');
        }
      } else {
        questionCounter++;
        if (numBadge) {
          numBadge.textContent = `Q${questionCounter}`;
          numBadge.classList.remove('section-badge');
        }
      }

      const ptsBox = card.querySelector('.gform-points-box');
      const reqToggle = card.querySelector('.gform-req-toggle');
      const secFooterNote = card.querySelector('.gform-section-footer-note');
      if (ptsBox) ptsBox.style.display = isSection ? 'none' : 'flex';
      if (reqToggle) reqToggle.style.display = isSection ? 'none' : 'inline-flex';
      if (secFooterNote) secFooterNote.style.display = isSection ? 'inline-flex' : 'none';

      if (!isSection) {
        const ptsInput = card.querySelector('.gform-points-input');
        const pts = ptsInput ? Math.max(0, parseFloat(ptsInput.value) || 0) : 1;
        totalPts += pts;
      }

      const delBtn = card.querySelector('.gform-delete-q-btn');
      if (delBtn) {
        delBtn.disabled = cards.length <= 1;
        delBtn.style.opacity = cards.length <= 1 ? '0.4' : '1';
      }
    });

    if (examBuilderQuestionCount) {
      const qLabel = `${questionCounter} Question${questionCounter === 1 ? '' : 's'}`;
      const sLabel = sectionCounter > 0 ? ` • ${sectionCounter} Passage${sectionCounter === 1 ? '' : 's'}` : '';
      examBuilderQuestionCount.textContent = `${qLabel}${sLabel}`;
    }
    if (examBuilderTotalMarks) {
      examBuilderTotalMarks.textContent = `${totalPts} Pt${totalPts === 1 ? '' : 's'}`;
    }
  }

  function autoResizeTextarea(el, minHeight = 42) {
    if (!el) return;
    const resize = () => {
      el.style.height = 'auto';
      el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
    };
    el.addEventListener('input', resize);
    requestAnimationFrame(resize);
  }

  function renderQuestionBodyByType(bodyContainer, qData) {
    const type = qData.type || 'mcq';
    bodyContainer.innerHTML = '';

    // 0. Passage / Read-Only Section (No Question)
    if (type === 'section') {
      const sectionWrap = document.createElement('div');
      sectionWrap.className = 'gform-section-body-wrap';
      sectionWrap.innerHTML = `
        <div class="gform-section-info-banner">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
          </svg>
          <span><strong>Passage (Read Only):</strong> Candidates read this passage on its own slide before continuing to the next questions. No answer input or marks are required.</span>
        </div>
        <label class="gform-key-label">Passage / Full Text to Read:</label>
        <textarea
          class="gform-section-content-input"
          rows="5"
          placeholder="Write or paste the complete passage, story, instructions, or reference text here for students to read..."
        >${escapeHtml(qData.sectionContent || qData.answerKey || '')}</textarea>
      `;
      bodyContainer.appendChild(sectionWrap);
      autoResizeTextarea(sectionWrap.querySelector('.gform-section-content-input'), 110);
      return;
    }

    // Optional attached passage/context on a question (if imported from JSON with passage/sectionContent)
    if (qData.sectionContent && qData.sectionContent.trim()) {
      const contextWrap = document.createElement('div');
      contextWrap.className = 'gform-section-body-wrap';
      contextWrap.style.marginBottom = '10px';
      contextWrap.innerHTML = `
        <label class="gform-key-label">Question Passage / Full Context Text:</label>
        <textarea
          class="gform-section-content-input"
          rows="3"
          placeholder="Supporting passage or context text for this question..."
        >${escapeHtml(qData.sectionContent)}</textarea>
      `;
      bodyContainer.appendChild(contextWrap);
      autoResizeTextarea(contextWrap.querySelector('.gform-section-content-input'), 78);
    }

    // 1. Reorder (Sequence / Ordering items in correct order)
    if (type === 'reorder') {
      const optionsWrap = document.createElement('div');
      optionsWrap.className = 'gform-options-list';

      const hintEl = document.createElement('div');
      hintEl.className = 'gform-key-label';
      hintEl.style.marginBottom = '4px';
      hintEl.textContent = 'Enter items in their CORRECT sequence order (1st to last — automatically shuffled for candidates):';
      bodyContainer.appendChild(hintEl);

      const opts = Array.isArray(qData.options) && qData.options.length > 0
        ? qData.options
        : ['Step 1 (First)', 'Step 2 (Second)', 'Step 3 (Third)'];

      const renderReorderRow = (optText = '', optIdx = 0) => {
        const row = document.createElement('div');
        row.className = 'gform-option-row';
        row.innerHTML = `
          <span class="gform-opt-num">${optIdx + 1}.</span>
          <input
            type="text"
            class="gform-option-input"
            value="${escapeHtml(optText)}"
            placeholder="Sequence Step #${optIdx + 1}"
          />
          <span class="gform-correct-btn active" style="pointer-events: none;">Step #${optIdx + 1}</span>
          <button type="button" class="gform-remove-opt-btn" title="Remove step">&times;</button>
        `;
        const optInputEl = row.querySelector('.gform-option-input');
        if (optInputEl) optInputEl.value = optText;

        row.querySelector('.gform-remove-opt-btn')?.addEventListener('click', () => {
          if (optionsWrap.querySelectorAll('.gform-option-row').length > 2) {
            row.remove();
            optionsWrap.querySelectorAll('.gform-option-row').forEach((r, i) => {
              const n = r.querySelector('.gform-opt-num');
              const b = r.querySelector('.gform-correct-btn');
              if (n) n.textContent = `${i + 1}.`;
              if (b) b.textContent = `Step #${i + 1}`;
            });
          } else {
            showToast('At least two steps are required for Reorder');
          }
        });
        return row;
      };

      opts.forEach((opt, i) => optionsWrap.appendChild(renderReorderRow(opt, i)));

      const addStepBtn = document.createElement('button');
      addStepBtn.type = 'button';
      addStepBtn.className = 'gform-add-opt-btn';
      addStepBtn.innerHTML = `<span>+ Add Sequence Step</span>`;
      addStepBtn.addEventListener('click', () => {
        const count = optionsWrap.querySelectorAll('.gform-option-row').length;
        const newRow = renderReorderRow(`Step ${count + 1}`, count);
        optionsWrap.appendChild(newRow);
        const inp = newRow.querySelector('.gform-option-input');
        if (inp) {
          inp.focus();
          inp.select();
        }
      });

      bodyContainer.appendChild(optionsWrap);
      bodyContainer.appendChild(addStepBtn);
      return;
    }

    // 2. Option-Based Types: Multiple choice (mcq), Multi-select (checkbox), Dropdown, Hot text, Hotspot, Radio
    if (OPTION_BASED_TYPES.has(type)) {
      const optionsWrap = document.createElement('div');
      optionsWrap.className = 'gform-options-list';

      if (type === 'hotspot' || type === 'hot_text') {
        const subHint = document.createElement('div');
        subHint.className = 'gform-key-label';
        subHint.style.marginBottom = '4px';
        subHint.textContent =
          type === 'hotspot'
            ? 'Define Hotspot target zones / regions on the picture above and mark the correct zone:'
            : 'Define selectable Hot Text phrases / words and mark the correct answer(s):';
        bodyContainer.appendChild(subHint);
      }

      const opts = Array.isArray(qData.options) && qData.options.length > 0
        ? qData.options
        : type === 'hotspot'
        ? ['Zone A (Top-Left)', 'Zone B (Top-Right)', 'Zone C (Center)', 'Zone D (Bottom)']
        : ['Option 1', 'Option 2'];

      const isMultiCorrect = type === 'checkbox' || type === 'hot_text';
      const isDropdown = type === 'dropdown';

      const renderOptionRow = (optText = '', optIdx = 0) => {
        const row = document.createElement('div');
        row.className = 'gform-option-row';

        const isMarkedCorrect = isMultiCorrect
          ? ((Array.isArray(qData.correctOptions) && qData.correctOptions.includes(optText)) ||
              (qData.correctAnswer && qData.correctAnswer === optText)) &&
            optText !== ''
          : qData.correctAnswer && qData.correctAnswer === optText && optText !== '';

        let indicatorHtml = `<span class="gform-opt-indicator radio-ind"></span>`;
        if (isMultiCorrect) {
          indicatorHtml = `<span class="gform-opt-indicator checkbox-ind"></span>`;
        } else if (isDropdown) {
          indicatorHtml = `<span class="gform-opt-num">${optIdx + 1}.</span>`;
        }

        const optPlaceholder =
          type === 'hotspot'
            ? `Hotspot Zone ${optIdx + 1}`
            : type === 'hot_text'
            ? `Selectable text segment ${optIdx + 1}`
            : `Option ${optIdx + 1}`;

        row.innerHTML = `
          ${indicatorHtml}
          <input
            type="text"
            class="gform-option-input"
            value="${escapeHtml(optText)}"
            placeholder="${optPlaceholder}"
          />
          <button
            type="button"
            class="gform-correct-btn ${isMarkedCorrect ? 'active' : ''}"
            title="Mark as correct answer"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Answer</span>
          </button>
          <button type="button" class="gform-remove-opt-btn" title="Remove option">&times;</button>
        `;

        const optInputEl = row.querySelector('.gform-option-input');
        if (optInputEl) optInputEl.value = optText;

        const correctBtn = row.querySelector('.gform-correct-btn');
        if (correctBtn) {
          correctBtn.addEventListener('click', () => {
            if (!isMultiCorrect) {
              optionsWrap.querySelectorAll('.gform-correct-btn').forEach((b) => {
                if (b !== correctBtn) b.classList.remove('active');
              });
            }
            correctBtn.classList.toggle('active');
          });
        }

        const removeOptBtn = row.querySelector('.gform-remove-opt-btn');
        if (removeOptBtn) {
          removeOptBtn.addEventListener('click', () => {
            if (optionsWrap.querySelectorAll('.gform-option-row').length > 1) {
              row.remove();
              optionsWrap.querySelectorAll('.gform-option-row').forEach((r, i) => {
                const n = r.querySelector('.gform-opt-num');
                if (n) n.textContent = `${i + 1}.`;
              });
            } else {
              showToast('At least one option is required');
            }
          });
        }

        return row;
      };

      opts.forEach((opt, i) => {
        optionsWrap.appendChild(renderOptionRow(opt, i));
      });

      const addOptBtn = document.createElement('button');
      addOptBtn.type = 'button';
      addOptBtn.className = 'gform-add-opt-btn';
      addOptBtn.innerHTML = `<span>${type === 'hotspot' ? '+ Add Hotspot Zone' : type === 'hot_text' ? '+ Add Hot Text Segment' : '+ Add Option'}</span>`;
      addOptBtn.addEventListener('click', () => {
        const count = optionsWrap.querySelectorAll('.gform-option-row').length;
        const newRow = renderOptionRow(
          type === 'hotspot' ? `Zone ${String.fromCharCode(65 + count)}` : `Option ${count + 1}`,
          count
        );
        optionsWrap.appendChild(newRow);
        const inp = newRow.querySelector('.gform-option-input');
        if (inp) {
          inp.focus();
          inp.select();
        }
      });

      bodyContainer.appendChild(optionsWrap);
      bodyContainer.appendChild(addOptBtn);
      return;
    }

    // 3. Pair / Table / Category / Drag-and-Drop / Matrix Grid Types:
    //    match, table_fill, categorize, drag_drop, match_grid
    if (PAIR_BASED_TYPES.has(type)) {
      const matchWrap = document.createElement('div');
      matchWrap.className = 'gform-match-list';

      const pairMetaMap = {
        match: {
          colA: 'Column A (Premise / Item)',
          colB: 'Column B (Correct Match)',
          phA: 'Column A Item',
          phB: 'Column B Match',
          btnText: '+ Add Match Pair'
        },
        table_fill: {
          colA: 'Table Row / Field Header',
          colB: 'Expected Fill-In Cell Value',
          phA: 'Row Prompt / Field',
          phB: 'Correct Cell Answer',
          btnText: '+ Add Table Row'
        },
        categorize: {
          colA: 'Item to Categorize',
          colB: 'Correct Category Name',
          phA: 'Item / Statement',
          phB: 'Category (e.g. Hardware / Software)',
          btnText: '+ Add Item & Category'
        },
        drag_drop: {
          colA: 'Target Slot / Sentence Blank',
          colB: 'Correct Draggable Item',
          phA: 'Slot / Blank Prompt',
          phB: 'Draggable Word / Item',
          btnText: '+ Add Drag & Drop Slot'
        },
        match_grid: {
          colA: 'Grid Row Item',
          colB: 'Matched Column Header',
          phA: 'Row Statement / Item',
          phB: 'Column Header Name',
          btnText: '+ Add Grid Row'
        }
      };

      const meta = pairMetaMap[type] || pairMetaMap.match;

      const headerRow = document.createElement('div');
      headerRow.className = 'gform-match-header';
      headerRow.innerHTML = `
        <span>${meta.colA}</span>
        <span></span>
        <span>${meta.colB}</span>
        <span></span>
      `;
      matchWrap.appendChild(headerRow);

      const pairs = Array.isArray(qData.pairs) && qData.pairs.length > 0
        ? qData.pairs
        : [
            { left: 'Item A', right: 'Match 1' },
            { left: 'Item B', right: 'Match 2' }
          ];

      const renderPairRow = (pair = { left: '', right: '' }, pIdx = 0) => {
        const row = document.createElement('div');
        row.className = 'gform-match-row';
        row.innerHTML = `
          <input
            type="text"
            class="gform-match-left"
            value="${escapeHtml(pair.left)}"
            placeholder="${meta.phA} #${pIdx + 1}"
          />
          <span class="gform-match-arrow">&harr;</span>
          <input
            type="text"
            class="gform-match-right"
            value="${escapeHtml(pair.right)}"
            placeholder="${meta.phB} #${pIdx + 1}"
          />
          <button type="button" class="gform-remove-opt-btn" title="Remove row">&times;</button>
        `;

        const leftInpEl = row.querySelector('.gform-match-left');
        const rightInpEl = row.querySelector('.gform-match-right');
        if (leftInpEl) leftInpEl.value = pair.left || '';
        if (rightInpEl) rightInpEl.value = pair.right || '';

        const delPairBtn = row.querySelector('.gform-remove-opt-btn');
        if (delPairBtn) {
          delPairBtn.addEventListener('click', () => {
            if (matchWrap.querySelectorAll('.gform-match-row').length > 1) {
              row.remove();
            } else {
              showToast('At least one row is required');
            }
          });
        }
        return row;
      };

      pairs.forEach((p, idx) => {
        matchWrap.appendChild(renderPairRow(p, idx));
      });

      const addPairBtn = document.createElement('button');
      addPairBtn.type = 'button';
      addPairBtn.className = 'gform-add-opt-btn';
      addPairBtn.innerHTML = `<span>${meta.btnText}</span>`;
      addPairBtn.addEventListener('click', () => {
        const count = matchWrap.querySelectorAll('.gform-match-row').length;
        const newRow = renderPairRow({ left: '', right: '' }, count);
        matchWrap.appendChild(newRow);
        const inp = newRow.querySelector('.gform-match-left');
        if (inp) inp.focus();
      });

      bodyContainer.appendChild(matchWrap);
      bodyContainer.appendChild(addPairBtn);
      return;
    }

    // 4. True / False
    if (type === 'true_false') {
      const tfWrap = document.createElement('div');
      tfWrap.className = 'gform-tf-group';
      const currentAns = qData.correctAnswer || 'True';

      ['True', 'False'].forEach((val) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = `gform-tf-btn ${currentAns === val ? 'active' : ''}`;
        chip.setAttribute('data-tf-val', val);
        chip.innerHTML = `
          <span class="gform-opt-indicator radio-ind"></span>
          <span>${val}</span>
          <span class="tf-correct-tag">Correct Answer</span>
        `;
        chip.addEventListener('click', () => {
          tfWrap.querySelectorAll('.gform-tf-btn').forEach((b) => b.classList.remove('active'));
          chip.classList.add('active');
        });
        tfWrap.appendChild(chip);
      });

      bodyContainer.appendChild(tfWrap);
      return;
    }

    // 5. Fill in the blanks (fill_blank / short_answer), Open ended (open_ended / long_answer), or Labeling (labeling / image_identify)
    const isLong = type === 'open_ended' || type === 'long_answer';
    const isImageIdentify = type === 'labeling' || type === 'image_identify';
    const textPreviewWrap = document.createElement('div');
    textPreviewWrap.className = 'gform-text-answer-wrap';
    textPreviewWrap.innerHTML = `
      <div class="gform-answer-preview ${isLong ? 'long-preview' : 'short-preview'}">
        <span>${
          isImageIdentify
            ? 'Candidate views the uploaded diagram / picture above and types the label / identification answer'
            : isLong
            ? 'Candidate Open-Ended / Paragraph response text area'
            : 'Candidate Fill-in-the-Blanks / Short Answer text field'
        }</span>
      </div>
      <div class="gform-answer-key-row">
        <label class="gform-key-label">${
          isImageIdentify
            ? 'Correct Label / Picture Identification Key (Optional):'
            : isLong
            ? 'Open-Ended Grading Rubric / Full Reference Answer (Optional):'
            : 'Expected Fill-in-the-Blank Answer Key (Optional):'
        }</label>
        ${
          isLong
            ? `<textarea
                class="gform-answer-key-input gform-answer-key-textarea"
                rows="2"
                placeholder="Enter full key points or reference answer..."
              >${escapeHtml(qData.answerKey || qData.correctAnswer || '')}</textarea>`
            : `<input
                type="text"
                class="gform-answer-key-input"
                value="${escapeHtml(qData.answerKey || qData.correctAnswer || '')}"
                placeholder="${
                  isImageIdentify
                    ? 'e.g. Al-Aqsa Mosque / Mitochondria / Ibn Khaldun...'
                    : 'Enter exact expected blank answer...'
                }"
              />`
        }
      </div>
    `;
    bodyContainer.appendChild(textPreviewWrap);
    const keyInpEl = textPreviewWrap.querySelector('.gform-answer-key-input');
    if (keyInpEl) {
      keyInpEl.value = qData.answerKey || qData.correctAnswer || '';
    }
    if (isLong) {
      autoResizeTextarea(textPreviewWrap.querySelector('.gform-answer-key-textarea'), 54);
    }
  }

  function extractQuestionDataFromCard(card) {
    const qTextInput = card.querySelector('.gform-q-prompt-input');
    const typeSelect = card.querySelector('.gform-q-type-select');
    const pointsInput = card.querySelector('.gform-points-input');
    const reqCheckbox = card.querySelector('.gform-req-checkbox');

    const type = typeSelect ? typeSelect.value : 'mcq';
    const isSection = type === 'section';
    const questionText = qTextInput ? qTextInput.value.trim() : '';
    const points = isSection ? 0 : (pointsInput ? Math.max(0, parseFloat(pointsInput.value) || 0) : 1);
    const required = isSection ? false : (reqCheckbox ? reqCheckbox.checked : true);
    const imageUrl = card.getAttribute('data-image-url') || '';
    const imagePublicId = card.getAttribute('data-image-public-id') || '';
    const secInput = card.querySelector('.gform-section-content-input');
    const sectionContent = secInput ? secInput.value.trim() : '';

    const data = {
      id: card.getAttribute('data-q-id') || `q_${Date.now()}`,
      type,
      questionText,
      sectionContent,
      imageUrl,
      imagePublicId,
      points,
      required,
      options: [],
      correctAnswer: '',
      correctOptions: [],
      pairs: [],
      answerKey: ''
    };

    if (isSection) {
      return data;
    }

    if (type === 'reorder') {
      const optRows = card.querySelectorAll('.gform-option-row');
      optRows.forEach((r) => {
        const val = r.querySelector('.gform-option-input')?.value.trim() || '';
        if (val) {
          data.options.push(val);
        }
      });
      data.correctOptions = [...data.options];
      data.correctAnswer = data.options.join(' -> ');
    } else if (OPTION_BASED_TYPES.has(type)) {
      const isMultiCorrect = type === 'checkbox' || type === 'hot_text';
      const optRows = card.querySelectorAll('.gform-option-row');
      optRows.forEach((r) => {
        const val = r.querySelector('.gform-option-input')?.value.trim() || '';
        const isCorrect = r.querySelector('.gform-correct-btn')?.classList.contains('active');
        if (val) {
          data.options.push(val);
          if (isCorrect) {
            if (isMultiCorrect) {
              data.correctOptions.push(val);
            } else {
              data.correctAnswer = val;
            }
          }
        }
      });
      if (isMultiCorrect && data.correctOptions.length === 1 && !data.correctAnswer) {
        data.correctAnswer = data.correctOptions[0];
      }
    } else if (PAIR_BASED_TYPES.has(type)) {
      const pairRows = card.querySelectorAll('.gform-match-row');
      pairRows.forEach((r) => {
        const left = r.querySelector('.gform-match-left')?.value.trim() || '';
        const right = r.querySelector('.gform-match-right')?.value.trim() || '';
        if (left || right) {
          data.pairs.push({ left, right });
        }
      });
    } else if (type === 'true_false') {
      data.options = ['True', 'False'];
      const activeTf = card.querySelector('.gform-tf-btn.active');
      data.correctAnswer = activeTf ? activeTf.getAttribute('data-tf-val') : 'True';
    } else {
      const keyInp = card.querySelector('.gform-answer-key-input');
      data.answerKey = keyInp ? keyInp.value.trim() : '';
      data.correctAnswer = data.answerKey;
    }

    return data;
  }

  function renderQuestionImageBox(card) {
    const imgContainer = card.querySelector('.gform-q-image-container');
    const fileInput = card.querySelector('.gform-q-file-input');
    const typeSelect = card.querySelector('.gform-q-type-select');
    if (!imgContainer) return;

    const imageUrl = card.getAttribute('data-image-url') || '';
    const isUploading = card.getAttribute('data-image-uploading') === 'true';
    const isIdentifyType = typeSelect && VISUAL_IMAGE_TYPES.has(typeSelect.value);

    if (isUploading) {
      imgContainer.style.display = 'block';
      imgContainer.innerHTML = `
        <div class="gform-img-dropzone uploading">
          <span class="btn-spinner" style="display:inline-block; width:18px; height:18px; border:2.5px solid rgba(224,104,75,0.25); border-top-color:var(--brand-terracotta); border-radius:50%; animation:spin 0.65s linear infinite;"></span>
          <span>Uploading picture to Cloudinary (<strong>${CLOUDINARY_CLOUD_NAME}</strong> / <code>${CLOUDINARY_UPLOAD_PRESET}</code>)...</span>
        </div>
      `;
      return;
    }

    if (imageUrl) {
      imgContainer.style.display = 'block';
      imgContainer.innerHTML = `
        <div class="gform-img-preview-card">
          <div class="gform-img-preview-frame">
            <img src="${escapeHtml(imageUrl)}" alt="Question Picture" class="gform-img-preview-el" />
          </div>
          <div class="gform-img-preview-bar">
            <span class="cloudinary-tag">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              Cloudinary Picture Attached
            </span>
            <div class="gform-img-preview-actions">
              <button type="button" class="gform-img-action-btn change-img-btn">Replace Picture</button>
              <button type="button" class="gform-img-action-btn remove-img-btn">Remove</button>
            </div>
          </div>
        </div>
      `;

      imgContainer.querySelector('.change-img-btn')?.addEventListener('click', () => {
        if (fileInput) fileInput.click();
      });
      imgContainer.querySelector('.remove-img-btn')?.addEventListener('click', () => {
        card.setAttribute('data-image-url', '');
        card.setAttribute('data-image-public-id', '');
        renderQuestionImageBox(card);
        showToast('Removed picture from question');
      });
      return;
    }

    if (isIdentifyType) {
      imgContainer.style.display = 'block';
      imgContainer.innerHTML = `
        <div class="gform-img-dropzone" title="Click to upload a picture for Labeling / Hotspot">
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
          <div class="dropzone-text-group">
            <strong>Upload Picture for Labeling / Hotspot</strong>
            <span>Click to choose an image (uploads via Cloudinary <code>${CLOUDINARY_UPLOAD_PRESET}</code>)</span>
          </div>
        </div>
      `;
      imgContainer.querySelector('.gform-img-dropzone')?.addEventListener('click', () => {
        if (fileInput) fileInput.click();
      });
    } else {
      imgContainer.style.display = 'none';
      imgContainer.innerHTML = '';
    }
  }

  function createExamQuestionCard(initialData) {
    const qData = initialData || createDefaultQuestionData('mcq');
    const card = document.createElement('div');
    card.className = 'gform-question-card glass-card-dash';
    card.setAttribute('data-q-id', qData.id || `q_${Date.now()}`);
    card.setAttribute('data-image-url', qData.imageUrl || '');
    card.setAttribute('data-image-public-id', qData.imagePublicId || '');

    const isSectionInit = qData.type === 'section';
    const promptPlaceholder = isSectionInit
      ? 'Enter Passage Title / Heading (e.g. Part 1: Read the Passage Below)...'
      : 'Enter your question prompt here...';

    // Map legacy aliases to their canonical option value for the select dropdown
    const rawType = qData.type || 'mcq';
    const selectTypeVal =
      rawType === 'short_answer'
        ? 'fill_blank'
        : rawType === 'long_answer'
        ? 'open_ended'
        : rawType === 'image_identify'
        ? 'labeling'
        : rawType === 'radio'
        ? 'mcq'
        : rawType;
    qData.type = selectTypeVal;

    card.innerHTML = `
      <div class="gform-q-top-row">
        <span class="gform-q-num">${isSectionInit ? 'SEC' : 'Q1'}</span>
        <div class="gform-q-prompt-wrap">
          <textarea
            class="gform-q-prompt-input"
            rows="1"
            placeholder="${promptPlaceholder}"
            required
          >${escapeHtml(qData.questionText || '')}</textarea>
          <span class="field-error gform-q-error"></span>
        </div>

        <button type="button" class="gform-upload-img-btn" title="Upload picture for this question or passage (Cloudinary)">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
          <span>Picture</span>
        </button>
        <input type="file" accept="image/*" class="gform-q-file-input" style="display: none;" />

        <div class="gform-q-type-wrap">
          <select class="gform-q-type-select" aria-label="Question Type">
            <optgroup label="Basic">
              <option value="mcq" ${selectTypeVal === 'mcq' ? 'selected' : ''}>Multiple choice</option>
              <option value="checkbox" ${selectTypeVal === 'checkbox' ? 'selected' : ''}>Multi-select</option>
              <option value="true_false" ${selectTypeVal === 'true_false' ? 'selected' : ''}>True or false</option>
            </optgroup>
            <optgroup label="Interactive &amp; higher order">
              <option value="drag_drop" ${selectTypeVal === 'drag_drop' ? 'selected' : ''}>Drag and drop</option>
              <option value="dropdown" ${selectTypeVal === 'dropdown' ? 'selected' : ''}>Dropdown</option>
              <option value="categorize" ${selectTypeVal === 'categorize' ? 'selected' : ''}>Categorize</option>
              <option value="reorder" ${selectTypeVal === 'reorder' ? 'selected' : ''}>Reorder</option>
              <option value="match" ${selectTypeVal === 'match' ? 'selected' : ''}>Match</option>
              <option value="match_grid" ${selectTypeVal === 'match_grid' ? 'selected' : ''}>Match Table Grid</option>
            </optgroup>
            <optgroup label="Visual learning">
              <option value="labeling" ${selectTypeVal === 'labeling' ? 'selected' : ''}>Labeling</option>
              <option value="hotspot" ${selectTypeVal === 'hotspot' ? 'selected' : ''}>Hotspot</option>
            </optgroup>
          </select>
        </div>
      </div>

      <div class="gform-q-image-container" style="display: none;"></div>
      <div class="gform-q-body"></div>

      <div class="gform-q-footer">
        <div class="gform-section-footer-note" style="display: ${isSectionInit ? 'inline-flex' : 'none'};">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
          </svg>
          <span>Read-Only Passage • No Question Answer / 0 Pts</span>
        </div>
        <div class="gform-points-box" style="display: ${isSectionInit ? 'none' : 'flex'};">
          <label>Points:</label>
          <input
            type="number"
            class="gform-points-input"
            min="0"
            max="100"
            step="1"
            value="${qData.points !== undefined ? qData.points : 1}"
          />
        </div>

        <div class="gform-q-actions">
          <label class="gform-req-toggle" style="display: ${isSectionInit ? 'none' : 'inline-flex'};">
            <input type="checkbox" class="gform-req-checkbox" ${qData.required !== false ? 'checked' : ''} />
            <span>Required</span>
          </label>

          <button type="button" class="gform-icon-btn gform-dup-q-btn" title="Duplicate Question">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Duplicate</span>
          </button>

          <button type="button" class="gform-icon-btn gform-delete-q-btn" title="Delete Question">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>Delete</span>
          </button>
        </div>
      </div>
    `;

    const bodyContainer = card.querySelector('.gform-q-body');
    const typeSelect = card.querySelector('.gform-q-type-select');
    const promptInput = card.querySelector('.gform-q-prompt-input');
    const promptError = card.querySelector('.gform-q-error');
    const uploadImgBtn = card.querySelector('.gform-upload-img-btn');
    const fileInput = card.querySelector('.gform-q-file-input');
    const pointsInput = card.querySelector('.gform-points-input');
    const dupBtn = card.querySelector('.gform-dup-q-btn');
    const delBtn = card.querySelector('.gform-delete-q-btn');

    if (promptInput) {
      promptInput.value = qData.questionText || '';
    }
    renderQuestionImageBox(card);
    renderQuestionBodyByType(bodyContainer, qData);
    autoResizeTextarea(promptInput, 42);

    if (uploadImgBtn && fileInput) {
      uploadImgBtn.addEventListener('click', () => {
        fileInput.click();
      });

      fileInput.addEventListener('change', async () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
          showToast('Please select a valid image file (PNG, JPG, WEBP)');
          fileInput.value = '';
          return;
        }

        card.setAttribute('data-image-uploading', 'true');
        uploadImgBtn.disabled = true;
        renderQuestionImageBox(card);

        try {
          const uploaded = await uploadQuestionImageToCloudinary(file);
          card.setAttribute('data-image-url', uploaded.imageUrl);
          card.setAttribute('data-image-public-id', uploaded.imagePublicId);
          if (promptInput && !promptInput.value.trim()) {
            promptInput.value = 'Identify the picture shown below:';
          }
          showToast('Picture uploaded to Cloudinary!');
        } catch (err) {
          console.error('Cloudinary image upload error:', err);
          showToast(`Image upload error: ${err.message || 'Check Cloudinary preset'}`);
        } finally {
          card.setAttribute('data-image-uploading', 'false');
          uploadImgBtn.disabled = false;
          fileInput.value = '';
          renderQuestionImageBox(card);
        }
      });
    }

    if (promptInput) {
      promptInput.addEventListener('input', () => {
        promptInput.classList.remove('error');
        if (promptError) promptError.textContent = '';
      });
    }

    if (typeSelect) {
      typeSelect.addEventListener('change', () => {
        const currentExtracted = extractQuestionDataFromCard(card);
        currentExtracted.type = typeSelect.value;
        if (promptInput) {
          promptInput.placeholder =
            typeSelect.value === 'section'
              ? 'Enter Passage Title / Heading (e.g. Part 1: Read the Passage Below)...'
              : 'Enter your question prompt here...';
        }
        if (VISUAL_IMAGE_TYPES.has(typeSelect.value) && promptInput && !promptInput.value.trim()) {
          promptInput.value = 'Identify / select the target in the picture shown below:';
          currentExtracted.questionText = promptInput.value;
        }
        if (currentExtracted.options.length === 0) {
          currentExtracted.options =
            typeSelect.value === 'reorder'
              ? ['Step 1 (First)', 'Step 2 (Second)', 'Step 3 (Third)']
              : typeSelect.value === 'hotspot'
              ? ['Zone A (Top-Left)', 'Zone B (Top-Right)', 'Zone C (Center)', 'Zone D (Bottom)']
              : ['Option 1', 'Option 2'];
        }
        if (currentExtracted.pairs.length === 0) {
          currentExtracted.pairs = [
            { left: 'Item A', right: 'Match 1' },
            { left: 'Item B', right: 'Match 2' }
          ];
        }
        renderQuestionImageBox(card);
        renderQuestionBodyByType(bodyContainer, currentExtracted);
        updateExamBuilderCounters();
      });
    }

    if (pointsInput) {
      pointsInput.addEventListener('input', updateExamBuilderCounters);
    }

    if (dupBtn) {
      dupBtn.addEventListener('click', () => {
        const clonedData = extractQuestionDataFromCard(card);
        clonedData.id = `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const newCard = createExamQuestionCard(clonedData);
        card.insertAdjacentElement('afterend', newCard);
        updateExamBuilderCounters();
        showToast('Question duplicated');
      });
    }

    if (delBtn) {
      delBtn.addEventListener('click', () => {
        if (examQuestionsList && examQuestionsList.querySelectorAll('.gform-question-card').length > 1) {
          card.remove();
          updateExamBuilderCounters();
          showToast('Question removed');
        }
      });
    }

    return card;
  }

  // Share Question Maker & Valuation Link Modal + Standalone Shared Mode
  const shareExamLinkBtn = document.getElementById('shareExamLinkBtn');
  const shareExamModal = document.getElementById('shareExamModal');
  const shareExamModalCloseX = document.getElementById('shareExamModalCloseX');
  const shareExamModalTitle = document.getElementById('shareExamModalTitle');
  const shareExamModalSubtitle = document.getElementById('shareExamModalSubtitle');
  const shareExamUrlLabel = document.getElementById('shareExamUrlLabel');
  const shareExamModalNote = document.getElementById('shareExamModalNote');
  const shareModalProgName = document.getElementById('shareModalProgName');
  const shareModalCategory = document.getElementById('shareModalCategory');
  const shareExamUrlInput = document.getElementById('shareExamUrlInput');
  const copyShareExamUrlBtn = document.getElementById('copyShareExamUrlBtn');
  const copyShareBtnText = document.getElementById('copyShareBtnText');

  function buildShareExamUrl(prog) {
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const progName = prog.programName || '';
    const catName = prog.category || 'General';
    const params = new URLSearchParams();
    params.set('shareExam', '1');
    params.set('program', progName);
    params.set('category', catName);
    params.set('sig', computeShareSignature('exam', progName, catName));
    return `${baseUrl}?${params.toString()}`;
  }

  function buildShareValuationUrl(prog) {
    const baseUrl = `${window.location.origin}${window.location.pathname}`;
    const progName = prog && prog.programName && prog.programName !== 'all' ? prog.programName : 'all';
    const catName = progName === 'all' ? 'General' : (prog.category || 'General');
    const params = new URLSearchParams();
    params.set('shareValuation', '1');
    params.set('program', progName);
    params.set('category', catName);
    params.set('sig', computeShareSignature('valuation', progName, catName));
    return `${baseUrl}?${params.toString()}`;
  }

  async function copyTextToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}
    try {
      if (shareExamUrlInput) {
        shareExamUrlInput.focus();
        shareExamUrlInput.select();
        document.execCommand('copy');
        return true;
      }
    } catch (e) {}
    return false;
  }

  async function openShareExamModal(prog) {
    if (!prog) return;
    const shareUrl = buildShareExamUrl(prog);

    if (shareExamModalTitle) shareExamModalTitle.textContent = 'Share Question Maker Link';
    if (shareExamModalSubtitle) shareExamModalSubtitle.textContent = "Opens only this program's question-making page";
    if (shareExamUrlLabel) shareExamUrlLabel.textContent = 'Direct Question-Making URL';
    if (shareExamModalNote) {
      shareExamModalNote.innerHTML = 'Anyone with this link can open and edit questions <strong>only for this program</strong> without accessing any other Admin panels.';
    }

    if (shareModalProgName) shareModalProgName.textContent = prog.programName || 'Program';
    if (shareModalCategory) shareModalCategory.textContent = prog.category || 'General';
    if (shareExamUrlInput) shareExamUrlInput.value = shareUrl;
    if (copyShareBtnText) copyShareBtnText.textContent = 'Copy Link';

    if (shareExamModal) {
      shareExamModal.classList.add('open');
      shareExamModal.setAttribute('aria-hidden', 'false');
    }

    const copied = await copyTextToClipboard(shareUrl);
    if (copied) {
      if (copyShareBtnText) copyShareBtnText.textContent = 'Copied!';
      showToast(`Share link copied for "${prog.programName}"!`);
    }
  }

  async function openShareValuationModal(prog) {
    const isAllProgs = !prog || !prog.programName || prog.programName === 'all';
    const shareUrl = buildShareValuationUrl(prog);

    if (shareExamModalTitle) shareExamModalTitle.textContent = 'Share Program Valuation Link';
    if (shareExamModalSubtitle) {
      shareExamModalSubtitle.textContent = isAllProgs
        ? 'Opens only the student exam valuation portal'
        : "Opens only this program's exam valuation page";
    }
    if (shareExamUrlLabel) shareExamUrlLabel.textContent = 'Direct Valuation URL';
    if (shareExamModalNote) {
      shareExamModalNote.innerHTML = isAllProgs
        ? 'Anyone with this link can review submitted student exams and perform valuation <strong>only in the Valuation panel</strong> without accessing other Admin tabs.'
        : 'Anyone with this link can review submitted student exams and perform valuation <strong>only for this program</strong> without accessing any other Admin panels.';
    }

    if (shareModalProgName) {
      shareModalProgName.textContent = isAllProgs ? 'All Programs Valuation' : prog.programName;
    }
    if (shareModalCategory) {
      shareModalCategory.textContent = isAllProgs ? 'Valuation Portal' : (prog.category || 'General');
    }
    if (shareExamUrlInput) shareExamUrlInput.value = shareUrl;
    if (copyShareBtnText) copyShareBtnText.textContent = 'Copy Link';

    if (shareExamModal) {
      shareExamModal.classList.add('open');
      shareExamModal.setAttribute('aria-hidden', 'false');
    }

    const copied = await copyTextToClipboard(shareUrl);
    if (copied) {
      if (copyShareBtnText) copyShareBtnText.textContent = 'Copied!';
      showToast(
        isAllProgs
          ? 'Valuation portal share link copied!'
          : `Valuation share link copied for "${prog.programName}"!`
      );
    }
  }

  function closeShareExamModal() {
    if (!shareExamModal) return;
    shareExamModal.classList.remove('open');
    shareExamModal.setAttribute('aria-hidden', 'true');
  }

  if (shareExamLinkBtn) {
    shareExamLinkBtn.addEventListener('click', () => {
      if (activeExamProgram) {
        openShareExamModal(activeExamProgram);
      }
    });
  }

  if (shareExamModalCloseX) {
    shareExamModalCloseX.addEventListener('click', closeShareExamModal);
  }

  if (shareExamModal) {
    shareExamModal.addEventListener('click', (e) => {
      if (e.target === shareExamModal) closeShareExamModal();
    });
  }

  if (copyShareExamUrlBtn) {
    copyShareExamUrlBtn.addEventListener('click', async () => {
      const urlVal = shareExamUrlInput ? shareExamUrlInput.value : '';
      if (!urlVal) return;
      await copyTextToClipboard(urlVal);
      if (copyShareBtnText) copyShareBtnText.textContent = 'Copied!';
      showToast('Share link copied to clipboard!');
    });
  }

  async function activateSharedExamBuilderFromUrl() {
    if (!isSharedExamStandaloneMode) return;
    const progNameParam = (urlParams.get('program') || '').trim();
    const catParam = (urlParams.get('category') || 'General').trim();
    if (!progNameParam) return;

    document.body.classList.add('shared-exam-builder-mode');
    document.title = `${progNameParam} (${catParam}) — Question Maker`;

    // Physically remove all other Admin views, sidebar, breadcrumbs, and Share/Back buttons from DOM
    [
      '#adminSidebar',
      '.breadcrumb-container',
      '#programsView',
      '#candidatesView',
      '#questionView',
      '#valuationView',
      '#valuationSheetView',
      '#settingsView',
      '#addRecordModal',
      '#shareExamModal',
      '#shareExamLinkBtn',
      '#examBuilderBackBtn',
      '#setExamPageView .builder-topbar-divider'
    ].forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => el.remove());
    });

    const key = makeProgramExamKey(progNameParam, catParam);
    const savedExams = getSavedExamsMap();
    const localExam = savedExams[key] || {};
    const allRecords = await getAllRecordsFromDB();
    const matchingRec = allRecords.find(
      (r) => makeProgramExamKey(r.programName, r.category) === key
    );

    const progObj = {
      key,
      programName: matchingRec?.programName || progNameParam,
      category: matchingRec?.category || catParam,
      examQuestion: matchingRec?.examQuestion || localExam.examQuestion || '',
      examDuration: matchingRec?.examDuration || localExam.examDuration || '',
      examDescription: matchingRec?.examDescription || localExam.examDescription || '',
      examQuestions:
        Array.isArray(matchingRec?.examQuestions) && matchingRec.examQuestions.length > 0
          ? matchingRec.examQuestions
          : Array.isArray(localExam.examQuestions)
          ? localExam.examQuestions
          : []
    };

    openSetExamPage(progObj);
  }

  function openSetExamPage(prog) {
    if (!setExamPageView) return;
    activeExamProgram = prog;

    hideAllMainSubviews();
    setExamPageView.classList.add('active');
    setExamPageView.style.display = 'flex';

    if (isSharedExamStandaloneMode) {
      if (examBuilderBackBtn) examBuilderBackBtn.style.display = 'none';
      const topDivider = setExamPageView.querySelector('.builder-topbar-divider');
      if (topDivider) topDivider.style.display = 'none';
      if (breadcrumbParent) breadcrumbParent.style.display = 'none';
      if (breadcrumbParentSep) breadcrumbParentSep.style.display = 'none';
    } else {
      if (examBuilderBackBtn) examBuilderBackBtn.style.display = '';
      if (breadcrumbParent) {
        breadcrumbParent.textContent = 'Question';
        breadcrumbParent.style.display = '';
      }
      if (breadcrumbParentSep) breadcrumbParentSep.style.display = '';
      if (breadcrumbLabel) breadcrumbLabel.textContent = `${prog.programName} (Set Exam)`;
    }

    if (examModalProgramName) examModalProgramName.textContent = prog.programName;
    if (examModalCategory) examModalCategory.textContent = prog.category;
    if (examFormDescriptionInput) examFormDescriptionInput.value = prog.examDescription || '';
    if (examDurationInput) examDurationInput.value = prog.examDuration || '';

    if (examQuestionsList) {
      examQuestionsList.innerHTML = '';
      let existingQuestions = Array.isArray(prog.examQuestions) ? prog.examQuestions : [];

      if (existingQuestions.length === 0 && prog.examQuestion && prog.examQuestion.trim()) {
        existingQuestions = [
          {
            ...createDefaultQuestionData('short_answer'),
            questionText: prog.examQuestion.trim()
          }
        ];
      }

      if (existingQuestions.length === 0) {
        existingQuestions = [createDefaultQuestionData('mcq')];
      }

      existingQuestions.forEach((q) => {
        examQuestionsList.appendChild(createExamQuestionCard(q));
      });

      updateExamBuilderCounters();
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeSetExamPage() {
    if (setExamPageView) {
      setExamPageView.classList.remove('active');
      setExamPageView.style.display = 'none';
    }
    if (questionView) {
      questionView.classList.add('active');
      questionView.style.display = 'flex';
    }
    if (breadcrumbParent) breadcrumbParent.style.display = 'none';
    if (breadcrumbParentSep) breadcrumbParentSep.style.display = 'none';
    if (breadcrumbLabel) breadcrumbLabel.textContent = 'Question';
    activeExamProgram = null;
    loadAndRenderQuestionTable();
  }

  if (examBuilderBackBtn) {
    examBuilderBackBtn.addEventListener('click', closeSetExamPage);
  }

  function addNewQuestionCardToBuilder(type = 'mcq') {
    if (!examQuestionsList) return;
    const card = createExamQuestionCard(createDefaultQuestionData(type));
    examQuestionsList.appendChild(card);
    updateExamBuilderCounters();
    const promptInput = card.querySelector('.gform-q-prompt-input');
    if (promptInput) promptInput.focus();
  }

  const addExamSectionTopBtn = document.getElementById('addExamSectionTopBtn');
  const addExamSectionBtn = document.getElementById('addExamSectionBtn');

  if (addExamQuestionBtn) {
    addExamQuestionBtn.addEventListener('click', () => addNewQuestionCardToBuilder('mcq'));
  }

  if (addExamQuestionTopBtn) {
    addExamQuestionTopBtn.addEventListener('click', () => addNewQuestionCardToBuilder('mcq'));
  }

  if (addExamSectionTopBtn) {
    addExamSectionTopBtn.addEventListener('click', () => addNewQuestionCardToBuilder('section'));
  }

  if (addExamSectionBtn) {
    addExamSectionBtn.addEventListener('click', () => addNewQuestionCardToBuilder('section'));
  }

  quickTypeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const qType = btn.getAttribute('data-qtype') || 'mcq';
      addNewQuestionCardToBuilder(qType);
    });
  });

  // ==========================================================================
  // Bulk Upload Questions (JSON File / ChatGPT JSON Import)
  // ==========================================================================
  const bulkUploadQuestionsTopBtn = document.getElementById('bulkUploadQuestionsTopBtn');
  const bulkUploadQuestionsBottomBtn = document.getElementById('bulkUploadQuestionsBottomBtn');
  const bulkUploadQuestionsModal = document.getElementById('bulkUploadQuestionsModal');
  const bulkUploadModalCloseX = document.getElementById('bulkUploadModalCloseX');
  const bulkModalCancelBtn = document.getElementById('bulkModalCancelBtn');
  const bulkQuestionTypeSelect = document.getElementById('bulkQuestionTypeSelect');
  const bulkImportModeSelect = document.getElementById('bulkImportModeSelect');
  const bulkMultiTypeChips = document.getElementById('bulkMultiTypeChips');
  const bulkSelectAllTypesBtn = document.getElementById('bulkSelectAllTypesBtn');
  const bulkJsonDropzone = document.getElementById('bulkJsonDropzone');
  const bulkJsonFileInput = document.getElementById('bulkJsonFileInput');
  const bulkJsonFileNameText = document.getElementById('bulkJsonFileNameText');
  const bulkJsonFileSubText = document.getElementById('bulkJsonFileSubText');
  const bulkJsonTextarea = document.getElementById('bulkJsonTextarea');
  const bulkJsonPreviewBadge = document.getElementById('bulkJsonPreviewBadge');
  const bulkJsonError = document.getElementById('bulkJsonError');
  const copyBulkPromptBtn = document.getElementById('copyBulkPromptBtn');
  const confirmBulkImportBtn = document.getElementById('confirmBulkImportBtn');

  let userChangedBulkTypeExplicitly = false;

  const BULK_TYPE_LABELS = {
    mcq: 'Multiple choice',
    checkbox: 'Multi-select',
    true_false: 'True or false',
    drag_drop: 'Drag and drop',
    dropdown: 'Dropdown',
    categorize: 'Categorize',
    reorder: 'Reorder',
    match: 'Match',
    match_grid: 'Match Table Grid',
    labeling: 'Labeling',
    hotspot: 'Hotspot',
    radio: 'Multiple choice',
    image_identify: 'Labeling'
  };

  const BULK_SAMPLE_OBJECTS = {
    mcq: {
      type: 'mcq',
      questionText: 'What is the capital of India?',
      options: ['Mumbai', 'New Delhi', 'Kolkata', 'Chennai'],
      correctAnswer: 'New Delhi',
      points: 1,
      required: true
    },
    checkbox: {
      type: 'checkbox',
      questionText: 'Which of the following are programming languages? (Multi-select)',
      options: ['Python', 'HTML', 'JavaScript', 'CSS'],
      correctOptions: ['Python', 'JavaScript'],
      points: 2,
      required: true
    },
    true_false: {
      type: 'true_false',
      questionText: 'The sun rises in the East.',
      options: ['True', 'False'],
      correctAnswer: 'True',
      points: 1,
      required: true
    },
    drag_drop: {
      type: 'drag_drop',
      questionText: 'Drag and drop the correct term into each target slot:',
      pairs: [
        { left: 'Connects muscle to bone', right: 'Tendon' },
        { left: 'Connects bone to bone', right: 'Ligament' }
      ],
      points: 2,
      required: true
    },
    dropdown: {
      type: 'dropdown',
      questionText: 'Select the correct festival category:',
      options: ['Bidaya', 'Ūlā', 'Thāniya', 'Thānawiyya', 'Āliya'],
      correctAnswer: 'Āliya',
      points: 1,
      required: true
    },
    categorize: {
      type: 'categorize',
      questionText: 'Categorize each item into its correct group:',
      pairs: [
        { left: 'Naskh', right: 'Arabic Script' },
        { left: 'Thuluth', right: 'Arabic Script' },
        { left: 'Astrolabe', right: 'Scientific Instrument' }
      ],
      points: 3,
      required: true
    },
    reorder: {
      type: 'reorder',
      questionText: 'Arrange the following historical eras in chronological order (earliest to latest):',
      options: ['Rashidun Caliphate', 'Umayyad Caliphate', 'Abbasid Caliphate', 'Ottoman Empire'],
      points: 2,
      required: true
    },
    match: {
      type: 'match',
      questionText: 'Match the authors with their famous works:',
      pairs: [
        { left: 'Ibn Khaldun', right: 'Muqaddimah' },
        { left: 'Al-Ghazali', right: 'Ihya Ulum al-Din' }
      ],
      points: 2,
      required: true
    },
    match_grid: {
      type: 'match_grid',
      questionText: 'Match each scholar in the rows with their primary field in the column grid:',
      pairs: [
        { left: 'Ibn Sina', right: 'Medicine' },
        { left: 'Al-Khwarizmi', right: 'Mathematics' },
        { left: 'Ibn Battuta', right: 'Geography & Travel' }
      ],
      points: 3,
      required: true
    },
    labeling: {
      type: 'labeling',
      questionText: 'Identify / label the historical monument shown in the picture:',
      imageUrl: 'https://res.cloudinary.com/da6fjyirm/image/upload/sample.jpg',
      answerKey: 'Al-Aqsa Mosque',
      points: 2,
      required: true
    },
    hotspot: {
      type: 'hotspot',
      questionText: 'Select the correct Hotspot target zone on the diagram above:',
      imageUrl: 'https://res.cloudinary.com/da6fjyirm/image/upload/sample.jpg',
      options: ['Zone A (Top-Left)', 'Zone B (Top-Right)', 'Zone C (Center)', 'Zone D (Bottom)'],
      correctAnswer: 'Zone C (Center)',
      points: 2,
      required: true
    }
  };

  function getSelectedBulkTypesArray() {
    if (!bulkMultiTypeChips) return ['mcq'];
    const activeChips = Array.from(bulkMultiTypeChips.querySelectorAll('.bulk-type-chip.active'));
    const types = activeChips.map((c) => c.getAttribute('data-btype')).filter(Boolean);
    return types.length > 0 ? types : ['mcq'];
  }

  function syncBulkTypeChipLabels() {
    if (!bulkMultiTypeChips) return;
    bulkMultiTypeChips.querySelectorAll('.bulk-type-chip').forEach((chip) => {
      const t = chip.getAttribute('data-btype') || '';
      const baseLabel = BULK_TYPE_LABELS[t] || t;
      const isActive = chip.classList.contains('active');
      chip.textContent = isActive ? `✓ ${baseLabel}` : baseLabel;
    });
  }

  function buildDynamicChatGptPrompt() {
    const selectedTypes = getSelectedBulkTypesArray();
    const typesListStr = selectedTypes.map((t) => `"${t}"`).join(', ');
    return `You are an expert Exam JSON Converter for the Sibaq '26 Exam Portal.
Convert the raw bulk exam text and questions I provide below into a SINGLE valid JSON array [ ... ] supporting all 11 question types (Wayground / Quizizz model).

CRITICAL FULL-TEXT & COMPLETENESS RULES:
1. LOAD 100% OF THE FULL TEXT: NEVER summarize, shorten, paraphrase, or truncate any question prompt, option, or answer key with "...". Copy the 100% complete, unabridged, word-for-word full text into the JSON fields.
2. CONVERT EVERY SINGLE ITEM: Convert ALL questions from start to finish without skipping any items.
3. MULTI-LINE TEXT: Preserve all paragraphs and multi-line statements using \\n inside JSON strings so the JSON is 100% valid.
4. Output ONLY raw, valid JSON (a single array [ ... ]). Do NOT include extra commentary outside the JSON block.
5. Preferred / Selected "type" values for this exam: ${typesListStr}
   (All 11 supported "type" values: "mcq" [Multiple choice], "checkbox" [Multi-select], "true_false" [True or false], "drag_drop" [Drag and drop], "dropdown" [Dropdown], "categorize" [Categorize], "reorder" [Reorder], "match" [Match], "match_grid" [Match Table Grid], "labeling" [Labeling], "hotspot" [Hotspot]).
6. Schema per item type in the same JSON array:
- "mcq" / "dropdown": { "type": "mcq", "questionText": "Full question text", "options": ["Option A", "Option B", "Option C", "Option D"], "correctAnswer": "Option B", "points": 1, "required": true }
- "checkbox" (Multi-select): { "type": "checkbox", "questionText": "Full question text", "options": ["Opt 1", "Opt 2", "Opt 3"], "correctOptions": ["Opt 1", "Opt 3"], "points": 2, "required": true }
- "true_false": { "type": "true_false", "questionText": "Full statement", "options": ["True", "False"], "correctAnswer": "True", "points": 1, "required": true }
- "drag_drop" / "categorize" / "match" / "match_grid": { "type": "match", "questionText": "Full question text", "pairs": [{ "left": "Item / Premise / Target", "right": "Match / Dropped Token / Category" }], "points": 2, "required": true }
- "reorder": { "type": "reorder", "questionText": "Arrange in the correct order:", "options": ["First item", "Second item", "Third item"], "points": 2, "required": true }
- "labeling": { "type": "labeling", "questionText": "Identify / label the diagram:", "imageUrl": "", "answerKey": "Expected label", "points": 2, "required": true }
- "hotspot": { "type": "hotspot", "questionText": "Select the target zone on the image:", "imageUrl": "", "options": ["Zone A", "Zone B", "Zone C"], "correctAnswer": "Zone B", "points": 2, "required": true }

Strip leading question numbers (like "1.", "Q1)") and option prefixes (like "A)", "(a)") while keeping 100% of the actual text intact.

Now convert the following bulk exam text (keeping 100% of the full text for every question, option, and answer) into a single JSON array:

`;
  }

  function getSampleJsonForType(type) {
    if (type === 'auto') {
      const selectedTypes = getSelectedBulkTypesArray();
      const sampleArr = selectedTypes.map((t) => BULK_SAMPLE_OBJECTS[t] || BULK_SAMPLE_OBJECTS.mcq);
      return JSON.stringify(sampleArr, null, 2);
    }
    const singleObj = BULK_SAMPLE_OBJECTS[type] || BULK_SAMPLE_OBJECTS.mcq;
    return JSON.stringify([singleObj], null, 2);
  }

  function normalizeQuestionTypeString(rawType) {
    if (!rawType) return '';
    const t = String(rawType).trim().toLowerCase().replace(/[\s-&/]+/g, '_');
    const map = {
      mcq: 'mcq',
      multiple_choice: 'mcq',
      multiplechoice: 'mcq',
      choice: 'mcq',
      single_choice: 'mcq',
      radio: 'mcq',
      radio_buttons: 'mcq',
      checkbox: 'checkbox',
      checkboxes: 'checkbox',
      multi_select: 'checkbox',
      multiselect: 'checkbox',
      multiple_select: 'checkbox',
      multiple_selection: 'checkbox',
      true_false: 'true_false',
      true_or_false: 'true_false',
      boolean: 'true_false',
      tf: 'true_false',
      fill_blank: 'fill_blank',
      fill_in_the_blanks: 'fill_blank',
      fill_in_the_blank: 'fill_blank',
      fill_blanks: 'fill_blank',
      blank: 'fill_blank',
      blanks: 'fill_blank',
      short_answer: 'fill_blank',
      short: 'fill_blank',
      one_word: 'fill_blank',
      text: 'fill_blank',
      open_ended: 'open_ended',
      openended: 'open_ended',
      long_answer: 'open_ended',
      long: 'open_ended',
      paragraph: 'open_ended',
      essay: 'open_ended',
      descriptive: 'open_ended',
      table_fill: 'table_fill',
      table_fill_in: 'table_fill',
      tablefillin: 'table_fill',
      table: 'table_fill',
      section: 'section',
      passage: 'section',
      reading: 'section',
      reading_passage: 'section',
      comprehension: 'section',
      instructions: 'section',
      header: 'section',
      drag_drop: 'drag_drop',
      drag_and_drop: 'drag_drop',
      dragdrop: 'drag_drop',
      dropdown: 'dropdown',
      select: 'dropdown',
      categorize: 'categorize',
      categorise: 'categorize',
      category: 'categorize',
      classification: 'categorize',
      sorting: 'categorize',
      reorder: 'reorder',
      re_order: 'reorder',
      order: 'reorder',
      ordering: 'reorder',
      sequence: 'reorder',
      arrange: 'reorder',
      match: 'match',
      matching: 'match',
      match_the_following: 'match',
      match_grid: 'match_grid',
      match_table_grid: 'match_grid',
      matchtablegrid: 'match_grid',
      matrix: 'match_grid',
      grid: 'match_grid',
      hot_text: 'hot_text',
      hottext: 'hot_text',
      labeling: 'labeling',
      labelling: 'labeling',
      label: 'labeling',
      image_identify: 'labeling',
      image: 'labeling',
      picture: 'labeling',
      identify: 'labeling',
      hotspot: 'hotspot',
      hot_spot: 'hotspot'
    };
    return map[t] || '';
  }

  function repairJsonControlCharsInStrings(src) {
    let out = '';
    let inString = false;
    let escaped = false;
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (inString) {
        if (escaped) {
          out += ch;
          escaped = false;
        } else if (ch === '\\') {
          out += ch;
          escaped = true;
        } else if (ch === '"') {
          // Check if this '"' is truly the end of a JSON key/string value
          // (must be followed by optional whitespace and then ':', ',', '}', ']', or end of string)
          let j = i + 1;
          while (j < src.length && (src[j] === ' ' || src[j] === '\t' || src[j] === '\r' || src[j] === '\n')) {
            j++;
          }
          const nextCh = j < src.length ? src[j] : '';
          if (!nextCh || nextCh === ':' || nextCh === ',' || nextCh === '}' || nextCh === ']') {
            out += ch;
            inString = false;
          } else {
            // Unescaped inner quote inside a string (e.g. Match the Malayalam term "തരുണാസ്ഥി")
            out += '\\"';
          }
        } else if (ch === '\n') {
          out += '\\n';
        } else if (ch === '\r') {
          // skip CR inside string literal
        } else if (ch === '\t') {
          out += '\\t';
        } else {
          out += ch;
        }
      } else {
        if (ch === '"') {
          inString = true;
        }
        out += ch;
      }
    }
    return out;
  }

  function extractAndParseJsonRobust(rawText) {
    let text = String(rawText || '').trim();
    if (!text) {
      throw new Error('Please upload a .json file or paste JSON content.');
    }

    // 1. Strip markdown code block fences if present anywhere
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch && fenceMatch[1]) {
      text = fenceMatch[1].trim();
    } else {
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    }

    // 2. Locate outermost JSON array [...] or object {...}
    const firstBracket = text.indexOf('[');
    const firstBrace = text.indexOf('{');
    let startIdx = -1;
    let isArrayStart = true;

    if (firstBracket !== -1 && (firstBrace === -1 || firstBracket < firstBrace)) {
      startIdx = firstBracket;
      isArrayStart = true;
    } else if (firstBrace !== -1) {
      startIdx = firstBrace;
      isArrayStart = false;
    }

    if (startIdx > 0) {
      text = text.slice(startIdx);
    }

    const lastClose = isArrayStart ? text.lastIndexOf(']') : text.lastIndexOf('}');
    if (lastClose !== -1 && lastClose < text.length - 1) {
      text = text.slice(0, lastClose + 1);
    }

    // Remove trailing commas before } or ]
    const cleanTrailingCommas = (s) => s.replace(/,\s*([}\]])/g, '$1');

    // Attempt 1: Direct parse
    try {
      return JSON.parse(text);
    } catch (e1) {
      // Attempt 2: Repair unescaped newlines/tabs inside JSON strings & trailing commas
      const repaired = cleanTrailingCommas(repairJsonControlCharsInStrings(text));
      try {
        return JSON.parse(repaired);
      } catch (e2) {
        // Attempt 3: If a large JSON array was truncated at the end, salvage all complete {...} objects
        if (isArrayStart) {
          const lastCompleteObjEnd = repaired.lastIndexOf('}');
          if (lastCompleteObjEnd !== -1) {
            const salvaged = cleanTrailingCommas(repaired.slice(0, lastCompleteObjEnd + 1)) + ']';
            try {
              return JSON.parse(salvaged);
            } catch (e3) {
              // fall through to original error
            }
          }
        }
        throw new Error(`Invalid JSON syntax: ${e1.message}`);
      }
    }
  }

  let lastParsedExamMeta = { examDescription: '', examDuration: '' };

  function parseAndNormalizeBulkJson(rawText) {
    const parsed = extractAndParseJsonRobust(rawText);
    lastParsedExamMeta = { examDescription: '', examDuration: '' };

    let rawArray = [];
    if (Array.isArray(parsed)) {
      rawArray = parsed;
    } else if (parsed && typeof parsed === 'object') {
      lastParsedExamMeta.examDescription = String(
        parsed.examDescription || parsed.instructions || parsed.description || ''
      ).trim();
      lastParsedExamMeta.examDuration = String(
        parsed.examDuration || parsed.duration || parsed.timeLimit || ''
      ).trim();

      if (Array.isArray(parsed.questions)) rawArray = parsed.questions;
      else if (Array.isArray(parsed.examQuestions)) rawArray = parsed.examQuestions;
      else if (Array.isArray(parsed.items)) rawArray = parsed.items;
      else if (Array.isArray(parsed.sections)) rawArray = parsed.sections;
      else if (Array.isArray(parsed.data)) rawArray = parsed.data;
      else rawArray = [parsed];
    }

    if (rawArray.length === 0) {
      throw new Error('No question objects found in the JSON.');
    }

    const selectedType = bulkQuestionTypeSelect ? bulkQuestionTypeSelect.value : 'auto';

    return rawArray.map((item, idx) => {
      if (!item || typeof item !== 'object') {
        throw new Error(`Item #${idx + 1} is not a valid JSON object.`);
      }

      const rawSectionBody = String(
        item.sectionContent ??
          item.passage ??
          item.fullText ??
          item.readingText ??
          item.readingPassage ??
          item.content ??
          item.body ??
          item.paragraph ??
          item.context ??
          item.description ??
          item.instructions ??
          item.subText ??
          item.details ??
          ''
      ).trim();

      const explicitType = normalizeQuestionTypeString(item.type || item.questionType || item.kind || item.category);
      let inferredType = explicitType;
      if (!inferredType) {
        if (item.pairs || item.matches || item.rows || item.categories) inferredType = 'match';
        else if (Array.isArray(item.correctOptions) || Array.isArray(item.answers) || Array.isArray(item.correctAnswers))
          inferredType = 'checkbox';
        else if (
          rawSectionBody &&
          !item.options &&
          !item.choices &&
          item.correctAnswer === undefined &&
          item.answerKey === undefined &&
          item.answer === undefined
        )
          inferredType = 'section';
        else if (item.imageUrl || item.image || item.pictureUrl) inferredType = 'labeling';
        else if (Array.isArray(item.options) || Array.isArray(item.choices) || Array.isArray(item.steps)) inferredType = 'mcq';
        else inferredType = 'fill_blank';
      }

      let finalType = inferredType;
      // Only override when user explicitly picked a single type AND the item is not explicitly a section or pair-based type
      if (selectedType !== 'auto') {
        if (!explicitType) {
          finalType = selectedType;
        } else if (
          userChangedBulkTypeExplicitly &&
          explicitType !== 'section' &&
          !PAIR_BASED_TYPES.has(explicitType)
        ) {
          finalType = selectedType;
        }
      }

      const isSection = finalType === 'section';

      let questionText = String(
        item.questionText ??
          item.question ??
          item.prompt ??
          item.title ??
          item.heading ??
          item.header ??
          item.stem ??
          item.statement ??
          item.q ??
          ''
      ).trim();

      const fallbackTextField = String(item.text ?? '').trim();
      let sectionContent = rawSectionBody;

      if (isSection) {
        if (!sectionContent && fallbackTextField) {
          sectionContent = fallbackTextField;
        }
        if (!questionText && sectionContent) {
          const lines = sectionContent.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
          if (lines.length > 1 && lines[0].length <= 95) {
            questionText = lines[0];
            sectionContent = lines.slice(1).join('\n\n');
          } else {
            questionText = `Passage #${idx + 1}`;
          }
        } else if (questionText && !sectionContent) {
          const lines = questionText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
          if (lines.length > 1) {
            questionText = lines[0];
            sectionContent = lines.slice(1).join('\n\n');
          } else if (questionText.length > 90) {
            sectionContent = questionText;
            questionText = `Passage #${idx + 1}`;
          }
        }
      } else {
        if (!questionText) {
          questionText = fallbackTextField || sectionContent;
          if (questionText === sectionContent) {
            sectionContent = '';
          }
        } else if (!sectionContent && fallbackTextField && fallbackTextField !== questionText) {
          sectionContent = fallbackTextField;
        }
      }

      if (!questionText) {
        throw new Error(`Question #${idx + 1} is missing "questionText" (or "question").`);
      }

      // Normalize options / steps / sequence
      let options = [];
      const rawOpts = item.options || item.choices || item.steps || item.sequence || item.items;
      if (Array.isArray(rawOpts)) {
        options = rawOpts
          .map((o) => {
            if (o && typeof o === 'object') {
              return String(o.text ?? o.label ?? o.value ?? o.option ?? o.step ?? '').trim();
            }
            return String(o ?? '').trim();
          })
          .filter(Boolean);
      } else if (rawOpts && typeof rawOpts === 'object') {
        options = Object.values(rawOpts).map((o) => String(o).trim()).filter(Boolean);
      }
      if (finalType === 'true_false') {
        options = ['True', 'False'];
      } else if (finalType === 'reorder' && options.length === 0) {
        options = ['Step 1 (First)', 'Step 2 (Second)', 'Step 3 (Third)'];
      } else if (OPTION_BASED_TYPES.has(finalType) && options.length === 0) {
        options =
          finalType === 'hotspot'
            ? ['Zone A (Top-Left)', 'Zone B (Top-Right)', 'Zone C (Center)', 'Zone D (Bottom)']
            : ['Option 1', 'Option 2'];
      }

      // Normalize correctAnswer (resolving "A"/"B"/"C"/"D" letter keys if needed)
      let correctAnswer = String(
        item.correctAnswer ?? item.answer ?? item.correct ?? item.answerKey ?? item.solution ?? ''
      ).trim();

      if (
        correctAnswer &&
        options.length > 0 &&
        !options.includes(correctAnswer) &&
        /^[A-Ha-h]$/.test(correctAnswer)
      ) {
        const letterIdx = correctAnswer.toUpperCase().charCodeAt(0) - 65;
        if (options[letterIdx] !== undefined) {
          correctAnswer = options[letterIdx];
        }
      }

      // Normalize correctOptions for checkbox / hot_text / reorder
      let correctOptions = [];
      const rawCorrectOpts = item.correctOptions || item.answers || item.correctAnswers || item.correctOrder;
      if (Array.isArray(rawCorrectOpts)) {
        correctOptions = rawCorrectOpts
          .map((c) => {
            const s = String(c).trim();
            if (options.length > 0 && !options.includes(s) && /^[A-Ha-h]$/.test(s)) {
              const lIdx = s.toUpperCase().charCodeAt(0) - 65;
              if (options[lIdx] !== undefined) return options[lIdx];
            }
            return s;
          })
          .filter(Boolean);
      } else if ((finalType === 'checkbox' || finalType === 'hot_text') && correctAnswer) {
        correctOptions = [correctAnswer];
      } else if (finalType === 'reorder') {
        correctOptions = [...options];
      }

      // Normalize pairs for Match, Table Fill In, Categorize, Drag and drop, Match Table Grid
      let pairs = [];
      const rawPairs = item.pairs || item.matches || item.matchingPairs || item.rows || item.tableRows || item.categories;
      if (Array.isArray(rawPairs)) {
        pairs = rawPairs
          .map((p) => ({
            left: String(
              p.left ?? p.premise ?? p.columnA ?? p.row ?? p.prompt ?? p.slot ?? p.item ?? p.a ?? p.question ?? ''
            ).trim(),
            right: String(
              p.right ?? p.response ?? p.columnB ?? p.column ?? p.category ?? p.value ?? p.match ?? p.b ?? p.answer ?? ''
            ).trim()
          }))
          .filter((p) => p.left || p.right);
      } else if (rawPairs && typeof rawPairs === 'object') {
        pairs = Object.entries(rawPairs).map(([k, v]) => ({
          left: String(k).trim(),
          right: String(Array.isArray(v) ? v.join(', ') : v).trim()
        }));
      }
      // If a pair-based type (e.g. drag_drop) was given options + correctAnswer instead of pairs, build a pair automatically
      if (PAIR_BASED_TYPES.has(finalType) && pairs.length === 0) {
        if (options.length > 0 && correctAnswer) {
          pairs = [{ left: questionText, right: correctAnswer }];
        } else {
          pairs = [
            { left: 'Item A', right: 'Match 1' },
            { left: 'Item B', right: 'Match 2' }
          ];
        }
      }

      const rawPts = parseFloat(item.points ?? item.marks ?? item.score ?? item.weight);
      const points = isSection ? 0 : (!isNaN(rawPts) && rawPts >= 0 ? rawPts : 1);
      const required = isSection ? false : (item.required !== undefined ? Boolean(item.required) : true);
      const answerKey = String(
        item.answerKey ?? item.referenceAnswer ?? item.rubric ?? item.explanation ?? item.correctAnswer ?? item.answer ?? ''
      ).trim();

      return {
        id: `q_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        type: finalType,
        questionText,
        sectionContent,
        imageUrl: String(item.imageUrl || item.image || item.pictureUrl || '').trim(),
        imagePublicId: String(item.imagePublicId || '').trim(),
        points,
        required,
        options,
        correctAnswer,
        correctOptions,
        pairs,
        answerKey
      };
    });
  }

  function updateBulkJsonLivePreview() {
    if (!bulkJsonTextarea || !bulkJsonPreviewBadge) return;
    if (bulkJsonError) bulkJsonError.textContent = '';
    const raw = bulkJsonTextarea.value.trim();
    if (!raw) {
      bulkJsonPreviewBadge.textContent = '0 Questions Detected';
      bulkJsonPreviewBadge.classList.remove('valid', 'invalid');
      return;
    }
    try {
      const normalized = parseAndNormalizeBulkJson(raw);
      const countsByType = {};
      normalized.forEach((it) => {
        const lbl = BULK_TYPE_LABELS[it.type] || it.type;
        countsByType[lbl] = (countsByType[lbl] || 0) + 1;
      });
      const breakdown = Object.entries(countsByType)
        .map(([k, v]) => `${v} ${k}`)
        .join(' • ');
      bulkJsonPreviewBadge.textContent = `${normalized.length} Item${normalized.length === 1 ? '' : 's'} Ready (${breakdown})`;
      bulkJsonPreviewBadge.classList.add('valid');
      bulkJsonPreviewBadge.classList.remove('invalid');
    } catch (err) {
      bulkJsonPreviewBadge.textContent = 'Invalid JSON';
      bulkJsonPreviewBadge.classList.add('invalid');
      bulkJsonPreviewBadge.classList.remove('valid');
    }
  }

  function openBulkUploadModal() {
    if (!bulkUploadQuestionsModal) return;
    userChangedBulkTypeExplicitly = false;
    if (bulkQuestionTypeSelect) bulkQuestionTypeSelect.value = 'auto';
    if (bulkImportModeSelect) bulkImportModeSelect.value = 'append';
    if (bulkMultiTypeChips) {
      const defaultSelected = new Set(['mcq', 'checkbox', 'true_false', 'match']);
      bulkMultiTypeChips.querySelectorAll('.bulk-type-chip').forEach((chip) => {
        const t = chip.getAttribute('data-btype') || '';
        chip.classList.toggle('active', defaultSelected.has(t));
      });
      syncBulkTypeChipLabels();
    }
    if (bulkJsonFileInput) bulkJsonFileInput.value = '';
    if (bulkJsonTextarea) {
      bulkJsonTextarea.value = '';
      bulkJsonTextarea.placeholder = getSampleJsonForType('auto');
    }
    if (bulkJsonFileNameText) {
      bulkJsonFileNameText.textContent = 'Click to choose a .json file or drag & drop here';
    }
    if (bulkJsonFileSubText) {
      bulkJsonFileSubText.innerHTML = 'Supports single or multiple question types in one JSON file (see <code>json.txt</code>)';
    }
    if (bulkJsonError) bulkJsonError.textContent = '';
    updateBulkJsonLivePreview();

    bulkUploadQuestionsModal.classList.add('open');
    bulkUploadQuestionsModal.setAttribute('aria-hidden', 'false');
  }

  function closeBulkUploadModal() {
    if (!bulkUploadQuestionsModal) return;
    bulkUploadQuestionsModal.classList.remove('open');
    bulkUploadQuestionsModal.setAttribute('aria-hidden', 'true');
  }

  function handleBulkJsonFileSelected(file) {
    if (!file) return;
    if (bulkJsonError) bulkJsonError.textContent = '';

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = String(e.target?.result || '');
      if (bulkJsonTextarea) {
        bulkJsonTextarea.value = content;
      }
      if (bulkJsonFileNameText) {
        bulkJsonFileNameText.textContent = `Loaded: ${file.name}`;
      }
      updateBulkJsonLivePreview();
      try {
        const items = parseAndNormalizeBulkJson(content);
        if (bulkJsonFileSubText) {
          bulkJsonFileSubText.textContent = `${items.length} question(s) parsed from ${file.name}`;
        }
      } catch (err) {
        if (bulkJsonError) bulkJsonError.textContent = err.message;
      }
    };
    reader.onerror = () => {
      if (bulkJsonError) bulkJsonError.textContent = 'Could not read the selected file.';
    };
    reader.readAsText(file);
  }

  if (bulkUploadQuestionsTopBtn) {
    bulkUploadQuestionsTopBtn.addEventListener('click', openBulkUploadModal);
  }
  if (bulkUploadQuestionsBottomBtn) {
    bulkUploadQuestionsBottomBtn.addEventListener('click', openBulkUploadModal);
  }
  if (bulkUploadModalCloseX) {
    bulkUploadModalCloseX.addEventListener('click', closeBulkUploadModal);
  }
  if (bulkModalCancelBtn) {
    bulkModalCancelBtn.addEventListener('click', closeBulkUploadModal);
  }
  if (bulkUploadQuestionsModal) {
    bulkUploadQuestionsModal.addEventListener('click', (e) => {
      if (e.target === bulkUploadQuestionsModal) closeBulkUploadModal();
    });
  }

  if (bulkQuestionTypeSelect) {
    bulkQuestionTypeSelect.addEventListener('change', () => {
      const val = bulkQuestionTypeSelect.value;
      userChangedBulkTypeExplicitly = val !== 'auto';
      if (bulkMultiTypeChips && val !== 'auto') {
        bulkMultiTypeChips.querySelectorAll('.bulk-type-chip').forEach((chip) => {
          chip.classList.toggle('active', chip.getAttribute('data-btype') === val);
        });
        syncBulkTypeChipLabels();
      }
      if (bulkJsonTextarea) {
        bulkJsonTextarea.placeholder = getSampleJsonForType(val);
      }
      updateBulkJsonLivePreview();
    });
  }

  if (bulkMultiTypeChips) {
    bulkMultiTypeChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.bulk-type-chip');
      if (!chip) return;
      chip.classList.toggle('active');
      const activeList = getSelectedBulkTypesArray();
      if (bulkMultiTypeChips.querySelectorAll('.bulk-type-chip.active').length === 0) {
        chip.classList.add('active');
      }
      syncBulkTypeChipLabels();

      if (bulkQuestionTypeSelect) {
        if (activeList.length === 1) {
          bulkQuestionTypeSelect.value = activeList[0];
          userChangedBulkTypeExplicitly = true;
        } else {
          bulkQuestionTypeSelect.value = 'auto';
          userChangedBulkTypeExplicitly = false;
        }
      }
      if (bulkJsonTextarea) {
        bulkJsonTextarea.placeholder = getSampleJsonForType(bulkQuestionTypeSelect ? bulkQuestionTypeSelect.value : 'auto');
      }
      updateBulkJsonLivePreview();
    });
  }

  if (bulkSelectAllTypesBtn && bulkMultiTypeChips) {
    bulkSelectAllTypesBtn.addEventListener('click', () => {
      const allChips = Array.from(bulkMultiTypeChips.querySelectorAll('.bulk-type-chip'));
      const allActive = allChips.every((c) => c.classList.contains('active'));
      if (allActive) {
        allChips.forEach((c, idx) => c.classList.toggle('active', idx === 0));
      } else {
        allChips.forEach((c) => c.classList.add('active'));
      }
      syncBulkTypeChipLabels();
      const activeList = getSelectedBulkTypesArray();
      if (bulkQuestionTypeSelect) {
        bulkQuestionTypeSelect.value = activeList.length === 1 ? activeList[0] : 'auto';
        userChangedBulkTypeExplicitly = activeList.length === 1;
      }
      if (bulkJsonTextarea) {
        bulkJsonTextarea.placeholder = getSampleJsonForType(bulkQuestionTypeSelect ? bulkQuestionTypeSelect.value : 'auto');
      }
      updateBulkJsonLivePreview();
    });
  }

  if (bulkJsonDropzone && bulkJsonFileInput) {
    bulkJsonDropzone.addEventListener('click', () => {
      bulkJsonFileInput.click();
    });

    bulkJsonFileInput.addEventListener('change', () => {
      const file = bulkJsonFileInput.files && bulkJsonFileInput.files[0];
      if (file) handleBulkJsonFileSelected(file);
    });

    bulkJsonDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      bulkJsonDropzone.classList.add('drag-active');
    });

    bulkJsonDropzone.addEventListener('dragleave', () => {
      bulkJsonDropzone.classList.remove('drag-active');
    });

    bulkJsonDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      bulkJsonDropzone.classList.remove('drag-active');
      const file = e.dataTransfer?.files && e.dataTransfer.files[0];
      if (file) handleBulkJsonFileSelected(file);
    });
  }

  if (bulkJsonTextarea) {
    bulkJsonTextarea.addEventListener('input', updateBulkJsonLivePreview);
  }

  if (copyBulkPromptBtn) {
    copyBulkPromptBtn.addEventListener('click', async () => {
      const promptToCopy = buildDynamicChatGptPrompt();
      const copied = await copyTextToClipboard(promptToCopy);
      if (copied) {
        showToast('ChatGPT multi-type JSON prompt copied! Paste it in ChatGPT with your questions.');
      } else {
        showToast('See json.txt in project root for the full ChatGPT prompt.');
      }
    });
  }

  if (confirmBulkImportBtn) {
    confirmBulkImportBtn.addEventListener('click', () => {
      if (!examQuestionsList) return;
      if (bulkJsonError) bulkJsonError.textContent = '';

      try {
        const rawText = bulkJsonTextarea ? bulkJsonTextarea.value : '';
        const importedItems = parseAndNormalizeBulkJson(rawText);
        const mode = bulkImportModeSelect ? bulkImportModeSelect.value : 'append';

        if (lastParsedExamMeta.examDescription && examFormDescriptionInput) {
          if (mode === 'replace' || !examFormDescriptionInput.value.trim()) {
            examFormDescriptionInput.value = lastParsedExamMeta.examDescription;
          }
        }
        if (lastParsedExamMeta.examDuration && examDurationInput) {
          if (mode === 'replace' || !examDurationInput.value.trim()) {
            examDurationInput.value = lastParsedExamMeta.examDuration;
          }
        }

        if (mode === 'replace') {
          examQuestionsList.innerHTML = '';
        } else {
          // If appending and the only existing card is a single blank default card, replace that empty placeholder
          const existingCards = examQuestionsList.querySelectorAll('.gform-question-card');
          if (existingCards.length === 1) {
            const firstPrompt = existingCards[0].querySelector('.gform-q-prompt-input')?.value.trim() || '';
            const firstSec = existingCards[0].querySelector('.gform-section-content-input')?.value.trim() || '';
            const firstImg = existingCards[0].getAttribute('data-image-url') || '';
            if (!firstPrompt && !firstSec && !firstImg) {
              examQuestionsList.innerHTML = '';
            }
          }
        }

        importedItems.forEach((qData) => {
          examQuestionsList.appendChild(createExamQuestionCard(qData));
        });

        updateExamBuilderCounters();
        closeBulkUploadModal();
        showToast(`Successfully imported ${importedItems.length} question(s) from JSON!`);
      } catch (err) {
        if (bulkJsonError) bulkJsonError.textContent = err.message || 'Invalid JSON format';
      }
    });
  }

  async function handleSaveFullExam(e) {
    if (e) e.preventDefault();
    if (!activeExamProgram || !examQuestionsList) return;

    const cards = examQuestionsList.querySelectorAll('.gform-question-card');
    if (cards.length === 0) {
      showToast('Please add at least one question');
      return;
    }

    let hasError = false;
    const collectedQuestions = [];

    cards.forEach((card) => {
      const promptInput = card.querySelector('.gform-q-prompt-input');
      const promptError = card.querySelector('.gform-q-error');
      const qData = extractQuestionDataFromCard(card);

      if (!qData.questionText) {
        if (promptError) promptError.textContent = 'Question prompt is required';
        if (promptInput) promptInput.classList.add('error');
        hasError = true;
      } else {
        if (promptError) promptError.textContent = '';
        if (promptInput) promptInput.classList.remove('error');
      }

      collectedQuestions.push(qData);
    });

    if (hasError) {
      showToast('Please fill in all question prompts');
      return;
    }

    const durationVal = examDurationInput ? examDurationInput.value.trim() : '';
    const descVal = examFormDescriptionInput ? examFormDescriptionInput.value.trim() : '';
    const summaryText = collectedQuestions.map((q, idx) => `Q${idx + 1}: ${q.questionText}`).join(' | ');

    if (saveExamBtn) {
      saveExamBtn.disabled = true;
      const txt = saveExamBtn.querySelector('.btn-text');
      if (txt) txt.textContent = 'Saving...';
    }

    try {
      const key = makeProgramExamKey(activeExamProgram.programName, activeExamProgram.category);
      const examPayload = {
        examQuestion: summaryText,
        examDuration: durationVal,
        examDescription: descVal,
        examQuestions: collectedQuestions,
        updatedAt: Date.now()
      };

      saveExamToLocalMap(key, examPayload);

      const allRecords = await getAllRecordsFromDB();
      const matching = allRecords.filter(
        (r) => makeProgramExamKey(r.programName, r.category) === key
      );

      if (matching.length > 0) {
        for (let i = 0; i < matching.length; i++) {
          const updatedRecord = {
            ...matching[i],
            ...examPayload
          };
          await saveRecordToDB(updatedRecord);
        }
      } else {
        // Ensure a program record exists in DB when saved via shared link
        const newRec = {
          id: `SBQ-${Math.floor(1000 + Math.random() * 9000)}`,
          programName: activeExamProgram.programName,
          category: activeExamProgram.category || 'General',
          candidate: '0 Candidate',
          createdAt: Date.now(),
          ...examPayload
        };
        await saveRecordToDB(newRec);
      }

      const progTitle = activeExamProgram.programName;
      showToast(`Saved ${collectedQuestions.length} question(s) for "${progTitle}"!`);
      if (!isSharedExamStandaloneMode) {
        closeSetExamPage();
      }
    } catch (err) {
      console.error('Error saving exam:', err);
      showToast('Error saving exam');
    } finally {
      if (saveExamBtn) {
        saveExamBtn.disabled = false;
        const txt = saveExamBtn.querySelector('.btn-text');
        if (txt) txt.textContent = 'Save Exam';
      }
    }
  }

  if (setExamForm) {
    setExamForm.addEventListener('submit', handleSaveFullExam);
  }
  if (saveExamBtn) {
    saveExamBtn.addEventListener('click', handleSaveFullExam);
  }

  // ==========================================================================
  // Student Registration Section Controllers & Handlers
  // ==========================================================================
  const studentForm = document.getElementById('studentForm');
  const studentNameInput = document.getElementById('studentName');
  const studentChestNoInput = document.getElementById('studentChestNo');
  const studentCategoryRadios = document.querySelectorAll('input[name="studentCategory"]');
  const studentCategoryGroup = document.getElementById('studentCategoryGroup');
  const studentNameError = document.getElementById('studentNameError');
  const studentChestNoError = document.getElementById('studentChestNoError');
  const studentCategoryError = document.getElementById('studentCategoryError');
  const submitStudentBtn = document.getElementById('submitStudentBtn');
  const studentsTableBody = document.getElementById('studentsTableBody');
  const studentsCountBadge = document.getElementById('studentsCountBadge');
  const studentSearchInput = document.getElementById('studentSearchInput');

  // Render registered students from IndexedDB
  async function loadAndRenderStudentsTable() {
    try {
      const students = await getAllStudentsFromDB();
      students.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      if (studentsCountBadge) {
        studentsCountBadge.textContent = `${students.length} Student${students.length === 1 ? '' : 's'}`;
      }

      if (!studentsTableBody) return;
      studentsTableBody.innerHTML = '';

      if (students.length === 0) {
        studentsTableBody.innerHTML = `
          <tr class="empty-state-row">
            <td colspan="4" style="text-align: center; padding: 36px 20px; color: var(--text-muted);">
              <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" style="color: var(--text-dim);">
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                  <circle cx="9" cy="7" r="4"></circle>
                </svg>
                <span style="font-weight: 600; font-size: 0.875rem; color: var(--text-main);">No students entered yet</span>
                <span style="font-size: 0.775rem;">Fill out the form above to add your first student record</span>
              </div>
            </td>
          </tr>
        `;
        return;
      }

      students.forEach((std) => {
        const tr = document.createElement('tr');
        tr.setAttribute('data-chest', std.chestNo);
        tr.innerHTML = `
          <td><span class="id-tag chest-tag">#${escapeHtml(std.chestNo)}</span></td>
          <td><strong class="student-name-cell">${escapeHtml(std.name)}</strong></td>
          <td><span class="category-tag">${escapeHtml(std.category)}</span></td>
          <td>
            <div class="action-cell">
              <button type="button" class="row-action-btn edit-btn edit-student-btn" title="Edit student">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button type="button" class="row-action-btn delete-btn delete-student-btn" title="Delete student">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
              </button>
            </div>
          </td>
        `;
        studentsTableBody.appendChild(tr);
      });

      applyStudentsSearchFilter();
    } catch (err) {
      console.error('Error rendering students from IndexedDB:', err);
    }
  }

  // Filter students table
  function applyStudentsSearchFilter() {
    if (!studentsTableBody) return;
    const query = studentSearchInput ? studentSearchInput.value.toLowerCase().trim() : '';
    const rows = studentsTableBody.querySelectorAll('tr:not(.empty-state-row)');

    rows.forEach((row) => {
      const text = row.textContent.toLowerCase();
      row.style.display = (!query || text.includes(query)) ? '' : 'none';
    });
  }

  if (studentSearchInput) {
    studentSearchInput.addEventListener('input', applyStudentsSearchFilter);
  }

  // Clear errors on student inputs
  if (studentNameInput) {
    studentNameInput.addEventListener('input', () => {
      studentNameInput.classList.remove('error');
      if (studentNameError) studentNameError.textContent = '';
    });
  }

  if (studentChestNoInput) {
    studentChestNoInput.addEventListener('input', () => {
      studentChestNoInput.classList.remove('error');
      if (studentChestNoError) studentChestNoError.textContent = '';
    });
  }

  studentCategoryRadios.forEach((radio) => {
    radio.addEventListener('change', () => {
      if (studentCategoryGroup) studentCategoryGroup.classList.remove('error');
      if (studentCategoryError) studentCategoryError.textContent = '';
    });
  });

  let editingStudentChestNo = null;

  // Handle Student Form Submission
  if (studentForm) {
    studentForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      // Reset errors
      if (studentNameError) studentNameError.textContent = '';
      if (studentChestNoError) studentChestNoError.textContent = '';
      if (studentCategoryError) studentCategoryError.textContent = '';
      if (studentNameInput) studentNameInput.classList.remove('error');
      if (studentChestNoInput) studentChestNoInput.classList.remove('error');
      if (studentCategoryGroup) studentCategoryGroup.classList.remove('error');

      const name = studentNameInput ? studentNameInput.value.trim() : '';
      const rawChest = studentChestNoInput ? studentChestNoInput.value.trim() : '';
      const chestNo = rawChest.replace(/^#/, '').trim();
      const selectedCategoryRadio = document.querySelector('input[name="studentCategory"]:checked');
      const category = selectedCategoryRadio ? selectedCategoryRadio.value : '';

      let hasError = false;

      // Validate Student Name
      if (!name) {
        if (studentNameError) studentNameError.textContent = 'Student name is required';
        if (studentNameInput) studentNameInput.classList.add('error');
        hasError = true;
      }

      // Validate Chest Number
      if (!chestNo) {
        if (studentChestNoError) studentChestNoError.textContent = 'Chest number is required';
        if (studentChestNoInput) studentChestNoInput.classList.add('error');
        hasError = true;
      }

      // Validate Category
      if (!category) {
        if (studentCategoryError) studentCategoryError.textContent = 'Please select a Category';
        if (studentCategoryGroup) studentCategoryGroup.classList.add('error');
        hasError = true;
      }

      if (hasError) return;

      // Check for duplicate chest number in DB
      try {
        const existingStudents = await getAllStudentsFromDB();
        const duplicate = existingStudents.find(
          (s) =>
            String(s.chestNo).toLowerCase() === chestNo.toLowerCase() &&
            (!editingStudentChestNo || String(s.chestNo).toLowerCase() !== String(editingStudentChestNo).toLowerCase())
        );
        if (duplicate) {
          if (studentChestNoError) studentChestNoError.textContent = `Chest #${chestNo} is already registered to "${duplicate.name}"`;
          if (studentChestNoInput) studentChestNoInput.classList.add('error');
          return;
        }

        // Loading state
        if (submitStudentBtn) {
          submitStudentBtn.disabled = true;
          const btnText = submitStudentBtn.querySelector('.btn-text');
          if (btnText) btnText.textContent = 'Saving...';
        }

        if (editingStudentChestNo && String(editingStudentChestNo).toLowerCase() !== chestNo.toLowerCase()) {
          await deleteStudentFromDB(editingStudentChestNo);
        }

        const newStudent = {
          chestNo,
          name,
          category,
          createdAt: Date.now()
        };

        await saveStudentToDB(newStudent);

        // If editing an existing candidate, also sync updated name/chestNo into assigned program records
        if (editingStudentChestNo) {
          const allRecs = await getAllRecordsFromDB();
          for (let i = 0; i < allRecs.length; i++) {
            const r = allRecs[i];
            const recChest = extractChestFromRecord(r);
            if (recChest && String(recChest).toLowerCase() === String(editingStudentChestNo).toLowerCase()) {
              await saveRecordToDB({
                ...r,
                chestNo,
                candidate: `${name} (#${chestNo})`
              });
            }
          }
          await loadAndRenderTable();
        }

        await loadAndRenderStudentsTable();

        const wasEditing = Boolean(editingStudentChestNo);
        editingStudentChestNo = null;
        studentForm.reset();
        showToast(
          wasEditing
            ? `Updated candidate "${name}" (Chest #${chestNo})!`
            : `Candidate "${name}" (Chest #${chestNo}) registered in Firebase!`
        );
      } catch (err) {
        console.error('Error saving candidate to Firebase:', err);
        showToast('Error saving candidate to database');
      } finally {
        if (submitStudentBtn) {
          submitStudentBtn.disabled = false;
          const btnText = submitStudentBtn.querySelector('.btn-text');
          if (btnText) btnText.textContent = 'Submit';
        }
      }
    });
  }

  // Handle Student Row Edit & Deletion from IndexedDB
  if (studentsTableBody) {
    studentsTableBody.addEventListener('click', async (e) => {
      const editBtn = e.target.closest('.edit-student-btn');
      if (editBtn) {
        const row = editBtn.closest('tr');
        if (row) {
          const chestNo = row.getAttribute('data-chest') || '';
          const studentName = row.querySelector('.student-name-cell')?.textContent?.trim() || '';
          const catText = row.querySelector('.category-tag')?.textContent?.trim() || '';

          editingStudentChestNo = chestNo;
          if (studentNameInput) studentNameInput.value = studentName;
          if (studentChestNoInput) studentChestNoInput.value = chestNo;
          studentCategoryRadios.forEach((radio) => {
            radio.checked = radio.value.toLowerCase() === catText.toLowerCase();
          });
          if (submitStudentBtn) {
            const btnText = submitStudentBtn.querySelector('.btn-text');
            if (btnText) btnText.textContent = 'Update Candidate';
          }
          if (studentForm) {
            studentForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          if (studentNameInput) studentNameInput.focus();
          showToast(`Editing candidate "${studentName}" (#${chestNo})`);
        }
        return;
      }

      const deleteBtn = e.target.closest('.delete-student-btn');
      if (deleteBtn) {
        const row = deleteBtn.closest('tr');
        if (row) {
          const chestNo = row.getAttribute('data-chest');
          const studentName = row.querySelector('.student-name-cell')?.textContent || 'Student';

          row.style.transition = 'all 0.22s ease-out';
          row.style.opacity = '0';
          row.style.transform = 'translateX(-12px)';

          setTimeout(async () => {
            row.remove();
            try {
              if (chestNo) {
                await deleteStudentFromDB(chestNo);
              }
              showToast(`Deleted candidate "${studentName}" (#${chestNo}) from Firebase`);
              const remaining = await getAllStudentsFromDB();
              if (studentsCountBadge) {
                studentsCountBadge.textContent = `${remaining.length} Candidate${remaining.length === 1 ? '' : 's'}`;
              }
              if (remaining.length === 0) {
                await loadAndRenderStudentsTable();
              }
            } catch (err) {
              console.error('Error deleting candidate from Firebase:', err);
            }
          }, 200);
        }
      }
    });
  }

  // ==========================================================================
  // Valuation Section: Students' Submitted Exams & Per-Program Valuation Sheet
  // ==========================================================================
  const valuationView = document.getElementById('valuationView');
  const valuationSheetView = document.getElementById('valuationSheetView');
  const valuationTableBody = document.getElementById('valuationTableBody');
  const valuationSubmissionsBadge = document.getElementById('valuationSubmissionsBadge');
  const valuationCompletedBadge = document.getElementById('valuationCompletedBadge');
  const valuationSearchInput = document.getElementById('valuationSearchInput');
  const valuationProgramSelect = document.getElementById('valuationProgramSelect');
  const valuationFilterBtns = document.querySelectorAll('.valuation-filter-btn');

  // Valuation Sheet Elements
  const valuationSheetBackBtn = document.getElementById('valuationSheetBackBtn');
  const valSheetCandidateName = document.getElementById('valSheetCandidateName');
  const valSheetCategory = document.getElementById('valSheetCategory');
  const valSheetProgramSubtitle = document.getElementById('valSheetProgramSubtitle');
  const valSheetLiveTotal = document.getElementById('valSheetLiveTotal');
  const autoGradeObjectiveBtn = document.getElementById('autoGradeObjectiveBtn');
  const saveValuationBtn = document.getElementById('saveValuationBtn');
  const valuationSheetForm = document.getElementById('valuationSheetForm');
  const valSheetOverallRemarks = document.getElementById('valSheetOverallRemarks');
  const valSheetManualTotalInput = document.getElementById('valSheetManualTotalInput');
  const valSheetMaxDenom = document.getElementById('valSheetMaxDenom');
  const valuationQuestionsContainer = document.getElementById('valuationQuestionsContainer');

  let activeValuationSubmission = null;
  let cachedValuationItems = [];

  function resolveExamQuestionsForRecord(rec, savedExamsMap) {
    const key = makeProgramExamKey(rec.programName, rec.category);
    const localExam = savedExamsMap[key] || {};
    let questions = [];

    if (Array.isArray(rec.examQuestions) && rec.examQuestions.length > 0) {
      questions = rec.examQuestions;
    } else if (Array.isArray(localExam.examQuestions) && localExam.examQuestions.length > 0) {
      questions = localExam.examQuestions;
    } else {
      const fallbackPrompt = (rec.examQuestion || localExam.examQuestion || '').trim();
      if (fallbackPrompt) {
        questions = [
          {
            id: 'q_default_1',
            type: 'long_answer',
            questionText: fallbackPrompt,
            points: 10,
            required: true,
            options: [],
            pairs: [],
            answerKey: ''
          }
        ];
      } else {
        questions = [
          {
            id: 'q_default_1',
            type: 'long_answer',
            questionText: `General Evaluation for ${rec.programName || 'Program'}`,
            points: 10,
            required: false,
            options: [],
            pairs: [],
            answerKey: ''
          }
        ];
      }
    }
    return questions;
  }

  function computeAutoMarkForQuestion(q, studentAnswer) {
    const maxPts = Math.max(0, parseFloat(q.points) || 1);
    const type = q.type || 'mcq';

    if (studentAnswer === undefined || studentAnswer === null || studentAnswer === '') {
      return {
        mark: 0,
        status: 'unanswered',
        hasKey: Boolean(
          q.correctAnswer ||
          q.answerKey ||
          (q.correctOptions && q.correctOptions.length) ||
          (q.pairs && q.pairs.length) ||
          (type === 'reorder' && q.options && q.options.length)
        )
      };
    }

    if (type === 'mcq' || type === 'radio' || type === 'dropdown' || type === 'true_false' || type === 'hotspot') {
      const key = String(q.correctAnswer || '').trim();
      if (!key) return { mark: 0, status: 'manual', hasKey: false };
      const isCorrect = String(studentAnswer).trim().toLowerCase() === key.toLowerCase();
      return { mark: isCorrect ? maxPts : 0, status: isCorrect ? 'correct' : 'incorrect', hasKey: true };
    }

    if (type === 'checkbox' || type === 'hot_text') {
      const fallbackSingle = q.correctAnswer ? [String(q.correctAnswer).trim()] : [];
      const rawCorrect = Array.isArray(q.correctOptions) && q.correctOptions.length > 0 ? q.correctOptions : fallbackSingle;
      const correctArr = rawCorrect.map((o) => String(o).trim().toLowerCase()).filter(Boolean);
      if (correctArr.length === 0) return { mark: 0, status: 'manual', hasKey: false };
      const rawAns = Array.isArray(studentAnswer) ? studentAnswer : [studentAnswer];
      const ansArr = rawAns.map((o) => String(o).trim().toLowerCase()).filter(Boolean);
      if (ansArr.length === 0) return { mark: 0, status: 'unanswered', hasKey: true };

      const exactMatch = ansArr.length === correctArr.length && correctArr.every((c) => ansArr.includes(c));
      if (exactMatch) return { mark: maxPts, status: 'correct', hasKey: true };

      const correctPicks = ansArr.filter((a) => correctArr.includes(a)).length;
      const wrongPicks = ansArr.filter((a) => !correctArr.includes(a)).length;
      const partial = Math.max(0, ((correctPicks - wrongPicks) / correctArr.length) * maxPts);
      const rounded = Math.round(partial * 2) / 2;
      return { mark: rounded, status: rounded > 0 ? 'partial' : 'incorrect', hasKey: true };
    }

    if (type === 'reorder') {
      const expectedOrder = (Array.isArray(q.correctOptions) && q.correctOptions.length > 0 ? q.correctOptions : (q.options || []))
        .map((o) => String(o).trim().toLowerCase())
        .filter(Boolean);
      if (expectedOrder.length === 0) return { mark: 0, status: 'manual', hasKey: false };
      const ansArr = Array.isArray(studentAnswer)
        ? studentAnswer.map((o) => String(o).trim().toLowerCase()).filter(Boolean)
        : String(studentAnswer).split(',').map((o) => o.trim().toLowerCase()).filter(Boolean);
      if (ansArr.length === 0) return { mark: 0, status: 'unanswered', hasKey: true };

      let correctPosCount = 0;
      expectedOrder.forEach((exp, idx) => {
        if (ansArr[idx] === exp) correctPosCount++;
      });
      if (correctPosCount === expectedOrder.length) {
        return { mark: maxPts, status: 'correct', hasKey: true };
      }
      const ratio = correctPosCount / expectedOrder.length;
      const mark = Math.round(ratio * maxPts * 2) / 2;
      return { mark, status: correctPosCount > 0 ? 'partial' : 'incorrect', hasKey: true };
    }

    if (PAIR_BASED_TYPES.has(type)) {
      const pairs = Array.isArray(q.pairs) ? q.pairs.filter((p) => p.left || p.right) : [];
      if (pairs.length === 0) return { mark: 0, status: 'manual', hasKey: false };
      if (typeof studentAnswer !== 'object' || Array.isArray(studentAnswer)) {
        return { mark: 0, status: 'unanswered', hasKey: true };
      }
      let matchedCount = 0;
      pairs.forEach((p) => {
        const chosen = String(studentAnswer[p.left] || '').trim().toLowerCase();
        const expected = String(p.right || '').trim().toLowerCase();
        if (chosen && expected && chosen === expected) {
          matchedCount++;
        }
      });
      const ratio = matchedCount / pairs.length;
      const mark = Math.round(ratio * maxPts * 2) / 2;
      const status = matchedCount === pairs.length ? 'correct' : matchedCount > 0 ? 'partial' : 'incorrect';
      return { mark, status, hasKey: true };
    }

    // Fill in the blanks / Open ended / Labeling / Short / Long answer
    const key = String(q.answerKey || q.correctAnswer || '').trim();
    if (!key) return { mark: 0, status: 'manual', hasKey: false };
    const isExact = String(studentAnswer).trim().toLowerCase() === key.toLowerCase();
    return { mark: isExact ? maxPts : 0, status: isExact ? 'correct' : 'manual', hasKey: true };
  }

  function getQuestionAnswerFromMap(answersObj, q, idx) {
    if (!answersObj || typeof answersObj !== 'object') return undefined;
    if (q && q.id && answersObj[q.id] !== undefined) return answersObj[q.id];
    if (answersObj[idx] !== undefined) return answersObj[idx];
    if (answersObj[`slide_${idx}`] !== undefined) return answersObj[`slide_${idx}`];
    return undefined;
  }

  function countAnsweredInMap(answersObj) {
    if (!answersObj || typeof answersObj !== 'object') return 0;
    let count = 0;
    Object.values(answersObj).forEach((val) => {
      if (Array.isArray(val)) {
        if (val.length > 0) count++;
      } else if (val && typeof val === 'object') {
        if (Object.values(val).some((v) => String(v || '').trim() !== '')) count++;
      } else if (String(val || '').trim() !== '') {
        count++;
      }
    });
    return count;
  }

  async function loadAndRenderValuationTable() {
    if (!valuationTableBody) return;
    try {
      const records = await getAllRecordsFromDB();
      const savedExams = getSavedExamsMap();
      const attemptsMap = getCandidateAttemptsMap();

      const sharedValProgName = isSharedValuationStandaloneMode
        ? (urlParams.get('program') || '').trim()
        : '';
      const sharedValCat = isSharedValuationStandaloneMode
        ? (urlParams.get('category') || 'General').trim()
        : '';
      const sharedValKey =
        sharedValProgName && sharedValProgName.toLowerCase() !== 'all'
          ? makeProgramExamKey(sharedValProgName, sharedValCat)
          : '';

      const candidateRecords = records.filter((rec) => {
        const isZeroCand = !rec.candidate ||
          rec.candidate === '0 Candidate' ||
          rec.candidate.toLowerCase().includes('0 candidate') ||
          rec.candidate.toLowerCase().includes('unassigned');
        if (isZeroCand || !rec.programName) return false;
        if (sharedValKey) {
          return makeProgramExamKey(rec.programName, rec.category) === sharedValKey;
        }
        return true;
      });

      const items = candidateRecords.map((rec) => {
        const state = getRecordAttemptState(rec);
        const localAttempt = state.attemptKey ? attemptsMap[state.attemptKey] : null;
        const answers = (localAttempt && localAttempt.answers && Object.keys(localAttempt.answers).length > 0)
          ? localAttempt.answers
          : (rec.savedAnswers || {});

        const questions = resolveExamQuestionsForRecord(rec, savedExams);
        const gradableQuestions = questions.filter((q) => q.type !== 'section');
        const maxMarks = gradableQuestions.reduce((sum, q) => sum + (Math.max(0, parseFloat(q.points) || 1)), 0);

        let autoSuggestedTotal = 0;
        questions.forEach((q, idx) => {
          if (q.type === 'section') return;
          const autoRes = computeAutoMarkForQuestion(q, getQuestionAnswerFromMap(answers, q, idx));
          autoSuggestedTotal += autoRes.mark;
        });

        const isValuated = Boolean(rec.valuated || localAttempt?.valuated);
        const savedQuestionMarks = rec.valuationMarks || localAttempt?.valuationMarks || {};
        const awardedMarks = isValuated
          ? Number(rec.totalAwardedMarks ?? localAttempt?.totalAwardedMarks ?? autoSuggestedTotal)
          : autoSuggestedTotal;
        const valuationRemarks = rec.valuationRemarks || localAttempt?.valuationRemarks || '';
        const valuationNotes = rec.valuationNotes || localAttempt?.valuationNotes || {};

        const answeredCount = countAnsweredInMap(answers);
        const isSubmitted = state.isLocked || state.status === 'submitted' || answeredCount > 0;

        return {
          rec,
          recordId: rec.id,
          chestNo: state.chestNo,
          candidateDisplay: rec.candidate,
          programName: rec.programName,
          category: rec.category || 'General',
          programKey: makeProgramExamKey(rec.programName, rec.category),
          attemptKey: state.attemptKey,
          isLocked: state.isLocked,
          status: state.status,
          lockReason: state.lockReason,
          reopenCount: state.reopenCount,
          answers,
          answeredCount,
          questions,
          maxMarks,
          autoSuggestedTotal,
          isValuated,
          awardedMarks,
          savedQuestionMarks,
          valuationRemarks,
          valuationNotes,
          isSubmitted
        };
      });

      // Sort: submitted/locked first, then pending valuation, then newest
      items.sort((a, b) => {
        if (a.isSubmitted !== b.isSubmitted) return a.isSubmitted ? -1 : 1;
        if (a.isValuated !== b.isValuated) return a.isValuated ? 1 : -1;
        return (b.rec.lastSavedAt || b.rec.createdAt || 0) - (a.rec.lastSavedAt || a.rec.createdAt || 0);
      });

      cachedValuationItems = items;

      // Update Program Select Dropdown
      if (valuationProgramSelect) {
        const currentSelected = valuationProgramSelect.value || 'all';
        const uniqueProgs = new Map();
        items.forEach((it) => {
          if (!uniqueProgs.has(it.programKey)) {
            uniqueProgs.set(it.programKey, `${it.programName} (${it.category})`);
          }
        });
        valuationProgramSelect.innerHTML = `<option value="all">All Programs (${uniqueProgs.size})</option>`;
        uniqueProgs.forEach((label, key) => {
          const opt = document.createElement('option');
          opt.value = key;
          opt.textContent = label;
          if (key === currentSelected) opt.selected = true;
          valuationProgramSelect.appendChild(opt);
        });
      }

      const submittedTotal = items.filter((i) => i.isSubmitted).length;
      const valuatedTotal = items.filter((i) => i.isValuated).length;

      if (valuationSubmissionsBadge) {
        valuationSubmissionsBadge.textContent = `${submittedTotal} Submitted / ${items.length} Total`;
      }
      if (valuationCompletedBadge) {
        valuationCompletedBadge.textContent = `${valuatedTotal} Valuated`;
      }

      valuationTableBody.innerHTML = '';

      if (items.length === 0) {
        valuationTableBody.innerHTML = `
          <tr class="empty-state-row">
            <td colspan="6" style="text-align: center; padding: 48px 20px; color: var(--text-muted);">
              <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6" style="color: var(--text-dim);">
                  <path d="M9 11l3 3L22 4"></path>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                </svg>
                <span style="font-weight: 600; font-size: 0.9rem; color: var(--text-main);">No candidate program records yet</span>
                <span style="font-size: 0.8rem;">Allocate candidates to programs in "Data &gt; All Programs" to evaluate their submitted exams here</span>
              </div>
            </td>
          </tr>
        `;
        return;
      }

      items.forEach((item) => {
        const tr = document.createElement('tr');
        tr.setAttribute('data-record-id', item.recordId);
        tr.setAttribute('data-prog-key', item.programKey);
        tr.setAttribute('data-submitted', item.isSubmitted ? 'true' : 'false');
        tr.setAttribute('data-valuated', item.isValuated ? 'true' : 'false');

        let statusHtml = '';
        if (item.isLocked) {
          const reason = item.lockReason ? `Submitted (${escapeHtml(item.lockReason)})` : 'Submitted';
          statusHtml = `
            <div class="val-status-stack">
              <span class="exam-attempt-badge locked-badge">${reason}</span>
              <span class="val-ans-meta">${item.answeredCount} / ${item.questions.length} Answered</span>
            </div>
          `;
        } else if (item.answeredCount > 0 || item.status === 'in_progress' || item.status === 'reopened') {
          statusHtml = `
            <div class="val-status-stack">
              <span class="exam-attempt-badge progress-badge">Auto-Saved (${item.answeredCount}/${item.questions.length})</span>
            </div>
          `;
        } else {
          statusHtml = `<span class="zero-candidate-tag">Awaiting Exam</span>`;
        }

        const scoreBadgeHtml = item.isValuated
          ? `<div class="val-score-cell">
              <span class="valuation-score-badge valuated">${item.awardedMarks} / ${item.maxMarks} Pts</span>
              <span class="val-state-tag done">Valuated ✓</span>
            </div>`
          : `<div class="val-score-cell">
              <span class="valuation-score-badge pending">Auto: ${item.autoSuggestedTotal} / ${item.maxMarks} Pts</span>
              <span class="val-state-tag pending">Pending Valuation</span>
            </div>`;

        tr.innerHTML = `
          <td>
            <div class="candidate-cell-wrap">
              <strong class="candidate-name">${escapeHtml(item.candidateDisplay)}</strong>
              ${item.chestNo ? `<span class="id-tag chest-tag">#${escapeHtml(item.chestNo)}</span>` : ''}
            </div>
          </td>
          <td>
            <div class="question-program-cell">
              <strong class="program-title">${escapeHtml(item.programName)}</strong>
              <span class="exam-status-pill">${item.questions.length} Q${item.questions.length === 1 ? '' : 's'}</span>
            </div>
          </td>
          <td><span class="category-tag">${escapeHtml(item.category)}</span></td>
          <td>${statusHtml}</td>
          <td>${scoreBadgeHtml}</td>
          <td style="text-align: right;">
            <div class="question-row-actions">
              ${!isSharedValuationStandaloneMode ? `
              <button type="button" class="share-exam-row-btn share-valuation-row-btn" title="Share direct valuation link for ${escapeHtml(item.programName)}">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="18" cy="5" r="3"></circle>
                  <circle cx="6" cy="12" r="3"></circle>
                  <circle cx="18" cy="19" r="3"></circle>
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
                </svg>
                <span>Share</span>
              </button>
              ` : ''}
              <button type="button" class="set-exam-btn take-valuation-btn">
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 11l3 3L22 4"></path>
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
                </svg>
                <span>${item.isValuated ? 'Edit Valuation' : 'Take Valuation'}</span>
              </button>
            </div>
          </td>
        `;

        const shareValRowBtn = tr.querySelector('.share-valuation-row-btn');
        if (shareValRowBtn) {
          shareValRowBtn.addEventListener('click', () => {
            openShareValuationModal({
              programName: item.programName,
              category: item.category
            });
          });
        }

        const valBtn = tr.querySelector('.take-valuation-btn');
        if (valBtn) {
          valBtn.addEventListener('click', () => {
            openValuationSheet(item);
          });
        }

        valuationTableBody.appendChild(tr);
      });

      applyValuationFilters();
    } catch (err) {
      console.error('Error loading valuation table:', err);
    }
  }

  function applyValuationFilters() {
    if (!valuationTableBody) return;
    const activeFilter = document.querySelector('.valuation-filter-btn.active')?.getAttribute('data-vfilter') || 'all';
    const selectedProg = valuationProgramSelect ? valuationProgramSelect.value : 'all';
    const query = valuationSearchInput ? valuationSearchInput.value.toLowerCase().trim() : '';

    const rows = valuationTableBody.querySelectorAll('tr:not(.empty-state-row)');
    rows.forEach((row) => {
      const progKey = row.getAttribute('data-prog-key') || '';
      const isSubmitted = row.getAttribute('data-submitted') === 'true';
      const isValuated = row.getAttribute('data-valuated') === 'true';
      const text = row.textContent.toLowerCase();

      const matchProg = selectedProg === 'all' || progKey === selectedProg;
      const matchQuery = !query || text.includes(query);

      let matchTab = true;
      if (activeFilter === 'submitted') matchTab = isSubmitted;
      else if (activeFilter === 'pending') matchTab = !isValuated;
      else if (activeFilter === 'valuated') matchTab = isValuated;

      row.style.display = (matchProg && matchQuery && matchTab) ? '' : 'none';
    });
  }

  if (valuationSearchInput) {
    valuationSearchInput.addEventListener('input', applyValuationFilters);
  }
  if (valuationProgramSelect) {
    valuationProgramSelect.addEventListener('change', applyValuationFilters);
  }
  valuationFilterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      valuationFilterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      applyValuationFilters();
    });
  });

  function formatStudentAnswerHtml(q, rawAns) {
    const type = q.type || 'mcq';
    if (rawAns === undefined || rawAns === null || rawAns === '') {
      return `<span class="val-empty-ans">No answer submitted by candidate</span>`;
    }

    if (type === 'checkbox' || type === 'hot_text') {
      const arr = Array.isArray(rawAns) ? rawAns : [rawAns];
      if (arr.length === 0) return `<span class="val-empty-ans">No options selected</span>`;
      return `<div class="val-ans-chips">${arr.map((a) => `<span class="val-ans-chip">${escapeHtml(String(a))}</span>`).join('')}</div>`;
    }

    if (type === 'reorder') {
      const arr = Array.isArray(rawAns) ? rawAns : String(rawAns).split(',').map((s) => s.trim()).filter(Boolean);
      if (arr.length === 0) return `<span class="val-empty-ans">No sequence submitted</span>`;
      return `<div class="val-ans-chips">${arr.map((a, idx) => `<span class="val-ans-chip"><strong>${idx + 1}.</strong> ${escapeHtml(String(a))}</span>`).join(' &rarr; ')}</div>`;
    }

    if (PAIR_BASED_TYPES.has(type)) {
      if (typeof rawAns !== 'object' || Array.isArray(rawAns)) {
        return `<span class="val-empty-ans">No pairs / table cells submitted</span>`;
      }
      const pairs = Array.isArray(q.pairs) ? q.pairs : [];
      const rowsHtml = pairs.map((p) => {
        const chosen = rawAns[p.left] || '';
        const isRight = chosen && p.right && String(chosen).trim().toLowerCase() === String(p.right).trim().toLowerCase();
        return `
          <div class="val-match-item ${chosen ? (isRight ? 'correct' : 'wrong') : ''}">
            <strong>${escapeHtml(p.left)}</strong>
            <span>&rarr;</span>
            <span>${chosen ? escapeHtml(chosen) : '<em>Not answered</em>'}</span>
            ${p.right ? `<small class="val-expected-pair">(Expected: ${escapeHtml(p.right)})</small>` : ''}
          </div>
        `;
      }).join('');
      return `<div class="val-match-grid">${rowsHtml}</div>`;
    }

    return `<div class="val-text-response">${escapeHtml(String(rawAns))}</div>`;
  }

  function formatExpectedKeyHtml(q) {
    const type = q.type || 'mcq';
    if (type === 'checkbox' || type === 'hot_text') {
      const opts = Array.isArray(q.correctOptions) && q.correctOptions.length > 0
        ? q.correctOptions
        : (q.correctAnswer ? [q.correctAnswer] : []);
      return opts.length > 0 ? escapeHtml(opts.join(', ')) : '<em>Manual Valuation (No answer key set)</em>';
    }
    if (type === 'reorder') {
      const seq = Array.isArray(q.correctOptions) && q.correctOptions.length > 0
        ? q.correctOptions
        : (Array.isArray(q.options) ? q.options : []);
      return seq.length > 0
        ? seq.map((step, i) => `${i + 1}. ${escapeHtml(step)}`).join(' &rarr; ')
        : '<em>Manual Valuation</em>';
    }
    if (PAIR_BASED_TYPES.has(type)) {
      const pairs = Array.isArray(q.pairs) ? q.pairs : [];
      return pairs.length > 0
        ? pairs.map((p) => `${escapeHtml(p.left)} &rarr; ${escapeHtml(p.right)}`).join(' | ')
        : '<em>Manual Valuation</em>';
    }
    const key = q.correctAnswer || q.answerKey || '';
    return key ? escapeHtml(String(key)) : '<em>Manual Valuation (Examiner discretion)</em>';
  }

  function recalculateValuationSheetTotal() {
    if (!valuationQuestionsContainer || !activeValuationSubmission) return;
    const markInputs = valuationQuestionsContainer.querySelectorAll('.val-q-mark-input');
    let sum = 0;
    markInputs.forEach((inp) => {
      const val = parseFloat(inp.value);
      if (!isNaN(val) && val >= 0) {
        sum += val;
      }
    });
    sum = Math.round(sum * 100) / 100;
    const maxPts = activeValuationSubmission.maxMarks;

    if (valSheetManualTotalInput) {
      valSheetManualTotalInput.value = sum;
    }
    if (valSheetLiveTotal) {
      valSheetLiveTotal.textContent = `${sum} / ${maxPts} Pts`;
    }
  }

  function openValuationSheet(item) {
    if (!item || !valuationSheetView) return;
    activeValuationSubmission = item;

    hideAllMainSubviews();
    valuationSheetView.classList.add('active');
    valuationSheetView.style.display = 'flex';

    if (breadcrumbParent) {
      breadcrumbParent.textContent = 'Valuation';
      breadcrumbParent.style.display = '';
    }
    if (breadcrumbParentSep) breadcrumbParentSep.style.display = '';
    if (breadcrumbLabel) {
      breadcrumbLabel.textContent = `${item.programName} (${item.candidateDisplay})`;
    }

    if (valSheetCandidateName) valSheetCandidateName.textContent = item.candidateDisplay;
    if (valSheetCategory) valSheetCategory.textContent = item.category;
    if (valSheetProgramSubtitle) {
      valSheetProgramSubtitle.textContent = `Program: ${item.programName} • ${item.answeredCount} of ${item.questions.length} Questions Answered`;
    }
    if (valSheetOverallRemarks) {
      valSheetOverallRemarks.value = item.valuationRemarks || '';
    }
    if (valSheetMaxDenom) {
      valSheetMaxDenom.textContent = `/ ${item.maxMarks} Pts`;
    }

    if (valuationQuestionsContainer) {
      valuationQuestionsContainer.innerHTML = '';
      let qDisplayNum = 0;
      let secDisplayNum = 0;

      item.questions.forEach((q, idx) => {
        if (q.type === 'section') {
          secDisplayNum++;
          const secCard = document.createElement('div');
          secCard.className = 'gform-question-card gform-section-card valuation-q-card glass-card-dash';
          const secImageHtml = q.imageUrl
            ? `<div class="val-q-image-box">
                <img src="${escapeHtml(q.imageUrl)}" alt="Section Picture" class="val-q-image-el" />
              </div>`
            : '';
          secCard.innerHTML = `
            <div class="val-q-header">
              <div class="val-q-title-wrap">
                <span class="gform-q-num section-badge">SEC ${secDisplayNum}</span>
                <div>
                  <h3 class="val-q-prompt">${escapeHtml(q.questionText || `Section ${secDisplayNum}`)}</h3>
                  <span class="val-q-type-label">READING SECTION (READ ONLY • NO MARKS)</span>
                </div>
              </div>
              <span class="val-auto-pill manual">Read-Only Section (0 Pt)</span>
            </div>
            ${secImageHtml}
            ${
              q.sectionContent
                ? `<div class="val-answer-box key-box" style="margin-top: 8px;">
                    <span class="val-box-label">Section Reading Passage</span>
                    <div class="val-box-content" style="white-space: pre-wrap;">${escapeHtml(q.sectionContent)}</div>
                  </div>`
                : ''
            }
          `;
          valuationQuestionsContainer.appendChild(secCard);
          return;
        }

        qDisplayNum++;
        const maxPts = Math.max(0, parseFloat(q.points) || 1);
        const studentAns = getQuestionAnswerFromMap(item.answers, q, idx);
        const autoRes = computeAutoMarkForQuestion(q, studentAns);

        const hasSavedMark = item.savedQuestionMarks && item.savedQuestionMarks[idx] !== undefined;
        const initialMark = hasSavedMark ? Number(item.savedQuestionMarks[idx]) : autoRes.mark;
        const savedNote = (item.valuationNotes && item.valuationNotes[idx]) || '';

        let autoPillHtml = `<span class="val-auto-pill manual">Subjective / Examiner Grading</span>`;
        if (autoRes.status === 'correct') {
          autoPillHtml = `<span class="val-auto-pill correct">Auto-Check: Correct (+${autoRes.mark} Pt)</span>`;
        } else if (autoRes.status === 'partial') {
          autoPillHtml = `<span class="val-auto-pill partial">Auto-Check: Partial (+${autoRes.mark} Pt)</span>`;
        } else if (autoRes.status === 'incorrect') {
          autoPillHtml = `<span class="val-auto-pill incorrect">Auto-Check: Incorrect (0 Pt)</span>`;
        } else if (autoRes.status === 'unanswered') {
          autoPillHtml = `<span class="val-auto-pill unanswered">Unanswered (0 Pt)</span>`;
        }

        const qImageHtml = q.imageUrl
          ? `<div class="val-q-image-box">
              <img src="${escapeHtml(q.imageUrl)}" alt="Question Picture" class="val-q-image-el" />
            </div>`
          : '';

        const card = document.createElement('div');
        card.className = 'gform-question-card valuation-q-card glass-card-dash';
        card.setAttribute('data-q-idx', idx);
        card.setAttribute('data-max-pts', maxPts);

        card.innerHTML = `
          <div class="val-q-header">
            <div class="val-q-title-wrap">
              <span class="gform-q-num">Q${qDisplayNum}</span>
              <div>
                <h3 class="val-q-prompt">${escapeHtml(q.questionText || `Question #${qDisplayNum}`)}</h3>
                <span class="val-q-type-label">${escapeHtml((q.type || 'mcq').replace('_', ' ').toUpperCase())} • Max ${maxPts} Pt${maxPts === 1 ? '' : 's'}</span>
              </div>
            </div>
            ${autoPillHtml}
          </div>

          ${qImageHtml}
          ${
            q.sectionContent
              ? `<div class="val-answer-box key-box" style="margin-bottom: 6px;">
                  <span class="val-box-label">Question Passage / Context</span>
                  <div class="val-box-content" style="white-space: pre-wrap;">${escapeHtml(q.sectionContent)}</div>
                </div>`
              : ''
          }

          <div class="val-comparison-grid">
            <div class="val-answer-box student-box">
              <span class="val-box-label">Student's Submitted Answer</span>
              <div class="val-box-content">${formatStudentAnswerHtml(q, studentAns)}</div>
            </div>
            <div class="val-answer-box key-box">
              <span class="val-box-label">Reference Answer Key</span>
              <div class="val-box-content">${formatExpectedKeyHtml(q)}</div>
            </div>
          </div>

          <div class="val-grading-bar">
            <div class="val-quick-grade-btns">
              <span class="val-grade-label">Award Marks:</span>
              <button type="button" class="val-quick-btn full-btn" data-set-mark="${maxPts}">Full (${maxPts})</button>
              <button type="button" class="val-quick-btn half-btn" data-set-mark="${Math.round((maxPts / 2) * 10) / 10}">Half (${Math.round((maxPts / 2) * 10) / 10})</button>
              <button type="button" class="val-quick-btn zero-btn" data-set-mark="0">Zero (0)</button>
            </div>

            <div class="val-mark-input-group">
              <input
                type="number"
                class="val-q-mark-input"
                value="${initialMark}"
                min="0"
                max="${maxPts}"
                step="0.5"
              />
              <span class="val-pts-suffix">/ ${maxPts} Pts</span>
            </div>

            <div class="val-note-input-wrap">
              <input
                type="text"
                class="val-q-note-input"
                value="${escapeHtml(savedNote)}"
                placeholder="Note for Q${idx + 1} (optional)..."
              />
            </div>
          </div>
        `;

        const markInp = card.querySelector('.val-q-mark-input');
        if (markInp) {
          markInp.addEventListener('input', recalculateValuationSheetTotal);
        }

        card.querySelectorAll('.val-quick-btn').forEach((qBtn) => {
          qBtn.addEventListener('click', () => {
            const targetVal = parseFloat(qBtn.getAttribute('data-set-mark')) || 0;
            if (markInp) {
              markInp.value = targetVal;
              recalculateValuationSheetTotal();
            }
          });
        });

        valuationQuestionsContainer.appendChild(card);
      });
    }

    recalculateValuationSheetTotal();
    if ( item.isValuated && valSheetManualTotalInput ) {
      valSheetManualTotalInput.value = item.awardedMarks;
      if (valSheetLiveTotal) {
        valSheetLiveTotal.textContent = `${item.awardedMarks} / ${item.maxMarks} Pts`;
      }
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function closeValuationSheet() {
    hideAllMainSubviews();
    if (valuationView) {
      valuationView.classList.add('active');
      valuationView.style.display = 'flex';
    }
    if (breadcrumbParent) breadcrumbParent.style.display = 'none';
    if (breadcrumbParentSep) breadcrumbParentSep.style.display = 'none';
    if (breadcrumbLabel) breadcrumbLabel.textContent = 'Valuation';
    activeValuationSubmission = null;
    loadAndRenderValuationTable();
  }

  if (valuationSheetBackBtn) {
    valuationSheetBackBtn.addEventListener('click', closeValuationSheet);
  }

  if (valSheetManualTotalInput) {
    valSheetManualTotalInput.addEventListener('input', () => {
      if (!activeValuationSubmission) return;
      const val = parseFloat(valSheetManualTotalInput.value) || 0;
      if (valSheetLiveTotal) {
        valSheetLiveTotal.textContent = `${val} / ${activeValuationSubmission.maxMarks} Pts`;
      }
    });
  }

  if (autoGradeObjectiveBtn) {
    autoGradeObjectiveBtn.addEventListener('click', () => {
      if (!activeValuationSubmission || !valuationQuestionsContainer) return;
      const cards = valuationQuestionsContainer.querySelectorAll('.valuation-q-card');
      cards.forEach((card) => {
        const idx = Number(card.getAttribute('data-q-idx'));
        const q = activeValuationSubmission.questions[idx];
        const studentAns = getQuestionAnswerFromMap(activeValuationSubmission.answers, q, idx);
        if (q) {
          const autoRes = computeAutoMarkForQuestion(q, studentAns);
          const inp = card.querySelector('.val-q-mark-input');
          if (inp && autoRes.hasKey) {
            inp.value = autoRes.mark;
          }
        }
      });
      recalculateValuationSheetTotal();
      showToast('Auto-checked objective answers from answer keys!');
    });
  }

  async function handleSaveValuation(e) {
    if (e) e.preventDefault();
    if (!activeValuationSubmission) return;

    const questionMarks = {};
    const questionNotes = {};
    if (valuationQuestionsContainer) {
      const cards = valuationQuestionsContainer.querySelectorAll('.valuation-q-card');
      cards.forEach((card) => {
        const idx = Number(card.getAttribute('data-q-idx'));
        const markInp = card.querySelector('.val-q-mark-input');
        const noteInp = card.querySelector('.val-q-note-input');
        questionMarks[idx] = markInp ? Math.max(0, parseFloat(markInp.value) || 0) : 0;
        if (noteInp && noteInp.value.trim()) {
          questionNotes[idx] = noteInp.value.trim();
        }
      });
    }

    const finalAwarded = valSheetManualTotalInput
      ? Math.max(0, parseFloat(valSheetManualTotalInput.value) || 0)
      : Object.values(questionMarks).reduce((a, b) => a + b, 0);
    const overallRemarks = valSheetOverallRemarks ? valSheetOverallRemarks.value.trim() : '';

    if (saveValuationBtn) {
      saveValuationBtn.disabled = true;
      const txt = saveValuationBtn.querySelector('.btn-text');
      if (txt) txt.textContent = 'Saving...';
    }

    try {
      const allRecords = await getAllRecordsFromDB();
      const targetRec = allRecords.find((r) => String(r.id) === String(activeValuationSubmission.recordId)) || activeValuationSubmission.rec;

      const updatedRecord = {
        ...targetRec,
        valuated: true,
        valuationMarks: questionMarks,
        valuationNotes: questionNotes,
        totalAwardedMarks: finalAwarded,
        maxTotalMarks: activeValuationSubmission.maxMarks,
        valuationRemarks: overallRemarks,
        valuatedAt: Date.now()
      };

      await saveRecordToDB(updatedRecord);

      if (activeValuationSubmission.attemptKey) {
        const attemptsMap = getCandidateAttemptsMap();
        const existingAttempt = attemptsMap[activeValuationSubmission.attemptKey] || {};
        attemptsMap[activeValuationSubmission.attemptKey] = {
          ...existingAttempt,
          valuated: true,
          valuationMarks: questionMarks,
          valuationNotes: questionNotes,
          totalAwardedMarks: finalAwarded,
          maxTotalMarks: activeValuationSubmission.maxMarks,
          valuationRemarks: overallRemarks,
          valuatedAt: Date.now()
        };
        saveCandidateAttemptsMap(attemptsMap);
      }

      showToast(`Valuation saved (${finalAwarded} / ${activeValuationSubmission.maxMarks} Pts) for ${activeValuationSubmission.candidateDisplay}!`);
      closeValuationSheet();
    } catch (err) {
      console.error('Error saving valuation:', err);
      showToast('Error saving valuation');
    } finally {
      if (saveValuationBtn) {
        saveValuationBtn.disabled = false;
        const txt = saveValuationBtn.querySelector('.btn-text');
        if (txt) txt.textContent = 'Save Valuation';
      }
    }
  }

  if (valuationSheetForm) {
    valuationSheetForm.addEventListener('submit', handleSaveValuation);
  }
  if (saveValuationBtn) {
    saveValuationBtn.addEventListener('click', handleSaveValuation);
  }

  const shareValuationProgramBtn = document.getElementById('shareValuationProgramBtn');
  const shareValuationSheetBtn = document.getElementById('shareValuationSheetBtn');

  if (shareValuationProgramBtn) {
    shareValuationProgramBtn.addEventListener('click', () => {
      const selectedKey = valuationProgramSelect ? valuationProgramSelect.value : 'all';
      if (selectedKey && selectedKey !== 'all') {
        const match = cachedValuationItems.find((it) => it.programKey === selectedKey);
        if (match) {
          openShareValuationModal({
            programName: match.programName,
            category: match.category
          });
          return;
        }
      }

      if (isSharedValuationStandaloneMode) {
        const progParam = (urlParams.get('program') || '').trim();
        const catParam = (urlParams.get('category') || 'General').trim();
        if (progParam && progParam.toLowerCase() !== 'all') {
          openShareValuationModal({ programName: progParam, category: catParam });
          return;
        }
      }

      const uniqueProgs = new Map();
      cachedValuationItems.forEach((it) => {
        if (!uniqueProgs.has(it.programKey)) {
          uniqueProgs.set(it.programKey, { programName: it.programName, category: it.category });
        }
      });

      if (uniqueProgs.size === 1) {
        openShareValuationModal(Array.from(uniqueProgs.values())[0]);
      } else {
        openShareValuationModal({ programName: 'all', category: 'Valuation Portal' });
      }
    });
  }

  if (shareValuationSheetBtn) {
    shareValuationSheetBtn.addEventListener('click', () => {
      if (activeValuationSubmission) {
        openShareValuationModal({
          programName: activeValuationSubmission.programName,
          category: activeValuationSubmission.category
        });
      }
    });
  }

  async function activateSharedValuationFromUrl() {
    if (!isSharedValuationStandaloneMode) return;
    document.body.classList.add('shared-valuation-mode');

    const progParam = (urlParams.get('program') || '').trim();
    const catParam = (urlParams.get('category') || 'General').trim();
    const isSpecificProg = Boolean(progParam && progParam.toLowerCase() !== 'all');

    // Physically remove all other Admin views, sidebar, breadcrumbs, and Share buttons from DOM
    const selectorsToRemove = [
      '#adminSidebar',
      '.breadcrumb-container',
      '#programsView',
      '#candidatesView',
      '#questionView',
      '#setExamPageView',
      '#settingsView',
      '#addRecordModal',
      '#shareExamModal',
      '#bulkUploadQuestionsModal',
      '#shareValuationProgramBtn',
      '#shareValuationSheetBtn'
    ];
    if (isSpecificProg) {
      selectorsToRemove.push('#valuationProgramSelect');
    }
    selectorsToRemove.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => el.remove());
    });

    document.title = isSpecificProg
      ? `${progParam} (${catParam}) — Valuation`
      : `Sibaq '26 — Valuation Portal`;

    hideAllMainSubviews();
    if (valuationView) {
      valuationView.classList.add('active');
      valuationView.style.display = 'flex';
      const titleEl = valuationView.querySelector('.panel-title');
      const descEl = valuationView.querySelector('.panel-desc');
      if (isSpecificProg) {
        if (titleEl) titleEl.textContent = `${progParam} (${catParam}) — Valuation`;
        if (descEl) descEl.textContent = `Review students' submitted exams and perform valuation for ${progParam} (${catParam})`;
      }
    }

    await loadAndRenderValuationTable();
    // Remove row share buttons in restricted shared valuation view
    document.querySelectorAll('.share-valuation-row-btn').forEach((btn) => btn.remove());
  }

  // ==========================================================================
  // Settings Section: Set From & To Timer Schedule for Multiple Programs
  // ==========================================================================
  const settingsTimerForm = document.getElementById('settingsTimerForm');
  const scheduleFromTimeInput = document.getElementById('scheduleFromTime');
  const scheduleToTimeInput = document.getElementById('scheduleToTime');
  const scheduleFromTimeError = document.getElementById('scheduleFromTimeError');
  const scheduleToTimeError = document.getElementById('scheduleToTimeError');
  const scheduleDurationText = document.getElementById('scheduleDurationText');
  const selectedScheduleProgramsList = document.getElementById('selectedScheduleProgramsList');
  const scheduleProgramSearchInput = document.getElementById('scheduleProgramSearchInput');
  const scheduleProgramDropdown = document.getElementById('scheduleProgramDropdown');
  const scheduleProgramsError = document.getElementById('scheduleProgramsError');
  const selectAllProgramsScheduleBtn = document.getElementById('selectAllProgramsScheduleBtn');
  const clearSelectedProgramsScheduleBtn = document.getElementById('clearSelectedProgramsScheduleBtn');
  const saveScheduleTimerBtn = document.getElementById('saveScheduleTimerBtn');
  const scheduledProgramsTableBody = document.getElementById('scheduledProgramsTableBody');
  const scheduledProgramsCountBadge = document.getElementById('scheduledProgramsCountBadge');

  function getProgramSchedulesMap() {
    try {
      return JSON.parse(localStorage.getItem('sibaq_program_schedules') || '{}');
    } catch (e) {
      return {};
    }
  }

  function saveProgramSchedulesMap(map) {
    try {
      localStorage.setItem('sibaq_program_schedules', JSON.stringify(map));
    } catch (e) {}
  }

  function formatTime12Hour(time24) {
    if (!time24 || !time24.includes(':')) return time24 || '--:--';
    const [hStr, mStr] = time24.split(':');
    let h = parseInt(hStr, 10);
    const m = mStr || '00';
    if (isNaN(h)) return time24;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
  }

  function calculateDurationMinutes(fromTime, toTime) {
    if (!fromTime || !toTime) return 0;
    const [fh, fm] = fromTime.split(':').map(Number);
    const [th, tm] = toTime.split(':').map(Number);
    if (isNaN(fh) || isNaN(fm) || isNaN(th) || isNaN(tm)) return 0;
    let startMins = fh * 60 + fm;
    let endMins = th * 60 + tm;
    if (endMins <= startMins) {
      endMins += 24 * 60;
    }
    return endMins - startMins;
  }

  function updateScheduleDurationPreview() {
    if (!scheduleDurationText) return;
    const fromVal = scheduleFromTimeInput ? scheduleFromTimeInput.value : '';
    const toVal = scheduleToTimeInput ? scheduleToTimeInput.value : '';
    if (!fromVal || !toVal) {
      scheduleDurationText.textContent = 'Select From & To time';
      return;
    }
    const mins = calculateDurationMinutes(fromVal, toVal);
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    const humanDur = hrs > 0
      ? `${hrs}h ${remMins > 0 ? `${remMins}m` : ''} (${mins} Minutes)`
      : `${mins} Minutes`;
    scheduleDurationText.textContent = `${humanDur} • ${formatTime12Hour(fromVal)} → ${formatTime12Hour(toVal)}`;
  }

  if (scheduleFromTimeInput) {
    scheduleFromTimeInput.addEventListener('input', () => {
      if (scheduleFromTimeError) scheduleFromTimeError.textContent = '';
      updateScheduleDurationPreview();
    });
  }

  if (scheduleToTimeInput) {
    scheduleToTimeInput.addEventListener('input', () => {
      if (scheduleToTimeError) scheduleToTimeError.textContent = '';
      updateScheduleDurationPreview();
    });
  }

  async function getAllUniqueCreatedPrograms() {
    const records = await getAllRecordsFromDB();
    const savedExams = getSavedExamsMap();
    const schedules = getProgramSchedulesMap();
    const map = new Map();

    records.forEach((rec) => {
      if (!rec.programName) return;
      const key = makeProgramExamKey(rec.programName, rec.category);
      if (!map.has(key)) {
        const sched = schedules[key] || {};
        map.set(key, {
          key,
          programName: rec.programName,
          category: rec.category || 'General',
          fromTime: rec.examFromTime || sched.fromTime || '',
          toTime: rec.examToTime || sched.toTime || '',
          examDuration: rec.examDuration || sched.examDuration || savedExams[key]?.examDuration || ''
        });
      }
    });

    return Array.from(map.values());
  }

  function addScheduleProgramChip(prog) {
    if (!selectedScheduleProgramsList || !prog) return;
    const existing = Array.from(selectedScheduleProgramsList.querySelectorAll('.schedule-prog-chip')).some(
      (chip) => chip.getAttribute('data-prog-key') === prog.key
    );
    if (existing) return;

    const chip = document.createElement('span');
    chip.className = 'student-chip schedule-prog-chip';
    chip.setAttribute('data-prog-key', prog.key);
    chip.setAttribute('data-prog-name', prog.programName);
    chip.setAttribute('data-prog-cat', prog.category);
    chip.innerHTML = `
      <span class="chip-chest">${escapeHtml(prog.category)}</span>
      <span class="chip-name">${escapeHtml(prog.programName)}</span>
      <button type="button" class="chip-del" title="Remove program">&times;</button>
    `;

    chip.querySelector('.chip-del')?.addEventListener('click', () => {
      chip.remove();
      if (scheduleProgramDropdown && scheduleProgramDropdown.style.display !== 'none') {
        renderScheduleProgramSuggestions();
      }
    });

    selectedScheduleProgramsList.appendChild(chip);
    if (scheduleProgramsError) scheduleProgramsError.textContent = '';
  }

  async function renderScheduleProgramSuggestions() {
    if (!scheduleProgramDropdown || !scheduleProgramSearchInput) return;
    const query = scheduleProgramSearchInput.value.trim().toLowerCase();
    const programs = await getAllUniqueCreatedPrograms();
    const selectedKeys = new Set(
      Array.from(selectedScheduleProgramsList?.querySelectorAll('.schedule-prog-chip') || []).map((c) => c.getAttribute('data-prog-key'))
    );

    const filtered = programs.filter((p) => {
      if (!query) return true;
      return p.programName.toLowerCase().includes(query) || p.category.toLowerCase().includes(query);
    });

    scheduleProgramDropdown.innerHTML = '';

    if (filtered.length === 0) {
      scheduleProgramDropdown.innerHTML = `
        <div style="padding: 12px 14px; font-size: 0.78rem; color: var(--text-dim); text-align: center;">
          ${programs.length === 0 ? 'No programs created yet. Add programs in "Data &gt; All Programs" first.' : 'No matching programs found.'}
        </div>
      `;
      scheduleProgramDropdown.style.display = 'flex';
      return;
    }

    filtered.forEach((prog) => {
      const isSelected = selectedKeys.has(prog.key);
      const item = document.createElement('div');
      item.className = `student-suggestion-item ${isSelected ? 'selected-prog-item' : ''}`;
      const timeTag = prog.fromTime && prog.toTime
        ? `${formatTime12Hour(prog.fromTime)} - ${formatTime12Hour(prog.toTime)}`
        : 'No timer set';

      item.innerHTML = `
        <div class="suggestion-left">
          <span class="suggestion-chest">${escapeHtml(prog.category)}</span>
          <span class="suggestion-name">${escapeHtml(prog.programName)}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <span class="suggestion-cat">${escapeHtml(timeTag)}</span>
          <span class="prog-multi-check">${isSelected ? '✓ Selected' : '+ Select'}</span>
        </div>
      `;

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isSelected) {
          const chipToRemove = selectedScheduleProgramsList?.querySelector(`.schedule-prog-chip[data-prog-key="${CSS.escape(prog.key)}"]`);
          if (chipToRemove) chipToRemove.remove();
        } else {
          addScheduleProgramChip(prog);
        }
        renderScheduleProgramSuggestions();
      });

      scheduleProgramDropdown.appendChild(item);
    });

    scheduleProgramDropdown.style.display = 'flex';
  }

  if (scheduleProgramSearchInput) {
    scheduleProgramSearchInput.addEventListener('focus', renderScheduleProgramSuggestions);
    scheduleProgramSearchInput.addEventListener('input', renderScheduleProgramSuggestions);
  }

  if (selectAllProgramsScheduleBtn) {
    selectAllProgramsScheduleBtn.addEventListener('click', async () => {
      const allProgs = await getAllUniqueCreatedPrograms();
      if (allProgs.length === 0) {
        showToast('No created programs found to select');
        return;
      }
      allProgs.forEach((p) => addScheduleProgramChip(p));
      showToast(`Selected all ${allProgs.length} program(s)`);
    });
  }

  if (clearSelectedProgramsScheduleBtn) {
    clearSelectedProgramsScheduleBtn.addEventListener('click', () => {
      if (selectedScheduleProgramsList) selectedScheduleProgramsList.innerHTML = '';
    });
  }

  async function loadAndRenderScheduledPrograms() {
    if (!scheduledProgramsTableBody) return;
    try {
      const allProgs = await getAllUniqueCreatedPrograms();
      const schedules = getProgramSchedulesMap();

      const scheduledList = [];
      allProgs.forEach((prog) => {
        const s = schedules[prog.key] || {};
        const fromTime = s.fromTime || prog.fromTime || '';
        const toTime = s.toTime || prog.toTime || '';
        if (fromTime && toTime) {
          const mins = s.durationMinutes || calculateDurationMinutes(fromTime, toTime);
          scheduledList.push({
            ...prog,
            fromTime,
            toTime,
            durationMinutes: mins,
            examDuration: s.examDuration || `${mins} Minutes`
          });
        }
      });

      if (scheduledProgramsCountBadge) {
        scheduledProgramsCountBadge.textContent = `${scheduledList.length} Scheduled`;
      }

      scheduledProgramsTableBody.innerHTML = '';

      if (scheduledList.length === 0) {
        scheduledProgramsTableBody.innerHTML = `
          <tr class="empty-state-row">
            <td colspan="6" style="text-align: center; padding: 36px 20px; color: var(--text-muted);">
              <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" style="color: var(--text-dim);">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="12 6 12 12 16 14"></polyline>
                </svg>
                <span style="font-weight: 600; font-size: 0.875rem; color: var(--text-main);">No program timers configured yet</span>
                <span style="font-size: 0.775rem;">Use the form above to set From &amp; To timer schedules for one or multiple programs</span>
              </div>
            </td>
          </tr>
        `;
        return;
      }

      scheduledList.forEach((item) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong class="program-title">${escapeHtml(item.programName)}</strong></td>
          <td><span class="category-tag">${escapeHtml(item.category)}</span></td>
          <td><span class="schedule-time-pill from-pill">${escapeHtml(formatTime12Hour(item.fromTime))}</span></td>
          <td><span class="schedule-time-pill to-pill">${escapeHtml(formatTime12Hour(item.toTime))}</span></td>
          <td><span class="exam-status-pill">${escapeHtml(item.examDuration)}</span></td>
          <td style="text-align: right;">
            <div class="question-row-actions">
              <button type="button" class="row-action-btn edit-schedule-btn" title="Edit schedule in form">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button type="button" class="row-action-btn delete-btn delete-schedule-btn" title="Remove timer schedule">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </td>
        `;

        tr.querySelector('.edit-schedule-btn')?.addEventListener('click', () => {
          if (scheduleFromTimeInput) scheduleFromTimeInput.value = item.fromTime;
          if (scheduleToTimeInput) scheduleToTimeInput.value = item.toTime;
          updateScheduleDurationPreview();
          if (selectedScheduleProgramsList) selectedScheduleProgramsList.innerHTML = '';
          addScheduleProgramChip(item);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          showToast(`Loaded "${item.programName}" schedule into form`);
        });

        tr.querySelector('.delete-schedule-btn')?.addEventListener('click', async () => {
          const map = getProgramSchedulesMap();
          delete map[item.key];
          saveProgramSchedulesMap(map);

          const allRecs = await getAllRecordsFromDB();
          const matching = allRecs.filter((r) => makeProgramExamKey(r.programName, r.category) === item.key);
          for (const rec of matching) {
            await saveRecordToDB({
              ...rec,
              examFromTime: '',
              examToTime: ''
            });
          }
          await loadAndRenderScheduledPrograms();
          showToast(`Removed timer schedule for "${item.programName}"`);
        });

        scheduledProgramsTableBody.appendChild(tr);
      });
    } catch (err) {
      console.error('Error rendering scheduled programs:', err);
    }
  }

  if (settingsTimerForm) {
    settingsTimerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (scheduleFromTimeError) scheduleFromTimeError.textContent = '';
      if (scheduleToTimeError) scheduleToTimeError.textContent = '';
      if (scheduleProgramsError) scheduleProgramsError.textContent = '';

      const fromTime = scheduleFromTimeInput ? scheduleFromTimeInput.value.trim() : '';
      const toTime = scheduleToTimeInput ? scheduleToTimeInput.value.trim() : '';
      const selectedChips = selectedScheduleProgramsList
        ? Array.from(selectedScheduleProgramsList.querySelectorAll('.schedule-prog-chip'))
        : [];

      let hasError = false;
      if (!fromTime) {
        if (scheduleFromTimeError) scheduleFromTimeError.textContent = 'From time is required';
        hasError = true;
      }
      if (!toTime) {
        if (scheduleToTimeError) scheduleToTimeError.textContent = 'To time is required';
        hasError = true;
      }
      if (selectedChips.length === 0) {
        if (scheduleProgramsError) scheduleProgramsError.textContent = 'Please search and select at least one program';
        hasError = true;
      }
      if (hasError) return;

      const durationMinutes = calculateDurationMinutes(fromTime, toTime);
      const examDurationStr = `${durationMinutes} Minutes`;

      if (saveScheduleTimerBtn) {
        saveScheduleTimerBtn.disabled = true;
        const txt = saveScheduleTimerBtn.querySelector('.btn-text');
        if (txt) txt.textContent = 'Saving Schedule...';
      }

      try {
        const schedulesMap = getProgramSchedulesMap();
        const savedExams = getSavedExamsMap();
        const allRecords = await getAllRecordsFromDB();

        const selectedPrograms = selectedChips.map((chip) => ({
          key: chip.getAttribute('data-prog-key'),
          programName: chip.getAttribute('data-prog-name'),
          category: chip.getAttribute('data-prog-cat')
        }));

        for (const prog of selectedPrograms) {
          schedulesMap[prog.key] = {
            key: prog.key,
            programName: prog.programName,
            category: prog.category,
            fromTime,
            toTime,
            durationMinutes,
            examDuration: examDurationStr,
            updatedAt: Date.now()
          };

          if (savedExams[prog.key]) {
            savedExams[prog.key].examDuration = examDurationStr;
            savedExams[prog.key].examFromTime = fromTime;
            savedExams[prog.key].examToTime = toTime;
          } else {
            savedExams[prog.key] = {
              examDuration: examDurationStr,
              examFromTime: fromTime,
              examToTime: toTime,
              updatedAt: Date.now()
            };
          }

          const matchingRecs = allRecords.filter(
            (r) => makeProgramExamKey(r.programName, r.category) === prog.key
          );
          for (const rec of matchingRecs) {
            await saveRecordToDB({
              ...rec,
              examFromTime: fromTime,
              examToTime: toTime,
              examDuration: examDurationStr
            });
          }
        }

        saveProgramSchedulesMap(schedulesMap);
        localStorage.setItem('sibaq_exams', JSON.stringify(savedExams));

        if (selectedScheduleProgramsList) selectedScheduleProgramsList.innerHTML = '';
        if (scheduleProgramSearchInput) scheduleProgramSearchInput.value = '';
        await loadAndRenderScheduledPrograms();
        await loadAndRenderQuestionTable();

        showToast(`Set timer (${formatTime12Hour(fromTime)} – ${formatTime12Hour(toTime)}) for ${selectedPrograms.length} program(s)!`);
      } catch (err) {
        console.error('Error saving schedule timer:', err);
        showToast('Error saving timer schedule');
      } finally {
        if (saveScheduleTimerBtn) {
          saveScheduleTimerBtn.disabled = false;
          const txt = saveScheduleTimerBtn.querySelector('.btn-text');
          if (txt) txt.textContent = 'Save Timer Schedule';
        }
      }
    });
  }

  // Logout Interaction
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      logoutBtn.disabled = true;
      logoutBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon">
          <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-linecap="round"></circle>
        </svg>
        <span>Logging out...</span>
      `;

      sessionStorage.removeItem('sibaq_auth');
      showToast('Logged out from admin portal. Redirecting...');

      setTimeout(() => {
        window.location.href = 'index.html';
      }, 500);
    });
  }

  // Start Firebase / Database initialization after all views & controllers are registered
  initDatabase();
});
