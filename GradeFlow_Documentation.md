# GradeFlow Product and Engineering Documentation

Version: April 2026
Product Stage: Advanced MVP (offline-first PWA)
Primary Audience: Nigerian primary and secondary school teachers

## 1. Executive Summary

GradeFlow is already a strong offline-first grading platform with real classroom utility: class management, score entry, automatic grading, analytics, attendance, report export, and optional AI-assisted comments. It is fast, practical, and tailored to local school workflows.

The current architecture is intentionally simple (single-page app, browser storage, no backend). That makes onboarding and iteration easy, but it also creates hard limits for reliability, security, scalability, and payment enforcement.

To become production-ready and genuinely worth paying for at scale, GradeFlow needs to evolve from a powerful single-device tool into a dependable multi-device education product with:

1. secure accounts and identity
2. cloud sync and backup
3. robust subscription/payment infrastructure
4. auditability and support operations
5. measurable reliability and trust

This document covers:

1. what GradeFlow currently has (implemented behavior)
2. what is partially implemented or constrained
3. what must be added for production readiness
4. what should be added to support premium value
5. a phased roadmap with practical priorities

## 1.1 Production Hardening Implemented Now (April 2026)

The following important production upgrades are now implemented in the current codebase:

1. Password security upgrade with migration support.
   - Existing local accounts are migrated to a stronger password record format when users sign in.
   - New passwords are validated with a stronger hash flow instead of plain text comparison.
2. Login abuse protection (attempt throttling and temporary lockout).
   - Repeated failed logins are tracked per account.
   - The app temporarily blocks repeated attempts after too many failures.
3. Session hardening (idle timeout + max session age).
   - The session is checked against inactivity and total age before restoring the dashboard.
   - Expired sessions are cleared instead of being trusted indefinitely.
4. Encrypted backups with user passphrase (AES-GCM + PBKDF2).
   - Exported backups are encrypted with a user-chosen passphrase.
   - Import requires the same passphrase before restoration can happen.
   - This protects backup files if they are shared or lost.
5. Backup safety reminders (in-app reminder when recent backup is missing).
   - The app nudges users to export a backup when one is missing or stale.
   - This is especially important because the product is still local-first.
6. Account email-change data migration (moves user-scoped data safely).
   - When a teacher changes email, the app migrates their stored classes, students, materials, history, and settings.
   - This reduces accidental data loss during account edits.
7. Privacy Policy and Terms pages with in-app consent gate.
   - There are standalone legal pages for privacy and terms.
   - First-time users must actively consent before continuing.
8. Backend-ready API client layer (local/supabase/nextjs provider switching).
   - The app now has a provider abstraction for local storage, Supabase, and Next.js-style APIs.
   - Supabase is currently used as a lightweight cloud sync path for user records and can be expanded later.

These changes improve security and reliability immediately while preserving your existing app architecture.

---

## 2. Current Product Scope (What Exists Today)

### 2.1 Platform and Architecture

GradeFlow is a single-page Progressive Web App built with:

- HTML (`index.html`)
- CSS (`style.css`)
- Vanilla JavaScript (`script.js`)
- Service Worker caching (`sw.js`)
- PWA metadata (`manifest.json`)

Key architectural characteristics:

- Offline-first behavior via service worker and static asset caching
- No backend server required for core usage
- Data stored in browser `localStorage`
- Multi-user data namespacing by account email in storage keys
- Frontend-only account model
- Progressive enhancement path for backend sync without breaking the offline app
- Cloud provider abstraction already wired into the frontend

Current deployment shape:

- The app can run completely offline as a local PWA.
- The app can also be pointed at a backend provider for future sync.
- The present cloud path is intentionally partial and should not yet be treated as full multi-device storage.

### 2.2 Core User Flows Implemented

1. Teacher creates account and logs in locally.
2. Teacher creates classes and subjects.
3. Teacher adds students manually or imports from spreadsheet.
4. Teacher enters test/practical/exam scores.
5. GradeFlow computes totals, grades, rankings, and insights.
6. Teacher exports outputs (PDF / Excel / WhatsApp text).
7. Teacher can track attendance and basic CBT quizzes.
8. Teacher can save term snapshots as history.

Current strength of these flows:

- The teacher workflow is already usable without a backend.
- The app favors fast classroom operations over heavy setup.
- Most primary classroom actions are fully available inside the browser.

### 2.3 Academic and Grading Features

Implemented and functioning:

- Class and subject management
- Student records per class
- Score capture model: test (0-20), practical/CA (0-20), exam (0-60)
- Total score calculation on 100-point scale
- Overall student average across subjects
- Position/ranking with tie handling
- WAEC-aligned default grading scale
- Custom grading scale in settings
- Grade remark mapping (e.g., Excellent, Pass, Fail)

### 2.4 Analytics and Visibility

Implemented and functioning:

- Subject-level performance visualization via Chart.js
- Summary metrics (average/highest/lowest/pass context)
- Student card views for quick per-learner inspection
- Dashboard stat cards for at-a-glance class health
- Dedicated analytics view for grouped charting and ranking visibility

### 2.5 Reporting and Export Features

Implemented and functioning:

- Individual report-card style PDF export (jsPDF + html2canvas)
- Class broadsheet Excel export (SheetJS)
- Spreadsheet import flow for learners/scores
- WhatsApp share flow for result communication
- Export-oriented workflows designed for school staff who need printable or shareable outputs quickly

### 2.6 Teaching Workflow Extensions

Implemented and functioning:

- Attendance tracking per date (Present/Absent/Late)
- Class material uploads and metadata storage
- Basic CBT/quiz builder and result handling
- Term history snapshots for previous term retrieval
- Settings controls for branding, grading scale, term/session labels, and app preferences
- Account consent management for privacy/terms acceptance

### 2.7 PWA and Offline Behavior

Implemented and functioning:

- Installable PWA manifest
- Service worker registration on first visit
- Cache-first strategy for local app shell
- CDN asset caching for key libraries
- Offline status banner and messaging UX
- Works as a browser app and as an installable app on supported devices
- Continues basic use even when connectivity is limited

### 2.8 Security and Safety Measures Already Present

Implemented:

- HTML escaping utility before injecting user-supplied text into `innerHTML`
- Namespaced per-user storage keys
- Local quota management attempt (`safeSave` + cleanup fallback)
- Protection against accidental script injection through escaped text fields
- Encrypted backup export/import for sensitive school data
- Password migration and login throttling for account safety
- Consent flow for legal acknowledgement

### 2.9 UX and Design System

Implemented:

- Structured design tokens (colors, spacing, typography)
- Light and dark mode support
- Responsive behavior for mobile and desktop
- Sidebar/dashboard navigation model
- Modal-based workflows for major actions
- Premium visual polish layer with elevated cards, glass-style topbar, and more professional dashboard contrast
- Landing page with marketing and pricing sections for product positioning

---

## 3. Current Constraints and Partial Areas

These are important because they directly affect trust, scalability, and paid conversion.

The most important thing to understand is that GradeFlow is currently in a mixed state:

- The frontend product is mature enough for real classroom use.
- The backend story is only partially implemented.
- Cloud syncing exists in a limited form, but not yet as full canonical storage for all academic records.

### 3.1 Identity and Authentication Constraints

- Account system is browser-local.
- No secure password hashing workflow tied to a server.
- No cross-device sign-in guarantee.
- No real account recovery path.
- No hosted identity provider is yet enforcing login, password reset, or email verification.

Impact: teachers risk account/data loss when device is reset, broken, or replaced.

### 3.2 Data Durability Constraints

- Core data lives in `localStorage` only.
- Browser storage limits are small and inconsistent by device/browser.
- File uploads (base64) can push storage usage quickly.
- Cloud sync currently exists only as a provider abstraction and a limited user-record sync path.
- Classes, students, scores, attendance, materials, CBT data, and history still need a real backend schema and sync pipeline.

Impact: data longevity is not guaranteed for professional usage.

### 3.3 Subscription and Revenue Constraints

- Pro plan UX exists, but activation flow is manual.
- No automated payment verification lifecycle.
- No entitlement service (feature gating by server truth).
- No webhook-driven subscription state sync.
- No invoices/receipts stored centrally.

Impact: recurring billing and reliable premium enforcement are not production-grade.

### 3.4 AI Feature Constraints

- AI comments depend on external API availability and user key handling.
- No server-side key protection model by default.
- No strict quality guardrails for multilingual output consistency.
- No usage limits, billing metering, or moderation layer for AI requests.

Impact: inconsistent output quality and potential key exposure risk.

### 3.5 Operations and Support Constraints

- No backend telemetry or error pipeline.
- No centralized event/audit trail.
- Limited observability into failures across user devices.
- No admin diagnostics console for support staff.

Impact: difficult to troubleshoot production incidents and support paying schools.

### 3.6 What is already partially cloud-ready

- The app can switch providers through the API connector.
- Supabase credentials can be saved in the UI.
- User records can be synchronized to Supabase through the current adapter.
- The architecture is ready for extending cloud sync entity by entity.

### 3.7 What is still local-only

- Actual gradebook data storage is still browser-local.
- Report history and attachments are still local-first.
- Permissions and collaboration are still single-user in practice.
- There is no true multi-device merge/conflict system yet.

### 3.8 Secret handling and exposed API keys

GradeFlow uses one user-supplied Google Gemini API key for AI-assisted comments. That key must not be treated as a permanent stored secret in the app.

Current safer handling rules:

1. the key should be entered only when needed
2. the key should live in memory or session scope, not persistent browser storage
3. the key should be cleared when the browser session ends or the modal closes
4. if a key has been published publicly, it must be revoked and replaced

If GitHub reports a public leak, the remediation steps are:

1. Open Google Cloud Console and go to APIs & Services > Credentials.
2. Find the leaked Gemini / Google API key.
3. Delete or restrict the leaked key immediately.
4. Create a replacement key with the minimum required API restrictions.
5. Update the app or local session with the new key only after rotation.
6. Re-check the GitHub secret scanning alert and close it only after confirming the old key is invalid.

Important:

- Do not keep the leaked key in code, documentation, commit messages, screenshots, or localStorage.
- If the repo history contains the leaked key, rewrite history only if the repository is public or otherwise shared and the leak is still exposed.
- The safest pattern for this app is session-only entry via a modal prompt.

---

## 4. Production Readiness Requirements (Must-Have)

This section defines what must exist before positioning GradeFlow as a dependable paid product at scale.

### 4.1 Security and Identity Baseline

Must add:

1. real authentication service (email/password + secure hash, or passwordless + verified identity)
2. secure session management (token rotation, expiration)
3. account recovery (email or admin-assisted)
4. role model readiness (teacher, school admin, super-admin)

Production outcome: users trust that their account and access are durable and secure.

### 4.2 Durable Storage and Sync

Must add:

1. cloud database for canonical records (classes, students, scores, attendance, history)
2. offline-first sync layer (local cache + server reconciliation)
3. conflict resolution policy for multi-device edits
4. encrypted backups and restore path
5. migration strategy for existing local users into cloud-backed accounts
6. sync status visibility so users know whether data is local, syncing, or saved remotely

Production outcome: no single-device data fragility.

### 4.3 Payment and Entitlement Infrastructure

Must add:

1. integrated payment gateway (Paystack or Flutterwave)
2. webhook verification and transaction reconciliation
3. subscription state model (active, grace, expired, canceled)
4. entitlement checks tied to server truth, not only local flags
5. receipts/invoices for school operations
6. renewal and grace-period workflow with notification history

Production outcome: predictable revenue and controlled premium access.

### 4.4 Reliability and Update Safety

Must add:

1. explicit versioning and migration scripts for stored data schemas
2. safe release strategy (staged rollout, rollback process)
3. health monitoring (frontend error tracking + API monitoring)
4. disaster recovery plan (backup cadence and restore tests)
5. environment separation for development, staging, and production

Production outcome: lower incident severity and faster recovery.

### 4.5 Compliance and Trust Foundation

Must add:

1. clear privacy policy and terms
2. child/student data handling policy aligned with applicable regional obligations
3. data retention controls and deletion workflows
4. consent and disclosure UX where required
5. audit trail for account access and record changes

Production outcome: stronger institutional adoption and lower legal risk.

### 4.6 Support and Operations Baseline

Must add:

1. structured logs for sync/auth/payment operations
2. support tooling to trace a school account end to end
3. a diagnostic export for bug reports
4. admin-only recovery tools for account and data issues

Production outcome: the product can be supported like a real business service.

---

## 5. Premium Value Roadmap (What Makes It Worth Paying For)

A paid product must deliver outcomes users cannot easily recreate manually.

### 5.1 School-Grade Reliability Features

High-value additions:

1. multi-device sync with offline continuation
2. automatic cloud backup with restore history
3. term close workflow with locked report snapshots
4. export consistency guarantees (branded templates)
5. sync health indicator and last-sync timestamp

Why people pay: reliability and administrative confidence.

### 5.2 Administrative Intelligence

High-value additions:

1. class and subject trend analysis across terms
2. risk alerts (declining learners, chronic absentee patterns)
3. teacher workload and grading completion dashboards
4. cross-class comparative analytics for heads of school
5. term-over-term summaries and intervention lists

Why people pay: decision support, not just data entry.

### 5.3 Collaboration and Role-Based Control

High-value additions:

1. school admin workspace
2. role permissions (who can edit, approve, export)
3. approval workflows for final result release
4. activity logs for accountability
5. read-only reviewer roles for school leadership

Why people pay: multi-staff coordination without chaos.

### 5.4 Parent/Guardian Communication Layer

High-value additions:

1. structured parent report summaries
2. multilingual messaging templates
3. scheduled communication windows
4. communication history per student
5. standardized remark and notification templates

Why people pay: improved parent engagement and reduced friction.

### 5.5 Assessment and Exam Expansion

High-value additions:

1. richer CBT engine (question bank, randomization, anti-cheat settings)
2. rubric support for practical/skills assessment
3. continuous assessment normalization tools
4. exam moderation and outlier checks
5. question bank management and paper reuse controls

Why people pay: deeper academic tooling and confidence in grading quality.

---

## 6. Monetization Strategy (Practical and Defensible)

### 6.1 Suggested Plan Structure

1. Free Plan (teacher starter)
   : basic classes, basic grading, limited exports, local-only mode

2. Pro Teacher Plan
   : unlimited exports, AI assistance, advanced analytics, cloud backup, priority support

3. School Plan
   : multi-teacher admin controls, approvals, consolidated analytics, audit logs, institutional support

### 6.2 Value-to-Price Logic

Users will pay when GradeFlow clearly saves time and reduces mistakes.

A simple value framing:

- If GradeFlow saves 2-4 hours per class cycle and prevents even one major reporting error, it delivers measurable operational value beyond subscription price.

### 6.3 Revenue Protection Essentials

1. server-side entitlements and expiry checks
2. grace periods for failed renewals
3. dunning workflow (renewal reminders)
4. anti-abuse checks for account sharing where needed

---

## 7. Recommended Technical Evolution

### 7.1 Near-Term Architecture Path

Maintain the current PWA experience but introduce a backend progressively.

Suggested direction:

1. keep current frontend UX and offline behavior
2. add API layer for identity, payment, and synced data
3. expand Supabase or a Next.js backend from user-only sync to full academic record sync
4. transition heavy storage to IndexedDB locally + cloud canonical store
5. enforce typed schemas for data integrity

Practical rollout order:

1. auth and profile sync
2. classes and students sync
3. scores and attendance sync
4. materials and term history sync
5. entitlement and subscription sync

### 7.2 Data Model Hardening Priorities

1. strict schema validation on write
2. migration version per stored entity set
3. immutable historical report records once finalized
4. consistent IDs with collision-safe generation
5. server-side unique constraints for email, class IDs, student IDs, and snapshot IDs

### 7.3 Observability and Quality

1. crash/error instrumentation
2. key user-flow analytics (import success rate, export success rate, sync latency)
3. synthetic checks for critical endpoints
4. support diagnostics bundle for incident triage
5. sync retry metrics and failed-write reporting

---

## 8. Implementation Roadmap (Phased)

### Phase 1: Trust and Durability (0-6 weeks)

1. secure auth and session foundation
2. cloud data model for core entities
3. backup/restore UX
4. robust payment verification backend
5. production logs and error reporting

Primary KPI targets:

- successful login recovery rate
- backup restore success rate
- payment activation success rate

### Phase 2: Premium Reliability and Admin Features (6-12 weeks)

1. school admin roles and permissions
2. result approval workflow
3. term lock/finalization
4. cross-class analytics dashboards
5. sync status and recovery tools

Primary KPI targets:

- reduction in grading completion time
- increase in premium retention
- decrease in support tickets tied to data loss

### Phase 3: Product Differentiation (12-20 weeks)

1. advanced CBT capabilities
2. intervention/risk analytics
3. parent communication suite
4. multilingual quality improvements
5. branded report themes and school-level customization

Primary KPI targets:

- weekly active usage depth
- parent communication engagement
- net revenue retention

---

## 9. Definition of Production-Ready for GradeFlow

GradeFlow should be called production-ready when all of the following are true:

1. user identity is secure, recoverable, and multi-device capable
2. core academic data is durably stored and recoverable after device loss
3. payment and subscription status are automated, auditable, and enforceable
4. release, monitoring, and rollback processes are reliable
5. support teams can diagnose and resolve real incidents quickly
6. legal/privacy documentation and user disclosures are complete
7. cloud sync covers all important school data, not just account records
8. users can clearly see whether data is local, synced, or in error
9. backup restore has been tested against real user scenarios

In other words, GradeFlow is not production-ready just because it works on one device. It becomes production-ready when the product is safe to trust across devices, schools, payments, and recoveries.

---

## 10. Final Product Positioning

Today, GradeFlow is a compelling advanced MVP with strong teacher-facing utility and a clear path to market fit.

With the roadmap above, it can become:

1. a trusted school operations platform (not only a grading tool)
2. a resilient subscription business with defensible value
3. a regional-first edtech product that institutions can confidently adopt

In short: the product already proves usefulness; the next step is to productize reliability, trust, and institutional controls so it is not only useful, but business-critical.

---

## 11. Next Branch: Premium UI/UX Refresh

Branch name: `ui-polish-v2`

This branch is focused on visual and interaction quality, not new academic features. The goal is to make GradeFlow feel like a polished product a school would actually pay for, while keeping the existing workflows fast and familiar.

### 11.1 Branch Goal

Build a cleaner, more professional, and more visible user experience with stronger hierarchy, better icon usage, more deliberate typography, and a more trustworthy color system.

The user should immediately feel that:

1. the product is stable
2. the interface is modern
3. the main actions are easy to find
4. the app is built for daily school use, not just a demo

### 11.2 What This Branch Should Improve

1. Typography
   - Use one expressive display font for headings and one highly readable body font.
   - Make numbers, stats, and table values easier to scan.
   - Improve spacing and line-height so dense areas do not feel cramped.

2. Colors
   - Use a calmer, more premium palette with one clear primary color.
   - Reserve bright accent colors for status, emphasis, and interactive feedback.
   - Improve contrast for important text, badges, buttons, and disabled states.

3. Icons
   - Keep one consistent icon family across sidebar, actions, cards, and settings.
   - Standardize icon size and alignment so controls look deliberate.
   - Use icons to support meaning, not decorate every line.

4. Visibility and hierarchy
   - Make the dashboard summary easier to read at a glance.
   - Improve active states, hover states, empty states, and selected states.
   - Make important actions visually stronger than secondary ones.

5. Layout and density
   - Reduce visual noise in cards and tables.
   - Improve whitespace around sections so the interface breathes.
   - Make mobile behavior feel intentional, not just compressed.

6. Professional feel
   - Add subtle motion where it helps understanding.
   - Use consistent elevation, border radius, and surface treatment.
   - Make the app feel closer to a finished SaaS product.

### 11.3 What This Branch Should Not Change

1. Core grading logic should remain stable.
2. Backup, consent, and auth behavior should remain intact.
3. Existing routes, modals, and workflows should not be broken.
4. Any redesign should preserve the speed of the current app.

### 11.4 UI Areas To Prioritize

1. Landing page hero and pricing section
2. Sidebar and topbar
3. Dashboard stat cards
4. Grade table readability
5. Students and analytics cards
6. Settings section layout
7. Auth and consent modals
8. Toasts, badges, and empty states

### 11.5 Design Principles For This Branch

1. Clarity first
   - Users should know where to click and what each section means within a second.

2. Consistency first
   - Reuse the same radius, spacing, icon style, and button treatment across the app.

3. Trust first
   - Use restrained color choices and strong contrast to make the product feel dependable.

4. Readability first
   - Tables, forms, and summaries should remain easy to scan under real classroom pressure.

5. Premium without clutter
   - The design should feel expensive and polished without becoming busy or decorative.

### 11.6 Success Criteria For This Branch

This branch is successful if:

1. the app looks noticeably more polished on first open
2. teachers can understand the dashboard faster
3. buttons, cards, and tables feel easier to read and use
4. mobile layout remains clear and usable
5. the product feels credible enough for a paid plan conversation

### 11.7 Recommended Build Order

1. Establish final color and typography tokens.
2. Refine the dashboard shell, sidebar, and topbar.
3. Improve card, table, and form readability.
4. Polish settings, modals, and feedback states.
5. Review mobile layouts and accessibility contrast.
6. Validate that nothing in core grading behavior regressed.

This branch should be treated as the visual foundation for later premium work, including multi-device sync, billing, and school admin features.
