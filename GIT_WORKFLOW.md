# GradeFlow Git Workflow & Branch Strategy

**Updated**: April 8, 2026  
**Git Policy**: Semantic Versioning + Git Flow with Phase-based Features

---

## 📊 Branch Structure

```
main (production)
  ├─ v2.0.0                    ← Current release (Phase 2 Complete)
  └─ [Phase 3 releases]

develop (integration)
  └─ Base for all Phase 3 + future work

phase3/cloud-sync            ← Feature: Supabase + offline-first sync
phase3/payments              ← Feature: Paystack/Flutterwave integration
phase3/school-admin          ← Feature: School admin workspace

ui-polish-v2                 ← Merged into main (Phase 2 completion)
```

---

## 🔄 Workflow Rules

### Main Branch Policy (`main`)

- **Purpose**: Production-ready, stable code only
- **Protection**:
  - Require PR reviews before merge
  - Require passing tests/checks
  - Dismiss stale reviews
  - Require branches up-to-date before merge
- **Commits**: Only from `develop` via PR (no direct commits)
- **Tags**: Semantic version tags (v2.0.0, v3.0.0, etc.)
- **Frequency**: Release every 4-6 weeks (Phase boundaries)

### Develop Branch (`develop`)

- **Purpose**: Integration branch for Phase 3+ work
- **Base for**: All feature/bugfix branches
- **Updates**: Daily from feature branches via PR
- **Merges to main**: When Phase complete (via release PR)
- **Protection**:
  - Require PR reviews (1+ approval)
  - Require tests passing
  - No force push

### Feature Branches (`phase3/*`)

- **Naming**: `phase3/{feature-name}` or `feature/{ticket-id}`
- **Base**: Created from `develop`
- **Updates**: Rebase on `develop` before PR
- **PR Target**: `develop`
- **Deletion**: Auto-delete after merge
- **Lifetime**: 2-4 weeks (one feature arc)

Current Phase 3 features:

- `phase3/cloud-sync` - Supabase + sync engine (Weeks 17-20)
- `phase3/payments` - Payment integration (Weeks 23-24)
- `phase3/school-admin` - Admin workspace (Weeks 25-26)

### Hotfix Branches (`hotfix/*`)

- **Base**: Created from `main` (if critical production bug)
- **Naming**: `hotfix/{bug-id}`
- **PR Target**: `main` AND `develop`
- **Merge**: ASAP after approval
- **Tag**: Patch version (v2.0.1)

---

## 📝 Commit Message Format

```
type(scope): subject (50 chars or less)

body (72 chars or less per line)

Closes #issue-id
```

### Types

- `feat`: New feature (Phase 3 work)
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (no behavior change)
- `refactor`: Code refactor
- `perf`: Performance improvement
- `test`: Test additions/changes
- `chore`: Build/dependency updates

### Examples

```
feat(cloud-sync): Add offline-first sync engine with conflict resolution

Implements PouchDB-based sync layer allowing grades to replicate from
local IndexedDB to Supabase. Includes automatic retry logic and conflict
resolution using server-wins strategy.

Closes #123
```

```
fix(auth): Prevent session bypass via URL manipulation

Added validation to session token format and expiry check on every
protected resource access.

Closes #456
```

---

## 🔀 Merging & PR Process

### Creating a Feature Branch

```bash
# Update local develop
git checkout develop
git pull origin develop

# Create feature branch
git checkout -b phase3/cloud-sync

# Make changes, commit frequently
git add .
git commit -m "type(scope): description"

# Push to remote
git push origin phase3/cloud-sync
```

### Opening a PR

1. **Title**: `[PHASE 3] Cloud Sync: Add offline-first sync engine`
2. **Description**: Use PR template (`.github/PULL_REQUEST_TEMPLATE.md`)
3. **Target**: `develop` branch
4. **Checklist**: Mark all items complete
5. **Reviewers**: Assign team members
6. **Labels**: Add `phase-3`, `cloud-sync`, etc.

### Code Review & Merge

```bash
# Reviewer checks:
- [ ] Code follows style guide (CONTRIBUTING.md)
- [ ] Tests included and passing
- [ ] Security reviewed (check SECURITY.md)
- [ ] Performance acceptable
- [ ] Documentation updated

# After approval (1+ review):
- Squash & merge (keep history clean)
- Or: Merge with merge commit (for major features)
- Delete branch after merge
```

### Releasing to Main

```bash
# When Phase complete:
git checkout main
git pull origin main
git merge develop --no-ff -m "Merge branch 'develop' into main

Phase 3 Complete: [summary of all features in phase]"

# Create release tag
git tag -a v3.0.0 -m "Phase 3: Cloud Sync & Commerce

Features:
- Supabase cloud database and RLS
- Offline-first sync engine
- Payment processing
- School admin workspace"

# Push
git push origin main --tags
```

---

## 📅 Phase Timeline & Branches

### Phase 2 ✅ (Complete - v2.0.0)

- **Main State**: Merged to main with v2.0.0 tag
- **Features**: Offline-first, role-based dashboards, exports
- **Branch**: `ui-polish-v2` (archived, keep for reference)

### Phase 3 🔄 (Active - Weeks 17-28)

- **Base Branch**: `develop`
- **Feature Branches**:
  - `phase3/cloud-sync` - Weeks 17-20 (Supabase + sync)
  - `phase3/payments` - Weeks 23-24 (Payment integration)
  - `phase3/school-admin` - Weeks 25-26 (Admin workspace)
  - `phase3/observability` - Weeks 27-28 (Monitoring + launch)
- **Target Release**: v3.0.0 (Mid-Q3 2026)

### Phase 4 📅 (Planned)

- **Target**: Q4 2026 onwards
- **Features**: Advanced CBT, parent portal, analytics, integrations
- **Branch Strategy**: Same as Phase 3 (develop + feature branches)

---

## 🛡️ Best Practices

### DO ✅

- [ ] Create feature branch from `develop`
- [ ] Write descriptive commit messages
- [ ] Keep PRs focused (1 feature per PR)
- [ ] Test locally before pushing
- [ ] Run linter/formatter before commit
- [ ] Rebase on `develop` before PR
- [ ] Request reviews from team
- [ ] Discuss in PR comments, not DMs
- [ ] Keep branches short-lived (< 2 weeks)
- [ ] Delete merged branches

### DON'T ❌

- [ ] Commit directly to `main` or `develop`
- [ ] Force push to shared branches
- [ ] Merge feature branches to `main` directly
- [ ] Ignore failed tests/checks
- [ ] Leave PRs unreviewed for > 24 hours
- [ ] Rewrite history on shared branches
- [ ] Create branches with personal prefixes
- [ ] Merge without title/description
- [ ] Include unrelated code in PR

---

## 🚨 Emergency Procedures

### Critical Production Bug (main)

```bash
# 1. Create hotfix from main
git checkout main
git pull origin main
git checkout -b hotfix/critical-bug

# 2. Fix the bug
git add .
git commit -m "fix: [critical issue description]"

# 3. Push and create PR to main
git push origin hotfix/critical-bug

# 4. Create PR to main (not develop!)
# Title: "[HOTFIX] [critical issue description]"

# 5. After approval, merge to main
git checkout main
git merge hotfix/critical-bug --no-ff
git tag -a v2.0.1 -m "Hotfix: [issue]"

# 6. Merge hotfix to develop too
git checkout develop
git merge hotfix/critical-bug

# 7. Clean up
git branch -d hotfix/critical-bug
```

### Accidental Commit to Wrong Branch

```bash
# If committed to main by mistake:
git reset --soft HEAD~1          # Undo commit, keep changes
git stash                        # Stash the changes
git checkout develop             # Go to correct branch
git stash pop                    # Apply changes
git commit -m "feat: ..."        # Commit properly
```

---

## 📊 Current Status (April 8, 2026)

```
Local Repository:
  main          ← You are here (Phase 2 merged, v2.0.0 tagged)
  develop       ← Ready for Phase 3 work
  phase3/*      ← Feature branches ready to start
```

**Next Steps**:

1. Push `main` to origin (once network is available)
2. Start Phase 3 work on `phase3/cloud-sync` first
3. Create PRs from feature branches → `develop`
4. When Phase 3 complete, merge `develop` → `main` with v3.0.0 tag

---

## 🔗 References

- Git Flow Model: https://nvie.com/posts/a-successful-git-branching-model/
- Semantic Versioning: https://semver.org/
- Conventional Commits: https://www.conventionalcommits.org/
- GradeFlow CONTRIBUTING: [CONTRIBUTING.md](./CONTRIBUTING.md)
- GradeFlow ROADMAP: [docs/ROADMAP.md](./docs/ROADMAP.md)

---

**Last Updated**: April 8, 2026  
**Maintainer**: GradeFlow Team  
**Questions?** Email: oshinayadamilola3@gmail.com
