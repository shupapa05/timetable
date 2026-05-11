import {
  optimizeDedicatedAssignments,
  normalizeOptimizerSettings,
  normalizePlanningTeachers,
  normalizeSubjectPools
} from './timetable-optimizer.js';

const SUBJECTS = ['', '국어', '도덕', '사회', '수학', '과학', '실과', '체육', '음악', '미술', '영어', '기타'];
let config = null;
let settings = null;
let result = null;

function html(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function boot() {
  injectStyle();
  ensureTab();
  load();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

async function load() {
  config = await window.desktopApi.loadConfig();
  settings = normalizeOptimizerSettings(config || {});
  result = restoreResult(config?.optimizerStandalone?.lastResult || config?.optimizer?.lastResult);
  render();
}

function ensureTab() {
  const nav = document.querySelector('.app-tabs');
  const app = document.querySelector('.app') || document.body;
  if (!nav || !app) return;

  let button = document.getElementById('optimizerStandaloneTab');
  if (!button) {
    button = document.createElement('button');
    button.id = 'optimizerStandaloneTab';
    button.className = 'tab-button';
    button.type = 'button';
    button.dataset.tabTarget = 'optimizerStandalonePanel';
    button.textContent = '전담최적화';
    nav.insertBefore(button, nav.children[2] || null);
  }

  let panel = document.getElementById('optimizerStandalonePanel');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'optimizerStandalonePanel';
    panel.className = 'tab-panel optimizer-standalone-panel';
    panel.innerHTML = '<div id="optimizerStandaloneArea"></div>';
    const teacherTab = document.getElementById('teacherTab');
    if (teacherTab?.parentElement) teacherTab.parentElement.insertBefore(panel, teacherTab.nextSibling);
    else app.appendChild(panel);
  }

  if (button.dataset.optimizerBound === '1') return;
  button.dataset.optimizerBound = '1';
  button.addEventListener('click', (event) => {
    event.preventDefault();
    document.querySelectorAll('.tab-panel').forEach((el) => {
      el.style.display = '';
      el.classList.toggle('active', el.id === 'optimizerStandalonePanel');
    });
    document.querySelectorAll('.app-tabs .tab-button').forEach((el) => {
      el.classList.toggle('active', el.id === 'optimizerStandaloneTab');
    });
    render();
  });
}

function render() {
  const area = document.getElementById('optimizerStandaloneArea');
  if (!area) return;
  if (!settings) {
    area.innerHTML = '<div class="optimizer-empty">설정을 불러오는 중입니다.</div>';
    return;
  }

  const subjectPools = normalizeSubjectPoolsForUI(settings.subjectPools || []);
  const teacherCount = Number(settings.teacherCount || 0);
  const planningTeachers = normalizePlanningTeachers(settings.planningTeachers || [], teacherCount, normalizeSubjectPools(subjectPools));
  settings.planningTeachers = planningTeachers;

  area.innerHTML = `
    <div class="optimizer-standalone-wrap">
      <div class="optimizer-standalone-head">
        <div>
          <h2>전담최적화</h2>
          <p>자동추천을 만든 뒤 전담배정으로 적용합니다.</p>
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
          <div class="os-section-head"><h3>학교 기준 조건</h3><span class="os-badge">총 ${schoolTotal(subjectPools)}시간</span></div>
          <label class="optimizer-field-row"><span>전담 수</span><input id="osTeacherCount" type="number" min="0" value="${teacherCount}"></label>
          <div class="os-table-scroll">
            <table class="optimizer-table">
              <thead><tr><th>과목</th><th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th><th></th></tr></thead>
              <tbody id="osSubjectRows">${subjectPools.map(makeSubjectRow).join('')}</tbody>
            </table>
          </div>
          <button id="osAddSubject" type="button" class="small">+ 과목 추가</button>
        </section>

        <section class="optimizer-box">
          <div class="os-section-head"><h3>전담별 조건</h3><span class="os-badge">${teacherCount}명</span></div>
          <div class="os-teacher-list">${planningTeachers.map((teacher, index) => makeTeacherCard(teacher, index, subjectPools)).join('')}</div>
        </section>
      </div>

      <section class="optimizer-box optimizer-result-box">
        <div class="os-section-head"><h3>자동배정 결과</h3>${result ? resultBadge(result) : '<span class="os-badge muted">대기</span>'}</div>
        <div id="osResultArea">${result ? makeResultHtml(result) : '<div class="optimizer-empty">자동배정을 실행하면 결과가 표시됩니다.</div>'}</div>
      </section>
    </div>`;
  bind();
}

function bind() {
  document.getElementById('optimizerStandaloneReload')?.addEventListener('click', load);
  document.getElementById('optimizerStandaloneSave')?.addEventListener('click', saveSettings);
  document.getElementById('optimizerStandaloneRun')?.addEventListener('click', runOptimizer);
  document.getElementById('optimizerStandaloneApply')?.addEventListener('click', applyToTeachers);
  document.getElementById('osAddSubject')?.addEventListener('click', () => {
    settings = collectSettings({ keepEmpty: true });
    settings.subjectPools.push({ subject: '', gradeHours: {}, grades: [] });
    result = null;
    render();
  });
  document.querySelectorAll('[data-os-remove-subject]').forEach((btn) => btn.addEventListener('click', () => {
    settings = collectSettings({ keepEmpty: true });
    settings.subjectPools.splice(Number(btn.dataset.osRemoveSubject), 1);
    result = null;
    render();
  }));
  document.querySelectorAll('[data-os-add-assignment]').forEach((btn) => btn.addEventListener('click', () => {
    settings = collectSettings();
    const teacherIndex = Number(btn.dataset.osAddAssignment);
    const firstSubject = normalizeSubjectPools(settings.subjectPools || [])[0]?.subject || '';
    settings.planningTeachers[teacherIndex].assignments.push({ subject: firstSubject, fixedTargetHours: '', preferredGrades: [], assignedClasses: [], roomName: '' });
    result = null;
    render();
  }));
  document.querySelectorAll('[data-os-remove-assignment]').forEach((btn) => btn.addEventListener('click', () => {
    settings = collectSettings();
    const [teacherIndex, assignmentIndex] = btn.dataset.osRemoveAssignment.split('-').map(Number);
    settings.planningTeachers[teacherIndex].assignments.splice(assignmentIndex, 1);
    if (!settings.planningTeachers[teacherIndex].assignments.length) settings.planningTeachers[teacherIndex].assignments.push({ subject: '', fixedTargetHours: '', preferredGrades: [], assignedClasses: [], roomName: '' });
    result = null;
    render();
  }));
  document.querySelectorAll('input[data-os-result-row]').forEach((input) => input.addEventListener('change', saveEditedResult));
}

function makeSubjectRow(pool, index) {
  const gradeHours = pool.gradeHours || {};
  const options = SUBJECTS.map((subject) => `<option value="${html(subject)}" ${subject === pool.subject ? 'selected' : ''}>${html(subject || '선택')}</option>`).join('');
  return `<tr>
    <td><select data-os-subject-index="${index}" data-os-field="subject">${options}</select></td>
    ${[1,2,3,4,5,6].map((grade) => `<td><input type="number" min="0" data-os-subject-index="${index}" data-os-field="gradeHours" data-grade="${grade}" value="${Number(gradeHours[grade] || gradeHours[String(grade)] || 0) || ''}" placeholder="-"></td>`).join('')}
    <td><button type="button" class="small" data-os-remove-subject="${index}">삭제</button></td>
  </tr>`;
}

function makeTeacherCard(teacher, teacherIndex, subjectPools) {
  return `<div class="os-teacher-card">
    <div class="os-card-head"><strong>${html(teacher.teacherCode || `전담${teacherIndex + 1}`)}</strong><button type="button" class="small" data-os-add-assignment="${teacherIndex}">+ 과목</button></div>
    ${(teacher.assignments || []).map((assignment, assignmentIndex) => makeAssignmentRow(assignment, teacherIndex, assignmentIndex, subjectPools)).join('')}
  </div>`;
}

function makeAssignmentRow(assignment, teacherIndex, assignmentIndex, subjectPools) {
  const allowedGrades = allowedGradesFor(assignment.subject, subjectPools);
  const subjectOptions = makeSubjectOptions(subjectPools, assignment.subject);
  const roomOptions = makeRoomOptions(assignment.roomName || '');
  return `<div class="os-assignment-row">
    <select data-os-field="assignmentSubject" data-teacher-index="${teacherIndex}" data-assignment-index="${assignmentIndex}">${subjectOptions}</select>
    <input type="number" min="0" data-os-field="fixedTargetHours" data-teacher-index="${teacherIndex}" data-assignment-index="${assignmentIndex}" value="${Number(assignment.fixedTargetHours || 0) || ''}" placeholder="자동시수">
    <select data-os-field="roomName" data-teacher-index="${teacherIndex}" data-assignment-index="${assignmentIndex}">${roomOptions}</select>
    <button type="button" class="small" data-os-remove-assignment="${teacherIndex}-${assignmentIndex}">삭제</button>
    <div class="os-grade-checks">${allowedGrades.map((grade) => `<label><input type="checkbox" data-os-field="preferredGrades" data-teacher-index="${teacherIndex}" data-assignment-index="${assignmentIndex}" value="${grade}" ${assignment.preferredGrades?.includes(grade) ? 'checked' : ''}>${grade}학년</label>`).join('')}</div>
  </div>`;
}

function makeResultHtml(res) {
  const conflicts = findClassConflicts(res.rows || []);
  const warning = conflicts.length ? `<div class="os-warning compact">중복 ${conflicts.length}건</div>` : '';
  return `${warning}<div class="os-result-grid">${(res.rows || []).map((row, rowIndex) => makeResultCard(row, rowIndex, conflicts)).join('')}</div>`;
}

function makeResultCard(row, rowIndex, conflicts) {
  const classMap = makeClassMap(config?.gradeClasses || []);
  return `<div class="os-result-card">
    <div class="os-result-card-head"><div><strong>${html(row.teacherCode)}</strong><span>${html(row.subject)}${row.roomName ? ' · ' + html(row.roomName) : ''}</span></div><div class="os-mini-badges"><em>목표 ${row.targetHours || 0}</em><em>추천 ${row.recommendedHours || 0}</em></div></div>
    ${(row.warnings || []).map((w) => `<div class="os-warning">${html(w)}</div>`).join('')}
    <div class="os-grade-blocks">${[1,2,3,4,5,6].map((grade) => makeResultGrade(row, rowIndex, grade, classMap[grade] || 0, conflicts)).join('')}</div>
  </div>`;
}

function makeResultGrade(row, rowIndex, grade, classCount, conflicts) {
  if (!classCount) return '';
  const disabled = !allowedGradesFor(row.subject, settings?.subjectPools || []).includes(grade);
  const chips = Array.from({ length: classCount }, (_, index) => {
    const classCode = `${grade}-${index + 1}`;
    const checked = (row.recommendedClasses || []).includes(classCode);
    const conflict = conflicts.some((item) => item.subject === row.subject && item.classCode === classCode);
    return `<label class="os-chip ${checked ? 'is-selected' : ''} ${conflict && checked ? 'is-conflict' : ''}"><input type="checkbox" data-os-result-row="${rowIndex}" value="${classCode}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>${index + 1}반</label>`;
  }).join('');
  return `<div class="os-grade-block ${disabled ? 'is-disabled' : ''}"><strong>${grade}학년</strong><div>${chips}</div></div>`;
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
    return { subject: row.querySelector(`[data-os-field="subject"][data-os-subject-index="${index}"]`)?.value || '', gradeHours, grades: Object.keys(gradeHours).map(Number).sort((a,b) => a-b) };
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
    if (field === 'preferredGrades') assignment.preferredGrades = Array.from(document.querySelectorAll(`input[data-os-field="preferredGrades"][data-teacher-index="${teacherIndex}"][data-assignment-index="${assignmentIndex}"]:checked`)).map((el) => Number(el.value)).filter(Boolean);
    if (field === 'assignmentSubject') assignment.subject = input.value;
    if (field === 'fixedTargetHours') assignment.fixedTargetHours = input.value === '' ? '' : Number(input.value || 0);
    if (field === 'roomName') assignment.roomName = input.value || '';
  });
  return { ...(settings || {}), teacherCount, subjectPools, planningTeachers, totalDedicatedHours: schoolTotal(subjectPools) };
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
  result.rows = (result.rows || []).map((row) => ({ ...row, roomName: roomFor(row.teacherCode, row.subject) }));
  config.optimizerStandalone = { ...(config.optimizerStandalone || {}), ...settings, lastResult: serializeResult(result) };
  await window.desktopApi.saveConfig(config);
  render();
}

async function saveEditedResult() {
  if (!result) return;
  const rows = result.rows.map((row, rowIndex) => {
    const checked = Array.from(document.querySelectorAll(`input[data-os-result-row="${rowIndex}"]:checked`)).map((input) => input.value);
    return { ...row, recommendedClasses: checked, recommendedHours: checkedHours(row.subject, checked), grades: [...new Set(checked.map((code) => Number(code.split('-')[0])))].sort((a,b) => a-b) };
  });
  result = { ...result, rows, summary: { recommendedTotal: rows.reduce((s, r) => s + Number(r.recommendedHours || 0), 0) } };
  config.optimizerStandalone = { ...(config.optimizerStandalone || {}), ...collectSettings(), lastResult: serializeResult(result) };
  await window.desktopApi.saveConfig(config);
  render();
}

async function applyToTeachers() {
  if (!result) return alert('먼저 자동배정을 실행하세요.');
  config.teachers = makeTeacherRowsFromResult(result.rows || []);
  config.optimizerStandalone = { ...(config.optimizerStandalone || {}), ...collectSettings(), lastResult: serializeResult(result) };
  await window.desktopApi.saveConfig(config);
  alert('전담배정으로 적용했습니다. 화면을 새로고침합니다.');
  window.location.reload();
}

function makeTeacherRowsFromResult(rows) {
  const pools = normalizeSubjectPools(settings?.subjectPools || []);
  const out = [];
  rows.forEach((row) => {
    if (!row.subject || row.subject === '미정') return;
    const groups = new Map();
    (row.recommendedClasses || []).forEach((classCode) => {
      const grade = Number(String(classCode).split('-')[0]);
      const pool = pools.find((item) => item.subject === row.subject);
      const hour = Number(pool?.gradeHours?.[grade] || pool?.gradeHours?.[String(grade)] || 1);
      if (!groups.has(hour)) groups.set(hour, []);
      groups.get(hour).push(classCode);
    });
    groups.forEach((assignedClasses, weeklyHours) => out.push({ teacherCode: row.teacherCode, teacherName: row.teacherName || row.teacherCode, subject: row.subject, roomName: row.roomName || '', weeklyHours, blockPattern: '1', assignedClasses }));
  });
  return out;
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
  return subjects.length ? subjects.map((subject) => `<option value="${html(subject)}" ${subject === selected ? 'selected' : ''}>${html(subject)}</option>`).join('') : '<option value="">과목 없음</option>';
}

function makeRoomOptions(selected) {
  return ['', ...roomNames()].map((room) => `<option value="${html(room)}" ${room === selected ? 'selected' : ''}>${html(room || '장소 없음')}</option>`).join('');
}

function roomNames() {
  const names = [];
  (config?.rooms || []).forEach((room) => { const name = String(room.name || room.roomName || '').trim(); if (name) names.push(name); });
  (config?.specialRooms || []).forEach((room) => { const name = typeof room === 'string' ? room : String(room.name || room.roomName || '').trim(); if (name) names.push(name); });
  (config?.roomAssignments || []).forEach((room) => { const name = String(room.roomName || room.name || '').trim(); if (name) names.push(name); });
  return [...new Set(names)];
}

function allowedGradesFor(subject, subjectPools) {
  const found = normalizeSubjectPools(subjectPools).find((pool) => pool.subject === subject);
  return found?.grades?.length ? found.grades : [1,2,3,4,5,6];
}

function roomFor(teacherCode, subject) {
  const teacher = (settings?.planningTeachers || []).find((t) => t.teacherCode === teacherCode);
  return teacher?.assignments?.find((a) => a.subject === subject)?.roomName || '';
}

function schoolTotal(subjectPools) {
  const classMap = makeClassMap(config?.gradeClasses || []);
  return normalizeSubjectPools(subjectPools).reduce((sum, pool) => sum + pool.grades.reduce((s, grade) => s + Number(classMap[grade] || 0) * Number(pool.gradeHours?.[grade] || pool.gradeHours?.[String(grade)] || 0), 0), 0);
}

function checkedHours(subject, classCodes) {
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

function resultBadge(res) {
  const recommended = Number(res.summary?.recommendedTotal || 0);
  const target = Number(res.totalDedicatedHours || 0);
  return `<span class="os-badge ${recommended === target ? 'good' : 'warn'}">추천 ${recommended}h / 목표 ${target}h</span>`;
}

function serializeResult(res) {
  if (!res) return null;
  return { ...res, rows: (res.rows || []).map((row) => ({ ...row, roomName: row.roomName || '', recommendedClasses: row.recommendedClasses || [] })) };
}

function restoreResult(saved) {
  if (!saved?.rows) return null;
  return { ...saved, rows: saved.rows.map((row, index) => ({ ...row, index, recommendedClasses: row.recommendedClasses || [], grades: row.grades || [], warnings: row.warnings || [] })) };
}

function injectStyle() {
  if (document.getElementById('optimizer-standalone-style')) return;
  const style = document.createElement('style');
  style.id = 'optimizer-standalone-style';
  style.textContent = `
    .app-tabs{grid-template-columns:repeat(auto-fit,minmax(110px,1fr));}
    .optimizer-standalone-wrap{display:grid;gap:14px;}
    .optimizer-standalone-head,.optimizer-box{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:14px;box-shadow:var(--shadow);}
    .optimizer-standalone-head{display:flex;justify-content:space-between;gap:14px;align-items:flex-start;}
    .optimizer-standalone-head h2{margin:0 0 5px;font-size:18px}.optimizer-standalone-head p{margin:0;color:var(--muted);font-size:13px}
    .os-actions{display:flex;flex-wrap:wrap;gap:7px;justify-content:flex-end}.optimizer-grid-two{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:start}
    .os-section-head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px}.os-section-head h3{margin:0;font-size:15px}
    .os-badge,.os-mini-badges em{display:inline-flex;align-items:center;min-height:24px;padding:4px 8px;border-radius:999px;border:1px solid var(--line);background:var(--panel-soft);color:var(--muted);font-size:12px;font-style:normal;font-weight:800;white-space:nowrap}.os-badge.good{color:#166534;border-color:#86efac;background:#dcfce7}.os-badge.warn{color:#92400e;border-color:#fbbf24;background:#fef3c7}
    .optimizer-field-row{display:grid;grid-template-columns:80px minmax(0,120px);gap:8px;align-items:center;margin-bottom:10px;color:var(--muted);font-size:13px;font-weight:800}
    .os-table-scroll{overflow:auto;border:1px solid var(--line-soft);border-radius:9px;margin-bottom:10px}.optimizer-table{width:100%;border-collapse:collapse;min-width:620px}.optimizer-table th,.optimizer-table td{border-bottom:1px solid var(--line-soft);padding:6px;text-align:center;font-size:12px}
    .optimizer-table input,.optimizer-table select,.os-assignment-row input,.os-assignment-row select{width:100%;min-width:0;padding:7px 8px;border:1px solid var(--line);border-radius:8px;background:var(--panel);color:var(--text)}
    .os-teacher-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;max-height:520px;overflow:auto}.os-teacher-card,.os-result-card{border:1px solid var(--line);border-radius:10px;padding:10px;background:var(--panel-soft)}
    .os-card-head{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px}.os-assignment-row{display:grid;grid-template-columns:1fr 88px 1fr auto;gap:7px;align-items:start;margin:7px 0}.os-grade-checks{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:6px 10px;color:var(--muted);font-size:12px;font-weight:800}
    #osResultArea{max-height:580px;overflow:auto}.os-result-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px}.os-result-card{min-height:210px;display:flex;flex-direction:column;gap:8px}.os-result-card-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;padding-bottom:8px;border-bottom:1px solid var(--line-soft)}.os-result-card-head strong{display:block;font-size:15px}.os-result-card-head span{display:block;color:var(--muted);font-size:12px;font-weight:800}.os-mini-badges{display:flex;flex-direction:column;gap:4px;align-items:flex-end}
    .os-grade-blocks{display:grid;gap:5px}.os-grade-block{display:grid;grid-template-columns:44px minmax(0,1fr);gap:6px;align-items:start}.os-grade-block strong{color:var(--muted);font-size:12px;padding-top:6px}.os-chip{display:inline-flex;gap:3px;align-items:center;border:1px solid var(--line);border-radius:999px;padding:4px 7px;margin:2px;background:var(--panel);color:var(--text);font-size:12px;font-weight:800}.os-chip input{width:auto;margin:0}.os-chip.is-selected{background:rgba(35,100,216,.14);border-color:var(--primary);color:var(--primary-dark)}.os-chip.is-conflict{background:#fee2e2;border-color:#ef4444;color:#991b1b}.os-warning{color:#b45309;font-size:12px;font-weight:800}.os-warning.compact{margin:0 0 8px;padding:8px 10px;border:1px solid #fbbf24;border-radius:8px;background:#fffbeb}.is-disabled{opacity:.35}.optimizer-empty{padding:16px;border:1px dashed var(--line);border-radius:9px;color:var(--muted);background:var(--panel-soft);font-size:13px;font-weight:800}
    @media(max-width:1100px){.optimizer-grid-two{grid-template-columns:1fr}.optimizer-standalone-head{flex-direction:column}.os-actions{justify-content:flex-start}}@media(max-width:720px){.os-assignment-row{grid-template-columns:1fr 1fr}.os-result-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}
