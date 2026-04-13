#!/usr/bin/env node

/**
 * 🔐 Generate Test User INSERT SQL with Password Hashes
 *
 * Creates bcrypt password hashes for test users
 * This is for testing ONLY - production uses proper auth
 *
 * Usage:
 *   node generate-user-inserts.js
 */

const bcrypt = require("bcryptjs");

const testUsers = [
  {
    id: "7afe693d-bf3f-4336-b291-9f7674fdc075",
    email: "oluwaremilekunolageshin@gmail.com",
    name: "Remi",
    role: "teacher",
  },
  {
    id: "7985dc41-3471-4e93-bd2a-6b63f9e039fc",
    email: "foladamilola3@gmail.com",
    name: "Fola",
    role: "student",
  },
  {
    id: "fa8ddb03-de88-44a4-bd4d-c9aafb2eacde",
    email: "sd0021306@gmail.com",
    name: "Mr Shawn",
    role: "student",
  },
  {
    id: "62fcdd47-5464-47a4-b080-053528f30d10",
    email: "oshinayadamilola3@gmail.com",
    name: "Admin",
    role: "admin",
  },
];

const schoolId = "00000000-0000-0000-0000-000000000001";
const testPassword = "Test@123456"; // All test users use this password

async function generateSQL() {
  console.log(`
╔════════════════════════════════════════════════════╗
║  🔐 Generate User INSERT SQL with Hashes          ║
║  GradeFlow Phase 3 - Week 18 Setup                ║
╚════════════════════════════════════════════════════╝
  `);

  try {
    // Generate hashes for all users
    const hashedPassword = await bcrypt.hash(testPassword, 10);

    console.log("📋 Generated SQL INSERT statement:\n");
    console.log("─".repeat(80));

    let sql = `-- Create school first
INSERT INTO schools (id, name, code, location)
VALUES (
  '${schoolId}'::uuid,
  'Test School',
  'TS001',
  'Test City'
) ON CONFLICT DO NOTHING;

-- Insert test users with password hashes
INSERT INTO users (id, email, password_hash, name, role, school_id)
VALUES\n`;

    testUsers.forEach((user, i) => {
      sql += `  ('${user.id}'::uuid, '${user.email}', '${hashedPassword}', '${user.name}', '${user.role}', '${schoolId}'::uuid)`;

      if (i < testUsers.length - 1) {
        sql += ",\n";
      } else {
        sql += ";\n";
      }
    });

    sql += `
-- Verify insert
SELECT id, email, name, role FROM users ORDER BY created_at DESC;`;

    console.log(sql);
    console.log("─".repeat(80));

    console.log(`
📋 Test Credentials:
   Password: ${testPassword}
   
   Users:
   1. oluwaremilekunolageshin@gmail.com (teacher) → Test@123456
   2. foladamilola3@gmail.com (student) → Test@123456
   3. sd0021306@gmail.com (student) → Test@123456
   4. oshinayadamilola3@gmail.com (admin) → Test@123456

🔧 Instructions:
1. Copy the SQL above
2. Go to: https://supabase.com/dashboard → SQL Editor
3. Create New Query → Paste → Run
4. Verify: Should show "4 rows inserted"
5. Then test: node verify-supabase.js
    `);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

generateSQL();
