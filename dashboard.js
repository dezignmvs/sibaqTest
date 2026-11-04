/**
 * Sibaq '26 Candidate Examination Terminal Logic
 * - Fullscreen proctored examination mode
 * - Slide-by-slide question navigation (Back & Continue / Submit)
 * - Automatic real-time data saving on every answer, fullscreen exit, or zoom in/out
 * - Locks attempt upon exit/zoom/submit; unlocks when Admin grants/reopens another chance
 */

document.addEventListener('DOMContentLoaded', () => {
  // Shared-link isolation guard: if this browser session is locked to a shared Question/Valuation link,
  // block access to the candidate dashboard and redirect back to the shared link.
  try {
    const rawLock = sessionStorage.getItem('sibaq_shared_link_lock') || (!sessionStorage.getItem('sibaq_auth') && !sessionStorage.getItem('sibaq_participant') ? localStorage.getItem('sibaq_shared_link_lock') : null);
    if (rawLock) {
      const parsedLock = JSON.parse(rawLock);
      if (parsedLock && parsedLock.lockedUrl) {
        window.location.replace(parsedLock.lockedUrl);
        return;
      }
    }
  } catch (e) {
    // ignore storage errors
  }

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
  const examSlideSkipBtn = document.getElementById('examSlideSkipBtn');
  const candExamFinishBtn = document.getElementById('candExamFinishBtn');
  const examSlideCounterText = document.getElementById('examSlideCounterText');
  const examSubmissionResultsBox = document.getElementById('examSubmissionResultsBox');
  const examResultScoreBadge = document.getElementById('examResultScoreBadge');
  const examResultCorrectCount = document.getElementById('examResultCorrectCount');
  const examResultWrongCount = document.getElementById('examResultWrongCount');
  const examResultsReviewList = document.getElementById('examResultsReviewList');

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
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
  const viewedSectionSlides = new Set();
  const skippedSlides = new Set();
  let autoAdvanceTimer = null;

  function findNextSlideIndex(fromIdx) {
    if (!activeSlides || activeSlides.length === 0) return 0;
    // 1. Look ahead for an unanswered question that is NOT skipped
    for (let i = fromIdx + 1; i < activeSlides.length; i++) {
      if (!isSlideAnswered(activeSlides[i], i) && !skippedSlides.has(i)) {
        return i;
      }
    }
    // 2. Wrap around from 0 to fromIdx - 1 for unskipped
    for (let i = 0; i < fromIdx; i++) {
      if (!isSlideAnswered(activeSlides[i], i) && !skippedSlides.has(i)) {
        return i;
      }
    }
    // 3. If all unskipped questions are answered, cycle through skippedSlides!
    for (let i = 0; i < activeSlides.length; i++) {
      if (skippedSlides.has(i) && !isSlideAnswered(activeSlides[i], i)) {
        return i;
      }
    }
    // 4. Return fromIdx + 1 if within range, else fromIdx
    return Math.min(fromIdx + 1, activeSlides.length - 1);
  }

  function triggerAutoAdvance(delayMs = 500) {
    if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = setTimeout(() => {
      autoAdvanceTimer = null;
      if (!activeProgram) return;
      const nextIdx = findNextSlideIndex(currentSlideIndex);
      if (nextIdx !== currentSlideIndex) {
        currentSlideIndex = nextIdx;
        renderCurrentSlide();
      } else {
        renderCurrentSlide();
      }
    }, delayMs);
  }

  function collectCurrentSlideAnswerFromDOM() {
    if (!candExamQuestionText || !activeSlides[currentSlideIndex]) return;
    const q = activeSlides[currentSlideIndex];
    if (q.type === 'section') {
      viewedSectionSlides.add(currentSlideIndex);
      return;
    }
    const qKey = q.id || `slide_${currentSlideIndex}`;
    const type = q.type || 'mcq';

    if (type === 'mcq' || type === 'radio' || type === 'true_false' || type === 'hotspot') {
      const checked = candExamQuestionText.querySelector('input[type="radio"]:checked');
      if (checked) {
        currentAnswers[qKey] = checked.value;
      }
    } else if (type === 'checkbox' || type === 'hot_text') {
      const checkedBoxes = Array.from(candExamQuestionText.querySelectorAll('input[type="checkbox"]:checked'));
      currentAnswers[qKey] = checkedBoxes.map((cb) => cb.value);
    } else if (type === 'dropdown') {
      const sel = candExamQuestionText.querySelector('select.slide-dropdown-select');
      if (sel) currentAnswers[qKey] = sel.value;
    } else if (type === 'reorder') {
      const reorderItems = Array.from(candExamQuestionText.querySelectorAll('.wg-reorder-tile, .slide-reorder-item'));
      if (reorderItems.length > 0) {
        currentAnswers[qKey] = reorderItems.map((el) => el.getAttribute('data-reorder-item') || '').filter(Boolean);
      }
    } else if (type === 'table_fill') {
      const tableInputs = candExamQuestionText.querySelectorAll('input.slide-table-fill-input');
      const tableMap = {};
      tableInputs.forEach((inp) => {
        const leftItem = inp.getAttribute('data-left-item') || '';
        if (leftItem) tableMap[leftItem] = inp.value;
      });
      currentAnswers[qKey] = tableMap;
    } else if (type === 'match_grid') {
      const wgSelectedCells = candExamQuestionText.querySelectorAll('.wg-grid-cell.selected');
      if (wgSelectedCells.length > 0) {
        const gridMap = {};
        wgSelectedCells.forEach((c) => {
          const leftItem = c.getAttribute('data-left-item') || '';
          const colVal = c.getAttribute('data-col-val') || '';
          if (leftItem && colVal) {
            gridMap[leftItem] = colVal;
          }
        });
        currentAnswers[qKey] = gridMap;
      } else {
        const matrixRadios = candExamQuestionText.querySelectorAll('input.slide-matrix-radio:checked');
        const gridMap = {};
        matrixRadios.forEach((r) => {
          const leftItem = r.getAttribute('data-left-item') || '';
          if (leftItem) gridMap[leftItem] = r.value;
        });
        currentAnswers[qKey] = gridMap;
      }
    } else if (type === 'drag_drop') {
      const dropSlots = candExamQuestionText.querySelectorAll('.wg-drop-slot');
      if (dropSlots.length > 0) {
        const ddMap = {};
        dropSlots.forEach((slot) => {
          const leftItem = slot.getAttribute('data-slot-key') || '';
          const tokenVal = slot.getAttribute('data-assigned-token') || '';
          if (leftItem && tokenVal) ddMap[leftItem] = tokenVal;
        });
        currentAnswers[qKey] = ddMap;
      } else {
        const matchSelects = candExamQuestionText.querySelectorAll('select.slide-match-select');
        const matchMap = {};
        matchSelects.forEach((sel) => {
          const leftItem = sel.getAttribute('data-left-item') || '';
          if (leftItem) matchMap[leftItem] = sel.value;
        });
        currentAnswers[qKey] = matchMap;
      }
    } else if (type === 'categorize') {
      const catBuckets = candExamQuestionText.querySelectorAll('.wg-category-bucket');
      if (catBuckets.length > 0) {
        const catMap = {};
        catBuckets.forEach((bucket) => {
          const catName = bucket.getAttribute('data-cat-name') || '';
          const cards = bucket.querySelectorAll('.wg-cat-card');
          cards.forEach((card) => {
            const itemVal = card.getAttribute('data-item-val') || '';
            if (itemVal && catName) catMap[itemVal] = catName;
          });
        });
        currentAnswers[qKey] = catMap;
      } else {
        const matchSelects = candExamQuestionText.querySelectorAll('select.slide-match-select');
        const matchMap = {};
        matchSelects.forEach((sel) => {
          const leftItem = sel.getAttribute('data-left-item') || '';
          if (leftItem) matchMap[leftItem] = sel.value;
        });
        currentAnswers[qKey] = matchMap;
      }
    } else if (type === 'labeling' || type === 'image_identify') {
      const labelTargets = candExamQuestionText.querySelectorAll('.wg-label-target');
      if (labelTargets.length > 0) {
        const lblMap = {};
        labelTargets.forEach((t) => {
          const key = t.getAttribute('data-slot-key') || '';
          const val = t.getAttribute('data-assigned-label') || '';
          if (key && val) lblMap[key] = val;
        });
        currentAnswers[qKey] = lblMap;
      } else {
        const textInp = candExamQuestionText.querySelector('.slide-text-input');
        if (textInp) currentAnswers[qKey] = textInp.value;
      }
    } else if (type === 'match') {
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
    if (q.type === 'section') {
      return viewedSectionSlides.has(idx);
    }
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

    if (q.type === 'section') {
      viewedSectionSlides.add(currentSlideIndex);
    }

    // Update top progress bar
    if (examSlideProgressFill) {
      const pct = Math.round(((currentSlideIndex + 1) / total) * 100);
      examSlideProgressFill.style.width = `${pct}%`;
    }

    // Update slide dots
    if (examSlideDots) {
      examSlideDots.innerHTML = '';
      let qDotCounter = 0;
      activeSlides.forEach((slideQ, idx) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        const isSec = slideQ.type === 'section';
        const answered = isSlideAnswered(slideQ, idx);
        dot.className = `slide-dot-btn ${isSec ? 'section-dot' : ''} ${idx === currentSlideIndex ? 'active' : ''} ${answered ? 'answered' : ''}`;
        if (isSec) {
          dot.textContent = 'S';
          dot.title = `Reading Section: ${slideQ.questionText || 'Passage'}`;
        } else {
          qDotCounter++;
          dot.textContent = qDotCounter;
          dot.title = `Go to Question ${qDotCounter}`;
        }
        dot.addEventListener('click', () => {
          triggerAutoSave('Auto-Saved');
          currentSlideIndex = idx;
          renderCurrentSlide();
        });
        examSlideDots.appendChild(dot);
      });
    }

    // Update footer buttons (Back & Continue vs Submit & Skip)
    const isAlreadyAnswered = isSlideAnswered(q, currentSlideIndex);
    const allAnswered = activeSlides.every((s, i) => s.type === 'section' || isSlideAnswered(s, i));
    const isLastSlide = currentSlideIndex === total - 1;

    if (examSlideCounterText) {
      examSlideCounterText.textContent = `Question ${currentSlideIndex + 1} of ${total}`;
    }
    if (examSlideBackBtn) {
      examSlideBackBtn.disabled = currentSlideIndex === 0;
    }
    if (examSlideSkipBtn) {
      examSlideSkipBtn.style.display = (!isAlreadyAnswered && q.type !== 'section' && !allAnswered) ? 'inline-flex' : 'none';
    }
    if (examSlideNextBtn) {
      examSlideNextBtn.style.display = (!isLastSlide && !allAnswered) ? 'inline-flex' : 'none';
    }
    if (candExamFinishBtn) {
      candExamFinishBtn.style.display = (isLastSlide || allAnswered) ? 'inline-flex' : 'none';
    }

    const slideImageHtml = q.imageUrl
      ? `<div class="slide-question-image-box">
          <img src="${escapeHtml(q.imageUrl)}" alt="Question Picture" class="slide-question-image-el" />
        </div>`
      : '';

    // Handle Google Forms-Style Read-Only Section Slide (No Question Input)
    if (q.type === 'section') {
      candExamQuestionText.innerHTML = `
        <div class="slide-question-header slide-section-header">
          <div class="slide-q-badges">
            <span class="slide-q-number slide-sec-badge">READING SECTION • SLIDE ${currentSlideIndex + 1} OF ${total}</span>
            <span class="slide-q-type-pill">Section / Reading Passage</span>
          </div>
          <span class="slide-q-points">Read Only (No Answer Needed)</span>
        </div>

        <h3 class="slide-question-prompt slide-section-title">
          ${escapeHtml(q.questionText || 'Read the following section carefully')}
        </h3>

        ${slideImageHtml}

        <div class="slide-reading-section-box">
          <div class="slide-reading-passage-body">${escapeHtml(q.sectionContent || 'Read the instructions above and click Continue to proceed to the questions.')}</div>
          <div class="slide-reading-footer-hint">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
            </svg>
            <span>This is a reading section with no question to answer. Click <strong>Continue</strong> below when you are ready.</span>
          </div>
        </div>
      `;
      return;
    }

    // Build interactive input for this slide's question type
    const totalActualQuestions = activeSlides.filter((s) => s.type !== 'section').length || total;
    const currentActualQNum =
      activeSlides.slice(0, currentSlideIndex + 1).filter((s) => s.type !== 'section').length || currentSlideIndex + 1;
    const pts = q.points !== undefined ? `${q.points} Point${q.points === 1 ? '' : 's'}` : '1 Point';
    const typeLabels = {
      mcq: 'Multiple Choice',
      checkbox: 'Multi-Select',
      true_false: 'True or False',
      fill_blank: 'Fill in the Blanks',
      open_ended: 'Open Ended',
      table_fill: 'Table Fill In',
      section: 'Passage',
      drag_drop: 'Drag and Drop',
      dropdown: 'Dropdown',
      categorize: 'Categorize',
      reorder: 'Reorder Sequence',
      match: 'Match the Following',
      match_grid: 'Match Table Grid',
      hot_text: 'Hot Text',
      labeling: 'Labeling',
      hotspot: 'Hotspot',
      image_identify: 'Labeling / Picture Identification',
      radio: 'Multiple Choice',
      short_answer: 'Fill in the Blanks / Short Answer',
      long_answer: 'Open Ended / Essay'
    };
    const type = q.type || 'mcq';
    const typeBadgeText = typeLabels[type] || 'Examination Question';

    let answerBodyHtml = '';

    if (type === 'mcq' || type === 'radio' || type === 'true_false' || type === 'hotspot') {
      const opts = type === 'true_false' ? ['True', 'False'] : (q.options || []);
      answerBodyHtml = `
        <div class="slide-options-grid ${isAlreadyAnswered ? 'locked' : ''}">
          ${opts
            .map((opt, oIdx) => {
              const isChecked = savedVal === opt;
              const letter = String.fromCharCode(65 + oIdx);
              let cardClass = 'slide-option-card';
              if (isChecked) cardClass += ' selected locked-chosen';
              else if (isAlreadyAnswered) cardClass += ' locked-disabled';
              return `
                <label class="${cardClass}">
                  <input type="radio" name="slide_radio_${currentSlideIndex}" value="${escapeHtml(opt)}" ${isChecked ? 'checked' : ''} ${isAlreadyAnswered ? 'disabled' : ''} />
                  <span class="slide-opt-letter">${letter}</span>
                  <span class="slide-opt-text">${escapeHtml(opt)}</span>
                </label>
              `;
            })
            .join('')}
        </div>
      `;
    } else if (type === 'checkbox' || type === 'hot_text') {
      const selectedArr = Array.isArray(savedVal) ? savedVal : [];
      const helperHint = type === 'hot_text'
        ? `<div class="slide-helper-note">Click to highlight / select the correct hot text token(s) below:</div>`
        : '';
      answerBodyHtml = `
        ${helperHint}
        <div class="slide-options-grid ${type === 'hot_text' ? 'slide-hottext-grid' : ''} ${isAlreadyAnswered ? 'locked' : ''}">
          ${(q.options || [])
            .map((opt, oIdx) => {
              const isChecked = selectedArr.includes(opt);
              const letter = String.fromCharCode(65 + oIdx);
              let cardClass = 'slide-option-card';
              if (isChecked) cardClass += ' selected locked-chosen';
              else if (isAlreadyAnswered) cardClass += ' locked-disabled';
              return `
                <label class="${cardClass}">
                  <input type="checkbox" name="slide_check_${currentSlideIndex}" value="${escapeHtml(opt)}" ${isChecked ? 'checked' : ''} ${isAlreadyAnswered ? 'disabled' : ''} />
                  <span class="slide-opt-letter">${letter}</span>
                  <span class="slide-opt-text">${escapeHtml(opt)}</span>
                </label>
              `;
            })
            .join('')}
        </div>
      `;
    } else if (type === 'dropdown') {
      answerBodyHtml = `
        <div class="slide-dropdown-wrap">
          <select class="slide-dropdown-select" ${isAlreadyAnswered ? 'disabled' : ''}>
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
    } else if (type === 'reorder') {
      const defaultItems = Array.isArray(q.options) ? [...q.options] : [];
      let currentOrder = Array.isArray(savedVal) && savedVal.length === defaultItems.length
        ? [...savedVal]
        : [...defaultItems];
      if (!Array.isArray(savedVal) && currentOrder.length > 1) {
        currentOrder = [...defaultItems].sort((a, b) => String(a).localeCompare(String(b)));
        if (currentOrder.every((item, idx) => item === defaultItems[idx]) && currentOrder.length > 1) {
          currentOrder.reverse();
        }
      }
      answerBodyHtml = `
        <div class="wg-stage-card wg-reorder-stage">
          <div class="wg-stage-pill">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4"></path></svg>
            <span>Click or drag tiles to arrange into sequence</span>
          </div>
          <div class="wg-reorder-board" id="wgReorderBoard">
            ${currentOrder
              .map((item, rIdx) => {
                const tileColorClass = `wg-tile-color-${rIdx % 5}`;
                return `
                  <div class="wg-reorder-slot-wrap" data-slot-index="${rIdx}">
                    <div class="wg-reorder-rank-badge">${rIdx + 1}</div>
                    <div class="wg-reorder-tile ${tileColorClass}" draggable="${!isAlreadyAnswered}" data-reorder-item="${escapeHtml(item)}" data-index="${rIdx}">
                      <span class="wg-grip-icon">⠿</span>
                      <span class="wg-reorder-tile-text">${escapeHtml(item)}</span>
                      ${!isAlreadyAnswered ? `
                      <div class="wg-reorder-tile-arrows">
                        <button type="button" class="wg-tile-arrow-btn move-up" ${rIdx === 0 ? 'disabled' : ''} title="Move Left / Earlier">&larr;</button>
                        <button type="button" class="wg-tile-arrow-btn move-down" ${rIdx === currentOrder.length - 1 ? 'disabled' : ''} title="Move Right / Later">&rarr;</button>
                      </div>` : ''}
                    </div>
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      `;
    } else if (type === 'table_fill') {
      const pairs = Array.isArray(q.pairs) ? q.pairs : [];
      const savedTableObj = savedVal && typeof savedVal === 'object' ? savedVal : {};
      answerBodyHtml = `
        <div class="slide-table-fill-wrap">
          <table class="slide-table-fill-grid">
            <thead>
              <tr>
                <th>Row Prompt / Label</th>
                <th>Your Answer (Fill In)</th>
              </tr>
            </thead>
            <tbody>
              ${pairs
                .map((p) => {
                  const val = savedTableObj[p.left] || '';
                  return `
                    <tr>
                      <td class="slide-table-prompt-cell">${escapeHtml(p.left)}</td>
                      <td>
                        <input
                          type="text"
                          class="slide-table-fill-input"
                          data-left-item="${escapeHtml(p.left)}"
                          value="${escapeHtml(val)}"
                          placeholder="Type missing value..."
                          ${isAlreadyAnswered ? 'disabled' : ''}
                        />
                      </td>
                    </tr>
                  `;
                })
                .join('')}
            </tbody>
          </table>
        </div>
      `;
    } else if (type === 'match_grid') {
      const pairs = Array.isArray(q.pairs) ? q.pairs : [];
      const colHeaders = Array.from(new Set(pairs.map((p) => p.right).filter(Boolean)));
      const savedGridObj = savedVal && typeof savedVal === 'object' ? savedVal : {};
      answerBodyHtml = `
        <div class="wg-stage-card wg-grid-container">
          <div class="wg-stage-pill">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M3 3h18v18H3z"></path><path d="M3 9h18"></path><path d="M3 15h18"></path><path d="M9 3v18"></path><path d="M15 3v18"></path></svg>
            <span>Select the subset in which each number or item belongs</span>
          </div>
          <div class="wg-grid-table-wrap">
            <table class="wg-grid-table">
              <thead>
                <tr>
                  <th class="wg-grid-col-prompt">Items</th>
                  ${colHeaders.map((col) => `<th class="wg-grid-col-head">${escapeHtml(col)}</th>`).join('')}
                </tr>
              </thead>
              <tbody>
                ${pairs
                  .map((p) => {
                    const chosen = savedGridObj[p.left] || '';
                    const isChosenMatch = (col) => {
                      if (Array.isArray(chosen)) return chosen.includes(col);
                      return chosen === col;
                    };
                    return `
                      <tr>
                        <td class="wg-grid-row-label">${escapeHtml(p.left)}</td>
                        ${colHeaders
                          .map((col) => {
                            const isSelected = isChosenMatch(col);
                            return `
                              <td class="wg-grid-cell-td">
                                <button
                                  type="button"
                                  class="wg-grid-cell ${isSelected ? 'selected' : ''}"
                                  data-left-item="${escapeHtml(p.left)}"
                                  data-col-val="${escapeHtml(col)}"
                                  ${isAlreadyAnswered ? 'disabled' : ''}
                                  title="Select ${escapeHtml(col)} for ${escapeHtml(p.left)}"
                                >
                                  <span class="wg-grid-check-box">${isSelected ? '✓' : ''}</span>
                                </button>
                              </td>
                            `;
                          })
                          .join('')}
                      </tr>
                    `;
                  })
                  .join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } else if (type === 'drag_drop') {
      const pairs = Array.isArray(q.pairs) ? q.pairs : [];
      const rightChoices = Array.from(new Set(pairs.map((p) => p.right).filter(Boolean)));
      const extraOptions = Array.isArray(q.options) ? q.options : [];
      const allTokens = Array.from(new Set([...rightChoices, ...extraOptions]));
      const savedDragObj = savedVal && typeof savedVal === 'object' ? savedVal : {};
      const usedTokens = Object.values(savedDragObj).filter(Boolean);

      answerBodyHtml = `
        <div class="wg-stage-card wg-dragdrop-stage">
          <div class="wg-stage-pill">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"></path><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"></path><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"></path><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"></path></svg>
            <span>Drag tokens into the matching blank or click to place</span>
          </div>
          <div class="wg-dragdrop-prompt-card">
            ${pairs.length > 0 ? pairs.map((p) => {
              const assigned = savedDragObj[p.left] || '';
              return `
                <div class="wg-dd-expression-row">
                  <span class="wg-dd-prompt-text">${escapeHtml(p.left)}</span>
                  <div class="wg-drop-slot ${assigned ? 'filled' : ''}" data-slot-key="${escapeHtml(p.left)}" data-assigned-token="${escapeHtml(assigned)}">
                    ${assigned ? `
                      <span class="wg-grip-icon">||</span>
                      <span class="wg-token-val">${escapeHtml(assigned)}</span>
                      ${!isAlreadyAnswered ? `<button type="button" class="wg-slot-remove-btn" title="Remove">&times;</button>` : ''}
                    ` : `<span class="wg-slot-placeholder">[ Drop answer here ]</span>`}
                  </div>
                </div>
              `;
            }).join('') : `
              <div class="wg-dd-expression-row">
                <span class="wg-dd-prompt-text">${escapeHtml(q.questionText)}</span>
                <div class="wg-drop-slot ${savedDragObj['main_slot'] ? 'filled' : ''}" data-slot-key="main_slot" data-assigned-token="${escapeHtml(savedDragObj['main_slot'] || '')}">
                  ${savedDragObj['main_slot'] ? `
                    <span class="wg-grip-icon">||</span>
                    <span class="wg-token-val">${escapeHtml(savedDragObj['main_slot'])}</span>
                    ${!isAlreadyAnswered ? `<button type="button" class="wg-slot-remove-btn" title="Remove">&times;</button>` : ''}
                  ` : `<span class="wg-slot-placeholder">[ Drop answer here ]</span>`}
                </div>
              </div>
            `}
          </div>
          <div class="wg-tokens-tray">
            <div class="wg-tokens-label">Available Tokens (Click or drag to place):</div>
            <div class="wg-tokens-list">
              ${allTokens.map((tok, tIdx) => {
                const isUsed = usedTokens.includes(tok);
                return `
                  <div class="wg-token-chip ${isUsed ? 'is-used' : ''}" draggable="${!isUsed && !isAlreadyAnswered}" data-token-val="${escapeHtml(tok)}" data-token-id="tok_${tIdx}">
                    <span class="wg-grip-icon">||</span>
                    <span class="wg-token-text">${escapeHtml(tok)}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    } else if (type === 'categorize') {
      const pairs = Array.isArray(q.pairs) ? q.pairs : [];
      const categories = Array.from(new Set(pairs.map((p) => p.right).filter(Boolean)));
      const savedCatObj = savedVal && typeof savedVal === 'object' ? savedVal : {};
      const assignedKeys = Object.keys(savedCatObj).filter((k) => savedCatObj[k]);
      const unassignedItems = pairs.map((p) => p.left).filter((item) => !assignedKeys.includes(item));

      answerBodyHtml = `
        <div class="wg-stage-card wg-categorize-stage">
          <div class="wg-stage-pill">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 6h16M4 12h16M4 18h7"></path></svg>
            <span>Categorise the following items into the correct groups</span>
          </div>
          <div class="wg-cat-layout">
            <div class="wg-cat-pool-wrap">
              <div class="wg-cat-pool-header">Items to Categorize:</div>
              <div class="wg-cat-pool" id="wgCatPool">
                ${unassignedItems.map((item) => `
                  <div class="wg-cat-card" draggable="${!isAlreadyAnswered}" data-item-val="${escapeHtml(item)}">
                    <span class="wg-grip-icon">||</span>
                    <span class="wg-cat-card-text">${escapeHtml(item)}</span>
                  </div>
                `).join('')}
                ${unassignedItems.length === 0 ? `<div style="font-size:0.85rem; color:rgba(255,255,255,0.45); text-align:center; padding:20px 0;">All items categorized!</div>` : ''}
              </div>
            </div>
            <div class="wg-cat-buckets-wrap">
              ${categories.map((cat, cIdx) => {
                const catColorClass = `wg-cat-color-${cIdx % 5}`;
                const itemsInThisCat = pairs.filter((p) => savedCatObj[p.left] === cat).map((p) => p.left);
                return `
                  <div class="wg-category-bucket ${catColorClass}" data-cat-name="${escapeHtml(cat)}">
                    <div class="wg-cat-header-banner">${escapeHtml(cat)}</div>
                    <div class="wg-cat-bucket-dropzone" data-cat-name="${escapeHtml(cat)}">
                      ${itemsInThisCat.map((item) => `
                        <div class="wg-cat-card assigned" draggable="${!isAlreadyAnswered}" data-item-val="${escapeHtml(item)}" title="Click to remove">
                          <span class="wg-grip-icon">||</span>
                          <span class="wg-cat-card-text">${escapeHtml(item)}</span>
                          ${!isAlreadyAnswered ? `<button type="button" class="wg-cat-remove-btn" title="Remove">&times;</button>` : ''}
                        </div>
                      `).join('')}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        </div>
      `;
    } else if (type === 'match') {
      const pairs = Array.isArray(q.pairs) ? q.pairs : [];
      const rightChoices = Array.from(new Set(pairs.map((p) => p.right).filter(Boolean)));
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
                  <select class="slide-match-select" data-left-item="${escapeHtml(p.left)}" ${isAlreadyAnswered ? 'disabled' : ''}>
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
    } else if (type === 'open_ended' || type === 'long_answer') {
      answerBodyHtml = `
        <textarea
          class="slide-text-input slide-textarea"
          rows="6"
          placeholder="Type your detailed open-ended response here (auto-saved as you type)..."
          ${isAlreadyAnswered ? 'disabled' : ''}
        >${escapeHtml(typeof savedVal === 'string' ? savedVal : '')}</textarea>
      `;
    } else if (type === 'labeling' || type === 'image_identify') {
      const pairs = Array.isArray(q.pairs) ? q.pairs : [];
      const rightChoices = Array.from(new Set(pairs.map((p) => p.right).filter(Boolean)));
      const extraOptions = Array.isArray(q.options) ? q.options : [];
      const allLabels = Array.from(new Set([...rightChoices, ...extraOptions]));
      const targets = pairs.length > 0 ? pairs.map((p) => p.left) : (q.options && q.options.length > 0 ? q.options.map((_, i) => `Label Target ${i + 1}`) : []);
      const savedLabelObj = savedVal && typeof savedVal === 'object' ? savedVal : {};
      const usedLabels = Object.values(savedLabelObj).filter(Boolean);

      if (targets.length > 0 && allLabels.length > 0) {
        answerBodyHtml = `
          <div class="wg-stage-card wg-labeling-stage">
            <div class="wg-stage-pill">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>
              <span>Drag labels to their correct positions on the diagram</span>
            </div>
            <div class="wg-labeling-layout">
              <div class="wg-labels-palette">
                <div class="wg-labels-palette-title">Available Labels:</div>
                <div class="wg-labels-palette-list">
                  ${allLabels.map((lbl, lIdx) => {
                    const isUsed = usedLabels.includes(lbl);
                    return `
                      <div class="wg-label-chip ${isUsed ? 'is-used' : ''}" draggable="${!isUsed && !isAlreadyAnswered}" data-label-val="${escapeHtml(lbl)}" data-label-id="lbl_${lIdx}">
                        <span class="wg-grip-icon">:::</span>
                        <span class="wg-label-text">${escapeHtml(lbl)}</span>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
              <div class="wg-labeling-stage-image-box">
                ${q.imageUrl ? `<img src="${escapeHtml(q.imageUrl)}" alt="Diagram" class="wg-diagram-image" />` : ''}
                <div class="wg-label-dropzones-list">
                  ${targets.map((tgt) => {
                    const assigned = savedLabelObj[tgt] || '';
                    return `
                      <div class="wg-label-target-row">
                        <span class="wg-target-label-name">${escapeHtml(tgt)}:</span>
                        <div class="wg-label-target ${assigned ? 'has-label' : ''}" data-slot-key="${escapeHtml(tgt)}" data-assigned-label="${escapeHtml(assigned)}">
                          ${assigned ? `
                            <span class="wg-grip-icon">:::</span>
                            <span class="wg-target-assigned-text">${escapeHtml(assigned)}</span>
                            ${!isAlreadyAnswered ? `<button type="button" class="wg-remove-label-btn" title="Remove">&times;</button>` : ''}
                          ` : `<span class="wg-target-empty-prompt">[ Drop label here ]</span>`}
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            </div>
          </div>
        `;
      } else {
        answerBodyHtml = `
          <div class="wg-stage-card">
            <div class="wg-stage-pill">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path></svg>
              <span>Type your identification label below</span>
            </div>
            <input
              type="text"
              class="slide-text-input slide-short-input"
              value="${escapeHtml(typeof savedVal === 'string' ? savedVal : '')}"
              placeholder="Identify / label the picture shown above and type your answer here..."
              ${isAlreadyAnswered ? 'disabled' : ''}
            />
          </div>
        `;
      }
    } else {
      const placeholderTxt = 'Type your answer here (auto-saved as you type)...';
      answerBodyHtml = `
        <input
          type="text"
          class="slide-text-input slide-short-input"
          value="${escapeHtml(typeof savedVal === 'string' ? savedVal : '')}"
          placeholder="${placeholderTxt}"
          ${isAlreadyAnswered ? 'disabled' : ''}
        />
      `;
    }

    if (q.type !== 'section' && !['mcq', 'radio', 'true_false', 'dropdown', 'hotspot'].includes(type)) {
      if (!isAlreadyAnswered) {
        answerBodyHtml += `
          <button type="button" class="slide-confirm-ans-btn" id="slideConfirmAnsBtn">
            <span>Confirm Answer &amp; Continue &rarr;</span>
          </button>
        `;
      } else {
        answerBodyHtml += `
          <button type="button" class="slide-confirm-ans-btn" disabled style="background:#16a34a; opacity: 0.88;">
            <span>✓ Answer Submitted (Locked)</span>
          </button>
        `;
      }
    }

    candExamQuestionText.innerHTML = `
      <div class="slide-question-header">
        <div class="slide-q-badges">
          <span class="slide-q-number">QUESTION ${currentActualQNum} OF ${totalActualQuestions}</span>
          <span class="slide-q-type-pill">${escapeHtml(typeBadgeText)}</span>
          ${isAlreadyAnswered ? `<span class="slide-locked-banner"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg> Answer Locked</span>` : ''}
        </div>
        <span class="slide-q-points">${escapeHtml(pts)}</span>
      </div>

      <h3 class="slide-question-prompt">
        ${escapeHtml(q.questionText)}
        ${q.required ? '<span class="req-star" title="Required">*</span>' : ''}
      </h3>

      ${
        q.sectionContent && q.sectionContent.trim()
          ? `<div class="slide-reading-section-box" style="margin-bottom: 6px;">
              <div class="slide-reading-passage-body">${escapeHtml(q.sectionContent)}</div>
            </div>`
          : ''
      }

      ${slideImageHtml}

      <div class="slide-answer-area">
        ${answerBodyHtml}
      </div>
    `;

    // Wayground Action 1: Radio Option Selection -> Auto-Lock & Auto-Advance to Next Question
    candExamQuestionText.querySelectorAll('input[type="radio"]').forEach((inp) => {
      inp.addEventListener('change', () => {
        if (isAlreadyAnswered) return;
        const optVal = inp.value;
        const qKey = q.id || `slide_${currentSlideIndex}`;
        currentAnswers[qKey] = optVal;
        skippedSlides.delete(currentSlideIndex);

        candExamQuestionText.querySelectorAll('.slide-option-card').forEach((lbl) => {
          const ctrl = lbl.querySelector('input');
          const isChosen = ctrl && ctrl.value === optVal;
          lbl.classList.toggle('selected', isChosen);
          lbl.classList.toggle('locked-chosen', isChosen);
          lbl.classList.toggle('locked-disabled', !isChosen);
        });
        candExamQuestionText.querySelectorAll('input[type="radio"]').forEach((r) => (r.disabled = true));
        candExamQuestionText.querySelector('.slide-options-grid')?.classList.add('locked');

        triggerAutoSave('Answer Saved');
        const activeDot = examSlideDots?.children[currentSlideIndex];
        if (activeDot) activeDot.classList.add('answered');

        triggerAutoAdvance(500);
      });
    });

    // Checkbox toggles
    candExamQuestionText.querySelectorAll('input[type="checkbox"]').forEach((inp) => {
      inp.addEventListener('change', () => {
        if (isAlreadyAnswered) return;
        candExamQuestionText.querySelectorAll('.slide-option-card').forEach((lbl) => {
          const ctrl = lbl.querySelector('input');
          if (ctrl) lbl.classList.toggle('selected', ctrl.checked);
        });
      });
    });

    // Wayground Action 2: Dropdown Selection -> Auto-Lock & Auto-Advance
    const slideSel = candExamQuestionText.querySelector('select.slide-dropdown-select');
    if (slideSel && !isAlreadyAnswered) {
      slideSel.addEventListener('change', () => {
        if (!slideSel.value) return;
        const qKey = q.id || `slide_${currentSlideIndex}`;
        currentAnswers[qKey] = slideSel.value;
        skippedSlides.delete(currentSlideIndex);
        slideSel.disabled = true;

        triggerAutoSave('Answer Saved');
        const activeDot = examSlideDots?.children[currentSlideIndex];
        if (activeDot) activeDot.classList.add('answered');

        triggerAutoAdvance(500);
      });
    }

    // Other selects (Match / Pairs)
    candExamQuestionText.querySelectorAll('select.slide-match-select').forEach((sel) => {
      sel.addEventListener('change', () => {
        if (isAlreadyAnswered) return;
        const activeDot = examSlideDots?.children[currentSlideIndex];
        if (activeDot) activeDot.classList.add('answered');
      });
    });

    // 1. Wayground Interactive: Match Table Grid Cell Selection
    candExamQuestionText.querySelectorAll('.wg-grid-cell').forEach((cell) => {
      cell.addEventListener('click', () => {
        if (isAlreadyAnswered) return;
        const rowItem = cell.getAttribute('data-left-item') || '';
        const isCurrentlySelected = cell.classList.contains('selected');
        // Toggle selection for this row's cells
        const rowCells = candExamQuestionText.querySelectorAll(`.wg-grid-cell[data-left-item="${CSS.escape(rowItem)}"]`);
        rowCells.forEach((c) => {
          c.classList.remove('selected');
          const cb = c.querySelector('.wg-grid-check-box');
          if (cb) cb.textContent = '';
        });
        if (!isCurrentlySelected) {
          cell.classList.add('selected');
          const cb = cell.querySelector('.wg-grid-check-box');
          if (cb) cb.textContent = '✓';
        }
        triggerAutoSave('Auto-Saved');
        const activeDot = examSlideDots?.children[currentSlideIndex];
        if (activeDot) activeDot.classList.toggle('answered', isSlideAnswered(q, currentSlideIndex));
      });
    });

    // 2. Wayground Interactive: Drag & Drop (Chips to Slots)
    let selectedTokenChip = null;
    candExamQuestionText.querySelectorAll('.wg-token-chip').forEach((chip) => {
      chip.addEventListener('dragstart', (e) => {
        if (isAlreadyAnswered || chip.classList.contains('is-used')) return;
        e.dataTransfer.setData('text/plain', chip.getAttribute('data-token-val') || '');
        e.dataTransfer.effectAllowed = 'move';
      });

      chip.addEventListener('click', () => {
        if (isAlreadyAnswered || chip.classList.contains('is-used')) return;
        const tokenVal = chip.getAttribute('data-token-val') || '';
        // Find first empty slot
        const emptySlot = candExamQuestionText.querySelector('.wg-drop-slot:not(.filled)');
        if (emptySlot) {
          emptySlot.classList.add('filled');
          emptySlot.setAttribute('data-assigned-token', tokenVal);
          emptySlot.innerHTML = `
            <span class="wg-grip-icon">||</span>
            <span class="wg-token-val">${escapeHtml(tokenVal)}</span>
            <button type="button" class="wg-slot-remove-btn" title="Remove">&times;</button>
          `;
          chip.classList.add('is-used');
          bindDropSlotRemoval(emptySlot);
          triggerAutoSave('Auto-Saved');
          const activeDot = examSlideDots?.children[currentSlideIndex];
          if (activeDot) activeDot.classList.toggle('answered', isSlideAnswered(q, currentSlideIndex));
        }
      });
    });

    function bindDropSlotRemoval(slot) {
      const removeBtn = slot.querySelector('.wg-slot-remove-btn');
      const handleRemove = (e) => {
        e.stopPropagation();
        if (isAlreadyAnswered) return;
        const tokenVal = slot.getAttribute('data-assigned-token') || '';
        slot.classList.remove('filled');
        slot.removeAttribute('data-assigned-token');
        slot.innerHTML = `<span class="wg-slot-placeholder">[ Drop answer here ]</span>`;
        // Restore chip
        candExamQuestionText.querySelectorAll('.wg-token-chip').forEach((c) => {
          if (c.getAttribute('data-token-val') === tokenVal) {
            c.classList.remove('is-used');
          }
        });
        triggerAutoSave('Auto-Saved');
        const activeDot = examSlideDots?.children[currentSlideIndex];
        if (activeDot) activeDot.classList.toggle('answered', isSlideAnswered(q, currentSlideIndex));
      };
      if (removeBtn) removeBtn.addEventListener('click', handleRemove);
    }

    candExamQuestionText.querySelectorAll('.wg-drop-slot').forEach((slot) => {
      bindDropSlotRemoval(slot);

      slot.addEventListener('dragover', (e) => {
        if (isAlreadyAnswered) return;
        e.preventDefault();
        slot.classList.add('drag-over');
      });

      slot.addEventListener('dragleave', () => {
        slot.classList.remove('drag-over');
      });

      slot.addEventListener('drop', (e) => {
        if (isAlreadyAnswered) return;
        e.preventDefault();
        slot.classList.remove('drag-over');
        const tokenVal = e.dataTransfer.getData('text/plain');
        if (!tokenVal) return;

        // If slot had an existing token, un-use it
        const prevToken = slot.getAttribute('data-assigned-token');
        if (prevToken) {
          candExamQuestionText.querySelectorAll('.wg-token-chip').forEach((c) => {
            if (c.getAttribute('data-token-val') === prevToken) c.classList.remove('is-used');
          });
        }

        slot.classList.add('filled');
        slot.setAttribute('data-assigned-token', tokenVal);
        slot.innerHTML = `
          <span class="wg-grip-icon">||</span>
          <span class="wg-token-val">${escapeHtml(tokenVal)}</span>
          <button type="button" class="wg-slot-remove-btn" title="Remove">&times;</button>
        `;
        candExamQuestionText.querySelectorAll('.wg-token-chip').forEach((c) => {
          if (c.getAttribute('data-token-val') === tokenVal) c.classList.add('is-used');
        });
        bindDropSlotRemoval(slot);
        triggerAutoSave('Auto-Saved');
        const activeDot = examSlideDots?.children[currentSlideIndex];
        if (activeDot) activeDot.classList.toggle('answered', isSlideAnswered(q, currentSlideIndex));
      });
    });

    // 3. Wayground Interactive: Categorize (Cards to Category Buckets)
    let selectedCatCard = null;
    const bindCatCardEvents = (card) => {
      card.addEventListener('dragstart', (e) => {
        if (isAlreadyAnswered) return;
        e.dataTransfer.setData('text/plain', card.getAttribute('data-item-val') || '');
        e.dataTransfer.effectAllowed = 'move';
      });

      card.addEventListener('click', (e) => {
        if (isAlreadyAnswered) return;
        if (card.classList.contains('assigned')) {
          // If clicked in a bucket, return to pool
          const pool = candExamQuestionText.querySelector('#wgCatPool');
          if (pool) {
            card.classList.remove('assigned');
            const remBtn = card.querySelector('.wg-cat-remove-btn');
            if (remBtn) remBtn.remove();
            pool.appendChild(card);
            triggerAutoSave('Auto-Saved');
            const activeDot = examSlideDots?.children[currentSlideIndex];
            if (activeDot) activeDot.classList.toggle('answered', isSlideAnswered(q, currentSlideIndex));
          }
          return;
        }

        // Toggle selection in pool
        candExamQuestionText.querySelectorAll('.wg-cat-card').forEach((c) => c.classList.remove('active-selected'));
        if (selectedCatCard === card) {
          selectedCatCard = null;
        } else {
          selectedCatCard = card;
          card.classList.add('active-selected');
        }
      });
    };

    candExamQuestionText.querySelectorAll('.wg-cat-card').forEach(bindCatCardEvents);

    candExamQuestionText.querySelectorAll('.wg-category-bucket').forEach((bucket) => {
      bucket.addEventListener('click', () => {
        if (isAlreadyAnswered || !selectedCatCard) return;
        const dropzone = bucket.querySelector('.wg-cat-bucket-dropzone');
        if (dropzone) {
          selectedCatCard.classList.remove('active-selected');
          selectedCatCard.classList.add('assigned');
          if (!selectedCatCard.querySelector('.wg-cat-remove-btn')) {
            const remBtn = document.createElement('button');
            remBtn.type = 'button';
            remBtn.className = 'wg-cat-remove-btn';
            remBtn.title = 'Remove';
            remBtn.innerHTML = '&times;';
            selectedCatCard.appendChild(remBtn);
          }
          dropzone.appendChild(selectedCatCard);
          selectedCatCard = null;
          triggerAutoSave('Auto-Saved');
          const activeDot = examSlideDots?.children[currentSlideIndex];
          if (activeDot) activeDot.classList.toggle('answered', isSlideAnswered(q, currentSlideIndex));
        }
      });

      bucket.addEventListener('dragover', (e) => {
        if (isAlreadyAnswered) return;
        e.preventDefault();
        bucket.querySelector('.wg-cat-bucket-dropzone')?.classList.add('drag-over');
      });

      bucket.addEventListener('dragleave', () => {
        bucket.querySelector('.wg-cat-bucket-dropzone')?.classList.remove('drag-over');
      });

      bucket.addEventListener('drop', (e) => {
        if (isAlreadyAnswered) return;
        e.preventDefault();
        bucket.querySelector('.wg-cat-bucket-dropzone')?.classList.remove('drag-over');
        const itemVal = e.dataTransfer.getData('text/plain');
        if (!itemVal) return;
        const card = candExamQuestionText.querySelector(`.wg-cat-card[data-item-val="${CSS.escape(itemVal)}"]`);
        const dropzone = bucket.querySelector('.wg-cat-bucket-dropzone');
        if (card && dropzone) {
          card.classList.remove('active-selected');
          card.classList.add('assigned');
          if (!card.querySelector('.wg-cat-remove-btn')) {
            const remBtn = document.createElement('button');
            remBtn.type = 'button';
            remBtn.className = 'wg-cat-remove-btn';
            remBtn.title = 'Remove';
            remBtn.innerHTML = '&times;';
            card.appendChild(remBtn);
          }
          dropzone.appendChild(card);
          triggerAutoSave('Auto-Saved');
          const activeDot = examSlideDots?.children[currentSlideIndex];
          if (activeDot) activeDot.classList.toggle('answered', isSlideAnswered(q, currentSlideIndex));
        }
      });
    });

    // 4. Wayground Interactive: Reorder Tiles (Arrows & Click Swap)
    let selectedReorderTile = null;
    candExamQuestionText.querySelectorAll('.wg-reorder-tile').forEach((tile) => {
      tile.addEventListener('click', (e) => {
        if (isAlreadyAnswered || e.target.closest('.wg-tile-arrow-btn')) return;
        if (!selectedReorderTile) {
          selectedReorderTile = tile;
          tile.classList.add('active-selected');
        } else if (selectedReorderTile === tile) {
          tile.classList.remove('active-selected');
          selectedReorderTile = null;
        } else {
          // Swap positions of selectedReorderTile and tile
          const board = candExamQuestionText.querySelector('#wgReorderBoard');
          const wrapA = selectedReorderTile.closest('.wg-reorder-slot-wrap');
          const wrapB = tile.closest('.wg-reorder-slot-wrap');
          if (board && wrapA && wrapB) {
            wrapA.appendChild(tile);
            wrapB.appendChild(selectedReorderTile);
            selectedReorderTile.classList.remove('active-selected');
            selectedReorderTile = null;
            triggerAutoSave('Auto-Saved');
            const activeDot = examSlideDots?.children[currentSlideIndex];
            if (activeDot) activeDot.classList.toggle('answered', isSlideAnswered(q, currentSlideIndex));
          }
        }
      });
    });

    candExamQuestionText.querySelectorAll('.wg-tile-arrow-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isAlreadyAnswered) return;
        const board = candExamQuestionText.querySelector('#wgReorderBoard');
        const wrap = btn.closest('.wg-reorder-slot-wrap');
        if (!board || !wrap) return;
        const isUp = btn.classList.contains('move-up');
        if (isUp && wrap.previousElementSibling) {
          board.insertBefore(wrap, wrap.previousElementSibling);
        } else if (!isUp && wrap.nextElementSibling) {
          board.insertBefore(wrap.nextElementSibling, wrap);
        }
        // Update rank numbers and arrow disabled states
        const allWraps = Array.from(board.querySelectorAll('.wg-reorder-slot-wrap'));
        allWraps.forEach((w, idx) => {
          const badge = w.querySelector('.wg-reorder-rank-badge');
          if (badge) badge.textContent = idx + 1;
          const upBtn = w.querySelector('.move-up');
          const downBtn = w.querySelector('.move-down');
          if (upBtn) upBtn.disabled = idx === 0;
          if (downBtn) downBtn.disabled = idx === allWraps.length - 1;
        });
        triggerAutoSave('Auto-Saved');
        const activeDot = examSlideDots?.children[currentSlideIndex];
        if (activeDot) activeDot.classList.toggle('answered', isSlideAnswered(q, currentSlideIndex));
      });
    });

    // 5. Wayground Interactive: Labeling Chips to Diagram Targets
    candExamQuestionText.querySelectorAll('.wg-label-chip').forEach((chip) => {
      chip.addEventListener('dragstart', (e) => {
        if (isAlreadyAnswered || chip.classList.contains('is-used')) return;
        e.dataTransfer.setData('text/plain', chip.getAttribute('data-label-val') || '');
        e.dataTransfer.effectAllowed = 'move';
      });

      chip.addEventListener('click', () => {
        if (isAlreadyAnswered || chip.classList.contains('is-used')) return;
        const labelVal = chip.getAttribute('data-label-val') || '';
        // Place in first empty target
        const emptyTarget = candExamQuestionText.querySelector('.wg-label-target:not(.has-label)');
        if (emptyTarget) {
          emptyTarget.classList.add('has-label');
          emptyTarget.setAttribute('data-assigned-label', labelVal);
          emptyTarget.innerHTML = `
            <span class="wg-grip-icon">:::</span>
            <span class="wg-target-assigned-text">${escapeHtml(labelVal)}</span>
            <button type="button" class="wg-remove-label-btn" title="Remove">&times;</button>
          `;
          chip.classList.add('is-used');
          bindLabelTargetRemoval(emptyTarget);
          triggerAutoSave('Auto-Saved');
          const activeDot = examSlideDots?.children[currentSlideIndex];
          if (activeDot) activeDot.classList.toggle('answered', isSlideAnswered(q, currentSlideIndex));
        }
      });
    });

    function bindLabelTargetRemoval(target) {
      const remBtn = target.querySelector('.wg-remove-label-btn');
      if (remBtn) {
        remBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (isAlreadyAnswered) return;
          const assigned = target.getAttribute('data-assigned-label') || '';
          target.classList.remove('has-label');
          target.removeAttribute('data-assigned-label');
          target.innerHTML = `<span class="wg-target-empty-prompt">[ Drop label here ]</span>`;
          candExamQuestionText.querySelectorAll('.wg-label-chip').forEach((c) => {
            if (c.getAttribute('data-label-val') === assigned) c.classList.remove('is-used');
          });
          triggerAutoSave('Auto-Saved');
          const activeDot = examSlideDots?.children[currentSlideIndex];
          if (activeDot) activeDot.classList.toggle('answered', isSlideAnswered(q, currentSlideIndex));
        });
      }
    }

    candExamQuestionText.querySelectorAll('.wg-label-target').forEach((target) => {
      bindLabelTargetRemoval(target);

      target.addEventListener('dragover', (e) => {
        if (isAlreadyAnswered) return;
        e.preventDefault();
        target.classList.add('drag-over');
      });

      target.addEventListener('dragleave', () => {
        target.classList.remove('drag-over');
      });

      target.addEventListener('drop', (e) => {
        if (isAlreadyAnswered) return;
        e.preventDefault();
        target.classList.remove('drag-over');
        const labelVal = e.dataTransfer.getData('text/plain');
        if (!labelVal) return;

        const prevLabel = target.getAttribute('data-assigned-label');
        if (prevLabel) {
          candExamQuestionText.querySelectorAll('.wg-label-chip').forEach((c) => {
            if (c.getAttribute('data-label-val') === prevLabel) c.classList.remove('is-used');
          });
        }

        target.classList.add('has-label');
        target.setAttribute('data-assigned-label', labelVal);
        target.innerHTML = `
          <span class="wg-grip-icon">:::</span>
          <span class="wg-target-assigned-text">${escapeHtml(labelVal)}</span>
          <button type="button" class="wg-remove-label-btn" title="Remove">&times;</button>
        `;
        candExamQuestionText.querySelectorAll('.wg-label-chip').forEach((c) => {
          if (c.getAttribute('data-label-val') === labelVal) c.classList.add('is-used');
        });
        bindLabelTargetRemoval(target);
        triggerAutoSave('Auto-Saved');
        const activeDot = examSlideDots?.children[currentSlideIndex];
        if (activeDot) activeDot.classList.toggle('answered', isSlideAnswered(q, currentSlideIndex));
      });
    });

    // Wayground Action 3: Confirm Button for Multi-Select & Interactive Questions
    const confirmBtn = candExamQuestionText.querySelector('#slideConfirmAnsBtn');
    if (confirmBtn && !isAlreadyAnswered) {
      confirmBtn.addEventListener('click', () => {
        collectCurrentSlideAnswerFromDOM();
        if (!isSlideAnswered(q, currentSlideIndex)) {
          showToast('Please make a selection or arrangement before submitting');
          return;
        }
        skippedSlides.delete(currentSlideIndex);
        candExamQuestionText.querySelectorAll('input, select, button').forEach((el) => {
          if (el !== confirmBtn) el.disabled = true;
        });
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = `<span>✓ Answer Saved</span>`;
        confirmBtn.style.background = '#16a34a';

        triggerAutoSave('Answer Saved');
        const activeDot = examSlideDots?.children[currentSlideIndex];
        if (activeDot) activeDot.classList.add('answered');

        triggerAutoAdvance(450);
      });
    }

    candExamQuestionText.querySelectorAll('.slide-text-input, .slide-table-fill-input').forEach((txt) => {
      if (isAlreadyAnswered) {
        txt.disabled = true;
      }
      txt.addEventListener('input', () => {
        if (isAlreadyAnswered) return;
        triggerAutoSave('Saving...');
        const activeDot = examSlideDots?.children[currentSlideIndex];
        if (activeDot) {
          activeDot.classList.toggle('answered', isSlideAnswered(q, currentSlideIndex));
        }
      });
    });

    candExamQuestionText.querySelectorAll('.slide-reorder-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const listEl = candExamQuestionText.querySelector('.slide-reorder-list');
        const rowEl = btn.closest('.slide-reorder-item');
        if (!listEl || !rowEl) return;
        const isUp = btn.classList.contains('move-up');
        if (isUp && rowEl.previousElementSibling) {
          listEl.insertBefore(rowEl, rowEl.previousElementSibling);
        } else if (!isUp && rowEl.nextElementSibling) {
          listEl.insertBefore(rowEl.nextElementSibling, rowEl);
        }
        const allRows = Array.from(listEl.querySelectorAll('.slide-reorder-item'));
        allRows.forEach((r, idx) => {
          const rankSpan = r.querySelector('.slide-reorder-rank');
          if (rankSpan) rankSpan.textContent = idx + 1;
          const upBtn = r.querySelector('.move-up');
          const downBtn = r.querySelector('.move-down');
          if (upBtn) upBtn.disabled = idx === 0;
          if (downBtn) downBtn.disabled = idx === allRows.length - 1;
        });
        triggerAutoSave('Auto-Saved');
        const activeDot = examSlideDots?.children[currentSlideIndex];
        if (activeDot) activeDot.classList.add('answered');
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

  function evaluateCandidateExamResults(slides, answers) {
    let totalMarks = 0;
    let maxMarks = 0;
    let correctCount = 0;
    let wrongCount = 0;
    const reviews = [];

    (slides || []).forEach((q, idx) => {
      if (q.type === 'section') return;
      const qNum = idx + 1;
      const qPts = Math.max(0, parseFloat(q.points) || 1);
      maxMarks += qPts;
      const qKey = q.id || `slide_${idx}`;
      const rawAns = answers ? answers[qKey] : undefined;
      const type = q.type || 'mcq';

      let isCorrect = false;
      let earned = 0;
      let studentAnsDisplay = '';
      let expectedAnsDisplay = '';

      if (type === 'mcq' || type === 'radio' || type === 'true_false' || type === 'dropdown' || type === 'hotspot') {
        const expected = String(q.correctAnswer || '').trim();
        expectedAnsDisplay = expected;
        const student = String(rawAns || '').trim();
        studentAnsDisplay = student;
        if (expected && student && expected.toLowerCase() === student.toLowerCase()) {
          isCorrect = true;
          earned = qPts;
        }
      } else if (type === 'checkbox') {
        const expectedArr = Array.isArray(q.correctOptions) && q.correctOptions.length > 0
          ? q.correctOptions
          : (q.correctAnswer ? [q.correctAnswer] : []);
        expectedAnsDisplay = expectedArr.join(', ');
        const studentArr = Array.isArray(rawAns) ? rawAns : (rawAns ? [rawAns] : []);
        studentAnsDisplay = studentArr.join(', ');
        const exactMatch = expectedArr.length === studentArr.length &&
          expectedArr.every((e) => studentArr.some((s) => String(s).trim().toLowerCase() === String(e).trim().toLowerCase()));
        if (exactMatch && expectedArr.length > 0) {
          isCorrect = true;
          earned = qPts;
        }
      } else if (type === 'reorder') {
        const expectedArr = Array.isArray(q.correctOptions) && q.correctOptions.length > 0
          ? q.correctOptions
          : (Array.isArray(q.options) ? q.options : []);
        expectedAnsDisplay = expectedArr.join(' -> ');
        const studentArr = Array.isArray(rawAns) ? rawAns : [];
        studentAnsDisplay = studentArr.join(' -> ');
        if (expectedArr.length > 0 && expectedArr.length === studentArr.length &&
            expectedArr.every((exp, i) => String(exp).trim().toLowerCase() === String(studentArr[i]).trim().toLowerCase())) {
          isCorrect = true;
          earned = qPts;
        }
      } else if (type === 'match' || type === 'drag_drop' || type === 'categorize' || type === 'match_grid') {
        const pairs = Array.isArray(q.pairs) ? q.pairs : [];
        expectedAnsDisplay = pairs.map((p) => `${p.left} -> ${p.right}`).join('; ');
        const studentMap = rawAns && typeof rawAns === 'object' && !Array.isArray(rawAns) ? rawAns : {};
        studentAnsDisplay = Object.entries(studentMap).map(([k, v]) => `${k} -> ${v}`).join('; ');
        let matched = 0;
        pairs.forEach((p) => {
          const chosen = studentMap[p.left];
          if (chosen && p.right && String(chosen).trim().toLowerCase() === String(p.right).trim().toLowerCase()) {
            matched++;
          }
        });
        if (pairs.length > 0 && matched === pairs.length) {
          isCorrect = true;
          earned = qPts;
        }
      } else {
        // labeling / text
        const expected = String(q.answerKey || q.correctAnswer || '').trim();
        expectedAnsDisplay = expected;
        const student = String(rawAns || '').trim();
        studentAnsDisplay = student;
        if (expected && student && expected.toLowerCase() === student.toLowerCase()) {
          isCorrect = true;
          earned = qPts;
        }
      }

      if (isCorrect) {
        correctCount++;
        totalMarks += earned;
      } else {
        wrongCount++;
      }

      reviews.push({
        qNum,
        prompt: q.questionText || `Question ${qNum}`,
        isCorrect,
        earnedPts: earned,
        maxPts: qPts,
        studentAnsDisplay: studentAnsDisplay || 'No Answer / Skipped',
        expectedAnsDisplay: expectedAnsDisplay || 'Discretionary'
      });
    });

    const percentage = maxMarks > 0 ? Math.round((totalMarks / maxMarks) * 100) : 0;
    return { totalMarks, maxMarks, percentage, correctCount, wrongCount, reviews };
  }

  function playExamSubmissionAnimation({ progName, totalSlides, answeredSlides, reason, slides, answers }) {
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
        ? 'Exam Completed Successfully!'
        : 'Exam Auto-Submitted & Saved!';
    }
    if (examSubmissionSubtitle) {
      examSubmissionSubtitle.textContent = isManual
        ? 'Here is your score breakdown and verified answer review:'
        : `Triggered by "${reason}". Here is your score breakdown and verified answer review:`;
    }
    if (examSubmissionProgName) examSubmissionProgName.textContent = progName || 'Program Exam';
    if (examSubmissionAnsweredCount) {
      examSubmissionAnsweredCount.textContent = `${answeredSlides} / ${totalSlides} Slide${totalSlides === 1 ? '' : 's'}`;
    }
    if (examSubmissionChestCode) {
      examSubmissionChestCode.textContent = `#${participant.chestNo}`;
    }

    // Render Wayground Marks & True/False Answer Review
    const reviewData = evaluateCandidateExamResults(slides || activeSlides || [], answers || currentAnswers || {});

    if (examSubmissionResultsBox) {
      examSubmissionResultsBox.style.display = 'block';
    }
    if (examResultScoreBadge) {
      examResultScoreBadge.textContent = `Score: ${reviewData.totalMarks} / ${reviewData.maxMarks} Pts (${reviewData.percentage}%)`;
    }
    if (examResultCorrectCount) {
      examResultCorrectCount.textContent = `✓ ${reviewData.correctCount} Correct (True)`;
    }
    if (examResultWrongCount) {
      examResultWrongCount.textContent = `✗ ${reviewData.wrongCount} Incorrect (False)`;
    }
    if (examResultsReviewList) {
      examResultsReviewList.innerHTML = reviewData.reviews.map((r) => `
        <div class="result-review-card ${r.isCorrect ? 'is-correct' : 'is-wrong'}">
          <div class="result-review-header">
            <span class="result-status-tag ${r.isCorrect ? 'correct' : 'wrong'}">
              ${r.isCorrect ? '✓ True (Correct)' : '✗ False (Incorrect)'}
            </span>
            <span class="result-points-tag">${r.earnedPts} / ${r.maxPts} Pts</span>
          </div>
          <div class="result-q-prompt"><strong>Q${r.qNum}:</strong> ${escapeHtml(r.prompt)}</div>
          <div class="result-ans-row">
            <span class="result-ans-label">Your Answer:</span>
            <span class="result-ans-val ${r.isCorrect ? 'correct-text' : 'wrong-text'}">${escapeHtml(r.studentAnsDisplay)}</span>
          </div>
          ${!r.isCorrect ? `
          <div class="result-ans-row">
            <span class="result-ans-label">Correct Key:</span>
            <span class="result-ans-val correct-text">${escapeHtml(r.expectedAnsDisplay)}</span>
          </div>` : ''}
        </div>
      `).join('');
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

    if (submitAnimDismissTimer) {
      clearTimeout(submitAnimDismissTimer);
      submitAnimDismissTimer = null;
    }
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
    skippedSlides.clear();

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

    const activeSlidesCopy = [...activeSlides];
    const currentAnswersCopy = { ...currentAnswers };

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
      reason,
      slides: activeSlidesCopy,
      answers: currentAnswersCopy
    });
  }

  // Slide Navigation: Back, Continue & Skip
  if (examSlideBackBtn) {
    examSlideBackBtn.addEventListener('click', () => {
      if (currentSlideIndex > 0) {
        triggerAutoSave('Auto-Saved');
        currentSlideIndex--;
        renderCurrentSlide();
      }
    });
  }

  if (examSlideSkipBtn) {
    examSlideSkipBtn.addEventListener('click', () => {
      skippedSlides.add(currentSlideIndex);
      triggerAutoSave('Auto-Saved');
      showToast('Question skipped — you will return to it before final submission.');
      const nextIdx = findNextSlideIndex(currentSlideIndex);
      currentSlideIndex = nextIdx;
      renderCurrentSlide();
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
