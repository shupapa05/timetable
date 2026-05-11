import './optimizer-result-compact-patch.js';

// Syncs standalone optimizer apply results into the visible renderer without reloading.
// Kept separate from renderer.js to avoid touching the large legacy renderer module.

let latestAppliedConfig = null;
let originalSaveConfig = null;
let isWrapped = false;

function clone(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return value;
  }
}

function mergeOptimizerAppliedConfig(nextConfig) {
  if (!latestAppliedConfig || !nextConfig) return nextConfig;
  return {
    ...nextConfig,
    teacherCount: latestAppliedConfig.teacherCount ?? nextConfig.teacherCount,
    teachers: Array.isArray(latestAppliedConfig.teachers) ? clone(latestAppliedConfig.teachers) : nextConfig.teachers,
    optimizerStandalone: latestAppliedConfig.optimizerStandalone || nextConfig.optimizerStandalone,
    optimizer: latestAppliedConfig.optimizer || nextConfig.optimizer
  };
}

function wrapDesktopSaveConfig() {
  if (isWrapped || !window.desktopApi?.saveConfig) return;
  originalSaveConfig = window.desktopApi.saveConfig.bind(window.desktopApi);
  window.desktopApi.saveConfig = async (nextConfig) => {
    return originalSaveConfig(mergeOptimizerAppliedConfig(nextConfig));
  };
  isWrapped = true;
}

function html(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function groupTeachers(rows = []) {
  const map = new Map();
  rows.forEach((row, index) => {
    const code = String(row.teacherCode || `전담${index + 1}`).trim();
    if (!map.has(code)) {
      map.set(code, {
        teacherCode: code,
        teacherName: row.teacherName || code,
        rows: []
      });
    }
    map.get(code).rows.push(row);
  });
  return [...map.values()];
}

function renderTeacherArea(config) {
  const area = document.getElementById('teacherArea');
  if (!area || !config) return;

  const groups = groupTeachers(config.teachers || []);
  if (!groups.length) {
    area.innerHTML = '<div class="empty-state">전담 배정 내용이 없습니다.</div>';
    return;
  }

  area.innerHTML = groups.map((teacher) => `
    <div class="teacher-card optimizer-synced-card">
      <div class="teacher-card-head">
        <div>
          <strong>${html(teacher.teacherCode)}</strong>
          <span>${html(teacher.teacherName || teacher.teacherCode)}</span>
        </div>
        <em>${teacher.rows.length}개 배정</em>
      </div>
      <div class="teacher-assignment-list">
        ${teacher.rows.map((row) => `
          <div class="assignment-row optimizer-synced-row">
            <div class="assignment-main">
              <strong>${html(row.subject || '과목 없음')}</strong>
              <span>${html(row.roomName || '교실')}</span>
            </div>
            <div class="assignment-meta">
              <span>주 ${Number(row.weeklyHours || 1)}시간</span>
              <span>${(row.assignedClasses || []).length}개 학급</span>
            </div>
            <div class="assignment-classes">
              ${(row.assignedClasses || []).map((code) => `<span class="chip is-selected">${html(code)}</span>`).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

function updateSummary(config) {
  const teacherCountEl = document.getElementById('teacherCount');
  if (teacherCountEl) {
    const count = Number(config.teacherCount || groupTeachers(config.teachers || []).length || 0);
    teacherCountEl.textContent = `${count}명`;
  }
}

function showApplyStatus() {
  const dock = document.getElementById('quickDockStatus');
  if (!dock) return;
  const oldText = dock.textContent;
  dock.textContent = '전담배정 적용 완료';
  setTimeout(() => {
    if (dock.textContent === '전담배정 적용 완료') dock.textContent = oldText || '저장 준비';
  }, 1400);
}

function handleApplied(event) {
  const config = event?.detail?.config || window.__optimizerStandaloneAppliedConfig;
  if (!config) return;
  latestAppliedConfig = clone(config);
  wrapDesktopSaveConfig();
  renderTeacherArea(config);
  updateSummary(config);
  showApplyStatus();
}

wrapDesktopSaveConfig();
document.addEventListener('optimizerStandalone:applied', handleApplied);
