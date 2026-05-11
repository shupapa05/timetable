import {
  optimizeDedicatedAssignments,
  normalizeOptimizerSettings,
  normalizePlanningTeachers,
  normalizeSubjectPools,
  normalizeTeacherAssignments,
  flattenPlanningTeachers
} from './timetable-optimizer.js';

const SUBJECT_OPTIONS = ['', '국어', '도덕', '사회', '수학', '과학', '실과', '체육', '음악', '미술', '영어', '바른 생활', '슬기로운 생활', '즐거운 생활', '창의적 체험활동', '기타'];

let optimizerResult = null;
let currentConfig = null;
let optimizerSettings = null;

window.addEventListener('DOMContentLoaded', async () => {
  bindOptimizerEvents();
  await loadOptimizerConfig();
});

function bindOptimizerEvents() {
  document.getElementById('optimizerRefreshBtn')?.addEventListener('click', loadOptimizerConfig);
  document.getElementById('optimizerRunBtn')?.addEventListener('click', runOptimizer);
  document.getElementById('optimizerApplyBtn')?.addEventListener('click', applyOptimizerResult);
}

async function loadOptimizerConfig() {
  currentConfig = await window.desktopApi.loadConfig();
  optimizerSettings = normalizeOptimizerSettings(currentConfig || {});
  renderOptimizerBaseSetup();
  renderOptimizerSetup();
}

function normalizeSubjectPoolsForUI(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const rawGradeHours = item.gradeHours || item.hours || {};
    const gradeHours = {};

    for (let grade = 1; grade <= 6; grade += 1) {
      const hour = Number(rawGradeHours[grade] ?? rawGradeHours[String(grade)] ?? 0);
      if (hour > 0) gradeHours[grade] = hour;
    }

    if (!Object.keys(gradeHours).length && Array.isArray(item.grades)) {
      item.grades.map(Number).filter((grade) => grade >= 1 && grade <= 6).forEach((grade) => {
        gradeHours[grade] = 1;
      });
    }

    return {
      subject: String(item.subject || '').trim(),
      gradeHours,
      grades: Object.keys(gradeHours).map(Number).sort((a, b) => a - b)
    };
  });
}

function renderOptimizerBaseSetup() {
  const area = document.getElementById('optimizerBaseArea');
  if (!area) return;

  const subjectPools = normalizeSubjectPoolsForUI(optimizerSettings?.subjectPools || []);
  const validSubjectCount = normalizeSubjectPools(subjectPools).length;
  const teacherCount = Number(optimizerSettings?.teacherCount || 0);

  area.innerHTML = `
    <div class="optimizer-summary">
      <label class="optimizer-card">
        <span>전담 수</span>
        <strong><input id="baseTeacherCount" type="number" min="0" value="${teacherCount}" class="optimizer-target-input"></strong>
      </label>
      <div class="optimizer-card"><span>전담 과목 수</span><strong>${validSubjectCount}개</strong></div>
    </div>
    <div class="optimizer-help">과목별로 학년별 주당 시수를 입력합니다. 빈칸 또는 0은 해당 학년 배정 제외로 처리됩니다.</div>
    <table class="optimizer-table">
      <thead>
        <tr>
          <th>과목</th>
          <th>1학년</th>
          <th>2학년</th>
          <th>3학년</th>
          <th>4학년</th>
          <th>5학년</th>
          <th>6학년</th>
          <th>관리</th>
        </tr>
      </thead>
      <tbody id="subjectPoolRows">${subjectPools.map((pool, index) => makeSubjectPoolRow(pool, index)).join('')}</tbody>
    </table>
    <div class="optimizer-actions optimizer-inline-actions">
      <button id="addSubjectPoolBtn" type="button">+ 전담 과목 추가</button>
      <button id="saveOptimizerBaseBtn" type="button" class="primary">전담 기본 조건 저장</button>
    </div>
  `;

  document.getElementById('addSubjectPoolBtn')?.addEventListener('click', () => {
    const next = collectBaseSettingsFromUI({ keepEmpty: true });
    next.subjectPools.push({ subject: '', gradeHours: {}, grades: [] });
    optimizerSettings = next;
    renderOptimizerBaseSetup();
  });

  document.getElementById('saveOptimizerBaseBtn')?.addEventListener('click', saveOptimizerBaseSettings);

  area.querySelectorAll('[data-remove-subject-index]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.removeSubjectIndex || 0);
      const next = collectBaseSettingsFromUI({ keepEmpty: true });
      next.subjectPools.splice(index, 1);
      optimizerSettings = next;
      renderOptimizerBaseSetup();
    });
  });
}

function makeSubjectPoolRow(pool, index) {
  const gradeHours = pool.gradeHours || {};

  return `
    <tr>
      <td>
        <select class="optimizer-text-input" data-base-field="subject" data-subject-index="${index}">
          ${SUBJECT_OPTIONS.map((subject) => `<option value="${escapeAttr(subject)}" ${subject === (pool.subject || '') ? 'selected' : ''}>${subject || '선택'}</option>`).join('')}
        </select>
      </td>
      ${[1, 2, 3, 4, 5, 6].map((grade) => `
        <td>
          <input
            class="optimizer-target-input"
            type="number"
            min="0"
            step="1"
            data-base-field="gradeHours"
            data-subject-index="${index}"
            data-grade="${grade}"
            value="${Number(gradeHours[grade] || gradeHours[String(grade)] || 0) || ''}"
            placeholder="-">
        </td>
      `).join('')}
      <td><button type="button" data-remove-subject-index="${index}">삭제</button></td>
    </tr>
  `;
}

function collectBaseSettingsFromUI(options = {}) {
  const teacherCount = Number(document.getElementById('baseTeacherCount')?.value || optimizerSettings?.teacherCount || 0);
  const rows = Array.from(document.querySelectorAll('#subjectPoolRows tr'));

  const rawSubjectPools = rows.map((row, index) => {
    const gradeHours = {};

    row.querySelectorAll(`[data-base-field="gradeHours"][data-subject-index="${index}"]`).forEach((input) => {
      const grade = Number(input.dataset.grade || 0);
      const hour = Number(input.value || 0);
      if (grade >= 1 && grade <= 6 && hour > 0) {
        gradeHours[grade] = hour;
      }
    });

    return {
      subject: row.querySelector(`[data-base-field="subject"][data-subject-index="${index}"]`)?.value || '',
      gradeHours,
      grades: Object.keys(gradeHours).map(Number).sort((a, b) => a - b)
    };
  });

  const subjectPools = options.keepEmpty ? rawSubjectPools : normalizeSubjectPools(rawSubjectPools);
  const normalizedSubjectPools = normalizeSubjectPools(subjectPools);

  return {
    ...(optimizerSettings || {}),
    teacherCount,
    subjectPools,
    totalDedicatedHours: calculateSchoolTotalHours(normalizedSubjectPools) || optimizerSettings?.totalDedicatedHours || 0,
    planningTeachers: normalizePlanningTeachers(optimizerSettings?.planningTeachers || [], teacherCount, normalizedSubjectPools)
  };
}

async function saveOptimizerBaseSettings() {
  optimizerSettings = collectBaseSettingsFromUI({ keepEmpty: false });
  currentConfig = currentConfig || {};
  currentConfig.optimizer = { ...(currentConfig.optimizer || {}), ...optimizerSettings };
  await window.desktopApi.saveConfig(currentConfig);
  renderOptimizerBaseSetup();
  renderOptimizerSetup();
  alert('전담 기본 조건을 저장했습니다.');
}\n
function renderOptimizerSetup() {
  const area = document.getElementById('optimizerArea');
  if (!area) return;

  const teacherCount = Number(optimizerSettings?.teacherCount || 0);
  const subjectPools = normalizeSubjectPools(optimizerSettings?.subjectPools || []);
  const planningTeachers = normalizePlanningTeachers(optimizerSettings?.planningTeachers || [], teacherCount, subjectPools);
  optimizerSettings.planningTeachers = planningTeachers;

  if (!teacherCount) {
    area.innerHTML = '<div class="optimizer-empty">학교 설정에서 전담 수를 먼저 입력하세요.</div>';
    return;
  }

  area.innerHTML = `
    <div class="optimizer-summary">
      <div class="optimizer-card"><span>전담 수</span><strong>${teacherCount}명</strong></div>
      <div class="optimizer-card"><span>배정 과목</span><strong>${flattenPlanningTeachers(planningTeachers).length}개</strong></div>
      <div class="optimizer-card"><span>고정 시수 입력</span><strong>${flattenPlanningTeachers(planningTeachers).filter((row) => Number(row.fixedTargetHours || 0) > 0).length}개</strong></div>
    </div>
    <div class="optimizer-help">전담은 1번부터 ${teacherCount}번까지 고정됩니다. 각 전담 안에서 과목을 추가해 1개 또는 2개 이상 과목을 배정할 수 있습니다.</div>
    <div class="optimizer-teacher-card-list">
      ${planningTeachers.map((teacher, teacherIndex) => makeTeacherPlanCard(teacher, teacherIndex, subjectPools)).join('')}
    </div>
    <div id="optimizerResultArea"></div>
  `;

  area.querySelectorAll('[data-add-assignment]').forEach((button) => {
    button.addEventListener('click', () => {
      const teacherIndex = Number(button.dataset.addAssignment || 0);
      optimizerSettings = collectOptimizerSettingsFromUI();
      const firstSubject = normalizeSubjectPools(optimizerSettings.subjectPools || [])[0]?.subject || '';
      optimizerSettings.planningTeachers[teacherIndex].assignments.push({ subject: firstSubject, weeklyHours: 1, fixedTargetHours: '', preferredGrades: [], assignedClasses: [] });
      renderOptimizerSetup();
    });
  });

  area.querySelectorAll('[data-remove-assignment]').forEach((button) => {
    button.addEventListener('click', () => {
      const [teacherIndex, assignmentIndex] = button.dataset.removeAssignment.split('-').map(Number);
      optimizerSettings = collectOptimizerSettingsFromUI();
      optimizerSettings.planningTeachers[teacherIndex].assignments.splice(assignmentIndex, 1);
      if (!optimizerSettings.planningTeachers[teacherIndex].assignments.length) {
        const firstSubject = normalizeSubjectPools(optimizerSettings.subjectPools || [])[0]?.subject || '';
        optimizerSettings.planningTeachers[teacherIndex].assignments.push({ subject: firstSubject, weeklyHours: 1, fixedTargetHours: '', preferredGrades: [], assignedClasses: [] });
      }
      renderOptimizerSetup();
    });
  });

  area.querySelectorAll('select[data-opt-field="subject"]').forEach((select) => {
    select.addEventListener('change', () => {
      optimizerSettings = collectOptimizerSettingsFromUI();
      renderOptimizerSetup();
    });
  });
}

function makeTeacherPlanCard(teacher, teacherIndex, subjectPools) {
  return `
    <div class="optimizer-teacher-plan-card">
      <div class="optimizer-assignment-head">
        <div>
          <strong>${escapeHtml(teacher.teacherCode || `전담${teacherIndex + 1}`)}</strong>
          <span>${teacher.assignments?.length || 0}개 과목 배정</span>
        </div>
        <button type="button" data-add-assignment="${teacherIndex}">+ 과목 추가</button>
      </div>
      <div class="optimizer-assignment-lines">
        ${(teacher.assignments || []).map((assignment, assignmentIndex) => makeAssignmentPlanLine(assignment, teacherIndex, assignmentIndex, subjectPools)).join('')}
      </div>
    </div>
  `;
}

function makeAssignmentPlanLine(assignment, teacherIndex, assignmentIndex, subjectPools) {
  const allowedGrades = getAllowedGradesForSubject(assignment.subject, subjectPools);
  return `
    <div class="optimizer-assignment-line">
      <select class="optimizer-text-input" data-opt-field="subject" data-teacher-index="${teacherIndex}" data-assignment-index="${assignmentIndex}">${makeSubjectOptions(subjectPools, assignment.subject)}</select>
      <input class="optimizer-target-input" type="number" min="0" data-opt-field="fixedTargetHours" data-teacher-index="${teacherIndex}" data-assignment-index="${assignmentIndex}" value="${Number(assignment.fixedTargetHours || 0) || ''}" placeholder="자동시수">
      <div class="optimizer-grade-checks">
        ${allowedGrades.map((grade) => `<label><input type="checkbox" data-opt-field="preferredGrades" data-teacher-index="${teacherIndex}" data-assignment-index="${assignmentIndex}" value="${grade}" ${assignment.preferredGrades?.includes(grade) ? 'checked' : ''}>${grade}학년</label>`).join('')}
      </div>
      <button type="button" data-remove-assignment="${teacherIndex}-${assignmentIndex}">삭제</button>
    </div>
  `;
}

function makeSubjectOptions(subjectPools, selected) {
  const subjects = subjectPools.map((pool) => pool.subject).filter(Boolean);
  if (!subjects.length) return '<option value="">학교 설정에서 과목 추가 필요</option>';
  return subjects.map((subject) => `<option value="${escapeAttr(subject)}" ${subject === (selected || '') ? 'selected' : ''}>${escapeHtml(subject)}</option>`).join('');
}

function getAllowedGradesForSubject(subject, subjectPools) {
  const found = normalizeSubjectPools(subjectPools).find((pool) => pool.subject === subject);
  return found?.grades?.length ? found.grades : [1, 2, 3, 4, 5, 6];
}

function collectOptimizerSettingsFromUI() {
  const teacherCount = Number(optimizerSettings?.teacherCount || 0);
  const subjectPools = normalizeSubjectPools(optimizerSettings?.subjectPools || []);
  const planningTeachers = normalizePlanningTeachers(optimizerSettings?.planningTeachers || [], teacherCount, subjectPools);

  document.querySelectorAll('[data-opt-field]').forEach((input) => {
    const teacherIndex = Number(input.dataset.teacherIndex || 0);
    const assignmentIndex = Number(input.dataset.assignmentIndex || 0);
    const field = input.dataset.optField;
    const assignment = planningTeachers[teacherIndex]?.assignments?.[assignmentIndex];
    if (!assignment) return;

    if (field === 'preferredGrades') {
      assignment.preferredGrades = Array.from(document.querySelectorAll(`input[data-opt-field="preferredGrades"][data-teacher-index="${teacherIndex}"][data-assignment-index="${assignmentIndex}"]:checked`)).map((checkbox) => Number(checkbox.value)).filter(Boolean);
      return;
    }
    if (field === 'fixedTargetHours') {
      assignment.fixedTargetHours = input.value === '' ? '' : Number(input.value || 0);
      return;
    }
    assignment[field] = input.value;
  });

  return {
    ...(optimizerSettings || {}),
    teacherCount,
    subjectPools,
    totalDedicatedHours: calculateSchoolTotalHours(subjectPools) || calculateAutoTotalHours(flattenPlanningTeachers(planningTeachers)),
    planningTeachers
  };
}

function calculateSchoolTotalHours(subjectPools = []) {
  const classMap = makeClassMap(currentConfig?.gradeClasses || []);
  return normalizeSubjectPools(subjectPools).reduce((sum, pool) => {
    return sum + pool.grades.reduce((gradeSum, grade) => {
      const classCount = Number(classMap[grade] || 0);
      const hour = Number(pool.gradeHours?.[grade] || pool.gradeHours?.[String(grade)] || 0);
      return gradeSum + classCount * hour;
    }, 0);
  }, 0);
}

function calculateAutoTotalHours(rows) {
  const fixed = rows.reduce((sum, row) => sum + Number(row.fixedTargetHours || 0), 0);
  const autoCount = rows.filter((row) => Number(row.fixedTargetHours || 0) <= 0).length;
  const fixedAverage = rows.length - autoCount > 0 ? Math.round(fixed / Math.max(1, rows.length - autoCount)) : 18;
  return fixed + autoCount * fixedAverage;
}

function runOptimizer() {
  currentConfig = currentConfig || {};
  optimizerSettings = collectOptimizerSettingsFromUI();
  optimizerResult = optimizeDedicatedAssignments(currentConfig, optimizerSettings);
  renderOptimizerResultAsCards(optimizerResult);
}

function renderOptimizerResultAsCards(result) {
  const area = document.getElementById('optimizerResultArea');
  if (!area || !result) return;
  const conflicts = findClassConflicts(result.rows);
  area.innerHTML = `
    <div class="panel-head optimizer-result-head"><div><h2>자동 배정 결과</h2><p class="panel-note">추천 총시수 ${result.summary.recommendedTotal}시간 / 자동 목표 ${result.totalDedicatedHours}시간</p></div></div>
    <div class="optimizer-conflict-summary">${conflicts.length ? `<span class="optimizer-warning">같은 과목 중복 ${conflicts.length}건</span>` : '<span>같은 과목 중복 없음</span>'}</div>
    <div class="optimizer-assignment-grid">${result.rows.map((row, rowIndex) => makeAssignmentCard(row, rowIndex, conflicts)).join('')}</div>
  `;
}

function makeAssignmentCard(row, rowIndex, conflicts) {
  const classMap = makeClassMap(currentConfig?.gradeClasses || []);
  return `
    <div class="optimizer-assignment-card" data-row-index="${rowIndex}">
      <div class="optimizer-assignment-head"><div><strong>${escapeHtml(row.teacherCode)}</strong><span>${escapeHtml(row.subject)} · 목표 ${row.targetHours}시간 · 추천 ${row.recommendedHours}시간</span></div>${row.warnings.length ? `<div>${row.warnings.map((w) => `<span class="optimizer-warning">${escapeHtml(w)}</span>`).join('')}</div>` : '<span>적정</span>'}</div>
      <div class="optimizer-grade-blocks">${[1, 2, 3, 4, 5, 6].map((grade) => makeGradeBlock(row, rowIndex, grade, classMap[grade] || 0, conflicts)).join('')}</div>
    </div>
  `;
}

function makeGradeBlock(row, rowIndex, grade, classCount, conflicts) {
  if (!classCount) return '';
  const allowedGrades = getAllowedGradesForSubject(row.subject, optimizerSettings?.subjectPools || []);
  const disabled = !allowedGrades.includes(grade);
  return `<div class="optimizer-grade-block ${disabled ? 'is-disabled' : ''}"><strong>${grade}학년</strong><div class="optimizer-class-buttons">${Array.from({ length: classCount }, (_, index) => {
    const classCode = `${grade}-${index + 1}`;
    const checked = row.recommendedClasses.includes(classCode);
    const conflict = conflicts.some((item) => item.subject === row.subject && item.classCode === classCode);
    return `<label class="optimizer-class-chip ${checked ? 'is-selected' : ''} ${conflict && checked ? 'is-conflict' : ''}"><input type="checkbox" data-result-row="${rowIndex}" value="${classCode}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>${index + 1}반</label>`;
  }).join('')}</div></div>`;
}

function makeClassMap(gradeClasses) {
  const map = {};
  (gradeClasses || []).forEach((item) => { map[Number(item.grade)] = Number(item.classCount || 0); });
  return map;
}

function findClassConflicts(rows) {
  const owners = new Map();
  rows.forEach((row) => row.recommendedClasses.forEach((classCode) => {
    const key = `${row.subject}__${classCode}`;
    if (!owners.has(key)) owners.set(key, { subject: row.subject, classCode, owners: [] });
    owners.get(key).owners.push(row.teacherCode);
  }));
  return [...owners.values()].filter((item) => item.owners.length > 1);
}

function collectEditedResultRows() {
  if (!optimizerResult) return [];
  return optimizerResult.rows.map((row, rowIndex) => {
    const checked = Array.from(document.querySelectorAll(`input[data-result-row="${rowIndex}"]:checked`)).map((input) => input.value);
    return {
      ...row,
      recommendedClasses: checked,
      recommendedHours: calculateCheckedClassHours(row.subject, checked),
      grades: [...new Set(checked.map((code) => Number(code.split('-')[0])))].sort((a, b) => a - b)
    };
  });
}

function calculateCheckedClassHours(subject, classCodes = []) {
  const subjectPools = normalizeSubjectPools(optimizerSettings?.subjectPools || []);
  const pool = subjectPools.find((item) => item.subject === subject);

  return classCodes.reduce((sum, code) => {
    const grade = Number(String(code).split('-')[0]);
    const hour = Number(pool?.gradeHours?.[grade] || pool?.gradeHours?.[String(grade)] || 1);
    return sum + hour;
  }, 0);
}

function makeTeacherRowsFromEditedRows(rows = []) {
  const subjectPools = normalizeSubjectPools(optimizerSettings?.subjectPools || []);
  const result = [];

  rows.forEach((row) => {
    if (row.subject === '미정') return;

    const groups = new Map();
    (row.recommendedClasses || []).forEach((classCode) => {
      const grade = Number(String(classCode).split('-')[0]);
      const hour = Number(subjectPools.find((item) => item.subject === row.subject)?.gradeHours?.[grade]
        || subjectPools.find((item) => item.subject === row.subject)?.gradeHours?.[String(grade)]
        || 1);
      if (!groups.has(hour)) groups.set(hour, []);
      groups.get(hour).push(classCode);
    });

    groups.forEach((assignedClasses, weeklyHours) => {
      result.push({
        teacherCode: row.teacherCode,
        teacherName: row.teacherName || row.teacherCode,
        subject: row.subject,
        roomName: '',
        weeklyHours,
        blockPattern: '1',
        assignedClasses
      });
    });
  });

  return result;
}

async function applyOptimizerResult() {
  if (!optimizerResult || !currentConfig) {
    alert('먼저 자동 배정을 실행하세요.');
    return;
  }
  const editedRows = collectEditedResultRows();
  currentConfig.teachers = makeTeacherRowsFromEditedRows(editedRows);
  currentConfig.optimizer = { ...collectOptimizerSettingsFromUI(), lastResult: { rows: editedRows.map((row) => ({ teacherCode: row.teacherCode, subject: row.subject, targetHours: row.targetHours, recommendedHours: row.recommendedHours, recommendedClasses: row.recommendedClasses, grades: row.grades, warnings: row.warnings })) } };
  await window.desktopApi.saveConfig(currentConfig);
  alert('전담 배정을 적용했습니다. 고급 전담 수정 영역에서 확인할 수 있습니다.');
}

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}
