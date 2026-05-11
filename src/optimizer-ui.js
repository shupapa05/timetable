import {
  optimizeDedicatedAssignments,
  normalizeOptimizerSettings,
  normalizePlanningTeachers,
  normalizeSubjectPools
} from './timetable-optimizer.js';

const SUBJECT_OPTIONS = [
  '',
  '국어',
  '도덕',
  '사회',
  '수학',
  '과학',
  '실과',
  '체육',
  '음악',
  '미술',
  '영어',
  '바른 생활',
  '슬기로운 생활',
  '즐거운 생활',
  '창의적 체험활동',
  '기타'
];

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
  renderOptimizerBaseSetup(currentConfig || {}, optimizerSettings);
  renderOptimizerSetup(currentConfig || {}, optimizerSettings);
}

function normalizeSubjectPoolsForUI(items = []) {
  const input = Array.isArray(items) ? items : [];
  return input.map((item) => ({
    subject: String(item.subject || '').trim(),
    grades: Array.isArray(item.grades) ? item.grades.map(Number).filter((grade) => grade >= 1 && grade <= 6) : []
  }));
}

function renderOptimizerBaseSetup(config, settings) {
  const area = document.getElementById('optimizerBaseArea');
  if (!area) return;

  const optimizer = settings || normalizeOptimizerSettings(config);
  const subjectPools = normalizeSubjectPoolsForUI(optimizer.subjectPools || []);
  const validSubjectCount = normalizeSubjectPools(subjectPools).length;
  const teacherCount = Number(optimizer.teacherCount || 0);

  area.innerHTML = `
    <div class="optimizer-summary">
      <label class="optimizer-card">
        <span>전담 수</span>
        <strong><input id="baseTeacherCount" type="number" min="0" value="${teacherCount}" class="optimizer-target-input"></strong>
      </label>
      <div class="optimizer-card">
        <span>전담 과목 수</span>
        <strong>${validSubjectCount}개</strong>
      </div>
    </div>

    <div class="optimizer-help">
      학교에서 운영 가능한 전담 과목과 해당 과목을 배정할 수 있는 학년을 체크합니다.
      예: 과학은 3~6학년, 영어는 3~6학년, 체육은 1~6학년.
    </div>

    <table class="optimizer-table">
      <thead>
        <tr>
          <th>과목</th>
          <th>가능 학년</th>
          <th>관리</th>
        </tr>
      </thead>
      <tbody id="subjectPoolRows">
        ${subjectPools.map((pool, index) => makeSubjectPoolRow(pool, index)).join('')}
      </tbody>
    </table>

    <div class="optimizer-actions optimizer-inline-actions">
      <button id="addSubjectPoolBtn" type="button">+ 전담 과목 추가</button>
      <button id="saveOptimizerBaseBtn" type="button" class="primary">전담 기본 조건 저장</button>
    </div>
  `;

  document.getElementById('addSubjectPoolBtn')?.addEventListener('click', () => {
    const next = collectBaseSettingsFromUI({ keepEmpty: true });
    next.subjectPools.push({ subject: '', grades: [] });
    optimizerSettings = next;
    renderOptimizerBaseSetup(currentConfig || {}, optimizerSettings);
  });

  document.getElementById('saveOptimizerBaseBtn')?.addEventListener('click', saveOptimizerBaseSettings);

  area.querySelectorAll('[data-remove-subject-index]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.removeSubjectIndex || 0);
      const next = collectBaseSettingsFromUI({ keepEmpty: true });
      next.subjectPools.splice(index, 1);
      optimizerSettings = next;
      renderOptimizerBaseSetup(currentConfig || {}, optimizerSettings);
    });
  });
}

function makeSubjectPoolRow(pool, index) {
  return `
    <tr>
      <td>
        <select class="optimizer-text-input" data-base-field="subject" data-subject-index="${index}">
          ${SUBJECT_OPTIONS.map((subject) => `<option value="${escapeAttr(subject)}" ${subject === (pool.subject || '') ? 'selected' : ''}>${subject || '선택'}</option>`).join('')}
        </select>
      </td>
      <td>
        <div class="optimizer-grade-checks">
          ${[1, 2, 3, 4, 5, 6].map((grade) => `
            <label>
              <input type="checkbox" data-base-field="grades" data-subject-index="${index}" value="${grade}" ${pool.grades?.includes(grade) ? 'checked' : ''}>
              ${grade}학년
            </label>
          `).join('')}
        </div>
      </td>
      <td><button type="button" data-remove-subject-index="${index}">삭제</button></td>
    </tr>
  `;
}

function collectBaseSettingsFromUI(options = {}) {
  const teacherCount = Number(document.getElementById('baseTeacherCount')?.value || optimizerSettings?.teacherCount || 0);
  const rows = Array.from(document.querySelectorAll('#subjectPoolRows tr'));
  const rawSubjectPools = rows.map((row, index) => {
    const subject = row.querySelector(`[data-base-field="subject"][data-subject-index="${index}"]`)?.value || '';
    const grades = Array.from(row.querySelectorAll(`[data-base-field="grades"][data-subject-index="${index}"]:checked`))
      .map((checkbox) => Number(checkbox.value))
      .filter(Boolean);
    return { subject, grades };
  });
  const subjectPools = options.keepEmpty ? rawSubjectPools : normalizeSubjectPools(rawSubjectPools);

  return {
    ...(optimizerSettings || {}),
    teacherCount,
    subjectPools,
    planningTeachers: normalizePlanningTeachers(optimizerSettings?.planningTeachers || [], teacherCount, normalizeSubjectPools(subjectPools))
  };
}

async function saveOptimizerBaseSettings() {
  optimizerSettings = collectBaseSettingsFromUI({ keepEmpty: false });
  currentConfig = currentConfig || {};
  currentConfig.optimizer = {
    ...(currentConfig.optimizer || {}),
    ...optimizerSettings
  };
  await window.desktopApi.saveConfig(currentConfig);
  renderOptimizerBaseSetup(currentConfig, optimizerSettings);
  renderOptimizerSetup(currentConfig, optimizerSettings);
  alert('전담 기본 조건을 저장했습니다.');
}

function renderOptimizerSetup(config, settings) {
  const area = document.getElementById('optimizerArea');
  if (!area) return;

  const optimizer = settings || normalizeOptimizerSettings(config);
  const teacherCount = Number(optimizer.teacherCount || 0);
  const subjectPools = normalizeSubjectPools(optimizer.subjectPools || []);
  const planningTeachers = normalizePlanningTeachers(optimizer.planningTeachers || [], teacherCount, subjectPools);
  const fixedCount = planningTeachers.filter((teacher) => Number(teacher.fixedTargetHours || 0) > 0).length;
  const autoCount = planningTeachers.length - fixedCount;

  if (!teacherCount) {
    area.innerHTML = '<div class="optimizer-empty">학교 설정에서 전담 수를 먼저 입력하세요.</div>';
    return;
  }

  area.innerHTML = `
    <div class="optimizer-summary">
      <div class="optimizer-card">
        <span>전담 수</span>
        <strong>${teacherCount}명</strong>
      </div>
      <div class="optimizer-card">
        <span>고정 시수 입력</span>
        <strong>${fixedCount}명</strong>
      </div>
      <div class="optimizer-card">
        <span>자동 균등 대상</span>
        <strong>${autoCount}명</strong>
      </div>
    </div>

    <div class="optimizer-help">
      전담별 과목, 고정 총시수, 선택 학년을 정합니다. 비워둔 전담은 자동 배정에서 균형 있게 배정합니다.
    </div>

    <table class="optimizer-table">
      <thead>
        <tr>
          <th>전담명</th>
          <th>과목</th>
          <th>고정 총시수</th>
          <th>선택 학년</th>
        </tr>
      </thead>
      <tbody>
        ${planningTeachers.map((teacher, index) => `
          <tr>
            <td><input class="optimizer-text-input" data-opt-field="teacherCode" data-index="${index}" value="${escapeAttr(teacher.teacherCode || `전담${index + 1}`)}"></td>
            <td>
              <select class="optimizer-text-input" data-opt-field="subject" data-index="${index}">
                ${makeSubjectOptions(subjectPools, teacher.subject)}
              </select>
            </td>
            <td><input class="optimizer-target-input" type="number" min="0" data-opt-field="fixedTargetHours" data-index="${index}" value="${Number(teacher.fixedTargetHours || 0) || ''}" placeholder="자동"></td>
            <td>
              <div class="optimizer-grade-checks">
                ${getAllowedGradesForSubject(teacher.subject, subjectPools).map((grade) => `
                  <label>
                    <input type="checkbox" data-opt-field="preferredGrades" data-index="${index}" value="${grade}" ${teacher.preferredGrades?.includes(grade) ? 'checked' : ''}>
                    ${grade}학년
                  </label>
                `).join('')}
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>

    <div id="optimizerResultArea"></div>
  `;
}

function makeSubjectOptions(subjectPools, selected) {
  const subjects = subjectPools.map((pool) => pool.subject).filter(Boolean);
  if (!subjects.length) {
    return '<option value="">학교 설정에서 과목 추가 필요</option>';
  }
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
    const index = Number(input.dataset.index || 0);
    const field = input.dataset.optField;
    const teacher = planningTeachers[index];
    if (!teacher) return;

    if (field === 'preferredGrades') {
      teacher.preferredGrades = Array.from(document.querySelectorAll(`input[data-opt-field="preferredGrades"][data-index="${index}"]:checked`))
        .map((checkbox) => Number(checkbox.value))
        .filter(Boolean);
      return;
    }

    if (field === 'fixedTargetHours') {
      teacher.fixedTargetHours = input.value === '' ? '' : Number(input.value || 0);
      return;
    }

    teacher[field] = input.value;
    if (field === 'teacherCode') teacher.teacherName = input.value;
    teacher.weeklyHours = 1;
  });

  return {
    ...(optimizerSettings || {}),
    teacherCount,
    subjectPools,
    totalDedicatedHours: calculateAutoTotalHours(planningTeachers),
    planningTeachers
  };
}

function calculateAutoTotalHours(planningTeachers) {
  const fixed = planningTeachers.reduce((sum, teacher) => sum + Number(teacher.fixedTargetHours || 0), 0);
  const autoCount = planningTeachers.filter((teacher) => Number(teacher.fixedTargetHours || 0) <= 0).length;
  const fixedAverage = planningTeachers.length - autoCount > 0
    ? Math.round(fixed / Math.max(1, planningTeachers.length - autoCount))
    : 18;
  return fixed + autoCount * fixedAverage;
}

function runOptimizer() {
  if (!currentConfig) currentConfig = {};

  optimizerSettings = collectOptimizerSettingsFromUI();
  optimizerResult = optimizeDedicatedAssignments(currentConfig, optimizerSettings);
  renderOptimizerResultAsCards(optimizerResult);
}

function renderOptimizerResultAsCards(result) {
  const area = document.getElementById('optimizerResultArea');
  if (!area || !result) return;

  const conflicts = findClassConflicts(result.rows);
  area.innerHTML = `
    <div class="panel-head optimizer-result-head">
      <div>
        <h2>자동 배정 결과</h2>
        <p class="panel-note">추천 총시수 ${result.summary.recommendedTotal}시간 / 자동 목표 ${result.totalDedicatedHours}시간</p>
      </div>
    </div>

    <div class="optimizer-conflict-summary">
      ${conflicts.length ? `<span class="optimizer-warning">중복 ${conflicts.length}건</span>` : '<span>중복 없음</span>'}
      ${result.rows.flatMap((row) => row.warnings).length ? `<span class="optimizer-warning">확인 필요 ${result.rows.flatMap((row) => row.warnings).length}건</span>` : '<span>시수 확인 양호</span>'}
    </div>

    <div class="optimizer-assignment-grid">
      ${result.rows.map((row, rowIndex) => makeAssignmentCard(row, rowIndex, conflicts)).join('')}
    </div>
  `;
}

function makeAssignmentCard(row, rowIndex, conflicts) {
  const classMap = makeClassMap(currentConfig?.gradeClasses || []);
  return `
    <div class="optimizer-assignment-card" data-row-index="${rowIndex}">
      <div class="optimizer-assignment-head">
        <div>
          <strong>${escapeHtml(row.teacherCode)}</strong>
          <span>${escapeHtml(row.subject)} · 목표 ${row.targetHours}시간 · 추천 ${row.recommendedHours}시간</span>
        </div>
        ${row.warnings.length ? `<div>${row.warnings.map((warning) => `<span class="optimizer-warning">${escapeHtml(warning)}</span>`).join('')}</div>` : '<span>적정</span>'}
      </div>
      <div class="optimizer-grade-blocks">
        ${[1, 2, 3, 4, 5, 6].map((grade) => makeGradeBlock(row, rowIndex, grade, classMap[grade] || 0, conflicts)).join('')}
      </div>
    </div>
  `;
}

function makeGradeBlock(row, rowIndex, grade, classCount, conflicts) {
  if (!classCount) return '';
  const allowedGrades = getAllowedGradesForSubject(row.subject, optimizerSettings?.subjectPools || []);
  const disabled = !allowedGrades.includes(grade);
  return `
    <div class="optimizer-grade-block ${disabled ? 'is-disabled' : ''}">
      <strong>${grade}학년</strong>
      <div class="optimizer-class-buttons">
        ${Array.from({ length: classCount }, (_unused, index) => {
          const classCode = `${grade}-${index + 1}`;
          const checked = row.recommendedClasses.includes(classCode);
          const conflict = conflicts.some((item) => item.classCode === classCode);
          return `
            <label class="optimizer-class-chip ${checked ? 'is-selected' : ''} ${conflict && checked ? 'is-conflict' : ''}">
              <input type="checkbox" data-result-row="${rowIndex}" value="${classCode}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
              ${index + 1}반
            </label>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function makeClassMap(gradeClasses) {
  const map = {};
  (gradeClasses || []).forEach((item) => {
    map[Number(item.grade)] = Number(item.classCount || 0);
  });
  return map;
}

function findClassConflicts(rows) {
  const owners = new Map();
  rows.forEach((row) => {
    row.recommendedClasses.forEach((classCode) => {
      if (!owners.has(classCode)) owners.set(classCode, []);
      owners.get(classCode).push(row.teacherCode);
    });
  });
  return [...owners.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([classCode, owners]) => ({ classCode, owners }));
}

function collectEditedResultRows() {
  if (!optimizerResult) return [];
  return optimizerResult.rows.map((row, rowIndex) => {
    const checked = Array.from(document.querySelectorAll(`input[data-result-row="${rowIndex}"]:checked`))
      .map((input) => input.value);
    return {
      ...row,
      recommendedClasses: checked,
      recommendedHours: checked.length * row.weeklyHours,
      grades: [...new Set(checked.map((code) => Number(code.split('-')[0])))].sort((a, b) => a - b)
    };
  });
}

async function applyOptimizerResult() {
  if (!optimizerResult || !currentConfig) {
    alert('먼저 자동 배정을 실행하세요.');
    return;
  }

  const editedRows = collectEditedResultRows();
  currentConfig.teachers = editedRows.map((row) => ({
    teacherCode: row.teacherCode,
    teacherName: row.teacherName || row.teacherCode,
    subject: row.subject === '미정' ? '' : row.subject,
    roomName: '',
    weeklyHours: 1,
    blockPattern: '1',
    assignedClasses: row.recommendedClasses
  }));

  currentConfig.optimizer = {
    ...collectOptimizerSettingsFromUI(),
    lastResult: {
      rows: editedRows.map((row) => ({
        teacherCode: row.teacherCode,
        subject: row.subject,
        targetHours: row.targetHours,
        recommendedHours: row.recommendedHours,
        recommendedClasses: row.recommendedClasses,
        grades: row.grades,
        warnings: row.warnings
      }))
    }
  };

  await window.desktopApi.saveConfig(currentConfig);
  alert('전담 배정을 적용했습니다. 고급 전담 수정 영역에서 확인할 수 있습니다.');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}
