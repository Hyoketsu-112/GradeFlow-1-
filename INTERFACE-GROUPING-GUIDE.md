# GradeFlow Interface Grouping System

## Philosophy
**Minimal by default, organized by design.** The interface uses visual grouping to prevent overwhelm by organizing features into logical containers where users can access what they need.

## Grouping Patterns

### 1. **Section Groups** (Primary Containers)
Main content sections with a title and icon. Use when organizing major features.

```html
<div class="section-group">
  <h2 class="section-group-title">
    <i class="bi bi-graph-up"></i>
    Analytics Overview
    <span class="section-group-subtitle">4 metrics</span>
  </h2>
  
  <!-- Content goes here -->
</div>
```

**When to use:** Top-level dashboard sections, major features, primary workflows

---

### 2. **Mini Card Groups** (Quick Actions/Stats)
Small cards in a grid showing key metrics or quick actions. Great for reducing visual clutter.

```html
<div class="mini-group">
  <div class="mini-card">
    <div class="mini-card-icon"><i class="bi bi-people"></i></div>
    <div class="mini-card-label">Total Students</div>
    <div class="mini-card-value">237</div>
    <div class="mini-card-sub">in all classes</div>
  </div>
  
  <div class="mini-card">
    <div class="mini-card-icon"><i class="bi bi-list-check"></i></div>
    <div class="mini-card-label">Graded</div>
    <div class="mini-card-value">156</div>
    <div class="mini-card-sub">this session</div>
  </div>
</div>
```

**When to use:** KPIs, quick stats, summary metrics that shouldn't be overwhelming

---

### 3. **Collapsible Groups** (Hide/Show Content)
Groups that can expand and collapse to show/hide content. Excellent for preventing overwhelm.

```html
<div class="collapsible-group">
  <div class="collapsible-header">
    <i class="bi bi-chevron-down collapsible-icon"></i>
    <span class="collapsible-title">
      <i class="bi bi-gear"></i>
      Advanced Settings
    </span>
    <span class="collapsible-count">8</span>
  </div>
  
  <div class="collapsible-content">
    <div class="collapsible-body">
      <!-- Settings content -->
    </div>
  </div>
</div>
```

**When to use:** Optional features, advanced options, settings that clutter the default view

---

### 4. **Action Groups** (Related Buttons)
Group related buttons/actions together in a highlighted container.

```html
<div class="action-group">
  <label class="action-group-label">Quick Actions</label>
  <button class="btn btn-primary">
    <i class="bi bi-plus-circle"></i> Add Grade
  </button>
  <button class="btn btn-outline">
    <i class="bi bi-upload"></i> Import
  </button>
  <button class="btn btn-outline">
    <i class="bi bi-download"></i> Export
  </button>
</div>
```

**When to use:** Primary and secondary actions, grouped workflows, bulk operations

---

### 5. **Feature List Groups** (Organized Items)
A structured list with icons for each item. Great for documentation or feature lists.

```html
<ul class="feature-list">
  <li class="feature-list-item">
    <div class="feature-list-icon"><i class="bi bi-check-circle"></i></div>
    <div class="feature-list-content">
      <div class="feature-list-title">Auto-Grade Essays</div>
      <div class="feature-list-desc">AI-powered grading for written assignments</div>
    </div>
    <div class="feature-list-action">
      <button class="btn btn-sm btn-outline">Try</button>
    </div>
  </li>
</ul>
```

**When to use:** Feature lists, tutorials, checklists, capabilities

---

### 6. **Tab-Based Groups** (Switch Views)
Multiple groups with tabs to switch between them. Similar to your subject tabs.

```html
<div class="group-tabs">
  <button class="group-tab active" data-tab="overview">Overview</button>
  <button class="group-tab" data-tab="detailed">Detailed</button>
  <button class="group-tab" data-tab="analytics">Analytics</button>
</div>

<div class="group-content active" id="overview">
  <!-- Overview content -->
</div>
<div class="group-content" id="detailed">
  <!-- Detailed content -->
</div>
<div class="group-content" id="analytics">
  <!-- Analytics content -->
</div>
```

**When to use:** Multiple views of the same data, different perspectives, related dashboards

---

### 7. **Grid-Based Groups** (Flexible Layout)
Items arranged in a responsive grid. Good for multiple related items.

```html
<div class="group-grid">
  <div class="grid-group-item">
    <div class="grid-group-item-icon">📊</div>
    <div class="grid-group-item-title">Class Performance</div>
    <div class="grid-group-item-text">View average grades and pass rate</div>
    <button class="btn btn-sm btn-primary">Open</button>
  </div>
  
  <div class="grid-group-item">
    <div class="grid-group-item-icon">👥</div>
    <div class="grid-group-item-title">Student List</div>
    <div class="grid-group-item-text">Manage roster and details</div>
    <button class="btn btn-sm btn-primary">Open</button>
  </div>
</div>
```

**When to use:** Dashboard shortcuts, feature cards, multiple entry points

---

## Recommended Dashboard Organization

### Teacher Dashboard - Minimal by Default
```
┌─ QUICK STATS (collapsed by default to prevent overwhelm)
│  ├─ Classes
│  ├─ Students
│  └─ Graded this session

┌─ GradeSheet (Main focus)
│  ├─ Class selector
│  ├─ Grade table
│  └─ Quick actions [Save] [Export] [Share]

┌─ RELATED FEATURES (Collapsible groups)
│  ├─ Analytics (Default hidden)
│  ├─ Reports (Default hidden)
│  └─ Settings (Default hidden)

┌─ SIDEBAR (Organized groups)
│  ├─ Main
│  ├─ Classes
│  └─ More (collapsible)
```

---

## Styling Classes

| Class | Purpose |
|-------|---------|
| `.section-group` | Main container for a section |
| `.mini-group` | Grid of small cards |
| `.collapsible-group` | Expandable section |
| `.action-group` | Related actions/buttons |
| `.feature-list` | Organized item list |
| `.group-tabs` | Tab navigation |
| `.group-grid` | Responsive grid |
| `.empty-group` | Empty state |

---

## JavaScript for Collapsible Groups

```javascript
// Make collapsible groups work
document.querySelectorAll('.collapsible-header').forEach(header => {
  header.addEventListener('click', function() {
    const group = this.closest('.collapsible-group');
    group.classList.toggle('expanded');
    
    // Save state to localStorage
    const id = group.id;
    if (id) {
      const isExpanded = group.classList.contains('expanded');
      localStorage.setItem(`group-${id}`, isExpanded);
    }
  });
  
  // Restore saved state
  const group = header.closest('.collapsible-group');
  const id = group.id;
  if (id && localStorage.getItem(`group-${id}`) === 'true') {
    group.classList.add('expanded');
  }
});
```

---

## Colors & Theming

The grouping system uses your existing design tokens:
- `--accent` - Primary blue (#4361ee)
- `--surface` - Container background
- `--border` - Divider color
- `--muted` - Secondary text

Dark mode is automatically applied via `@media (prefers-color-scheme: dark)`

---

## Responsive Behavior

- **Desktop (> 768px)**: Full grouping system
- **Tablet (768px)**: Groups stack vertically
- **Mobile (< 480px)**: Single column, optimized spacing

---

## Best Practices

1. **Don't overwhelm** - Use collapsible groups for secondary features
2. **Clear labels** - Every group needs a descriptive title
3. **Icons help** - Use icons to quickly identify sections
4. **Consistent spacing** - Use the predefined gaps (1.5rem, 2rem)
5. **Logical order** - Show most important features first
6. **Group related items** - Keep similar features together
7. **Test on mobile** - Ensure groups work on small screens

---

## Example: Minimal Teacher Dashboard

This would be the default view (minimal, focused):
- Quick stats summary
- Main gradesheet
- "More options" collapsible for advanced features

Result: **Clean, uncluttered, focused on primary task** ✅
