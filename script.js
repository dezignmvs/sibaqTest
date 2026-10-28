/**
 * Sibaq '26 Participant Portal Logic
 * Strictly validates Chest Number (e.g. A10) against Admin-entered records (Firebase + IndexedDB)
 * and routes verified candidates to their dashboard with their programs & Start Exam option.
 */

document.addEventListener('DOMContentLoaded', () => {
  const chestForm = document.getElementById('chestForm');
  const chestInput = document.getElementById('chestNumber');
  const chestError = document.getElementById('chestError');
  const submitBtn = document.getElementById('submitBtn');
  const alertBanner = document.getElementById('alertBanner');
  const quickSample = document.getElementById('quickSample');

  const DB_NAME = 'SibaqRecordsDB';
  const DB_VERSION = 2;
  const STORE_NAME = 'records';
  const STUDENTS_STORE = 'students';

  if (quickSample && chestInput) {
    quickSample.addEventListener('click', () => {
      chestInput.value = 'A10';
      clearErrors();
      chestInput.focus();
    });
  }

  function clearErrors() {
    if (chestError) {
      chestError.classList.remove('active');
      chestError.textContent = '';
    }
    const wrap = chestInput ? chestInput.closest('.input-wrapper') : null;
    if (wrap) wrap.classList.remove('error');
    if (alertBanner) {
      alertBanner.style.display = 'none';
      alertBanner.className = 'alert-banner';
    }
  }

  function showAlert(msg, type = 'error') {
    if (!alertBanner) return;
    alertBanner.textContent = msg;
    alertBanner.className = `alert-banner ${type}`;
    alertBanner.style.display = 'block';
  }

  if (chestInput) {
    chestInput.addEventListener('input', () => {
      chestInput.value = chestInput.value.replace(/[^0-9a-zA-Z_-]/g, '').toUpperCase();
      clearErrors();
    });
  }

  // Open local IndexedDB (shared with Admin panel on same origin)
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

  function getSavedExamsMap() {
    try {
      return JSON.parse(localStorage.getItem('sibaq_exams') || '{}');
    } catch (e) {
      return {};
    }
  }

  function makeProgramExamKey(programName, category) {
    return `${(programName || '').trim().toLowerCase()}__${(category || '').trim().toLowerCase()}`;
  }

  // Fetch all admin-registered students & program records (merging Firebase + IndexedDB)
  async function fetchAdminData() {
    const studentsMap = new Map();
    const recordsMap = new Map();

    // 1. Read local IndexedDB first
    const [localStudents, localRecords] = await Promise.all([
      getStoreAllFromIndexedDB(STUDENTS_STORE),
      getStoreAllFromIndexedDB(STORE_NAME)
    ]);

    localStudents.forEach((s) => {
      if (s && s.chestNo) {
        studentsMap.set(String(s.chestNo).trim().toLowerCase(), s);
      }
    });

    localRecords.forEach((r) => {
      if (r && r.id) {
        recordsMap.set(String(r.id), r);
      }
    });

    // 2. Read Firebase Cloud Firestore if available
    if (window.SibaqFirebase?.db && window.SibaqFirebase?.collection && window.SibaqFirebase?.getDocs) {
      try {
        const { db, collection, getDocs } = window.SibaqFirebase;
        const [studSnap, recSnap] = await Promise.all([
          getDocs(collection(db, STUDENTS_STORE)),
          getDocs(collection(db, STORE_NAME))
        ]);

        studSnap.forEach((docSnap) => {
          const data = docSnap.data();
          const cNo = String(data.chestNo || docSnap.id).trim();
          if (cNo) {
            studentsMap.set(cNo.toLowerCase(), { ...data, chestNo: cNo });
          }
        });

        recSnap.forEach((docSnap) => {
          const data = docSnap.data();
          const rId = String(data.id || docSnap.id);
          recordsMap.set(rId, { ...data, id: rId });
        });
      } catch (err) {
        console.warn('Firebase lookup note (using local admin records):', err);
      }
    }

    return {
      students: Array.from(studentsMap.values()),
      records: Array.from(recordsMap.values())
    };
  }

  // Verify chest number strictly against Admin-entered candidates/records
  async function verifyAdminCandidate(enteredCode) {
    const cleanCode = enteredCode.trim();
    const lowerCode = cleanCode.toLowerCase();
    const { students, records } = await fetchAdminData();
    const savedExams = getSavedExamsMap();

    // Find matching candidate in admin's registered students list
    let matchedStudent = students.find(
      (s) => String(s.chestNo || '').trim().toLowerCase() === lowerCode
    );

    // Also check if chest number was directly assigned in a program record
    const matchingRecordsByChest = records.filter((r) => {
      const rChest = String(r.chestNo || '').trim().toLowerCase();
      const rCand = String(r.candidate || '').trim().toLowerCase();
      return (
        rChest === lowerCode ||
        rCand.includes(`(#${lowerCode})`) ||
        rCand === lowerCode
      );
    });

    if (!matchedStudent && matchingRecordsByChest.length === 0) {
      return null; // Not registered by Admin -> deny access
    }

    const candidateName = matchedStudent
      ? matchedStudent.name
      : (matchingRecordsByChest[0].candidate || '').replace(/\s*\(#.*\)\s*$/, '').trim() || `Candidate #${cleanCode}`;

    const candidateChest = matchedStudent
      ? matchedStudent.chestNo
      : (matchingRecordsByChest[0].chestNo || cleanCode.toUpperCase());

    const candidateCategory = matchedStudent
      ? matchedStudent.category
      : (matchingRecordsByChest[0].category || 'General');

    // Collect all programs assigned to this candidate
    const lowerName = candidateName.toLowerCase();
    const assignedRecords = records.filter((r) => {
      const rChest = String(r.chestNo || '').trim().toLowerCase();
      const rCand = String(r.candidate || '').trim().toLowerCase();
      if (rChest && rChest === lowerCode) return true;
      if (rCand.includes(`(#${lowerCode})`)) return true;
      if (lowerName && rCand === lowerName) return true;
      if (lowerName && rCand.startsWith(`${lowerName} (#`)) return true;
      return false;
    });

    // Deduplicate programs for this candidate
    const uniqueEventsMap = new Map();
    assignedRecords.forEach((r) => {
      if (!r.programName) return;
      const key = makeProgramExamKey(r.programName, r.category || candidateCategory);
      const localExam = savedExams[key] || {};
      if (!uniqueEventsMap.has(key)) {
        uniqueEventsMap.set(key, {
          recordId: r.id,
          name: r.programName,
          category: r.category || candidateCategory,
          examQuestion: r.examQuestion || localExam.examQuestion || '',
          examDuration: r.examDuration || localExam.examDuration || '',
          examDescription: r.examDescription || localExam.examDescription || '',
          examQuestions: Array.isArray(r.examQuestions) && r.examQuestions.length > 0
            ? r.examQuestions
            : (Array.isArray(localExam.examQuestions) ? localExam.examQuestions : []),
          examLocked: Boolean(r.examLocked),
          examStatus: r.examStatus || '',
          lockReason: r.lockReason || '',
          reopenCount: Number(r.reopenCount || 0),
          savedAnswers: r.savedAnswers || {},
          status: r.examLocked ? 'completed' : 'ready'
        });
      }
    });

    return {
      chestNo: candidateChest,
      name: candidateName,
      regId: `SBQ-${candidateChest}`,
      category: candidateCategory,
      institution: 'Darul Huda Sibaq \'26',
      events: Array.from(uniqueEventsMap.values())
    };
  }

  if (chestForm) {
    chestForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearErrors();

      const rawVal = chestInput ? chestInput.value.trim() : '';
      const cleanVal = rawVal.replace(/^#/, '').trim();

      if (!cleanVal) {
        chestError.textContent = 'Please enter your Admin-assigned chest number (e.g. A10).';
        chestError.classList.add('active');
        chestInput.closest('.input-wrapper').classList.add('error');
        return;
      }

      submitBtn.classList.add('loading');
      submitBtn.disabled = true;

      try {
        const participant = await verifyAdminCandidate(cleanVal);

        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;

        if (!participant) {
          chestError.textContent = `Chest code "${cleanVal.toUpperCase()}" is not registered by Admin.`;
          chestError.classList.add('active');
          chestInput.closest('.input-wrapper').classList.add('error');
          showAlert('Access Denied: Only chest numbers entered by Admin can access the candidate portal.', 'error');
          return;
        }

        // Store verified participant session
        sessionStorage.setItem('sibaq_participant', JSON.stringify(participant));
        showAlert(`Verified Chest #${participant.chestNo} (${participant.name})! Redirecting...`, 'success');

        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 450);
      } catch (err) {
        console.error('Error verifying chest number:', err);
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
        showAlert('Could not verify chest number. Please try again.', 'error');
      }
    });
  }
});
