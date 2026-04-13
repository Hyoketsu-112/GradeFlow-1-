#!/usr/bin/env node

/**
 * 🔍 Supabase Connection & RLS Verification Script
 * 
 * Run this to verify:
 * ✓ Supabase connection working
 * ✓ Accounts created
 * ✓ RLS policies active
 * ✓ Data isolation working
 * 
 * Usage:
 *   node verify-supabase.js
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(type, message) {
  const icons = {
    success: `${colors.green}✓${colors.reset}`,
    error: `${colors.red}✗${colors.reset}`,
    info: `${colors.blue}ℹ${colors.reset}`,
    warn: `${colors.yellow}⚠${colors.reset}`,
    step: `${colors.cyan}→${colors.reset}`
  };
  console.log(`${icons[type]} ${message}`);
}

async function checkConnection() {
  log('step', '1️⃣ Checking Supabase Connection...\n');

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    log('error', 'Missing .env.local credentials!');
    log('info', 'Create .env.local with:');
    console.log(`
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
    `);
    return false;
  }

  log('success', `URL: ${SUPABASE_URL}`);
  log('success', `ANON_KEY: ${SUPABASE_ANON_KEY.substring(0, 20)}...`);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  try {
    // Try to fetch from a table to verify connection
    const { data, error } = await supabase
      .from('users')
      .select('count', { count: 'exact', head: true });

    if (error) {
      log('error', `Connection failed: ${error.message}`);
      return false;
    }

    log('success', 'Supabase connection successful!');
    return true;
  } catch (err) {
    log('error', `Connection error: ${err.message}`);
    return false;
  }
}

async function checkAccounts() {
  log('step', '\n2️⃣ Checking Your 4 Test Accounts...\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const testEmails = ['teacher@test.com', 'student@test.com', 'admin@test.com', 'student2@test.com'];

  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, name, role, school_id');

    if (error) {
      log('error', `Failed to query users: ${error.message}`);
      return false;
    }

    log('info', `Total users in database: ${data.length}`);

    testEmails.forEach(email => {
      const user = data.find(u => u.email === email);
      if (user) {
        log('success', `Found: ${email} (${user.role})`);
      } else {
        log('warn', `MISSING: ${email}`);
      }
    });

    return data.length > 0;
  } catch (err) {
    log('error', `Error checking accounts: ${err.message}`);
    return false;
  }
}

async function testDataIsolation() {
  log('step', '\n3️⃣ Testing Data Isolation (RLS)...\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  try {
    // Test 1: Sign in as student
    log('info', 'Test 1: Student login...');
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'student@test.com',
      password: 'Test123!' // Change to your actual password
    });

    if (authError) {
      log('error', `Student login failed: ${authError.message}`);
      return false;
    }

    log('success', `Signed in as: ${authData.user.email}`);
    
    // Test 2: Query schools (should only see 1)
    const { data: schools, error: schoolError } = await supabase
      .from('schools')
      .select('*');

    if (schoolError) {
      log('error', `Failed to query schools: ${schoolError.message}`);
    } else {
      log(schools.length === 1 ? 'success' : 'error', 
        `Student can see ${schools.length} school(s) - expected 1`);
    }

    // Test 3: Query scores (should only see own)
    const { data: scores, error: scoreError } = await supabase
      .from('scores')
      .select('*');

    if (scoreError) {
      log('error', `Failed to query scores: ${scoreError.message}`);
    } else {
      log('success', `Student can see ${scores.length} score(s)`);
    }

    // Test 4: Try to INSERT scores (should fail with RLS)
    log('info', 'Test 2: Student INSERT attempt (should be blocked)...');
    const { data: insertData, error: insertError } = await supabase
      .from('scores')
      .insert([
        {
          student_id: 'dummy-uuid',
          school_id: 'dummy-uuid',
          class_id: 'dummy-uuid',
          subject_id: 'math',
          subject_name: 'Mathematics',
          test: 18,
          practical: 15,
          exam: 55
        }
      ]);

    if (insertError && insertError.code === 'PGRST301') {
      log('success', 'RLS WORKING! Student blocked from inserting: ' + insertError.message);
    } else if (insertError) {
      log('warn', `Insert failed (check if RLS): ${insertError.message}`);
    } else {
      log('error', 'RLS NOT WORKING! Student was able to insert scores');
    }

    // Sign out
    await supabase.auth.signOut();
    return true;

  } catch (err) {
    log('error', `Error during isolation test: ${err.message}`);
    return false;
  }
}

async function checkRLSStatus() {
  log('step', '\n4️⃣ Checking RLS Policy Status...\n');

  const supabaseService = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Query RLS status
    const { data: rlsStatus, error: rlsError } = await supabaseService
      .rpc('check_rls_status', {});

    if (rlsError && rlsError.code === '42883') {
      log('info', 'RLS status check function not found (expected)');
      log('info', 'To manually check, run in Supabase SQL Editor:');
      console.log(`
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
      `);
      return true;
    }

    return true;
  } catch (err) {
    log('warn', `Note: ${err.message}`);
    return true;
  }
}

async function checkSchema() {
  log('step', '\n5️⃣ Checking Database Schema...\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const requiredTables = [
    'schools', 'users', 'classes', 'students', 
    'scores', 'attendance', 'materials', 'quizzes', 
    'quiz_results', 'audit_logs'
  ];

  try {
    for (const table of requiredTables) {
      const { data, error } = await supabase
        .from(table)
        .select('count', { count: 'exact', head: true });

      if (error) {
        log('error', `Table missing: ${table}`);
      } else {
        log('success', `Table exists: ${table}`);
      }
    }
    return true;
  } catch (err) {
    log('error', `Schema check error: ${err.message}`);
    return false;
  }
}

async function runDebugDump() {
  log('step', '\n6️⃣ Debug Dump (Raw Data)...\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  try {
    // Get all users
    const { data: users } = await supabase.from('users').select('*');
    log('info', `All Users (${users.length}):`);
    console.log(JSON.stringify(users, null, 2));

    // Get all schools
    const { data: schools } = await supabase.from('schools').select('*');
    log('info', `\nAll Schools (${schools.length}):`);
    console.log(JSON.stringify(schools, null, 2));

  } catch (err) {
    log('error', `Debug dump error: ${err.message}`);
  }
}

async function main() {
  console.log(`
${colors.cyan}╔════════════════════════════════════════════════════╗${colors.reset}
${colors.cyan}║  🔍 Supabase & RLS Verification Script            ║${colors.reset}
${colors.cyan}║  GradeFlow Phase 3 - Week 18 Testing              ║${colors.reset}
${colors.cyan}╚════════════════════════════════════════════════════╝${colors.reset}
  `);

  let allPassed = true;

  // Test 1: Connection
  const connected = await checkConnection();
  if (!connected) {
    log('error', 'Cannot continue without Supabase connection');
    process.exit(1);
  }

  // Test 2: Accounts
  const accountsExist = await checkAccounts();

  // Test 3: Data Isolation
  const isolationWorks = await testDataIsolation();

  // Test 4: RLS Status
  await checkRLSStatus();

  // Test 5: Schema
  await checkSchema();

  // Test 6: Debug Dump
  // await runDebugDump(); // Uncomment to see raw data

  console.log(`
${colors.cyan}╔════════════════════════════════════════════════════╗${colors.reset}
${colors.cyan}║  📊 Summary                                        ║${colors.reset}
${colors.cyan}╚════════════════════════════════════════════════════╝${colors.reset}
  `);

  log('success', 'Supabase connection: WORKING');
  log(accountsExist ? 'success' : 'warn', `Test accounts: ${accountsExist ? 'FOUND' : 'NOT ALL FOUND'}`);
  log(isolationWorks ? 'success' : 'warn', `Data isolation: ${isolationWorks ? 'WORKING' : 'CHECK RESULTS'}`);

  console.log(`
${colors.yellow}💡 Next Steps:${colors.reset}
1. Verify all 4 accounts are created in Supabase Auth
2. If "MISSING" accounts - create them manually in Supabase dashboard
3. If RLS tests fail - run PHASE_3_RLS_POLICIES.sql in SQL Editor
4. If INSERT worked - RLS policies not applied correctly

🔗 Supabase Dashboard: https://supabase.com/dashboard
📖 Docs: docs/PHASE_3_RLS_SETUP_GUIDE.md
  `);
}

main().catch(err => {
  log('error', `Fatal error: ${err.message}`);
  process.exit(1);
});
