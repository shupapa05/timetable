import {
  optimizeDedicatedAssignments,
  normalizeOptimizerSettings,
  normalizePlanningTeachers
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
  renderOptimizerSetup(currentConfig || {}, optimizerSettings);
}

function renderOptimizerSetup(config, settings) {
  const area = document.getElementById('optimizerArea');
  if (!area) return;

  const optimizer = settings || normalizeOptimizerSettings(config);
  const teacherCount = Number(optimizer.teacherCount || 0);
  const planningTeachers = normalizePlanningTeachers(optimizer.planningTeachers || [], teacherCount);
  const fixedCount = planningTeachers.filter((teacher) => Number(teacher.fixedTargetHours || 0) > 0).length;
  const autoCount = planningTeachers.length - fixedCount;

  area.innerHTML = `
    <div class="optimizer-summary">
      <label class="optimizer-card">
        <span>전담 수</span>
        <strong><input id="optimizerTeacherCount" type="number" min="0" value="${teacherCount}" class="optimizer-target-input"></strong>
      </label>
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
      과목은 선택하지 않아도 됩니다. 고정 총시수를 입력한 전담은 그대로 두고, 빈 전담은 남은 시수를 균등하게 맞추는 방향으로 추천합니다.
      전체 목표시수는 직접 입력하지 않고, 입력된 조건을 기준으로 자동 계산합니다.
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
                ${SUBJECT_OPTIONS.map((subject) => `<option value="${escapeAttr(subject)}" ${subject === (teacher.subject || '') ? 'selected' : ''}>${subject || '선택 안 함'}</option>`).join('')}
              </select>
            </td>
            <td><input class="optimizer-target-input" type="number" min="0" data-opt-field="fixedTargetHours" data-index="${index}" value="${Number(teacher.fixedTargetHours || 0) || ''}" placeholder="자동"></td>
            <td>
              <div class="optimizer-grade-checks">
                ${[1, 2, 3, 4, 5, 6].map((grade) => `
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

  document.getElementById('optimizerTeacherCount')?.addEventListener('change', () => {
    const next = collectOptimizerSettingsFromUI();
    next.teacherCount = Number(document.getElementById('optimizerTeacherCount')?.value || 0);
    next.planningTeachers = normalizePlanningTeachers(next.planningTeachers, next.teacherCount);
    optimizerSettings = next;
    renderOptimizerSetup(currentConfig || {}, optimizerSettings);
  });
}

function collectOptimizerSettingsFromUI() {
  const teacherCount = Number(document.getElementById('optimizerTeacherCount')?.value || optimizerSettings?.teacherCount || 0);
  const planningTeachers = normalizePlanningTeachers(optimizerSettings?.planningTeachers || [], teacherCount);

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
  renderOptimizerResult(optimizerResult);
}

function renderOptimizerResult(result) {
  const area = document.getElementById('optimizerResultArea');
  if (!area || !result) return;

  area.innerHTML = `
    <div class="panel-head optimizer-result-head">
      <div>
        <h2>추천 결과</h2>
        <p class="panel-note">추천 총시수 ${result.summary.recommendedTotal}시간 / 자동 목표 ${result.totalDedicatedHours}시간</p>
      </div>
    </div>

    <table class="optimizer-table">
      <thead>
        <tr>
          <th>전담</th>
          <th>과목</th>
          <th>추천 학년</th>
          <th>추천 학급</th>
          <th>목표</th>
          <th>추천</th>
          <th>상태</th>
        </tr>
      </thead>
      <tbody>
        ${result.rows.map((row) => `
          <tr>
            <td>${escapeHtml(row.teacherCode)}</td>
            <td>${escapeHtml(row.subject)}</td>
            <td>${escapeHtml(row.grades.join(', ') || '-')}</td>
            <td>${escapeHtml(row.recommendedClasses.join(', ') || '-')}</td>
            <td>${row.targetHours}</td>
            <td>${row.recommendedHours}</td>
            <td>
              ${row.warnings.length
                ? row.warnings.map((warning) => `<span class="optimizer-warning">${escapeHtml(warning)}</span>`).join('')
                : '<span>적정</span>'}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function applyOptimizerResult() {
  if (!optimizerResult || !currentConfig) {
    alert('먼저 전담 시수 최적화를 실행하세요.');
    return;
  }

  currentConfig.teachers = optimizerResult.rows.map((row) => ({
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
      rows: optimizerResult.rows.map((row) => ({
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
  alert('추천 결과를 전담 배정에 적용했습니다. 전담 배정 탭에서 확인하세요.');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}
