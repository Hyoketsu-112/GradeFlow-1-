/* ============================================================
   REPORT CARD FUNCTIONALITY
   Generate, view, and export report cards with all subjects
   ============================================================ */

// == REPORT CARD INITIALIZATION ==
function initReportCard() {
  populateReportCardStudentSelect();
  populateSubjectsFilterSelect();
}

function populateReportCardStudentSelect() {
  const cls = classes.find((c) => c.id === activeClassId);
  const select = document.getElementById("reportCardStudentSelect");
  if (!select || !cls) return;

  const students = (allStudents[activeClassId] || []).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  select.innerHTML =
    '<option value="">-- Choose a student --</option>' +
    students
      .map(
        (s) =>
          `<option value="${s.id}">${s.name} ${s.pos ? `(${ordinal(s.pos)})` : ""}</option>`,
      )
      .join("");
}

function populateSubjectsFilterSelect() {
  const cls = classes.find((c) => c.id === activeClassId);
  const select = document.getElementById("subjectsFilterSelect");
  if (!select || !cls) return;

  select.innerHTML =
    '<option value="">Show all subjects</option>' +
    (cls.subjects || [])
      .map((s) => `<option value="${s.id}">${s.name}</option>`)
      .join("");
}

// == GENERATE REPORT CARD ==
window.generateReportCard = function () {
  const cls = classes.find((c) => c.id === activeClassId);
  const studentId = document.getElementById("reportCardStudentSelect").value;
  const term =
    document.getElementById("reportCardTerm").value || "Current Term";

  if (!cls || !studentId) {
    showToast("Please select a student", "error");
    return;
  }

  const student = (allStudents[activeClassId] || []).find(
    (s) => s.id === studentId,
  );
  if (!student) {
    showToast("Student not found", "error");
    return;
  }

  const preview = document.getElementById("reportCardPreview");
  if (!preview) return;

  // Calculate overall average
  let totalScore = 0,
    totalCount = 0;
  student.subjects.forEach((sub) => {
    const comp = computeSubject(sub);
    if (comp.total !== null) {
      totalScore += comp.total;
      totalCount++;
    }
  });
  const overallAvg =
    totalCount > 0 ? Math.round(totalScore / totalCount) : null;
  const overallGrade = gradeResult(overallAvg);

  // Build subject rows
  const subjectRows = student.subjects
    .map((sub) => {
      const comp = computeSubject(sub);
      const gr = gradeResult(comp.total);
      const gradeClass = `grade-${gr.g.toLowerCase()}`;
      return `
        <tr>
          <td class="report-card-table-subject">${esc(sub.name)}</td>
          <td class="report-card-table-number">${sub.test ?? "—"}</td>
          <td class="report-card-table-number">${sub.prac ?? "—"}</td>
          <td class="report-card-table-number">${sub.exam === "" ? "—" : sub.exam}</td>
          <td class="report-card-table-number"><strong>${comp.total ?? "—"}</strong></td>
          <td class="report-card-table-grade ${gradeClass}">${gr.g}</td>
          <td style="text-align:center;font-size:0.85rem;">${gr.r}</td>
        </tr>
      `;
    })
    .join("");

  // Calculate class average for this subject (if applicable)
  let classAvg = 0;
  const classStudents = allStudents[activeClassId] || [];
  if (classStudents.length > 0) {
    let sum = 0,
      count = 0;
    classStudents.forEach((s) => {
      const totalScore = s.subjects.reduce((a, sub) => {
        const c = computeSubject(sub);
        return a + (c.total !== null ? c.total : 0);
      }, 0);
      const avgScore =
        s.subjects.length > 0 ? totalScore / s.subjects.length : 0;
      if (avgScore > 0) {
        sum += avgScore;
        count++;
      }
    });
    classAvg = count > 0 ? Math.round(sum / count) : 0;
  }

  const ini = initials(student.name);
  const schoolName = currentUser?.org || "Your School";
  const teacherName = currentUser?.name || "School Administrator";

  const html = `
    <div class="report-card-container">
      <!-- Header -->
      <div class="report-card-header">
        <div class="report-card-school-name">${esc(schoolName)}</div>
        <div class="report-card-term">Academic Report Card • ${esc(term)}</div>
        <div class="report-card-divider"></div>
      </div>

      <!-- Student Info -->
      <div class="report-card-student-info">
        <div class="report-card-avatar">${ini}</div>
        <div class="report-card-student-details">
          <div class="report-card-student-row">
            <span class="report-card-student-label">Student Name</span>
            <span class="report-card-student-value">${esc(student.name)}</span>
          </div>
          <div class="report-card-student-row">
            <span class="report-card-student-label">Class/Grade</span>
            <span class="report-card-student-value">${esc(cls.name)}</span>
          </div>
          <div class="report-card-student-row">
            <span class="report-card-student-label">Student ID</span>
            <span class="report-card-student-value">${student.id}</span>
          </div>
          <div class="report-card-student-row">
            <span class="report-card-student-label">Report Date</span>
            <span class="report-card-student-value">${new Date().toLocaleDateString("en-GB")}</span>
          </div>
        </div>
        <div class="report-card-summary">
          <div class="report-card-summary-item">
            <span class="report-card-summary-label">Overall Average</span>
            <span class="report-card-summary-value">${overallAvg ?? "—"}${overallAvg !== null ? "%" : ""}</span>
          </div>
          <div class="report-card-summary-item">
            <span class="report-card-summary-label">Grade</span>
            <span class="report-card-summary-value">${overallGrade.g}</span>
          </div>
          <div class="report-card-summary-item">
            <span class="report-card-summary-label">Class Position</span>
            <span class="report-card-summary-value">${student.pos ? ordinal(student.pos) : "—"}</span>
          </div>
        </div>
      </div>

      <!-- Subject Grades Table -->
      <div class="report-card-table-wrapper">
        <table class="report-card-table">
          <thead>
            <tr>
              <th>Subject</th>
              <th>Test (20)</th>
              <th>Practical (20)</th>
              <th>Exam (60)</th>
              <th>Total (100)</th>
              <th>Grade</th>
              <th>Remark</th>
            </tr>
          </thead>
          <tbody>
            ${subjectRows}
          </tbody>
        </table>
      </div>

      <!-- Remarks Section -->
      <div class="report-card-remarks">
        <div class="report-card-remarks-title">
          <i class="bi bi-chat-quote"></i> Teacher's Remarks
        </div>
        <div class="report-card-remarks-text">
          ${overallGrade.r} • Class Average: ${classAvg}% • Overall Performance: ${
            overallAvg >= 70
              ? "Excellent"
              : overallAvg >= 60
                ? "Good"
                : overallAvg >= 50
                  ? "Fair"
                  : "Needs Improvement"
          }
        </div>
      </div>

      <!-- Signature Lines -->
      <div class="report-card-footer">
        <div class="report-card-signature-line">
          <div style="height:40px;"></div>
          <div class="report-card-signature-label">Teacher's Signature</div>
        </div>
        <div class="report-card-signature-line">
          <div style="height:40px;"></div>
          <div class="report-card-signature-label">Principal's Signature</div>
        </div>
        <div class="report-card-signature-line">
          <div style="height:40px;"></div>
          <div class="report-card-signature-label">Parent/Guardian</div>
        </div>
      </div>
    </div>
  `;

  preview.innerHTML = html;
  showToast("✅ Report card generated", "success");
};

window.updateReportCardPreview = function () {
  // Automatically regenerate when student changes
  generateReportCard();
};

// == PRINT REPORT CARD ==
window.printReportCard = function () {
  const preview = document.getElementById("reportCardPreview");
  if (!preview || !preview.innerHTML) {
    showToast("Please generate a report card first", "error");
    return;
  }
  window.print();
};

// == DOWNLOAD REPORT CARD AS PDF ==
window.downloadReportCardPDF = async function () {
  const studentId = document.getElementById("reportCardStudentSelect").value;
  if (!studentId) {
    showToast("Please select a student", "error");
    return;
  }

  const student = (allStudents[activeClassId] || []).find(
    (s) => s.id === studentId,
  );
  if (!student) return;

  try {
    // Get the container
    const element = document.getElementById("reportCardPreview");
    if (!element || !element.innerHTML) {
      showToast("Please generate report card first", "error");
      return;
    }

    // Use html2canvas to capture the report card
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
      allowTaint: true,
    });

    if (!canvas) {
      showToast("Error: Failed to render PDF. Please try again.", "error");
      return;
    }

    // Create PDF from canvas
    const { jsPDF } = window;
    if (!jsPDF) {
      showToast("Error: PDF library not loaded. Please refresh.", "error");
      return;
    }
    
    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const imgData = canvas.toDataURL("image/png");
    const pageHeight = pdf.internal.pageSize.getHeight();
    const pageWidth = pdf.internal.pageSize.getWidth();
    const ratio = pageWidth / canvas.width;
    const imgHeight = canvas.height * ratio;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, pageWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    pdf.save(`${student.name}-ReportCard.pdf`);
    showToast("✅ Report card downloaded", "success");
  } catch (err) {
    console.error("PDF generation error:", err);
    showToast("Error generating PDF: " + (err.message || "Check console for details"), "error");
  }
};

// == ALL SUBJECTS VIEW ==
window.updateAllSubjectsView = function () {
  const cls = classes.find((c) => c.id === activeClassId);
  const filterSubjectId = document.getElementById("subjectsFilterSelect").value;
  const grid = document.getElementById("allSubjectsGrid");

  if (!cls || !grid) return;

  const students = allStudents[activeClassId] || [];
  let subjectsData = {};

  // Collect data for each subject
  (cls.subjects || []).forEach((subject) => {
    if (filterSubjectId && subject.id !== filterSubjectId) return;

    const scores = [];
    students.forEach((student) => {
      const sub = student.subjects.find((s) => s.id === subject.id);
      if (sub) {
        const comp = computeSubject(sub);
        if (comp.total !== null) {
          scores.push(comp.total);
        }
      }
    });

    if (scores.length > 0) {
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      const minScore = Math.min(...scores);
      const maxScore = Math.max(...scores);
      subjectsData[subject.id] = {
        name: subject.name,
        average: avg,
        minScore,
        maxScore,
        count: scores.length,
        grade: gradeResult(avg),
      };
    }
  });

  if (Object.keys(subjectsData).length === 0) {
    grid.innerHTML = `
      <div class="report-card-empty" style="grid-column: 1/-1;">
        <div class="report-card-empty-icon">📋</div>
        <div class="report-card-empty-title">No Subject Data</div>
        <div class="report-card-empty-text">No grades recorded yet for this subject</div>
      </div>
    `;
    return;
  }

  const html = Object.entries(subjectsData)
    .map(
      ([subId, data]) => `
    <div class="subject-card-full">
      <div class="subject-card-full-icon">📖</div>
      <div class="subject-card-full-name">${esc(data.name)}</div>
      <div class="subject-card-full-score">${data.average}%</div>
      <div class="subject-card-full-grade ${`grade-${data.grade.g.toLowerCase()}`}">${data.grade.g}</div>
      <div class="subject-card-full-remark">${data.grade.r}</div>
      <div class="subject-card-full-details">
        <div class="subject-card-full-detail-item">
          <span class="subject-card-full-detail-label">Avg</span>
          <span class="subject-card-full-detail-value">${data.average}</span>
        </div>
        <div class="subject-card-full-detail-item">
          <span class="subject-card-full-detail-label">Low</span>
          <span class="subject-card-full-detail-value">${data.minScore}</span>
        </div>
        <div class="subject-card-full-detail-item">
          <span class="subject-card-full-detail-label">High</span>
          <span class="subject-card-full-detail-value">${data.maxScore}</span>
        </div>
      </div>
      <div class="subject-card-full-details" style="margin-top: 0.8rem;">
        <span style="grid-column: 1/-1; font-size: 0.78rem; color: var(--muted);">
          ${data.count} students assessed
        </span>
      </div>
    </div>
  `,
    )
    .join("");

  grid.innerHTML = html;
};

// == SIDEBAR NAVIGATION UPDATES ==
// These functions should be called from the main script.js when the active view changes
function updateReportCardView() {
  const cls = classes.find((c) => c.id === activeClassId);
  if (cls) {
    const el = document.getElementById("reportCardClassName");
    if (el) el.textContent = `📚 ${cls.name}`;
  }
  populateReportCardStudentSelect();
  initReportCard();
}

function updateAllSubjectsView_init() {
  const cls = classes.find((c) => c.id === activeClassId);
  if (cls) {
    const el = document.getElementById("allSubjectsClassName");
    if (el) el.textContent = `📚 ${cls.name}`;
  }
  populateSubjectsFilterSelect();
  updateAllSubjectsView();
}

// == HELPER: SHOW VIEW ==
// Add these lines to the showView() function in script.js:
// if (name === "report-card") updateReportCardView();
// if (name === "all-subjects") updateAllSubjectsView_init();
