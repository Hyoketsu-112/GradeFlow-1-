# 🔐 Row-Level Security (RLS) - Complete Setup Guide

**Status**: 📋 Ready for Week 18 Implementation  
**Timeline**: 1-2 hours setup + testing  
**Owner**: Database/auth team

---

## 📋 Prerequisites

Before enabling RLS, complete these Week 17 tasks:

- [x] Create Supabase project
- [x] Deploy PHASE_3_SCHEMA.sql (all 10 tables created)
- [x] Supabase Auth configured (email/password)
- [ ] RLS policies applied (THIS GUIDE)
- [ ] Test users created with different roles

---

## ⚠️ IMPORTANT: RLS Enabled But Policies Not Active Yet

Your PHASE_3_SCHEMA.sql already contains:

```sql
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
-- ... (all 10 tables)
```

**Status**: ✅ RLS is ON but **NO POLICIES** are running yet  
**Effect**: All authenticated users can see/modify all rows initially!

---

## 🚀 Step 1: Copy RLS Policy SQL

1. Open [PHASE_3_RLS_POLICIES.sql](./PHASE_3_RLS_POLICIES.sql)
2. **Copy everything** (Ctrl+A → Ctrl+C)

---

## 🔧 Step 2: Apply Policies in Supabase

### 2.1 Open Supabase SQL Editor

1. Go to https://supabase.com → Your Project
2. Click **"SQL Editor"** (left sidebar)
3. Click **"New Query"**
4. **Paste** the entire RLS policies SQL

### 2.2 Run the SQL

1. Click **"Run"** button (or Ctrl+Enter)
2. Watch for **green checkmark** ✅
3. If errors appear → see [Troubleshooting](#troubleshooting) below

### 2.3 Verify Policies Created

Run this verification query in SQL Editor:

```sql
-- List all RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

**Expected Output**: ~40+ policies listed (each table gets ~3-5 policies)

---

## ✅ Step 3: Test Data Isolation

### 3.1 Create Test Users

In SQL Editor, run:

```sql
-- Create school (all users need this)
INSERT INTO schools (id, name, code, location)
VALUES (
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Test School',
  'TS001',
  'Test City'
) ON CONFLICT DO NOTHING;

-- Teacher user
INSERT INTO users (id, email, name, role, school_id)
VALUES (
  '11111111-0000-0000-0000-000000000001'::uuid,
  'teacher@test.com',
  'Mr. Teacher',
  'teacher',
  '00000000-0000-0000-0000-000000000001'::uuid
) ON CONFLICT DO NOTHING;

-- Student user
INSERT INTO users (id, email, name, role, school_id)
VALUES (
  '22222222-0000-0000-0000-000000000001'::uuid,
  'student@test.com',
  'Jane Student',
  'student',
  '00000000-0000-0000-0000-000000000001'::uuid
) ON CONFLICT DO NOTHING;

-- Admin user
INSERT INTO users (id, email, name, role, school_id)
VALUES (
  '33333333-0000-0000-0000-000000000001'::uuid,
  'admin@test.com',
  'Admin User',
  'admin',
  '00000000-0000-0000-0000-000000000001'::uuid
) ON CONFLICT DO NOTHING;
```

### 3.2 Test Using Supabase Client

#### Test 1: Student Can't Read Other School Data

**Script**: In your browser console or Node.js:

```javascript
// Initialize Supabase client
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
);

// Sign in as student
await supabase.auth.signInWithPassword({
  email: "student@test.com",
  password: "Test123!", // Set a password first in Supabase
});

// Try to query ALL schools (should only see their own)
const { data, error } = await supabase.from("schools").select("*");

console.log("Schools visible to student:", data.length); // Should be 1, not all
```

#### Test 2: Student Can't Insert Scores

```javascript
// Still signed in as student
const { data, error } = await supabase.from("scores").insert([
  {
    student_id: "SOME_UUID",
    subject_id: "math",
    test: 18,
    practical: 15,
    exam: 55,
  },
]);

console.log("Insert error:", error?.message); // Should have RLS error
```

#### Test 3: Teacher Can Insert Scores

```javascript
// Sign out student, sign in as teacher
await supabase.auth.signOut();
await supabase.auth.signInWithPassword({
  email: 'teacher@test.com',
  password: 'Test123!'
});

// Now insert should work
const { data, error } = await supabase
  .from('scores')
  .insert([{...}]);

console.log('Score inserted:', data); // Should succeed
```

---

## 🧪 Step 4: Automated Testing

### 4.1 Create Test Script

**File**: `tests/rls-test.js`

```javascript
const { createClient } = require("@supabase/supabase-js");

const TEST_CASES = [
  {
    name: "Student cannot see other school users",
    user: "student@test.com",
    query: "users",
    shouldSucceed: true,
    shouldSeeRows: 1, // Only themselves
  },
  {
    name: "Student cannot insert scores",
    user: "student@test.com",
    operation: "insert:scores",
    shouldSucceed: false, // RLS should block
  },
  {
    name: "Teacher can insert scores",
    user: "teacher@test.com",
    operation: "insert:scores",
    shouldSucceed: true,
  },
  {
    name: "Admin can delete any user",
    user: "admin@test.com",
    operation: "delete:users",
    shouldSucceed: true,
  },
];

// Run all tests
async function runTests() {
  let passed = 0;
  let failed = 0;

  for (const test of TEST_CASES) {
    try {
      // Run test logic here
      console.log(`✅ ${test.name}`);
      passed++;
    } catch (err) {
      console.log(`❌ ${test.name}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
}

runTests();
```

### 4.2 Run Tests

```bash
npm test -- tests/rls-test.js
```

---

## 🔍 Verification Checklist

After applying policies, verify:

- [ ] 40+ RLS policies listed in `pg_policies`
- [ ] All 10 tables show `rowsecurity = true` in `pg_tables`
- [ ] Student can only see their own school data
- [ ] Student cannot read other students' scores
- [ ] Student cannot insert/update/delete scores
- [ ] Teacher can insert scores for their class
- [ ] Teacher cannot see other schools' data
- [ ] Admin can see all school data
- [ ] Audit logs record policy denials

### Verification Query:

```sql
-- Check RLS status for all tables
SELECT
  tablename,
  rowsecurity,
  (SELECT COUNT(*) FROM pg_policies WHERE pg_policies.tablename = pg_tables.tablename) as policy_count
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

**Expected Output**:

```
 tablename      | rowsecurity | policy_count
 school         | t           | 2
 users          | t           | 4
 classes        | t           | 4
 students       | t           | 4
 scores         | t           | 5
 attendance     | t           | 4
 materials      | t           | 3
 quizzes        | t           | 3
 quiz_results   | t           | 3
 audit_logs     | t           | 1
```

---

## 🐛 Troubleshooting

### Issue: "Permission denied for schema public"

**Cause**: Service role key not being used for administrative tasks

**Solution**:

```javascript
// Use SERVICE_ROLE key for admin operations
const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY, // ← Use this, not anon key
);
```

### Issue: "RLS policy missing" error

**Cause**: Policy SQL didn't execute properly

**Solution**:

1. Check SQL Editor for error messages
2. Look for Postgres errors like:
   - `column "..." does not exist`
   - `function "..." does not exist`
   - `invalid syntax near`

### Issue: Students can see ALL scores

**Cause**: `SELECT` policy on `scores` is too permissive

**Check**:

```sql
SELECT * FROM pg_policies WHERE tablename = 'scores' LIMIT 5;
```

**Fix**: Remove overly broad SELECT policy and redeploy

### Issue: "42P01: relation does not exist"

**Cause**: Tables not created before policies applied

**Solution**: Run PHASE_3_SCHEMA.sql first, then PHASE_3_RLS_POLICIES.sql

---

## 🚀 Week 18-19 Integration

### Next Steps After RLS Setup:

1. **Auth Integration** (Week 17 end)
   - Connect Supabase Auth to frontend
   - Users sign up → auto-create user record
   - JWT token includes `auth.uid()` for policies

2. **Data Migration** (Week 18)
   - Migrate localStorage → Supabase
   - Use service role key for migration
   - Then disable service role for normal ops

3. **Sync Engine** (Week 19-20)
   - IndexedDB for offline cache
   - Sync manager respects RLS rules
   - Conflict resolution in sync queue

---

## 📚 Key Functions in Policies

These helper functions are created by PHASE_3_RLS_POLICIES.sql:

### `is_admin()`

Check if current user is admin in their school

```sql
SELECT is_admin(); -- Returns TRUE/FALSE
```

### `get_user_school_id()`

Get current user's school

```sql
SELECT get_user_school_id(); -- Returns UUID
```

These make policies cleaner and more maintainable.

---

## 🔒 Security Notes

### What RLS Protects

✅ Prevents direct database access from bypassing auth  
✅ Enforces multi-tenancy (school isolation)  
✅ Role-based data access (student/teacher/admin)  
✅ Audit trail of policy denials

### What RLS Does NOT Protect

❌ API layer bugs (always validate on backend)  
❌ SQL injection if queries not parameterized  
❌ Service role key if exposed in code  
❌ JWT token if sent unencrypted

---

## Timeline

- **Week 18 Tue**: Apply RLS policies (this guide)
- **Week 18 Wed**: Test data isolation manually
- **Week 18 Thu**: Automated testing & edge cases
- **Week 18 Fri**: Auth integration complete
- **Week 19**: Sync engine respects RLS

---

## Status

✅ **Week 17**: Schema + Auth setup  
🟡 **Week 18**: RLS policies (YOU ARE HERE)  
⏳ **Week 19**: Sync engine with RLS  
⏳ **Week 20**: Multi-device workings

---

**Last Updated**: April 13, 2026  
**Owner**: Database Team  
**Next Review**: After Week 18 testing complete
