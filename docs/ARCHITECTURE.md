# GradeFlow Architecture

**Version**: 2.0 (Phase 2 Complete)  
**Last Updated**: April 8, 2026  
**Audience**: Developers, architects, tech leads

---

## 🏗️ System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   GradeFlow PWA (Frontend)                   │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ index.html (app shell) + style.css + script.js       │  │
│  │ Service Worker (sw.js) - offline caching             │  │
│  │ PWA Manifest (installable)                           │  │
│  └───────────────────────────────────────────────────────┘  │
│                          ↕ (optional Phase 3)                │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ IndexedDB (local cache) ← offline-first sync engine   │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          ↕ (Phase 3)
┌─────────────────────────────────────────────────────────────┐
│              Cloud Backend (Supabase)                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ PostgreSQL Database (canonical source)               │  │
│  │ Row-Level Security (RLS) policies                    │  │
│  │ Real-time subscriptions                             │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Supabase Auth (email/password)                       │  │
│  │ JWT tokens with rotation                            │  │
│  │ Session management                                  │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Edge Functions (webhooks, integrations)              │  │
│  │ Payments (Paystack webhook)                         │  │
│  │ Audit logging                                        │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 File Structure (Current)

```
GradeFlow/
├── index.html              # Main app shell (2000+ lines)
│                          # Contains all page templates (dashboard, auth, etc)
│
├── script.js              # Core application logic (6,300+ lines)
│                          # Modules:
│                          #  - Auth (login, logout, account)
│                          #  - Data (classes, students, scores)
│                          #  - Rendering (dashboards, tables)
│                          #  - Export (PDF, Excel, WhatsApp)
│                          #  - Analytics (charts, rankings)
│                          #  - Settings (preferences, backups)
│
├── style.css              # Design system (2,000+ lines)
│                          # Tokens: colors, spacing, shadows
│                          # Components: buttons, cards, forms
│                          # Layouts: grid, flexbox, responsive
│                          # Themes: light/dark mode
│
├── sw.js                  # Service Worker
│                          # Cache strategy (cache-first)
│                          # Offline fallback
│                          # Asset versioning
│
├── api-client.js          # Provider abstraction
│                          # Methods for local/cloud storage
│                          # Supabase integration hooks
│
├── manifest.json          # PWA metadata
│                          # App name, icons, colors
│                          # Installation settings
│
├── privacy-policy.html    # Legal pages
├── terms.html
│
└── GradeFlow_Documentation.md  # Product roadmap & requirements
```

---

## 🧩 Data Model (Phase 2)

### Stored in localStorage (email-namespaced keys):

```javascript
// Key format: gf_${email}_${entity}

gf_teacher@school.com_accounts
  └─ [{ email, name, org, role, schoolCode, ... }]

gf_teacher@school.com_classes
  └─ [{ id, name, emoji, subjects: [{id, name}, ...] }]

gf_teacher@school.com_students_${classId}
  └─ [{
       id, name,
       subjects: [{
         id, name,
         test: 0-20,
         prac: 0-20,
         exam: 0-60,
         total: null
       }]
     }]

gf_teacher@school.com_attendance_${classId}
  └─ {
       date: {
         studentId: 'P' | 'A' | 'L'
       }
     }

gf_teacher@school.com_materials_${classId}
  └─ [{
       id, title, desc, type,
       date, size, dataUrl
     }]

gf_teacher@school.com_quizzes_${classId}
  └─ [{
       id, title,
       questions: [{
         id, text, options, answer
       }],
       results: [{ studentId, score, date }]
     }]

gf_teacher@school.com_history
  └─ [{
       termName, date,
       snapshot: { classes, students, ... }
     }]

gf_teacher@school.com_settings
  └─ {
       gradingScale: [ { min, max, letter, remark } ],
       darkMode, locale, ...
     }
```

---

## 🔄 Key Algorithms

### Grading Calculation

```javascript
// computeSubject(subject) → { total, test, prac, exam }
test (0-20) + prac (0-20) + exam (0-60) = total (0-100)

// computeStudentOverall(student) → number
average of all subject totals

// rankStudents(students) → sorted by overall, with tiebreak
if tied: order by name alphabetically

// gradeResult(total) → { letter, remark, cssClass }
90-100: A, Excellent
80-89: B, Pass
70-79: C, Credit
60-69: D, Satisfactory
0-59: F, Fail
```

### Ranking Logic

```
Rank by:
1. Overall average (descending)
2. Subject count (tiebreak)
3. Name alphabetically (tiebreak)

Position: 1st, 2nd, 3rd, 4th+
Medals: 🏆 🥈 🥉 (top 3)
```

---

## 🔐 Security Architecture

### Password Security

```
Phase 1: User enters password
Phase 2: Hash with SHA-256 (old method)
  ↓ (on login, upgrade to bcrypt)
Phase 3: Store with bcrypt (10 rounds)
  ├─ Next login requests password
  ├─ Compare bcrypt(input) vs stored hash
  └─ If old hash: re-hash with bcrypt and save
```

### Session Management

```
Login:
  ├─ Validate credentials
  ├─ Create session object
  ├─ Store in sessionStorage + localStorage
  └─ Set idle timeout (15 min)

Check on app load:
  ├─ Session exists?
  ├─ Not expired?
  ├─ Idle < 15 min?
  └─ Age < 12 hours?
  → Valid = restore; Invalid = clear
```

### Permission Gates

```
canEditGrades():
  ├─ Check role = teacher || staff || admin
  └─ Show editable inputs; hide for students/parents

canViewGrades():
  ├─ Check role = teacher || staff || admin
  └─ Allow access; block for parents/students

canDeleteStudent():
  ├─ Check role = teacher || admin
  └─ Show delete button; hide for others

gateNavigation():
  ├─ Non-teachers: hide teacher workspace nav items
  └─ Teachers: full sidebar access
```

---

## 📊 Rendering Architecture

### Single-Page Application (SPA) Flow

```
1. App Initialization (on page load)
   ├─ Load index.html (always cached)
   ├─ Check service worker
   ├─ Restore session from localStorage
   ├─ Load user data (classes, students, etc)
   └─ Render appropriate page based on role

2. Page Navigation (no page reloads)
   ├─ Hide current page div
   ├─ Show target page div
   ├─ Fetch data if needed
   ├─ Render content into target div
   └─ Update URL (Phase 3)

3. Modal Workflows (for actions)
   ├─ Show modal div with overlay
   ├─ Capture form input
   ├─ Validate input on client
   ├─ Save to localStorage
   ├─ Re-render affected tables
   └─ Close modal
```

### Component Rendering Pattern

```javascript
function renderTable() {
  const data = loadData(); // Get from localStorage
  const rows = data.map((item) => {
    // Transform to HTML
    return `<tr>...</tr>`;
  });
  const html = `<table>${rows}</table>`;
  const el = document.getElementById("target");
  el.innerHTML = html; // Insert into DOM
}

// Triggered by:
// - Page show
// - Data change (toggle view, delete, add)
// - Filter/sort change
```

---

## 📤 Export Architecture

### PDF Report Generation

```
1. Collect data → student, subjects, grades, etc
2. Create HTML template → bootstrap styling
3. Use html2canvas → convert HTML to canvas
4. Use jsPDF → embed canvas as image
5. Download file → report_${date}.pdf
```

### Excel Broadsheet

```
1. Collect all students, subjects, scores
2. Transform to 2D array:
   ├─ Row 0: headers
   ├─ Row 1+: student data
   └─ Each column = class + subject
3. Use SheetJS → create workbook
4. Format: colors, borders, freeze panes
5. Download file → broadsheet_${className}.xlsx
```

### WhatsApp Share

```
1. Format result message:
   ├─ Student name
   ├─ Subjects and scores
   ├─ Overall average
   └─ Grade and remark
2. URL-encode message
3. Open WhatsApp API:
   └─ https://wa.me/${phone}?text=${encoded}
```

---

## 🔌 Phase 3 Architecture Changes

### Offline-First Sync

```
Client-side (IndexedDB + Service Worker):
  ├─ All data stored locally (IndexedDB)
  ├─ Changes marked as "pending_sync"
  ├─ Service worker intercepts API calls
  ├─ Queues changes if offline
  └─ Syncs when back online

Server-side (Supabase):
  ├─ PostgreSQL canonical source
  ├─ Receives sync updates from client
  ├─ Applies changes with conflict detection
  ├─ Returns resolved state
  └─ Notifies other devices of changes

Sync Flow:
  User enters grade
    ↓ (IndexedDB, mark pending_sync)
  Is online?
    ├─ Yes: POST /sync to server
    │   ├─ Server validates & applies
    │   ├─ Returns resolved data
    │   └─ Client marks synced
    └─ No: Queue locally
        └─ Retry when online
```

### API Layer (Phase 3)

```
Provider Abstraction:
  ├─ Local (current) - localStorage only
  ├─ Supabase (Phase 3) - cloud + sync
  └─ NextJS (future) - custom backend

Usage:
  const api = new ApiClient(provider);
  data = await api.getClasses();
  await api.saveStudent(student);
```

---

## 🧪 Testing Strategy

### Unit Tests (Algorithms)

```
- Grading calculations
- Ranking logic
- Validation functions
- Date formatting
- Data transformation
```

### Integration Tests (Features)

```
- Login flow end-to-end
- Grade entry → export
- Sync (Phase 3)
- Offline → online transition
```

### E2E Tests (User Flows)

```
- Teacher: login → create class → add students → enter grades → export
- Student: login → view grades → check ranking
- Parent: login → view child progress
```

---

## 📈 Performance Optimization

### Current (Phase 2)

- ✅ Service worker caching (assets)
- ✅ Lazy rendering (only visible content)
- ✅ Event delegation (single DOM listener)
- ✅ IndexedDB ready for Phase 3

### Phase 3 Targets

- 🏗️ API caching layer
- 🏗️ Incremental sync (only changed data)
- 🏗️ Virtual scrolling (1000+ students)
- 🏗️ Worker thread for heavy computations

### Metrics

- Page load: < 2s (offline)
- Grade entry: < 1s
- Export (PDF): < 5s
- Sync: < 10s (Phase 3)

---

## 🛡️ Security Considerations

### Current (Phase 2)

- Client-side only, no server trust required
- localStorage scoped by email
- Password hashing with upgrade path
- Session timeout enforcement

### Phase 3 Security Model

```
                                Frontend                  Backend
                        ┌──────────────────┐         ┌──────────────────┐
Login request:          │ GET /auth/login  │────────→│ Verify password  │
                        │                  │         │ Return JWT token │
                        └──────────────────┘         └──────────────────┘
                                │
                        JWT token stored
                        (httpOnly cookie ideal)
                                │
API request with JWT:           │
                        ┌──────────────────┐         ┌──────────────────┐
                        │ GET /data        │────────→│ Verify JWT       │
                        │ Auth: Bearer $JWT│         │ Check RLS policy │
                        │                  │←────────│ Return data      │
                        └──────────────────┘         └──────────────────┘
```

---

## 📞 Architecture Review Checklist

Before Phase 3 launch:

- [ ] Database schema normalized and indexed
- [ ] API security audited
- [ ] Sync conflict resolution tested
- [ ] Scalability load test (1000+ users)
- [ ] Disaster recovery plan documented
- [ ] Monitoring and alerting configured
- [ ] Team trained on architecture

---

**Last Updated**: April 8, 2026  
**Maintained by**: GradeFlow Engineering Team  
**Next Review**: June 15, 2026 (Phase 3 mid-check)
