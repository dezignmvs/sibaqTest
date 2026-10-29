/**
 * Sibaq '26 Candidate Examination Terminal Logic
 * - Fullscreen proctored examination mode
 * - Slide-by-slide question navigation (Back & Continue / Submit)
 * - Automatic real-time data saving on every answer, fullscreen exit, or zoom in/out
 * - Locks attempt upon exit/zoom/submit; unlocks when Admin grants/reopens another chance
 */

document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logoutBtn');
  const toastNotice = document.getElementById('toastNotice');

  const userNameEl = document.getElementById('userName');
  const userChestSubEl = document.getElementById('userChestSub');
  const welcomeNameEl = document.getElementById('welcomeName');
  const candidateBadgeEl = document.getElementById('candidateBadge');
  const chestNumDisplayEl = document.getElementById('chestNumDisplay');
  const candidateCategoryDisplayEl = document.getElementById('candidateCategoryDisplay');
  const examPapersCountBadgeEl = document.getElementById('examPapersCountBadge');
  const instDisplayEl = document.getElementById('instDisplay');
  const statEventsCountEl = document.getElementById('statEventsCount');
  const statNextTimeEl = document.getElementById('statNextTime');
  const statNextVenueEl = document.getElementById('statNextVenue');
  const statPointsDisplayEl = document.getElementById('statPointsDisplay');
  const eventsTableBody = document.getElementById('eventsTableBody');
  const avatarInitialEl = document.getElementById('avatarInitial');
  const statChestCaption = document.getElementById('statChestCaption');

  // Fullscreen Slide Exam Elements
  const candidateExamModal = document.getElementById('candidateExamModal');
  const candExamCategoryBadge = document.getElementById('candExamCategoryBadge');
  const candExamModalTitle = document.getElementById('candExamModalTitle');
  const candExamCloseBtn = document.getElementById('candExamCloseBtn');
  const candExamStudentName = document.getElementById('candExamStudentName');
  const candExamChestNo = document.getElementById('candExamChestNo');
  const candExamDuration = document.getElementById('candExamDuration');
  const autoSaveStatusText = document.getElementById('autoSaveStatusText');
  const examSlideProgressFill = document.getElementById('examSlideProgressFill');
  const examSlideDots = document.getElementById('examSlideDots');
  const candExamQuestionText = document.getElementById('candExamQuestionText');
  const candExamSubmitForm = document.getElementById('candExamSubmitForm');
  const examSlideBackBtn = document.getElementById('examSlideBackBtn');
  const examSlideNextBtn = document.getElementById('examSlideNextBtn');
  const candExamFinishBtn = document.getElementById('candExamFinishBtn');
  const examSlideCounterText = document.getElementById('examSlideCounterText');

  const DB_NAME = 'SibaqRecordsDB';
  const DB_VERSION = 2;
  const STORE_NAME = 'records';
  const STUDENTS_STORE = 'students';

  // Strictly enforce verified session from Admin-entered chest number
  const stored = sessionStorage.getItem('sibaq_participant');
  if (!stored) {
    window.location.href = 'index.html';
    return;
  }

  let participant = null;
  try {
    participant = JSON.parse(stored);
  } catch (e) {
    window.location.href = 'index.html';
    return;
  }

  if (!participant || !participant.chestNo) {
    window.location.href = 'index.html';
    return;
  }

  // Active Exam State
  let activeProgram = null;
  let activeSlides = [];
  let currentSlideIndex = 0;
  let currentAnswers = {};
  let isExamActive = false;
  let enteredFullscreenSuccessfully = false;
  let initialPixelRatio = window.devicePixelRatio || 1;
  let initialVisualScale = window.visualViewport ? window.visualViewport.scale : 1;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function showToast(message, duration = 3200) {
    if (!toastNotice) return;
    toastNotice.textContent = message;
    toastNotice.style.display = 'block';
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      toastNotice.style.display = 'none';
    }, duration);
  }

  function makeProgramExamKey(programName, category) {
    return `${(programName || '').trim().toLowerCase()}__${(category || '').trim().toLowerCase()}`;
  }

  function makeCandidateAttemptKey(chestNo, programKey) {
    return `${String(chestNo || '').trim().toLowerCase()}__${programKey}`;
  }

  function getAttemptsMap() {
    try {
      return JSON.parse(localStorage.getItem('sibaq_candidate_attempts') || '{}');
    } catch (e) {
      return {};
    }
  }

  function getCandidateAttempt(programKey) {
    const map = getAttemptsMap();
    const aKey = makeCandidateAttemptKey(participant.chestNo, programKey);
    return map[aKey] || null;
  }

  function saveCandidateAttemptLocal(programKey, attemptData) {
    try {
      const map = getAttemptsMap();
      const aKey = makeCandidateAttemptKey(participant.chestNo, programKey);
      map[aKey] = {
        ...(map[aKey] || {}),
        ...attemptData,
        chestNo: participant.chestNo,
        candidateName: participant.name,
        programKey,
        updatedAt: Date.now()
      };
      localStorage.setItem('sibaq_candidate_attempts', JSON.stringify(map));
      return map[aKey];
    } catch (e) {
      return attemptData;
    }
  }

  function getSavedExamsMap() {
    try {
      return JSON.parse(localStorage.getItem('sibaq_exams') || '{}');
    } catch (e) {
      return {};
    }
  }

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
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STUDENTS_STORE)) {
          db.createObjectStore(STUDENTS_STORE, { keyPath: 'chestNo' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function getStoreAllFromIndexedDB(storeName) {
    return openIndexedDB()
      .then((db) => {
        return new Promise((resolve) => {
          if (!db.objectStoreNames.contains(storeName)) {
            resolve([]);
            return;
          }
          const tx = db.transaction([storeName], 'readonly');
          const store = tx.objectStore(storeName);
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => resolve([]);
        });
      })
      .catch(() => []);
  }

  function saveRecordToIndexedDB(record) {
    return openIndexedDB()
      .then((db) => {
        return new Promise((resolve) => {
          const tx = db.transaction([STORE_NAME], 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          store.put(record);
          tx.oncomplete = () => resolve(record);
          tx.onerror = () => resolve(record);
        });
      })
      .catch(() => record);
  }

  // Persist candidate's auto-saved answers and lock status to both IndexedDB and Firebase Firestore
  async function persistAttemptToRecordDB(prog, attemptPayload) {
    if (!prog) return;
    const saved = saveCandidateAttemptLocal(prog.key, attemptPayload);

    if (prog.recordId) {
      const localRecords = await getStoreAllFromIndexedDB(STORE_NAME);
      const targetRec = localRecords.find((r) => String(r.id) === String(prog.recordId));
      const updatedFields = {
        ...(targetRec || {
          id: prog.recordId,
          programName: prog.name,
          category: prog.category,
          chestNo: participant.chestNo,
          candidate: `${participant.name} (#${participant.chestNo})`
        }),
        examLocked: Boolean(attemptPayload.locked),
        examStatus: attemptPayload.status || (attemptPayload.locked ? 'submitted' : 'in_progress'),
        lockReason: attemptPayload.lockReason || '',
        savedAnswers: attemptPayload.answers || {},
        reopenCount: prog.reopenCount || 0,
        lastSavedAt: Date.now()
      };

      await saveRecordToIndexedDB(updatedFields);

      if (window.SibaqFirebase?.db && window.SibaqFirebase?.doc && window.SibaqFirebase?.setDoc) {
        try {
          const { db, doc, setDoc } = window.SibaqFirebase;
          await setDoc(doc(db, STORE_NAME, String(prog.recordId)), updatedFields, { merge: true });
        } catch (e) {}
      }
    }
    return saved;
  }

  // Update Header & Profile Cards
  function renderProfileHeader() {
    if (userNameEl) userNameEl.textContent = participant.name;
    if (welcomeNameEl) welcomeNameEl.textContent = participant.name;
    if (userChestSubEl) userChestSubEl.textContent = `Chest #${participant.chestNo}`;
    if (chestNumDisplayEl) chestNumDisplayEl.textContent = `#${participant.chestNo}`;
    if (candidateCategoryDisplayEl) {
      candidateCategoryDisplayEl.textContent = participant.category || 'General';
    }
    if (instDisplayEl) instDisplayEl.textContent = participant.institution || "Darul Huda Sibaq '26";
    if (candidateBadgeEl) {
      candidateBadgeEl.textContent = `Verified Candidate • ${participant.category || 'General'}`;
    }
    if (avatarInitialEl) {
      avatarInitialEl.textContent = (participant.name || '#').charAt(0).toUpperCase();
    }
    if (statChestCaption) {
      statChestCaption.textContent = `Chest #${participant.chestNo} Verified`;
    }
  }

  // Determine whether a program is currently locked or unlocked (including Admin reopened chance)
  function resolveProgramLockState(evt) {
    const cat = evt.category || participant.category || 'General';
    const key = makeProgramExamKey(evt.name, cat);
    const localAttempt = getCandidateAttempt(key);

    const recordReopenCount = Number(evt.reopenCount || 0);
    const localReopenCount = Number(localAttempt?.reopenCount || 0);

    // If Admin reopened a new chance (recordReopenCount > localReopenCount or evt.examLocked === false with reopenCount > 0)
    if (recordReopenCount > localReopenCount) {
      saveCandidateAttemptLocal(key, {
        locked: false,
        status: 'reopened',
        lockReason: '',
        reopenCount: recordReopenCount,
        answers: localAttempt?.answers || evt.savedAnswers || {}
      });
      return {
        isLocked: false,
        isReopened: true,
        reopenCount: recordReopenCount,
        statusLabel: `Reopened (Chance #${recordReopenCount + 1})`,
        lockReason: ''
      };
    }

    const isLocked = evt.examLocked !== undefined
      ? Boolean(evt.examLocked)
      : Boolean(localAttempt?.locked);

    const lockReason = evt.lockReason || localAttempt?.lockReason || '';
    const effectiveReopenCount = Math.max(recordReopenCount, localReopenCount);

    return {
      isLocked,
      isReopened: !isLocked && effectiveReopenCount > 0,
      reopenCount: effectiveReopenCount,
      statusLabel: isLocked
        ? (lockReason ? `Auto-Saved (${lockReason})` : 'Submitted & Locked')
        : (effectiveReopenCount > 0 ? `Reopened (Chance #${effectiveReopenCount + 1})` : 'Ready to Start'),
      lockReason
    };
  }

  // Render the candidate's allocated programs with Start / Locked state
  function renderCandidatePrograms(eventsList) {
    const events = Array.isArray(eventsList) ? eventsList : [];

    if (statEventsCountEl) {
      const count = events.length;
      statEventsCountEl.textContent = count < 10 ? `0${count}` : String(count);
    }

    if (examPapersCountBadgeEl) {
      examPapersCountBadgeEl.textContent = `${events.length} Program${events.length === 1 ? '' : 's'} Assigned`;
    }

    if (statNextTimeEl && statNextVenueEl) {
      if (events.length > 0) {
        statNextTimeEl.textContent = 'Exam Active';
        statNextVenueEl.textContent = `${events[0].category || participant.category} • ${events[0].name}`;
      } else {
        statNextTimeEl.textContent = 'Waiting';
        statNextVenueEl.textContent = 'No programs assigned yet';
      }
    }

    let completedCount = 0;
    let totalValuatedPts = 0;
    let totalValuatedMax = 0;
    let anyValuated = false;

    events.forEach((evt) => {
      const state = resolveProgramLockState(evt);
      if (state.isLocked) completedCount++;
      const cat = evt.category || participant.category || 'General';
      const key = makeProgramExamKey(evt.name, cat);
      const localAttempt = getCandidateAttempt(key);
      const isVal = Boolean(evt.valuated || localAttempt?.valuated);
      if (isVal) {
        anyValuated = true;
        totalValuatedPts += Number(evt.totalAwardedMarks ?? localAttempt?.totalAwardedMarks ?? 0);
        totalValuatedMax += Number(evt.maxTotalMarks ?? localAttempt?.maxTotalMarks ?? 0);
      }
    });

    if (statPointsDisplayEl) {
      if (anyValuated) {
        statPointsDisplayEl.innerHTML = `${totalValuatedPts}/${totalValuatedMax} <span class="stat-sub">pts</span>`;
      } else {
        statPointsDisplayEl.innerHTML = `${completedCount}/${events.length} <span class="stat-sub">done</span>`;
      }
    }

    if (!eventsTableBody) return;
    eventsTableBody.innerHTML = '';

    if (events.length === 0) {
      eventsTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 44px 20px; color: var(--text-muted);">
            No examination programs assigned to Chest <strong>#${escapeHtml(participant.chestNo)}</strong> yet.
          </td>
        </tr>
      `;
      return;
    }

    let schedulesMap = {};
    try {
      schedulesMap = JSON.parse(localStorage.getItem('sibaq_program_schedules') || '{}');
    } catch (e) {}

    events.forEach((evt, idx) => {
      const cat = evt.category || participant.category || 'General';
      const key = makeProgramExamKey(evt.name, cat);
      const lockState = resolveProgramLockState(evt);
      const localAttempt = getCandidateAttempt(key);
      const sched = schedulesMap[key] || {};
      const fromTime = evt.examFromTime || sched.fromTime || '';
      const toTime = evt.examToTime || sched.toTime || '';
      const scheduleWindow = evaluateProgramScheduleWindow(fromTime, toTime, lockState.isReopened);
      const timeRangeLabel = (fromTime && toTime)
        ? ` • ${format12HourTime(fromTime)} – ${format12HourTime(toTime)}`
        : '';

      const qCount = Array.isArray(evt.examQuestions) ? evt.examQuestions.length : 0;
      const effectiveDur = evt.examDuration || sched.examDuration || '';
      const paperMeta = qCount > 0
        ? `${qCount} Slide${qCount === 1 ? '' : 's'} • ${effectiveDur || 'Fullscreen CBT'}${timeRangeLabel}`
        : (effectiveDur ? `Duration: ${effectiveDur}${timeRangeLabel}` : `Fullscreen CBT Paper${timeRangeLabel}`);

      const isValuated = Boolean(evt.valuated || localAttempt?.valuated);
      const awarded = evt.totalAwardedMarks ?? localAttempt?.totalAwardedMarks;
      const maxPts = evt.maxTotalMarks ?? localAttempt?.maxTotalMarks;
      let statusDisplay = isValuated && awarded !== undefined
        ? `Valuated: ${awarded}/${maxPts} Pts`
        : lockState.statusLabel;

      if (!lockState.isLocked && !isValuated && scheduleWindow.hasSchedule && !scheduleWindow.isAllowedNow) {
        statusDisplay = scheduleWindow.statusLabel;
      }

      let actionBtnHtml = '';
      if (lockState.isLocked) {
        actionBtnHtml = `
          <button type="button" class="start-program-btn locked-btn" disabled title="Locked after submission/exit. Ask Admin to reopen another chance.">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
            <span>Saved &amp; Locked</span>
          </button>
        `;
      } else if (scheduleWindow.hasSchedule && !scheduleWindow.isAllowedNow) {
        actionBtnHtml = `
          <button type="button" class="start-program-btn locked-btn schedule-wait-btn" title="${escapeHtml(scheduleWindow.statusLabel)}">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span>${escapeHtml(scheduleWindow.buttonLabel)}</span>
          </button>
        `;
      } else {
        actionBtnHtml = `
          <button type="button" class="start-program-btn">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" stroke="none">
              <polygon points="6 4 20 12 6 20 6 4"></polygon>
            </svg>
            <span>${lockState.isReopened ? 'Start Reopened Chance' : 'Start Exam'}</span>
          </button>
        `;
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div class="exam-paper-cell">
            <div class="paper-num-badge">${String(idx + 1).padStart(2, '0')}</div>
            <div>
              <div class="event-title">${escapeHtml(evt.name)}</div>
              <div class="event-type">${escapeHtml(paperMeta)}</div>
            </div>
          </div>
        </td>
        <td><span class="cand-cat-pill">${escapeHtml(cat)}</span></td>
        <td><span class="chest-badge">#${escapeHtml(participant.chestNo)}</span></td>
        <td>
          <span class="status-pill ${lockState.isLocked || isValuated ? 'completed' : 'upcoming'}">
            ${escapeHtml(statusDisplay)}
          </span>
        </td>
        <td style="text-align: right;">
          ${actionBtnHtml}
        </td>
      `;

      const waitBtn = tr.querySelector('.schedule-wait-btn');
      if (waitBtn) {
        waitBtn.addEventListener('click', () => {
          showToast(`This exam works only during its scheduled time: ${format12HourTime(fromTime)} – ${format12HourTime(toTime)}.`);
        });
      }

      const startBtn = tr.querySelector('.start-program-btn:not(.locked-btn)');
      if (startBtn) {
        startBtn.addEventListener('click', () => {
          startFullscreenSlideExam({
            ...evt,
            category: cat,
            key,
            examFromTime: fromTime,
            examToTime: toTime,
            examDuration: effectiveDur,
            reopenCount: lockState.reopenCount
          });
        });
      }

      eventsTableBody.appendChild(tr);
    });
  }

  // Refresh candidate's assigned programs from IndexedDB + Firebase Firestore
  async function syncCandidatePrograms() {
    try {
      const recordsMap = new Map();
      const localRecords = await getStoreAllFromIndexedDB(STORE_NAME);
      localRecords.forEach((r) => {
        if (r && r.id) recordsMap.set(String(r.id), r);
      });

      if (window.SibaqFirebase?.db && window.SibaqFirebase?.collection && window.SibaqFirebase?.getDocs) {
        try {
          const { db, collection, getDocs } = window.SibaqFirebase;
          const snap = await getDocs(collection(db, STORE_NAME));
          snap.forEach((docSnap) => {
            const data = docSnap.data();
            const rId = String(data.id || docSnap.id);
            recordsMap.set(rId, { ...data, id: rId });
          });
        } catch (e) {}
      }

      const allRecords = Array.from(recordsMap.values());
      const lowerCode = String(participant.chestNo || '').trim().toLowerCase();
      const lowerName = String(participant.name || '').trim().toLowerCase();
      const savedExams = getSavedExamsMap();

      const matching = allRecords.filter((r) => {
        const rChest = String(r.chestNo || '').trim().toLowerCase();
        const rCand = String(r.candidate || '').trim().toLowerCase();
        if (rChest && rChest === lowerCode) return true;
        if (rCand.includes(`(#${lowerCode})`)) return true;
        if (lowerName && rCand === lowerName) return true;
        if (lowerName && rCand.startsWith(`${lowerName} (#`)) return true;
        return false;
      });

      const uniqueEventsMap = new Map();
      matching.forEach((r) => {
        if (!r.programName) return;
        const cat = r.category || participant.category || 'General';
        const key = makeProgramExamKey(r.programName, cat);
        const localExam = savedExams[key] || {};

        const siblingWithExam = allRecords.find(
          (sib) =>
            makeProgramExamKey(sib.programName, sib.category) === key &&
            (sib.examQuestion || (Array.isArray(sib.examQuestions) && sib.examQuestions.length > 0))
        );

        if (!uniqueEventsMap.has(key)) {
          uniqueEventsMap.set(key, {
            recordId: r.id,
            name: r.programName,
            category: cat,
            examLocked: r.examLocked,
            examStatus: r.examStatus || '',
            lockReason: r.lockReason || '',
            reopenCount: Number(r.reopenCount || 0),
            savedAnswers: r.savedAnswers || {},
            valuated: Boolean(r.valuated),
            totalAwardedMarks: r.totalAwardedMarks,
            maxTotalMarks: r.maxTotalMarks,
            valuationRemarks: r.valuationRemarks || '',
            examFromTime: r.examFromTime || localExam.examFromTime || '',
            examToTime: r.examToTime || localExam.examToTime || '',
            examQuestion:
              r.examQuestion ||
              (siblingWithExam ? siblingWithExam.examQuestion : '') ||
              localExam.examQuestion ||
              '',
            examDuration:
              r.examDuration ||
              (siblingWithExam ? siblingWithExam.examDuration : '') ||
              localExam.examDuration ||
              '',
            examDescription:
              r.examDescription ||
              (siblingWithExam ? siblingWithExam.examDescription : '') ||
              localExam.examDescription ||
              '',
            examQuestions:
              (Array.isArray(r.examQuestions) && r.examQuestions.length > 0 && r.examQuestions) ||
              (siblingWithExam && Array.isArray(siblingWithExam.examQuestions) && siblingWithExam.examQuestions.length > 0 && siblingWithExam.examQuestions) ||
              (Array.isArray(localExam.examQuestions) ? localExam.examQuestions : [])
          });
        }
      });

      if (uniqueEventsMap.size > 0 || allRecords.length > 0) {
        participant.events = Array.from(uniqueEventsMap.values());
        sessionStorage.setItem('sibaq_participant', JSON.stringify(participant));
      }

      renderCandidatePrograms(participant.events);
    } catch (err) {
      console.warn('Error syncing candidate programs:', err);
      renderCandidatePrograms(participant.events);
    }
  }

  // ==========================================================================
  // Fullscreen Slide-by-Slide Examination Engine & Proctored Auto-Save
  // ==========================================================================
  function collectCurrentSlideAnswerFromDOM() {
    if (!candExamQuestionText || !activeSlides[currentSlideIndex]) return;
    const q = activeSlides[currentSlideIndex];
    const qKey = q.id || `slide_${currentSlideIndex}`;

    if (q.type === 'mcq' || q.type === 'radio' || q.type === 'true_false') {
      const checked = candExamQuestionText.querySelector('input[type="radio"]:checked');
      if (checked) {
        currentAnswers[qKey] = checked.value;
      }
    } else if (q.type === 'checkbox') {
      const checkedBoxes = Array.from(candExamQuestionText.querySelectorAll('input[type="checkbox"]:checked'));
      currentAnswers[qKey] = checkedBoxes.map((cb) => cb.value);
    } else if (q.type === 'dropdown') {
      const sel = candExamQuestionText.querySelector('select.slide-dropdown-select');
      if (sel) currentAnswers[qKey] = sel.value;
    } else if (q.type === 'match') {
      const matchSelects = candExamQuestionText.querySelectorAll('select.slide-match-select');
      const matchMap = {};
      matchSelects.forEach((sel) => {
        const leftItem = sel.getAttribute('data-left-item') || '';
        if (leftItem) matchMap[leftItem] = sel.value;
      });
      currentAnswers[qKey] = matchMap;
    } else {
      const textInp = candExamQuestionText.querySelector('.slide-text-input');
      if (textInp) currentAnswers[qKey] = textInp.value;
    }
  }

  function triggerAutoSave(statusLabel = 'Auto-Saved') {
    if (!activeProgram) return;
    collectCurrentSlideAnswerFromDOM();

    if (autoSaveStatusText) {
      autoSaveStatusText.textContent = `${statusLabel} • ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
    }

    persistAttemptToRecordDB(activeProgram, {
      locked: false,
      status: 'in_progress',
      reopenCount: activeProgram.reopenCount || 0,
      answers: currentAnswers
    });
  }

  function isSlideAnswered(q, idx) {
    const qKey = q.id || `slide_${idx}`;
    const val = currentAnswers[qKey];
    if (val === undefined || val === null) return false;
    if (typeof val === 'string') return val.trim().length > 0;
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'object') return Object.values(val).some((v) => v && String(v).trim().length > 0);
    return false;
  }

  function renderCurrentSlide() {
    if (!candExamQuestionText || activeSlides.length === 0) return;

    const total = activeSlides.length;
    const q = activeSlides[currentSlideIndex];
    const qKey = q.id || `slide_${currentSlideIndex}`;
    const savedVal = currentAnswers[qKey];

    // Update top progress bar
    if (examSlideProgressFill) {
      const pct = Math.round(((currentSlideIndex + 1) / total) * 100);
      examSlideProgressFill.style.width = `${pct}%`;
    }

    // Update slide dots
    if (examSlideDots) {
      examSlideDots.innerHTML = '';
      activeSlides.forEach((slideQ, idx) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        const answered = isSlideAnswered(slideQ, idx);
        dot.className = `slide-dot-btn ${idx === currentSlideIndex ? 'active' : ''} ${answered ? 'answered' : ''}`;
        dot.textContent = idx + 1;
        dot.title = `Go to Question ${idx + 1}`;
        dot.addEventListener('click', () => {
          triggerAutoSave('Auto-Saved');
          currentSlideIndex = idx;
          renderCurrentSlide();
        });
        examSlideDots.appendChild(dot);
      });
    }

    // Update footer buttons (Back & Continue vs Submit)
    if (examSlideCounterText) {
      examSlideCounterText.textContent = `Slide ${currentSlideIndex + 1} of ${total}`;
    }
    if (examSlideBackBtn) {
      examSlideBackBtn.disabled = currentSlideIndex === 0;
    }
    if (examSlideNextBtn) {
      examSlideNextBtn.style.display = currentSlideIndex < total - 1 ? 'inline-flex' : 'none';
    }
    if (candExamFinishBtn) {
      candExamFinishBtn.style.display = currentSlideIndex === total - 1 ? 'inline-flex' : 'none';
    }

    // Build interactive input for this slide's question type
    const pts = q.points !== undefined ? `${q.points} Point${q.points === 1 ? '' : 's'}` : '1 Point';
    const typeLabels = {
      mcq: 'Multiple Choice Question',
      image_identify: 'Picture Identification Question',
      match: 'Match the Following',
      checkbox: 'Multiple Selection (Checkboxes)',
      radio: 'Single Choice (Radio)',
      short_answer: 'Short Answer Question',
      long_answer: 'Long Answer / Essay Question',
      dropdown: 'Dropdown Selection',
      true_false: 'True / False Question'
    };
    const typeBadgeText = typeLabels[q.type] || 'Examination Question';

    let answerBodyHtml = '';

    if (q.type === 'mcq' || q.type === 'radio' || q.type === 'true_false') {
      const opts = q.type === 'true_false' ? ['True', 'False'] : (q.options || []);
      answerBodyHtml = `
        <div class="slide-options-grid">
          ${opts
            .map((opt, oIdx) => {
              const isChecked = savedVal === opt;
              const letter = String.fromCharCode(65 + oIdx);
              return `
                <label class="slide-option-card ${isChecked ? 'selected' : ''}">
                  <input type="radio" name="slide_radio_${currentSlideIndex}" value="${escapeHtml(opt)}" ${isChecked ? 'checked' : ''} />
                  <span class="slide-opt-letter">${letter}</span>
                  <span class="slide-opt-text">${escapeHtml(opt)}</span>
                </label>
              `;
            })
            .join('')}
        </div>
      `;
    } else if (q.type === 'checkbox') {
      const selectedArr = Array.isArray(savedVal) ? savedVal : [];
      answerBodyHtml = `
        <div class="slide-options-grid">
          ${(q.options || [])
            .map((opt, oIdx) => {
              const isChecked = selectedArr.includes(opt);
              const letter = String.fromCharCode(65 + oIdx);
              return `
                <label class="slide-option-card ${isChecked ? 'selected' : ''}">
                  <input type="checkbox" name="slide_check_${currentSlideIndex}" value="${escapeHtml(opt)}" ${isChecked ? 'checked' : ''} />
                  <span class="slide-opt-letter">${letter}</span>
                  <span class="slide-opt-text">${escapeHtml(opt)}</span>
                </label>
              `;
            })
            .join('')}
        </div>
      `;
    } else if (q.type === 'dropdown') {
      answerBodyHtml = `
        <div class="slide-dropdown-wrap">
          <select class="slide-dropdown-select">
            <option value="">-- Choose your answer --</option>
            ${(q.options || [])
              .map(
                (opt) =>
                  `<option value="${escapeHtml(opt)}" ${savedVal === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`
              )
              .join('')}
          </select>
        </div>
      `;
    } else if (q.type === 'match') {
      const pairs = Array.isArray(q.pairs) ? q.pairs : [];
      const rightChoices = pairs.map((p) => p.right);
      const savedMatchObj = savedVal && typeof savedVal === 'object' ? savedVal : {};

      answerBodyHtml = `
        <div class="slide-match-grid">
          <div class="slide-match-head">
            <span>Column A (Premise)</span>
            <span></span>
            <span>Column B (Select Match)</span>
          </div>
          ${pairs
            .map((p) => {
              const chosen = savedMatchObj[p.left] || '';
              return `
                <div class="slide-match-item">
                  <div class="slide-match-premise">${escapeHtml(p.left)}</div>
                  <div class="slide-match-connector">&rarr;</div>
                  <select class="slide-match-select" data-left-item="${escapeHtml(p.left)}">
                    <option value="">-- Select Match --</option>
                    ${rightChoices
                      .map(
                        (rc) =>
                          `<option value="${escapeHtml(rc)}" ${chosen === rc ? 'selected' : ''}>${escapeHtml(rc)}</option>`
                      )
                      .join('')}
                  </select>
                </div>
              `;
            })
            .join('')}
        </div>
      `;
    } else if (q.type === 'long_answer') {
      answerBodyHtml = `
        <textarea
          class="slide-text-input slide-textarea"
          rows="6"
          placeholder="Type your detailed answer here (auto-saved as you type)..."
        >${escapeHtml(typeof savedVal === 'string' ? savedVal : '')}</textarea>
      `;
    } else {
      const placeholderTxt = q.type === 'image_identify'
        ? 'Identify the picture shown above and type your answer here (auto-saved)...'
        : 'Type your short answer here (auto-saved as you type)...';
      answerBodyHtml = `
        <input
          type="text"
          class="slide-text-input slide-short-input"
          value="${escapeHtml(typeof savedVal === 'string' ? savedVal : '')}"
          placeholder="${placeholderTxt}"
        />
      `;
    }

    const slideImageHtml = q.imageUrl
      ? `<div class="slide-question-image-box">
          <img src="${escapeHtml(q.imageUrl)}" alt="Question Picture" class="slide-question-image-el" />
        </div>`
      : '';

    candExamQuestionText.innerHTML = `
      <div class="slide-question-header">
        <div class="slide-q-badges">
          <span class="slide-q-number">QUESTION ${currentSlideIndex + 1} OF ${total}</span>
          <span class="slide-q-type-pill">${escapeHtml(typeBadgeText)}</span>
        </div>
        <span class="slide-q-points">${escapeHtml(pts)}</span>
      </div>

      <h3 class="slide-question-prompt">
        ${escapeHtml(q.questionText)}
        ${q.required ? '<span class="req-star" title="Required">*</span>' : ''}
      </h3>

      ${slideImageHtml}

      <div class="slide-answer-area">
        ${answerBodyHtml}
      </div>
    `;

    // Bind live auto-save listeners to the rendered slide inputs
    candExamQuestionText.querySelectorAll('input[type="radio"], input[type="checkbox"]').forEach((inp) => {
      inp.addEventListener('change', () => {
        candExamQuestionText.querySelectorAll('.slide-option-card').forEach((lbl) => {
          const ctrl = lbl.querySelector('input');
          if (ctrl) lbl.classList.toggle('selected', ctrl.checked);
        });
        triggerAutoSave('Auto-Saved');
        // Update dot answered state
        const activeDot = examSlideDots?.children[currentSlideIndex];
        if (activeDot) activeDot.classList.add('answered');
      });
    });

    candExamQuestionText.querySelectorAll('select').forEach((sel) => {
      sel.addEventListener('change', () => {
        triggerAutoSave('Auto-Saved');
        const activeDot = examSlideDots?.children[currentSlideIndex];
        if (activeDot) activeDot.classList.add('answered');
      });
    });

    candExamQuestionText.querySelectorAll('.slide-text-input').forEach((txt) => {
      txt.addEventListener('input', () => {
        triggerAutoSave('Saving...');
        const activeDot = examSlideDots?.children[currentSlideIndex];
        if (activeDot) {
          activeDot.classList.toggle('answered', txt.value.trim().length > 0);
        }
      });
    });
  }

  // Schedule Window & Countdown Timer Helpers
  let examCountdownTimer = null;

  function format12HourTime(time24) {
    if (!time24 || !String(time24).includes(':')) return time24 || '';
    const [hStr, mStr] = String(time24).split(':');
    let h = parseInt(hStr, 10);
    const m = mStr || '00';
    if (isNaN(h)) return time24;
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    return `${String(h).padStart(2, '0')}:${m} ${ampm}`;
  }

  function evaluateProgramScheduleWindow(fromTime, toTime, isReopened = false) {
    if (!fromTime || !toTime || !fromTime.includes(':') || !toTime.includes(':')) {
      return {
        hasSchedule: false,
        isAllowedNow: true,
        remainingSeconds: 0,
        statusLabel: '',
        buttonLabel: 'Start Exam'
      };
    }

    const [fh, fm] = fromTime.split(':').map(Number);
    const [th, tm] = toTime.split(':').map(Number);
    if (isNaN(fh) || isNaN(fm) || isNaN(th) || isNaN(tm)) {
      return {
        hasSchedule: false,
        isAllowedNow: true,
        remainingSeconds: 0,
        statusLabel: '',
        buttonLabel: 'Start Exam'
      };
    }

    const now = new Date();
    const nowSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
    const startSecs = fh * 3600 + fm * 60;
    let endSecs = th * 3600 + tm * 60;

    let isWithin = false;
    let remainingSecs = 0;

    if (endSecs > startSecs) {
      isWithin = nowSecs >= startSecs && nowSecs < endSecs;
      if (isWithin) remainingSecs = endSecs - nowSecs;
    } else {
      // Overnight schedule (e.g., 23:00 to 01:00)
      isWithin = nowSecs >= startSecs || nowSecs < endSecs;
      if (isWithin) {
        remainingSecs = nowSecs >= startSecs
          ? (24 * 3600 - nowSecs) + endSecs
          : endSecs - nowSecs;
      }
    }

    if (isReopened) {
      return {
        hasSchedule: true,
        isAllowedNow: true,
        remainingSeconds: remainingSecs,
        statusLabel: `Reopened (${format12HourTime(fromTime)} – ${format12HourTime(toTime)})`,
        buttonLabel: 'Start Reopened Chance'
      };
    }

    if (isWithin) {
      return {
        hasSchedule: true,
        isAllowedNow: true,
        remainingSeconds: remainingSecs,
        statusLabel: `Live (${format12HourTime(fromTime)} – ${format12HourTime(toTime)})`,
        buttonLabel: 'Start Exam'
      };
    }

    if (endSecs > startSecs && nowSecs < startSecs) {
      return {
        hasSchedule: true,
        isAllowedNow: false,
        remainingSeconds: 0,
        statusLabel: `Scheduled: ${format12HourTime(fromTime)} – ${format12HourTime(toTime)}`,
        buttonLabel: `Opens at ${format12HourTime(fromTime)}`
      };
    }

    return {
      hasSchedule: true,
      isAllowedNow: false,
      remainingSeconds: 0,
      statusLabel: `Closed (${format12HourTime(fromTime)} – ${format12HourTime(toTime)})`,
      buttonLabel: `Schedule Ended`
    };
  }

  function clearExamCountdownTimer() {
    if (examCountdownTimer) {
      clearInterval(examCountdownTimer);
      examCountdownTimer = null;
    }
  }

  function startExamCountdownTimer(prog) {
    clearExamCountdownTimer();
    if (!prog || !candExamDuration) return;

    const schedEval = evaluateProgramScheduleWindow(prog.examFromTime, prog.examToTime, false);
    let totalSecs = 0;

    if (schedEval.hasSchedule && schedEval.remainingSeconds > 0) {
      totalSecs = schedEval.remainingSeconds;
    } else if (prog.examDuration) {
      const numMatch = String(prog.examDuration).match(/(\d+)/);
      if (numMatch) {
        totalSecs = parseInt(numMatch[1], 10) * 60;
      }
    }

    if (totalSecs <= 0) {
      candExamDuration.textContent = prog.examDuration || 'Standard Time';
      return;
    }

    const formatMMSS = (s) => {
      const hrs = Math.floor(s / 3600);
      const mins = Math.floor((s % 3600) / 60);
      const secs = s % 60;
      if (hrs > 0) {
        return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
      return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    candExamDuration.textContent = formatMMSS(totalSecs);

    examCountdownTimer = setInterval(() => {
      if (!activeProgram) {
        clearExamCountdownTimer();
        return;
      }
      totalSecs--;
      if (totalSecs <= 0) {
        clearExamCountdownTimer();
        candExamDuration.textContent = '00:00';
        autoSaveAndLockExam('Time Expired - Auto Submitted');
        return;
      }
      if (candExamDuration) {
        candExamDuration.textContent = formatMMSS(totalSecs);
      }
    }, 1000);
  }

  // Submit / Auto-Submit Celebration & Status Animation (Runs ONLY at the moment of Submit or Auto-Submit)
  const examSubmissionAnimOverlay = document.getElementById('examSubmissionAnimOverlay');
  const examSubmissionAnimCard = document.getElementById('examSubmissionAnimCard');
  const examSubmissionBadge = document.getElementById('examSubmissionBadge');
  const examSubmissionTitle = document.getElementById('examSubmissionTitle');
  const examSubmissionSubtitle = document.getElementById('examSubmissionSubtitle');
  const examSubmissionProgName = document.getElementById('examSubmissionProgName');
  const examSubmissionAnsweredCount = document.getElementById('examSubmissionAnsweredCount');
  const examSubmissionChestCode = document.getElementById('examSubmissionChestCode');
  const examSubmissionDismissBtn = document.getElementById('examSubmissionDismissBtn');
  let submitAnimDismissTimer = null;

  function closeExamSubmissionAnimation() {
    if (submitAnimDismissTimer) {
      clearTimeout(submitAnimDismissTimer);
      submitAnimDismissTimer = null;
    }
    if (examSubmissionAnimOverlay) {
      examSubmissionAnimOverlay.classList.remove('active', 'is-auto-submit', 'is-manual-submit');
      setTimeout(() => {
        if (!examSubmissionAnimOverlay.classList.contains('active')) {
          examSubmissionAnimOverlay.style.display = 'none';
          examSubmissionAnimOverlay.setAttribute('aria-hidden', 'true');
        }
      }, 280);
    }
  }

  if (examSubmissionDismissBtn) {
    examSubmissionDismissBtn.addEventListener('click', closeExamSubmissionAnimation);
  }

  function playExamSubmissionAnimation({ progName, totalSlides, answeredSlides, reason }) {
    if (!examSubmissionAnimOverlay) return;
    const isManual = !reason || reason === 'Submitted';

    examSubmissionAnimOverlay.classList.remove('is-auto-submit', 'is-manual-submit');
    examSubmissionAnimOverlay.classList.add(isManual ? 'is-manual-submit' : 'is-auto-submit');

    if (examSubmissionBadge) {
      examSubmissionBadge.textContent = isManual
        ? 'FINAL SUBMISSION VERIFIED'
        : `AUTO-SUBMITTED • ${String(reason).toUpperCase()}`;
    }
    if (examSubmissionTitle) {
      examSubmissionTitle.textContent = isManual
        ? 'Exam Submitted Successfully!'
        : 'Exam Auto-Submitted & Saved!';
    }
    if (examSubmissionSubtitle) {
      examSubmissionSubtitle.textContent = isManual
        ? 'Your exam paper has been securely submitted and locked for valuation.'
        : `Triggered by "${reason}". All your answered slides were automatically saved and submitted.`;
    }
    if (examSubmissionProgName) examSubmissionProgName.textContent = progName || 'Program Exam';
    if (examSubmissionAnsweredCount) {
      examSubmissionAnsweredCount.textContent = `${answeredSlides} / ${totalSlides} Slide${totalSlides === 1 ? '' : 's'}`;
    }
    if (examSubmissionChestCode) {
      examSubmissionChestCode.textContent = `#${participant.chestNo}`;
    }

    // Restart CSS animations cleanly
    if (examSubmissionAnimCard) {
      examSubmissionAnimCard.style.animation = 'none';
      void examSubmissionAnimCard.offsetWidth;
      examSubmissionAnimCard.style.animation = '';
    }

    examSubmissionAnimOverlay.style.display = 'flex';
    examSubmissionAnimOverlay.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
      examSubmissionAnimOverlay.classList.add('active');
    });

    if (submitAnimDismissTimer) clearTimeout(submitAnimDismissTimer);
    submitAnimDismissTimer = setTimeout(() => {
      closeExamSubmissionAnimation();
    }, 3800);
  }

  async function startFullscreenSlideExam(prog) {
    if (!candidateExamModal) return;

    if (window.innerWidth < 768) {
      showToast('This portal works only on Desktop and Tablet screens (min 768px).');
      return;
    }

    const lockState = resolveProgramLockState(prog);
    if (lockState.isLocked) {
      showToast('This exam is locked. Ask Admin to reopen another chance.');
      return;
    }

    const schedCheck = evaluateProgramScheduleWindow(prog.examFromTime, prog.examToTime, lockState.isReopened);
    if (schedCheck.hasSchedule && !schedCheck.isAllowedNow) {
      showToast(`This exam works only during its scheduled time (${format12HourTime(prog.examFromTime)} – ${format12HourTime(prog.examToTime)}).`);
      return;
    }

    activeProgram = prog;
    currentSlideIndex = 0;

    // Load previously auto-saved answers so candidate never loses work
    const prevAttempt = getCandidateAttempt(prog.key);
    currentAnswers = {
      ...(prog.savedAnswers || {}),
      ...(prevAttempt?.answers || {})
    };

    // Build slides array
    const rawQuestions = Array.isArray(prog.examQuestions) ? prog.examQuestions : [];
    if (rawQuestions.length > 0) {
      activeSlides = rawQuestions;
    } else {
      activeSlides = [
        {
          id: 'slide_0',
          type: 'long_answer',
          questionText:
            prog.examQuestion && prog.examQuestion.trim()
              ? prog.examQuestion.trim()
              : `Write your competition response for "${prog.name}" (${prog.category}):`,
          points: 10,
          required: true
        }
      ];
    }

    if (candExamCategoryBadge) candExamCategoryBadge.textContent = prog.category || participant.category || 'General';
    if (candExamModalTitle) candExamModalTitle.textContent = prog.name;
    if (candExamStudentName) candExamStudentName.textContent = participant.name;
    if (candExamChestNo) candExamChestNo.textContent = `#${participant.chestNo}`;
    if (candExamDuration) candExamDuration.textContent = prog.examDuration || 'Standard Time';

    initialPixelRatio = window.devicePixelRatio || 1;
    initialVisualScale = window.visualViewport ? window.visualViewport.scale : 1;
    enteredFullscreenSuccessfully = false;

    candidateExamModal.classList.add('open');
    candidateExamModal.setAttribute('aria-hidden', 'false');

    renderCurrentSlide();
    startExamCountdownTimer(prog);

    // Request browser Fullscreen
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        enteredFullscreenSuccessfully = true;
      }
    } catch (e) {
      enteredFullscreenSuccessfully = false;
    }

    // Activate proctoring after fullscreen transition settles
    setTimeout(() => {
      initialPixelRatio = window.devicePixelRatio || 1;
      initialVisualScale = window.visualViewport ? window.visualViewport.scale : 1;
      isExamActive = true;
    }, 350);

    triggerAutoSave('Exam Started');
    showToast(`Fullscreen Exam Started: "${prog.name}"`);
  }

  // Auto-save & lock exam when candidate finishes, exits fullscreen, or zooms in/out
  async function autoSaveAndLockExam(reason = 'Submitted') {
    if (!activeProgram) return;
    const progToSave = activeProgram;
    const totalSlidesCount = activeSlides.length || 1;
    isExamActive = false;
    clearExamCountdownTimer();

    collectCurrentSlideAnswerFromDOM();

    let answeredCount = 0;
    for (let i = 0; i < totalSlidesCount; i++) {
      if (activeSlides[i] && isSlideAnswered(activeSlides[i], i)) answeredCount++;
    }

    await persistAttemptToRecordDB(progToSave, {
      locked: true,
      status: 'submitted',
      lockReason: reason,
      reopenCount: progToSave.reopenCount || 0,
      answers: currentAnswers
    });

    if (document.fullscreenElement && document.exitFullscreen) {
      try {
        await document.exitFullscreen();
      } catch (e) {}
    }

    if (candidateExamModal) {
      candidateExamModal.classList.remove('open');
      candidateExamModal.setAttribute('aria-hidden', 'true');
    }

    activeProgram = null;
    await syncCandidatePrograms();

    // Play the Submit / Auto-Submit animation ONLY at the moment of submission
    playExamSubmissionAnimation({
      progName: progToSave.name,
      totalSlides: totalSlidesCount,
      answeredSlides: answeredCount,
      reason
    });
  }

  // Slide Navigation: Back & Continue
  if (examSlideBackBtn) {
    examSlideBackBtn.addEventListener('click', () => {
      if (currentSlideIndex > 0) {
        triggerAutoSave('Auto-Saved');
        currentSlideIndex--;
        renderCurrentSlide();
      }
    });
  }

  if (examSlideNextBtn) {
    examSlideNextBtn.addEventListener('click', () => {
      if (currentSlideIndex < activeSlides.length - 1) {
        triggerAutoSave('Auto-Saved');
        currentSlideIndex++;
        renderCurrentSlide();
      }
    });
  }

  if (candExamCloseBtn) {
    candExamCloseBtn.addEventListener('click', () => {
      if (activeProgram) {
        autoSaveAndLockExam('Exited Exam');
      }
    });
  }

  if (candExamSubmitForm) {
    candExamSubmitForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!activeProgram) return;
      autoSaveAndLockExam('Completed');
    });
  }

  // Proctoring 1: Detect exit from Fullscreen
  document.addEventListener('fullscreenchange', () => {
    if (isExamActive && enteredFullscreenSuccessfully && !document.fullscreenElement) {
      autoSaveAndLockExam('Fullscreen Exited');
    }
  });

  // Proctoring 2: Detect Zoom In / Zoom Out (Ctrl + Wheel, Ctrl + +/-/0, or devicePixelRatio / visualViewport change)
  window.addEventListener(
    'wheel',
    (e) => {
      if (isExamActive && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        autoSaveAndLockExam('Zoom In/Out');
      }
    },
    { passive: false }
  );

  window.addEventListener('keydown', (e) => {
    if (!isExamActive) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
      e.preventDefault();
      autoSaveAndLockExam('Zoom In/Out');
    }
  });

  window.addEventListener('resize', () => {
    if (!isExamActive) return;
    if (window.innerWidth < 768) {
      autoSaveAndLockExam('Unsupported Screen Size');
      return;
    }
    const currentRatio = window.devicePixelRatio || 1;
    if (Math.abs(currentRatio - initialPixelRatio) > 0.05) {
      autoSaveAndLockExam('Zoom In/Out');
    }
  });

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      if (!isExamActive) return;
      const currentScale = window.visualViewport.scale || 1;
      if (Math.abs(currentScale - initialVisualScale) > 0.05) {
        autoSaveAndLockExam('Zoom In/Out');
      }
    });
  }

  // Proctoring 3: Auto-save before page unload / tab hide
  window.addEventListener('beforeunload', () => {
    if (isExamActive && activeProgram) {
      triggerAutoSave('Auto-Saved');
    }
  });

  // Also listen for localStorage changes from Admin tab (instant reopen chance sync across tabs!)
  window.addEventListener('storage', (e) => {
    if (e.key === 'sibaq_candidate_attempts' || e.key === 'sibaq_exams' || e.key === 'sibaq_program_schedules') {
      syncCandidatePrograms();
    }
  });

  // Initial render and sync
  renderProfileHeader();
  renderCandidatePrograms(participant.events);
  syncCandidatePrograms();

  // Periodically re-evaluate scheduled From & To time windows so Start button unlocks on time
  setInterval(() => {
    if (!activeProgram) {
      renderCandidatePrograms(participant.events);
    }
  }, 15000);

  window.addEventListener('firebase-candidate-ready', () => {
    syncCandidatePrograms();
    if (window.SibaqFirebase?.db && window.SibaqFirebase?.collection && window.SibaqFirebase?.onSnapshot) {
      try {
        const { db, collection, onSnapshot } = window.SibaqFirebase;
        onSnapshot(collection(db, STORE_NAME), () => {
          syncCandidatePrograms();
        });
      } catch (e) {}
    }
  });

  // Exit / Logout Action
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (isExamActive && activeProgram) {
        triggerAutoSave('Auto-Saved');
      }
      logoutBtn.disabled = true;
      logoutBtn.innerHTML = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" class="spin-icon">
          <circle cx="12" cy="12" r="10" stroke-dasharray="32" stroke-linecap="round"></circle>
        </svg>
        <span>Exiting...</span>
      `;

      sessionStorage.removeItem('sibaq_participant');
      showToast('Returning to chest number entry...');

      setTimeout(() => {
        window.location.href = 'index.html';
      }, 450);
    });
  }
});
