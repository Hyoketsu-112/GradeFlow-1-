# GradeFlow Product and Engineering Documentation

**Version**: April 8, 2026  
**Product Stage**: Phase 2 Complete (Role-Based Dashboards & Permission Guards Live)  
**Primary Audience**: Nigerian primary and secondary school teachers  
**Next Milestone**: Phase 3 (Supabase Cloud Sync & Payment Infrastructure)

---

## Executive Summary

GradeFlow is a mature offline-first grading platform with proven classroom utility: class management, score entry, automatic grading, analytics, attendance, report export, and optional AI-assisted comments. It is fast, practical, and designed for local school workflows.

**Current State (Phase 2 Complete)**:

- ✅ Secure authentication with password hashing and session hardening
- ✅ Role-based dashboards (teacher, student, parent, admin, staff)
- ✅ Permission guards (read-only for students/parents, edit for teachers)
- ✅ Sidebar role-gating (hides teacher workspace from non-teachers)
- ✅ Real data integration across all dashboards
- ✅ Empty state handling with user guidance
- ✅ Backup system with encrypted export/import
- ✅ Privacy policy and terms consent flow

**What's Next (Phase 3 Required)**:
To become a reliable, scalable, multi-device production platform, GradeFlow must:

1. Migrate core data to Supabase (cloud canonical storage)
2. Implement offline-first sync with conflict resolution
3. Add payment infrastructure (Paystack/Flutterwave)
4. Build school admin workspace with team collaboration
5. Establish monitoring, audit logs, and support tools

This document covers:

1. Current implementation status (Phase 1 & 2 complete)
2. Architecture and design decisions
3. Phase 3 implementation roadmap
4. Final production readiness criteria
5. Next 12 weeks technical plan

## 1.1 Production Hardening & Phase 2 Features (April 2026)

### Security and Authentication Foundation

1. **Password security upgrade with migration support**
   - Existing local accounts migrated to stronger password hash format on next login
   - New passwords validated with secure hash flow (no plain text comparison)
2. **Login abuse protection (attempt throttling)**
   - Failed login attempts tracked per account
   - Temporary lockout after repeated failures to prevent brute force

3. **Session hardening (idle timeout + max session age)**
   - Sessions validated for inactivity and total age before restoration
   - Expired sessions cleared instead of trusted indefinitely
   - Prevents account hijacking from abandoned devices

4. **Encrypted backups with user passphrase (AES-GCM + PBKDF2)**
   - Exported backups encrypted with teacher-chosen passphrase
   - Import requires matching passphrase for restoration
   - Protects sensitive school data if backups are shared/lost

5. **Backup safety reminders**
   - In-app nudge when recent backup is missing or stale
   - Critical for offline-first product data durability

6. **Account email-change data migration**
   - Teacher email change automatically migrates: classes, students, materials, history, settings
   - Prevents accidental data loss during account updates

7. **Privacy Policy and Terms consent gate**
   - Standalone legal pages (privacy, terms, data handling)
   - First-time users must actively consent before accessing app
   - Supports institutional adoption and regulatory compliance

8. **Backend-ready API client layer**
   - Provider abstraction supports: local storage, Supabase, Next.js APIs
   - Can switch providers without frontend disruption
   - Supabase currently used for lightweight user record sync

### Phase 2 Features: Role-Based Dashboards & Permission Guards (NEW)

1. **Role-based dashboard routing**
   - Teachers/staff/admin → Full teacher workspace (grades, analytics, students, materials, attendance, CBT, history, settings)
   - Students → Student dashboard (personal grades, attendance, assignments, ranking)
   - Parents → Parent dashboard (child progress, subjects, communications)
   - Ensures users only see appropriate content

2. **Permission guard functions**
   - `canEditGrades()` → true only for teacher/staff/admin (shows editable score inputs)
   - `canViewGrades()` → true only for teacher/staff/admin (view access control)
   - `canDeleteStudent()` → true only for teacher/admin (deletion rights)
   - Non-teachers see read-only grade displays instead of editable fields

3. **Sidebar role-gating (navigation visibility)**
   - Teachers see full sidebar: Grades, Analytics, Students, Materials, Attendance, CBT, History, Settings + Your Classes section
   - Students/parents see empty sidebar (all teacher workspace items hidden)
   - Prevents unauthorized navigation to restricted vies

4. **Real data integration across dashboards**
   - **Student Dashboard**: Real grades from allStudentGrades, actual attendance from allAttendance, real assignments from allMaterials, computed overall average
   - **Parent Dashboard**: First-student-in-first-class enrolled as "child" (placeholder for Supabase enrollment v3), real grades, ranking, subject performance
   - **Admin Dashboard**: Real class count, real student count, attendance percentage, class averages, completion metrics

5. **Empty state handling with user guidance**
   - Student: "No grades recorded yet", "No assignments yet"
   - Admin: "No classes yet", "No pending approvals"
   - Parent: "No child records found. Contact school to set up enrollment."
   - Consistent messaging pattern across all dashboards

These Phase 2 features enable multi-role usage while maintaining teacher workspace integrity and ensuring proper access control.

---

## 2. Current Product Scope (Fully Implemented - Phase 1 & 2 Complete)

### 2.1 Platform and Architecture

GradeFlow is a single-page Progressive Web App built with:

- **HTML** (`index.html`) - Semantic structure with modal workflows
- **CSS** (`style.css`) - Design token system with light/dark mode support
- **Vanilla JavaScript** (`script.js`) - ~6,300 lines, all core features
- **Service Worker** (`sw.js`) - Cache-first strategy for PWA behavior
- **PWA Manifest** (`manifest.json`) - Installable app metadata

**Key Architectural Characteristics:**

- Offline-first: Service worker caches all assets; app works without internet
- No backend required for core usage (local-first)
- Data namespaced by account email in browser localStorage
- Role-based routing with permission guards
- Provider abstraction ready for Supabase/Next.js backend integration
- Multi-user support through email-scoped storage keys
- Graceful degradation for offline scenarios

**Current Deployment:** Single HTML file + PWA manifest. Can run completely offline or with optional Supabase user-record sync.

### 2.2 Core Academic Features (Complete)

**Grading System:**

- Class and subject management with unlimited classes
- Student records per class (manual entry + CSV import)
- Score capture: test (0-20), practical/CA (0-20), exam (0-60) = 100-point scale
- Automatic total calculation with real-time updates
- Overall student average across all subjects
- Position/ranking with tie-break handling
- WAEC-aligned default grading scale (A=90-100, B=80-89, etc.)
- Custom grading scales: adjust ranges and letters per school
- Grade remarks (Excellent, Pass, Fail, etc.) with customizable mapping
- Batch grade entry and bulk updates

**Dashboard and Analytics:**

- Teacher workspace: Grade sheet, analytics, students, materials, attendance, CBT, history, settings
- Student dashboard: Personal grades, attendance, assignments, class ranking
- Parent dashboard: Child's grades, subjects, performance, communications
- Admin dashboard: School overview, class health, attendance metrics
- Subject-level charts via Chart.js with summary metrics
- Ranking visualization with filtering and sorting
- Statistical analysis (average, highest, lowest, pass rate)

**Reporting and Export:**

- Individual student report-card PDF (jsPDF + html2canvas)
- Class broadsheet Excel export (SheetJS)
- Spreadsheet import for students and scores
- WhatsApp share flow for result communication
- Term snapshots for historical comparison
- Export templates with school branding

**Teaching Workflow:**

- Attendance tracking (Present/Absent/Late per date)
- Class material uploads with metadata
- Basic CBT/quiz builder and scoring
- Term history snapshots for previous term retrieval
- Settings for grading scale, term labels, school branding
- AI-assisted comment generation (via Google Gemini API)

**Role-Based Access (Phase 2):**

- **Teacher/Staff/Admin**: Full workspace access, grade editing, all exports, team collaboration view
- **Student**: Personal grades (read-only), attendance, assignments, ranking
- **Parent**: Child's grades, subjects, ranking, communications (first-child enrollment model)
- **Super Admin**: School-level analytics, team management (planned Phase 3)

### 2.3 Security and Safety (Phase 1 & 2)

**Implemented:**

- HTML escaping to prevent script injection
- Per-user storage namespacing by email
- Local quota management with cleanup fallback
- Password hashing with upgrade migration (old → new hash on login)
- Login attempt throttling to prevent brute force
- Session idle timeout (15 min) and max age (12 hours)
- Encrypted backup export/import (AES-GCM + PBKDF2)
- Privacy policy and terms consent gate
- Role-based permission checks before rendering sensitive UI

### 2.4 PWA and Offline Behavior

**Implemented:**

- Installable PWA manifest
- Service worker registration on first visit
- Cache-first strategy for app shell and libraries
- Offline status banner
- Automatic sync fallback when connectivity returns
- App works fully offline and transitions gracefully to online
- Installable on iOS, Android, and desktop

### 2.5 UX/Design System

**Implemented:**

- Design tokens: colors, spacing, typography, shadows
- Light and dark mode with system preference detection
- Responsive mobile, tablet, desktop layouts
- Sidebar navigation with role-based visibility
- Modal-based workflows for major actions
- Premium visual polish: elevated cards, glass-style topbar
- Empty state messaging with guidance
- Toast notifications for feedback
- Landing page with marketing and pricing sections

---

## 3. What Remains: Phase 3 Foundation & Production Requirements

These are the critical gaps to unlock multi-device reliability, institutional trust, and sustainable revenue.

### 3.1 Data Durability and Cloud Sync (Critical)

**Current State**: All data lives in browser localStorage only  
**Problem**:

- Browser storage is device-specific and can be lost when browser is cleared/device resets
- File uploads (base64) consume storage quickly
- No cross-device access to grades/records
- Single point of failure for school data

**Phase 3 Solution**:

1. Cloud database schema for: classes, students, scores, attendance, materials, CBT, history
2. Offline-first sync: Local cache + server reconciliation with conflict resolution
3. Real-time sync status indicator (local/syncing/synced)
4. Encrypted backup with restore history
5. Migration path for existing local users to cloud-backed accounts

**Expected KPI**:

- Sync success rate > 99%
- Data recovery time < 5 minutes
- Cross-device access within 30 seconds

### 3.2 Secure Cloud Identity (Critical)

**Current State**: Account system is browser-local only  
**Problem**:

- No secure password hashing tied to server
- No cross-device sign-in guarantee
- No real account recovery path
- Teachers risk total data loss if device is lost/reset

**Phase 3 Solution**:

1. Supabase authentication (email + secure password hashing)
2. Session tokens with rotation and secure expiry
3. Email-based account recovery (recovery link workflow)
4. Multi-device session management (sign out from all devices)
5. Account linking (merge duplicate accounts)

**Expected KPI**:

- Successful password reset completion > 95%
- Cross-device re-login time < 2 minutes
- Account recovery rate > 90%

### 3.3 Payment and Subscription Infrastructure (Critical)

**Current State**: Pro plan UX exists but no automated payment flow  
**Problem**:

- No integrated payment gateway
- Manual activation flow doesn't scale
- No automated renewal or expiry checks
- No server-side entitlements (can't enforce premium features)
- No receipts or audit trail for schools

**Phase 3 Solution**:

1. Payment gateway integration (Paystack or Flutterwave)
2. Webhook verification and transaction reconciliation
3. Subscription state model: active/grace/expired/canceled
4. Server-side entitlement checks (feature gating truth on server)
5. Automated renewal and grace-period workflows
6. Receipts and invoice generation

**Expected KPI**:

- Payment success rate > 96%
- Subscription churn rate < 5% monthly
- Revenue per teacher > ₦2,500/month

### 3.4 School Admin Workspace (High Priority)

**Current State**: Single-teacher workflows only  
**Problem**:

- No multi-teacher coordination
- No approval workflows for final results
- No cross-class analytics for school leadership
- No audit trail for accountability

**Phase 3 Solution**:

1. School admin role with oversight dashboard
2. Role-based permissions: teacher/reviewer/admin/super-admin
3. Result approval workflow (draft → submitted → approved → locked)
4. Cross-class analytics (subject trends, teacher performance, intervention lists)
5. Activity audit log (who changed what, when)
6. Team management (add teachers, remove users, reset passwords)

**Expected KPI**:

- Admin setup completion > 85%
- Approval workflow usage > 70% of schools
- Support ticket reduction > 30%

### 3.5 Observability and Reliability (High Priority)

**Current State**: No backend monitoring or error reporting  
**Problem**:

- Can't see when users have sync failures or data loss
- Support team has no way to diagnose issues
- No performance metrics or health monitoring
- Hard to troubleshoot production incidents

**Phase 3 Solution**:

1. Frontend error tracking (Sentry or similar)
2. Structured server logs for all operations
3. Sync status and retry metrics
4. Support diagnostics bundle (user can export for support)
5. Dashboard health checks and uptime monitoring
6. Admin console for support-team incident triage

**Expected KPI**:

- First-response time < 2 hours
- Error resolution rate > 80% same day
- Uptime SLA > 99.5%

### 3.6 What's Ready for Phase 3 (Already Implemented)

- ✅ Frontend provider abstraction (local/Supabase switching)
- ✅ Role-based permission functions
- ✅ Sidebar gating and navigation filtering
- ✅ Encryption/decryption utilities
- ✅ Offline-first architecture and service worker
- ✅ Modal-based workflows for complex actions
- ✅ Real data integration across dashboards
- ✅ Empty state handling patterns

---

## 4. Phase 3 Implementation Roadmap (Weeks 1-12)

### 4.1 Week 1-2: Cloud Foundation & Data Migration

**Deliverables:**

- Supabase project setup with RLS policies
- Database schema for: users, classes, students, scores, attendance, materials, CBT, history
- Data migration tool (export local → import to cloud)
- Offline-first IndexedDB layer for local caching
- Basic auth integration (email/password login)

**Success Criteria:**

- User can successfully login via Supabase
- Local data can be exported and imported cleanly
- No data loss during migration

### 4.2 Week 3-4: Cloud Sync Engine

**Deliverables:**

- Offline-first sync client (PouchDB or custom sync layer)
- Conflict resolution policy for concurrent edits
- Sync status indicator (local/syncing/synced/error)
- Retry logic with exponential backoff
- Sync history for debugging

**Success Criteria:**

- Grades synced to cloud within 10 seconds
- Cross-device access within 30 seconds
- Sync continues during offline periods
- Conflicts resolved without data loss

### 4.3 Week 5-6: Account Recovery & Multi-Device

**Deliverables:**

- Password reset flow (email link)
- Session token rotation and expiry
- Multi-device session management
- "Sign out everywhere" option
- Account security audit log

**Success Criteria:**

- Password reset works end-to-end
- User can access from 2+ devices simultaneously
- Session timeout works correctly

### 4.4 Week 7-8: Payment Integration

**Deliverables:**

- Paystack/Flutterwave integration
- Webhook receiver for transaction verification
- Subscription state management
- Server-side entitlement checks
- Invoice/receipt generation

**Success Criteria:**

- Test payment completes successfully
- Subscription status updates correctly
- Premium features gate properly

### 4.5 Week 9-10: School Admin Workspace

**Deliverables:**

- Admin dashboard (school overview, teacher management)
- Role-based access controls
- Result approval workflow
- Cross-class analytics
- Activity audit log

**Success Criteria:**

- Admin can create school and add teachers
- Approval workflow gates final results
- Analytics show meaningful metrics

### 4.6 Week 11-12: Observability, QA & Launch Prep

**Deliverables:**

- Error tracking (Sentry)
- Structured logging (backend + frontend)
- Support diagnostics bundle
- Admin console for triage
- Comprehensive test coverage
- Performance optimization

**Success Criteria:**

- All critical paths have logging
- Support team can triage issues quickly
- Uptime monitoring shows > 99% availability
- Ready for production launch

### 4.7 Branch & Release Strategy

**Phase 3 Branch**: `phase-3-cloud-sync`

- Main → Phase 3 branch
- Feature branches off Phase 3 (auth, payments, admin, etc.)
- Staging environment mirrors production
- Staged rollout: 10% → 50% → 100% of users
- Rollback plan for critical issues

---

## 5. Premium Value Features (Phases 3+)

### 5.1 School-Grade Reliability

- Multi-device sync with offline continuation
- Automatic cloud backup with restore history
- Term lock/finalization workflow
- Export consistency guarantees
- Sync health dashboard

### 5.2 Administrative Intelligence

- Class and subject trend analysis (across terms)
- Risk alerts (declining learners, absentee patterns)
- Teacher workload dashboards
- Cross-class comparative analytics
- Term-over-term summaries and intervention lists

### 5.3 Collaboration and Control

- School admin workspace
- Role permissions (teacher/reviewer/admin/super-admin)
- Approval workflows
- Activity logs and accountability
- Read-only reviewer roles

### 5.4 Parent Communication

- Structured parent report summaries
- Multilingual messaging templates
- Scheduled communication windows
- Communication history per student
- Standardized remark templates

### 5.5 Advanced Assessment

- Rich CBT engine (question bank, randomization)
- Rubric support for practical/skills assessment
- Exam moderation and outlier checks
- Question bank management
- Paper reuse controls

---

## 6. Monetization Strategy (Practical & Defensible)

### 6.1 Pricing Plan Structure

**Free Plan (Teacher Starter)**

- 1 class, 50 students
- Basic grading and exports
- Local-only storage (no cloud sync)
- Community support
- Perfect for: Evaluating the product

**Pro Teacher Plan (₦)5,000/month)**

- Unlimited classes and students
- Cloud sync + multi-device access
- Advanced analytics and reporting
- AI-assisted comments
- Encrypted backup + recovery
- Email support
- Perfect for: Individual teachers who want reliability and features

**School Plan (₦15,000/month per teacher)**

- Everything in Pro
- Multi-teacher admin workspace
- Result approval workflow
- Cross-class analytics
- Audit logs and accountability
- School-level customization
- Priority support (< 2h response)
- Perfect for: Schools wanting coordination and compliance

### 6.2 Value-to-Price Logic

Users will pay when GradeFlow saves time and prevents mistakes.

**Cost savings per teacher per term**:

- Grade entry: -2 hours (automated calculations)
- Report generation: -3 hours (automated PDF/Excel)
- Error recovery: -1 incident avoided (cloud backup)
- **Total**: ~5-6 hours saved per term
- **Value**: ₦5,000 plan pays for itself in reduced admin time

**For schools**:

- Standardized reporting: -20 hours (admin coordination)
- Compliance audit trail: 1 incident prevented
- Teacher coordination: -10 hours (result approval)
- **Total**: ~30 hours saved per term
- **Value**: ₦15,000 plan saves 30+ hours of admin time

### 6.3 Revenue Protection Essentials

- Server-side entitlement checks (can't fake Pro)
- Grace period workflow (7 days before losing access)
- Dunning workflow (renewal reminders 7, 3, 1 days before)
- Anti-abuse: detect account sharing, enforce per-school licensing
- Churn reduction: feedback survey at cancel, recovery offer

---

## 7. Technical Stack & Architecture Evolution

### 7.1 Current Stack (Phase 1-2)

- Frontend: Vanilla JS (~6,300 lines), HTML5, CSS3, Bootstrap Icons
- Data: localStorage (browser-local)
- Storage: IndexedDB (future, prepared)
- UI: Modal-based workflows, responsive design
- Auth: Browser-local (Phase 2)
- Export: jsPDF, SheetJS, html2canvas
- Analytics: Chart.js, tinycolor
- Optional: Google Gemini API (AI comments)

### 7.2 Phase 3 Stack Additions

- Backend: Supabase (PostgreSQL + auth)
- Sync Engine: Offline-first sync (PouchDB or custom)
- Payment: Paystack/Flutterwave
- Monitoring: Sentry (errors), LogRocket (replays)
- API: RESTful endpoints (auth, sync, subscriptions)
- Database: PostgreSQL with RLS policies

### 7.3 Data Model Hardening (Phase 3)

```
Tables:
- users (id, email, password_hash, role, school_id, created_at, updated_at)
- schools (id, name, code, plan, subscription_status, created_at)
- classes (id, school_id, name, emoji, subject_ids, created_at)
- students (id, class_id, name, email, created_at)
- scores (id, student_id, subject_id, test, prac, exam, created_at, updated_at)
- attendance (id, student_id, class_id, date, status, created_at)
- materials (id, class_id, title, desc, type, date, created_at)
- quizzes (id, class_id, title, questions[], created_at)
- subscriptions (id, school_id, plan, status, payment_id, expires_at)
- audit_logs (id, school_id, user_id, action, resource, old_value, new_value, created_at)

Indexes: (school_id, class_id), (school_id, user_id), (student_id, class_id)
RLS: Users only see data from their school
```

### 7.4 Sync Architecture (Phase 3)

```
Local: IndexedDB (offline cache)
Server: PostgreSQL (canonical source)

Sync Flow:
1. User makes change locally → written to IndexedDB
2. Mark record as "pending_sync"
3. When online: POST /sync with pending records
4. Server validates, applies, returns resolved state
5. Client marks as "synced"
6. Conflict: Server wins (deterministic)
7. Sync status indicator shows: local/syncing/synced/error
```

### 7.5 Performance Targets (Phase 3)

- Login: < 3 seconds
- Sync: < 10 seconds for grade entry
- Cross-device access: < 30 seconds
- Search: < 1 second on 1000 students
- PDF export: < 5 seconds
- Excel export: < 3 seconds
- Page load (offline): < 2 seconds
- API latency: < 500ms p95

---

## 8. Final Production Readiness Checklist

GradeFlow is ready for production-scale deployment when:

### Security & Trust

- [ ] Email-based authentication with secure password hashing
- [ ] Session tokens with rotation and expiry
- [ ] Multi-device session management
- [ ] Account recovery workflow (email link)
- [ ] Privacy policy and terms legally reviewed
- [ ] Child data handling policy compliant with GDPR/local law
- [ ] Password reset tested end-to-end
- [ ] No secrets in code or documentation
- [ ] SSL/TLS for all cloud communication

### Data Durability & Sync

- [ ] Cloud database schema deployed and tested
- [ ] Offline-first sync engine working
- [ ] Conflict resolution tested and documented
- [ ] Data migration tool tested on 100+ local accounts
- [ ] Cross-device sync verified
- [ ] Backup/restore workflow tested
- [ ] Data recovery time < 5 minutes
- [ ] Sync success rate > 99%

### Payment & Revenue

- [ ] Payment gateway integrated and tested
- [ ] Webhook verification working
- [ ] Subscription state model enforced
- [ ] Entitlement checks on server
- [ ] Invoice/receipt generation working
- [ ] Grace period and renewal workflow tested
- [ ] Churn tracking and reporting working
- [ ] Payment success rate > 96%

### School Admin Features

- [ ] Admin dashboard showing school overview
- [ ] Teacher management (add/remove/permissions)
- [ ] Result approval workflow working
- [ ] Cross-class analytics dashboard
- [ ] Audit log capturing all account changes
- [ ] Admin testing with multi-teacher school

### Reliability & Observability

- [ ] Error tracking (Sentry) deployed
- [ ] Structured logging on all API endpoints
- [ ] Frontend error tracking live
- [ ] Uptime monitoring (> 99.5%)
- [ ] Health check dashboard
- [ ] Support diagnostic export working
- [ ] Admin console for incident review
- [ ] Runbook for common failures documented

### Testing & Quality Assurance

- [ ] Unit tests for core algorithms (grading, ranking)
- [ ] Integration tests for sync and auth
- [ ] End-to-end tests for critical user paths
- [ ] Load testing (1000+ concurrent users)
- [ ] Data migration testing (large datasets)
- [ ] Offline-to-online transition tested
- [ ] Mobile and desktop UX verified
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Browser compatibility tested (Chrome, Safari, Firefox, Edge)

### Operations & Support

- [ ] Deployment automation (CI/CD)
- [ ] Staged rollout process (10% → 50% → 100%)
- [ ] Rollback procedure documented and tested
- [ ] Backup strategy documented (daily snapshots)
- [ ] Disaster recovery tested (restore from backup)
- [ ] Support team trained on product
- [ ] Documentation complete (API, admin, teacher, parent)
- [ ] FAQ and common issues documented

### Launch Readiness

- [ ] User testimonials or beta feedback documented
- [ ] Marketing materials prepared
- [ ] School onboarding package ready
- [ ] Payment page live and tested
- [ ] Pricing page updated with clear terms
- [ ] Privacy policy accepted by users
- [ ] Terms of service accepted by users
- [ ] Support channel ready (email/chat)
- [ ] Go/no-go decision documented

---

## 9. Success Metrics & KPIs (Phase 3+)

### User Adoption

- Active teachers per week (target: 500+ by month 3)
- Student daily active engagement (target: 60%+ of enrolled)
- Parent adoption rate (target: 40%+ of classes)
- School signup rate (target: 50+ schools by month 6)

### Data Health

- Sync success rate (target: > 99%)
- Data loss incidents (target: 0)
- Account recovery success (target: > 95%)
- Backup completion rate (target: > 80%)

### Business Metrics

- Conversion rate (free to Pro) (target: > 10%)
- School plan adoption (target: > 30% of active schools)
- Monthly recurring revenue (target: ₦500k+ by month 6)
- Churn rate (target: < 5% monthly)
- Customer acquisition cost (target: break-even by month 4)

### Quality Metrics

- Support response time (target: < 2 hours)
- Support resolution rate (target: > 80% first contact)
- Uptime (target: > 99.5%)
- Error rate (target: < 0.1% of requests)
- Page load time (target: < 2s p95)

---

## 10. Timeline Summary

| Phase   | Duration    | Focus                                          | Status                  |
| ------- | ----------- | ---------------------------------------------- | ----------------------- |
| Phase 1 | Weeks 1-8   | Auth, Role-Based Dashboards, Permission Guards | ✅ Complete             |
| Phase 2 | Weeks 9-16  | UI Polish, Admin Features                      | ⏳ Next (UI/UX Refresh) |
| Phase 3 | Weeks 17-28 | Cloud Sync, Payments, School Workspace         | → Active (12 weeks)     |
| Phase 4 | Weeks 29+   | Advanced Features, Scaling                     | Future                  |

---

## 11. Final Positioning

**Today (Phase 2 Complete)**:
GradeFlow is a powerful, fast, offline-first grading platform that teachers love. It works locally with zero setup and exports results professionally.

**After Phase 3 (Production Ready)**:
GradeFlow becomes the trusted school operations platform: multi-device, cloud-backed, payment-enabled, and accountable. Schools can confidently adopt it knowing data is safe, synced, and compliant.

**Growth Path (Phase 4+)**:
GradeFlow expands into holistic school management: advanced analytics, parent communication, team collaboration, and institutional integrations. Teachers focus on teaching; admins focus on decisions, not data entry.

**The Core Promise**:

> "Grade faster, manage better, teach with confidence."

---

## 12. Next Steps (Immediate)

1. **Branch UI/UX Refresh** (`ui-polish-v2`)
   - Visual refresh while keeping all academic features stable
   - Target: 2 weeks of focused design work

2. **Prepare Phase 3 Groundwork**
   - Supabase project setup
   - Database schema review
   - Migration script design
   - Team onboarding

3. **Stakeholder Communication**
   - Update teachers on cloud sync roadmap
   - Gather feedback on proposed admin features
   - Confirm payment gateway preference

4. **Risk Mitigation**
   - Document rollback procedures
   - Create staging environment
   - Plan data migration strategy
   - Build comprehensive test suite
