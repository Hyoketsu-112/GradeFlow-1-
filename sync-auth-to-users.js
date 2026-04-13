#!/usr/bin/env node

/**
 * 🔧 Get Auth User IDs & Generate INSERT SQL
 *
 * This pulls all your Supabase Auth users and generates
 * the SQL INSERT statement for the users table
 *
 * Usage:
 *   node sync-auth-to-users.js
 */

require("dotenv").config({ path: ".env.local" });
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  console.log(`
╔════════════════════════════════════════════════════╗
║  🔧 Sync Supabase Auth Users → users Table        ║
║  GradeFlow Phase 3 - Week 18 Setup                ║
╚════════════════════════════════════════════════════╝
  `);

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("❌ Missing .env.local credentials");
    process.exit(1);
  }

  // Use service role to list all auth users
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    console.log("📍 Fetching Auth users...\n");

    // Get all auth users
    const {
      data: { users },
      error,
    } = await supabase.auth.admin.listUsers();

    if (error) {
      console.error("❌ Error fetching users:", error.message);
      process.exit(1);
    }

    if (users.length === 0) {
      console.error("❌ No users found in Supabase Auth");
      console.error(
        "   Create accounts first in: https://supabase.com/dashboard → Authentication",
      );
      process.exit(1);
    }

    console.log(`✓ Found ${users.length} users in Supabase Auth:\n`);

    // Display user info
    users.forEach((user, i) => {
      console.log(`${i + 1}. ${user.email}`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Created: ${user.created_at}`);
      console.log();
    });

    // Generate INSERT SQL
    console.log("\n📋 Generated SQL INSERT statement:\n");
    console.log("─".repeat(60));

    const schoolId = "00000000-0000-0000-0000-000000000001"; // Default test school
    const roles = {
      "teacher@test.com": "teacher",
      "student@test.com": "parent",
      "admin@test.com": "admin",
      "student2@test.com": "student",
    };

    let sql = `INSERT INTO schools (id, name, code, location)
VALUES (
  '${schoolId}'::uuid,
  'Test School',
  'TS001',
  'Test City'
) ON CONFLICT DO NOTHING;

-- Now insert users
INSERT INTO users (id, email, name, role, school_id)
VALUES\n`;

    users.forEach((user, i) => {
      const role = roles[user.email] || "student";
      const name = user.user_metadata?.name || user.email.split("@")[0];

      sql += `  ('${user.id}'::uuid, '${user.email}', '${name}', '${role}', '${schoolId}'::uuid)`;

      if (i < users.length - 1) {
        sql += ",\n";
      } else {
        sql += ";\n";
      }
    });

    sql += `\n-- Verify insert
SELECT id, email, name, role FROM users ORDER BY created_at DESC;`;

    console.log(sql);
    console.log("─".repeat(60));

    console.log(`
📋 Instructions:
1. Copy the SQL above (Ctrl+C to copy terminal text)
2. Go to: https://supabase.com/dashboard → SQL Editor
3. Create New Query
4. Paste the SQL
5. Click Run
6. Verify you see 4 users in the result

✅ Then run: node verify-supabase.js
    `);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

main();
