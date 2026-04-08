# Frequently Asked Questions (FAQ)

**Last Updated**: April 8, 2026

---

## General Questions

### What is GradeFlow?

GradeFlow is a fast, offline-first grading platform designed for Nigerian schools. Teachers can manage classes, enter grades, track attendance, export reports, and more—all without needing internet. When you do connect online, it automatically backs up to the cloud (Phase 3+).

### Who should use GradeFlow?

- **Teachers**: Grade entry, analytics, reporting
- **Students**: View personal grades, ranking, attendance
- **Parents**: Monitor child's progress
- **School Admins**: School oversight, team management (Phase 3+)

### Is GradeFlow free?

**Currently**: Yes, completely free (Phase 2)
**After Phase 3** (Q3 2026): Free tier with limited classes, paid Pro/School tiers for unlimited features

### How do I get started?

1. Open the app (already installed or visit gradeflow.app)
2. Create account with email and password
3. Add your class and subjects
4. Add students (manual or CSV import)
5. Start entering grades!

---

## Features & Usage

### How do I import students from Excel?

1. Go to **Students** tab
2. Click **Import from CSV**
3. Download template
4. Add your students to Excel
5. Save as CSV and upload
6. Done! Students appear in class

### Can I edit grades after entering them?

**Yes!** Click on any score cell to edit. Changes are instant. No approval process yet (comes in Phase 3 for schools).

### How do I generate PDF reports?

1. Go to **Grade Sheet** or **Student Cards**
2. Click student's name or **PDF icon**
3. Select report format
4. Download saves to your device
5. Print or share with parents

### Can I track attendance?

**Yes!** Go to **Attendance** tab:

- Mark students as Present (P), Absent (A), or Late (L)
- View attendance percentage per student
- Export attendance reports

### Does it work offline?

**Yes!** 100% offline-first. All core features work without internet:

- Grade entry ✅
- Attendance ✅
- Analytics ✅
- Report generation ✅
- Export ✅

When you go online, it auto-backs up (Phase 3+).

### How do I use analytics?

Go to **Analytics** tab:

- Subject performance charts
- Student rankings
- Average/highest/lowest scores
- Pass rate metrics
- Comparative class analysis

### Can I customize the grading scale?

**Yes!** Go to **Settings → Grading Scale**:

- Edit letter grades (A, B, C, D, F)
- Set score ranges (90-100 = A, etc.)
- Add custom remarks (Excellent, Pass, Fail, etc.)
- Save and apply to all grades

---

## Data & Backup

### Where is my data stored?

**Currently (Phase 2)**: Your device only (browser storage)

- Fast and private
- No internet required
- Data doesn't leave your device

**Coming (Phase 3)**: Cloud backup option

- Encrypted storage on Supabase
- Automatic sync
- Multi-device access

### How do I backup my data?

Go to **Settings → Backup & Recovery**:

1. Click **Export Backup**
2. Create a passphrase (to encrypt)
3. Download backup file (.gradeflow)
4. Store safely (cloud drive, external drive)

**To restore**: Upload backup file + enter passphrase. All your data returns!

### What if I forget my password?

**Phase 2**: Create new account with email (old account inaccessible)
**Phase 3**: Email recovery link → reset password

**Tip**: Export backup regularly so you have copy of data!

### Can I switch devices?

**Phase 2**: Must export from old device, import to new device
**Phase 3**: Login on new device → data syncs automatically

### Is my data private?

**Absolutely!**

- Data is never sold or shared
- Encrypted backup (AES-GCM)
- Per-email namespaced (even if you share computer, data is private)
- You control who sees what (role-based)

---

## Roles & Access

### Why can't my student edit grades?

By design! Students get read-only access to:

- Their own grades ✅
- Class average ✅
- Ranking ✅
- Attendance ✅

They can't:

- Edit grades ❌
- Delete other students ❌
- Change attendance ❌
- Export class data ❌

Only teachers can edit grades.

### What can parents see?

Parents log in and see:

- Their child's grades (all subjects)
- Child's average and ranking
- Attendance
- School announcements

Parents can't:

- Edit grades
- See other students' data
- Access teacher workspace

### How do I give students/parents access?

**Phase 2**: Share your login (not ideal, but works)
**Phase 3**: Generate unique student/parent login links

---

## Security & Privacy

### Is my password safe?

**Yes!** Passwords are:

- ✅ Hashed (never stored in plain text)
- ✅ Protected with automatic upgrade to stronger hash
- ✅ Throttled (max 5 attempts, then lockout)

**Never share your password!**

### How is session management handled?

- Session automatically logs you out after 15 minutes of inactivity
- Session expires after 12 hours maximum
- You can logout anytime
- Login again to access

### What about data privacy?

See [SECURITY.md](../SECURITY.md) and [Privacy Policy](../privacy-policy.html).

**TL;DR**:

- We don't sell your data
- Students data is confidential
- GDPR-compliant (Phase 3)
- You control data retention

---

## Technical Questions

### What browsers does GradeFlow work on?

- ✅ Chrome (latest)
- ✅ Safari (latest)
- ✅ Firefox (latest)
- ✅ Edge (latest)
- ✅ Mobile browsers (iOS, Android)

### Can I install GradeFlow as an app?

**Yes!** It's a Progressive Web App (PWA):

**Mobile**:

- iOS: Open in Safari → Share → Add to Home Screen
- Android: Open in Chrome → Menu → Install App

**Desktop**:

- Can install from browser (depends on OS)

Then use like any other app!

### How much storage does GradeFlow use?

- **App**: ~2 MB (downloaded once)
- **Data per 100 students**: ~1 MB (depends on materials)
- **Typical school**: 5-20 MB (depends on file uploads)

If running low on storage, remove old material files.

### Does GradeFlow sync data between devices?

**Phase 2**: Not yet (manual export/import)
**Phase 3**: Automatic sync when online

### Can I use GradeFlow on school WiFi?

**Yes!** GradeFlow works on:

- ✅ No internet (fully offline)
- ✅ Slow internet (works, just slower)
- ✅ Limited WiFi (public networks)
- ✅ Full internet

### What happens if I run out of storage space?

Delete old files:

- Class materials (if still accessible elsewhere)
- Old term snapshots (keep current term)
- Browser cache/cookies (refresh after clearing)

Then GradeFlow will work again.

---

## Troubleshooting

### My grades disappeared! What do I do?

1. **Check browser**: Different browser = different data
2. **Check account**: Logged into correct email?
3. **Clear cache**: Try refreshing page (Ctrl+F5)
4. **Restore backup**: Go to Settings → Import Backup
5. **Email support**: oshinayadamilola3@gmail.com (Phase 3)

### App won't load / blank page

1. **Refresh**: F5 or Ctrl+F5 (clear cache)
2. **Different browser**: Try Chrome/Safari instead
3. **Clear cookies**: Settings → Clear browsing data
4. **Check internet**: Open another website
5. **Reinstall**: Delete app, reinstall from gradeflow.app

### Grades look weird / calculations wrong

1. **Check scale**: Are test/prac/exam within correct ranges?
   - Test: 0-20
   - Practical: 0-20
   - Exam: 0-60
   - Total should be 0-100
2. **Clear cache & refresh**: F5 or Ctrl+F5
3. **Export & import**: Export backup, close app, import backup
4. **Email support**: Send screenshot to oshinayadamilola3@gmail.com

### Can't generate PDF / Export fails

1. **Check pop-ups**: Your browser might be blocking PDF
2. **Try different browser**: Try Chrome or Firefox
3. **Check file size**: If > 10 MB students, might be too large
4. **Try smaller export**: Export one class at a time
5. **Email support**: oshinayadamilola3@gmail.com

### Students can't access their grades

1. **Check login**: Are they using correct email?
2. **Check role**: Teacher should grant "student" role (Phase 3)
3. **Check link**: Send unique student link (Phase 3)
4. **Clear browser**: Delete cookies, try again
5. **Email support**: oshinayadamilola3@gmail.com

---

## Payments (Phase 3+)

### How much does GradeFlow cost?

**Coming Soon (Q3 2026)**:

- **Free Tier**: 1 class, 50 students
- **Pro Teacher**: ₦5,000/month (unlimited classes, cloud sync, AI)
- **School Plan**: ₦15,000/month per teacher (admin tools, approvals, audit)

### Can I cancel my subscription?

**Yes!** Cancel anytime:

1. Go to Settings → Subscription
2. Click "Cancel Subscription"
3. Downgrade to Free tier
4. No refunds for remaining month

### What happens after subscription expires?

- ✅ Your data stays safe
- ✅ Can export your data
- ❌ No cloud sync (downgrade to local-only)
- ❌ No premium features

Resubscribe anytime to restore access.

### Do you offer bulk discounts?

**Coming Soon** (Phase 4):

- School-wide pricing
- NGO/non-profit tier
- Multi-year discounts

Email: oshinayadamilola3@gmail.com

---

## Getting Help

### How do I report a bug?

1. **Document the issue**: Screenshot or video
2. **GitHub**: [Create issue in GitHub](https://github.com/gradeflow/gradeflow/issues)
3. **Email**: oshinayadamilola3@gmail.com
4. **Include**:
   - What you were doing
   - What happened (vs. expected)
   - Your browser/device
   - Steps to reproduce

### I have a feature request

1. **Check roadmap**: [ROADMAP.md](./ROADMAP.md)
2. **GitHub**: [Vote on existing ideas or add new](https://github.com/gradeflow/gradeflow/discussions)
3. **Email**: oshinayadamilola3@gmail.com

### I found a security issue

**DO NOT post publicly!**

→ Email: [oshinayadamilola3@gmail.com](../SECURITY.md)

---

## Still Have Questions?

- 📧 **Email**: oshinayadamilola3@gmail.com (response within 24-48 hours, Phase 3+)
- 💬 **Community**: GitHub Discussions
- 📚 **Documentation**: [docs/](../docs/)
- 🐛 **Report Bug**: [GitHub Issues](https://github.com/gradeflow/gradeflow/issues)
- 💡 **Feature Request**: [GitHub Discussions](https://github.com/gradeflow/gradeflow/discussions)

---

**Last Updated**: April 8, 2026  
**Next Review**: July 1, 2026 (Phase 3 launch, update with cloud features)
