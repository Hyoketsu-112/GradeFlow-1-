/**
 * 🧪 Test Login Sync with Timestamps
 *
 * Run this in browser console to verify login syncing is working
 * Copy the entire file and paste into your browser console
 */

console.log("🧪 Starting Login Sync Test...\n");

// Test 1: Check if Supabase credentials are loaded
console.log("Step 1️⃣: Checking Supabase credentials...");
const supabaseUrl = localStorage.getItem("SUPABASE_URL") || window.SUPABASE_URL;
const supabaseKey =
  localStorage.getItem("SUPABASE_ANON_KEY") || window.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Supabase credentials not found!");
  console.log(
    "   Check .env.local or index.html for SUPABASE_URL and SUPABASE_ANON_KEY",
  );
} else {
  console.log("✅ Supabase URL found:", supabaseUrl.substring(0, 40) + "...");
  console.log("✅ Supabase Key found:", supabaseKey.substring(0, 20) + "...");
}

// Test 2: Check if users are in localStorage
console.log("\nStep 2️⃣: Checking current user...");
const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}");
if (currentUser.email) {
  console.log("✅ Current user:", currentUser.email);
  console.log("   Role:", currentUser.role || "not set");
} else {
  console.log(
    "⚠️ No user logged in. Try logging in first, then run this test again.",
  );
}

// Test 3: Check if timestamp columns exist
console.log("\nStep 3️⃣: Checking if database has timestamp columns...");
const checkColumnsQuery = async () => {
  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/users?select=id,email,last_login,updated_at&limit=1`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      },
    );

    if (res.ok) {
      const data = await res.json();
      if (data.length > 0) {
        console.log("✅ last_login column exists");
        console.log("✅ updated_at column exists");
        console.log("   Current user in database:", data[0]);
        return true;
      }
    } else {
      const err = await res.json();
      if (err.message && err.message.includes("undefined column")) {
        console.error(
          "❌ Columns not found! Run SQL setup in Supabase Dashboard first.",
        );
        console.log("   See: SUPABASE_SETUP_TIMESTAMPS.sql");
      } else {
        console.error("❌ Error:", err.message);
      }
    }
  } catch (e) {
    console.error("❌ Network error:", e.message);
  }
};

await checkColumnsQuery();

// Test 4: Simulate login and check if timestamps update
console.log("\nStep 4️⃣: Testing login timestamp sync...");
if (currentUser.email) {
  const testLoginSync = async () => {
    try {
      const now = new Date().toISOString();
      const res = await fetch(
        `${supabaseUrl}/rest/v1/users?on_conflict=email&email=eq.${currentUser.email}`,
        {
          method: "PATCH",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            last_login: now,
            updated_at: now,
          }),
        },
      );

      if (res.ok) {
        console.log("✅ Timestamp sync successful!");
        console.log("   Synced at:", now);

        // Wait a second then fetch the user to verify
        await new Promise((r) => setTimeout(r, 1000));

        const fetchRes = await fetch(
          `${supabaseUrl}/rest/v1/users?email=eq.${currentUser.email}&select=email,last_login,updated_at`,
          {
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
            },
          },
        );

        if (fetchRes.ok) {
          const userData = await fetchRes.json();
          if (userData.length > 0) {
            console.log("✅ User data from cloud:");
            console.log("   Email:", userData[0].email);
            console.log("   Last Login:", userData[0].last_login);
            console.log("   Updated At:", userData[0].updated_at);
          }
        }
      } else {
        console.error("❌ Sync failed:", res.status);
      }
    } catch (e) {
      console.error("❌ Error:", e.message);
    }
  };

  await testLoginSync();
} else {
  console.log("⚠️ Skipping sync test - no user logged in");
}

console.log("\n" + "=".repeat(50));
console.log("✅ Test Complete!");
console.log("=".repeat(50));
console.log("\nWhat to check:");
console.log("1. ✅ All steps showed green checkmarks");
console.log("2. ✅ Timestamps are showing in cloud");
console.log("3. ✅ No errors in console");
console.log("\nIf all ✅: Login sync is working! 🎉");
console.log("If any ❌: Check TIMESTAMP_SETUP_GUIDE.md for troubleshooting");
