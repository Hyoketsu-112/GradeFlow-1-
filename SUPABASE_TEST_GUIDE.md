# 🧪 Supabase Test Verification Checklist

**Status**: Local Testing (Non-Production)  
**Date**: April 13, 2026

---

## ✅ Quick Testing Guide (5 minutes)

### Step 1: Install Dependencies

```bash
npm install @supabase/supabase-js dotenv
```

### Step 2: Create Verification Script

Already created: `verify-supabase.js`

### Step 3: Run The Script

```bash
node verify-supabase.js
```

**Expected Output**:

```
✓ Supabase connection successful!
✓ Total users in database: 4
✓ Found: teacher@test.com (teacher)
✓ Found: student@test.com (student)
✓ Found: admin@test.com (admin)
✓ Signed in as: student@test.com
✓ RLS WORKING! Student blocked from inserting
```

---

## 🔍 Manual Verification Steps (If script fails)

### Check 1: Credentials Are Being Read

```bash
# Windows PowerShell
echo $env:SUPABASE_URL
echo $env:SUPABASE_ANON_KEY
```

**Expected**: Shows your Supabase URL and key (should NOT be empty)

### Check 2: Accounts Created in Supabase

Go to **Supabase Dashboard → Authentication → Users**

You should see 4 users:

- ✅ teacher@test.com
- ✅ student@test.com
- ✅ admin@test.com
- ✅ (4th account you created)

**If missing**: Create manually in Supabase Auth tab

### Check 3: Users Table Has Data

Go to **Supabase Dashboard → SQL Editor** → Run:

```sql
SELECT id, email, name, role FROM users LIMIT 10;
```

**Expected**: 4 rows with your test users

### Check 4: RLS Policies Are Applied

Go to **Supabase Dashboard → SQL Editor** → Run:

```sql
SELECT tablename, rowsecurity, policyname
FROM pg_tables
LEFT JOIN pg_policies ON pg_policies.tablename = pg_tables.tablename
WHERE schemaname = 'public'
ORDER BY tablename;
```

**Expected**:

```
 tablename    | rowsecurity | policyname
 schools      | t           | schools_users_can_view_their_school
 users        | t           | users_can_view_school_members
 scores       | t           | scores_students_can_view_own
 ...
```

If policyname is **NULL** → RLS policies NOT applied (run PHASE_3_RLS_POLICIES.sql)

---

## 🧪 Direct RLS Testing (Copy-Paste Ready)

### Test 1: Student Data Isolation

**In your local app (browser console):**

```javascript
// Install: npm install @supabase/supabase-js
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  "YOUR_SUPABASE_URL", // From .env.local
  "YOUR_ANON_KEY", // From .env.local
);

// Sign in as student
await supabase.auth.signInWithPassword({
  email: "student@test.com",
  password: "YourPassword123", // Use the actual password
});

// Query: Student should only see 1 school (their own)
const { data: schools } = await supabase.from("schools").select("*");
console.log("Schools visible:", schools.length); // Expected: 1

// Query: Student should only see their own scores
const { data: scores } = await supabase.from("scores").select("*");
console.log("Scores visible:", scores.length); // Expected: Only their own

// Try INSERT: Should be blocked by RLS
const { error } = await supabase.from("scores").insert([
  {
    student_id: "dummy",
    school_id: "dummy",
    subject_id: "math",
    test: 18,
    practical: 15,
    exam: 55,
  },
]);
console.log("Insert error (expected):", error?.message);
// Expected error: "new row violates row-level security policy"
```

### Test 2: Teacher Can Insert

```javascript
// Sign out student
await supabase.auth.signOut();

// Sign in as teacher
await supabase.auth.signInWithPassword({
  email: 'teacher@test.com',
  password: 'YourPassword123'
});

// Now INSERT should work (teacher has permission)
const { data, error } = await supabase.from('scores').insert([...]);
console.log('Insert succeeded:', data); // Should have data, not error
```

### Test 3: Admin Can See Everything

```javascript
// Sign out teacher
await supabase.auth.signOut();

// Sign in as admin
await supabase.auth.signInWithPassword({
  email: "admin@test.com",
  password: "YourPassword123",
});

// Admin should see all users
const { data: allUsers } = await supabase.from("users").select("*");
console.log("Users visible to admin:", allUsers.length); // Expected: 4+

// Admin should see all schools
const { data: allSchools } = await supabase.from("schools").select("*");
console.log("Schools visible to admin:", allSchools.length); // Expected: all
```

---

## 🚨 Troubleshooting

### Problem: "Invalid login credentials"

**Solution**: Make sure password matches what you set when creating accounts in Supabase Auth

### Problem: "new row violates row-level security policy"

**Solution**: ✅ This is GOOD! RLS is working properly, blocking without permission.

### Problem: "policy not found" or "undefined function"

**Solutions**:

1. Did you run PHASE_3_RLS_POLICIES.sql?
2. Did you run it on the right database?
3. Check SQL Editor for errors when running policies

### Problem: "Cannot read property 'length' of null"

**Solution**: Check your .env.local is loading correctly (use script above)

### Problem: "Student inserted a score successfully" (should have failed)

**Solution**: Your RLS policies are NOT active. Run PHASE_3_RLS_POLICIES.sql in Supabase SQL Editor.

---

## 📊 What Each Test Proves

| Test                     | Proves                 |
| ------------------------ | ---------------------- |
| ✓ Connection works       | Supabase setup correct |
| ✓ 4 accounts exist       | User creation working  |
| ✓ Student sees 1 school  | Multi-tenancy working  |
| ✓ Student INSERT blocked | RLS policies active    |
| ✓ Teacher INSERT works   | Role-based permissions |
| ✓ Admin sees all data    | Admin bypass working   |

---

## 📈 Progress Tracker

- [ ] Dependencies installed
- [ ] .env.local created with credentials
- [ ] verify-supabase.js runs successfully
- [ ] 4 test accounts visible in Supabase Auth
- [ ] 4 user records in users table
- [ ] RLS policies listed in pg_policies
- [ ] Student INSERT test blocked (good!)
- [ ] Teacher INSERT test succeeded
- [ ] Admin sees all data
- [ ] Ready for Week 19 sync engine

---

## 🎯 What's Happening Behind The Scenes

```
Your Local App
    ↓ (Browser Console / Node.js)
    ↓ POST: sign-in (email, password)
Supabase Auth
    ↓ ✓ Valid → Generate JWT token
    ↓ JWT includes: auth.uid(), user role, school_id
Your App
    ↓ Read JWT from auth.session()
    ↓ Make request: SELECT * FROM scores
Supabase API
    ↓ Check: is auth.uid() in JWT valid?
    ↓ Check: does RLS policy allow this user?
    ↓ Policy: SELECT ... WHERE student_id IN (SELECT id FROM students WHERE ...)
Database
    ↓ Only return rows that match policy conditions
    ↓ BEFORE: All data (no RLS) → 1000 score records
    ↓ AFTER: Only filtered (RLS) → 12 score records (student's own)
Your App ← Returns only allowed data
```

---

## 🔗 Key Files

- **Setup**: `docs/PHASE_3_RLS_SETUP_GUIDE.md`
- **Policies**: `docs/PHASE_3_RLS_POLICIES.sql`
- **Verify Script**: `verify-supabase.js` (root)
- **Schema**: `docs/PHASE_3_SCHEMA.sql`

---

## ✅ Success Criteria

When you see **all green checkmarks** ✓:

- Supabase connection verified
- All 4 test accounts exist
- RLS policies blocking unauthorized access
- Teachers/admins can write data
- Students see only their own data

→ **You're ready for Week 19 (Sync Engine)**

---

**Last Updated**: April 13, 2026  
**Next**: Week 19 - Offline-First Sync Implementation
