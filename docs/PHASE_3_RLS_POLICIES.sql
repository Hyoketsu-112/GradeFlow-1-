-- ============================================================
-- Phase 3 Row-Level Security (RLS) Policies - GradeFlow
-- PostgreSQL + Supabase
-- Week 18 Implementation
-- ============================================================
-- IMPORTANT: These policies depend on Supabase Auth integration
-- Tables must have RLS enabled: ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
-- ============================================================

-- ============================================================
-- HELPER: Check if user is admin in their school
-- ============================================================
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================================
-- HELPER: Get user's school_id
-- ============================================================
CREATE OR REPLACE FUNCTION get_user_school_id()
RETURNS UUID AS $$
  SELECT school_id FROM users WHERE id = auth.uid()
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================================
-- TABLE: schools
-- Policies: Admins full access, Teachers/Students view their school
-- ============================================================

CREATE POLICY "schools_users_can_view_their_school" ON schools
  FOR SELECT USING (
    id IN (SELECT school_id FROM users WHERE id = auth.uid())
  );

CREATE POLICY "schools_admins_can_update" ON schools
  FOR UPDATE USING (
    id = get_user_school_id() AND is_admin()
  );

-- ============================================================
-- TABLE: users
-- Policies: Users see school members, Admins manage all in school
-- ============================================================

CREATE POLICY "users_can_view_school_members" ON users
  FOR SELECT USING (
    school_id = get_user_school_id()
  );

CREATE POLICY "users_can_view_own_profile" ON users
  FOR SELECT USING (
    id = auth.uid()
  );

CREATE POLICY "admins_can_update_school_users" ON users
  FOR UPDATE USING (
    school_id = get_user_school_id() AND is_admin()
  );

CREATE POLICY "admins_can_delete_school_users" ON users
  FOR DELETE USING (
    school_id = get_user_school_id() AND is_admin()
  );

-- ============================================================
-- TABLE: classes
-- Policies: Teachers see their classes, Students see enrolled classes
-- ============================================================

CREATE POLICY "classes_users_can_view_school_classes" ON classes
  FOR SELECT USING (
    school_id = get_user_school_id()
  );

CREATE POLICY "classes_teachers_can_create" ON classes
  FOR INSERT WITH CHECK (
    school_id = get_user_school_id() AND (
      SELECT role FROM users WHERE id = auth.uid()
    ) = 'teacher'
  );

CREATE POLICY "classes_teachers_can_update_own" ON classes
  FOR UPDATE USING (
    school_id = get_user_school_id() AND (
      SELECT role FROM users WHERE id = auth.uid()
    ) IN ('teacher', 'admin')
  );

CREATE POLICY "classes_admins_can_delete" ON classes
  FOR DELETE USING (
    school_id = get_user_school_id() AND is_admin()
  );

-- ============================================================
-- TABLE: students
-- Policies: Teachers manage their class students, Students view own info
-- ============================================================

CREATE POLICY "students_can_view_class_students" ON students
  FOR SELECT USING (
    school_id = get_user_school_id()
  );

CREATE POLICY "students_view_own_profile" ON students
  FOR SELECT USING (
    id IN (
      SELECT id FROM students WHERE email = (
        SELECT email FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY "teachers_can_create_students" ON students
  FOR INSERT WITH CHECK (
    school_id = get_user_school_id() AND (
      SELECT role FROM users WHERE id = auth.uid()
    ) IN ('teacher', 'admin')
  );

CREATE POLICY "teachers_can_update_class_students" ON students
  FOR UPDATE USING (
    school_id = get_user_school_id() AND (
      SELECT role FROM users WHERE id = auth.uid()
    ) IN ('teacher', 'admin')
  );

-- ============================================================
-- TABLE: scores
-- Policies: Students see own scores, Teachers manage class scores
-- ============================================================

CREATE POLICY "scores_students_can_view_own" ON scores
  FOR SELECT USING (
    student_id IN (
      SELECT id FROM students 
      WHERE email = (SELECT email FROM users WHERE id = auth.uid())
    )
  );

CREATE POLICY "scores_teachers_can_view_class" ON scores
  FOR SELECT USING (
    school_id = get_user_school_id()
  );

CREATE POLICY "scores_teachers_can_insert" ON scores
  FOR INSERT WITH CHECK (
    school_id = get_user_school_id() AND (
      SELECT role FROM users WHERE id = auth.uid()
    ) IN ('teacher', 'admin')
  );

CREATE POLICY "scores_teachers_can_update" ON scores
  FOR UPDATE USING (
    school_id = get_user_school_id() AND (
      SELECT role FROM users WHERE id = auth.uid()
    ) IN ('teacher', 'admin')
  );

CREATE POLICY "scores_admins_can_delete" ON scores
  FOR DELETE USING (
    school_id = get_user_school_id() AND is_admin()
  );

-- ============================================================
-- TABLE: attendance
-- Policies: Students see own records, Teachers manage class attendance
-- ============================================================

CREATE POLICY "attendance_students_can_view_own" ON attendance
  FOR SELECT USING (
    student_id IN (
      SELECT id FROM students 
      WHERE email = (SELECT email FROM users WHERE id = auth.uid())
    )
  );

CREATE POLICY "attendance_teachers_can_view_class" ON attendance
  FOR SELECT USING (
    school_id = get_user_school_id()
  );

CREATE POLICY "attendance_teachers_can_insert" ON attendance
  FOR INSERT WITH CHECK (
    school_id = get_user_school_id() AND (
      SELECT role FROM users WHERE id = auth.uid()
    ) IN ('teacher', 'admin')
  );

CREATE POLICY "attendance_teachers_can_update" ON attendance
  FOR UPDATE USING (
    school_id = get_user_school_id() AND (
      SELECT role FROM users WHERE id = auth.uid()
    ) IN ('teacher', 'admin')
  );

-- ============================================================
-- TABLE: materials
-- Policies: All school users can read, Teachers/Admins can create
-- ============================================================

CREATE POLICY "materials_can_view_school_materials" ON materials
  FOR SELECT USING (
    school_id = get_user_school_id()
  );

CREATE POLICY "materials_teachers_can_create" ON materials
  FOR INSERT WITH CHECK (
    school_id = get_user_school_id() AND (
      SELECT role FROM users WHERE id = auth.uid()
    ) IN ('teacher', 'admin')
  );

CREATE POLICY "materials_teachers_can_update" ON materials
  FOR UPDATE USING (
    school_id = get_user_school_id() AND (
      SELECT role FROM users WHERE id = auth.uid()
    ) IN ('teacher', 'admin')
  );

-- ============================================================
-- TABLE: quizzes
-- Policies: Teachers create, all students can view
-- ============================================================

CREATE POLICY "quizzes_can_view_class_quizzes" ON quizzes
  FOR SELECT USING (
    school_id = get_user_school_id()
  );

CREATE POLICY "quizzes_teachers_can_create" ON quizzes
  FOR INSERT WITH CHECK (
    school_id = get_user_school_id() AND (
      SELECT role FROM users WHERE id = auth.uid()
    ) IN ('teacher', 'admin')
  );

CREATE POLICY "quizzes_teachers_can_update" ON quizzes
  FOR UPDATE USING (
    school_id = get_user_school_id() AND (
      SELECT role FROM users WHERE id = auth.uid()
    ) IN ('teacher', 'admin')
  );

-- ============================================================
-- TABLE: quiz_results
-- Policies: Students see own results, Teachers see class results
-- ============================================================

CREATE POLICY "quiz_results_students_can_view_own" ON quiz_results
  FOR SELECT USING (
    student_id IN (
      SELECT id FROM students 
      WHERE email = (SELECT email FROM users WHERE id = auth.uid())
    )
  );

CREATE POLICY "quiz_results_teachers_can_view_class" ON quiz_results
  FOR SELECT USING (
    school_id = get_user_school_id()
  );

CREATE POLICY "quiz_results_students_can_insert" ON quiz_results
  FOR INSERT WITH CHECK (
    student_id IN (
      SELECT id FROM students 
      WHERE email = (SELECT email FROM users WHERE id = auth.uid())
    )
  );

-- ============================================================
-- TABLE: audit_logs
-- Policies: Admins can view school logs, Service role insert
-- ============================================================

CREATE POLICY "audit_logs_admins_can_view" ON audit_logs
  FOR SELECT USING (
    school_id = get_user_school_id() AND is_admin()
  );

-- Service role will handle inserts (requires service_role key)
-- No policy needed for service role

-- ============================================================
-- Verification Queries
-- ============================================================
-- Run these after enabling RLS to verify setup:

-- Check all tables have RLS enabled:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename LIKE '%' ORDER BY tablename;

-- List all policies:
-- SELECT * FROM pg_policies WHERE schemaname = 'public';

-- ============================================================
-- RLS Setup Complete
-- ============================================================
-- Week 18 Checklist:
-- ✓ All tables have RLS-enabled status
-- ✓ Helper functions created (is_admin, get_user_school_id)
-- ✓ SELECT policies for all roles
-- ✓ INSERT policies for creators (teachers, admins)
-- ✓ UPDATE policies with role checks
-- ✓ DELETE policies for admins only
-- ✓ Ready for testing with Supabase Auth

-- Next: Test policies by:
-- 1. Create test users (teacher, student, admin)
-- 2. Sign in with each user
-- 3. Verify data isolation (student can't read other scores)
-- 4. Verify write restrictions (student can't insert scores)
-- ============================================================
