(function () {
  "use strict";
  // ════════════════════════════════════════════════════
  //  STATE
  // ═════════════════════════════════════════════════╗
  let currentUser = null; // { name, email, org, subject }
  let classes = []; // [{ id, name, emoji, subjects:[] }]
  let allStudents = {}; // { classId: [{ id, name, subjects:[] }] }
  let settings = {}; // per-user settings
  let allMaterials = {}; // { classId: [ { id, title, desc, subjectTag, type, date, size, dataUrl, htmlContent, url } ] }
  let allAttendance = {}; // { classId: { date: { studentId: 'P'|'A'|'L' } } }
  let allQuizzes = {}; // { classId: [ quiz ] }
  let termHistory = {}; // { classId: [ { id, term, session, savedAt, students, subjects } ] }

  let activeClassId = null;
  let activeSubjectId = null;
  let activeView = "grades";
  let selectedStudentIds = new Set();
  let sortAsc = false;
  let sortByNameAsc = true;
  let classToDelete = null;
  let renameStudentId = null;
  let scoreChart = null;
  let sidebarCollapsed = false;
  let viewingMaterialId = null;
  let currentMaterialFilter = "all";
  let sessionCheckTimer = null;
  let sessionActivityBound = false;
  let lastSessionActivityWrite = 0;
  let aiSessionKey = "";
  let portalSelectedRole = "staff";
  let pendingExcelImportData = null; // Temporary holder for parsed Excel data before subject selection

  // ════════════════════════════════════════════════════
  //  STORAGE KEYS (per user)
  // ════════════════════════════════════════════════════
  // ── HTML escape helper — use on ALL user-supplied data in innerHTML ──
  function esc(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function userKey(k) {
    const email = currentUser?.email || "guest";
    return `gf_${email}_${k}`;
  }

  function normalizeRole(rawRole) {
    const role = String(rawRole || "teacher").toLowerCase();
    if (["teacher", "staff", "student", "parent", "admin"].includes(role)) {
      return role;
    }
    return "teacher";
  }

  function roleLabel(role) {
    const normalized = normalizeRole(role);
    const labels = {
      teacher: "Teachers",
      staff: "Admin & Staff",
      student: "Students",
      parent: "Parents",
      admin: "Super Admin",
    };
    return labels[normalized] || "Teachers";
  }

  function ensureCurrentUserRole() {
    if (!currentUser) return;
    currentUser.role = normalizeRole(currentUser.role);
  }

  // ── Permission checks ─────────────────────────────────────────────────
  function canEditGrades() {
    if (!currentUser) return false;
    const role = normalizeRole(currentUser.role);
    return role === "teacher" || role === "staff" || role === "admin";
  }

  function canViewGrades() {
    if (!currentUser) return false;
    const role = normalizeRole(currentUser.role);
    return role === "teacher" || role === "staff" || role === "admin";
  }

  function canDeleteStudent() {
    if (!currentUser) return false;
    const role = normalizeRole(currentUser.role);
    return role === "teacher" || role === "admin";
  }

  // ── Navigation gating (role-based sidebar visibility) ─────────────────
  function gateNavigation() {
    if (!currentUser) return;
    const role = normalizeRole(currentUser.role);
    const isTeacher =
      role === "teacher" || role === "staff" || role === "admin";

    // Teacher/staff/admin get full access; others get restricted view
    const restrictedItems = [
      "nav-grades",
      "nav-analytics",
      "nav-students",
      "nav-materials",
      "nav-attendance",
      "nav-cbt",
      "nav-history",
      "nav-settings",
    ];

    if (!isTeacher) {
      // For non-teachers, hide all teacher workspace items
      restrictedItems.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
      });
      // Also hide the "Your Classes" section
      const classLabel = document.querySelector(".sidebar-section-label");
      const classList = document.querySelector(".sidebar-classes");
      const newClassBtn = document.querySelector(".sidebar-new-class");
      if (classLabel) classLabel.style.display = "none";
      if (classList) classList.style.display = "none";
      if (newClassBtn) newClassBtn.style.display = "none";
    } else {
      // Teachers get full sidebar
      restrictedItems.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = "";
      });
      const classLabel = document.querySelector(".sidebar-section-label");
      const classList = document.querySelector(".sidebar-classes");
      const newClassBtn = document.querySelector(".sidebar-new-class");
      if (classLabel) classLabel.style.display = "";
      if (classList) classList.style.display = "";
      if (newClassBtn) newClassBtn.style.display = "";
    }
  }

  // ── Security helpers (Web Crypto with graceful fallback) ───────────────
  function _toHex(bytes) {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  function _fromHex(hex) {
    const arr = new Uint8Array(hex.length / 2);
    for (let i = 0; i < arr.length; i++) {
      arr[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return arr;
  }
  async function _sha256Hex(str) {
    try {
      if (!window.crypto?.subtle) return "legacy-" + simpleHash(str);
      const bytes = new TextEncoder().encode(str);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return _toHex(new Uint8Array(digest));
    } catch {
      return "legacy-" + simpleHash(str);
    }
  }
  function _bytesToB64(bytes) {
    let bin = "";
    bytes.forEach((b) => {
      bin += String.fromCharCode(b);
    });
    return btoa(bin);
  }
  function _b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function _deriveBackupKey(passphrase, salt, iterations) {
    const base = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(passphrase),
      { name: "PBKDF2" },
      false,
      ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations,
        hash: "SHA-256",
      },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  }
  async function _encryptBackupObject(obj, passphrase) {
    const iterations = 150000;
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await _deriveBackupKey(passphrase, salt, iterations);
    const plain = new TextEncoder().encode(JSON.stringify(obj));
    const cipherBuf = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      plain,
    );
    const cipherB64 = _bytesToB64(new Uint8Array(cipherBuf));
    return {
      version: 3,
      encrypted: true,
      algorithm: "AES-GCM",
      kdf: "PBKDF2-SHA256",
      iterations,
      salt: _bytesToB64(salt),
      iv: _bytesToB64(iv),
      ciphertext: cipherB64,
      checksum: await _sha256Hex(cipherB64),
      checksumAlg: "SHA-256",
      date: new Date().toISOString(),
      exportedBy: currentUser?.name || "",
      school: settings.pdfSchool || currentUser?.org || "",
    };
  }
  async function _decryptBackupEnvelope(envelope, passphrase) {
    const iv = _b64ToBytes(envelope.iv || "");
    const salt = _b64ToBytes(envelope.salt || "");
    const cipher = _b64ToBytes(envelope.ciphertext || "");
    const key = await _deriveBackupKey(
      passphrase,
      salt,
      parseInt(String(envelope.iterations || "150000"), 10) || 150000,
    );
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      cipher,
    );
    return JSON.parse(new TextDecoder().decode(plain));
  }
  async function _createPasswordRecord(password) {
    const iterations = 120000;
    try {
      if (!window.crypto?.subtle) {
        return `legacy$${simpleHash(password)}`;
      }
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveBits"],
      );
      const bits = await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt,
          iterations,
          hash: "SHA-256",
        },
        key,
        256,
      );
      return `pbkdf2$${iterations}$${_toHex(salt)}$${_toHex(new Uint8Array(bits))}`;
    } catch {
      return `legacy$${simpleHash(password)}`;
    }
  }
  async function _verifyPassword(email, password) {
    const key = `gf_pass_${email}`;
    const stored = localStorage.getItem(key);

    // Very old accounts may not have any password hash yet.
    if (!stored) {
      const migrated = await _createPasswordRecord(password);
      safeSave(key, migrated);
      return true;
    }

    // New PBKDF2 format
    if (stored.startsWith("pbkdf2$")) {
      try {
        const [, iterStr, saltHex, hashHex] = stored.split("$");
        const iterations = parseInt(iterStr, 10) || 120000;
        const keyMat = await crypto.subtle.importKey(
          "raw",
          new TextEncoder().encode(password),
          { name: "PBKDF2" },
          false,
          ["deriveBits"],
        );
        const bits = await crypto.subtle.deriveBits(
          {
            name: "PBKDF2",
            salt: _fromHex(saltHex),
            iterations,
            hash: "SHA-256",
          },
          keyMat,
          256,
        );
        return _toHex(new Uint8Array(bits)) === hashHex;
      } catch {
        return false;
      }
    }

    // Mid format fallback
    if (stored.startsWith("legacy$")) {
      const ok = stored.slice(7) === simpleHash(password);
      if (ok) {
        const upgraded = await _createPasswordRecord(password);
        safeSave(key, upgraded);
      }
      return ok;
    }

    // Original plain simpleHash format fallback and migration
    const okLegacy = stored === simpleHash(password);
    if (okLegacy) {
      const upgraded = await _createPasswordRecord(password);
      safeSave(key, upgraded);
    }
    return okLegacy;
  }

  // ── Session management (idle + max age) ─────────────────────────────────
  const SESSION_IDLE_MS = 30 * 60 * 1000;
  const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;
  const SESSION_CHECK_MS = 60 * 1000;
  const SESSION_EVENTS = [
    "click",
    "keydown",
    "mousemove",
    "touchstart",
    "scroll",
  ];
  function _sessionKey(kind) {
    const email = currentUser?.email || "guest";
    return `gf_session_${kind}_${email}`;
  }
  function _recordSessionActivity() {
    if (!currentUser) return;
    const now = Date.now();
    // Avoid excessive storage writes from high-frequency events.
    if (now - lastSessionActivityWrite < 15000) return;
    safeSave(_sessionKey("lastActivity"), String(now));
    lastSessionActivityWrite = now;
  }
  function _clearSessionMeta() {
    if (!currentUser) return;
    localStorage.removeItem(_sessionKey("lastActivity"));
    localStorage.removeItem(_sessionKey("expiresAt"));
  }
  function _forceSessionLogout(reason) {
    saveData();
    saveMaterials();
    if (scoreChart) {
      try {
        scoreChart.destroy();
      } catch (e) {}
      scoreChart = null;
    }
    _stopSessionMonitor();
    _clearSessionMeta();
    currentUser = null;
    activeClassId = null;
    activeSubjectId = null;
    localStorage.removeItem("gf_current_user");
    showPage("landing");
    showToast(reason || "Session ended. Please log in again.", "info");
  }
  function _validateSession() {
    if (!currentUser) return;
    const now = Date.now();
    const last = parseInt(
      localStorage.getItem(_sessionKey("lastActivity")) || "0",
      10,
    );
    const expiresAt = parseInt(
      localStorage.getItem(_sessionKey("expiresAt")) || "0",
      10,
    );

    if (expiresAt && now >= expiresAt) {
      _forceSessionLogout("Session expired for security. Please log in again.");
      return;
    }
    if (last && now - last >= SESSION_IDLE_MS) {
      _forceSessionLogout("Logged out after inactivity for security.");
    }
  }
  function _onSessionActivity() {
    _recordSessionActivity();
  }
  function _startSessionMonitor() {
    if (!currentUser) return;
    const now = Date.now();
    safeSave(_sessionKey("lastActivity"), String(now));
    safeSave(_sessionKey("expiresAt"), String(now + SESSION_MAX_AGE_MS));

    if (!sessionActivityBound) {
      SESSION_EVENTS.forEach((ev) =>
        window.addEventListener(ev, _onSessionActivity, { passive: true }),
      );
      sessionActivityBound = true;
    }
    if (sessionCheckTimer) clearInterval(sessionCheckTimer);
    sessionCheckTimer = setInterval(_validateSession, SESSION_CHECK_MS);
  }
  function _stopSessionMonitor() {
    if (sessionCheckTimer) {
      clearInterval(sessionCheckTimer);
      sessionCheckTimer = null;
    }
    if (sessionActivityBound) {
      SESSION_EVENTS.forEach((ev) =>
        window.removeEventListener(ev, _onSessionActivity),
      );
      sessionActivityBound = false;
    }
  }
  function _consentKey(email) {
    return `gf_consent_${email}`;
  }
  function _hasConsent(email) {
    if (!email) return false;
    return localStorage.getItem(_consentKey(email)) === "accepted";
  }
  function _setConsentAccepted(email) {
    if (!email) return;
    safeSave(_consentKey(email), "accepted");
    safeSave(`gf_consent_at_${email}`, new Date().toISOString());
  }
  // ── Safe localStorage write — catches QuotaExceededError ──────────────
  function safeSave(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (e) {
      if (
        e instanceof DOMException &&
        (e.code === 22 ||
          e.code === 1014 ||
          e.name === "QuotaExceededError" ||
          e.name === "NS_ERROR_DOM_QUOTA_REACHED")
      ) {
        // Storage full — try freeing space then retry once
        _freeStorageSpace();
        try {
          localStorage.setItem(key, value);
        } catch (e2) {
          showToast(
            "⚠️ Storage full! Please export a backup and delete old data to continue.",
            "error",
          );
        }
      }
    }
  }
  // Frees space by trimming the heaviest optional data first
  function _freeStorageSpace() {
    // 1. Strip logo dataUrl (often 50–200 KB)
    if (settings && settings.logoDataUrl) {
      settings.logoDataUrl = "";
      try {
        localStorage.setItem(userKey("settings"), JSON.stringify(settings));
      } catch (e) {}
    }
    // 2. Trim oldest term history snapshots down to 2 most recent per class
    let freed = false;
    Object.keys(termHistory || {}).forEach((cid) => {
      if ((termHistory[cid] || []).length > 2) {
        termHistory[cid] = termHistory[cid].slice(0, 2);
        freed = true;
      }
    });
    if (freed) {
      try {
        localStorage.setItem(
          userKey("termHistory"),
          JSON.stringify(termHistory),
        );
      } catch (e) {}
    }
    // 3. Strip base64 dataUrls from materials (largest items) — keep metadata only
    let matFreed = false;
    Object.keys(allMaterials || {}).forEach((cid) => {
      (allMaterials[cid] || []).forEach((m) => {
        if (m.dataUrl && m.dataUrl.length > 5000) {
          m.dataUrl = "";
          m._stripped = true;
          matFreed = true;
        }
      });
    });
    if (matFreed) {
      try {
        localStorage.setItem(
          userKey("materials"),
          JSON.stringify(allMaterials),
        );
      } catch (e) {}
      showToast(
        "⚠️ Storage was nearly full — some material previews were cleared. Export a backup.",
        "warning",
      );
    }
  }

  function saveData() {
    if (!currentUser) return;
    safeSave(userKey("classes"), JSON.stringify(classes));
    safeSave(userKey("students"), JSON.stringify(allStudents));
    safeSave(userKey("settings"), JSON.stringify(settings));
    if (window.GradeFlowAPI) {
      window.GradeFlowAPI.saveUserData({
        email: currentUser.email,
        classes,
        allStudents,
        settings,
      }).catch(() => {});
    }
  }
  function saveTermHistory() {
    if (!currentUser) return;
    safeSave(userKey("termHistory"), JSON.stringify(termHistory));
  }
  function saveMaterials() {
    if (!currentUser) return;
    safeSave(userKey("materials"), JSON.stringify(allMaterials));
  }
  function saveAttendance() {
    if (!currentUser) return;
    safeSave(userKey("attendance"), JSON.stringify(allAttendance));
  }
  function saveQuizzes() {
    if (!currentUser) return;
    safeSave(userKey("quizzes"), JSON.stringify(allQuizzes));
  }
  function loadUserData() {
    const savedClasses = localStorage.getItem(userKey("classes"));
    const savedStudents = localStorage.getItem(userKey("students"));
    const savedSettings = localStorage.getItem(userKey("settings"));
    const savedMaterials = localStorage.getItem(userKey("materials"));
    // New accounts start with empty state; demo data only loads for demo mode
    const isNewAccount = !savedClasses;
    classes = savedClasses ? JSON.parse(savedClasses) : [];
    allStudents = savedStudents ? JSON.parse(savedStudents) : {};
    settings = savedSettings ? JSON.parse(savedSettings) : getDefaultSettings();
    allMaterials = savedMaterials ? JSON.parse(savedMaterials) : {};
    classes.forEach((c) => {
      if (!c.subjects) c.subjects = [];
      if (!c.emoji) c.emoji = "📚";
    });
    const savedAtt = localStorage.getItem(userKey("attendance"));
    allAttendance = savedAtt ? JSON.parse(savedAtt) : {};
    const savedQz = localStorage.getItem(userKey("quizzes"));
    allQuizzes = savedQz ? JSON.parse(savedQz) : {};
    const savedTH = localStorage.getItem(userKey("termHistory"));
    termHistory = savedTH ? JSON.parse(savedTH) : {};
  }
  function getDefaultClasses() {
    return [
      {
        id: "cls1",
        name: "PRY 5 RED",
        emoji: "🔴",
        subjects: [
          { id: "sub1", name: "Mathematics" },
          { id: "sub2", name: "English" },
        ],
      },
      {
        id: "cls2",
        name: "PRY 5 BLUE",
        emoji: "🔵",
        subjects: [{ id: "sub3", name: "Mathematics" }],
      },
      {
        id: "cls3",
        name: "PRY 5 WHITE",
        emoji: "⚪",
        subjects: [{ id: "sub4", name: "Mathematics" }],
      },
    ];
  }
  function getDefaultStudents(cls) {
    return {
      cls1: [
        {
          id: "s1",
          name: "Abakpa Fortune",
          subjects: [
            { id: "sub1", name: "Mathematics", test: 15, prac: 18, exam: "" },
            { id: "sub2", name: "English", test: 12, prac: 14, exam: "" },
          ],
        },
        {
          id: "s2",
          name: "John Psalms",
          subjects: [
            { id: "sub1", name: "Mathematics", test: 18, prac: 19, exam: 50 },
            { id: "sub2", name: "English", test: 17, prac: 18, exam: 45 },
          ],
        },
        {
          id: "s3",
          name: "Amaka Chukwu",
          subjects: [
            { id: "sub1", name: "Mathematics", test: 14, prac: 12, exam: 40 },
            { id: "sub2", name: "English", test: 16, prac: 15, exam: 38 },
          ],
        },
      ],
      cls2: [],
      cls3: [],
    };
  }
  function getDefaultSettings() {
    return {
      pdfSchool: "",
      term: "Second Term",
      session: "2025/2026",
      motto: "",
      darkMode: false,
      gradeScale: null,
      logoDataUrl: "",
    };
  }

  // ════════════════════════════════════════════════════
  //  COMPUTATION ENGINE
  // ════════════════════════════════════════════════════
  function computeSubject(sub) {
    const t = Math.min(parseFloat(sub.test) || 0, 20);
    const p = Math.min(parseFloat(sub.prac) || 0, 20);
    if (sub.exam === "" || sub.exam === null || sub.exam === undefined)
      return { total: null, t, p, e: null };
    const e = Math.min(parseFloat(sub.exam) || 0, 60);
    return { total: t + p + e, t, p, e };
  }
  const DEFAULT_GRADE_SCALE = [
    { g: "A", min: 70, r: "Excellent", cls: "g-A" },
    { g: "B", min: 60, r: "Very Good", cls: "g-B" },
    { g: "C", min: 50, r: "Good", cls: "g-C" },
    { g: "D", min: 45, r: "Fair", cls: "g-D" },
    { g: "E", min: 40, r: "Pass", cls: "g-E" },
    { g: "F", min: 0, r: "Fail", cls: "g-F" },
  ];
  function getGradeScale() {
    return settings.gradeScale && settings.gradeScale.length >= 6
      ? settings.gradeScale
      : DEFAULT_GRADE_SCALE;
  }
  function gradeResult(total) {
    if (total === null || total === "" || total === undefined || isNaN(total))
      return { g: "—", r: "Pending", cls: "g-none" };
    for (const e of getGradeScale()) {
      if (total >= e.min) return e;
    }
    return getGradeScale().at(-1);
  }
  function computeStudentOverall(student) {
    if (!student.subjects || !student.subjects.length) return null;
    let sum = 0,
      count = 0;
    student.subjects.forEach((sub) => {
      const c = computeSubject(sub);
      if (c.total !== null) {
        sum += c.total;
        count++;
      }
    });
    return count ? Math.round(sum / count) : null;
  }
  function rankStudents(students) {
    const withOverall = students.map((s) => ({
      ...s,
      overall: computeStudentOverall(s),
    }));
    const graded = withOverall
      .filter((s) => s.overall !== null)
      .sort((a, b) => b.overall - a.overall);
    let rank = 1;
    graded.forEach((s, i) => {
      if (i > 0 && s.overall < graded[i - 1].overall) rank = i + 1;
      s.pos = rank;
    });
    const ungraded = withOverall
      .filter((s) => s.overall === null)
      .map((s) => ({ ...s, pos: null }));
    return [...graded, ...ungraded];
  }
  function ordinal(n) {
    if (!n) return "—";
    const s = ["th", "st", "nd", "rd"],
      v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  function initials(name) {
    return name
      .split(" ")
      .slice(0, 2)
      .map((n) => n[0]?.toUpperCase() || "")
      .join("");
  }
  function barColor(total) {
    const g = gradeResult(total).g;
    if (g === "A") return "#00b894";
    if (g === "B" || g === "C") return "#4361ee";
    if (g === "D" || g === "E") return "#f9a825";
    return "#ef476f";
  }

  // ════════════════════════════════════════════════════
  //  TOAST
  // ════════════════════════════════════════════════════
  window.showToast = function (msg, type = "info", icon = "") {
    const container = document.getElementById("toastContainer");
    const t = document.createElement("div");
    const icons = {
      success: "bi-check-circle-fill",
      error: "bi-x-circle-fill",
      info: "bi-info-circle-fill",
      warning: "bi-exclamation-triangle-fill",
    };
    t.className = `toast ${type}`;
    t.innerHTML = `<i class="bi ${icons[type] || icons.info}"></i> ${msg}`;
    container.appendChild(t);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        t.classList.add("show");
      });
    });
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => container.removeChild(t), 500);
    }, 3000);
  };

  // ════════════════════════════════════════════════════
  //  LOADING
  // ════════════════════════════════════════════════════
  function showLoading(msg = "Processing...") {
    document.getElementById("loadingMsg").textContent = msg;
    document.getElementById("loadingOverlay").classList.add("active");
  }
  function hideLoading() {
    document.getElementById("loadingOverlay").classList.remove("active");
  }

  // ════════════════════════════════════════════════════
  //  PAGE SWITCHING
  // ════════════════════════════════════════════════════
  function showPage(page) {
    // Clear active class AND any inline display styles on every page
    // so CSS display rules always win (inline styles override CSS otherwise)
    document.querySelectorAll(".page").forEach(function (p) {
      p.classList.remove("active");
      p.style.removeProperty("display");
    });
    document.getElementById("page-" + page).classList.add("active");

    if (page === "landing") {
      // Lock body scroll so dashboard DOM cannot bleed through landing
      document.body.classList.add("on-landing");
      // Scroll the landing page container back to top on every visit
      var landingEl = document.getElementById("page-landing");
      if (landingEl) landingEl.scrollTop = 0;
      // Fix anchor links: since landing is its own scroll container,
      // native href="#section" scrolls body not the container — intercept
      _fixLandingNavLinks();
      updateOnlineStatus();
    } else if (page === "login" || page === "portal-login") {
      document.body.classList.add("on-landing");
      const el = document.getElementById("page-" + page);
      if (el) el.scrollTop = 0;
    } else {
      document.body.classList.remove("on-landing");
    }
  }

  // ════════════════════════════════════════════════════
  //  VIEW SWITCHING
  // ════════════════════════════════════════════════════
  window.switchView = function (view) {
    activeView = view;
    document
      .querySelectorAll(".view")
      .forEach((v) => v.classList.remove("active"));
    document.getElementById(`view-${view}`).classList.add("active");
    document
      .querySelectorAll(".sidebar-nav-item")
      .forEach((n) => n.classList.remove("active"));
    document.getElementById(`nav-${view}`)?.classList.add("active");
    const titles = {
      grades: "Grade Sheet",
      analytics: "Analytics",
      students: "Student Cards",
      settings: "Settings",
      materials: "Class Materials",
      attendance: "Attendance",
      cbt: "CBT Quizzes",
      history: "Term History",
    };
    document.getElementById("topbarTitle").textContent = titles[view] || "";
    if (view === "analytics") renderAnalytics();
    if (view === "students") renderStudentCards();
    if (view === "settings") {
      loadSettings();
      renderSubscriptionPanel();
    }
    if (view === "materials") renderMaterials();
    if (view === "attendance") renderAttendance();
    if (view === "cbt") renderCBT();
    if (view === "history") renderTermHistory();
  };

  // ════════════════════════════════════════════════════
  //  SIDEBAR
  // ════════════════════════════════════════════════════
  window.toggleSidebar = function () {
    sidebarCollapsed = !sidebarCollapsed;
    document
      .getElementById("appSidebar")
      .classList.toggle("collapsed", sidebarCollapsed);
    document.getElementById("sidebarToggleIcon").className = sidebarCollapsed
      ? "bi bi-layout-sidebar"
      : "bi bi-layout-sidebar-reverse";
    updateBatchBarPosition();
  };
  window.toggleMobileSidebar = function () {
    ensureSidebarOverlay();
    const sidebar = document.getElementById("appSidebar");
    const isOpen = sidebar.classList.toggle("open");
    const overlay = document.getElementById("sidebarOverlay");
    if (overlay) overlay.classList.toggle("active", isOpen);
  };

  // ════════════════════════════════════════════════════
  //  RENDER SIDEBAR CLASSES
  // ════════════════════════════════════════════════════
  function renderSidebarClasses() {
    const container = document.getElementById("sidebarClassList");
    if (!classes.length) {
      container.innerHTML = `<div style="padding:.5rem .8rem; font-size:.8rem; color:var(--muted);">No classes yet. Add one above.</div>`;
      return;
    }
    container.innerHTML = classes
      .map((c) => {
        const count = (allStudents[c.id] || []).length;
        return `<div class="class-item ${c.id === activeClassId ? "active" : ""}" onclick="selectClass('${c.id}')">
        <span class="class-emoji">${c.emoji || "📚"}</span>
        <span class="class-item-name">${esc(c.name)}</span>
        <span class="class-item-count">${count}</span>
        <button class="class-delete-btn" onclick="event.stopPropagation(); openDeleteClassModal('${c.id}')" title="Delete class"><i class="bi bi-trash3"></i></button>
      </div>`;
      })
      .join("");
  }

  // ════════════════════════════════════════════════════
  //  CLASS SELECTION
  // ════════════════════════════════════════════════════
  window.selectClass = function (id) {
    activeClassId = id;
    const cls = classes.find((c) => c.id === id);
    activeSubjectId = cls?.subjects?.[0]?.id || null;
    selectedStudentIds.clear();
    renderSidebarClasses();
    renderSubjectTabs();
    renderTable();
    updateStats();
    updateTopbarBreadcrumb();
    if (activeView === "analytics") renderAnalytics();
    if (activeView === "students") renderStudentCards();
    if (activeView === "materials") renderMaterials();
    if (activeView === "attendance") renderAttendance();
    if (activeView === "cbt") renderCBT();
    document.getElementById("activeClassName").innerHTML =
      `<i class="bi bi-folder2-open"></i> ${esc(cls?.name || "")}`;
    const attEl2 = document.getElementById("attendanceClassName");
    const cbtEl2 = document.getElementById("cbtClassName");
    if (attEl2) attEl2.textContent = cls?.name || "";
    if (cbtEl2) cbtEl2.textContent = cls?.name || "";
    document.getElementById("analyticsClassName").textContent = cls?.name || "";
    document.getElementById("materialsClassName").textContent = cls?.name || "";
    document.getElementById("addStudentSub").textContent =
      `Add a student to ${cls?.name || "active class"}`;
  };

  function updateTopbarBreadcrumb() {
    const cls = classes.find((c) => c.id === activeClassId);
    const sub = cls?.subjects?.find((s) => s.id === activeSubjectId);
    document.getElementById("topbarBreadcrumb").textContent = cls
      ? `/ ${cls.name}${sub ? " / " + sub.name : ""}`
      : "";
  }

  // ════════════════════════════════════════════════════
  //  SUBJECT TABS
  // ════════════════════════════════════════════════════
  function renderSubjectTabs() {
    const cls = classes.find((c) => c.id === activeClassId);
    const container = document.getElementById("subjectTabs");
    if (!cls || !cls.subjects.length) {
      container.innerHTML = "";
      return;
    }
    container.innerHTML = cls.subjects
      .map(
        (s) => `
      <div class="subject-tab ${s.id === activeSubjectId ? "active" : ""}" onclick="changeSubject('${s.id}')">
        ${s.name}
        ${cls.subjects.length > 1 ? `<span style="margin-left:.4rem; font-size:.7rem; opacity:.6; cursor:pointer;" onclick="event.stopPropagation(); removeSubject('${s.id}')">✕</span>` : ""}
      </div>`,
      )
      .join("");
  }
  window.changeSubject = function (subId) {
    activeSubjectId = subId;
    renderSubjectTabs();
    renderTable();
    updateTopbarBreadcrumb();
  };
  window.removeSubject = function (subId) {
    const cls = classes.find((c) => c.id === activeClassId);
    if (!cls || cls.subjects.length <= 1) {
      showToast("Cannot remove the last subject", "error");
      return;
    }
    cls.subjects = cls.subjects.filter((s) => s.id !== subId);
    (allStudents[activeClassId] || []).forEach((s) => {
      s.subjects = s.subjects.filter((sub) => sub.id !== subId);
    });
    if (activeSubjectId === subId) activeSubjectId = cls.subjects[0].id;
    renderSubjectTabs();
    renderTable();
    saveData();
    showToast("Subject removed", "info");
  };

  // ════════════════════════════════════════════════════
  //  RENDER TABLE
  // ════════════════════════════════════════════════════
  function renderTable() {
    const cls = classes.find((c) => c.id === activeClassId);
    const tbody = document.getElementById("scoreBody");
    if (!cls || !activeSubjectId) {
      tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><div class="empty-icon">📋</div><h3>No class selected</h3><p>Pick a class from the sidebar or create a new one.</p><button class="btn btn-primary btn-sm" onclick="openAddClassModal()"><i class="bi bi-plus"></i> New Class</button></div></td></tr>`;
      return;
    }
    const students = allStudents[activeClassId] || [];
    if (!students.length) {
      tbody.innerHTML = `<tr><td colspan="10"><div class="empty-state"><div class="empty-icon">👤</div><h3>No students yet</h3><p>Add students manually or import from Excel.</p><button class="btn btn-primary btn-sm" onclick="openAddStudentModal()"><i class="bi bi-person-plus"></i> Add Student</button></div></td></tr>`;
      return;
    }
    let ranked = rankStudents(students);
    if (sortAsc) ranked = [...ranked].reverse();
    tbody.innerHTML = ranked
      .map((s) => {
        const sub = s.subjects.find((sub) => sub.id === activeSubjectId) || {
          test: 0,
          prac: 0,
          exam: "",
          total: null,
        };
        const comp = computeSubject(sub);
        const grade = gradeResult(comp.total);
        const totalDisplay = comp.total !== null ? comp.total : "—";
        const posDisplay = s.pos ? ordinal(s.pos) : "—";
        const bw = comp.total !== null ? comp.total : 0;
        const bc = barColor(comp.total);
        const posCls =
          s.pos === 1
            ? "pos-1"
            : s.pos === 2
              ? "pos-2"
              : s.pos === 3
                ? "pos-3"
                : "";
        const ini = initials(s.name);
        const checked = selectedStudentIds.has(s.id);
        const canEdit = canEditGrades();
        const scoreInputs = canEdit
          ? `<td><input type="number" min="0" max="20" value="${sub.test ?? 0}" class="score-input" onchange="updateScore('${s.id}','${activeSubjectId}','test',this)" title="Test score (max 20)"/></td>
        <td><input type="number" min="0" max="20" value="${sub.prac ?? 0}" class="score-input" onchange="updateScore('${s.id}','${activeSubjectId}','prac',this)" title="Practical score (max 20)"/></td>
        <td><input type="number" min="0" max="60" value="${sub.exam === "" ? "" : sub.exam}" class="score-input" style="width:80px;" onchange="updateScore('${s.id}','${activeSubjectId}','exam',this)" placeholder="—" title="Exam score (max 60)"/></td>`
          : `<td style="text-align:center; font-family:var(--font-mono); color:var(--muted);">${sub.test ?? "—"}</td>
        <td style="text-align:center; font-family:var(--font-mono); color:var(--muted);">${sub.prac ?? "—"}</td>
        <td style="text-align:center; font-family:var(--font-mono); color:var(--muted);">${sub.exam === "" ? "—" : sub.exam}</td>`;
        const actionButtons = canEdit
          ? `<button class="btn btn-xs" onclick="viewStudentDetail('${s.id}')" title="View details"><i class="bi bi-eye"></i></button>
            <button class="btn btn-xs btn-primary" onclick="exportStudentPDF('${s.id}')" title="Generate PDF"><i class="bi bi-file-pdf"></i></button>
            <button class="btn btn-xs" onclick="openRenameStudent('${s.id}')" title="Rename"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-xs btn-danger" onclick="deleteStudent('${s.id}')" title="Delete"><i class="bi bi-trash3"></i></button>`
          : `<button class="btn btn-xs" onclick="viewStudentDetail('${s.id}')" title="View details"><i class="bi bi-eye"></i></button>
            <button class="btn btn-xs btn-primary" onclick="exportStudentPDF('${s.id}')" title="Generate PDF"><i class="bi bi-file-pdf"></i></button>`;

        return `<tr class="${checked ? "selected" : ""}">
        <td ${canEdit ? "" : 'style="display:none;"'}><input type="checkbox" style="accent-color:var(--accent);width:16px;height:16px;" ${checked ? "checked" : ""} onchange="handleCheck('${s.id}',this.checked)"/></td>
        <td>
          <div class="student-name-cell">
            <div class="student-mini-avatar">${esc(ini)}</div>
            <span class="student-name td-name">${esc(s.name)}</span>
          </div>
        </td>
        ${scoreInputs}
        <td>
          <div class="score-bar-wrap">
            <span class="score-val">${totalDisplay}</span>
            <div class="score-bar"><div class="score-bar-fill" style="width:${bw}%;background:${bc};"></div></div>
          </div>
        </td>
        <td><span class="grade-pill ${grade.cls}">${grade.g}</span></td>
        <td style="color:var(--muted); font-size:.83rem;">${grade.r}</td>
        <td><span class="pos-badge ${posCls}">${posCls === "pos-1" ? "🏆" : posCls === "pos-2" ? "🥈" : posCls === "pos-3" ? "🥉" : ""}${posDisplay}</span></td>
        <td>
          <div style="display:flex; gap:.3rem;">
            ${actionButtons}
          </div>
        </td>
      </tr>`;
      })
      .join("");
    updateBatchBar();
    updateStats();
  }

  // ════════════════════════════════════════════════════
  //  SCORE UPDATE
  // ════════════════════════════════════════════════════
  window.updateScore = function (studentId, subjectId, field, el) {
    const max = field === "exam" ? 60 : 20;
    const val = el.value;
    const num = parseFloat(val);
    if (val !== "" && (isNaN(num) || num < 0 || num > max)) {
      el.classList.add("error");
      showToast(`⚠ Max ${field} score is ${max}`, "error");
      return;
    }
    el.classList.remove("error");
    const student = (allStudents[activeClassId] || []).find(
      (s) => s.id === studentId,
    );
    if (!student) return;
    let sub = student.subjects.find((s) => s.id === subjectId);
    if (!sub) {
      const cls = classes.find((c) => c.id === activeClassId);
      const subDef = cls?.subjects.find((s) => s.id === subjectId);
      if (!subDef) return;
      sub = {
        id: subjectId,
        name: subDef.name,
        test: 0,
        prac: 0,
        exam: "",
        total: null,
      };
      student.subjects.push(sub);
    }
    sub[field] = val === "" ? "" : num;
    renderTable();
    saveData();
  };

  // ════════════════════════════════════════════════════
  //  STATS
  // ════════════════════════════════════════════════════
  function updateStats() {
    document.getElementById("statClasses").textContent = classes.length;
    document.getElementById("statStudents").textContent =
      Object.values(allStudents).flat().length;
    const students = allStudents[activeClassId] || [];
    const ranked = rankStudents(students);
    const graded = ranked.filter((s) => s.overall !== null);
    const avg = graded.length
      ? Math.round(graded.reduce((a, s) => a + s.overall, 0) / graded.length) +
        "%"
      : "—";
    const pass = graded.filter((s) => s.overall >= 40).length;
    const pr = graded.length
      ? Math.round((pass / graded.length) * 100) + "%"
      : "—";
    document.getElementById("statAvg").textContent = avg;
    document.getElementById("statPass").textContent = pr;
  }

  // ════════════════════════════════════════════════════
  //  SELECTION / BATCH
  // ════════════════════════════════════════════════════
  window.handleCheck = function (id, checked) {
    if (checked) selectedStudentIds.add(id);
    else selectedStudentIds.delete(id);
    updateBatchBar();
    renderTable();
  };
  window.selectAll = function (master) {
    const students = allStudents[activeClassId] || [];
    students.forEach((s) => {
      if (master.checked) selectedStudentIds.add(s.id);
      else selectedStudentIds.delete(s.id);
    });
    renderTable();
    updateBatchBar();
  };
  function updateBatchBar() {
    const bar = document.getElementById("batchBar");
    const n = selectedStudentIds.size;
    if (n === 0) {
      bar.classList.remove("active");
      return;
    }
    bar.classList.add("active");
    document.getElementById("batchCount").textContent =
      `${n} student${n > 1 ? "s" : ""} selected`;
  }
  window.clearSelection = function () {
    selectedStudentIds.clear();
    document.getElementById("masterCheck").checked = false;
    renderTable();
    updateBatchBar();
  };
  window.deleteSelectedStudents = function () {
    if (!selectedStudentIds.size) return;
    if (!confirm(`Delete ${selectedStudentIds.size} selected student(s)?`))
      return;
    allStudents[activeClassId] = (allStudents[activeClassId] || []).filter(
      (s) => !selectedStudentIds.has(s.id),
    );
    selectedStudentIds.clear();
    renderTable();
    saveData();
    showToast(`Students deleted`, "info");
  };

  // ════════════════════════════════════════════════════
  //  SORT & FILTER
  // ════════════════════════════════════════════════════
  window.sortByScore = function () {
    sortAsc = !sortAsc;
    renderTable();
    document.getElementById("sortBtn").innerHTML = sortAsc
      ? '<i class="bi bi-sort-up"></i> Sort'
      : '<i class="bi bi-sort-down"></i> Sort';
    showToast(sortAsc ? "⬆ Lowest first" : "⬇ Highest first", "info");
  };
  window.sortByName = function () {
    sortByNameAsc = !sortByNameAsc;
    (allStudents[activeClassId] || []).sort((a, b) =>
      sortByNameAsc
        ? a.name.localeCompare(b.name)
        : b.name.localeCompare(a.name),
    );
    renderTable();
  };
  window.filterStudents = function (q) {
    document.querySelectorAll("#scoreBody tr").forEach((r) => {
      const name =
        r.querySelector(".td-name")?.textContent?.toLowerCase() || "";
      r.style.display = name.includes(q.toLowerCase()) ? "" : "none";
    });
    document.getElementById("globalSearch").value = q;
  };

  // ════════════════════════════════════════════════════
  //  STUDENT DETAIL
  // ════════════════════════════════════════════════════
  window.viewStudentDetail = function (id) {
    const cls = classes.find((c) => c.id === activeClassId);
    const student = (allStudents[activeClassId] || []).find((s) => s.id === id);
    if (!student || !cls) return;
    const ranked = rankStudents(allStudents[activeClassId] || []);
    const rs = ranked.find((s) => s.id === id);
    const overall = computeStudentOverall(student);
    const grade = gradeResult(overall);
    const ini = initials(student.name);
    const subRows = student.subjects
      .map((sub) => {
        const comp = computeSubject(sub);
        const gr = gradeResult(comp.total);
        return `<tr>
        <td style="padding:.7rem .8rem; border-bottom:1px solid var(--border); font-weight:600;">${sub.name}</td>
        <td style="padding:.7rem .8rem; border-bottom:1px solid var(--border); text-align:center; font-family:var(--font-mono);">${sub.test ?? "—"}</td>
        <td style="padding:.7rem .8rem; border-bottom:1px solid var(--border); text-align:center; font-family:var(--font-mono);">${sub.prac ?? "—"}</td>
        <td style="padding:.7rem .8rem; border-bottom:1px solid var(--border); text-align:center; font-family:var(--font-mono);">${sub.exam === "" ? "—" : sub.exam}</td>
        <td style="padding:.7rem .8rem; border-bottom:1px solid var(--border); text-align:center; font-weight:700; font-family:var(--font-mono);">${comp.total ?? "—"}</td>
        <td style="padding:.7rem .8rem; border-bottom:1px solid var(--border); text-align:center;"><span class="grade-pill ${gr.cls}">${gr.g}</span></td>
        <td style="padding:.7rem .8rem; border-bottom:1px solid var(--border); color:var(--muted); font-size:.82rem;">${gr.r}</td>
      </tr>`;
      })
      .join("");
    document.getElementById("studentDetailContent").innerHTML = `
      <div style="display:flex; align-items:center; gap:1.2rem; margin-bottom:1.5rem;">
        <div style="width:64px;height:64px;border-radius:var(--r-lg);background:linear-gradient(135deg,var(--accent),var(--accent-2));display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:800;color:white;font-family:var(--font-display);flex-shrink:0;">${ini}</div>
        <div>
          <div class="modal-title" style="font-size:1.4rem;">${student.name}</div>
          <div style="color:var(--muted); font-size:.88rem;">${cls.name} · ${ordinal(rs?.pos)} position</div>
        </div>
        <div style="margin-left:auto; text-align:right;">
          <div style="font-family:var(--font-display); font-size:2.4rem; font-weight:800; color:var(--accent); line-height:1;">${overall ?? "—"}${overall !== null ? "%" : ""}</div>
          <span class="grade-pill ${grade.cls}">${grade.g} — ${grade.r}</span>
        </div>
      </div>
      <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:.88rem;">
          <thead><tr style="background:var(--surface-2);">
            <th style="padding:.7rem .8rem;text-align:left;font-weight:700;font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--border);">Subject</th>
            <th style="padding:.7rem .8rem;text-align:center;font-weight:700;font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--border);">Test</th>
            <th style="padding:.7rem .8rem;text-align:center;font-weight:700;font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--border);">Prac</th>
            <th style="padding:.7rem .8rem;text-align:center;font-weight:700;font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--border);">Exam</th>
            <th style="padding:.7rem .8rem;text-align:center;font-weight:700;font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--border);">Total</th>
            <th style="padding:.7rem .8rem;text-align:center;font-weight:700;font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--border);">Grade</th>
            <th style="padding:.7rem .8rem;text-align:left;font-weight:700;font-size:.75rem;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--border);">Remark</th>
          </tr></thead>
          <tbody>${subRows}</tbody>
        </table>
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary" onclick="exportStudentPDF('${student.id}'); closeModal('studentDetailModal');"><i class="bi bi-file-pdf-fill"></i> Download Report Card</button>
        <button class="btn" style="background:#e7faf0;color:#1a7a3e;border-color:#b2eacb;" onclick="openWhatsAppShare('${student.id}')"><i class="bi bi-whatsapp"></i> Share via WhatsApp</button>
        <button class="btn" style="background:var(--accent-l);color:var(--accent);" onclick="openAiComment('${student.id}')"><i class="bi bi-stars"></i> AI Comment</button>
        <button class="btn" onclick="closeModal('studentDetailModal')">Close</button>
      </div>`;
    document.getElementById("studentDetailModal").classList.add("active");
  };

  // ════════════════════════════════════════════════════
  //  RENAME STUDENT
  // ════════════════════════════════════════════════════
  window.openRenameStudent = function (id) {
    renameStudentId = id;
    const student = (allStudents[activeClassId] || []).find((s) => s.id === id);
    if (!student) return;
    document.getElementById("renameStudentInput").value = student.name;
    document.getElementById("renameStudentModal").classList.add("active");
    setTimeout(
      () => document.getElementById("renameStudentInput").focus(),
      100,
    );
  };
  window.confirmRenameStudent = function () {
    const name = document.getElementById("renameStudentInput").value.trim();
    if (!name) {
      showToast("Please enter a name", "error");
      return;
    }
    const student = (allStudents[activeClassId] || []).find(
      (s) => s.id === renameStudentId,
    );
    if (student) {
      student.name = name;
    }
    closeModal("renameStudentModal");
    renderTable();
    saveData();
    showToast("Student renamed", "success");
  };

  // ════════════════════════════════════════════════════
  //  DELETE STUDENT
  // ════════════════════════════════════════════════════
  window.deleteStudent = function (id) {
    const s = (allStudents[activeClassId] || []).find((s) => s.id === id);
    if (!s) return;
    if (!confirm(`Delete "${s.name}"? This cannot be undone.`)) return;
    allStudents[activeClassId] = (allStudents[activeClassId] || []).filter(
      (s) => s.id !== id,
    );
    selectedStudentIds.delete(id);
    renderTable();
    saveData();
    showToast(`${s.name} deleted`, "info");
  };

  // ════════════════════════════════════════════════════
  //  ANALYTICS
  // ════════════════════════════════════════════════════
  function renderAnalytics() {
    const cls = classes.find((c) => c.id === activeClassId);
    const students = allStudents[activeClassId] || [];
    const ranked = rankStudents(students);
    const graded = ranked.filter((s) => s.overall !== null);

    // Grade distribution
    const dist = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
    graded.forEach((s) => {
      const g = gradeResult(s.overall).g;
      if (dist[g] !== undefined) dist[g]++;
    });
    const distEl = document.getElementById("gradeDist");
    const colors = {
      A: "#00b894",
      B: "#4361ee",
      C: "#f9a825",
      D: "#fdcb6e",
      E: "#a29bfe",
      F: "#ef476f",
    };
    if (!graded.length) {
      distEl.innerHTML = `<div class="empty-state" style="padding:2rem;"><div class="empty-icon">📊</div><p>No graded students yet.</p></div>`;
    } else {
      distEl.innerHTML = Object.entries(dist)
        .map(([g, count]) => {
          const pct = graded.length
            ? Math.round((count / graded.length) * 100)
            : 0;
          return `<div class="dist-bar-row">
          <div class="dist-bar-label"><span class="grade-pill g-${g}" style="min-width:36px;">${g}</span></div>
          <div class="dist-bar-track"><div class="dist-bar-fill" style="width:${pct}%;background:${colors[g]};">${pct > 10 ? pct + "%" : ""}</div></div>
          <div class="dist-bar-count">${count}</div>
        </div>`;
        })
        .join("");
    }

    // Top performers
    const topEl = document.getElementById("topPerformers");
    if (!graded.length) {
      topEl.innerHTML = `<div class="empty-state" style="padding:2rem;"><div class="empty-icon">🏆</div><p>No graded students yet.</p></div>`;
    } else {
      topEl.innerHTML = graded
        .slice(0, 8)
        .map(
          (s, i) => `
        <div class="top-performer-row">
          <div class="top-rank ${i === 0 ? "r1" : i === 1 ? "r2" : i === 2 ? "r3" : ""}">${i === 0 ? "🏆" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</div>
          <div class="student-mini-avatar" style="width:28px;height:28px;font-size:.7rem;border-radius:8px;">${initials(s.name)}</div>
          <div class="top-name">${esc(s.name)}</div>
          <div class="top-score">${s.overall}%</div>
          <span class="grade-pill ${gradeResult(s.overall).cls}" style="font-size:.72rem;">${gradeResult(s.overall).g}</span>
        </div>`,
        )
        .join("");
    }

    // Score chart (current subject)
    const canvas = document.getElementById("scoreChart");
    if (scoreChart) {
      scoreChart.destroy();
      scoreChart = null;
    }
    if (!cls || !activeSubjectId || !students.length) {
      canvas.style.display = "none";
      return;
    }
    canvas.style.display = "";
    const isDark =
      document.documentElement.getAttribute("data-theme") === "dark";
    const gridColor = isDark ? "rgba(255,255,255,.08)" : "rgba(0,0,0,.06)";
    const textColor = isDark ? "#a8aed0" : "#6b7699";
    const labels = students.map((s) => s.name.split(" ")[0]);
    const scores = students.map((s) => {
      const sub = s.subjects.find((sub) => sub.id === activeSubjectId);
      return sub ? computeSubject(sub).total : null;
    });
    scoreChart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label:
              cls.subjects.find((s) => s.id === activeSubjectId)?.name ||
              "Score",
            data: scores,
            backgroundColor: scores.map((v) =>
              v === null
                ? "rgba(107,118,153,.3)"
                : v >= 70
                  ? "rgba(0,184,148,.7)"
                  : v >= 50
                    ? "rgba(67,97,238,.7)"
                    : v >= 40
                      ? "rgba(249,168,37,.7)"
                      : "rgba(239,71,111,.7)",
            ),
            borderRadius: 8,
            borderSkipped: false,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: (ctx) => `Score: ${ctx.raw ?? "Pending"}` },
          },
        },
        scales: {
          y: {
            min: 0,
            max: 100,
            grid: { color: gridColor },
            ticks: { color: textColor, font: { size: 11 } },
          },
          x: {
            grid: { display: false },
            ticks: { color: textColor, font: { size: 11 }, maxRotation: 30 },
          },
        },
      },
    });

    // Subject averages
    const subAvgEl = document.getElementById("subjectAverages");
    if (!cls || !cls.subjects.length) {
      subAvgEl.innerHTML = "";
      return;
    }
    subAvgEl.innerHTML = cls.subjects
      .map((sub) => {
        const scores = students
          .map((s) => {
            const found = s.subjects.find((ss) => ss.id === sub.id);
            return found ? computeSubject(found).total : null;
          })
          .filter((v) => v !== null);
        const avg = scores.length
          ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
          : null;
        const gr = gradeResult(avg);
        return `<div class="dist-bar-row" style="margin-bottom:1rem;">
        <div style="width:130px;font-weight:600;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${sub.name}</div>
        <div class="dist-bar-track"><div class="dist-bar-fill" style="width:${avg || 0}%;background:${barColor(avg || 0)};">${avg !== null && avg > 10 ? avg + "%" : ""}</div></div>
        <div style="min-width:60px;text-align:right;display:flex;gap:.4rem;align-items:center;justify-content:flex-end;">
          <span class="score-val" style="font-size:.82rem;">${avg ?? "—"}</span>
          <span class="grade-pill ${gr.cls}" style="font-size:.72rem;">${gr.g}</span>
        </div>
      </div>`;
      })
      .join("");
  }

  // ════════════════════════════════════════════════════
  //  STUDENT CARDS VIEW
  // ════════════════════════════════════════════════════
  function renderStudentCards() {
    const students = allStudents[activeClassId] || [];
    const container = document.getElementById("studentsGrid");
    if (!activeClassId || !students.length) {
      container.innerHTML = `<div class="empty-state" style="grid-column:1/-1;"><div class="empty-icon">👥</div><h3>No students yet</h3><p>Add students to see their cards here.</p><button class="btn btn-primary btn-sm" onclick="openAddStudentModal()"><i class="bi bi-person-plus"></i> Add Student</button></div>`;
      return;
    }
    const ranked = rankStudents(students);
    container.innerHTML = ranked
      .map((s) => {
        const overall = s.overall;
        const grade = gradeResult(overall);
        const bc = barColor(overall ?? 0);
        const ini = initials(s.name);
        return `<div class="student-card" onclick="viewStudentDetail('${s.id}')">
        <div class="student-card-head">
          <div class="student-card-avatar">${esc(ini)}</div>
          <div>
            <div class="student-card-name">${esc(s.name)}</div>
            <div class="student-card-pos">${s.pos ? ordinal(s.pos) + " position" : "Not yet graded"}</div>
          </div>
          <span class="grade-pill ${grade.cls}" style="margin-left:auto;">${grade.g}</span>
        </div>
        <div class="student-overall">${overall !== null ? overall + "%" : "—"}</div>
        <div class="score-bar"><div class="score-bar-fill" style="width:${overall ?? 0}%;background:${bc};"></div></div>
        <div class="student-card-footer">
          <button class="btn btn-xs btn-primary" onclick="event.stopPropagation();exportStudentPDF('${s.id}')"><i class="bi bi-file-pdf"></i> PDF</button>
          <button class="btn btn-xs" style="background:#e7faf0;color:#1a7a3e;border-color:#b2eacb;" onclick="event.stopPropagation();openWhatsAppShare('${s.id}')" title="Share via WhatsApp"><i class="bi bi-whatsapp"></i></button>
          <button class="btn btn-xs" style="background:var(--accent-l);color:var(--accent);border-color:rgba(67,97,238,.25);" onclick="event.stopPropagation();openAiComment('${s.id}')" title="AI teacher comment"><i class="bi bi-stars"></i></button>
          <button class="btn btn-xs" onclick="event.stopPropagation();openRenameStudent('${s.id}')"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-xs btn-danger" onclick="event.stopPropagation();deleteStudent('${s.id}')"><i class="bi bi-trash3"></i></button>
        </div>
      </div>`;
      })
      .join("");
  }

  // ════════════════════════════════════════════════════
  //  PDF EXPORT
  // ════════════════════════════════════════════════════

  window.generateStudentPDFAsBlob = async function (studentId) {
    const cls = classes.find((c) => c.id === activeClassId);
    const student = (allStudents[activeClassId] || []).find(
      (s) => s.id === studentId,
    );
    if (!student || !cls) return null;

    const ranked = rankStudents(allStudents[activeClassId] || []);
    const rs = ranked.find((s) => s.id === studentId);
    const overall = computeStudentOverall(student);
    const grade = gradeResult(overall);
    const graded = ranked.filter((s) => s.overall !== null);
    const classAvg = graded.length
      ? Math.round(graded.reduce((a, s) => a + s.overall, 0) / graded.length)
      : 0;

    const template = document.getElementById("pdf-template").cloneNode(true);
    template.style.display = "block";
    template.id = "pdf-clone-" + Date.now();

    const pdfSchool = settings.pdfSchool || currentUser?.org || "SCHOOL NAME";
    template.querySelector(".pdf-schoolname").textContent = pdfSchool;
    template.querySelector(".pdf-motto").textContent = settings.motto || "";
    template.querySelector(".pdf-term").textContent =
      settings.term || "Second Term";
    template.querySelector(".pdf-session").textContent =
      settings.session || "2025/2026";
    const pdfLogoEl = template.querySelector(".pdf-school-logo");
    const pdfIconEl = template.querySelector(".pdf-school-icon");
    if (pdfLogoEl) {
      pdfLogoEl.src = settings.logoDataUrl || "";
      pdfLogoEl.style.display = settings.logoDataUrl ? "block" : "none";
    }
    if (pdfIconEl)
      pdfIconEl.style.display = settings.logoDataUrl ? "none" : "flex";
    template.querySelector(".pdf-studentname").textContent = student.name;
    template.querySelector(".pdf-classname").textContent = cls.name;
    template.querySelector(".pdf-position").textContent = rs?.pos
      ? ordinal(rs.pos)
      : "—";
    template.querySelector(".pdf-classsize").textContent = (
      allStudents[activeClassId] || []
    ).length;
    template.querySelector(".pdf-overall").textContent =
      (overall ?? "—") + (overall !== null ? "%" : "");
    template.querySelector(".pdf-remark").textContent = grade.r;
    template.querySelector(".pdf-classavg").textContent = classAvg;

    const tbody = template.querySelector(".pdf-subjectrows");
    tbody.innerHTML = "";
    const bgColors = {
      A: "#ecfdf5",
      B: "#eff6ff",
      C: "#fffbeb",
      D: "#fefce8",
      E: "#f5f3ff",
      F: "#fef2f2",
      "—": "#f9fafb",
    };
    const textColors = {
      A: "#047857",
      B: "#0369a1",
      C: "#b45309",
      D: "#7c2d12",
      E: "#6d28d9",
      F: "#991b1b",
      "—": "#4b5563",
    };
    const borderColors = {
      A: "#86efac",
      B: "#7dd3fc",
      C: "#fcd34d",
      D: "#fde047",
      E: "#c4b5fd",
      F: "#fca5a5",
      "—": "#e5e7eb",
    };
    student.subjects.forEach((sub, i) => {
      const c = computeSubject(sub);
      const gr = gradeResult(c.total);
      const tr = document.createElement("tr");
      tr.style.background = i % 2 === 0 ? "#fafbfc" : "#ffffff";
      const cells = [
        { text: sub.name, align: "left", fw: "600" },
        { text: c.total ?? "—", align: "center", fw: "600" },
        { text: gr.r, align: "center", fw: "600" },
      ];
      cells.forEach((cell) => {
        const td = document.createElement("td");
        td.style.cssText = `padding:0.85rem 0.8rem;border-bottom:1px solid #e5e7eb;text-align:${cell.align};color:#334155;${cell.fw ? "font-weight:" + cell.fw + ";" : ""}`;
        td.textContent = cell.text;
        tr.appendChild(td);
      });
      const tdGrade = document.createElement("td");
      tdGrade.style.cssText =
        "padding:0.85rem 0.8rem;border-bottom:1px solid #e5e7eb;text-align:center;";
      const span = document.createElement("span");
      span.style.cssText = `padding:.3rem .85rem;border-radius:6px;font-weight:700;font-size:12px;background:${bgColors[gr.g] || "#f9fafb"};color:${textColors[gr.g] || "#4b5563"};border:1.5px solid ${borderColors[gr.g] || "#e5e7eb"};letter-spacing:0.5px;`;
      span.textContent = gr.g;
      tdGrade.appendChild(span);
      tr.appendChild(tdGrade);
      const tdRemark = document.createElement("td");
      tdRemark.style.cssText =
        "padding:0.85rem 0.8rem;border-bottom:1px solid #e5e7eb;text-align:left;color:#64748b;font-size:11px;font-weight:500;";
      tdRemark.textContent = gr.r;
      tr.appendChild(tdRemark);
      tbody.appendChild(tr);
    });

    document.body.appendChild(template);
    try {
      const canvas = await html2canvas(template, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const imgData = canvas.toDataURL("image/png");
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });
      pdf.addImage(imgData, "PNG", 0, 0, 210, 297);
      const pdfBlob = pdf.output("blob");
      document.body.removeChild(template);
      return pdfBlob;
    } catch (e) {
      console.error(e);
      document.body.removeChild(template);
      return null;
    }
  };

  window.exportStudentPDF = async function (studentId, aiComment) {
    const cls = classes.find((c) => c.id === activeClassId);
    const student = (allStudents[activeClassId] || []).find(
      (s) => s.id === studentId,
    );
    if (!student || !cls) return;
    const ranked = rankStudents(allStudents[activeClassId] || []);
    const rs = ranked.find((s) => s.id === studentId);
    const overall = computeStudentOverall(student);
    const grade = gradeResult(overall);
    const graded = ranked.filter((s) => s.overall !== null);
    const classAvg = graded.length
      ? Math.round(graded.reduce((a, s) => a + s.overall, 0) / graded.length)
      : 0;

    const template = document.getElementById("pdf-template").cloneNode(true);
    template.style.display = "block";
    template.id = "pdf-clone-" + Date.now();

    const pdfSchool = settings.pdfSchool || currentUser?.org || "SCHOOL NAME";
    template.querySelector(".pdf-schoolname").textContent = pdfSchool;
    template.querySelector(".pdf-motto").textContent = settings.motto || "";
    template.querySelector(".pdf-term").textContent =
      settings.term || "Second Term";
    template.querySelector(".pdf-session").textContent =
      settings.session || "2025/2026";
    const pdfLogoEl = template.querySelector(".pdf-school-logo");
    const pdfIconEl = template.querySelector(".pdf-school-icon");
    if (pdfLogoEl) {
      pdfLogoEl.src = settings.logoDataUrl || "";
      pdfLogoEl.style.display = settings.logoDataUrl ? "block" : "none";
    }
    if (pdfIconEl)
      pdfIconEl.style.display = settings.logoDataUrl ? "none" : "flex";
    template.querySelector(".pdf-studentname").textContent = student.name;
    template.querySelector(".pdf-classname").textContent = cls.name;
    template.querySelector(".pdf-position").textContent = rs?.pos
      ? ordinal(rs.pos)
      : "—";
    template.querySelector(".pdf-classsize").textContent = (
      allStudents[activeClassId] || []
    ).length;
    template.querySelector(".pdf-overall").textContent =
      (overall ?? "—") + (overall !== null ? "%" : "");
    template.querySelector(".pdf-remark").textContent = aiComment || grade.r;
    template.querySelector(".pdf-classavg").textContent = classAvg;

    const tbody = template.querySelector(".pdf-subjectrows");
    tbody.innerHTML = "";
    student.subjects.forEach((sub, i) => {
      const comp = computeSubject(sub);
      const gr = gradeResult(comp.total);
      const bgColors = {
        A: "#ecfdf5",
        B: "#eff6ff",
        C: "#fffbeb",
        D: "#fefce8",
        E: "#f5f3ff",
        F: "#fef2f2",
        "—": "#f9fafb",
      };
      const textColors = {
        A: "#047857",
        B: "#0369a1",
        C: "#b45309",
        D: "#7c2d12",
        E: "#6d28d9",
        F: "#991b1b",
        "—": "#4b5563",
      };
      const borderColors = {
        A: "#86efac",
        B: "#7dd3fc",
        C: "#fcd34d",
        D: "#fde047",
        E: "#c4b5fd",
        F: "#fca5a5",
        "—": "#e5e7eb",
      };
      const tr = document.createElement("tr");
      tr.style.background = i % 2 === 0 ? "#fafbfc" : "#ffffff";
      const cells = [
        { text: sub.name, align: "left", fw: "600" },
        { text: sub.test ?? "—", align: "center" },
        { text: sub.prac ?? "—", align: "center" },
        { text: sub.exam === "" ? "—" : sub.exam, align: "center" },
        { text: comp.total ?? "—", align: "center", fw: "700" },
      ];
      cells.forEach((cell) => {
        const td = document.createElement("td");
        td.style.cssText = `padding:0.85rem 0.8rem;border-bottom:1px solid #e5e7eb;text-align:${cell.align};color:#334155;${cell.fw ? "font-weight:" + cell.fw + ";" : ""}`;
        td.textContent = cell.text;
        tr.appendChild(td);
      });
      const tdGrade = document.createElement("td");
      tdGrade.style.cssText =
        "padding:0.85rem 0.8rem;border-bottom:1px solid #e5e7eb;text-align:center;";
      const span = document.createElement("span");
      span.style.cssText = `padding:.3rem .85rem;border-radius:6px;font-weight:700;font-size:12px;background:${bgColors[gr.g] || "#f9fafb"};color:${textColors[gr.g] || "#4b5563"};border:1.5px solid ${borderColors[gr.g] || "#e5e7eb"};letter-spacing:0.5px;`;
      span.textContent = gr.g;
      tdGrade.appendChild(span);
      tr.appendChild(tdGrade);
      const tdRemark = document.createElement("td");
      tdRemark.style.cssText =
        "padding:0.85rem 0.8rem;border-bottom:1px solid #e5e7eb;text-align:left;color:#64748b;font-size:11px;font-weight:500;";
      tdRemark.textContent = gr.r;
      tr.appendChild(tdRemark);
      tbody.appendChild(tr);
    });

    document.body.appendChild(template);
    try {
      const canvas = await html2canvas(template, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });
      const imgData = canvas.toDataURL("image/png");
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4",
      });
      pdf.addImage(imgData, "PNG", 0, 0, 210, 297);
      pdf.save(`${student.name.replace(/\s+/g, "_")}_Report_Card.pdf`);
      incrementPdfCount();
      const _rem = isPro() ? "∞" : Math.max(0, FREE_PDF_LIMIT - getPdfCount());
      const _remLabel = isPro()
        ? ""
        : ` · ${_rem} free PDF${_rem === 1 ? "" : "s"} left this term`;
      showToast(`✅ PDF generated for ${student.name}${_remLabel}`, "success");
    } catch (e) {
      console.error(e);
      showToast("PDF generation failed. Please try again.", "error");
    }
    document.body.removeChild(template);
  };

  window.exportAllPDFs = async function () {
    const students = allStudents[activeClassId] || [];
    if (!students.length) {
      showToast("No students in this class", "info");
      return;
    }
    showLoading(`Generating ${students.length} PDFs...`);
    for (const s of students) {
      await exportStudentPDF(s.id);
    }
    hideLoading();
    showToast(`✅ All ${students.length} PDFs exported`, "success");
  };

  window.exportSelectedPDFs = async function () {
    if (!selectedStudentIds.size) {
      showToast("Select students first", "error");
      return;
    }
    showLoading(`Generating ${selectedStudentIds.size} PDFs...`);
    for (const id of selectedStudentIds) {
      await exportStudentPDF(id);
    }
    hideLoading();
    showToast("✅ Done", "success");
  };

  // ════════════════════════════════════════════════════
  //  EXCEL EXPORT
  // ════════════════════════════════════════════════════
  window.exportExcel = function () {
    const cls = classes.find((c) => c.id === activeClassId);
    if (!cls) {
      showToast("Select a class first", "error");
      return;
    }
    const students = allStudents[activeClassId] || [];
    if (!students.length) {
      showToast("No students to export", "info");
      return;
    }
    const ranked = rankStudents(students);
    const rows = ranked.map((s) => {
      const row = {
        Position: s.pos ? ordinal(s.pos) : "—",
        "Student Name": s.name,
      };
      cls.subjects.forEach((sub) => {
        const found = s.subjects.find((ss) => ss.id === sub.id);
        const comp = found
          ? computeSubject(found)
          : { total: null, t: 0, p: 0, e: null };
        row[`${sub.name} Test`] = found?.test ?? 0;
        row[`${sub.name} Prac`] = found?.prac ?? 0;
        row[`${sub.name} Exam`] =
          found?.exam === "" ? "—" : (found?.exam ?? "—");
        row[`${sub.name} Total`] = comp.total ?? "—";
        row[`${sub.name} Grade`] = gradeResult(comp.total).g;
      });
      row["Overall Avg"] = s.overall ?? "—";
      row["Overall Grade"] = gradeResult(s.overall).g;
      row["Remark"] = gradeResult(s.overall).r;
      return row;
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, cls.name);
    XLSX.writeFile(wb, `${cls.name}_GradeSheet.xlsx`);
    showToast(`✅ Excel exported: ${cls.name}`, "success");
  };

  // ════════════════════════════════════════════════════
  //  EXCEL IMPORT
  // ════════════════════════════════════════════════════
  window.handleExcelUpload = function (files) {
    if (!files.length) return;
    showLoading("Parsing spreadsheet...");
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (rows.length < 2) {
          hideLoading();
          showToast("File too short", "error");
          return;
        }

        let className = rows[0]?.[0]?.toString().trim() || "Imported Class";
        let headerIdx = -1;
        for (let i = 0; i < rows.length; i++) {
          if (
            rows[i]?.some((c) => String(c).toUpperCase().includes("STUDENT"))
          ) {
            headerIdx = i;
            break;
          }
        }
        if (headerIdx === -1) {
          hideLoading();
          showToast('No "STUDENT" column found', "error");
          return;
        }

        const header = rows[headerIdx].map((c) =>
          String(c).toLowerCase().trim(),
        );
        const nameIdx = header.findIndex(
          (h) => h.includes("student") || h.includes("name"),
        );
        const testIdx = header.findIndex((h) => h.includes("test"));
        const pracIdx = header.findIndex(
          (h) => h.includes("prac") || h.includes("practical"),
        );
        const examIdx = header.findIndex((h) => h.includes("exam"));

        // Store parsed data temporarily
        pendingExcelImportData = {
          className,
          headerIdx,
          rows,
          nameIdx,
          testIdx,
          pracIdx,
          examIdx,
        };

        hideLoading();

        // Show subject selection modal
        const modal = document.getElementById("excelSubjectSelectModal");
        if (modal) modal.classList.add("active");
      } catch (err) {
        console.error(err);
        hideLoading();
        showToast("Error parsing file", "error");
      }
      document.getElementById("excelUpload").value = "";
    };
    reader.readAsArrayBuffer(files[0]);
  };

  // Complete the Excel import with the selected subject
  window.confirmExcelImportSubject = function () {
    if (!pendingExcelImportData) {
      showToast("Error: No import data found", "error");
      return;
    }

    const subjectSelect = document.getElementById("excelImportSubjectSelect");
    let selectedSubject = subjectSelect.value;

    if (!selectedSubject) {
      showToast("Please select a subject", "error");
      return;
    }

    // Handle custom subject
    if (selectedSubject === "custom") {
      const customInput = document.getElementById("customSubjectInput");
      selectedSubject = customInput.value.trim();
      if (!selectedSubject) {
        showToast("Please enter a custom subject name", "error");
        return;
      }
    }

    const data = pendingExcelImportData;
    showLoading("Importing students...");

    try {
      const newClassId = "cls_" + Date.now();
      const subjId = "subj_" + Date.now();
      const newClass = {
        id: newClassId,
        name: data.className,
        emoji: "📥",
        subjects: [{ id: subjId, name: selectedSubject }],
      };
      classes.push(newClass);
      allStudents[newClassId] = [];

      for (let i = data.headerIdx + 1; i < data.rows.length; i++) {
        const row = data.rows[i];
        if (!row?.length) continue;
        const sName = row[data.nameIdx]?.toString().trim();
        if (!sName || /^[\d\s]+$/.test(sName)) continue;
        allStudents[newClassId].push({
          id: "s_" + Date.now() + "_" + i,
          name: sName,
          subjects: [
            {
              id: subjId,
              name: selectedSubject,
              test: data.testIdx >= 0 ? parseFloat(row[data.testIdx]) || 0 : 0,
              prac: data.pracIdx >= 0 ? parseFloat(row[data.pracIdx]) || 0 : 0,
              exam:
                data.examIdx >= 0 && row[data.examIdx] !== ""
                  ? parseFloat(row[data.examIdx]) || 0
                  : "",
              total: null,
            },
          ],
        });
      }

      activeClassId = newClassId;
      activeSubjectId = subjId;
      renderSidebarClasses();
      renderSubjectTabs();
      renderTable();
      saveData();
      closeModal("excelSubjectSelectModal");
      hideLoading();
      showToast(
        `✅ Imported "${data.className}" as ${selectedSubject} — ${allStudents[newClassId].length} students`,
        "success",
      );

      // Reset pending data
      pendingExcelImportData = null;
    } catch (err) {
      console.error(err);
      hideLoading();
      showToast("Error importing file", "error");
    }
  };

  // Show/hide custom subject input
  window.toggleExcelSubjectCustom = function () {
    const select = document.getElementById("excelImportSubjectSelect");
    const customGroup = document.getElementById("customSubjectGroup");
    if (select.value === "custom") {
      customGroup.style.display = "block";
      document.getElementById("customSubjectInput").focus();
    } else {
      customGroup.style.display = "none";
    }
  };

  // Set up event listeners when DOM is ready
  function _setupExcelImportListeners() {
    const subjectSelect = document.getElementById("excelImportSubjectSelect");
    if (subjectSelect && !subjectSelect._hasListener) {
      subjectSelect.addEventListener("change", toggleExcelSubjectCustom);
      subjectSelect._hasListener = true;
    }
  }

  // Call setup on DOMContentLoaded and also try immediately
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", _setupExcelImportListeners);
  } else {
    _setupExcelImportListeners();
  }

  // ════════════════════════════════════════════════════
  //  BROADSHEET EXPORT
  //  Master collation sheet: all students × all subjects
  // ════════════════════════════════════════════════════
  window.exportBroadsheet = function () {
    // PHASE 2: All features enabled (no upgrades until Phase 3)
    const cls = classes.find((c) => c.id === activeClassId);
    if (!cls) {
      showToast("Select a class first", "error");
      return;
    }
    const students = allStudents[activeClassId] || [];
    if (!students.length) {
      showToast("No students in this class", "info");
      return;
    }
    if (!window.XLSX) {
      showToast("SheetJS not loaded — please go online once first", "error");
      return;
    }

    const ranked = rankStudents(students);
    const subjects = cls.subjects;

    // ── Build header rows ──
    const titleRow = [`${cls.name} — BROADSHEET`];
    const termRow = [
      `${settings.term || "Term"} · ${settings.session || "Session"}`,
    ];
    const schoolRow = [settings.pdfSchool || currentUser?.org || "School"];
    const blankRow = [];

    // Header row 1: merged subject groups
    const h1 = ["S/N", "Student Name"];
    subjects.forEach((s) => {
      h1.push(s.name, "", "", "", "");
    });
    h1.push("Total", "Avg", "Grade", "Remark", "Position");

    // Header row 2: sub-columns
    const h2 = ["", ""];
    subjects.forEach(() => {
      h2.push("Test/20", "Prac/20", "Exam/60", "Total", "Grade");
    });
    h2.push("", "", "", "", "");

    // ── Data rows ──
    const dataRows = ranked.map((s, idx) => {
      const row = [idx + 1, s.name];
      let totalSum = 0,
        totalCount = 0;
      subjects.forEach((sub) => {
        const found = s.subjects.find((ss) => ss.id === sub.id);
        const comp = found
          ? computeSubject(found)
          : { total: null, t: 0, p: 0, e: null };
        row.push(
          found?.test ?? "—",
          found?.prac ?? "—",
          found?.exam === "" ? "—" : (found?.exam ?? "—"),
          comp.total ?? "—",
          gradeResult(comp.total).g,
        );
        if (comp.total !== null) {
          totalSum += comp.total;
          totalCount++;
        }
      });
      const avg = totalCount ? Math.round(totalSum / totalCount) : null;
      const gr = gradeResult(avg);
      row.push(
        totalCount > 0 ? totalSum : "—",
        avg ?? "—",
        gr.g,
        gr.r,
        s.pos ? ordinal(s.pos) : "—",
      );
      return row;
    });

    // ── Summary row ──
    const classGraded = ranked.filter((s) => s.overall !== null);
    const classAvg = classGraded.length
      ? Math.round(
          classGraded.reduce((a, s) => a + s.overall, 0) / classGraded.length,
        )
      : null;
    const summaryRow = ["", `CLASS AVERAGE`];
    subjects.forEach((sub) => {
      const scores = students
        .map((s) => {
          const found = s.subjects.find((ss) => ss.id === sub.id);
          return found ? computeSubject(found).total : null;
        })
        .filter((v) => v !== null);
      const avg = scores.length
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : null;
      summaryRow.push("", "", "", avg ?? "—", "");
    });
    summaryRow.push("", classAvg ?? "—", gradeResult(classAvg).g, "", "");

    // ── Build worksheet ──
    const wb = XLSX.utils.book_new();
    const wsData = [
      titleRow,
      schoolRow,
      termRow,
      blankRow,
      h1,
      h2,
      ...dataRows,
      blankRow,
      summaryRow,
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths
    const wscols = [{ wch: 5 }, { wch: 28 }];
    subjects.forEach(() => {
      [6, 6, 6, 7, 6].forEach((w) => wscols.push({ wch: w }));
    });
    [8, 6, 8, 14, 10].forEach((w) => wscols.push({ wch: w }));
    ws["!cols"] = wscols;

    // Freeze top rows + header
    ws["!freeze"] = { xSplit: 2, ySplit: 6 };

    XLSX.utils.book_append_sheet(wb, ws, "Broadsheet");
    const filename = `${cls.name}_Broadsheet_${(settings.term || "Term").replace(/\s/g, "_")}_${(settings.session || "").replace(/\//g, "-")}.xlsx`;
    XLSX.writeFile(wb, filename);
    showToast(`✅ Broadsheet exported for ${cls.name}`, "success");
  };

  // Export broadsheet for ALL classes into one workbook (one sheet per class)
  window.exportAllBroadsheets = function () {
    // PHASE 2: All features enabled (no upgrades until Phase 3)
    if (!classes.length) {
      showToast("No classes to export", "info");
      return;
    }
    if (!window.XLSX) {
      showToast("SheetJS not loaded — please go online once first", "error");
      return;
    }
    const wb = XLSX.utils.book_new();
    classes.forEach((cls) => {
      const students = allStudents[cls.id] || [];
      if (!students.length) return;
      const ranked = rankStudents(students);
      const subjects = cls.subjects;
      const h1 = ["S/N", "Student Name"];
      subjects.forEach((s) => {
        h1.push(s.name, "", "", "", "");
      });
      h1.push("Total", "Avg", "Grade", "Remark", "Position");
      const h2 = ["", ""];
      subjects.forEach(() => {
        h2.push("Test/20", "Prac/20", "Exam/60", "Total", "Grade");
      });
      h2.push("", "", "", "", "");
      const dataRows = ranked.map((s, idx) => {
        const row = [idx + 1, s.name];
        let totalSum = 0,
          totalCount = 0;
        subjects.forEach((sub) => {
          const found = s.subjects.find((ss) => ss.id === sub.id);
          const comp = found
            ? computeSubject(found)
            : { total: null, t: 0, p: 0, e: null };
          row.push(
            found?.test ?? "—",
            found?.prac ?? "—",
            found?.exam === "" ? "—" : (found?.exam ?? "—"),
            comp.total ?? "—",
            gradeResult(comp.total).g,
          );
          if (comp.total !== null) {
            totalSum += comp.total;
            totalCount++;
          }
        });
        const avg = totalCount ? Math.round(totalSum / totalCount) : null;
        const gr = gradeResult(avg);
        row.push(
          totalCount > 0 ? totalSum : "—",
          avg ?? "—",
          gr.g,
          gr.r,
          s.pos ? ordinal(s.pos) : "—",
        );
        return row;
      });
      const wsData = [
        [
          `${cls.name} — BROADSHEET`,
          `${settings.term || ""} · ${settings.session || ""}`,
        ],
        [],
        h1,
        h2,
        ...dataRows,
      ];
      const ws = XLSX.utils.aoa_to_sheet(wsData);
      const wscols = [{ wch: 5 }, { wch: 28 }];
      subjects.forEach(() => {
        [6, 6, 6, 7, 6].forEach((w) => wscols.push({ wch: w }));
      });
      [8, 6, 8, 14, 10].forEach((w) => wscols.push({ wch: w }));
      ws["!cols"] = wscols;
      // Sheet name max 31 chars
      XLSX.utils.book_append_sheet(wb, ws, cls.name.slice(0, 31));
    });
    if (!wb.SheetNames.length) {
      showToast("No classes have students yet", "info");
      return;
    }
    XLSX.writeFile(
      wb,
      `All_Classes_Broadsheet_${(settings.session || "").replace(/\//g, "-")}.xlsx`,
    );
    showToast(
      `✅ All-classes broadsheet exported (${wb.SheetNames.length} sheets)`,
      "success",
    );
  };

  // ════════════════════════════════════════════════════
  //  BACKUP / RESTORE  (enhanced — includes termHistory)
  // ════════════════════════════════════════════════════
  function _noteBackupCompleted() {
    if (!currentUser) return;
    safeSave(userKey("lastBackupAt"), String(Date.now()));
    safeSave(userKey("lastBackupReminderAt"), String(Date.now()));
  }
  function _maybeRemindBackup() {
    if (!currentUser) return;
    const hasData =
      classes.length > 0 || Object.values(allStudents).flat().length > 0;
    if (!hasData) return;
    const now = Date.now();
    const lastBackup = parseInt(
      localStorage.getItem(userKey("lastBackupAt")) || "0",
      10,
    );
    const lastReminder = parseInt(
      localStorage.getItem(userKey("lastBackupReminderAt")) || "0",
      10,
    );
    const noRecentBackup =
      !lastBackup || now - lastBackup > 14 * 24 * 60 * 60 * 1000;
    const canRemind = !lastReminder || now - lastReminder > 24 * 60 * 60 * 1000;
    if (noRecentBackup && canRemind) {
      safeSave(userKey("lastBackupReminderAt"), String(now));
      showToast("Reminder: export a backup to protect your data.", "warning");
    }
  }

  window.exportBackup = async function () {
    if (!window.crypto?.subtle) {
      showToast("Secure encrypted backup requires a modern browser.", "error");
      return;
    }
    const passphrase = prompt(
      "Enter a backup passphrase (min 8 characters). You will need it to restore.",
    );
    if (passphrase === null) return;
    if (!passphrase || passphrase.length < 8) {
      showToast("Passphrase must be at least 8 characters.", "error");
      return;
    }
    const passphrase2 = prompt("Confirm your backup passphrase.");
    if (passphrase2 === null) return;
    if (passphrase !== passphrase2) {
      showToast("Passphrase confirmation did not match.", "error");
      return;
    }
    const payload = {
      version: 2,
      date: new Date().toISOString(),
      exportedBy: currentUser?.name || "",
      school: settings.pdfSchool || currentUser?.org || "",
      classes,
      allStudents,
      allMaterials,
      allAttendance,
      allQuizzes,
      termHistory,
      settings,
      currentUser,
    };
    const backup = await _encryptBackupObject(payload, passphrase);
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const dateStr = new Date().toLocaleDateString("en-GB").replace(/\//g, "-");
    a.download = `GradeFlow_Backup_${dateStr}_v2.json`;
    a.click();
    _noteBackupCompleted();
    showToast("✅ Encrypted backup downloaded", "success");
  };

  window.importBackup = function (input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        let data = JSON.parse(e.target.result);
        if (data.encrypted === true) {
          if (!data.ciphertext || !data.iv || !data.salt) {
            showToast("Invalid encrypted backup envelope", "error");
            return;
          }
          if (data.checksum) {
            const cipherCheck = await _sha256Hex(data.ciphertext);
            if (cipherCheck !== data.checksum) {
              showToast("Encrypted backup integrity check failed", "error");
              return;
            }
          }
          const passphrase = prompt(
            "Enter backup passphrase to decrypt and restore:",
          );
          if (passphrase === null) return;
          try {
            data = await _decryptBackupEnvelope(data, passphrase);
          } catch {
            showToast(
              "Could not decrypt backup. Wrong passphrase or corrupted file.",
              "error",
            );
            return;
          }
        }
        if (!data.classes || !data.allStudents) {
          showToast("Invalid backup file", "error");
          return;
        }
        if (data.checksum) {
          const { checksum, checksumAlg, ...withoutSig } = data;
          const expected = await _sha256Hex(JSON.stringify(withoutSig));
          if (expected !== checksum) {
            showToast(
              "Backup integrity check failed. File may be tampered or corrupted.",
              "error",
            );
            return;
          }
        }
        const classCount = data.classes.length;
        const studentCount = Object.values(data.allStudents).reduce(
          (a, b) => a + b.length,
          0,
        );
        if (
          !confirm(
            `Restore backup from ${data.date ? new Date(data.date).toLocaleDateString() : "unknown date"}?\n\n${classCount} classes · ${studentCount} students\n\nThis will REPLACE all your current data.`,
          )
        )
          return;
        classes = data.classes;
        allStudents = data.allStudents;
        allMaterials = data.allMaterials || {};
        allAttendance = data.allAttendance || {};
        allQuizzes = data.allQuizzes || {};
        termHistory = data.termHistory || {};
        settings = data.settings || getDefaultSettings();
        activeClassId = classes.length ? classes[0].id : null;
        activeSubjectId = activeClassId ? classes[0]?.subjects?.[0]?.id : null;
        saveData();
        saveMaterials();
        saveTermHistory();
        saveAttendance();
        saveQuizzes();
        _noteBackupCompleted();
        renderSidebarClasses();
        renderSubjectTabs();
        renderTable();
        if (activeView === "materials") renderMaterials();
        showToast(
          `✅ Backup restored — ${classCount} classes, ${studentCount} students`,
          "success",
        );
      } catch {
        showToast("Failed to restore backup — file may be corrupted", "error");
      }
    };
    reader.readAsText(file);
    input.value = "";
  };

  // ════════════════════════════════════════════════════
  //  TERM HISTORY — Save, View, Compare
  // ════════════════════════════════════════════════════

  // Save current term's results as a snapshot
  window.saveTermSnapshot = function () {
    if (!activeClassId) {
      showToast("Select a class first", "error");
      return;
    }
    const cls = classes.find((c) => c.id === activeClassId);
    const students = allStudents[activeClassId] || [];
    if (!students.length) {
      showToast("No students to save", "info");
      return;
    }
    const term = settings.term || "Term";
    const session = settings.session || "Session";
    const label = `${term} · ${session}`;

    // Prevent duplicate snapshots for same term+session
    const existing = (termHistory[activeClassId] || []).find(
      (h) => h.term === term && h.session === session,
    );
    if (existing) {
      if (
        !confirm(
          `A snapshot for "${label}" already exists for ${cls.name}.\n\nOverwrite it with the current results?`,
        )
      )
        return;
      termHistory[activeClassId] = termHistory[activeClassId].filter(
        (h) => !(h.term === term && h.session === session),
      );
    }

    const snapshot = {
      id: "th_" + Date.now(),
      term,
      session,
      label,
      savedAt: new Date().toISOString(),
      classId: activeClassId,
      className: cls.name,
      subjects: JSON.parse(JSON.stringify(cls.subjects)),
      students: JSON.parse(JSON.stringify(students)),
    };
    if (!termHistory[activeClassId]) termHistory[activeClassId] = [];
    termHistory[activeClassId].unshift(snapshot); // newest first
    saveTermHistory();
    showToast(`✅ Term snapshot saved: ${label} — ${cls.name}`, "success");
    if (activeView === "history") renderTermHistory();
  };

  // Delete a snapshot
  window.deleteTermSnapshot = function (classId, snapshotId) {
    if (!confirm("Delete this term snapshot? This cannot be undone.")) return;
    termHistory[classId] = (termHistory[classId] || []).filter(
      (h) => h.id !== snapshotId,
    );
    saveTermHistory();
    renderTermHistory();
    showToast("Snapshot deleted", "info");
  };

  // Render the Term History view
  function renderTermHistory() {
    const container = document.getElementById("termHistoryContent");
    if (!container) return;

    // Gather all snapshots across all classes, sorted by savedAt desc
    const all = [];
    Object.values(termHistory).forEach((arr) =>
      arr.forEach((h) => all.push(h)),
    );
    all.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));

    if (!all.length) {
      container.innerHTML = `<div class="empty-state" style="padding:5rem 2rem;">
        <div class="empty-icon">📅</div>
        <h3>No term history yet</h3>
        <p>After entering grades, use <strong>"Save Term Snapshot"</strong> to archive the current term's results. You can then compare progress across terms.</p>
        ${activeClassId ? `<button class="btn btn-primary btn-sm" onclick="saveTermSnapshot()"><i class="bi bi-floppy-fill"></i> Save Current Term Now</button>` : "<p style='color:var(--muted);'>Select a class first.</p>"}
      </div>`;
      return;
    }

    // Group by className
    const byClass = {};
    all.forEach((h) => {
      if (!byClass[h.className]) byClass[h.className] = [];
      byClass[h.className].push(h);
    });

    container.innerHTML = Object.entries(byClass)
      .map(([className, snapshots]) => {
        // Build comparison table (students as rows, terms as columns)
        // Collect all unique student names across snapshots
        const allStudentNames = [
          ...new Set(snapshots.flatMap((s) => s.students.map((st) => st.name))),
        ];
        const termCols = snapshots.map((s) => s.label);

        const headerCols = termCols
          .map(
            (t) =>
              `<th style="padding:.6rem 1rem;text-align:center;white-space:nowrap;font-size:.78rem;font-weight:700;color:var(--accent);border-bottom:2px solid var(--border);">${t}</th>`,
          )
          .join("");
        const dataRows = allStudentNames
          .map((name) => {
            const cells = snapshots
              .map((snap, si) => {
                const st = snap.students.find((s) => s.name === name);
                const overall = st ? computeStudentOverall(st) : null;
                const gr = gradeResult(overall);
                // Compare to previous snapshot
                let trend = "";
                if (si < snapshots.length - 1) {
                  const prevSnap = snapshots[si + 1];
                  const prevSt = prevSnap.students.find((s) => s.name === name);
                  const prevOverall = prevSt
                    ? computeStudentOverall(prevSt)
                    : null;
                  if (overall !== null && prevOverall !== null) {
                    const diff = overall - prevOverall;
                    if (diff > 0)
                      trend = `<span style="color:#00b894;font-size:.72rem;font-weight:700;margin-left:.3rem;">▲${diff}</span>`;
                    else if (diff < 0)
                      trend = `<span style="color:#ef476f;font-size:.72rem;font-weight:700;margin-left:.3rem;">▼${Math.abs(diff)}</span>`;
                    else
                      trend = `<span style="color:var(--muted);font-size:.72rem;margin-left:.3rem;">—</span>`;
                  }
                }
                if (overall === null)
                  return `<td style="padding:.6rem 1rem;text-align:center;color:var(--muted);font-size:.82rem;">—</td>`;
                return `<td style="padding:.6rem 1rem;text-align:center;">
            <span style="font-weight:700;font-family:var(--font-mono);font-size:.9rem;">${overall}%</span>
            <span class="grade-pill ${gr.cls}" style="font-size:.68rem;margin-left:.3rem;">${gr.g}</span>
            ${trend}
          </td>`;
              })
              .join("");
            return `<tr><td style="padding:.6rem 1rem;font-weight:600;font-size:.85rem;border-right:1px solid var(--border);">${name}</td>${cells}</tr>`;
          })
          .join("");

        const snapshotButtons = snapshots
          .map(
            (snap) =>
              `<span style="font-size:.75rem;background:var(--surface-2);border:1px solid var(--border);border-radius:var(--r-full);padding:.2rem .7rem;display:inline-flex;align-items:center;gap:.4rem;">
          ${snap.label}
          <button onclick="exportSnapshotBroadsheet('${snap.classId}','${snap.id}')" title="Export broadsheet" style="background:none;border:none;cursor:pointer;color:var(--accent);padding:0;font-size:.9rem;"><i class="bi bi-file-earmark-spreadsheet"></i></button>
          <button onclick="deleteTermSnapshot('${snap.classId}','${snap.id}')" title="Delete" style="background:none;border:none;cursor:pointer;color:var(--danger);padding:0;font-size:.85rem;"><i class="bi bi-trash3"></i></button>
        </span>`,
          )
          .join(" ");

        return `<div class="settings-section" style="margin-bottom:1.5rem;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.6rem;margin-bottom:1rem;">
          <h3 style="margin:0;"><i class="bi bi-clock-history" style="color:var(--accent);"></i> ${className}</h3>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap;">${snapshotButtons}</div>
        </div>
        <div style="overflow-x:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:.85rem;">
            <thead>
              <tr style="background:var(--surface-2);">
                <th style="padding:.6rem 1rem;text-align:left;font-size:.78rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid var(--border);">Student</th>
                ${headerCols}
              </tr>
            </thead>
            <tbody>${dataRows}</tbody>
          </table>
        </div>
      </div>`;
      })
      .join("");
  }

  // Export a historical snapshot as a broadsheet Excel
  window.exportSnapshotBroadsheet = function (classId, snapshotId) {
    const snap = (termHistory[classId] || []).find((h) => h.id === snapshotId);
    if (!snap) {
      showToast("Snapshot not found", "error");
      return;
    }
    if (!window.XLSX) {
      showToast("SheetJS not loaded", "error");
      return;
    }
    const ranked = rankStudents(snap.students);
    const subjects = snap.subjects;
    const h1 = ["S/N", "Student Name"];
    subjects.forEach((s) => {
      h1.push(s.name, "", "", "", "");
    });
    h1.push("Total", "Avg", "Grade", "Remark", "Position");
    const h2 = ["", ""];
    subjects.forEach(() => {
      h2.push("Test/20", "Prac/20", "Exam/60", "Total", "Grade");
    });
    h2.push("", "", "", "", "");
    const dataRows = ranked.map((s, idx) => {
      const row = [idx + 1, s.name];
      let totalSum = 0,
        totalCount = 0;
      subjects.forEach((sub) => {
        const found = s.subjects.find((ss) => ss.id === sub.id);
        const comp = found
          ? computeSubject(found)
          : { total: null, t: 0, p: 0, e: null };
        row.push(
          found?.test ?? "—",
          found?.prac ?? "—",
          found?.exam === "" ? "—" : (found?.exam ?? "—"),
          comp.total ?? "—",
          gradeResult(comp.total).g,
        );
        if (comp.total !== null) {
          totalSum += comp.total;
          totalCount++;
        }
      });
      const avg = totalCount ? Math.round(totalSum / totalCount) : null;
      const gr = gradeResult(avg);
      row.push(
        totalCount > 0 ? totalSum : "—",
        avg ?? "—",
        gr.g,
        gr.r,
        s.pos ? ordinal(s.pos) : "—",
      );
      return row;
    });
    const wb = XLSX.utils.book_new();
    const wsData = [
      [`${snap.className} — BROADSHEET`, snap.label],
      [settings.pdfSchool || currentUser?.org || ""],
      [],
      h1,
      h2,
      ...dataRows,
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    const wscols = [{ wch: 5 }, { wch: 28 }];
    subjects.forEach(() => {
      [6, 6, 6, 7, 6].forEach((w) => wscols.push({ wch: w }));
    });
    [8, 6, 8, 14, 10].forEach((w) => wscols.push({ wch: w }));
    ws["!cols"] = wscols;
    XLSX.utils.book_append_sheet(wb, ws, snap.className.slice(0, 31));
    XLSX.writeFile(
      wb,
      `${snap.className}_Broadsheet_${snap.label.replace(/[·\s\/]/g, "_")}.xlsx`,
    );
    showToast(`✅ Exported: ${snap.label}`, "success");
  };

  window.confirmClearData = function () {
    if (
      !confirm(
        "⚠ This will permanently delete ALL your classes and student data. Are you sure?",
      )
    )
      return;
    classes = [];
    allStudents = {};
    allMaterials = {};
    activeClassId = null;
    activeSubjectId = null;
    saveData();
    saveMaterials();
    renderSidebarClasses();
    renderSubjectTabs();
    renderTable();
    updateStats();
    if (activeView === "materials") renderMaterials();
    showToast("All data cleared", "info");
  };

  // ════════════════════════════════════════════════════
  //  SETTINGS
  // ════════════════════════════════════════════════════
  function loadSettings() {
    document.getElementById("settingName").value = currentUser?.name || "";
    document.getElementById("settingSchool").value = currentUser?.org || "";
    document.getElementById("settingEmail").value = currentUser?.email || "";
    document.getElementById("settingPdfSchool").value =
      settings.pdfSchool || currentUser?.org || "";
    document.getElementById("settingSession").value =
      settings.session || "2025/2026";
    document.getElementById("settingMotto").value = settings.motto || "";
    const termSel = document.getElementById("settingTerm");
    for (let o of termSel.options) {
      if (o.value === settings.term) {
        o.selected = true;
        break;
      }
    }
    document.getElementById("darkToggle").checked =
      document.documentElement.getAttribute("data-theme") === "dark";
    const scale = getGradeScale();
    ["A", "B", "C", "D", "E"].forEach((g, i) => {
      const el = document.getElementById("gsMin_" + g);
      if (el) el.value = scale[i].min;
    });
    renderGradeScalePreview();

    // Load AI settings
    const aiTone = settings.aiTone || "encouraging";
    const aiLanguage = settings.aiLanguage || "English";
    document
      .querySelectorAll(".ai-tone-btn")
      .forEach((b) => b.classList.remove("active"));
    document
      .querySelector(`.ai-tone-btn[data-tone="${aiTone}"]`)
      ?.classList.add("active");
    const langSel = document.getElementById("aiLanguageSelect");
    if (langSel) langSel.value = aiLanguage;

    const logo = settings.logoDataUrl || "";
    const prev = document.getElementById("logoPreview");
    const rmBtn = document.getElementById("logoRemoveBtn");
    if (prev) {
      prev.src = logo;
      prev.style.display = logo ? "block" : "none";
    }
    if (rmBtn) rmBtn.style.display = logo ? "inline-flex" : "none";
    updateApiConfigSummary();
  }
  function updateApiConfigSummary() {
    const el = document.getElementById("apiConfigSummary");
    if (!el) return;
    if (!window.GradeFlowAPI) {
      el.textContent = "API layer unavailable";
      return;
    }
    const cfg = window.GradeFlowAPI.getConfig();
    if (cfg.provider === "nextjs") {
      el.textContent = cfg.baseUrl
        ? `Provider: ${cfg.provider} · Base: ${cfg.baseUrl}`
        : `Provider: ${cfg.provider} · Base not set`;
      return;
    }
    if (cfg.provider === "supabase") {
      el.textContent = cfg.supabaseConfigured
        ? "Provider: supabase · Credentials configured"
        : "Provider: supabase · Credentials missing";
      return;
    }
    el.textContent = `Provider: ${cfg.provider}`;
  }
  window.openApiConfig = function () {
    if (!window.GradeFlowAPI) {
      showToast("API layer unavailable", "error");
      return;
    }
    const providerRaw = prompt(
      "Choose provider: local, supabase, or nextjs",
      window.GradeFlowAPI.getConfig().provider || "local",
    );
    if (providerRaw === null) return;
    const firstInput = providerRaw.trim();
    let provider = firstInput.toLowerCase();
    // UX guard: many users paste URL first. Auto-detect common provider URLs.
    if (provider.includes("supabase.co")) provider = "supabase";
    if (provider.startsWith("http://") || provider.startsWith("https://")) {
      if (provider.includes("supabase.co")) {
        provider = "supabase";
      } else {
        provider = "nextjs";
      }
    }
    if (!["local", "supabase", "nextjs"].includes(provider)) {
      showToast("Invalid provider. Use: local, supabase, nextjs", "error");
      return;
    }
    window.GradeFlowAPI.setProvider(provider);
    if (provider === "nextjs") {
      const base = prompt(
        "Enter Next.js API base URL (e.g. https://your-app.com)",
        firstInput.startsWith("http://") || firstInput.startsWith("https://")
          ? firstInput
          : window.GradeFlowAPI.getConfig().baseUrl || "",
      );
      if (base !== null) window.GradeFlowAPI.setBaseUrl(base);
    }
    if (provider === "supabase") {
      const url = prompt(
        "Enter Supabase project URL (e.g. https://your-project-id.supabase.co)",
        firstInput.includes("supabase.co")
          ? firstInput
          : localStorage.getItem("gf_supabase_url") || "",
      );
      if (url === null) {
        updateApiConfigSummary();
        return;
      }
      const key = prompt(
        "Enter Supabase anon public key",
        localStorage.getItem("gf_supabase_key") || "",
      );
      if (key === null) {
        updateApiConfigSummary();
        return;
      }
      if (window.GradeFlowAPI.setSupabaseConfig) {
        window.GradeFlowAPI.setSupabaseConfig(url, key);
      } else {
        localStorage.setItem("gf_supabase_url", (url || "").trim());
        localStorage.setItem("gf_supabase_key", (key || "").trim());
      }
    }
    if (provider !== "nextjs") {
      window.GradeFlowAPI.setBaseUrl("");
    }
    updateApiConfigSummary();
    showToast("API connector updated", "success");
  };
  window.saveProfile = function () {
    if (!currentUser) return;
    const oldEmail = currentUser.email;
    const newName = document.getElementById("settingName").value.trim();
    const newOrg = document.getElementById("settingSchool").value.trim();
    const newEmailRaw = document.getElementById("settingEmail").value.trim();
    const newEmail = newEmailRaw.toLowerCase();
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!newEmail || !emailRe.test(newEmail)) {
      showToast("Please enter a valid email address", "error");
      return;
    }
    const accounts = JSON.parse(localStorage.getItem("gf_accounts") || "{}");
    if (newEmail !== oldEmail && accounts[newEmail]) {
      showToast("That email is already in use by another account", "error");
      return;
    }
    currentUser.name = newName || currentUser.name;
    currentUser.org = newOrg || currentUser.org;
    currentUser.email = newEmail;
    if (oldEmail !== newEmail) {
      _migrateUserEmailData(oldEmail, newEmail);
    }
    saveUserToStorage(currentUser);
    updateSidebarUser();
    showToast("✅ Profile saved", "success");
  };
  window.saveReportSettings = function () {
    settings.pdfSchool = document
      .getElementById("settingPdfSchool")
      .value.trim();
    settings.session = document.getElementById("settingSession").value.trim();
    settings.motto = document.getElementById("settingMotto").value.trim();
    settings.term = document.getElementById("settingTerm").value;
    saveData();
    showToast("✅ Report settings saved", "success");
  };

  window.saveAiSettings = function () {
    const tone =
      document.querySelector(".ai-tone-btn.active")?.dataset?.tone ||
      "encouraging";
    const language = document.getElementById("aiLanguageSelect").value;
    settings.aiTone = tone;
    settings.aiLanguage = language;
    saveData();
    showToast("✅ AI settings saved", "success");
  };

  // ════════════════════════════════════════════════════
  //  DARK MODE
  // ════════════════════════════════════════════════════
  window.toggleDarkMode = function () {
    const isDark =
      document.documentElement.getAttribute("data-theme") === "dark";
    document.documentElement.setAttribute(
      "data-theme",
      isDark ? "light" : "dark",
    );
    document.getElementById("themeIcon").className = isDark
      ? "bi bi-moon-stars-fill"
      : "bi bi-sun-fill";
    document.getElementById("themeLabel").textContent = isDark
      ? "Dark mode"
      : "Light mode";
    document.getElementById("darkToggle").checked = !isDark;
    if (currentUser) {
      settings.darkMode = !isDark;
      saveData();
    }
    localStorage.setItem("gf_theme", !isDark ? "dark" : "light");
    if (scoreChart) renderAnalytics();
  };

  // ════════════════════════════════════════════════════
  //  CLASS MANAGEMENT
  // ════════════════════════════════════════════════════
  window.openAddClassModal = function () {
    document.getElementById("newClassName").value = "";
    document.getElementById("newClassSubject").value = "";
    document.getElementById("addClassModal").classList.add("active");
    setTimeout(() => document.getElementById("newClassName").focus(), 100);
  };
  window.confirmAddClass = function () {
    const name = document.getElementById("newClassName").value.trim();
    const subj =
      document.getElementById("newClassSubject").value.trim() || "General";
    const emoji = document.getElementById("newClassEmoji").value;
    if (!name) {
      showToast("Enter a class name", "error");
      return;
    }
    const newId = "cls_" + Date.now();
    const subjId = "subj_" + Date.now();
    classes.push({
      id: newId,
      name,
      emoji,
      subjects: [{ id: subjId, name: subj }],
    });
    allStudents[newId] = [];
    activeClassId = newId;
    activeSubjectId = subjId;
    closeModal("addClassModal");
    renderSidebarClasses();
    renderSubjectTabs();
    renderTable();
    updateStats();
    saveData();
    showToast(`✅ Class "${name}" created`, "success");
  };

  window.openDeleteClassModal = function (classId) {
    classToDelete = classId;
    const cls = classes.find((c) => c.id === classId);
    document.getElementById("deleteClassMsg").textContent =
      `Delete "${cls?.name}"? This will remove all ${(allStudents[classId] || []).length} students and all scores.`;
    document.getElementById("deleteClassModal").classList.add("active");
  };
  window.confirmDeleteClass = function () {
    if (!classToDelete) return;
    const cls = classes.find((c) => c.id === classToDelete);
    classes = classes.filter((c) => c.id !== classToDelete);
    delete allStudents[classToDelete];
    delete allMaterials[classToDelete];
    if (activeClassId === classToDelete) {
      activeClassId = classes.length ? classes[0].id : null;
      activeSubjectId = activeClassId ? classes[0]?.subjects?.[0]?.id : null;
    }
    classToDelete = null;
    closeModal("deleteClassModal");
    renderSidebarClasses();
    renderSubjectTabs();
    renderTable();
    updateStats();
    saveData();
    saveMaterials();
    if (activeView === "materials") renderMaterials();
    showToast(`"${cls?.name}" deleted`, "info");
  };

  // ════════════════════════════════════════════════════
  //  SUBJECT MANAGEMENT
  // ════════════════════════════════════════════════════
  window.openAddSubjectModal = function () {
    openSubjectPicker();
  };
  window.confirmAddSubject = function () {
    const name = document.getElementById("newSubjectName").value.trim();
    if (!name) {
      showToast("Enter a subject name", "error");
      return;
    }
    const cls = classes.find((c) => c.id === activeClassId);
    if (!cls) return;
    if (cls.subjects.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      showToast("Subject already exists", "error");
      return;
    }
    const newSubj = { id: "subj_" + Date.now(), name };
    cls.subjects.push(newSubj);
    (allStudents[activeClassId] || []).forEach((s) => {
      s.subjects.push({
        id: newSubj.id,
        name,
        test: 0,
        prac: 0,
        exam: "",
        total: null,
      });
    });
    activeSubjectId = newSubj.id;
    closeModal("addSubjectModal");
    renderSubjectTabs();
    renderTable();
    saveData();
    showToast(`✅ Subject "${name}" added`, "success");
  };

  // ════════════════════════════════════════════════════
  //  STUDENT MANAGEMENT
  // ════════════════════════════════════════════════════
  window.openAddStudentModal = function () {
    if (!activeClassId) {
      showToast("Select a class first", "error");
      return;
    }
    document.getElementById("newStudentName").value = "";
    document.getElementById("addStudentModal").classList.add("active");
    setTimeout(() => document.getElementById("newStudentName").focus(), 100);
  };
  window.confirmAddStudent = function () {
    const name = document.getElementById("newStudentName").value.trim();
    if (!name) {
      showToast("Enter student name", "error");
      return;
    }
    const cls = classes.find((c) => c.id === activeClassId);
    if (!cls) return;
    if (!allStudents[activeClassId]) allStudents[activeClassId] = [];
    allStudents[activeClassId].push({
      id: "s_" + Date.now(),
      name,
      subjects: cls.subjects.map((s) => ({
        id: s.id,
        name: s.name,
        test: 0,
        prac: 0,
        exam: "",
        total: null,
      })),
    });
    closeModal("addStudentModal");
    renderTable();
    renderSidebarClasses();
    updateStats();
    saveData();
    showToast(`✅ ${name} added`, "success");
  };

  // ════════════════════════════════════════════════════
  //  AUTH — MULTI-ACCOUNT LOCAL STORAGE
  // ════════════════════════════════════════════════════
  function saveUserToStorage(user, oldEmail) {
    localStorage.setItem("gf_current_user", user.email);
    let accounts = JSON.parse(localStorage.getItem("gf_accounts") || "{}");
    if (oldEmail && oldEmail !== user.email) {
      delete accounts[oldEmail];
    }
    const existing = accounts[user.email] || {};
    accounts[user.email] = {
      ...existing,
      name: user.name,
      org: user.org,
      email: user.email,
      role: normalizeRole(user.role),
      schoolCode: user.schoolCode || existing.schoolCode || "",
    };
    localStorage.setItem("gf_accounts", JSON.stringify(accounts));
  }
  function _loginAttemptKey(email) {
    return `gf_login_attempts_${email}`;
  }
  function _getLoginAttemptState(email) {
    try {
      return (
        JSON.parse(localStorage.getItem(_loginAttemptKey(email)) || "null") || {
          count: 0,
          blockedUntil: 0,
        }
      );
    } catch {
      return { count: 0, blockedUntil: 0 };
    }
  }
  function _recordLoginFailure(email) {
    const state = _getLoginAttemptState(email);
    const now = Date.now();
    state.count = (state.count || 0) + 1;
    if (state.count >= 5) {
      state.blockedUntil = now + 5 * 60 * 1000;
      state.count = 0;
    }
    safeSave(_loginAttemptKey(email), JSON.stringify(state));
  }
  function _clearLoginAttempts(email) {
    localStorage.removeItem(_loginAttemptKey(email));
  }
  function _isLoginBlocked(email) {
    const state = _getLoginAttemptState(email);
    const now = Date.now();
    if (state.blockedUntil && state.blockedUntil > now) {
      const mins = Math.max(1, Math.ceil((state.blockedUntil - now) / 60000));
      return { blocked: true, mins };
    }
    return { blocked: false, mins: 0 };
  }
  function _migrateUserEmailData(oldEmail, newEmail) {
    if (!oldEmail || !newEmail || oldEmail === newEmail) return;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) keys.push(k);
    }
    const oldPrefix = `gf_${oldEmail}_`;
    const newPrefix = `gf_${newEmail}_`;
    keys.forEach((k) => {
      if (!k.startsWith(oldPrefix)) return;
      const v = localStorage.getItem(k);
      if (v == null) return;
      const nk = newPrefix + k.slice(oldPrefix.length);
      safeSave(nk, v);
      localStorage.removeItem(k);
    });
    const oldPass = localStorage.getItem(`gf_pass_${oldEmail}`);
    if (oldPass != null) {
      safeSave(`gf_pass_${newEmail}`, oldPass);
      localStorage.removeItem(`gf_pass_${oldEmail}`);
    }
    const oldPlan = localStorage.getItem(`gf_plan_${oldEmail}`);
    if (oldPlan != null) {
      safeSave(`gf_plan_${newEmail}`, oldPlan);
      localStorage.removeItem(`gf_plan_${oldEmail}`);
    }
  }
  function simpleHash(str) {
    let h = 0;
    for (let c of str) {
      h = (h << 5) - h + c.charCodeAt(0);
      h |= 0;
    }
    return String(h);
  }

  window.showMainLogin = function (mode = "login") {
    showPage("login");
    switchRouteAuthTab(mode);
  };

  window.showPortalLogin = function () {
    showPage("portal-login");
    setPortalRole(portalSelectedRole || "staff");
  };

  window.openAuthModal = function (mode) {
    showMainLogin(mode || "login");
  };

  window.switchRouteAuthTab = function (mode) {
    document.getElementById("routeLoginFields").style.display =
      mode === "login" ? "" : "none";
    document.getElementById("routeSignupFields").style.display =
      mode === "signup" ? "" : "none";
    document
      .getElementById("routeLoginTab")
      .classList.toggle("active", mode === "login");
    document
      .getElementById("routeSignupTab")
      .classList.toggle("active", mode === "signup");
  };

  window.setPortalRole = function (role) {
    portalSelectedRole = normalizeRole(role);
    document.querySelectorAll(".portal-role-card").forEach((card) => {
      card.classList.toggle("active", card.dataset.role === portalSelectedRole);
    });
    const hint = document.getElementById("portalRoleHint");
    if (hint) hint.textContent = `Sign in as ${roleLabel(portalSelectedRole)}`;
    const suRole = document.getElementById("routeSignupRole");
    if (suRole) suRole.value = portalSelectedRole;
  };

  window.switchAuthTab = function (mode) {
    document.getElementById("loginFields").style.display =
      mode === "login" ? "" : "none";
    document.getElementById("signupFields").style.display =
      mode === "signup" ? "" : "none";
    document
      .getElementById("loginTab")
      .classList.toggle("active", mode === "login");
    document
      .getElementById("signupTab")
      .classList.toggle("active", mode === "signup");
    document.getElementById("authTitle").textContent =
      mode === "login" ? "Welcome back 👋" : "Create your account";
    document.getElementById("authSubtitle").textContent =
      mode === "login"
        ? "Log in to your GradeFlow account"
        : "Start managing grades in minutes";
  };
  window.togglePassVis = function (inputId, btn) {
    const input = document.getElementById(inputId);
    const isPass = input.type === "password";
    input.type = isPass ? "text" : "password";
    btn.innerHTML = isPass
      ? '<i class="bi bi-eye-slash"></i>'
      : '<i class="bi bi-eye"></i>';
  };

  function _readLoginForm({ emailId, passId }) {
    return {
      email: document.getElementById(emailId)?.value?.trim() || "",
      pass: document.getElementById(passId)?.value || "",
    };
  }

  function _readSignupForm({
    nameId,
    orgId,
    emailId,
    passId,
    roleId,
    consentId,
  }) {
    return {
      name: document.getElementById(nameId)?.value?.trim() || "",
      org: document.getElementById(orgId)?.value?.trim() || "",
      email: document.getElementById(emailId)?.value?.trim() || "",
      pass: document.getElementById(passId)?.value || "",
      role: normalizeRole(document.getElementById(roleId)?.value || "teacher"),
      consent: Boolean(document.getElementById(consentId)?.checked),
    };
  }

  async function _processSignup(formData, options) {
    const { name, org, email, pass, role, consent } = formData;
    const { closeAuthModal = false } = options || {};
    if (!name) {
      showToast("Please enter your name", "error");
      return;
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!email || !emailRe.test(email)) {
      showToast("Please enter a valid email address", "error");
      return;
    }
    if (!pass || pass.length < 8) {
      showToast("Password must be at least 8 characters", "error");
      return;
    }
    if (!consent) {
      showToast("Please accept Terms and Privacy Policy to continue", "error");
      return;
    }
    const normalizedEmail = email.toLowerCase();
    const accounts = JSON.parse(localStorage.getItem("gf_accounts") || "{}");
    if (accounts[normalizedEmail]) {
      showToast(
        "An account with this email already exists. Please log in.",
        "error",
      );
      return;
    }
    currentUser = {
      name,
      org: org || "My School",
      email: normalizedEmail,
      role: normalizeRole(role),
      schoolCode: "",
    };
    saveUserToStorage(currentUser);
    const passRecord = await _createPasswordRecord(pass);
    safeSave(`gf_pass_${normalizedEmail}`, passRecord);
    _setConsentAccepted(normalizedEmail);
    _clearLoginAttempts(normalizedEmail);
    if (window.GradeFlowAPI) {
      const cloudSignUp = await window.GradeFlowAPI.signUp({
        name,
        org: org || "My School",
        email: normalizedEmail,
        role: normalizeRole(role),
      }).catch((e) => ({
        ok: false,
        message: e?.message || "Cloud signup failed",
      }));
      if (cloudSignUp && cloudSignUp.ok === false) {
        showToast(
          `Cloud sync warning: ${cloudSignUp.message || "Supabase signup failed"}`,
          "warning",
        );
      }
    }
    // Mark as brand-new account so enterDashboard shows onboarding
    localStorage.setItem(`gf_new_account_${normalizedEmail}`, "1");
    loadUserData();
    if (closeAuthModal) closeModal("authModal");
    enterDashboard();
    showToast(
      `🎉 Welcome, ${name.split(" ")[0]}! Let's set up your first class.`,
      "success",
    );
  }

  window.handleSignup = async function () {
    const formData = _readSignupForm({
      nameId: "su-name",
      orgId: "su-org",
      emailId: "su-email",
      passId: "su-pass",
      roleId: "su-role",
      consentId: "su-consent",
    });
    await _processSignup(formData, { closeAuthModal: true });
  };

  window.handleRouteSignup = async function () {
    const formData = _readSignupForm({
      nameId: "routeSignupName",
      orgId: "routeSignupOrg",
      emailId: "routeSignupEmail",
      passId: "routeSignupPass",
      roleId: "routeSignupRole",
      consentId: "routeSignupConsent",
    });
    await _processSignup(formData, { closeAuthModal: false });
  };

  async function _processLogin(formData, options) {
    const { email: rawEmail, pass } = formData;
    const opts = options || {};
    const requestedRole = opts.requestedRole
      ? normalizeRole(opts.requestedRole)
      : null;
    const email = rawEmail.toLowerCase();
    const emailReL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!email || !emailReL.test(email)) {
      showToast("Please enter a valid email address", "error");
      return;
    }
    if (!pass) {
      showToast("Please enter your password", "error");
      return;
    }
    const blocked = _isLoginBlocked(email);
    if (blocked.blocked) {
      showToast(
        `Too many attempts. Try again in ${blocked.mins} minute(s).`,
        "error",
      );
      return;
    }
    const accounts = JSON.parse(localStorage.getItem("gf_accounts") || "{}");
    if (!accounts[email]) {
      _recordLoginFailure(email);
      showToast("No account found with this email. Please sign up.", "error");
      return;
    }
    const passwordOk = await _verifyPassword(email, pass);
    if (!passwordOk) {
      _recordLoginFailure(email);
      showToast("Incorrect password. Please try again.", "error");
      return;
    }
    _clearLoginAttempts(email);
    currentUser = accounts[email];
    ensureCurrentUserRole();
    saveUserToStorage(currentUser);
    if (requestedRole && normalizeRole(currentUser.role) !== requestedRole) {
      showToast(
        `This account is registered as ${roleLabel(currentUser.role)}, not ${roleLabel(requestedRole)}.`,
        "error",
      );
      return;
    }
    localStorage.setItem("gf_current_user", email);
    if (window.GradeFlowAPI) {
      const cloudLogin = await window.GradeFlowAPI.login({ email }).catch(
        (e) => ({ ok: false, message: e?.message || "Cloud login failed" }),
      );
      if (cloudLogin && cloudLogin.ok === false) {
        showToast(
          `Cloud sync warning: ${cloudLogin.message || "Supabase login failed"}`,
          "warning",
        );
      }
    }
    loadUserData();
    if (opts.closeAuthModal) closeModal("authModal");
    if (!_hasConsent(email)) {
      openConsentModal(true);
      showToast(
        "Please review and accept Terms/Privacy to continue.",
        "warning",
      );
      return;
    }
    enterDashboard();
    showToast(`✅ Welcome back, ${currentUser.name.split(" ")[0]}!`, "success");
  }

  window.handleLogin = async function () {
    const formData = _readLoginForm({
      emailId: "li-email",
      passId: "li-pass",
    });
    await _processLogin(formData, { closeAuthModal: true });
  };

  window.handleRouteLogin = async function () {
    const formData = _readLoginForm({
      emailId: "routeLoginEmail",
      passId: "routeLoginPass",
    });
    await _processLogin(formData, { closeAuthModal: false });
  };

  window.handlePortalLogin = async function () {
    const formData = _readLoginForm({
      emailId: "portalEmail",
      passId: "portalPass",
    });
    await _processLogin(formData, {
      closeAuthModal: false,
      requestedRole: portalSelectedRole,
    });
  };

  // ════════════════════════════════════════════════════
  //  SUBSCRIPTION / TIER SYSTEM
  // ════════════════════════════════════════════════════
  // ════════════════════════════════════════════════════
  //  ⚙️  DEVELOPER CONFIG — edit these values only
  // ════════════════════════════════════════════════════
  //
  //  ADMIN_EMAILS: Any email in this list gets FULL PRO
  //  access for free, permanently. No payment needed.
  //  Add your own email here and you will NEVER see
  //  the upgrade prompt or hit any feature limit.
  //  You can also add multiple emails (comma-separated).
  //
  const ADMIN_EMAILS = [
    "oshinayadamilola3@gmail.com", // ← developer / owner (always has full access)
    // "colleague@email.com",       // ← add more dev/tester emails here if needed
  ];

  const FREE_CLASS_LIMIT = 2; // max classes on free plan
  const FREE_STUDENT_LIMIT = 35; // max total students on free plan
  const FREE_PDF_LIMIT = 3; // max PDF exports per term on free plan
  const PRO_PRICE_LABEL = "₦5,000/term";
  const SCHOOL_PRICE_LABEL = "₦25,000/term"; // up to 20 teachers
  const WHATSAPP_NUMBER = "2348027721006"; // ← your WhatsApp (no + sign, e.g. 2348012345678)

  function isAdmin() {
    return ADMIN_EMAILS.includes((currentUser?.email || "").toLowerCase());
  }

  // Generate a tamper-detection signature for plan objects
  function _planSig(email, tier, expiresAt) {
    return simpleHash("gf_integrity_" + email + tier + String(expiresAt));
  }

  function getPlan() {
    if (!currentUser) return "free";
    if (isAdmin()) return "admin";
    // Check individual Pro plan
    const key = `gf_plan_${currentUser.email}`;
    let plan = {};
    try {
      plan = JSON.parse(localStorage.getItem(key) || "{}");
    } catch (e) {}
    if (plan.tier === "pro") {
      // Verify integrity signature — rejects manually crafted entries
      const expectedSig = _planSig(currentUser.email, "pro", plan.expiresAt);
      if (plan._sig !== expectedSig) return "free"; // tampered — ignore
      if (!plan.expiresAt || Date.now() <= plan.expiresAt) return "pro";
    }
    // Check school access code
    const schoolCode = localStorage.getItem(
      `gf_school_code_${currentUser.email}`,
    );
    if (schoolCode) {
      const codeData = getSchoolCodeData(schoolCode);
      if (
        codeData &&
        codeData.tier === "school" &&
        (!codeData.expiresAt || Date.now() <= codeData.expiresAt)
      ) {
        return "school";
      } else {
        // code expired or invalid — clean up
        localStorage.removeItem(`gf_school_code_${currentUser.email}`);
      }
    }
    return "free";
  }

  // Helper: read a school code's data from localStorage (admin stores it as gf_scode_CODENAME)
  function getSchoolCodeData(code) {
    if (!code) return null;
    try {
      return JSON.parse(
        localStorage.getItem(`gf_scode_${code.toUpperCase()}`) || "null",
      );
    } catch (e) {
      return null;
    }
  }

  // isPro: For Phase 2, always return true (all features enabled)
  // In Phase 3, uncomment the original check:
  function isPro() {
    // PHASE 2: All features unlocked for testing
    return true;
    // Original check for Phase 3:
    // const p = getPlan();
    // return p === "pro" || p === "school" || p === "admin";
  }

  // Shorthand: true for both pro AND admin

  // PDF counter — keyed by term+session so it resets automatically each new term
  function getPdfCountKey() {
    const t = (settings.term || "T").replace(/\s/g, "_");
    const s = (settings.session || "S").replace(/\//g, "-");
    return `gf_pdfcount_${currentUser?.email || "guest"}_${t}_${s}`;
  }
  function getPdfCount() {
    return parseInt(localStorage.getItem(getPdfCountKey()) || "0");
  }
  function incrementPdfCount() {
    localStorage.setItem(getPdfCountKey(), String(getPdfCount() + 1));
  }

  // ── Feature gate functions (all funnelled through isPro()) ─────────────────
  function canUsePDF() {
    return isPro() || getPdfCount() < FREE_PDF_LIMIT;
  }
  function canUseBulkPDF() {
    return isPro();
  }
  function canUseBroadsheet() {
    return isPro();
  }
  function canUseCBT() {
    return isPro();
  }
  function canUseMaterials() {
    return isPro();
  }
  function canUseAIComment() {
    return isPro();
  }
  function canUseTermHistory() {
    return isPro();
  }
  function canImportExcel() {
    return isPro();
  }

  window.adminGrantPro = function () {
    if (!isAdmin()) {
      showToast("Not authorised", "error");
      return;
    }
    const emailEl = document.getElementById("adminGrantEmail");
    const monthsEl = document.getElementById("adminGrantMonths");
    if (!emailEl || !monthsEl) return;
    const email = emailEl.value.trim().toLowerCase();
    const months = parseInt(monthsEl.value) || 4;
    if (!email || !email.includes("@")) {
      showToast("Enter a valid email", "error");
      return;
    }
    const expiresAt = Date.now() + months * 30 * 24 * 60 * 60 * 1000;
    localStorage.setItem(
      `gf_plan_${email}`,
      JSON.stringify({
        tier: "pro",
        grantedAt: Date.now(),
        expiresAt,
        grantedBy: currentUser.email,
        _sig: _planSig(email, "pro", expiresAt),
      }),
    );
    showToast(`\u2705 Pro granted to ${email} for ${months} months`, "success");
    emailEl.value = "";
    renderSubscriptionPanel();
  };

  window.adminRevokePro = function (email) {
    if (!isAdmin()) return;
    localStorage.removeItem(`gf_plan_${email}`);
    showToast(`Pro revoked for ${email}`, "info");
    renderSubscriptionPanel();
  };

  // ════════════════════════════════════════════════════
  //  SCHOOL PLAN — Code generation & redemption
  // ════════════════════════════════════════════════════

  // Admin: generate a school access code
  window.adminCreateSchoolCode = function () {
    if (!isAdmin()) {
      showToast("Not authorised", "error");
      return;
    }
    const nameEl = document.getElementById("schoolCodeName");
    const monthsEl = document.getElementById("schoolCodeMonths");
    const seatsEl = document.getElementById("schoolCodeSeats");
    if (!nameEl || !monthsEl || !seatsEl) return;
    const rawName = nameEl.value.trim();
    const months = parseInt(monthsEl.value) || 4;
    const seats = parseInt(seatsEl.value) || 20;
    if (!rawName) {
      showToast("Enter school name / code label", "error");
      return;
    }
    // Generate code: SCHOOLINITIALS-YEAR-RANDOM
    const slug = rawName
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase()
      .slice(0, 6);
    const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
    const code = `${slug}-${new Date().getFullYear()}-${rand}`;
    const expiresAt = Date.now() + months * 30 * 24 * 60 * 60 * 1000;
    const codeData = {
      tier: "school",
      schoolName: rawName,
      code,
      seats,
      usedSeats: 0,
      usedBy: [],
      grantedAt: Date.now(),
      expiresAt,
      grantedBy: currentUser.email,
    };
    localStorage.setItem(`gf_scode_${code}`, JSON.stringify(codeData));
    nameEl.value = "";
    showToast(`✅ School code created: ${code}`, "success");
    renderSubscriptionPanel();
  };

  // Admin: revoke a school code
  window.adminRevokeSchoolCode = function (code) {
    if (!isAdmin()) return;
    if (
      !confirm(
        `Revoke school code "${code}"? All teachers using this code will lose Pro access.`,
      )
    )
      return;
    localStorage.removeItem(`gf_scode_${code}`);
    showToast(`School code ${code} revoked`, "info");
    renderSubscriptionPanel();
  };

  // Admin: list all school codes
  function getAllSchoolCodes() {
    const codes = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("gf_scode_")) {
        try {
          const d = JSON.parse(localStorage.getItem(k) || "null");
          if (d) codes.push(d);
        } catch (e) {}
      }
    }
    return codes.sort((a, b) => b.grantedAt - a.grantedAt);
  }

  // Teacher: redeem a school access code
  window.redeemSchoolCode = function () {
    const input = document.getElementById("schoolCodeInput");
    if (!input) return;
    const code = input.value.trim().toUpperCase();
    if (!code) {
      showToast("Enter a school access code", "error");
      return;
    }
    const codeData = getSchoolCodeData(code);
    if (!codeData) {
      showToast("Invalid code — check with your school admin", "error");
      return;
    }
    if (codeData.expiresAt && Date.now() > codeData.expiresAt) {
      showToast(
        "This school code has expired. Contact your school admin.",
        "error",
      );
      return;
    }
    if (codeData.usedBy && codeData.usedBy.includes(currentUser.email)) {
      // Already using this code — just re-link
      localStorage.setItem(`gf_school_code_${currentUser.email}`, code);
      showToast(
        `✅ Re-linked to ${codeData.schoolName} school plan`,
        "success",
      );
      renderSubscriptionPanel();
      return;
    }
    if (
      codeData.seats &&
      codeData.usedBy &&
      codeData.usedBy.length >= codeData.seats
    ) {
      showToast(
        `This school's ${codeData.seats}-seat plan is full. Ask your admin to get more seats.`,
        "error",
      );
      return;
    }
    // Link this teacher to the school code
    codeData.usedBy = [...(codeData.usedBy || []), currentUser.email];
    codeData.usedSeats = codeData.usedBy.length;
    localStorage.setItem(`gf_scode_${code}`, JSON.stringify(codeData));
    localStorage.setItem(`gf_school_code_${currentUser.email}`, code);
    input.value = "";
    showToast(
      `✅ School Pro access activated! Welcome to ${codeData.schoolName}.`,
      "success",
    );
    renderSubscriptionPanel();
  };

  // Teacher: leave a school plan
  window.leaveSchoolPlan = function () {
    if (!confirm("Leave your school plan? You'll return to the free plan."))
      return;
    localStorage.removeItem(`gf_school_code_${currentUser.email}`);
    showToast("Left school plan — you're now on the free plan", "info");
    renderSubscriptionPanel();
  };

  // Contact for school plan
  window.contactSchoolPlan = function () {
    const msg =
      encodeURIComponent(`Hello! I'm interested in the GradeFlow School Plan (${SCHOOL_PRICE_LABEL}) for our school.

School Name: 
Number of Teachers: 
Contact Name: ${currentUser?.name || ""}
Contact Email: ${currentUser?.email || ""}

Please send payment and setup details. Thank you.`);
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`, "_blank");
  };

  function getTotalStudentCount() {
    return Object.values(allStudents).reduce((sum, arr) => sum + arr.length, 0);
  }

  function canAddClass() {
    return isPro() || classes.length < FREE_CLASS_LIMIT;
  }
  function canAddStudent() {
    return isPro() || getTotalStudentCount() < FREE_STUDENT_LIMIT;
  }

  function showUpgradeModal(reason) {
    const el = document.getElementById("upgradeReason");
    if (el) el.textContent = reason;
    document.getElementById("upgradeModal").classList.add("active");
  }

  function renderAdminProList() {
    const proAccounts = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("gf_plan_")) {
        try {
          const data = JSON.parse(localStorage.getItem(k) || "{}");
          if (data && data.tier === "pro") {
            proAccounts.push({ email: k.replace("gf_plan_", ""), ...data });
          }
        } catch (e) {}
      }
    }
    if (!proAccounts.length)
      return `<div style="font-size:.82rem;color:var(--muted);">No Pro accounts yet.</div>`;
    return proAccounts
      .map((a) => {
        const expires = a.expiresAt
          ? new Date(a.expiresAt).toLocaleDateString("en-NG", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
          : "\u2014";
        const daysLeft = a.expiresAt
          ? Math.max(0, Math.ceil((a.expiresAt - Date.now()) / 86400000))
          : 0;
        const expired = daysLeft === 0;
        return `<div style="display:flex;align-items:center;justify-content:space-between;padding:.6rem 0;border-bottom:1px solid var(--border);gap:.5rem;flex-wrap:wrap;">
        <div>
          <div style="font-size:.85rem;font-weight:600;">${a.email}</div>
          <div style="font-size:.75rem;color:${expired ? "#ef476f" : "var(--muted)"};">${expired ? "Expired" : "Expires"} ${expires}${!expired ? " (" + daysLeft + " days)" : ""}</div>
        </div>
        <button class="btn btn-sm" onclick="adminRevokePro('${a.email}')" style="font-size:.75rem;color:#ef476f;border-color:#ef476f;">Revoke</button>
      </div>`;
      })
      .join("");
  }

  function renderAdminSchoolCodes() {
    const codes = getAllSchoolCodes();
    if (!codes.length)
      return `<div style="font-size:.82rem;color:var(--muted);">No school codes yet.</div>`;
    return codes
      .map((c) => {
        const exp = c.expiresAt
          ? new Date(c.expiresAt).toLocaleDateString("en-NG", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })
          : "—";
        const dLeft = c.expiresAt
          ? Math.max(0, Math.ceil((c.expiresAt - Date.now()) / 86400000))
          : 0;
        const expired = c.expiresAt && Date.now() > c.expiresAt;
        return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);padding:.9rem 1rem;margin-bottom:.6rem;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:.5rem;flex-wrap:wrap;">
          <div style="flex:1;min-width:180px;">
            <div style="font-weight:700;font-size:.88rem;margin-bottom:.2rem;">${c.schoolName}</div>
            <div style="font-family:var(--font-mono);font-size:.78rem;color:var(--accent);font-weight:700;letter-spacing:.5px;">${c.code}</div>
            <div style="font-size:.72rem;color:${expired ? "#ef476f" : "var(--muted)"};margin-top:.2rem;">
              ${expired ? "Expired" : "Expires"} ${exp}${!expired ? " · " + dLeft + " days left" : ""}
              · ${c.usedSeats || 0}/${c.seats} seats used
            </div>
          </div>
          <div style="display:flex;gap:.4rem;align-items:center;flex-shrink:0;">
            <button class="btn btn-sm" onclick="navigator.clipboard&&navigator.clipboard.writeText('${c.code}').then(()=>showToast('Code copied!','success'))" title="Copy code" style="font-size:.75rem;padding:.3rem .6rem;"><i class="bi bi-clipboard"></i></button>
            <button class="btn btn-sm" onclick="adminRevokeSchoolCode('${c.code}')" style="font-size:.75rem;color:#ef476f;border-color:#ef476f;padding:.3rem .6rem;"><i class="bi bi-trash3"></i></button>
          </div>
        </div>
      </div>`;
      })
      .join("");
  }

  function renderSubscriptionPanel() {
    const plan = getPlan();
    const panel = document.getElementById("subscriptionPanel");
    if (!panel) return;
    const totalStudents = getTotalStudentCount();

    if (plan === "admin") {
      panel.innerHTML = `
        <div style="background:linear-gradient(135deg,#7209b7,#4361ee);border-radius:var(--r-lg);padding:1.4rem;color:white;margin-bottom:1.5rem;">
          <div style="display:flex;align-items:center;gap:.7rem;margin-bottom:.5rem;">
            <i class="bi bi-shield-fill-check" style="font-size:1.4rem;"></i>
            <span style="font-size:1rem;font-weight:700;">Admin Account</span>
          </div>
          <div style="font-size:.82rem;opacity:.85;">Full unlimited access. No payment required.</div>
        </div>
        <div style="background:var(--surface-2);border-radius:var(--r-md);padding:1.2rem;margin-bottom:1.2rem;">
          <div style="font-weight:700;margin-bottom:1rem;font-size:.9rem;">\uD83D\uDD11 Grant Pro Access to a Teacher</div>
          <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:.6rem;">
            <input type="email" class="form-input" id="adminGrantEmail" placeholder="teacher@email.com" style="flex:1;min-width:180px;"/>
            <select class="form-input" id="adminGrantMonths" style="max-width:145px;">
              <option value="4">1 Term (~4mo)</option>
              <option value="8">2 Terms (~8mo)</option>
              <option value="12">3 Terms (1yr)</option>
            </select>
            <button class="btn btn-primary btn-sm" onclick="adminGrantPro()"><i class="bi bi-unlock-fill"></i> Grant Pro</button>
          </div>
        </div>
        <div style="background:var(--surface-2);border-radius:var(--r-md);padding:1.2rem;">
          <div style="font-weight:700;margin-bottom:.8rem;font-size:.85rem;">Active Pro Accounts</div>
          <div id="adminProListBody">${renderAdminProList()}</div>
        </div>
        <div style="background:var(--surface-2);border-radius:var(--r-md);padding:1.2rem;margin-top:1rem;">
          <div style="font-weight:700;margin-bottom:1rem;font-size:.9rem;">🏫 Create School Access Code</div>
          <div style="display:flex;gap:.6rem;flex-wrap:wrap;margin-bottom:.6rem;">
            <input type="text" class="form-input" id="schoolCodeName" placeholder="School name e.g. Greenfield Academy" style="flex:1;min-width:200px;"/>
            <select class="form-input" id="schoolCodeSeats" style="max-width:120px;">
              <option value="10">10 seats</option>
              <option value="20" selected>20 seats</option>
              <option value="30">30 seats</option>
              <option value="50">50 seats</option>
              <option value="100">100 seats</option>
            </select>
            <select class="form-input" id="schoolCodeMonths" style="max-width:145px;">
              <option value="4">1 Term (~4mo)</option>
              <option value="8">2 Terms (~8mo)</option>
              <option value="12">3 Terms (1yr)</option>
            </select>
            <button class="btn btn-primary btn-sm" onclick="adminCreateSchoolCode()"><i class="bi bi-building-fill-add"></i> Create Code</button>
          </div>
          <div style="font-weight:700;margin:1rem 0 .6rem;font-size:.82rem;">Active School Codes</div>
          <div id="adminSchoolCodesBody">${renderAdminSchoolCodes()}</div>
        </div>`;
    } else if (plan === "school") {
      const _code =
        localStorage.getItem(`gf_school_code_${currentUser.email}`) || "";
      const _cd = getSchoolCodeData(_code) || {};
      const _expDate = _cd.expiresAt
        ? new Date(_cd.expiresAt).toLocaleDateString("en-NG", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "N/A";
      const _dLeft = _cd.expiresAt
        ? Math.max(0, Math.ceil((_cd.expiresAt - Date.now()) / 86400000))
        : 0;
      const _urg = _dLeft <= 14 ? "#ef476f" : "var(--emerald)";
      panel.innerHTML = `
        <div style="background:linear-gradient(135deg,#f9a825,#ef476f);border-radius:var(--r-lg);padding:1.4rem;color:white;margin-bottom:1.2rem;">
          <div style="display:flex;align-items:center;gap:.7rem;margin-bottom:.4rem;">
            <i class="bi bi-building-fill-check" style="font-size:1.4rem;"></i>
            <span style="font-size:1rem;font-weight:700;">School Plan — Active ✓</span>
          </div>
          <div style="font-size:.82rem;opacity:.9;">${_cd.schoolName || "Your School"} · All Pro features unlocked.</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.7rem;margin-bottom:1rem;">
          <div style="background:var(--surface-2);border-radius:var(--r-md);padding:.8rem 1rem;">
            <div style="font-size:.7rem;color:var(--muted);margin-bottom:.2rem;">School Code</div>
            <div style="font-weight:700;font-size:.82rem;font-family:var(--font-mono);">${_code}</div>
          </div>
          <div style="background:var(--surface-2);border-radius:var(--r-md);padding:.8rem 1rem;">
            <div style="font-size:.7rem;color:var(--muted);margin-bottom:.2rem;">Expires</div>
            <div style="font-weight:700;font-size:.82rem;">${_expDate}</div>
          </div>
          <div style="background:var(--surface-2);border-radius:var(--r-md);padding:.8rem 1rem;">
            <div style="font-size:.7rem;color:var(--muted);margin-bottom:.2rem;">Seats used</div>
            <div style="font-weight:700;font-size:.82rem;">${_cd.usedSeats || 1} / ${_cd.seats || "∞"}</div>
          </div>
          <div style="background:var(--surface-2);border-radius:var(--r-md);padding:.8rem 1rem;">
            <div style="font-size:.7rem;color:var(--muted);margin-bottom:.2rem;">Days left</div>
            <div style="font-weight:800;font-size:1rem;color:${_urg};">${_dLeft}</div>
          </div>
        </div>
        ${_dLeft <= 14 ? `<div style="padding:.8rem 1rem;background:#fff0f3;border:1px solid #ef476f;border-radius:var(--r-md);color:#ef476f;font-size:.82rem;font-weight:600;margin-bottom:.8rem;"><i class="bi bi-exclamation-triangle-fill"></i> School plan expires soon. Ask your school admin to renew.</div>` : ""}
        <button class="btn btn-sm" onclick="leaveSchoolPlan()" style="color:var(--muted);font-size:.78rem;"><i class="bi bi-box-arrow-left"></i> Leave school plan</button>`;
    } else if (plan === "pro") {
      let planData = {};
      try {
        planData = JSON.parse(
          localStorage.getItem(`gf_plan_${currentUser.email}`) || "{}",
        );
      } catch (e) {}
      const expiresDate = planData.expiresAt
        ? new Date(planData.expiresAt).toLocaleDateString("en-NG", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "N/A";
      const daysLeft = planData.expiresAt
        ? Math.max(0, Math.ceil((planData.expiresAt - Date.now()) / 86400000))
        : 0;
      const urgentColor = daysLeft <= 14 ? "#ef476f" : "var(--emerald)";
      panel.innerHTML = `
        <div style="background:linear-gradient(135deg,#00b894,#0984e3);border-radius:var(--r-lg);padding:1.4rem;color:white;margin-bottom:1.5rem;">
          <div style="display:flex;align-items:center;gap:.7rem;margin-bottom:.5rem;">
            <i class="bi bi-star-fill" style="font-size:1.4rem;"></i>
            <span style="font-size:1rem;font-weight:700;">Pro Plan — Active ✓</span>
          </div>
          <div style="font-size:.82rem;opacity:.9;">Unlimited classes & students. All features unlocked.</div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;background:var(--surface-2);border-radius:var(--r-md);padding:1rem 1.2rem;">
          <div><div style="font-size:.78rem;color:var(--muted);margin-bottom:.2rem;">Expires</div><div style="font-weight:700;font-size:.95rem;">${expiresDate}</div></div>
          <div style="text-align:right;"><div style="font-size:.78rem;color:var(--muted);margin-bottom:.2rem;">Time left</div><div style="font-weight:800;font-size:1.1rem;color:${urgentColor};">${daysLeft} days</div></div>
        </div>
        ${daysLeft <= 14 ? `<div style="margin-top:1rem;padding:.8rem 1rem;background:#fff0f3;border:1px solid #ef476f;border-radius:var(--r-md);color:#ef476f;font-size:.82rem;font-weight:600;"><i class="bi bi-exclamation-triangle-fill"></i> Your Pro plan expires soon. Contact your GradeFlow admin to renew.</div>` : ""}
        ${renderStorageMeter()}`;
    } else {
      // PHASE 2: All plan display removed until Phase 3
      panel.innerHTML = `
        <!-- PHASE 2: All plan/pricing UI removed until Phase 3 -->
        ${renderStorageMeter()}`;
    }
  }

  // ── Storage usage meter ────────────────────────────────────────
  function getStorageUsageKB() {
    var total = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        var v = localStorage.getItem(k) || "";
        total += (k.length + v.length) * 2; // UTF-16 = 2 bytes per char
      }
    } catch (e) {}
    return Math.round(total / 1024);
  }
  function renderStorageMeter() {
    var usedKB = getStorageUsageKB();
    var maxKB = 5120; // 5 MB localStorage typical cap
    var pct = Math.min(100, Math.round((usedKB / maxKB) * 100));
    var color = pct >= 90 ? "#ef476f" : pct >= 70 ? "#f9a825" : "var(--accent)";
    var warningHtml =
      pct >= 70
        ? `<div style="margin-top:.6rem;font-size:.78rem;color:${color};font-weight:600;">
          <i class="bi bi-exclamation-triangle-fill"></i>
          ${pct >= 90 ? "Storage almost full! Export a backup now." : "Storage getting full — consider exporting a backup."}
         </div>`
        : "";
    return `<div style="margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border);">
      <div style="display:flex;justify-content:space-between;margin-bottom:.35rem;font-size:.78rem;color:var(--muted);">
        <span><i class="bi bi-hdd-fill"></i> Local storage</span>
        <span style="font-weight:700;color:${color};">${usedKB < 1024 ? usedKB + " KB" : (usedKB / 1024).toFixed(1) + " MB"} / 5 MB</span>
      </div>
      <div style="height:5px;background:var(--border);border-radius:99px;overflow:hidden;">
        <div style="height:100%;width:${pct}%;background:${color};border-radius:99px;transition:width .4s;"></div>
      </div>
      ${warningHtml}
    </div>`;
  }

  window.upgradeContactWhatsApp = function () {
    const msg = encodeURIComponent(
      `Hello! I'd like to upgrade my GradeFlow account to Pro (${PRO_PRICE_LABEL}).\n\nName: ${currentUser?.name || ""}\nEmail: ${currentUser?.email || ""}`,
    );
    window.open(`https://wa.me/?text=${msg}`, "_blank");
  };

  window.upgradeContactEmail = function () {
    const subject = encodeURIComponent("GradeFlow Pro Upgrade Request");
    const body = encodeURIComponent(
      `Hello,\n\nI'd like to upgrade my GradeFlow account to Pro (${PRO_PRICE_LABEL}).\n\nName: ${currentUser?.name || ""}\nEmail: ${currentUser?.email || ""}\n\nPlease provide payment details. Thank you.`,
    );
    window.location.href = `mailto:oshinayadamilola3@gmail.com?subject=${subject}&body=${body}`;
  };

  window.logOut = function () {
    if (!confirm("Log out of your account?")) return;
    saveData();
    saveMaterials();
    // Destroy chart to avoid canvas reuse errors on next login
    if (scoreChart) {
      try {
        scoreChart.destroy();
      } catch (e) {}
      scoreChart = null;
    }
    _stopSessionMonitor();
    _clearSessionMeta();
    currentUser = null;
    activeClassId = null;
    activeSubjectId = null;
    localStorage.removeItem("gf_current_user");
    showPage("landing");
    showToast("Logged out successfully", "info");
  };

  function enterTeacherWorkspace() {
    loadUserData(); // also loads materials
    showPage("dashboard");
    gateNavigation(); // Apply role-based sidebar visibility
    updateSidebarUser();
    ensureSidebarOverlay();
    handleResponsive();
    // Show onboarding for brand-new accounts with no classes
    const isNew = localStorage.getItem(`gf_new_account_${currentUser?.email}`);
    if (isNew && classes.length === 0) {
      localStorage.removeItem(`gf_new_account_${currentUser?.email}`);
      setTimeout(() => showOnboardingModal(), 400);
    }
    activeClassId = classes.length ? classes[0].id : null;
    activeSubjectId = activeClassId
      ? classes.find((c) => c.id === activeClassId)?.subjects?.[0]?.id
      : null;
    renderSidebarClasses();
    renderSubjectTabs();
    renderTable();
    updateStats();
    if (activeClassId) {
      document.getElementById("activeClassName").innerHTML =
        `<i class="bi bi-folder2-open"></i> ${esc(classes[0].name)}`;
      document.getElementById("analyticsClassName").textContent =
        classes[0].name;
      document.getElementById("materialsClassName").textContent =
        classes[0].name;
      const attEl = document.getElementById("attendanceClassName");
      const cbtEl = document.getElementById("cbtClassName");
      if (attEl) attEl.textContent = classes[0].name;
      if (cbtEl) cbtEl.textContent = classes[0].name;
    }
    if (settings.darkMode || localStorage.getItem("gf_theme") === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      document.getElementById("themeIcon").className = "bi bi-sun-fill";
      document.getElementById("themeLabel").textContent = "Light mode";
    }
    _startSessionMonitor();
    _maybeRemindBackup();
  }

  const ROLE_HOME_CARDS = {
    staff: [
      {
        title: "School Summary",
        body: "Track class readiness, attendance health, and active teachers.",
      },
      {
        title: "Result Oversight",
        body: "Review publishing status and monitor pending class actions.",
      },
      {
        title: "Teacher Workspace",
        body: "Open grading workspace when you need to compile class results.",
      },
    ],
    student: [
      {
        title: "My Performance",
        body: "View subject trends and recent score updates in one place.",
      },
      {
        title: "Assignments",
        body: "Check open tasks and due dates for your classes.",
      },
      {
        title: "Attendance Snapshot",
        body: "Track present, absent, and late records by term.",
      },
    ],
    parent: [
      {
        title: "Child Progress",
        body: "Follow scores, rankings, and report summaries for your child.",
      },
      {
        title: "Attendance",
        body: "Monitor attendance consistency and weekly summaries.",
      },
      {
        title: "Communication",
        body: "Access announcements and school communication channels.",
      },
    ],
  };

  function renderRoleHome() {
    if (!currentUser) return;
    const role = normalizeRole(currentUser.role);
    const titleEl = document.getElementById("roleHomeTitle");
    const subtitleEl = document.getElementById("roleHomeSubtitle");
    const cardsEl = document.getElementById("roleHomeCards");
    const teacherBtn = document.getElementById("roleHomeTeacherBtn");
    if (!titleEl || !subtitleEl || !cardsEl || !teacherBtn) return;

    const firstName = (currentUser.name || "User").split(" ")[0];
    titleEl.textContent = `Welcome, ${firstName}`;
    subtitleEl.textContent = `${roleLabel(role)} portal is active for ${currentUser.org || "your school"}.`;

    const cards = ROLE_HOME_CARDS[role] || ROLE_HOME_CARDS.staff;
    cardsEl.innerHTML = cards
      .map(
        (card) =>
          `<article class="role-home-card"><h4>${esc(card.title)}</h4><p>${esc(card.body)}</p></article>`,
      )
      .join("");

    teacherBtn.style.display =
      role === "teacher" || role === "staff" || role === "admin" ? "" : "none";
  }

  window.openTeacherWorkspace = function () {
    if (!currentUser) return;
    enterTeacherWorkspace();
  };

  function renderAdminDashboard() {
    if (!currentUser) return;

    const titleEl = document.getElementById("adminDashboardTitle");
    const subtitleEl = document.getElementById("adminDashboardSubtitle");
    const statsEl = document.getElementById("adminStatsGrid");
    const teacherListEl = document.getElementById("adminTeacherList");
    const approvalQueueEl = document.getElementById("adminApprovalQueue");

    if (
      !titleEl ||
      !subtitleEl ||
      !statsEl ||
      !teacherListEl ||
      !approvalQueueEl
    )
      return;

    const firstName = (currentUser.name || "Admin").split(" ")[0];
    titleEl.textContent = `Welcome, ${firstName}`;
    subtitleEl.textContent = `${currentUser.org || "Your School"} – Staff Dashboard`;

    // Real stats from data
    const totalClasses = classes.length;
    const totalStudents = Object.values(allStudents).flat().length;
    const pendingApprovals = 0; // Placeholder—would come from approval workflow

    // Calculate avg attendance rate
    let allAttendanceRecords = [];
    Object.values(allAttendance).forEach((classAttendance) => {
      Object.values(classAttendance).forEach((dayRecord) => {
        Object.values(dayRecord).forEach((status) => {
          allAttendanceRecords.push(status);
        });
      });
    });
    const avgAttendance =
      allAttendanceRecords.length > 0
        ? Math.round(
            (allAttendanceRecords.filter((s) => s === "P").length /
              allAttendanceRecords.length) *
              100,
          )
        : 0;

    statsEl.innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${totalClasses}</div>
        <div class="stat-label">Classes</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${totalStudents}</div>
        <div class="stat-label">Students</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${pendingApprovals}</div>
        <div class="stat-label">Pending Approvals</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${avgAttendance}${allAttendanceRecords.length > 0 ? "%" : "—"}</div>
        <div class="stat-label">Avg Attendance</div>
      </div>
    `;

    // Class list with student counts and averages
    const classList = classes.map((cls) => {
      const studentCount = (allStudents[cls.id] || []).length;
      const classGrades = [];
      (allStudents[cls.id] || []).forEach((s) => {
        const overall = computeStudentOverall(s);
        if (overall !== null) classGrades.push(overall);
      });
      const classAvg =
        classGrades.length > 0
          ? Math.round(
              classGrades.reduce((a, b) => a + b, 0) / classGrades.length,
            )
          : 0;
      const completionPct =
        studentCount > 0
          ? Math.round((classGrades.length / studentCount) * 100)
          : 0;

      return `<div class="teacher-item">
        <div class="teacher-item-left">
          <div class="teacher-item-name">${esc(cls.name)}</div>
          <div class="teacher-item-classes">${studentCount} student${studentCount !== 1 ? "s" : ""} • Avg: ${classAvg}%</div>
        </div>
        <div class="teacher-item-right">
          <div class="progress-bar">
            <div class="progress-bar-fill" style="width: ${completionPct}%"></div>
          </div>
          <span class="status-badge complete">${completionPct}%</span>
        </div>
      </div>`;
    });

    teacherListEl.innerHTML =
      classList.length > 0
        ? classList.join("")
        : `<div style="padding:1rem; color:var(--muted); text-align:center;">No classes yet</div>`;

    // Approval queue (placeholder—no dynamic approvals yet)
    approvalQueueEl.innerHTML = `
      <div style="padding:1rem; color:var(--muted); text-align:center;">No pending approvals</div>
    `;
  }

  function renderStudentDashboard() {
    if (!currentUser) return;

    const titleEl = document.getElementById("studentDashboardTitle");
    const subtitleEl = document.getElementById("studentDashboardSubtitle");
    const statsEl = document.getElementById("studentStatsGrid");
    const performanceEl = document.getElementById("studentPerformanceGrid");
    const assignmentEl = document.getElementById("studentAssignmentList");

    if (!titleEl || !subtitleEl || !statsEl || !performanceEl || !assignmentEl)
      return;

    const firstName = (currentUser.name || "Student").split(" ")[0];
    titleEl.textContent = `${firstName}'s Progress`;
    subtitleEl.textContent = `${currentUser.org || "Your School"} – Academic Dashboard`;

    // Aggregate grades across all classes
    let allStudentGrades = [];
    let totalAttendance = 0;
    let attendanceDays = 0;

    classes.forEach((cls) => {
      const classStudents = allStudents[cls.id] || [];
      classStudents.forEach((s) => {
        s.subjects.forEach((sub) => {
          const comp = computeSubject(sub);
          if (comp.total !== null) {
            allStudentGrades.push({ subject: sub.name, score: comp.total });
          }
        });
      });
      const attendance = allAttendance[cls.id] || {};
      Object.values(attendance).forEach((dayRecord) => {
        Object.values(dayRecord).forEach((status) => {
          attendanceDays++;
          if (status === "P") totalAttendance++;
        });
      });
    });

    const overallAverage =
      allStudentGrades.length > 0
        ? Math.round(
            allStudentGrades.reduce((a, g) => a + g.score, 0) /
              allStudentGrades.length,
          )
        : 0;

    const subjectCount = classes.reduce((acc, cls) => {
      return acc + (cls.subjects || []).length;
    }, 0);

    const attendanceRate =
      attendanceDays > 0
        ? Math.round((totalAttendance / attendanceDays) * 100)
        : 0;

    const assignmentsDue = (allMaterials[activeClassId] || []).filter(
      (m) => m.type === "assignment",
    ).length;

    statsEl.innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${overallAverage}${overallAverage > 0 ? "%" : "—"}</div>
        <div class="stat-label">Overall Average</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${subjectCount}</div>
        <div class="stat-label">Subjects</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${attendanceRate}${attendanceDays > 0 ? "%" : "—"}</div>
        <div class="stat-label">Attendance Rate</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${assignmentsDue}</div>
        <div class="stat-label">Assignments</div>
      </div>
    `;

    // Performance by subject (unique subjects with averages)
    const subjectMap = {};
    allStudentGrades.forEach((g) => {
      if (!subjectMap[g.subject]) subjectMap[g.subject] = [];
      subjectMap[g.subject].push(g.score);
    });

    const subjectLines = Object.entries(subjectMap)
      .map(([subName, scores]) => {
        const avg = Math.round(
          scores.reduce((a, b) => a + b, 0) / scores.length,
        );
        return `<div class="performance-item">
          <div class="performance-item-left">
            <div class="performance-item-name">${esc(subName)}</div>
            <div class="performance-item-average">Avg: ${avg}%</div>
          </div>
          <div class="performance-item-right">
            <div class="progress-bar">
              <div class="progress-bar-fill" style="width: ${avg}%"></div>
            </div>
            <span class="status-badge complete">${avg}%</span>
          </div>
        </div>`;
      })
      .join("");

    performanceEl.innerHTML =
      subjectLines ||
      `<div style="padding:1rem; color:var(--muted); text-align:center;">No grades recorded yet</div>`;

    // Assignments from active class
    const assignments = (allMaterials[activeClassId] || [])
      .filter((m) => m.type === "assignment")
      .slice(0, 3);

    assignmentEl.innerHTML =
      assignments.length > 0
        ? assignments
            .map(
              (a) =>
                `<div class="assignment-item">
            <div class="assignment-item-left">
              <div class="assignment-item-name">${esc(a.title)}</div>
              <div class="assignment-item-due">${esc(a.desc || "No description")}</div>
            </div>
            <div class="assignment-item-right">
              <span class="status-badge pending">Submitted</span>
            </div>
          </div>`,
            )
            .join("")
        : `<div style="padding:1rem; color:var(--muted); text-align:center;">No assignments yet</div>`;
  }

  function renderParentDashboard() {
    if (!currentUser) return;

    const titleEl = document.getElementById("parentDashboardTitle");
    const subtitleEl = document.getElementById("parentDashboardSubtitle");
    const statsEl = document.getElementById("parentStatsGrid");
    const performanceEl = document.getElementById("parentPerformanceGrid");
    const communicationEl = document.getElementById("parentCommunicationLog");

    if (
      !titleEl ||
      !subtitleEl ||
      !statsEl ||
      !performanceEl ||
      !communicationEl
    )
      return;

    // Placeholder: Use first student from first class as "child"
    // TODO: Replace with real parent→child enrollment linkage in v3
    let child = null;
    let childRanking = null;
    let childClassId = null;

    for (const cls of classes) {
      const students = allStudents[cls.id] || [];
      if (students.length > 0) {
        child = students[0];
        childClassId = cls.id;
        break;
      }
    }

    if (!child) {
      performanceEl.innerHTML = `<div style="padding:2rem; color:var(--muted); text-align:center;"><div class="empty-icon">👨‍👩‍👧</div><p>No child records found. Contact school to set up enrollment.</p></div>`;
      statsEl.innerHTML = `<div style="padding:2rem; color:var(--muted); text-align:center;">Awaiting enrollment</div>`;
      communicationEl.innerHTML = `<div style="padding:2rem; color:var(--muted); text-align:center;">No communications yet</div>`;
      return;
    }

    // Real child data
    const childName = child.name;
    const childOverall = computeStudentOverall(child);
    const ranked = rankStudents(allStudents[childClassId] || []);
    const rank = ranked.find((s) => s.id === child.id);
    childRanking = rank?.pos || null;

    // Attendance for child
    let childPresent = 0;
    let childTotal = 0;
    const classAttendance = allAttendance[childClassId] || {};
    Object.values(classAttendance).forEach((dayRecord) => {
      if (dayRecord[child.id]) {
        childTotal++;
        if (dayRecord[child.id] === "P") childPresent++;
      }
    });
    const childAttendanceRate =
      childTotal > 0 ? Math.round((childPresent / childTotal) * 100) : 0;

    const childSubjectCount = (child.subjects || []).length;

    titleEl.textContent = `${childName}'s Academic Progress`;
    subtitleEl.textContent = `${currentUser.org || "Your School"} – Parent Portal`;

    statsEl.innerHTML = `
      <div class="stat-card">
        <div class="stat-value">${childOverall !== null ? childOverall + "%" : "—"}</div>
        <div class="stat-label">Overall Average</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${childRanking ? "#" + childRanking : "—"}</div>
        <div class="stat-label">Class Position</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${childAttendanceRate}${childTotal > 0 ? "%" : "—"}</div>
        <div class="stat-label">Attendance</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${childSubjectCount}</div>
        <div class="stat-label">Subjects</div>
      </div>
    `;

    // Child's real subject performance
    const subjectCards = child.subjects
      .map((sub) => {
        const comp = computeSubject(sub);
        const gr = gradeResult(comp.total);
        return `<div class="child-card">
          <div class="child-card-left">
            <div class="child-card-name">${esc(sub.name)}</div>
            <div class="child-card-average">Score: ${comp.total !== null ? comp.total + "%" : "—"} • Grade: ${gr.g}</div>
          </div>
          <div class="child-card-right">
            <span class="status-badge complete">${gr.g}</span>
          </div>
        </div>`;
      })
      .join("");

    performanceEl.innerHTML =
      subjectCards ||
      `<div style="padding:1rem; color:var(--muted); text-align:center;">No grades recorded yet</div>`;

    // Communications (simplified—real implementation would fetch from backend)
    communicationEl.innerHTML = `
      <div class="communication-item">
        <div class="communication-item-left">
          <div class="communication-item-subject">Mid-Term Results Released</div>
          <div class="communication-item-date">School Announcement • 2 days ago</div>
        </div>
        <div class="communication-item-right">
          <i class="bi bi-chevron-right"></i>
        </div>
      </div>
      <div class="communication-item">
        <div class="communication-item-left">
          <div class="communication-item-subject">Holiday Schedule 2026</div>
          <div class="communication-item-date">Important Notice • 1 week ago</div>
        </div>
        <div class="communication-item-right">
          <i class="bi bi-chevron-right"></i>
        </div>
      </div>
      <div class="communication-item">
        <div class="communication-item-left">
          <div class="communication-item-subject">Tuition Payment Reminder</div>
          <div class="communication-item-date">Bursar's Office • 10 days ago</div>
        </div>
        <div class="communication-item-right">
          <i class="bi bi-chevron-right"></i>
        </div>
      </div>
    `;
  }

  function enterDashboard() {
    ensureCurrentUserRole();
    const role = normalizeRole(currentUser?.role);
    if (role === "teacher" || role === "admin" || role === "staff") {
      enterTeacherWorkspace();
      return;
    }

    loadUserData();

    // Route to role-specific dashboard
    if (role === "admin" || role === "staff") {
      showPage("admin-dashboard");
      renderAdminDashboard();
    } else if (role === "student") {
      showPage("student-dashboard");
      renderStudentDashboard();
    } else if (role === "parent") {
      showPage("parent-dashboard");
      renderParentDashboard();
    } else {
      // Fallback to role-home
      showPage("role-home");
      renderRoleHome();
    }

    _startSessionMonitor();
    _maybeRemindBackup();
  }

  // ════════════════════════════════════════════════════
  //  ONBOARDING MODAL — shown to brand-new accounts
  // ════════════════════════════════════════════════════
  function showOnboardingModal() {
    var firstName = currentUser ? currentUser.name.split(" ")[0] : "Teacher";
    var modal = document.getElementById("onboardingModal");
    if (!modal) return;
    document.getElementById("onboardingUserName").textContent = firstName;
    modal.classList.add("active");
  }

  window.closeOnboarding = function () {
    document.getElementById("onboardingModal").classList.remove("active");
  };

  window.onboardingCreateClass = function () {
    document.getElementById("onboardingModal").classList.remove("active");
    openAddClassModal();
  };

  window.loadDemoData = function () {
    if (
      !confirm(
        "Load sample data with 3 demo classes and students? You can delete them any time.",
      )
    )
      return;
    // Inject the default demo classes and students
    classes = [
      {
        id: "cls1",
        name: "PRY 5 RED",
        emoji: "🔴",
        subjects: [
          { id: "sub1", name: "Mathematics" },
          { id: "sub2", name: "English" },
        ],
      },
      {
        id: "cls2",
        name: "PRY 5 BLUE",
        emoji: "🔵",
        subjects: [{ id: "sub3", name: "Mathematics" }],
      },
      {
        id: "cls3",
        name: "PRY 5 WHITE",
        emoji: "⚪",
        subjects: [{ id: "sub4", name: "Mathematics" }],
      },
    ];
    allStudents = {
      cls1: [
        {
          id: "s1",
          name: "Abakpa Fortune",
          subjects: [
            { id: "sub1", name: "Mathematics", test: 15, prac: 18, exam: "" },
            { id: "sub2", name: "English", test: 12, prac: 14, exam: "" },
          ],
        },
        {
          id: "s2",
          name: "John Psalms",
          subjects: [
            { id: "sub1", name: "Mathematics", test: 18, prac: 19, exam: 50 },
            { id: "sub2", name: "English", test: 17, prac: 18, exam: 45 },
          ],
        },
        {
          id: "s3",
          name: "Amaka Chukwu",
          subjects: [
            { id: "sub1", name: "Mathematics", test: 14, prac: 12, exam: 40 },
            { id: "sub2", name: "English", test: 16, prac: 15, exam: 38 },
          ],
        },
      ],
      cls2: [],
      cls3: [],
    };
    saveData();
    document.getElementById("onboardingModal").classList.remove("active");
    activeClassId = "cls1";
    activeSubjectId = "sub1";
    renderSidebarClasses();
    renderSubjectTabs();
    renderTable();
    updateStats();
    document.getElementById("activeClassName").innerHTML =
      '<i class="bi bi-folder2-open"></i> PRY 5 RED';
    showToast("✅ Demo data loaded — explore away!", "success");
  };

  function updateSidebarUser() {
    if (!currentUser) return;
    const ini = initials(currentUser.name);
    const plan = getPlan();
    const avatarEl = document.getElementById("userAvatar");
    avatarEl.textContent = ini;
    avatarEl.style.background =
      plan === "admin"
        ? "linear-gradient(135deg,#7209b7,#4361ee)"
        : plan === "school"
          ? "linear-gradient(135deg,#f9a825,#ef476f)"
          : plan === "pro"
            ? "linear-gradient(135deg,#00b894,#0984e3)"
            : "linear-gradient(135deg,var(--accent),var(--accent-2))";
    document.getElementById("userName").textContent = currentUser.name;
    const badge =
      plan === "admin"
        ? ' <span style="font-size:.63rem;background:#7209b7;color:white;border-radius:99px;padding:.1rem .45rem;font-weight:700;vertical-align:middle;">ADMIN</span>'
        : plan === "school"
          ? ' <span style="font-size:.63rem;background:linear-gradient(90deg,#f9a825,#ef476f);color:white;border-radius:99px;padding:.1rem .45rem;font-weight:700;vertical-align:middle;">SCHOOL</span>'
          : plan === "pro"
            ? ' <span style="font-size:.63rem;background:linear-gradient(90deg,#00b894,#0984e3);color:white;border-radius:99px;padding:.1rem .45rem;font-weight:700;vertical-align:middle;">PRO</span>'
            : ' <span style="font-size:.63rem;background:var(--border);color:var(--muted);border-radius:99px;padding:.1rem .45rem;font-weight:600;vertical-align:middle;">FREE</span>';
    document.getElementById("userRole").innerHTML =
      `${roleLabel(currentUser.role)} · ${currentUser.org || "School"}` + badge;
    // Show lock icons on Pro-only nav items for free users
    ["nav-cbt", "nav-materials", "nav-history"].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const existing = el.querySelector(".pro-lock-icon");
      if (isPro()) {
        if (existing) existing.remove();
      } else if (!existing) {
        const lock = document.createElement("i");
        lock.className = "bi bi-lock-fill pro-lock-icon";
        lock.style.cssText =
          "font-size:.63rem;color:var(--muted);margin-left:auto;opacity:.55;";
        el.appendChild(lock);
      }
    });
  }

  // ════════════════════════════════════════════════════
  //  MODAL HELPERS
  // ════════════════════════════════════════════════════
  window.closeModal = function (id) {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.dataset.locked === "true") return;
    el.classList.remove("active");
  };
  document.querySelectorAll(".modal-overlay").forEach((overlay) => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) {
        if (overlay.dataset.locked === "true") return;
        overlay.classList.remove("active");
      }
    });
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (document.getElementById("consentModal")?.dataset.locked === "true") {
        return;
      }
      document
        .querySelectorAll(".modal-overlay.active")
        .forEach((m) => m.classList.remove("active"));
    }
  });

  window.openConsentModal = function (force = false) {
    const modal = document.getElementById("consentModal");
    if (!modal) return;
    modal.dataset.locked = force ? "true" : "false";
    const chk = document.getElementById("consentAgreeCheck");
    if (chk) chk.checked = false;
    modal.classList.add("active");
  };
  window.acceptConsent = function () {
    if (!currentUser) {
      showToast("No signed-in account found for consent", "error");
      return;
    }
    const chk = document.getElementById("consentAgreeCheck");
    if (!chk || !chk.checked) {
      showToast("Please check the agreement box to continue", "error");
      return;
    }
    _setConsentAccepted(currentUser.email);
    const modal = document.getElementById("consentModal");
    if (modal) {
      modal.dataset.locked = "false";
      modal.classList.remove("active");
    }
    if (
      !document.getElementById("page-dashboard")?.classList.contains("active")
    ) {
      enterDashboard();
    }
    showToast("Consent saved", "success");
  };
  window.declineConsent = function () {
    const modal = document.getElementById("consentModal");
    if (modal) {
      modal.dataset.locked = "false";
      modal.classList.remove("active");
    }
    _forceSessionLogout("You must accept Terms and Privacy to use GradeFlow.");
  };

  // ════════════════════════════════════════════════════
  //  TABLE VIEW TOGGLE (table ↔ cards shortcut)
  // ════════════════════════════════════════════════════
  window.toggleTableView = function () {
    switchView("students");
  };

  // ════════════════════════════════════════════════════
  //  OFFLINE DETECTION
  // ════════════════════════════════════════════════════
  function updateOnlineStatus() {
    document
      .getElementById("offlineBanner")
      .classList.toggle("show", !navigator.onLine);
  }
  window.addEventListener("online", updateOnlineStatus);
  window.addEventListener("offline", updateOnlineStatus);

  // ════════════════════════════════════════════════════
  //  MOBILE RESPONSIVE
  // ════════════════════════════════════════════════════
  function ensureSidebarOverlay() {
    if (document.getElementById("sidebarOverlay")) return;
    const overlay = document.createElement("div");
    overlay.id = "sidebarOverlay";
    overlay.className = "sidebar-overlay";
    overlay.addEventListener("click", closeMobileSidebar);
    document.body.appendChild(overlay);
  }

  function closeMobileSidebar() {
    document.getElementById("appSidebar").classList.remove("open");
    const overlay = document.getElementById("sidebarOverlay");
    if (overlay) overlay.classList.remove("active");
  }

  // Fix landing page nav anchor links to scroll within #page-landing container
  function _fixLandingNavLinks() {
    var landing = document.getElementById("page-landing");
    if (!landing) return;
    landing.querySelectorAll('a[href^="#"]').forEach(function (a) {
      // Remove any previously attached listener to avoid double-fires
      var clone = a.cloneNode(true);
      a.parentNode.replaceChild(clone, a);
      clone.addEventListener("click", function (e) {
        var target = document.getElementById(
          this.getAttribute("href").slice(1),
        );
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  }

  function handleResponsive() {
    const mobileBtn = document.getElementById("mobileMenuBtn");
    const isMobile = window.innerWidth <= 768;
    if (mobileBtn) mobileBtn.style.display = isMobile ? "flex" : "none";
    if (!isMobile && document.getElementById("appSidebar")) {
      closeMobileSidebar();
    }
    updateBatchBarPosition();
  }

  function updateBatchBarPosition() {
    const batchBar = document.getElementById("batchBar");
    if (!batchBar) return;
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      batchBar.style.left = "1rem";
      batchBar.style.right = "1rem";
      batchBar.style.transform = "none";
    } else {
      const sidebarW = sidebarCollapsed
        ? 72
        : parseInt(
            getComputedStyle(document.documentElement).getPropertyValue(
              "--sidebar-w",
            ),
          ) || 290;
      batchBar.style.left = `calc(${sidebarW}px + 1rem)`;
      batchBar.style.right = "1rem";
      batchBar.style.transform = "none";
    }
  }

  window.addEventListener("resize", handleResponsive);

  // ════════════════════════════════════════════════════
  //  CLASS MATERIALS
  // ════════════════════════════════════════════════════
  // (allMaterials already declared at top)

  function loadMaterials() {
    const saved = localStorage.getItem(userKey("materials"));
    allMaterials = saved ? JSON.parse(saved) : {};
  }
  // saveMaterials already defined above

  // ---- helpers ----
  function matTypeFromExt(filename) {
    if (!filename) return "other";
    const ext = filename.split(".").pop().toLowerCase();
    if (["doc", "docx"].includes(ext)) return "word";
    if (["html", "htm"].includes(ext)) return "html";
    if (ext === "pdf") return "pdf";
    if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext))
      return "image";
    return "other";
  }
  function matTypeIcon(type) {
    const map = {
      word: "bi-file-earmark-word-fill",
      html: "bi-filetype-html",
      pdf: "bi-file-earmark-pdf-fill",
      image: "bi-image-fill",
      url: "bi-link-45deg",
      other: "bi-file-earmark-fill",
    };
    return map[type] || "bi-file-earmark-fill";
  }
  function matTypeColor(type) {
    const map = {
      word: "#2b579a",
      html: "#e44d26",
      pdf: "#ef476f",
      image: "#00b894",
      url: "#4361ee",
      other: "var(--muted)",
    };
    return map[type] || "var(--muted)";
  }
  function matThumbClass(type) {
    const map = {
      word: "thumb-word",
      html: "thumb-html",
      pdf: "thumb-pdf",
      image: "thumb-image",
      url: "thumb-word",
      other: "thumb-other",
    };
    return map[type] || "thumb-other";
  }
  function matTypeEmoji(type) {
    const map = {
      word: "📄",
      html: "🌐",
      pdf: "📑",
      image: "🖼",
      url: "🔗",
      other: "📁",
    };
    return map[type] || "📁";
  }
  function formatBytes(bytes) {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  }

  // ---- render materials grid ----
  function renderMaterials() {
    const grid = document.getElementById("materialsGrid");
    const noClass = document.getElementById("materialsNoClass");

    // update breadcrumb badge
    const cls = classes.find((c) => c.id === activeClassId);
    document.getElementById("materialsClassName").textContent = cls
      ? cls.name
      : "";

    if (!activeClassId) {
      noClass.style.display = "block";
      grid.style.display = "none";
      return;
    }
    noClass.style.display = "none";
    grid.style.display = "";

    const mats = allMaterials[activeClassId] || [];
    const query = (
      document.getElementById("matSearch")?.value || ""
    ).toLowerCase();

    let filtered = mats.filter((m) => {
      const typeMatch =
        currentMaterialFilter === "all" || m.type === currentMaterialFilter;
      const queryMatch =
        !query ||
        m.title.toLowerCase().includes(query) ||
        (m.subjectTag || "").toLowerCase().includes(query) ||
        (m.desc || "").toLowerCase().includes(query);
      return typeMatch && queryMatch;
    });

    if (!filtered.length) {
      grid.innerHTML = `<div class="materials-empty"><div class="empty-icon">📂</div><h3>${mats.length ? "No matches found" : "No materials yet"}</h3><p>${mats.length ? "Try a different search or filter." : "Upload your first material using the button above."}</p><button class="btn btn-primary btn-sm" onclick="openUploadMaterialModal()"><i class="bi bi-cloud-upload-fill"></i> Upload Material</button></div>`;
      return;
    }

    grid.innerHTML = filtered
      .map((m) => {
        const thumbClass = matThumbClass(m.type);
        const emoji = matTypeEmoji(m.type);
        const thumbInner =
          m.type === "image" && m.dataUrl
            ? `<img src="${m.dataUrl}" alt="${m.title}"/>`
            : `<span>${emoji}</span>`;
        const date = new Date(m.date).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
        });
        return `<div class="material-card" onclick="viewMaterial('${m.id}')">
        <div class="material-card-thumb ${thumbClass}">
          ${thumbInner}
          <span class="mat-type-badge ${m.type}">${m.type.toUpperCase()}</span>
        </div>
        <div class="material-card-body">
          <div class="material-card-title">${m.title}</div>
          <div class="material-card-sub">
            ${m.subjectTag ? `<span class="mat-tag"><i class="bi bi-bookmark-fill"></i> ${m.subjectTag}</span>` : ""}
            <span><i class="bi bi-calendar3"></i> ${date}</span>
            ${m.size ? `<span>${formatBytes(m.size)}</span>` : ""}
          </div>
          ${m.desc ? `<div style="font-size:.78rem;color:var(--muted);margin-top:.3rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${m.desc}</div>` : ""}
        </div>
        <div class="material-card-actions">
          <button class="btn btn-xs btn-primary" onclick="event.stopPropagation();viewMaterial('${m.id}')"><i class="bi bi-eye-fill"></i> Open</button>
          ${m.dataUrl || m.htmlContent || m.url ? `<button class="btn btn-xs" onclick="event.stopPropagation();downloadMaterial('${m.id}')"><i class="bi bi-download"></i></button>` : ""}
          <button class="btn btn-xs btn-danger" onclick="event.stopPropagation();deleteMaterial('${m.id}')"><i class="bi bi-trash3"></i></button>
        </div>
      </div>`;
      })
      .join("");
  }

  function getMaterialsForClass(classId) {
    return allMaterials[classId] || [];
  }

  // ---- filter & search ----
  window.filterMaterials = function (type, btn) {
    currentMaterialFilter = type;
    document
      .querySelectorAll(".mat-filter-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    renderMaterials();
  };
  window.searchMaterials = function () {
    renderMaterials();
  };

  // ---- upload modal ----
  let pendingMatFile = null;

  window.openUploadMaterialModal = function () {
    if (!activeClassId) {
      showToast("Select a class first", "error");
      return;
    }
    pendingMatFile = null;
    document.getElementById("matFileInput").value = "";
    document.getElementById("matDropzoneFile").style.display = "none";
    document.getElementById("matDropzoneFile").textContent = "";
    document.getElementById("matHtmlInput").value = "";
    document.getElementById("matUrlInput").value = "";
    document.getElementById("matTitle").value = "";
    document.getElementById("matSubjectTag").value = "";
    document.getElementById("matDesc").value = "";
    switchMatInputTab("html");
    document.getElementById("uploadMaterialModal").classList.add("active");
  };

  window.switchMatInputTab = function (tab) {
    document.getElementById("matHtmlSection").style.display =
      tab === "html" ? "" : "none";
    document.getElementById("matUrlSection").style.display =
      tab === "url" ? "" : "none";
    document
      .getElementById("matTabHtml")
      .classList.toggle("active", tab === "html");
    document
      .getElementById("matTabUrl")
      .classList.toggle("active", tab === "url");
  };

  window.matDragOver = function (e) {
    e.preventDefault();
    document.getElementById("matDropzone").classList.add("drag-over");
  };
  window.matDragLeave = function () {
    document.getElementById("matDropzone").classList.remove("drag-over");
  };
  window.matDrop = function (e) {
    e.preventDefault();
    document.getElementById("matDropzone").classList.remove("drag-over");
    const files = e.dataTransfer?.files;
    if (files?.length) matFileSelected(files);
  };
  window.matFileSelected = function (files) {
    if (!files?.length) return;
    pendingMatFile = files[0];
    const nameEl = document.getElementById("matDropzoneFile");
    nameEl.style.display = "flex";
    nameEl.innerHTML = `<i class="bi ${matTypeIcon(matTypeFromExt(pendingMatFile.name))}"></i> ${pendingMatFile.name} (${formatBytes(pendingMatFile.size)})`;
    if (!document.getElementById("matTitle").value) {
      document.getElementById("matTitle").value = pendingMatFile.name
        .replace(/\.[^.]+$/, "")
        .replace(/[-_]/g, " ");
    }
  };

  window.confirmUploadMaterial = async function () {
    const title = document.getElementById("matTitle").value.trim();
    const subjectTag = document.getElementById("matSubjectTag").value.trim();
    const desc = document.getElementById("matDesc").value.trim();
    const htmlPaste = document.getElementById("matHtmlInput").value.trim();
    const urlPaste = document.getElementById("matUrlInput").value.trim();
    const isUrlTab =
      document.getElementById("matUrlSection").style.display !== "none";

    if (!title) {
      showToast("Please enter a title", "error");
      return;
    }
    if (!pendingMatFile && !htmlPaste && !urlPaste) {
      showToast("Please upload a file, paste HTML, or enter a URL", "error");
      return;
    }

    showLoading("Processing material…");

    const id = "mat_" + Date.now();
    let mat = {
      id,
      title,
      subjectTag,
      desc,
      date: new Date().toISOString(),
      classId: activeClassId,
    };

    try {
      if (pendingMatFile) {
        const file = pendingMatFile;
        const type = matTypeFromExt(file.name);
        mat.type = type;
        mat.fileName = file.name;
        mat.size = file.size;

        if (type === "word") {
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.convertToHtml({ arrayBuffer });
          mat.htmlContent = result.value;
          mat.type = "word";
        } else if (type === "html") {
          mat.htmlContent = await file.text();
        } else if (type === "image") {
          mat.dataUrl = await readFileAsDataURL(file);
        } else if (type === "pdf") {
          mat.dataUrl = await readFileAsDataURL(file);
        } else {
          mat.dataUrl = await readFileAsDataURL(file);
        }
      } else if (isUrlTab && urlPaste) {
        mat.type = "url";
        mat.url = urlPaste;
      } else if (htmlPaste) {
        mat.type = "html";
        mat.htmlContent = htmlPaste;
        mat.fileName = `${title}.html`;
      }

      if (!allMaterials[activeClassId]) allMaterials[activeClassId] = [];
      allMaterials[activeClassId].unshift(mat);
      saveMaterials();
      closeModal("uploadMaterialModal");
      renderMaterials();
      showToast(`✅ "${title}" added to materials`, "success");
    } catch (err) {
      console.error(err);
      showToast("Failed to process file: " + err.message, "error");
    }
    hideLoading();
  };

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  window.viewMaterial = function (id) {
    const mats = allMaterials[activeClassId] || [];
    const m = mats.find((x) => x.id === id);
    if (!m) return;
    viewingMaterialId = id;

    document.getElementById("matViewerTitle").textContent = m.title;
    const date = new Date(m.date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    document.getElementById("matViewerMeta").innerHTML = `
      <span><i class="bi ${matTypeIcon(m.type)}" style="color:${matTypeColor(m.type)};"></i> ${m.type.toUpperCase()}</span>
      ${m.subjectTag ? `<span class="mat-tag">${m.subjectTag}</span>` : ""}
      <span><i class="bi bi-calendar3"></i> ${date}</span>
      ${m.size ? `<span>${formatBytes(m.size)}</span>` : ""}
      ${m.desc ? `<span style="font-style:italic;">${m.desc}</span>` : ""}`;

    document.getElementById("matViewerDownloadBtn").style.display =
      m.dataUrl || m.htmlContent || m.url ? "" : "none";

    const body = document.getElementById("matViewerBody");
    body.innerHTML = "";

    if (m.type === "word" || (m.type === "html" && m.htmlContent)) {
      const iframe = document.createElement("iframe");
      iframe.sandbox = "allow-same-origin";
      iframe.style.cssText =
        "width:100%;min-height:500px;border:none;border-radius:var(--r-md);";
      body.appendChild(iframe);
      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(`<!doctype html><html><head><meta charset="utf-8"><style>
        body{font-family:'DM Sans',sans-serif;font-size:15px;line-height:1.75;color:#1e293b;padding:1.5rem;max-width:820px;margin:0 auto;}
        h1,h2,h3{font-weight:700;margin:1.2em 0 .5em;}
        h1{font-size:1.7rem;} h2{font-size:1.3rem;border-bottom:2px solid #e3e6f0;padding-bottom:.4rem;} h3{font-size:1.1rem;}
        p{margin-bottom:.8em;} table{width:100%;border-collapse:collapse;margin:1em 0;}
        th,td{padding:.6rem .8rem;border:1px solid #e3e6f0;text-align:left;} th{background:#f5f6fb;font-weight:700;}
        img{max-width:100%;border-radius:8px;} ul,ol{padding-left:1.5rem;} li{margin-bottom:.3em;}
        blockquote{border-left:4px solid #4361ee;padding-left:1rem;color:#6b7699;font-style:italic;}
      </style></head><body>${m.htmlContent}</body></html>`);
      doc.close();
    } else if (m.type === "image" && m.dataUrl) {
      body.innerHTML = `<div class="mat-img-viewer"><img src="${m.dataUrl}" alt="${m.title}"/></div>`;
    } else if (m.type === "pdf" && m.dataUrl) {
      body.innerHTML = `<iframe src="${m.dataUrl}" style="width:100%;min-height:600px;border:none;border-radius:var(--r-md);" title="${m.title}"></iframe>`;
    } else if (m.type === "url" && m.url) {
      body.innerHTML = `<div class="mat-url-card">
        <div class="mat-url-icon">🔗</div>
        <div>
          <div style="font-weight:700;margin-bottom:.4rem;">${m.title}</div>
          <a class="mat-url-link" href="${m.url}" target="_blank" rel="noopener">${m.url}</a>
          <div style="margin-top:.8rem;"><a href="${m.url}" target="_blank" rel="noopener" class="btn btn-primary btn-sm"><i class="bi bi-box-arrow-up-right"></i> Open in new tab</a></div>
        </div>
      </div>`;
    } else if (m.dataUrl) {
      body.innerHTML = `<div class="mat-url-card">
        <div class="mat-url-icon">${matTypeEmoji(m.type)}</div>
        <div>
          <div style="font-weight:700;margin-bottom:.4rem;">${m.fileName || m.title}</div>
          <div style="color:var(--muted);font-size:.85rem;margin-bottom:.8rem;">${formatBytes(m.size)}</div>
          <button class="btn btn-primary btn-sm" onclick="downloadMaterial('${m.id}')"><i class="bi bi-download"></i> Download File</button>
        </div>
      </div>`;
    } else {
      body.innerHTML = `<div class="empty-state"><div class="empty-icon">📄</div><h3>No preview available</h3><p>This material has no viewable content.</p></div>`;
    }

    document.getElementById("materialViewerModal").classList.add("active");
  };

  window.downloadMaterial = function (id) {
    const mats = allMaterials[activeClassId] || [];
    const m = mats.find((x) => x.id === id);
    if (!m) return;
    if (m.url) {
      window.open(m.url, "_blank");
      return;
    }
    const a = document.createElement("a");
    if (m.dataUrl) {
      a.href = m.dataUrl;
      a.download = m.fileName || m.title + ".bin";
    } else if (m.htmlContent) {
      const blob = new Blob([m.htmlContent], { type: "text/html" });
      a.href = URL.createObjectURL(blob);
      a.download = m.fileName || m.title + ".html";
    } else {
      showToast("Nothing to download", "info");
      return;
    }
    a.click();
    showToast(`Downloading "${m.title}"`, "success");
  };
  window.downloadCurrentMaterial = function () {
    if (viewingMaterialId) downloadMaterial(viewingMaterialId);
  };

  window.deleteMaterial = function (id) {
    const mats = allMaterials[activeClassId] || [];
    const m = mats.find((x) => x.id === id);
    if (!m) return;
    if (!confirm(`Delete "${m.title}"? This cannot be undone.`)) return;
    allMaterials[activeClassId] = mats.filter((x) => x.id !== id);
    saveMaterials();
    renderMaterials();
    showToast(`"${m.title}" deleted`, "info");
  };
  window.deleteCurrentMaterial = function () {
    if (!viewingMaterialId) return;
    const mats = allMaterials[activeClassId] || [];
    const m = mats.find((x) => x.id === viewingMaterialId);
    if (!m) return;
    if (!confirm(`Delete "${m.title}"?`)) return;
    allMaterials[activeClassId] = mats.filter(
      (x) => x.id !== viewingMaterialId,
    );
    saveMaterials();
    closeModal("materialViewerModal");
    renderMaterials();
    showToast(`"${m.title}" deleted`, "info");
  };

  // ════════════════════════════════════════════════════
  //  CUSTOM GRADE SCALE
  // ════════════════════════════════════════════════════
  function renderGradeScalePreview() {
    const el = document.getElementById("gradeScalePreview");
    if (!el) return;
    el.innerHTML = getGradeScale()
      .map((e, i, arr) => {
        const rangeText =
          i === arr.length - 1
            ? "Below " + (arr[i - 1]?.min || 40) + "%"
            : e.min + "%+";
        return (
          '<div class="gs-preview-row"><span class="grade-pill ' +
          e.cls +
          '">' +
          e.g +
          '</span><span class="gs-prev-label">' +
          e.r +
          '</span><span class="gs-prev-range">' +
          rangeText +
          "</span></div>"
        );
      })
      .join("");
  }
  window.updateGradeScalePreview = renderGradeScalePreview;
  window.saveGradeScale = function () {
    const grades = ["A", "B", "C", "D", "E"],
      remarks = ["Excellent", "Very Good", "Good", "Fair", "Pass"],
      cssCls = ["g-A", "g-B", "g-C", "g-D", "g-E"];
    const mins = grades.map(
      (g) => parseInt(document.getElementById("gsMin_" + g)?.value) || 0,
    );
    for (let i = 0; i < mins.length - 1; i++) {
      if (mins[i] <= mins[i + 1]) {
        showToast(grades[i] + " must be higher than " + grades[i + 1], "error");
        return;
      }
    }
    if (mins[4] < 1) {
      showToast("E minimum must be at least 1", "error");
      return;
    }
    settings.gradeScale = grades.map((g, i) => ({
      g,
      min: mins[i],
      r: remarks[i],
      cls: cssCls[i],
    }));
    settings.gradeScale.push({ g: "F", min: 0, r: "Fail", cls: "g-F" });
    saveData();
    renderGradeScalePreview();
    if (activeClassId) {
      renderTable();
      if (activeView === "analytics") renderAnalytics();
      if (activeView === "students") renderStudentCards();
    }
    showToast("✅ Grade scale saved — all grades updated", "success");
  };
  window.resetGradeScale = function () {
    settings.gradeScale = null;
    saveData();
    loadSettings();
    if (activeClassId) {
      renderTable();
      if (activeView === "analytics") renderAnalytics();
      if (activeView === "students") renderStudentCards();
    }
    showToast("Grade scale reset to default", "info");
  };

  // ════════════════════════════════════════════════════
  //  SCHOOL LOGO UPLOAD
  // ════════════════════════════════════════════════════
  window.handleLogoUpload = function (input) {
    const file = input.files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please upload an image file", "error");
      return;
    }
    if (file.size > 600 * 1024) {
      showToast("Image too large — use under 600KB", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      settings.logoDataUrl = e.target.result;
      saveData();
      const prev = document.getElementById("logoPreview"),
        rmBtn = document.getElementById("logoRemoveBtn");
      if (prev) {
        prev.src = e.target.result;
        prev.style.display = "block";
      }
      if (rmBtn) rmBtn.style.display = "inline-flex";
      showToast("✅ Logo saved — appears on all PDF report cards", "success");
    };
    reader.readAsDataURL(file);
  };
  window.removeLogo = function () {
    settings.logoDataUrl = "";
    saveData();
    const prev = document.getElementById("logoPreview"),
      rmBtn = document.getElementById("logoRemoveBtn");
    if (prev) {
      prev.src = "";
      prev.style.display = "none";
    }
    if (rmBtn) rmBtn.style.display = "none";
    const fi = document.getElementById("logoFileInput");
    if (fi) fi.value = "";
    showToast("Logo removed", "info");
  };

  // ════════════════════════════════════════════════════
  //  WAEC / NECO SUBJECT PICKER
  // ════════════════════════════════════════════════════
  const WAEC_SUBJECTS = [
    "English Language",
    "Mathematics",
    "Civic Education",
    "Agricultural Science",
    "Biology",
    "Chemistry",
    "Physics",
    "Further Mathematics",
    "Health Science",
    "Computer Studies",
    "Technical Drawing",
    "Food and Nutrition",
    "Literature in English",
    "Government",
    "History",
    "Christian Religious Studies",
    "Islamic Religious Studies",
    "Geography",
    "Economics",
    "Commerce",
    "Accounting",
    "Business Studies",
    "DSP",
    "Store Management",
    "Yoruba",
    "Igbo",
    "Hausa",
    "French",
    "Arabic",
    "Efik",
    "Edo",
    "Ibibio",
    "Auto Mechanics",
    "Building Construction",
    "Electrical Installation",
    "Metal Work",
    "Woodwork",
    "Plumbing",
    "Cosmetology",
    "Catering Craft Practice",
    "Basic Science",
    "Basic Technology",
    "Social Studies",
    "National Values Education",
    "Quantitative Reasoning",
    "Verbal Reasoning",
    "Cultural and Creative Arts",
    "Physical and Health Education",
    "Home Economics",
    "Fine Arts",
    "Music",
    "Animal Husbandry",
    "Fisheries",
    "Garment Making",
  ].sort();

  window.openSubjectPicker = function () {
    if (!activeClassId) {
      showToast("Select a class first", "error");
      return;
    }
    const cls = classes.find((c) => c.id === activeClassId);
    const existing = (cls?.subjects || []).map((s) => s.name.toLowerCase());
    const grid = document.getElementById("subjectPickerGrid");
    grid.innerHTML = WAEC_SUBJECTS.map((s) => {
      const taken = existing.includes(s.toLowerCase());
      const safeId = "subj_" + WAEC_SUBJECTS.indexOf(s);
      return (
        '<button class="subject-chip' +
        (taken ? " taken" : "") +
        '" data-name="' +
        s.replace(/"/g, "&quot;") +
        '" onclick="pickSubjectChip(this)">' +
        s +
        (taken ? ' <i class="bi bi-check-lg"></i>' : "") +
        "</button>"
      );
    }).join("");
    document.getElementById("subjectPickerSearch").value = "";
    document.getElementById("customSubjectInput").value = "";
    document.getElementById("subjectPickerModal").classList.add("active");
  };
  window.filterSubjectPicker = function (val) {
    const q = val.toLowerCase();
    document
      .querySelectorAll("#subjectPickerGrid .subject-chip")
      .forEach((btn) => {
        btn.style.display = (btn.getAttribute("data-name") || btn.textContent)
          .toLowerCase()
          .includes(q)
          ? ""
          : "none";
      });
  };
  window.pickSubjectChip = function (btn) {
    const name = btn.getAttribute("data-name") || btn.textContent.trim();
    if (btn.classList.contains("taken")) {
      showToast(name + " already in class", "info");
      return;
    }
    const cls = classes.find((c) => c.id === activeClassId);
    if (!cls) return;
    const newSubj = { id: "subj_" + Date.now(), name };
    cls.subjects.push(newSubj);
    (allStudents[activeClassId] || []).forEach((s) => {
      s.subjects.push({
        id: newSubj.id,
        name,
        test: 0,
        prac: 0,
        exam: "",
        total: null,
      });
    });
    activeSubjectId = newSubj.id;
    btn.classList.add("taken");
    btn.innerHTML = name + ' <i class="bi bi-check-lg"></i>';
    renderSubjectTabs();
    renderTable();
    saveData();
    showToast('✅ "' + name + '" added', "success");
  };
  window.addCustomSubjectFromPicker = function () {
    const val = document.getElementById("customSubjectInput").value.trim();
    if (!val) {
      showToast("Enter a subject name", "error");
      return;
    }
    const cls = classes.find((c) => c.id === activeClassId);
    if (cls?.subjects.some((s) => s.name.toLowerCase() === val.toLowerCase())) {
      showToast("Subject already exists", "error");
      return;
    }
    const newSubj = { id: "subj_" + Date.now(), name: val };
    if (cls) cls.subjects.push(newSubj);
    (allStudents[activeClassId] || []).forEach((s) => {
      s.subjects.push({
        id: newSubj.id,
        name: val,
        test: 0,
        prac: 0,
        exam: "",
        total: null,
      });
    });
    activeSubjectId = newSubj.id;
    closeModal("subjectPickerModal");
    renderSubjectTabs();
    renderTable();
    saveData();
    showToast('✅ "' + val + '" added', "success");
  };

  // ════════════════════════════════════════════════════
  //  ATTENDANCE TRACKER
  // ════════════════════════════════════════════════════
  function saveAttendance() {
    if (!currentUser) return;
    localStorage.setItem(userKey("attendance"), JSON.stringify(allAttendance));
  }
  window.renderAttendance = function () {
    const cls = classes.find((c) => c.id === activeClassId);
    const noClass = document.getElementById("attendanceNoClass"),
      content = document.getElementById("attendanceContent");
    const hdr = document.getElementById("attendanceClassName");
    if (hdr) hdr.textContent = cls?.name || "";
    if (!activeClassId || !cls) {
      if (noClass) noClass.style.display = "";
      if (content) content.style.display = "none";
      return;
    }
    if (noClass) noClass.style.display = "none";
    if (content) content.style.display = "";
    const dateEl = document.getElementById("attendanceDate");
    if (!dateEl.value) dateEl.value = new Date().toISOString().split("T")[0];
    const date = dateEl.value;
    const students = allStudents[activeClassId] || [];
    const dayRecord = (allAttendance[activeClassId] || {})[date] || {};
    let P = 0,
      A = 0,
      L = 0;
    students.forEach((s) => {
      const v = dayRecord[s.id] || "P";
      if (v === "P") P++;
      else if (v === "A") A++;
      else L++;
    });
    const total = students.length;
    document.getElementById("attendanceSummaryBar").innerHTML = total
      ? `<div class="att-summary">
      <div class="att-stat att-present"><span>${P}</span><small>Present</small></div>
      <div class="att-stat att-absent"><span>${A}</span><small>Absent</small></div>
      <div class="att-stat att-late"><span>${L}</span><small>Late</small></div>
      <div class="att-stat"><span>${total > 0 ? Math.round((P / total) * 100) : 0}%</span><small>Rate</small></div>
    </div>`
      : "";
    if (!students.length) {
      document.getElementById("attendanceList").innerHTML =
        `<div class="empty-state" style="padding:3rem;"><div class="empty-icon">👤</div><h3>No students yet</h3><p>Add students to take attendance.</p></div>`;
      return;
    }
    document.getElementById("attendanceList").innerHTML = students
      .map((s) => {
        const st = dayRecord[s.id] || "P",
          ini = initials(s.name);
        return `<div class="att-row"><div class="att-avatar" style="background:linear-gradient(135deg,var(--accent),var(--accent-2));">${ini}</div><div class="att-name">${s.name}</div><div class="att-btns">
        <button class="att-btn ${st === "P" ? "att-p-active" : ""}" onclick="setAttendance('${s.id}','P','${date}')">P</button>
        <button class="att-btn ${st === "A" ? "att-a-active" : ""}" onclick="setAttendance('${s.id}','A','${date}')">A</button>
        <button class="att-btn ${st === "L" ? "att-l-active" : ""}" onclick="setAttendance('${s.id}','L','${date}')">L</button>
      </div></div>`;
      })
      .join("");
  };
  window.setAttendance = function (studentId, status, date) {
    if (!allAttendance[activeClassId]) allAttendance[activeClassId] = {};
    if (!allAttendance[activeClassId][date])
      allAttendance[activeClassId][date] = {};
    allAttendance[activeClassId][date][studentId] = status;
    saveAttendance();
    renderAttendance();
  };
  window.markAllPresent = function () {
    const dateEl = document.getElementById("attendanceDate");
    if (!dateEl?.value) return;
    const date = dateEl.value,
      students = allStudents[activeClassId] || [];
    if (!allAttendance[activeClassId]) allAttendance[activeClassId] = {};
    if (!allAttendance[activeClassId][date])
      allAttendance[activeClassId][date] = {};
    students.forEach((s) => {
      allAttendance[activeClassId][date][s.id] = "P";
    });
    saveAttendance();
    renderAttendance();
    showToast("✅ All students marked Present", "success");
  };
  window.exportAttendanceExcel = function () {
    const cls = classes.find((c) => c.id === activeClassId);
    if (!cls) {
      showToast("Select a class first", "error");
      return;
    }
    const students = allStudents[activeClassId] || [],
      classAtt = allAttendance[activeClassId] || {};
    const dates = Object.keys(classAtt).sort();
    if (!dates.length) {
      showToast("No attendance records yet", "info");
      return;
    }
    const rows = students.map((s) => {
      const row = { "Student Name": s.name };
      dates.forEach((d) => {
        row[d] = classAtt[d]?.[s.id] || "—";
      });
      const present = dates.filter(
        (d) => (classAtt[d]?.[s.id] || "P") === "P",
      ).length;
      row["% Attendance"] = Math.round((present / dates.length) * 100) + "%";
      return row;
    });
    const wb = XLSX.utils.book_new(),
      ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, cls.name + "_Attendance.xlsx");
    showToast("✅ Attendance exported", "success");
  };

  // ════════════════════════════════════════════════════
  //  CBT QUIZ BUILDER
  // ════════════════════════════════════════════════════
  let editingQuizId = null,
    quizTimerInterval = null,
    activeQuizData = null,
    quizStartTime = null;
  window.clearQuizTimer = function () {
    clearInterval(quizTimerInterval);
  };
  function saveQuizzes() {
    if (!currentUser) return;
    localStorage.setItem(userKey("quizzes"), JSON.stringify(allQuizzes));
  }
  window.renderCBT = function () {
    const cls = classes.find((c) => c.id === activeClassId);
    const noClass = document.getElementById("cbtNoClass"),
      list = document.getElementById("cbtQuizList");
    const hdr = document.getElementById("cbtClassName");
    if (hdr) hdr.textContent = cls?.name || "";
    if (!activeClassId || !cls) {
      if (noClass) noClass.style.display = "";
      if (list) list.innerHTML = "";
      return;
    }
    if (noClass) noClass.style.display = "none";
    const quizzes = allQuizzes[activeClassId] || [];
    if (!quizzes.length) {
      list.innerHTML = `<div class="empty-state" style="padding:4rem 2rem;"><div class="empty-icon">📝</div><h3>No quizzes yet</h3><p>Create your first quiz for this class.</p><button class="btn btn-primary btn-sm" onclick="openCreateQuizModal()"><i class="bi bi-plus-lg"></i> New Quiz</button></div>`;
      return;
    }
    list.innerHTML = quizzes
      .map((q) => {
        const attempts = (q.results || []).length;
        const avg = attempts
          ? Math.round(q.results.reduce((a, r) => a + r.pct, 0) / attempts)
          : null;
        return `<div class="cbt-quiz-card">
        <div class="cbt-quiz-info"><div class="cbt-quiz-title">${q.title}</div>
        <div class="cbt-quiz-meta">${q.subject ? '<span class="badge-pill">' + q.subject + "</span>" : ""}<span><i class="bi bi-question-circle"></i> ${q.questions.length} Qs</span>${q.timeLimit ? '<span><i class="bi bi-clock"></i> ' + q.timeLimit + "m</span>" : ""}<span><i class="bi bi-people"></i> ${attempts} attempt${attempts !== 1 ? "s" : ""}</span>${avg !== null ? '<span><i class="bi bi-bar-chart"></i> Avg ' + avg + "%</span>" : ""}</div></div>
        <div class="cbt-quiz-actions">
          <button class="btn btn-sm btn-primary" onclick="startQuiz('${q.id}')"><i class="bi bi-play-fill"></i> Take</button>
          <button class="btn btn-sm" onclick="viewQuizResults('${q.id}')"><i class="bi bi-graph-up"></i></button>
          <button class="btn btn-sm" onclick="editQuiz('${q.id}')"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-danger" onclick="deleteQuiz('${q.id}')"><i class="bi bi-trash3"></i></button>
        </div></div>`;
      })
      .join("");
  };
  window.openCreateQuizModal = function () {
    if (!activeClassId) {
      showToast("Select a class first", "error");
      return;
    }
    editingQuizId = null;
    document.getElementById("quizTitle").value = "";
    document.getElementById("quizSubject").value = "";
    document.getElementById("quizTime").value = 30;
    document.getElementById("quizQuestionsEditor").innerHTML = "";
    addQuizQuestion();
    document.getElementById("createQuizModal").classList.add("active");
  };
  window.editQuiz = function (id) {
    const q = (allQuizzes[activeClassId] || []).find((x) => x.id === id);
    if (!q) return;
    editingQuizId = id;
    document.getElementById("quizTitle").value = q.title;
    document.getElementById("quizSubject").value = q.subject || "";
    document.getElementById("quizTime").value = q.timeLimit || 0;
    document.getElementById("quizQuestionsEditor").innerHTML = "";
    q.questions.forEach((qn) => addQuizQuestion(qn));
    document.getElementById("createQuizModal").classList.add("active");
  };
  window.addQuizQuestion = function (existing) {
    const editor = document.getElementById("quizQuestionsEditor");
    const idx = editor.children.length + 1;
    const div = document.createElement("div");
    div.className = "quiz-q-block";
    div.innerHTML =
      '<div class="quiz-q-header"><span class="quiz-q-num">Q' +
      idx +
      '</span><button class="btn btn-xs btn-danger" onclick="this.closest(\'.quiz-q-block\').remove();renumberQuestions()"><i class="bi bi-trash3"></i></button></div>' +
      '<input type="text" class="form-input quiz-q-text" placeholder="Question text…"/>' +
      '<div class="quiz-options">' +
      ["A", "B", "C", "D"]
        .map(
          (opt) =>
            '<div class="quiz-opt-row"><span class="quiz-opt-label">' +
            opt +
            '</span><input type="text" class="form-input quiz-opt-input" data-opt="' +
            opt +
            '" placeholder="Option ' +
            opt +
            '…"/><input type="radio" name="correct-' +
            idx +
            '" value="' +
            opt +
            '" class="quiz-correct-radio" title="Correct answer"/></div>',
        )
        .join("") +
      "</div>" +
      '<div style="font-size:.75rem;color:var(--muted);margin-top:.3rem;"><i class="bi bi-info-circle"></i> Click radio to mark correct answer</div>';
    // Set values safely (avoids XSS in innerHTML)
    if (existing) {
      div.querySelector(".quiz-q-text").value = existing.q || "";
      div.querySelectorAll(".quiz-opt-input").forEach((inp) => {
        inp.value = existing.opts?.[inp.dataset.opt] || "";
      });
      const radio = div.querySelector(
        'input[value="' + existing.correct + '"]',
      );
      if (radio) radio.checked = true;
    }
    editor.appendChild(div);
  };
  window.renumberQuestions = function () {
    document.querySelectorAll(".quiz-q-block").forEach((b, i) => {
      const n = b.querySelector(".quiz-q-num");
      if (n) n.textContent = "Q" + (i + 1);
      b.querySelectorAll('input[type="radio"]').forEach(
        (r) => (r.name = "correct-" + (i + 1)),
      );
    });
  };
  window.saveQuiz = function () {
    const title = document.getElementById("quizTitle").value.trim();
    if (!title) {
      showToast("Enter a quiz title", "error");
      return;
    }
    const subject = document.getElementById("quizSubject").value.trim(),
      timeLimit = parseInt(document.getElementById("quizTime").value) || 0;
    const qBlocks = document.querySelectorAll(".quiz-q-block");
    const questions = [];
    let valid = true;
    qBlocks.forEach((block, i) => {
      const q = block.querySelector(".quiz-q-text").value.trim();
      if (!q) {
        showToast("Question " + (i + 1) + " is empty", "error");
        valid = false;
        return;
      }
      const opts = {};
      block.querySelectorAll(".quiz-opt-input").forEach((inp) => {
        opts[inp.dataset.opt] = inp.value.trim();
      });
      const correct =
        block.querySelector(".quiz-correct-radio:checked")?.value || "";
      if (!correct) {
        showToast("Mark correct answer for Q" + (i + 1), "error");
        valid = false;
        return;
      }
      if (!opts[correct]) {
        showToast(
          "Option " + correct + " in Q" + (i + 1) + " is empty",
          "error",
        );
        valid = false;
        return;
      }
      questions.push({ q, opts, correct });
    });
    if (!valid || !questions.length) {
      if (!questions.length) showToast("Add at least one question", "error");
      return;
    }
    if (!allQuizzes[activeClassId]) allQuizzes[activeClassId] = [];
    if (editingQuizId) {
      const idx = allQuizzes[activeClassId].findIndex(
        (q) => q.id === editingQuizId,
      );
      if (idx >= 0)
        allQuizzes[activeClassId][idx] = {
          ...allQuizzes[activeClassId][idx],
          title,
          subject,
          timeLimit,
          questions,
        };
    } else {
      allQuizzes[activeClassId].push({
        id: "qz_" + Date.now(),
        title,
        subject,
        timeLimit,
        questions,
        results: [],
        created: new Date().toISOString(),
      });
    }
    saveQuizzes();
    closeModal("createQuizModal");
    renderCBT();
    showToast('✅ Quiz "' + title + '" saved', "success");
  };
  window.deleteQuiz = function (id) {
    if (!confirm("Delete this quiz and all its results?")) return;
    allQuizzes[activeClassId] = (allQuizzes[activeClassId] || []).filter(
      (q) => q.id !== id,
    );
    saveQuizzes();
    renderCBT();
    showToast("Quiz deleted", "info");
  };
  window.startQuiz = function (id) {
    const q = (allQuizzes[activeClassId] || []).find((x) => x.id === id);
    if (!q) return;
    activeQuizData = q;
    quizStartTime = Date.now();
    clearInterval(quizTimerInterval);
    document.getElementById("takeQuizTitle").textContent = q.title;
    document.getElementById("takeQuizMeta").textContent =
      q.questions.length + " questions" + (q.subject ? " · " + q.subject : "");
    document.getElementById("takeQuizResult").style.display = "none";
    document.getElementById("takeQuizActions").style.display = "flex";
    const body = document.getElementById("takeQuizBody");
    body.innerHTML = q.questions
      .map(
        (
          qn,
          i,
        ) => `<div class="quiz-take-q"><div class="quiz-take-qnum">Q${i + 1} <span class="quiz-take-qtext">${qn.q}</span></div>
    <div class="quiz-take-opts">${Object.entries(qn.opts)
      .filter(([, v]) => v)
      .map(
        ([opt, text]) => `<label class="quiz-take-opt">
      <input type="radio" name="tq-${i}" value="${opt}"/>
      <span class="quiz-take-opt-label">${opt}</span>
      <span class="quiz-take-opt-text">${text}</span>
    </label>`,
      )
      .join("")}</div></div>`,
      )
      .join("");
    // Cross-browser: add .selected class on click (fallback for browsers without :has())
    body
      .querySelectorAll('.quiz-take-opt input[type="radio"]')
      .forEach((radio) => {
        radio.addEventListener("change", () => {
          const group = body.querySelectorAll(
            'input[name="' + radio.name + '"]',
          );
          group.forEach((r) =>
            r.closest(".quiz-take-opt").classList.remove("selected"),
          );
          radio.closest(".quiz-take-opt").classList.add("selected");
        });
      });
    const timerEl = document.getElementById("quizTimer");
    if (q.timeLimit > 0) {
      timerEl.style.display = "";
      let rem = q.timeLimit * 60;
      const tick = () => {
        rem--;
        const m = Math.floor(rem / 60)
            .toString()
            .padStart(2, "0"),
          s = (rem % 60).toString().padStart(2, "0");
        timerEl.textContent = m + ":" + s;
        timerEl.style.color = rem < 60 ? "var(--rose)" : "var(--accent)";
        if (rem <= 0) {
          clearInterval(quizTimerInterval);
          submitQuiz();
        }
      };
      tick();
      quizTimerInterval = setInterval(tick, 1000);
    } else timerEl.style.display = "none";
    document.getElementById("takeQuizModal").classList.add("active");
  };
  window.submitQuiz = function () {
    clearInterval(quizTimerInterval);
    const q = activeQuizData;
    if (!q) return;
    let correct = 0;
    const breakdown = q.questions.map((qn, i) => {
      const chosen =
        document.querySelector('input[name="tq-' + i + '"]:checked')?.value ||
        null;
      const isRight = chosen === qn.correct;
      if (isRight) correct++;
      return { q: qn.q, chosen, correct: qn.correct, isRight };
    });
    const pct = Math.round((correct / q.questions.length) * 100),
      timeTaken = Math.round((Date.now() - quizStartTime) / 1000),
      grade = gradeResult(pct);
    const idx = (allQuizzes[activeClassId] || []).findIndex(
      (x) => x.id === q.id,
    );
    if (idx >= 0) {
      if (!allQuizzes[activeClassId][idx].results)
        allQuizzes[activeClassId][idx].results = [];
      allQuizzes[activeClassId][idx].results.push({
        date: new Date().toISOString(),
        pct,
        correct,
        total: q.questions.length,
        timeTaken,
      });
      saveQuizzes();
    }
    document.getElementById("takeQuizBody").innerHTML = breakdown
      .map(
        (b, i) =>
          `<div class="quiz-result-q ${b.isRight ? "quiz-r-correct" : "quiz-r-wrong"}"><div class="quiz-result-qnum">${b.isRight ? "✅" : "❌"} Q${i + 1}: ${b.q}</div><div style="font-size:.82rem;margin-top:.3rem;">Your answer: <strong>${b.chosen || "Not answered"}</strong>${!b.isRight ? ' · Correct: <strong style="color:var(--success)">' + b.correct + "</strong>" : ""}</div></div>`,
      )
      .join("");
    document.getElementById("takeQuizResult").style.display = "block";
    document.getElementById("takeQuizResult").innerHTML =
      `<div style="font-size:3rem;margin-bottom:.5rem;">${pct >= 70 ? "🏆" : pct >= 50 ? "📚" : "💪"}</div><div style="font-family:var(--font-display);font-size:2.5rem;font-weight:800;color:var(--accent);">${pct}%</div><span class="grade-pill ${grade.cls}" style="font-size:1rem;padding:.4rem 1.2rem;margin:.5rem 0;display:inline-block;">${grade.g} — ${grade.r}</span><div style="color:var(--muted);font-size:.88rem;margin-top:.5rem;">${correct} of ${q.questions.length} correct · ${Math.floor(timeTaken / 60)}m ${timeTaken % 60}s</div>`;
    document.getElementById("takeQuizActions").style.display = "none";
    renderCBT();
  };
  window.viewQuizResults = function (id) {
    const q = (allQuizzes[activeClassId] || []).find((x) => x.id === id);
    if (!q || !q.results?.length) {
      showToast("No results recorded yet for this quiz", "info");
      return;
    }
    const avg = Math.round(
        q.results.reduce((a, r) => a + r.pct, 0) / q.results.length,
      ),
      g = gradeResult(avg);
    const rows = q.results
      .slice()
      .reverse()
      .map((r, i) => {
        const d = new Date(r.date).toLocaleDateString("en-GB", {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        const rg = gradeResult(r.pct);
        return (
          '<div style="display:flex;align-items:center;gap:.8rem;padding:.65rem 0;border-bottom:1px solid var(--border);">' +
          '<div style="width:26px;height:26px;border-radius:8px;background:var(--surface-2);display:flex;align-items:center;justify-content:center;font-size:.78rem;font-weight:700;color:var(--muted);">' +
          (q.results.length - i) +
          "</div>" +
          '<div style="flex:1;"><div style="font-weight:600;font-size:.86rem;">' +
          d +
          '</div><div style="font-size:.76rem;color:var(--muted);">' +
          r.correct +
          "/" +
          r.total +
          " correct · " +
          Math.floor(r.timeTaken / 60) +
          "m " +
          (r.timeTaken % 60) +
          "s</div></div>" +
          '<span class="grade-pill ' +
          rg.cls +
          '">' +
          r.pct +
          "%</span></div>"
        );
      })
      .join("");
    document.getElementById("takeQuizTitle").textContent =
      q.title + " — Results";
    document.getElementById("takeQuizMeta").textContent =
      q.results.length + " attempts · Average: " + avg + "% (" + g.g + ")";
    document.getElementById("takeQuizBody").innerHTML = rows;
    document.getElementById("takeQuizResult").style.display = "none";
    document.getElementById("takeQuizActions").style.display = "none";
    document.getElementById("quizTimer").style.display = "none";
    document.getElementById("takeQuizModal").classList.add("active");
  };

  // ════════════════════════════════════════════════════
  //  AI TEACHER COMMENT
  // ════════════════════════════════════════════════════
  let aiTargetStudentId = null;

  window.openAiComment = function (studentId) {
    aiTargetStudentId = studentId;
    const student = (allStudents[activeClassId] || []).find(
      (s) => s.id === studentId,
    );
    if (!student) return;
    document.getElementById("aiCommentStudentName").textContent = student.name;
    document.getElementById("aiCommentResult").style.display = "none";
    document.getElementById("aiCommentLoading").style.display = "none";
    document.getElementById("aiCommentError").style.display = "none";
    document.getElementById("aiCommentActions").style.display = "flex";
    const hasKey = !!aiSessionKey;
    document.getElementById("aiKeySection").style.display = hasKey
      ? "none"
      : "block";
    if (!hasKey) window.openAiKeyModal();
    document.getElementById("aiCommentModal").classList.add("active");
  };

  function _hydrateAiKey() {
    if (aiSessionKey) return aiSessionKey;
    const legacyKey = sessionStorage.getItem("gf_ai_key") || "";
    if (legacyKey) {
      aiSessionKey = legacyKey;
      sessionStorage.removeItem("gf_ai_key");
      localStorage.removeItem("gf_ai_key");
      return aiSessionKey;
    }
    const legacyLocalKey = localStorage.getItem("gf_ai_key") || "";
    if (legacyLocalKey) {
      aiSessionKey = legacyLocalKey;
      sessionStorage.setItem("gf_ai_key", legacyLocalKey);
      localStorage.removeItem("gf_ai_key");
      return aiSessionKey;
    }
    return "";
  }

  window.openAiKeyModal = function () {
    const input = document.getElementById("aiApiKeyInput");
    if (input) input.value = "";
    const modal = document.getElementById("aiKeyModal");
    if (modal) modal.classList.add("active");
  };

  window.saveAiKey = function () {
    const key = document.getElementById("aiApiKeyInput").value.trim();
    if (!key || key.length < 20) {
      showToast(
        "Please enter a valid Gemini API key (starts with AIzaSy...)",
        "error",
      );
      return;
    }

    // SECURITY: Warn if key looks like it might be exposed
    if (!key.startsWith("AIzaSy")) {
      showToast(
        "⚠️ This doesn't look like a valid Gemini API key. Verify it starts with 'AIzaSy'",
        "warning",
      );
      return;
    }

    aiSessionKey = key;
    sessionStorage.setItem("gf_ai_key", key);
    localStorage.removeItem("gf_ai_key");
    document.getElementById("aiKeySection").style.display = "none";
    closeModal("aiKeyModal");
    showToast(
      "✅ API key saved for this session (cleared when browser closes)",
      "success",
    );
  };

  window.selectTone = function (btn) {
    document
      .querySelectorAll(".ai-tone-btn")
      .forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
  };

  window.generateAiComment = async function () {
    const apiKey = _hydrateAiKey();
    if (!apiKey) {
      document.getElementById("aiKeySection").style.display = "block";
      window.openAiKeyModal();
      return;
    }

    const student = (allStudents[activeClassId] || []).find(
      (s) => s.id === aiTargetStudentId,
    );
    const cls = classes.find((c) => c.id === activeClassId);
    if (!student || !cls) return;

    const ranked = rankStudents(allStudents[activeClassId] || []);
    const rs = ranked.find((s) => s.id === aiTargetStudentId);
    const overall = computeStudentOverall(student);
    const grade = gradeResult(overall);
    const tone =
      document.querySelector(".ai-tone-btn.active")?.dataset?.tone ||
      "encouraging";
    const language = document.getElementById("aiLanguageSelect").value;
    const classSize = (allStudents[activeClassId] || []).length;

    const subjectSummary = student.subjects
      .map((sub) => {
        const c = computeSubject(sub);
        const g = gradeResult(c.total);
        return `${sub.name}: ${c.total ?? "pending"}% (${g.g})`;
      })
      .join(", ");

    document.getElementById("aiCommentResult").style.display = "none";
    document.getElementById("aiCommentLoading").style.display = "block";
    document.getElementById("aiCommentActions").style.display = "none";
    document.getElementById("aiCommentError").style.display = "none";

    const prompt = `You are a Nigerian school teacher writing an end-of-term report card comment for a student.

Student: ${student.name}
Class: ${cls.name}
Position: ${rs?.pos ? ordinal(rs.pos) : "not yet ranked"} out of ${classSize} students
Overall average: ${overall ?? "pending"}% — Grade ${grade.g} (${grade.r})
Subject breakdown: ${subjectSummary}
Academic term: ${settings.term || "Second Term"} ${settings.session || "2025/2026"}
Tone: ${tone}
Language: ${language}

Write a single, personal, natural-sounding teacher's comment (2–4 sentences). 
- Reference the student's actual performance and specific subjects where relevant
- If they performed well, celebrate it genuinely
- If they underperformed, be constructive and motivating, not harsh
- Sound like a real Nigerian teacher, warm and professional
- Do NOT use placeholders like [name] — use the actual name
- Write ONLY the comment text, nothing else`;

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 300, temperature: 0.8 },
          }),
        },
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(
          err.error?.message || "API error — check your Gemini key",
        );
      }
      const data = await res.json();
      const comment =
        data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      document.getElementById("aiCommentText").value = comment;
      document.getElementById("aiCommentLoading").style.display = "none";
      document.getElementById("aiCommentResult").style.display = "block";
      document.getElementById("aiCommentActions").style.display = "none";
    } catch (err) {
      document.getElementById("aiCommentLoading").style.display = "none";
      document.getElementById("aiCommentActions").style.display = "flex";
      document.getElementById("aiCommentError").style.display = "block";
      document.getElementById("aiCommentError").innerHTML =
        `<div style="background:#fee2e2;border-radius:var(--r-md);padding:.9rem 1rem;color:#7f1d1d;font-size:.85rem;"><i class="bi bi-exclamation-triangle-fill"></i> <strong>Error:</strong> ${err.message}. Please check your API key in settings.</div>`;
    }
  };

  window.copyAiComment = function () {
    const text = document.getElementById("aiCommentText").value;
    navigator.clipboard
      .writeText(text)
      .then(() => showToast("✅ Comment copied to clipboard", "success"));
  };

  window.applyAiCommentToPDF = async function () {
    const comment = document.getElementById("aiCommentText").value.trim();
    if (!comment) return;
    closeModal("aiCommentModal");
    await exportStudentPDF(aiTargetStudentId, comment);
  };

  // ════════════════════════════════════════════════════
  //  WHATSAPP SHARE
  // ════════════════════════════════════════════════════
  let waTargetStudentId = null;

  window.openWhatsAppShare = async function (studentId) {
    waTargetStudentId = studentId;
    const student = (allStudents[activeClassId] || []).find(
      (s) => s.id === studentId,
    );
    const cls = classes.find((c) => c.id === activeClassId);
    if (!student || !cls) return;

    try {
      showToast("📄 Generating report card PDF...", "info");

      // Generate PDF as blob for WhatsApp sharing
      const pdfBlob = await generateStudentPDFAsBlob(studentId);
      if (!pdfBlob) {
        showToast("Failed to generate PDF", "error");
        return;
      }

      // Store PDF blob for sharing
      window.whatsappPdfBlob = pdfBlob;
      window.whatsappStudentName = student.name;

      // Check if Web Share API is available (mobile devices)
      if (navigator.share) {
        const file = new File(
          [pdfBlob],
          `${student.name.replace(/\s+/g, "_")}_Report_Card.pdf`,
          {
            type: "application/pdf",
          },
        );
        try {
          await navigator.share({
            title: "Report Card",
            text: `${student.name}'s report card from ${settings.pdfSchool || "School"}`,
            files: [file],
          });
          showToast("✅ Shared successfully!", "success");
          return;
        } catch (err) {
          if (err.name !== "AbortError") {
            console.error("Share API error:", err);
          }
        }
      }

      // Fallback: Create blob URL and offer download + WhatsApp send
      const blobUrl = URL.createObjectURL(pdfBlob);
      window.whatsappPdfUrl = blobUrl;

      const ranked = rankStudents(allStudents[activeClassId] || []);
      const rs = ranked.find((s) => s.id === studentId);
      const overall = computeStudentOverall(student);
      const grade = gradeResult(overall);
      const classSize = (allStudents[activeClassId] || []).length;
      const school = settings.pdfSchool || currentUser?.org || "School";
      const term = settings.term || "Second Term";
      const session = settings.session || "2025/2026";

      const msg =
        `📋 *Report Card — ${student.name}*\n` +
        `School: ${school}\n` +
        `${term} · ${session}\n` +
        `Class: ${cls.name}, Position: ${rs?.pos ? ordinal(rs.pos) : "—"} of ${classSize}\n` +
        `Overall: ${overall ?? "—"}% (Grade ${grade.g})\n\n` +
        `📎 Report card PDF attached below ↓\n` +
        `Generated by GradeFlow`;

      document.getElementById("waShareStudentName").textContent = student.name;
      document.getElementById("waMessagePreview").textContent = msg;
      document.getElementById("waPhoneInput").value = "";

      // Show modal with enhanced info about PDF sharing
      const modal = document.getElementById("whatsappShareModal");
      if (!modal.querySelector(".wa-pdf-notice")) {
        const notice = document.createElement("div");
        notice.className = "wa-pdf-notice";
        notice.style.cssText = `
          background: #e7faf0;
          border: 1px solid #b2eacb;
          border-radius: 8px;
          padding: 12px;
          margin-bottom: 16px;
          font-size: 14px;
          color: #1a7a3e;
          display: flex;
          align-items: center;
          gap: 8px;
        `;
        notice.innerHTML = `
          <i class="bi bi-file-pdf" style="font-size: 18px;"></i>
          <span><strong>PDF Ready!</strong> Your report card is ready to share as PDF. Download or send via WhatsApp.</span>
        `;
        const msgPreview = modal.querySelector(".modal-body") || modal;
        msgPreview.insertBefore(notice, msgPreview.firstChild);
      }

      modal.classList.add("active");
      showToast("✅ PDF generated! Ready to share.", "success");
    } catch (err) {
      console.error("WhatsApp share error:", err);
      showToast("Error generating PDF for sharing", "error");
    }
  };

  window.openWhatsApp = async function () {
    const msg = document.getElementById("waMessagePreview").textContent;
    let phone = document
      .getElementById("waPhoneInput")
      .value.trim()
      .replace(/\D/g, "");
    if (phone.startsWith("0")) phone = "234" + phone.slice(1);

    // If PDF is available, offer to download it first
    if (window.whatsappPdfBlob) {
      const pdfFileName = `${window.whatsappStudentName.replace(/\s+/g, "_")}_Report_Card.pdf`;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(window.whatsappPdfBlob);
      link.download = pdfFileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Show instruction toast
      showToast("📄 PDF downloaded! Open WhatsApp to send it.", "info");

      // Also open WhatsApp with the message
      if (phone) {
        const encoded = encodeURIComponent(msg);
        setTimeout(() => {
          window.open(`https://wa.me/${phone}?text=${encoded}`, "_blank");
        }, 800);
      }
    } else {
      // Fallback: just open WhatsApp with message text
      const encoded = encodeURIComponent(msg);
      const url = phone
        ? `https://wa.me/${phone}?text=${encoded}`
        : `https://wa.me/?text=${encoded}`;
      window.open(url, "_blank");
    }

    closeModal("whatsappShareModal");
  };

  window.downloadWhatsAppPdf = function () {
    if (!window.whatsappPdfBlob) {
      showToast("PDF not ready. Please try again.", "error");
      return;
    }
    const pdfFileName = `${window.whatsappStudentName.replace(/\s+/g, "_")}_Report_Card.pdf`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(window.whatsappPdfBlob);
    link.download = pdfFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`✅ ${pdfFileName} downloaded`, "success");
  };

  window.copyWaMessage = function () {
    const msg = document.getElementById("waMessagePreview").textContent;
    navigator.clipboard
      .writeText(msg)
      .then(() => showToast("✅ Message copied!", "success"));
  };

  // ════════════════════════════════════════════════════
  //  PWA — PROGRESSIVE WEB APP
  // ════════════════════════════════════════════════════
  let pwaInstallPrompt = null;

  window.installPWA = function () {
    if (pwaInstallPrompt) {
      pwaInstallPrompt.prompt();
      pwaInstallPrompt.userChoice.then((choice) => {
        if (choice.outcome === "accepted")
          showToast("✅ GradeFlow installed!", "success");
        pwaInstallPrompt = null;
        document.getElementById("pwaInstallBanner").style.display = "none";
      });
    }
  };

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    pwaInstallPrompt = e;
    const banner = document.getElementById("pwaInstallBanner");
    if (banner && !localStorage.getItem("gf_pwa_dismissed")) {
      banner.style.display = "flex";
    }
  });

  window.addEventListener("appinstalled", () => {
    document.getElementById("pwaInstallBanner").style.display = "none";
    showToast("✅ GradeFlow installed as app!", "success");
  });

  // ════════════════════════════════════════════════════
  //  INIT
  // ════════════════════════════════════════════════════
  function init() {
    // Service worker registered in index.html <head> for earlier activation
    if (window.GradeFlowAPI) {
      try {
        console.info(
          "GradeFlow API layer ready:",
          window.GradeFlowAPI.getConfig(),
        );
      } catch {}
    }

    const savedTheme = localStorage.getItem("gf_theme");
    if (savedTheme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
      document.getElementById("themeIcon").className = "bi bi-sun-fill";
      document.getElementById("themeLabel").textContent = "Light mode";
    }

    const savedEmail = localStorage.getItem("gf_current_user");
    if (savedEmail) {
      const accounts = JSON.parse(localStorage.getItem("gf_accounts") || "{}");
      if (accounts[savedEmail]) {
        currentUser = accounts[savedEmail];
        ensureCurrentUserRole();
        saveUserToStorage(currentUser);
        // Validate persisted session before auto-entering dashboard.
        const exp = parseInt(
          localStorage.getItem(`gf_session_expiresAt_${savedEmail}`) || "0",
          10,
        );
        const last = parseInt(
          localStorage.getItem(`gf_session_lastActivity_${savedEmail}`) || "0",
          10,
        );
        const now = Date.now();
        const sessionExpired =
          (exp && now >= exp) || (last && now - last >= SESSION_IDLE_MS);
        if (sessionExpired) {
          localStorage.removeItem("gf_current_user");
          localStorage.removeItem(`gf_session_expiresAt_${savedEmail}`);
          localStorage.removeItem(`gf_session_lastActivity_${savedEmail}`);
        } else {
          loadUserData();
          if (!_hasConsent(savedEmail)) {
            showPage("landing");
            openConsentModal(true);
            return;
          }
          enterDashboard();
          return;
        }
      }
    }

    showPage("landing");
    handleResponsive();
    ensureSidebarOverlay();
  }

  init();
})();
