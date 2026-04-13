# 🗄️ Phase 3 Database Schema (Weeks 17-18)

**Status**: 📋 Design Phase  
**Timeline**: Week 17-18 of Phase 3  
**Owner**: Database/Backend Team  

---

## 📐 Schema Overview

```
schools (1)
├── users (many)
├── classes (many)
│   ├── students (many)
│   │   ├── scores (many)
│   │   └── attendance (many)
│   ├── materials (many)
│   └── quizzes (many)
└── audit_logs (many)
```

---

## 🔑 Core Tables

### `users`
User accounts (teachers, students, parents, admins)

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Auth
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  
  -- Profile
  name VARCHAR(255) NOT NULL,
  organization VARCHAR(255),
  role VARCHAR(50) NOT NULL, -- 'teacher', 'student', 'parent', 'admin'
  
  -- Relationships
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  
  CONSTRAINT valid_role CHECK (role IN ('teacher', 'student', 'parent', 'admin'))
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_school_id ON users(school_id);
```

---

### `schools`
School organizations and settings

```sql
CREATE TABLE schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Info
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) UNIQUE,
  location VARCHAR(255),
  
  -- Settings
  grading_scale JSONB DEFAULT '[]'::jsonb, -- [{g: "A", min: 70, r: "Excellent"}, ...]
  settings JSONB DEFAULT '{}'::jsonb, -- {term: "T1", session: "2025/2026", ...}
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT name_not_empty CHECK (name != '')
);

CREATE INDEX idx_schools_code ON schools(code);
```

---

### `classes`
Classes/Forms within a school

```sql
CREATE TABLE classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relationship
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  
  -- Info
  name VARCHAR(100) NOT NULL, -- e.g., "JSS1A", "SS2B"
  emoji VARCHAR(10),
  description TEXT,
  
  -- Subjects (stored as JSONB array for flexibility)
  subjects JSONB DEFAULT '[]'::jsonb,
  -- Format: [{ id: "subject_1", name: "Mathematics" }, ...]
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT name_not_empty CHECK (name != '')
);

CREATE INDEX idx_classes_school_id ON classes(school_id);
CREATE INDEX idx_classes_name ON classes(name);
```

---

### `students`
Student records

```sql
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relationships
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  
  -- Info
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  enrollment_number VARCHAR(50),
  
  -- Metadata
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT name_not_empty CHECK (name != '')
);

CREATE INDEX idx_students_class_id ON students(class_id);
CREATE INDEX idx_students_school_id ON students(school_id);
CREATE INDEX idx_students_email ON students(email);
```

---

### `scores`
Student scores (Test, Practical, Exam)

```sql
CREATE TABLE scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relationships
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  
  -- Score components
  subject_id VARCHAR(100) NOT NULL,
  subject_name VARCHAR(255) NOT NULL,
  test NUMERIC(3,1) DEFAULT NULL, -- 0-20
  practical NUMERIC(3,1) DEFAULT NULL, -- 0-20
  exam NUMERIC(3,1) DEFAULT NULL, -- 0-60
  
  -- Computed fields
  total NUMERIC(3,1) GENERATED ALWAYS AS (COALESCE(test, 0) + COALESCE(practical, 0) + COALESCE(exam, 0)) STORED,
  
  -- Metadata
  term VARCHAR(50),
  session VARCHAR(50),
  recorded_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT test_range CHECK (test >= 0 AND test <= 20),
  CONSTRAINT practical_range CHECK (practical >= 0 AND practical <= 20),
  CONSTRAINT exam_range CHECK (exam >= 0 AND exam <= 60)
);

CREATE INDEX idx_scores_student_id ON scores(student_id);
CREATE INDEX idx_scores_subject_id ON scores(subject_id);
CREATE INDEX idx_scores_class_id ON scores(class_id);
```

---

### `attendance`
Attendance records (Present/Absent/Late)

```sql
CREATE TABLE attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relationships
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  
  -- Record
  date DATE NOT NULL,
  status VARCHAR(20) NOT NULL, -- 'P' (present), 'A' (absent), 'L' (late)
  notes TEXT,
  
  -- Metadata
  recorded_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT valid_status CHECK (status IN ('P', 'A', 'L')),
  CONSTRAINT unique_attendance UNIQUE(student_id, class_id, date)
);

CREATE INDEX idx_attendance_student_id ON attendance(student_id);
CREATE INDEX idx_attendance_class_id ON attendance(class_id);
CREATE INDEX idx_attendance_date ON attendance(date);
```

---

### `materials`
Class teaching materials/resources

```sql
CREATE TABLE materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relationships
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  
  -- Content
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(50), -- 'pdf', 'image', 'word', 'html', 'video', 'other'
  file_url VARCHAR(500), -- URL to cloud storage (Phase 3.5)
  size_kb INTEGER, -- File size
  
  -- Metadata
  uploaded_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT title_not_empty CHECK (title != '')
);

CREATE INDEX idx_materials_class_id ON materials(class_id);
```

---

### `quizzes`
CBT Quizzes and assessments

```sql
CREATE TABLE quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relationships
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  
  -- Content
  title VARCHAR(255) NOT NULL,
  description TEXT,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Format: [{ id, text, options: [{text, isCorrect}, ...], answer }]
  
  -- Settings
  duration_minutes INTEGER DEFAULT 30,
  passing_score NUMERIC(3,1) DEFAULT 50,
  
  -- Metadata
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT title_not_empty CHECK (title != '')
);

CREATE INDEX idx_quizzes_class_id ON quizzes(class_id);
```

---

### `quiz_results`
Student quiz attempts and scores

```sql
CREATE TABLE quiz_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relationships
  quiz_id UUID NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  
  -- Results
  score NUMERIC(3,1) NOT NULL,
  total NUMERIC(3,1) NOT NULL,
  percentage NUMERIC(5,2) GENERATED ALWAYS AS ((score / total) * 100) STORED,
  duration_seconds INTEGER,
  
  -- Metadata
  attempt_number INTEGER DEFAULT 1,
  completed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT score_range CHECK (score >= 0 AND score <= total)
);

CREATE INDEX idx_quiz_results_student_id ON quiz_results(student_id);
CREATE INDEX idx_quiz_results_quiz_id ON quiz_results(quiz_id);
```

---

### `audit_logs`
Activity audit trail for compliance and debugging

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relationships
  school_id UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- Action details
  action VARCHAR(100) NOT NULL, -- 'create', 'update', 'delete', 'view', 'export'
  resource_type VARCHAR(100) NOT NULL, -- 'score', 'attendance', 'student', etc.
  resource_id VARCHAR(255),
  
  -- Changes
  old_value JSONB,
  new_value JSONB,
  
  -- Metadata
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT action_not_empty CHECK (action != '')
);

CREATE INDEX idx_audit_logs_school_id ON audit_logs(school_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
```

---

## 🔒 Row-Level Security (RLS) Policies

### Teachers
- Can read/write their own school data
- Can only see classes they teach
- Cannot access other teachers' data

```sql
-- Teachers can only see their school
CREATE POLICY teacher_school_isolation ON classes
  FOR SELECT USING (auth.uid() IN (
    SELECT id FROM users 
    WHERE school_id = classes.school_id AND role = 'teacher'
  ));
```

### Students
- Can only see their own scores/attendance
- Can see class average but not other students' data

```sql
-- Students can only see their own scores
CREATE POLICY student_score_isolation ON scores
  FOR SELECT USING (auth.uid() IN (
    SELECT user_id FROM students 
    WHERE id = scores.student_id
  ));
```

### Admins
- Full access to their school data
- Can see activity logs

```sql
-- Admins can see everything in their school
CREATE POLICY admin_full_access ON classes
  FOR ALL USING (auth.uid() IN (
    SELECT id FROM users 
    WHERE school_id = classes.school_id AND role = 'admin'
  ));
```

---

## 🚀 Week 17-18 Checklist

- [ ] Create Supabase project
- [ ] Run SQL schema creation scripts
- [ ] Enable RLS policies
- [ ] Create service role for migrations
- [ ] Set up backups
- [ ] Test schema with sample data
- [ ] Document table relationships
- [ ] Create indexes for performance
- [ ] Test RLS policies
- [ ] Prepare migration tool

---

## 📚 References

- [Supabase SQL Editor](https://supabase.com/docs/guides/database/overview)
- [PostgreSQL Docs](https://www.postgresql.org/docs/)
- [Row-Level Security](https://supabase.com/docs/guides/auth/row-level-security)

**Status**: 📋 Ready for implementation  
**Owner**: Database Team  
**Last Updated**: April 13, 2026
