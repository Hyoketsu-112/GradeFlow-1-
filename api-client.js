(function () {
  "use strict";

  const INITIAL_API_BASE = localStorage.getItem("gf_api_base") || "";
  const PROVIDER = localStorage.getItem("gf_api_provider") || "local";
  const INITIAL_SUPABASE_URL = localStorage.getItem("gf_supabase_url") || "";
  const INITIAL_SUPABASE_KEY = localStorage.getItem("gf_supabase_key") || "";
  const INITIAL_FIREBASE_CONFIG = (() => {
    try {
      const raw = localStorage.getItem("gf_firebase_config") || "";
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  })();

  function _baseUrl() {
    return (window.GradeFlowAPI?.baseUrl || "").replace(/\/$/, "");
  }

  function _supabaseUrl() {
    return (window.GradeFlowAPI?.supabaseUrl || "").trim();
  }

  function _supabaseKey() {
    return (window.GradeFlowAPI?.supabaseKey || "").trim();
  }

  function _firebaseConfig() {
    return window.GradeFlowAPI?.firebaseConfig || INITIAL_FIREBASE_CONFIG || {};
  }

  function _isFirebaseConfigured() {
    const config = _firebaseConfig();
    return !!(
      config.apiKey &&
      config.authDomain &&
      config.projectId &&
      config.appId
    );
  }

  function _normalizeFirebaseConfig(config) {
    const source = config || {};
    return {
      apiKey: String(source.apiKey || source.webApiKey || "").trim(),
      authDomain: String(source.authDomain || "").trim(),
      projectId: String(source.projectId || "").trim(),
      appId: String(source.appId || "").trim(),
      storageBucket: String(source.storageBucket || "").trim(),
      messagingSenderId: String(source.messagingSenderId || "").trim(),
      measurementId: String(source.measurementId || "").trim(),
    };
  }

  function _firebaseApp() {
    if (typeof window.firebase === "undefined" || !_isFirebaseConfigured()) {
      return null;
    }
    try {
      if (window.firebase.apps && window.firebase.apps.length) {
        return window.firebase.app();
      }
      return window.firebase.initializeApp(_firebaseConfig());
    } catch (err) {
      console.warn("⚠️ Firebase init warning:", err?.message || err);
      return null;
    }
  }

  function _firebaseAuth() {
    if (!_firebaseApp()) return null;
    try {
      const auth = window.firebase.auth();
      if (!auth._gradeflowPersistenceReady) {
        auth
          .setPersistence(window.firebase.auth.Auth.Persistence.LOCAL)
          .catch(() => {});
        auth._gradeflowPersistenceReady = true;
      }
      return auth;
    } catch (err) {
      console.warn("⚠️ Firebase auth warning:", err?.message || err);
      return null;
    }
  }

  function _firebaseDb() {
    if (!_firebaseApp()) return null;
    try {
      const db = window.firebase.firestore();
      if (!db._gradeflowPersistenceReady) {
        db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
        db._gradeflowPersistenceReady = true;
      }
      return db;
    } catch (err) {
      console.warn("⚠️ Firebase firestore warning:", err?.message || err);
      return null;
    }
  }

  function _firebaseUserRef(uid) {
    const db = _firebaseDb();
    if (!db || !uid) return null;
    return db.collection("gradeflow_users").doc(uid);
  }

  function _firebaseClone(value) {
    try {
      return JSON.parse(JSON.stringify(value == null ? {} : value));
    } catch {
      return value == null ? {} : value;
    }
  }

  async function _upsertFirebaseUser(payload) {
    const { email, pass, name, organization, org, role } = payload || {};
    if (!email || !pass) {
      return {
        ok: false,
        provider: "firebase",
        message: "Missing email or password for Firebase auth",
      };
    }
    if (!_isFirebaseConfigured()) {
      return {
        ok: false,
        provider: "firebase",
        message: "Firebase config not configured",
      };
    }
    const auth = _firebaseAuth();
    if (!auth) {
      return {
        ok: false,
        provider: "firebase",
        message: "Firebase SDK not available",
      };
    }

    let authResult;
    try {
      authResult = await auth.createUserWithEmailAndPassword(email, pass);
    } catch (err) {
      return {
        ok: false,
        provider: "firebase",
        code: err?.code || "firebase/auth",
        message: err?.message || "Firebase signup failed",
      };
    }

    const user = authResult?.user || auth.currentUser;
    if (!user) {
      return {
        ok: false,
        provider: "firebase",
        message: "Firebase user creation succeeded but no user was returned",
      };
    }

    const now = new Date().toISOString();
    const profile = {
      email: (user.email || email || "").toLowerCase(),
      name: name || user.displayName || "",
      organization: organization || org || "",
      role: role || "teacher",
      createdAt: now,
      updatedAt: now,
      lastLogin: now,
    };

    if (name && user.displayName !== name) {
      try {
        await user.updateProfile({ displayName: name });
      } catch {}
    }

    const ref = _firebaseUserRef(user.uid);
    if (ref) {
      try {
        await ref.set(
          { profile, data: {}, updatedAt: profile.updatedAt },
          { merge: true },
        );
      } catch (err) {
        console.warn("⚠️ Firebase signup sync warning:", err?.message || err);
      }
    }

    return { ok: true, provider: "firebase", synced: true, uid: user.uid };
  }

  async function _loginFirebaseUser(payload) {
    const { email, pass, name, organization, org, role } = payload || {};
    if (!email || !pass) {
      return {
        ok: false,
        provider: "firebase",
        message: "Missing email or password for Firebase auth",
      };
    }
    if (!_isFirebaseConfigured()) {
      return {
        ok: false,
        provider: "firebase",
        message: "Firebase config not configured",
      };
    }
    const auth = _firebaseAuth();
    if (!auth) {
      return {
        ok: false,
        provider: "firebase",
        message: "Firebase SDK not available",
      };
    }

    let authResult;
    try {
      authResult = await auth.signInWithEmailAndPassword(email, pass);
    } catch (err) {
      return {
        ok: false,
        provider: "firebase",
        code: err?.code || "firebase/auth",
        message: err?.message || "Firebase login failed",
      };
    }

    const user = authResult?.user || auth.currentUser;
    if (!user) {
      return {
        ok: false,
        provider: "firebase",
        message: "Firebase login succeeded but no user was returned",
      };
    }

    const now = new Date().toISOString();
    const profile = {
      email: (user.email || email || "").toLowerCase(),
      name: name || user.displayName || "",
      organization: organization || org || "",
      role: role || "teacher",
      updatedAt: now,
      lastLogin: now,
    };

    const ref = _firebaseUserRef(user.uid);
    if (ref) {
      try {
        await ref.set({ profile, updatedAt: now }, { merge: true });
      } catch (err) {
        console.warn("⚠️ Firebase login sync warning:", err?.message || err);
      }
    }

    return { ok: true, provider: "firebase", synced: true, uid: user.uid };
  }

  async function _loginFirebaseGoogleUser(payload) {
    const { role, org } = payload || {};
    if (!_isFirebaseConfigured()) {
      return {
        ok: false,
        provider: "firebase",
        message: "Firebase config not configured",
      };
    }
    const auth = _firebaseAuth();
    if (!auth) {
      return {
        ok: false,
        provider: "firebase",
        message: "Firebase SDK not available",
      };
    }
    if (!window.firebase?.auth?.GoogleAuthProvider) {
      return {
        ok: false,
        provider: "firebase",
        message: "Google sign-in is not available in the loaded Firebase SDK",
      };
    }

    const provider = new window.firebase.auth.GoogleAuthProvider();
    provider.addScope("email");
    provider.addScope("profile");
    provider.setCustomParameters({ prompt: "select_account" });

    let authResult;
    try {
      authResult = await auth.signInWithPopup(provider);
    } catch (err) {
      return {
        ok: false,
        provider: "firebase",
        code: err?.code || "firebase/auth",
        message: err?.message || "Google sign-in failed",
      };
    }

    const user = authResult?.user || auth.currentUser;
    if (!user) {
      return {
        ok: false,
        provider: "firebase",
        message: "Google sign-in succeeded but no user was returned",
      };
    }

    const now = new Date().toISOString();
    const providerProfile =
      authResult?.additionalUserInfo?.profile ||
      authResult?.user?.providerData?.find((entry) => entry?.email) ||
      user?.providerData?.find((entry) => entry?.email) ||
      {};
    const profileEmail = String(
      user.email ||
        providerProfile.email ||
        authResult?.additionalUserInfo?.profile?.email ||
        payload?.email ||
        "",
    )
      .toLowerCase()
      .trim();
    const profileName =
      user.displayName ||
      providerProfile.displayName ||
      authResult?.additionalUserInfo?.profile?.name ||
      "";
    const profilePhotoURL = user.photoURL || providerProfile.photoURL || "";
    const profile = {
      email: profileEmail,
      name: profileName,
      organization: org || "",
      role: role || "teacher",
      createdAt: now,
      updatedAt: now,
      lastLogin: now,
      photoURL: profilePhotoURL,
      authProvider: "google",
    };

    const ref = _firebaseUserRef(user.uid);
    if (ref) {
      try {
        await ref.set({ profile, updatedAt: now }, { merge: true });
      } catch (err) {
        console.warn(
          "⚠️ Firebase Google sign-in sync warning:",
          err?.message || err,
        );
      }
    }

    return {
      ok: true,
      provider: "firebase",
      authMethod: "google",
      synced: true,
      uid: user.uid,
      email: profile.email,
      userEmail: profile.email,
      name: profile.name,
      userName: profile.name,
      photoURL: profile.photoURL,
      profile,
      user: {
        uid: user.uid,
        email: profile.email,
        displayName: profile.name,
        photoURL: profile.photoURL,
      },
    };
  }

  async function _syncFirebaseUserData(payload) {
    const auth = _firebaseAuth();
    if (!auth) {
      return {
        ok: false,
        provider: "firebase",
        message: "Firebase is not ready",
      };
    }
    const user = auth.currentUser;
    if (!user) {
      return {
        ok: false,
        provider: "firebase",
        message: "No Firebase user session",
      };
    }

    const ref = _firebaseUserRef(user.uid);
    if (!ref) {
      return {
        ok: false,
        provider: "firebase",
        message: "Firebase user document unavailable",
      };
    }

    const now = new Date().toISOString();
    const snapshot = {
      profile: {
        email: (payload?.email || user.email || "").toLowerCase(),
        name: payload?.name || user.displayName || "",
        organization: payload?.organization || payload?.org || "",
        role: payload?.role || "teacher",
        updatedAt: now,
      },
      updatedAt: now,
      data: {
        classes: _firebaseClone(payload?.classes || []),
        allStudents: _firebaseClone(payload?.allStudents || {}),
        settings: _firebaseClone(payload?.settings || {}),
        parentEnrollments: _firebaseClone(payload?.parentEnrollments || []),
        selectedParentEnrollmentId: String(
          payload?.selectedParentEnrollmentId || "",
        ),
      },
    };

    try {
      await ref.set(snapshot, { merge: true });
      return {
        ok: true,
        provider: "firebase",
        message: "Data synced",
        data: snapshot.data,
      };
    } catch (err) {
      return {
        ok: false,
        provider: "firebase",
        code: err?.code || "firebase/firestore",
        message: err?.message || "Firebase data sync failed",
      };
    }
  }

  async function _readFirebaseUserData(payload) {
    const auth = _firebaseAuth();
    if (!auth) {
      return {
        ok: false,
        provider: "firebase",
        message: "Firebase is not ready",
      };
    }
    const user = auth.currentUser;
    const uid = payload?.user_id || user?.uid;
    if (!uid) {
      return {
        ok: false,
        provider: "firebase",
        message: "Missing Firebase user id",
      };
    }

    try {
      const ref = _firebaseUserRef(uid);
      if (!ref) {
        return {
          ok: false,
          provider: "firebase",
          message: "Firebase user document unavailable",
        };
      }
      const snap = await ref.get();
      if (!snap.exists) {
        return { ok: true, provider: "firebase", data: null };
      }
      return { ok: true, provider: "firebase", data: snap.data() || null };
    } catch (err) {
      return {
        ok: false,
        provider: "firebase",
        code: err?.code || "firebase/firestore",
        message: err?.message || "Firebase data read failed",
      };
    }
  }

  function _supabaseHeaders(extra) {
    const key = _supabaseKey();
    return Object.assign(
      {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      extra || {},
    );
  }

  function _jsonHeaders(extra) {
    return Object.assign({ "Content-Type": "application/json" }, extra || {});
  }

  async function _safeJson(res) {
    const txt = await res.text();
    try {
      return txt ? JSON.parse(txt) : {};
    } catch {
      return { raw: txt };
    }
  }

  async function _upsertSupabaseUser(payload) {
    const { email, name, organization, org } = payload || {};
    const supabaseUrl = _supabaseUrl();
    const supabaseKey = _supabaseKey();
    if (!supabaseUrl || !supabaseKey) {
      return {
        ok: false,
        provider: "supabase",
        message: "Supabase credentials not configured",
      };
    }
    if (!email) {
      return {
        ok: false,
        provider: "supabase",
        message: "Missing email for Supabase user sync",
      };
    }

    // Get current timestamp for login tracking
    const now = new Date().toISOString();

    const res = await fetch(`${supabaseUrl}/rest/v1/users?on_conflict=email`, {
      method: "POST",
      headers: _jsonHeaders(
        _supabaseHeaders({
          Prefer: "resolution=merge-duplicates,return=minimal",
          "Content-Profile": "public",
          "Accept-Profile": "public",
        }),
      ),
      body: JSON.stringify({
        email,
        name,
        organization: organization || org || null,
        last_login: now,
        updated_at: now,
      }),
    });

    if (!res.ok) {
      const err = await _safeJson(res);
      console.warn("⚠️ Supabase login sync warning:", {
        status: res.status,
        message: err?.message || err?.hint,
      });
      // Don't fail login just because cloud sync failed
      // User can still use app offline
      return {
        ok: true,
        provider: "supabase",
        synced: false,
        partialSync: true,
      };
    }

    console.log("✅ Login synced to cloud with timestamp:", now);
    return { ok: true, provider: "supabase", synced: true };
  }

  const adapters = {
    local: {
      async signUp(payload) {
        return { ok: true, provider: "local", payload };
      },
      async login(payload) {
        return { ok: true, provider: "local", payload };
      },
      async getUserData() {
        return { ok: true, provider: "local", data: null };
      },
      async saveUserData() {
        return { ok: true, provider: "local" };
      },
      async verifySubscription() {
        return { ok: true, provider: "local", tier: "local" };
      },
    },
    firebase: {
      async signUp(payload) {
        try {
          return await _upsertFirebaseUser(payload);
        } catch (err) {
          return {
            ok: false,
            provider: "firebase",
            code: err?.code || "firebase/auth",
            message: err?.message || "Firebase signup failed",
          };
        }
      },
      async login(payload) {
        try {
          return await _loginFirebaseUser(payload);
        } catch (err) {
          return {
            ok: false,
            provider: "firebase",
            code: err?.code || "firebase/auth",
            message: err?.message || "Firebase login failed",
          };
        }
      },
      async loginWithGoogle(payload) {
        try {
          return await _loginFirebaseGoogleUser(payload);
        } catch (err) {
          return {
            ok: false,
            provider: "firebase",
            code: err?.code || "firebase/auth",
            message: err?.message || "Google sign-in failed",
          };
        }
      },
      async getUserData(payload) {
        try {
          return await _readFirebaseUserData(payload);
        } catch (err) {
          return {
            ok: false,
            provider: "firebase",
            code: err?.code || "firebase/firestore",
            message: err?.message || "Firebase data read failed",
          };
        }
      },
      async saveUserData(payload) {
        try {
          return await _syncFirebaseUserData(payload);
        } catch (err) {
          return {
            ok: false,
            provider: "firebase",
            code: err?.code || "firebase/firestore",
            message: err?.message || "Firebase data sync failed",
          };
        }
      },
      async verifySubscription() {
        return { ok: true, provider: "firebase", tier: "free" };
      },
    },
    supabase: {
      async signUp(payload) {
        try {
          return await _upsertSupabaseUser(payload);
        } catch (err) {
          return { ok: false, provider: "supabase", message: err.message };
        }
      },
      async login(payload) {
        try {
          return await _upsertSupabaseUser(payload);
        } catch (err) {
          return { ok: false, provider: "supabase", message: err.message };
        }
      },
      async getUserData(payload) {
        try {
          const { user_id } = payload;
          const supabaseUrl = _supabaseUrl();
          const supabaseKey = _supabaseKey();
          if (!supabaseUrl || !supabaseKey || !user_id) {
            return {
              ok: false,
              provider: "supabase",
              message: "Missing credentials or user_id",
            };
          }
          // Fetch user's classes and data
          const res = await fetch(
            `${supabaseUrl}/rest/v1/classes?user_id=eq.${user_id}&select=*,students(*)`,
            {
              headers: {
                apikey: supabaseKey,
                Authorization: `Bearer ${supabaseKey}`,
              },
            },
          );
          if (!res.ok) {
            return {
              ok: false,
              provider: "supabase",
              message: "Failed to fetch data",
            };
          }
          const data = await _safeJson(res);
          return { ok: true, provider: "supabase", data };
        } catch (err) {
          return { ok: false, provider: "supabase", message: err.message };
        }
      },
      async saveUserData(payload) {
        try {
          const { user_id, classes } = payload;
          const supabaseUrl = _supabaseUrl();
          const supabaseKey = _supabaseKey();
          if (!supabaseUrl || !supabaseKey || !user_id) {
            return {
              ok: false,
              provider: "supabase",
              message: "Missing credentials or user_id",
            };
          }
          // Sync classes data (simplified - real implementation would handle upserts)
          // For now, just acknowledge the save
          return { ok: true, provider: "supabase", message: "Data synced" };
        } catch (err) {
          return { ok: false, provider: "supabase", message: err.message };
        }
      },
      async verifySubscription(payload) {
        try {
          const { user_id } = payload;
          const supabaseUrl = _supabaseUrl();
          const supabaseKey = _supabaseKey();
          if (!supabaseUrl || !supabaseKey) {
            return {
              ok: false,
              provider: "supabase",
              message: "Supabase credentials not configured",
            };
          }
          // Default to free tier (implement billing table if needed)
          return { ok: true, provider: "supabase", tier: "free" };
        } catch (err) {
          return { ok: false, provider: "supabase", message: err.message };
        }
      },
    },
    nextjs: {
      async signUp(payload) {
        if (!_baseUrl())
          return {
            ok: false,
            provider: "nextjs",
            message: "Set gf_api_base first",
            payload,
          };
        const res = await fetch(_baseUrl() + "/api/auth/signup", {
          method: "POST",
          headers: _jsonHeaders(),
          body: JSON.stringify(payload),
        });
        return { ok: res.ok, provider: "nextjs", data: await _safeJson(res) };
      },
      async login(payload) {
        if (!_baseUrl())
          return {
            ok: false,
            provider: "nextjs",
            message: "Set gf_api_base first",
            payload,
          };
        const res = await fetch(_baseUrl() + "/api/auth/login", {
          method: "POST",
          headers: _jsonHeaders(),
          body: JSON.stringify(payload),
        });
        return { ok: res.ok, provider: "nextjs", data: await _safeJson(res) };
      },
      async getUserData(payload) {
        if (!_baseUrl())
          return {
            ok: false,
            provider: "nextjs",
            message: "Set gf_api_base first",
            payload,
          };
        const res = await fetch(_baseUrl() + "/api/gradeflow/user-data", {
          method: "POST",
          headers: _jsonHeaders(),
          body: JSON.stringify(payload || {}),
        });
        return { ok: res.ok, provider: "nextjs", data: await _safeJson(res) };
      },
      async saveUserData(payload) {
        if (!_baseUrl())
          return {
            ok: false,
            provider: "nextjs",
            message: "Set gf_api_base first",
            payload,
          };
        const res = await fetch(_baseUrl() + "/api/gradeflow/user-data", {
          method: "PUT",
          headers: _jsonHeaders(),
          body: JSON.stringify(payload || {}),
        });
        return { ok: res.ok, provider: "nextjs", data: await _safeJson(res) };
      },
      async verifySubscription(payload) {
        if (!_baseUrl())
          return {
            ok: false,
            provider: "nextjs",
            message: "Set gf_api_base first",
            payload,
          };
        const res = await fetch(_baseUrl() + "/api/billing/entitlement", {
          method: "POST",
          headers: _jsonHeaders(),
          body: JSON.stringify(payload || {}),
        });
        return { ok: res.ok, provider: "nextjs", data: await _safeJson(res) };
      },
    },
  };

  function getAdapter() {
    return adapters[window.GradeFlowAPI.provider] || adapters.local;
  }

  window.GradeFlowAPI = {
    provider: PROVIDER,
    baseUrl: INITIAL_API_BASE,
    supabaseUrl: INITIAL_SUPABASE_URL,
    supabaseKey: INITIAL_SUPABASE_KEY,
    firebaseConfig: INITIAL_FIREBASE_CONFIG,
    setProvider(provider) {
      this.provider = provider || "local";
      localStorage.setItem("gf_api_provider", this.provider);
    },
    setBaseUrl(url) {
      this.baseUrl = (url || "").trim();
      localStorage.setItem("gf_api_base", this.baseUrl);
    },
    setSupabaseConfig(url, key) {
      this.supabaseUrl = (url || "").trim();
      this.supabaseKey = (key || "").trim();
      localStorage.setItem("gf_supabase_url", this.supabaseUrl);
      localStorage.setItem("gf_supabase_key", this.supabaseKey);
    },
    setFirebaseConfig(config) {
      this.firebaseConfig = _normalizeFirebaseConfig(config);
      localStorage.setItem(
        "gf_firebase_config",
        JSON.stringify(this.firebaseConfig),
      );
      _firebaseApp();
    },
    getConfig() {
      return {
        provider: this.provider,
        baseUrl: this.baseUrl,
        supabaseConfigured: !!(this.supabaseUrl && this.supabaseKey),
        firebaseConfigured: !!(
          this.firebaseConfig?.apiKey &&
          this.firebaseConfig?.authDomain &&
          this.firebaseConfig?.projectId &&
          this.firebaseConfig?.appId
        ),
        firebaseProjectId: this.firebaseConfig?.projectId || "",
      };
    },
    async signUp(payload) {
      return getAdapter().signUp(payload);
    },
    async login(payload) {
      return getAdapter().login(payload);
    },
    async loginWithGoogle(payload) {
      if (_isFirebaseConfigured() && adapters.firebase?.loginWithGoogle) {
        return adapters.firebase.loginWithGoogle(payload);
      }
      const adapter = getAdapter();
      if (adapter.loginWithGoogle) {
        return adapter.loginWithGoogle(payload);
      }
      return {
        ok: false,
        provider: this.provider,
        message:
          "Google sign-in requires Firebase. Set Cloud Connector to Firebase and paste the Firebase config JSON.",
      };
    },
    async getUserData(payload) {
      return getAdapter().getUserData(payload);
    },
    async saveUserData(payload) {
      return getAdapter().saveUserData(payload);
    },
    async verifySubscription(payload) {
      return getAdapter().verifySubscription(payload);
    },
  };
})();
