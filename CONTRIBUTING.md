# Contributing to GradeFlow

**Thank you for your interest in contributing!** GradeFlow is a collaborative project and we welcome contributions from developers, educators, and designers.

---

## 📋 Table of Contents

1. [Code of Conduct](#code-of-conduct)
2. [Getting Started](#getting-started)
3. [Development Setup](#development-setup)
4. [Making Changes](#making-changes)
5. [Submitting Pull Requests](#submitting-pull-requests)
6. [Code Standards](#code-standards)
7. [Testing](#testing)
8. [Documentation](#documentation)

---

## 🤝 Code of Conduct

Please read and follow our [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

**TL;DR**: Be respectful, inclusive, and professional. No harassment, discrimination, or abuse.

---

## 🚀 Getting Started

### Before You Start:

1. Fork the repository
2. Clone your fork locally
3. Add upstream remote: `git remote add upstream https://github.com/gradeflow/gradeflow.git`
4. Create a branch: `git checkout -b fix/issue-name` or `git checkout -b feature/feature-name`

### Types of Contributions Welcomed:

- ✅ Bug fixes with test coverage
- ✅ Performance improvements with benchmarks
- ✅ Documentation improvements
- ✅ Translation contributions
- ✅ Accessibility improvements
- ✅ Security hardening

### Types of Contributions NOT Accepted:

- ❌ Major feature changes without discussion (open an issue first!)
- ❌ Changes to core grading algorithm without API review
- ❌ Removal of security checks or permission guards
- ❌ Code with no tests and no documentation

---

## 💻 Development Setup

### Prerequisites:

- Node.js 16+
- npm or yarn
- Git
- Text editor (VS Code recommended)

### Installation:

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/gradeflow.git
cd gradeflow

# Install dependencies
npm install

# Start development server
npm run dev

# Open in browser
open http://localhost:3000
```

### Useful Commands:

```bash
npm run dev              # Start dev server with hot reload
npm run build            # Build for production
npm test                 # Run test suite
npm test -- --coverage   # Run with coverage report
npm run lint             # Check code style
npm run lint:fix         # Auto-fix code style issues
npm run type-check       # Type checking (when Phase 3 adds TypeScript)
```

---

## ✏️ Making Changes

### Step 1: Create an Issue (if none exists)

- Describe the bug or feature
- Include reproduction steps (for bugs)
- Explain the use case (for features)
- Link to related issues

### Step 2: Discuss Approach (for major changes)

- Comment on the issue with your approach
- Wait for feedback from maintainers
- Adjust based on feedback

### Step 3: Create a Feature Branch

```bash
# Update main branch
git fetch upstream
git checkout main
git merge upstream/main

# Create feature branch
git checkout -b fix/issue-123-description
```

Name format: `type/issue-number-short-description`

Types: `fix`, `feature`, `docs`, `refactor`, `perf`, `test`

### Step 4: Make Your Changes

```bash
# Make changes to files
# Keep commits atomic and logical

# Check what changed
git status
git diff

# Stage and commit
git add .
git commit -m "fix: prevent teachers from editing locked grades"
```

### Step 5: Keep Your Branch Updated

```bash
# Fetch latest upstream changes
git fetch upstream

# Rebase (preferred) or merge
git rebase upstream/main
# OR: git merge upstream/main
```

---

## 📤 Submitting Pull Requests

### Before Submitting:

1. ✅ Code passes linting: `npm run lint:fix`
2. ✅ Tests pass: `npm test`
3. ✅ Coverage maintained: `npm test -- --coverage`
4. ✅ Tests added for new functionality
5. ✅ Documentation updated
6. ✅ No console errors or warnings
7. ✅ No merge conflicts with main

### PR Title Format:

```
[TYPE] #123: Short description (50 chars max)
```

Examples:

- `[FIX] #456: Order students by name in report`
- `[FEATURE] #789: Add CBT timer functionality`
- `[PERF] #321: Cache computed rankings`

### PR Description:

```markdown
# Fixes #456

## Description

Brief description of changes.

## Changes Made

- Change 1
- Change 2
- Change 3

## Testing

Describe how you tested this:

- Manual test steps
- Screenshots (if applicable)
- Test cases added

## Checklist

- [x] Code follows style guidelines
- [x] All tests pass
- [x] Documentation updated
- [x] No breaking changes
- [x] Security review complete

## Screenshots (if applicable)

Paste screenshots here.

## Related Issues

Fixes #456, related to #457
```

### What Maintainers Will Review:

1. **Functionality**: Does it work as described?
2. **Testing**: Is it properly tested?
3. **Code Quality**: Does it follow standards?
4. **Security**: Any vulnerabilities or permission issues?
5. **Performance**: Does it impact speed?
6. **Backwards Compatibility**: Does it break existing features?

---

## 🎨 Code Standards

### JavaScript Style

**Format: Prettier (automatic)**

```javascript
// ✅ Good: Clear, readable, well-commented
function computeStudentOverall(student) {
  // Average across all subjects
  const subjects = student.subjects || [];
  if (subjects.length === 0) return null;

  const total = subjects.reduce((sum, s) => {
    const comp = computeSubject(s);
    return sum + (comp.total || 0);
  }, 0);

  return Math.round(total / subjects.length);
}

// ❌ Bad: Unclear, no comments, inconsistent
function avg(s) {
  let t = 0;
  let c = 0;
  for (let i in s.subjects) {
    t += computeSubject(s.subjects[i]).total;
    c++;
  }
  return Math.round(t / c);
}
```

**Naming Conventions:**

- Variables: `camelCase` (studentCount, gradeData)
- Constants: `UPPER_SNAKE_CASE` (MAX_LOGIN_ATTEMPTS)
- Functions: `camelCase` (computeGrade, renderTable)
- Classes: `PascalCase` (StudentCard, GradeSheet)
- Private methods/vars: `_camelCase` (\_validateGrade)

**Comments:**

```javascript
// For simple things: single-line comment
// For complex logic: multi-line explanation

/**
 * For public functions: JSDoc style
 * @param {Array} grades - Student grades
 * @returns {number} - Overall average
 */
function computeAverage(grades) {
  // Implementation...
}
```

### CSS Style

**Format: Prettier (automatic)**

```css
/* Use design tokens */
.card {
  padding: var(--spacing-2);
  background: var(--surface);
  border-radius: var(--radius-2);
  box-shadow: var(--shadow-1);
}

/* Mobile-first responsive design */
@media (min-width: 768px) {
  .card {
    padding: var(--spacing-3);
  }
}
```

### HTML Style

```html
<!-- Use semantic tags -->
<section class="grade-sheet">
  <header>
    <h1>Grade Entry</h1>
  </header>

  <main>
    <!-- Content -->
  </main>
</section>
```

---

## 🧪 Testing

### Test Structure:

```
tests/
├── unit/
│   ├── grading.test.js      # computeGrade, rankStudents
│   ├── validation.test.js   # Input validation
│   └── utils.test.js        # Helper functions
├── integration/
│   ├── auth.test.js         # Login, logout, session
│   ├── sync.test.js         # Data sync
│   └── export.test.js       # PDF/Excel generation
└── fixtures/
    ├── sample-students.json
    └── sample-grades.json
```

### Writing Tests:

```javascript
// Use Jest/Jasmine format
describe("computeGrade", () => {
  it("should return letter grade A for scores >= 90", () => {
    const result = computeGrade(95);
    expect(result.letter).toBe("A");
  });

  it("should return null for invalid scores", () => {
    const result = computeGrade(-5);
    expect(result).toBeNull();
  });
});
```

### Running Tests:

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific file
npm test -- tests/unit/grading.test.js

# Watch mode
npm test -- --watch
```

**Coverage Target**: > 80% of critical paths

---

## 📚 Documentation

### Update These When Making Changes:

1. **README.md**: If adding new user-facing feature
2. **docs/ARCHITECTURE.md**: If changing code structure
3. **SECURITY.md**: If affecting security
4. **Code comments**: For complex logic
5. **JSDoc**: For public functions

### Documentation Style:

```markdown
# Feature Name

Brief description of what this does.

## Usage

Clear example of how to use it.

## Configuration

Any settings or options.

## Examples

Real-world usage examples.

## Related

Links to related features or docs.
```

---

## 🔍 Code Review Expectations

### We Will Ask About:

- Why did you choose this approach?
- Did you consider performance implications?
- Does this work on all browsers?
- Is there a simpler way to do this?
- Does this introduce any security risks?

### Be Prepared To:

- ✅ Explain your reasoning
- ✅ Update code based on feedback
- ✅ Add or improve tests
- ✅ Update documentation
- ✅ Keep discussions professional and kind

---

## ⚠️ Common Mistakes to Avoid

1. ❌ **Large PRs**: Keep PRs to < 400 lines
2. ❌ **No tests**: All functionality needs test coverage
3. ❌ **Poor commits**: Use descriptive, atomic commits
4. ❌ **Force pushes**: Never force push to main (only your branch)
5. ❌ **Breaking changes**: Maintain backwards compatibility
6. ❌ **Security oversights**: Always review permission guards
7. ❌ **No documentation**: Update docs with code changes
8. ❌ **Ignoring feedback**: Be open to reviewer suggestions

---

## 🎓 Learning Resources

- [Git Best Practices](https://www.atlassian.com/git/tutorials)
- [JavaScript Style Guide](https://airbnb.io/javascript/)
- [Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Web Security Academy](https://portswigger.net/web-security)

---

## 📞 Getting Help

- **Questions?** Comment on the GitHub issue
- **Stuck?** Reach out in discussions
- **Security concern?** Email oshinayadamilola3@gmail.com
- **Urgent issue?** Contact: oshinayadamilola3@gmail.com

---

## 🙏 Thank You!

Your contributions help make GradeFlow better for teachers and students everywhere. We appreciate your time and effort!

---

**Last Updated**: April 8, 2026  
**Maintained by**: GradeFlow Development Team
