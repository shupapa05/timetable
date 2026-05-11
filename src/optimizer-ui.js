import {
  optimizeDedicatedAssignments,
  normalizeOptimizerSettings,
  getTeacherRowId
} from './timetable-optimizer.js';

let optimizerResult = null;
let currentConfig = null;

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
  renderOptimizerSetup(currentConfig || {});
}

function renderOptimizerSetup(config) {
  const area = document.getElementById('optimizerArea');
  if (!area) return;

  const optimizer = normalizeOptimizerSettings(config);
  const teachers = config.teachers || [];

  if (!teachers.length) {
    area.innerHTML = '<div class="optimizer-empty">전담 배정 탭에서 전담 과목을 먼저 입력하세요.</div>';
    return;
  }

  area.innerHTML = `
    <div class="optimizer-summary">
      <div class="optimizer-card">
        <span>전체 전담 목표 시수</span>
        <strong><input id="optimizerTotalHours" type="number" value="${optimizer.totalDedicatedHours || 0}" class="optimizer-target-input"></strong>
      </div>
      <div class="optimizer-card">
        <span>고정 전담</span>
        <strong>${teachers.filter((teacher, index) => Number(optimizer.teacherTargets[getTeacherRowId(teacher, index)] || 0) > 0).length}명</strong>
      </div>
      <div class="optimizer-card">
        <span>자동 균등 대상</span>
        <strong>${teachers.filter((teacher, index) => Number(optimizer.teacherTargets[getTeacherRowId(teacher, index)] || 0) <= 0).length}명</strong>
      </div>
    </div>

    <table class="optimizer-table">
      <thead>
        <tr>
          <th>전담</th>
          <th>과목</th>
          <th>현재 학급</th>
          <th>고정 목표 시수</th>
        </tr>
      </thead>
      <tbody>
        ${teachers.map((teacher, index) => {
          const rowId = getTeacherRowId(teacher, index);
          return `
            <tr>
              <td>${escapeHtml(teacher.teacherCode || `전담${index + 1}`)}</td>
              <td>${escapeHtml(teacher.subject || '-')}</td>
              <td>${escapeHtml((teacher.assignedClasses || []).join(', ') || '-')}</td>
              <td>
                <input
                  class="optimizer-target-input"
                  type="number"
                  min="0"
                  data-row-id="${escapeAttr(rowId)}"
                  value="${Number(optimizer.teacherTargets[rowId] || 0) || ''}"
                  placeholder="자동">
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>

    <div id="optimizerResultArea"></div>
  `;
}

function runOptimizer() {
  if (!currentConfig) return;

  const teacherTargets = {};
  document.querySelectorAll('.optimizer-target-input[data-row-id]').forEach((input) => {
    teacherTargets[input.dataset.rowId] = Number(input.value || 0);
  });

  const totalDedicatedHours = Number(document.getElementById('optimizerTotalHours')?.value || 0);

  optimizerResult = optimizeDedicatedAssignments(currentConfig, {
    totalDedicatedHours,
    teacherTargets
  });

  renderOptimizerResult(optimizerResult);
}

function renderOptimizerResult(result) {
  const area = document.getElementById('optimizerResultArea');
  if (!area || !result) return;

  area.innerHTML = `
    <div class="panel-head">
      <h2>추천 결과</h2>
    </div>

    <table class="optimizer-table">
      <thead>
        <tr>
          <th>전담</th>
          <th>과목</th>
          <th>추천 학년</th>
          <th>추천 학급</th>
          <th>추천 시수</th>
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

  optimizerResult.rows.forEach((row, index) => {
    const teacher = currentConfig.teachers[index];
    if (!teacher) return;
    teacher.assignedClasses = row.recommendedClasses;
  });

  currentConfig.optimizer = {
    totalDedicatedHours: optimizerResult.totalDedicatedHours,
    teacherTargets: Object.fromEntries(
      optimizerResult.rows.map((row) => [row.rowId, row.targetHours])
    )
  };

  await window.desktopApi.saveConfig(currentConfig);
  alert('추천 결과를 전담 배정에 적용했습니다. 새로고침 후 확인하세요.');
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
