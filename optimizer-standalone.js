import {
  optimizeDedicatedAssignments,
  normalizeOptimizerSettings,
  normalizePlanningTeachers,
  normalizeSubjectPools
} from './src/timetable-optimizer.js';

const SUBJECT_OPTIONS = ['', '국어', '도덕', '사회', '수학', '과학', '실과', '체육', '음악', '미술', '영어', '바른 생활', '슬기로운 생활', '즐거운 생활', '창의적 체험활동', '기타'];

let config = null;
let settings = null;
let result = null;

window.addEventListener('DOMContentLoaded', async () => {
  injectStyles();
  injectStandaloneTab();
  patchExistingTabButtons();
  await load();
});

async function load() {
  config = await window.desktopApi.loadConfig();
  settings = normalizeOptimizerSettings(config || {});
  result = restoreResult(config?.optimizerStandalone?.lastResult || config?.optimizer?.lastResult);
  render();
}

function injectStandaloneTab() {
  if (document.getElementById('optimizerStandaloneTab')) return;

  const tabButtons = document.querySelector('.app-tabs');
  const container = document.querySelector('.app') || document.querySelector('main') || document.body;
  if (!tabButtons || !container) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'optimizerStandaloneTab';
  button.className = 'tab-button';
  button.dataset.tabTarget = 'optimizerStandalonePanel';
  button.textContent = '전담최적화';
  tabButtons.insertBefore(button, tabButtons.children[2] || null);

  const panel = document.createElement('section');
  panel.id = 'optimizerStandalonePanel';
  panel.className = 'tab-panel optimizer-standalone-panel';
  panel.innerHTML = '<div id="optimizerStandaloneArea"></div>';

  const teacherTab = document.getElementById('teacherTab');
  if (teacherTab?.parentElement) {
    teacherTab.parentElement.insertBefore(panel, teacherTab.nextSibling);
  } else {
    container.appendChild(panel);
  }

  button.addEventListener('click', (event) => {
    event.preventDefault();
    showStandalonePanel();
  });
}

function patchExistingTabButtons() {
  document.querySelectorAll('.app-tabs .tab-button:not(#optimizerStandaloneTab)').forEach((button) => {
    if (button.dataset.optimizerStandalonePatched === '1') return;
    button.dataset.optimizerStandalonePatched = '1';
    button.addEventListener('click', () => {
      document.querySelectorAll('.tab-panel').forEach((panel) => {
        panel.style.display = '';
      });
      document.getElementById('optimizerStandalonePanel')?.classList.remove('active');
      document.getElementById('optimizerStandaloneTab')?.classList.remove('active');
    });
  });
}

function showStandalonePanel() {
  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.style.display = '';
    panel.classList.toggle('active', panel.id === 'optimizerStandalonePanel');
  });
  document.querySelectorAll('.app-tabs .tab-button').forEach((btn) => {
    btn.classList.toggle('active', btn.id === 'optimizerStandaloneTab');
  });
  render();
}

function render() {
  const area = document.getElementById('optimizerStandaloneArea');
  if (!area || !settings) return;

  const subjectPools = normalizeSubjectPoolsForUI(settings.subjectPools || []);
  const teacherCount = Number(settings.teacherCount || 0);
  const planningTeachers = normalizePlanningTeachers(settings.planningTeachers || [], teacherCount, normalizeSubjectPools(subjectPools));
  settings.planningTeachers = planningTeachers;

  area.innerHTML = `
    <div class="optimizer-standalone-wrap">
      <div class="optimizer-standalone-head">
        <div>
          <h2>전담최적화</h2>
          <p>자동 추천을 만든 뒤 전담배정으로 적용합니다. 전담배정 화면은 최종 수동 수정용으로 유지됩니다.</p>
        </div>
        <div class="optimizer-actions os-actions">
          <button id="optimizerStandaloneReload" type="button">새로고침</button>
          <button id="optimizerStandaloneSave" type="button">조건 저장</button>
          <button id="optimizerStandaloneRun" type="button" class="primary">자동배정</button>
          <button id="optimizerStandaloneApply" type="button" class="primary">전담배정으로 적용</button>
        </div>
      </div>

      <div class="optimizer-grid-two">
        <section class="optimizer-box">
          <div class="os-section-head"><h3>학교 기준 조건</h3><span class="os-badge">총 ${calculateSchoolTotalHours(subjectPools)}시간</span></div>
          <label class="optimizer-field-row"><span>전담 수</span><input id="osTeacherCount" type="number" min="0" value="${teacherCount}"></label>
          <div class="os-table-scroll">
            <table class="optimizer-table os-subject-table">
              <thead><tr><th>과목</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th></th></tr></thead>
              <tbody id="osSubjectRows">${subjectPools.map((pool, index) => makeSubjectRow(pool, index)).join('')}</tbody>
            </table>
          </div>
          <button id="osAddSubject" type="button" class="small">+ 과목 추가</button>
        </section>

        <section class="optimizer-box">
          <div class="os-section-head"><h3>전담별 조건</h3><span class="os-badge">${teacherCount}명</span></div>
          <div id="osTeacherRows" class="os-teacher-list">${planningTeachers.map((teacher, index) => makeTeacherCard(teacher, index, subjectPools)).join('')}</div>
        </section>
      </div>

      <section class="optimizer-box optimizer-result-box">
        <div class="os-section-head"><h3>자동배정 결과</h3>${result ? makeResultSummaryBadge(result) : '<span class="os-badge muted">대기</span>'}</div>
        <div id="osResultArea">${result ? makeResultHtml(result) : '<div class="optimizer-empty">자동배정을 실행하면 결과가 표시됩니다.</div>'}</div>
      </section>
    </div>
  `;

  bindEvents();
}

function bindEvents() {
  document.getElementById('optimizerStandaloneReload')?.addEventListener('click', load);
  document.getElementById('optimizerStandaloneSave')?.addEventListener('click', saveSettings);
  document.getElementById('optimizerStandaloneRun')?.addEventListener('click', runOptimizer);
  document.getElementById('optimizerStandaloneApply')?.addEventListener('click', applyToTeachers);
  document.getElementById('osAddSubject')?.addEventListener('click', () => {
    settings = collectSettings({ keepEmpty: true });
    settings.subjectPools.push({ subject: '', gradeHours: {}, grades: [] });
    render();
  });

  document.querySelectorAll('[data-os-remove-subject]').forEach((btn) => {
    btn.addEventListener('click', () => {
      settings = collectSettings({ keepEmpty: true });
      settings.subjectPools.splice(Number(btn.dataset.osRemoveSubject), 1);
      result = null;
      render();
    });
  });

  document.querySelectorAll('[data-os-add-assignment]').forEach((btn) => {
    btn.addEventListener('click', () => {
      settings = collectSettings();
      const teacherIndex = Number(btn.dataset.osAddAssignment);
      const firstSubject = normalizeSubjectPools(settings.subjectPools || [])[0]?.subject || '';
      settings.planningTeachers[teacherIndex].assignments.push({ subject: firstSubject, fixedTargetHours: '', preferredGrades: [], assignedClasses: [], roomName: '' });
      result = null;
      render();
    });
  });

  document.querySelectorAll('[data-os-remove-assignment]').forEach((btn) => {
    btn.addEventListener('click', () => {
      settings = collectSettings();
      const [teacherIndex, assignmentIndex] = btn.dataset.osRemoveAssignment.split('-').map(Number);
      settings.planningTeachers[teacherIndex].assignments.splice(assignmentIndex, 1);
      if (!settings.planningTeachers[teacherIndex].assignments.length) {
        const firstSubject = normalizeSubjectPools(settings.subjectPools || [])[0]?.subject || '';
        settings.planningTeachers[teacherIndex].assignments.push({ subject: firstSubject, fixedTargetHours: '', preferredGrades: [], assignedClasses: [], roomName: '' });
      }
      result = null;
      render();
    });
  });

  document.querySelectorAll('input[data-os-result-row]').forEach((input) => {
    input.addEventListener('change', saveEditedResult);
  });
}

function makeSubjectRow(pool, index) {
  const gradeHours = pool.gradeHours || {};
  return `<tr>
    <td><select data-os-subject-index="${index}" data-os-field="subject">${SUBJECT_OPTIONS.map((subject) => `<option value="${escapeAttr(subject)}" ${subject === pool.subject ? 'selected' : ''}>${escapeHtml(subject || '선택')}</option>`).join('')}</select></td>
    ${[1,2,3,4,5,6].map((grade) => `<td><input type="number" min="0" data-os-subject-index="${index}" data-os-field="gradeHours" data-grade="${grade}" value="${Number(gradeHours[grade] || gradeHours[String(grade)] || 0) || ''}" placeholder="-"></td>`).join('')}
    <td><button type="button" class="small" data-os-remove-subject="${index}">삭제</button></td>
  </tr>`;
}

function makeTeacherCard(teacher, teacherIndex, subjectPools) {
  return `<div class="os-teacher-card">
    <div class="os-card-head"><strong>${escapeHtml(teacher.teacherCode || `전담${teacherIndex + 1}`)}</strong><button type="button" class="small" data-os-add-assignment="${teacherIndex}">+ 과목</button></div>
    ${(teacher.assignments || []).map((assignment, assignmentIndex) => makeAssignmentRow(assignment, teacherIndex, assignmentIndex, subjectPools)).join('')}
  </div>`;
}

function makeAssignmentRow(assignment, teacherIndex, assignmentIndex, subjectPools) {
  const allowedGrades = getAllowedGradesForSubject(assignment.subject, subjectPools);
  return `<div class="os-assignment-row">
    <select title="과목" data-os-field="assignmentSubject" data-teacher-index="${teacherIndex}" data-assignment-index="${assignmentIndex}">${makeSubjectOptions(subjectPools, assignment.subject)}</select>
    <input title="고정 총시수" type="number" min="0" data-os-field="fixedTargetHours" data-teacher-index="${teacherIndex}" data-assignment-index="${assignmentIndex}" value="${Number(assignment.fixedTargetHours || 0) || ''}" placeholder="자동시수">
    <select title="장소" data-os-field="roomName" data-teacher-index="${teacherIndex}" data-assignment-index="${assignmentIndex}">${makeRoomOptions(assignment.roomName || '')}</select>
    <button type="button" class="small" data-os-remove-assignment="${teacherIndex}-${assignmentIndex}">삭제</button>
    <div class="os-grade-checks">${allowedGrades.map((grade) => `<label><input type="checkbox" data-os-field="preferredGrades" data-teacher-index="${teacherIndex}" data-assignment-index="${assignmentIndex}" value="${grade}" ${assignment.preferredGrades?.includes(grade) ? 'checked' : ''}>${grade}학년</label>`).join('')}</div>
  </div>`;
}

function makeResultSummaryBadge(res) {
  const recommended = Number(res.summary?.recommendedTotal || 0);
  const target = Number(res.totalDedicatedHours || 0);
  const gap = recommended - target;
  const tone = gap === 0 ? 'good' : 'warn';
  return `<span class="os-badge ${tone}">추천 ${recommended}h / 목표 ${target}h</span>`;
}

function makeResultHtml(res) {
  const conflicts = findClassConflicts(res.rows || []);
  const conflictText = conflicts.length ? `<div class="os-warning compact">${conflicts.map((item) => `${escapeHtml(item.subject)} ${escapeHtml(item.classCode)}`).join(' · ')} 중복</div>` : '';
  return `${conflictText}<div class="os-result-grid">${(res.rows || []).map((row, rowIndex) => makeResultCard(row, rowIndex, conflicts)).join('')}</div>`;
}

function makeResultCard(row, rowIndex, conflicts) {
  const classMap = makeClassMap(config?.gradeClasses || []);
  const room = row.roomName ? `<span class="os-room">${escapeHtml(row.roomName)}</span>` : '<span class="os-room muted">장소 없음</span>';
  return `<div class="os-result-card">
    <div class="os-result-card-head">
      <div><strong>${escapeHtml(row.teacherCode)}</strong><span>${escapeHtml(row.subject)} · ${room}</span></div>
      <div class="os-mini-badges"><em>목표 ${row.targetHours || 0}</em><em>추천 ${row.recommendedHours || 0}</em></div>
    </div>
    ${(row.warnings || []).map((w) => `<div class="os-warning">${escapeHtml(w)}</div>`).join('')}
    <div class="os-grade-blocks">${[1,2,3,4,5,6].map((grade) => makeResultGrade(row, rowIndex, grade, classMap[grade] || 0, conflicts)).join('')}</div>
  </div>`;
}

function makeResultGrade(row, rowIndex, grade, classCount, conflicts) {
  if (!classCount) return '';
  const allowedGrades = getAllowedGradesForSubject(row.subject, settings?.subjectPools || []);
  const disabled = !allowedGrades.includes(grade);
  return `<div class="os-grade-block ${disabled ? 'is-disabled' : ''}"><strong>${grade}학년</strong><div>${Array.from({ length: classCount }, (_, index) => {
    const classCode = `${grade}-${index + 1}`;
    const checked = (row.recommendedClasses || []).includes(classCode);
    const conflict = conflicts.some((item) => item.subject === row.subject && item.classCode === classCode);
    return `<label class="os-chip ${checked ? 'is-selected' : ''} ${conflict && checked ? 'is-conflict' : ''}"><input type="checkbox" data-os-result-row="${rowIndex}" value="${classCode}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>${index + 1}반</label>`;
  }).join('')}</div></div>`;
}

function collectSettings(options = {}) {
  const teacherCount = Number(document.getElementById('osTeacherCount')?.value || settings?.teacherCount || 0);
  const rawSubjectPools = Array.from(document.querySelectorAll('#osSubjectRows tr')).map((row, index) => {
    const gradeHours = {};
    row.querySelectorAll(`[data-os-field="gradeHours"][data-os-subject-index="${index}"]`).forEach((input) => {
      const grade = Number(input.dataset.grade || 0);
      const hour = Number(input.value || 0);
      if (grade && hour > 0) gradeHours[grade] = hour;
    });
    return {
      subject: row.querySelector(`[data-os-field="subject"][data-os-subject-index="${index}"]`)?.value || '',
      gradeHours,
      grades: Object.keys(gradeHours).map(Number).sort((a,b) => a-b)
    };
  });
  const subjectPools = options.keepEmpty ? rawSubjectPools : normalizeSubjectPools(rawSubjectPools);
  const planningTeachers = normalizePlanningTeachers(settings?.planningTeachers || [], teacherCount, normalizeSubjectPools(subjectPools));

  document.querySelectorAll('[data-os-field]').forEach((input) => {
    const teacherIndex = Number(input.dataset.teacherIndex || -1);
    const assignmentIndex = Number(input.dataset.assignmentIndex || -1);
    if (teacherIndex < 0 || assignmentIndex < 0) return;
    const assignment = planningTeachers[teacherIndex]?.assignments?.[assignmentIndex];
    if (!assignment) return;
    const field = input.dataset.osField;
    if (field === 'preferredGrades') {
      assignment.preferredGrades = Array.from(document.querySelectorAll(`input[data-os-field="preferredGrades"][data-teacher-index="${teacherIndex}"][data-assignment-index="${assignmentIndex}"]:checked`)).map((el) => Number(el.value)).filter(Boolean);
    } else if (field === 'assignmentSubject') {
      assignment.subject = input.value;
    } else if (field === 'fixedTargetHours') {
      assignment.fixedTargetHours = input.value === '' ? '' : Number(input.value || 0);
    } else if (field === 'roomName') {
      assignment.roomName = input.value || '';
    }
  });

  return {
    ...(settings || {}),
    teacherCount,
    subjectPools,
    planningTeachers,
    totalDedicatedHours: calculateSchoolTotalHours(subjectPools)
  };
}

async function saveSettings() {
  settings = collectSettings();
  config.optimizerStandalone = { ...(config.optimizerStandalone || {}), ...settings, lastResult: result ? serializeResult(result) : null };
  await window.desktopApi.saveConfig(config);
  alert('전담최적화 조건을 저장했습니다.');
  render();
}

async function runOptimizer() {
  settings = collectSettings();
  result = optimizeDedicatedAssignments(config, settings);
  result.rows = result.rows.map((row) => ({ ...row, roomName: getRoomNameForAssignment(row.teacherCode, row.subject) }));
  config.optimizerStandalone = { ...(config.optimizerStandalone || {}), ...settings, lastResult: serializeResult(result) };
  await window.desktopApi.saveConfig(config);
  render();
}

async function saveEditedResult() {
  if (!result) return;
  const editedRows = result.rows.map((row, rowIndex) => {
    const checked = Array.from(document.querySelectorAll(`input[data-os-result-row="${rowIndex}"]:checked`)).map((input) => input.value);
    return { ...row, recommendedClasses: checked, recommendedHours: calculateCheckedClassHours(row.subject, checked), grades: [...new Set(checked.map((code) => Number(code.split('-')[0])))].sort((a,b) => a-b) };
  });
  result = { ...result, rows: editedRows, summary: { recommendedTotal: editedRows.reduce((s, r) => s + Number(r.recommendedHours || 0), 0), gap: editedRows.reduce((s, r) => s + Number(r.recommendedHours || 0), 0) - Number(result.totalDedicatedHours || 0) } };
  config.optimizerStandalone = { ...(config.optimizerStandalone || {}), ...collectSettings(), lastResult: serializeResult(result) };
  await window.desktopApi.saveConfig(config);
  render();
}

async function applyToTeachers() {
  if (!result) {
    alert('먼저 자동배정을 실행하세요.');
    return;
  }
  const rows = result.rows || [];
  config.teachers = makeTeacherRowsFromResult(rows);
  config.optimizerStandalone = { ...(config.optimizerStandalone || {}), ...collectSettings(), lastResult: serializeResult(result) };
  await window.desktopApi.saveConfig(config);
  alert('전담배정으로 적용했습니다. 화면을 새로고침합니다.');
  window.location.reload();
}

function makeTeacherRowsFromResult(rows) {
  const subjectPools = normalizeSubjectPools(settings?.subjectPools || []);
  const out = [];
  rows.forEach((row) => {
    if (!row.subject || row.subject === '미정') return;
    const groups = new Map();
    (row.recommendedClasses || []).forEach((classCode) => {
      const grade = Number(String(classCode).split('-')[0]);
      const pool = subjectPools.find((item) => item.subject === row.subject);
      const hour = Number(pool?.gradeHours?.[grade] || pool?.gradeHours?.[String(grade)] || 1);
      if (!groups.has(hour)) groups.set(hour, []);
      groups.get(hour).push(classCode);
    });
    groups.forEach((assignedClasses, weeklyHours) => out.push({ teacherCode: row.teacherCode, teacherName: row.teacherName || row.teacherCode, subject: row.subject, roomName: row.roomName || '', weeklyHours, blockPattern: '1', assignedClasses }));
  });
  return out;
}

function serializeResult(res) {
  if (!res) return null;
  return { ...res, rows: (res.rows || []).map((row) => ({ rowId: row.rowId, teacherCode: row.teacherCode, teacherName: row.teacherName, subject: row.subject, roomName: row.roomName || '', targetHours: row.targetHours, recommendedHours: row.recommendedHours, recommendedClasses: row.recommendedClasses, grades: row.grades, warnings: row.warnings, fixedTargetHours: row.fixedTargetHours, preferredGrades: row.preferredGrades })) };
}

function restoreResult(saved) {
  if (!saved?.rows) return null;
  return { ...saved, rows: saved.rows.map((row, index) => ({ ...row, index, recommendedClasses: row.recommendedClasses || [], grades: row.grades || [], warnings: row.warnings || [] })) };
}

function normalizeSubjectPoolsForUI(items = []) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const raw = item.gradeHours || item.hours || {};
    const gradeHours = {};
    for (let grade = 1; grade <= 6; grade += 1) {
      const hour = Number(raw[grade] ?? raw[String(grade)] ?? 0);
      if (hour > 0) gradeHours[grade] = hour;
    }
    if (!Object.keys(gradeHours).length && Array.isArray(item.grades)) item.grades.forEach((g) => { if (Number(g)) gradeHours[Number(g)] = 1; });
    return { subject: String(item.subject || '').trim(), gradeHours, grades: Object.keys(gradeHours).map(Number).sort((a,b) => a-b) };
  });
}

function makeSubjectOptions(subjectPools, selected) {
  const subjects = normalizeSubjectPools(subjectPools).map((pool) => pool.subject).filter(Boolean);
  return subjects.length ? subjects.map((subject) => `<option value="${escapeAttr(subject)}" ${subject === selected ? 'selected' : ''}>${escapeHtml(subject)}</option>`).join('') : '<option value="">과목 없음</option>';
}

function makeRoomOptions(selected) {
  return ['', ...getRoomNames()].map((room) => `<option value="${escapeAttr(room)}" ${room === selected ? 'selected' : ''}>${escapeHtml(room || '장소 없음')}</option>`).join('');
}

function getRoomNames() {
  const names = [];
  (config?.rooms || []).forEach((room) => { const name = String(room.name || room.roomName || '').trim(); if (name) names.push(name); });
  (config?.specialRooms || []).forEach((room) => { const name = typeof room === 'string' ? room : String(room.name || room.roomName || '').trim(); if (name) names.push(name); });
  (config?.roomAssignments || []).forEach((room) => { const name = String(room.roomName || room.name || '').trim(); if (name) names.push(name); });
  return [...new Set(names)];
}

function getAllowedGradesForSubject(subject, subjectPools) {
  const found = normalizeSubjectPools(subjectPools).find((pool) => pool.subject === subject);
  return found?.grades?.length ? found.grades : [1,2,3,4,5,6];
}

function getRoomNameForAssignment(teacherCode, subject) {
  const teacher = (settings?.planningTeachers || []).find((t) => t.teacherCode === teacherCode);
  return teacher?.assignments?.find((a) => a.subject === subject)?.roomName || '';
}

function calculateSchoolTotalHours(subjectPools) {
  const classMap = makeClassMap(config?.gradeClasses || []);
  return normalizeSubjectPools(subjectPools).reduce((sum, pool) => sum + pool.grades.reduce((s, grade) => s + Number(classMap[grade] || 0) * Number(pool.gradeHours?.[grade] || pool.gradeHours?.[String(grade)] || 0), 0);
}

function calculateCheckedClassHours(subject, classCodes) {
  const pool = normalizeSubjectPools(settings?.subjectPools || []).find((item) => item.subject === subject);
  return (classCodes || []).reduce((sum, code) => {
    const grade = Number(String(code).split('-')[0]);
    return sum + Number(pool?.gradeHours?.[grade] || pool?.gradeHours?.[String(grade)] || 1);
  }, 0);
}

function makeClassMap(gradeClasses) {
  const map = {};
  (gradeClasses || []).forEach((item) => { map[Number(item.grade)] = Number(item.classCount || 0); });
  return map;
}

function findClassConflicts(rows) {
  const owners = new Map();
  (rows || []).forEach((row) => (row.recommendedClasses || []).forEach((classCode) => {
    const key = `${row.subject}__${classCode}`;
    if (!owners.has(key)) owners.set(key, { subject: row.subject, classCode, owners: [] });
    owners.get(key).owners.push(row.teacherCode);
  }));
  return [...owners.values()].filter((item) => item.owners.length > 1);
}

function injectStyles() {
  if (document.getElementById('optimizer-standalone-style')) return;
  const style = document.createElement('style');
  style.id = 'optimizer-standalone-style';
  style.textContent = `
    .app-tabs { grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); }
    .optimizer-standalone-wrap { display:grid; gap:14px; }
    .optimizer-standalone-head { display:flex; justify-content:space-between; gap:14px; align-items:flex-start; padding:16px 18px; border:1px solid var(--line); border-radius:10px; background:var(--panel); box-shadow:var(--shadow); }
    .optimizer-standalone-head h2 { margin:0 0 5px; font-size:18px; }
    .optimizer-standalone-head p { margin:0; color:var(--muted); font-size:13px; line-height:1.45; }
    .os-actions { display:flex; flex-wrap:wrap; gap:7px; justify-content:flex-end; }
    .optimizer-grid-two { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:14px; align-items:start; }
    .optimizer-box { min-width:0; background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px; box-shadow:var(--shadow); }
    .os-section-head { display:flex; justify-content:space-between; gap:10px; align-items:center; margin-bottom:10px; }
    .os-section-head h3 { margin:0; font-size:15px; }
    .os-badge, .os-mini-badges em { display:inline-flex; align-items:center; min-height:24px; padding:4px 8px; border-radius:999px; border:1px solid var(--line); background:var(--panel-soft); color:var(--muted); font-size:12px; font-style:normal; font-weight:800; white-space:nowrap; }
    .os-badge.good { color:#166534; border-color:#86efac; background:#dcfce7; }
    .os-badge.warn { color:#92400e; border-color:#fbbf24; background:#fef3c7; }
    .optimizer-field-row { display:grid; grid-template-columns:80px minmax(0,120px); gap:8px; align-items:center; margin-bottom:10px; color:var(--muted); font-size:13px; font-weight:800; }
    .os-table-scroll { overflow:auto; border:1px solid var(--line-soft); border-radius:9px; margin-bottom:10px; }
    .optimizer-table { width:100%; border-collapse:collapse; min-width:620px; }
    .optimizer-table th, .optimizer-table td { border-bottom:1px solid var(--line-soft); padding:6px; text-align:center; font-size:12px; }
    .optimizer-table tr:last-child td { border-bottom:0; }
    .optimizer-table input, .optimizer-table select, .os-assignment-row input, .os-assignment-row select { width:100%; min-width:0; padding:7px 8px; border:1px solid var(--line); border-radius:8px; background:var(--panel); color:var(--text); }
    .os-teacher-list { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:10px; max-height:520px; overflow:auto; padding-right:2px; }
    .os-teacher-card, .os-result-card { border:1px solid var(--line); border-radius:10px; padding:10px; background:var(--panel-soft); }
    .os-card-head { display:flex; justify-content:space-between; gap:8px; align-items:center; margin-bottom:8px; }
    .os-card-head strong { font-size:14px; }
    .os-assignment-row { display:grid; grid-template-columns:1fr 88px 1fr auto; gap:7px; align-items:start; margin:7px 0; }
    .os-grade-checks { grid-column:1/-1; display:flex; flex-wrap:wrap; gap:6px 10px; color:var(--muted); font-size:12px; font-weight:800; }
    .optimizer-result-box { padding-bottom:12px; }
    #osResultArea { max-height:580px; overflow:auto; padding-right:2px; }
    .os-result-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:10px; align-items:stretch; }
    .os-result-card { min-height:210px; display:flex; flex-direction:column; gap:8px; }
    .os-result-card-head { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; padding-bottom:8px; border-bottom:1px solid var(--line-soft); }
    .os-result-card-head strong { display:block; font-size:15px; color:var(--text); margin-bottom:3px; }
    .os-result-card-head span { display:block; color:var(--muted); font-size:12px; font-weight:800; }
    .os-mini-badges { display:flex; flex-direction:column; gap:4px; align-items:flex-end; }
    .os-mini-badges em { min-height:22px; padding:3px 7px; }
    .os-grade-blocks { display:grid; gap:5px; }
    .os-grade-block { display:grid; grid-template-columns:44px minmax(0,1fr); gap:6px; align-items:start; }
    .os-grade-block strong { color:var(--muted); font-size:12px; padding-top:6px; }
    .os-chip { display:inline-flex; gap:3px; align-items:center; border:1px solid var(--line); border-radius:999px; padding:4px 7px; margin:2px; background:var(--panel); color:var(--text); font-size:12px; font-weight:800; }
    .os-chip input { width:auto; margin:0; }
    .os-chip.is-selected { background:rgba(35,100,216,.14); border-color:var(--primary); color:var(--primary-dark); }
    .os-chip.is-conflict { background:#fee2e2; border-color:#ef4444; color:#991b1b; }
    .os-warning { color:#b45309; font-size:12px; font-weight:800; line-height:1.35; }
    .os-warning.compact { margin:0 0 8px; padding:8px 10px; border:1px solid #fbbf24; border-radius:8px; background:#fffbeb; }
    .is-disabled { opacity:.35; }
    .optimizer-empty { padding:16px; border:1px dashed var(--line); border-radius:9px; color:var(--muted); background:var(--panel-soft); font-size:13px; font-weight:800; }
    body.dark-mode .optimizer-standalone-head,
    body.dark-mode .optimizer-box,
    body.dark-mode .os-teacher-card,
    body.dark-mode .os-result-card,
    body.dark-mode .os-chip,
    body.dark-mode .optimizer-table input,
    body.dark-mode .optimizer-table select,
    body.dark-mode .os-assignment-row input,
    body.dark-mode .os-assignment-row select { background:var(--panel); color:var(--text); border-color:var(--line); }
    body.dark-mode .os-badge,
    body.dark-mode .os-mini-badges em,
    body.dark-mode .optimizer-empty { background:var(--panel-soft); color:var(--muted); border-color:var(--line); }
    body.dark-mode .os-chip.is-selected { background:rgba(59,130,246,.22); color:#bfdbfe; border-color:#60a5fa; }
    body.dark-mode .os-chip.is-conflict { background:rgba(127,29,29,.72); color:#fecaca; border-color:#f87171; }
    body.dark-mode .os-warning.compact { background:rgba(120,53,15,.35); color:#fcd34d; border-color:#92400e; }
    @media (max-width:1100px) { .optimizer-grid-two { grid-template-columns:1fr; } .optimizer-standalone-head { flex-direction:column; } .os-actions { justify-content:flex-start; } }
    @media (max-width:720px) { .os-assignment-row { grid-template-columns:1fr 1fr; } .os-assignment-row button { grid-column:2; } .os-result-grid { grid-template-columns:1fr; } }
  `;
  document.head.appendChild(style);
}

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}
