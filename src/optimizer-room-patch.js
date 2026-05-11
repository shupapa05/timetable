const ROOM_PATCH_STATE = {
  originalSaveConfig: null,
  observer: null,
  lastConfig: null,
  injectTimer: null
};

initOptimizerRoomPatch();

function initOptimizerRoomPatch() {
  if (window.__optimizerRoomPatchLoaded) return;
  window.__optimizerRoomPatchLoaded = true;

  injectRoomPatchStyles();
  patchSaveConfig();

  document.addEventListener('DOMContentLoaded', () => {
    startRoomPatchLoop();
  });

  if (document.readyState !== 'loading') {
    startRoomPatchLoop();
  }
}

function injectRoomPatchStyles() {
  if (document.getElementById('optimizer-room-patch-style')) return;
  const style = document.createElement('style');
  style.id = 'optimizer-room-patch-style';
  style.textContent = `
    .optimizer-assignment-line {
      display: grid !important;
      grid-template-columns: minmax(112px, 1.1fr) minmax(92px, 0.8fr) minmax(104px, 1fr) auto !important;
      gap: 10px !important;
      align-items: start !important;
    }

    .optimizer-assignment-line > select[data-opt-field="subject"],
    .optimizer-assignment-line > input[data-opt-field="fixedTargetHours"],
    .optimizer-assignment-line > .optimizer-room-select {
      width: 100% !important;
      min-width: 0 !important;
    }

    .optimizer-assignment-line > .optimizer-grade-checks {
      grid-column: 1 / -1 !important;
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 8px 12px !important;
      min-width: 0 !important;
      padding-top: 2px !important;
    }

    .optimizer-assignment-line > button[data-remove-assignment] {
      grid-column: 4 !important;
      grid-row: 1 !important;
      min-width: 54px !important;
      padding-left: 10px !important;
      padding-right: 10px !important;
      white-space: nowrap !important;
      justify-self: end !important;
    }

    .optimizer-room-select {
      grid-column: 3 !important;
      grid-row: 1 !important;
    }

    @media (max-width: 1200px) {
      .optimizer-assignment-line {
        grid-template-columns: 1fr 0.8fr auto !important;
      }
      .optimizer-room-select {
        grid-column: 1 / 3 !important;
        grid-row: 2 !important;
      }
      .optimizer-assignment-line > .optimizer-grade-checks {
        grid-row: 3 !important;
      }
      .optimizer-assignment-line > button[data-remove-assignment] {
        grid-column: 3 !important;
        grid-row: 1 / 3 !important;
        align-self: center !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function startRoomPatchLoop() {
  injectRoomPatchStyles();
  refreshAndInjectRoomSelects();
  observeOptimizerArea();

  let count = 0;
  clearInterval(ROOM_PATCH_STATE.injectTimer);
  ROOM_PATCH_STATE.injectTimer = setInterval(() => {
    count += 1;
    injectRoomPatchStyles();
    refreshAndInjectRoomSelects();
    observeOptimizerArea();
    if (count >= 20) clearInterval(ROOM_PATCH_STATE.injectTimer);
  }, 300);
}

function patchSaveConfig() {
  if (!window.desktopApi?.saveConfig || ROOM_PATCH_STATE.originalSaveConfig) return;
  ROOM_PATCH_STATE.originalSaveConfig = window.desktopApi.saveConfig.bind(window.desktopApi);

  window.desktopApi.saveConfig = async (config) => {
    const enriched = enrichConfigWithOptimizerRooms(config || {});
    ROOM_PATCH_STATE.lastConfig = enriched;
    return ROOM_PATCH_STATE.originalSaveConfig(enriched);
  };
}

async function refreshAndInjectRoomSelects() {
  try {
    if (!window.desktopApi?.loadConfig) return;
    const config = await window.desktopApi.loadConfig();
    ROOM_PATCH_STATE.lastConfig = config || {};
    injectRoomSelects(ROOM_PATCH_STATE.lastConfig);
  } catch (error) {
    console.warn('[optimizer-room-patch] 장소 선택 주입 실패:', error);
  }
}

function observeOptimizerArea() {
  const area = document.getElementById('optimizerArea');
  if (!area || ROOM_PATCH_STATE.observer) return;

  ROOM_PATCH_STATE.observer = new MutationObserver(() => {
    injectRoomPatchStyles();
    injectRoomSelects(ROOM_PATCH_STATE.lastConfig || {});
  });
  ROOM_PATCH_STATE.observer.observe(area, { childList: true, subtree: true });
}

function injectRoomSelects(config = {}) {
  injectRoomPatchStyles();
  const roomNames = getRoomNames(config);
  const lines = document.querySelectorAll('.optimizer-assignment-line');

  lines.forEach((line) => {
    const subjectSelect = line.querySelector('select[data-opt-field="subject"]');
    if (!subjectSelect) return;

    const teacherIndex = subjectSelect.dataset.teacherIndex;
    const assignmentIndex = subjectSelect.dataset.assignmentIndex;
    if (line.querySelector(`select[data-opt-field="roomName"][data-teacher-index="${teacherIndex}"][data-assignment-index="${assignmentIndex}"]`)) return;

    const savedRoomName = getSavedAssignmentRoomName(config, teacherIndex, assignmentIndex);
    const select = document.createElement('select');
    select.className = 'optimizer-text-input optimizer-room-select';
    select.dataset.optField = 'roomName';
    select.dataset.teacherIndex = teacherIndex;
    select.dataset.assignmentIndex = assignmentIndex;
    select.innerHTML = makeRoomOptions(roomNames, savedRoomName);
    select.title = '특별실/장소';
    select.addEventListener('change', () => saveAssignmentRoomName(Number(teacherIndex), Number(assignmentIndex), select.value));

    const removeButton = line.querySelector('[data-remove-assignment]');
    if (removeButton) {
      line.insertBefore(select, removeButton);
    } else {
      line.appendChild(select);
    }
  });
}

function makeRoomOptions(roomNames = [], selected = '') {
  const unique = ['', ...new Set(roomNames.filter(Boolean))];
  return unique.map((roomName) => {
    const label = roomName || '장소 없음';
    return `<option value="${escapeAttr(roomName)}" ${roomName === selected ? 'selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
}

function getRoomNames(config = {}) {
  const fromRooms = Array.isArray(config.rooms)
    ? config.rooms.map((room) => room.name || room.roomName || '').filter(Boolean)
    : [];
  const fromSpecialRooms = Array.isArray(config.specialRooms)
    ? config.specialRooms.map((room) => typeof room === 'string' ? room : (room.name || room.roomName || '')).filter(Boolean)
    : [];
  const fromRoomAssignments = Array.isArray(config.roomAssignments)
    ? config.roomAssignments.map((room) => room.roomName || room.name || '').filter(Boolean)
    : [];
  return [...new Set([...fromRooms, ...fromSpecialRooms, ...fromRoomAssignments])];
}

function getSavedAssignmentRoomName(config = {}, teacherIndex, assignmentIndex) {
  const assignment = config.optimizer?.planningTeachers?.[Number(teacherIndex)]?.assignments?.[Number(assignmentIndex)];
  return String(assignment?.roomName || '').trim();
}

async function saveAssignmentRoomName(teacherIndex, assignmentIndex, roomName) {
  try {
    if (!window.desktopApi?.loadConfig || !window.desktopApi?.saveConfig) return;
    const config = await window.desktopApi.loadConfig();
    config.optimizer = config.optimizer || {};
    config.optimizer.planningTeachers = config.optimizer.planningTeachers || [];
    const teachers = config.optimizer.planningTeachers;
    const assignment = teachers?.[teacherIndex]?.assignments?.[assignmentIndex];
    if (assignment) assignment.roomName = roomName || '';
    await window.desktopApi.saveConfig(enrichConfigWithOptimizerRooms(config));
    ROOM_PATCH_STATE.lastConfig = config;
  } catch (error) {
    console.warn('[optimizer-room-patch] 장소 저장 실패:', error);
  }
}

function enrichConfigWithOptimizerRooms(config = {}) {
  const roomMap = makeAssignmentRoomMap(config);
  if (!roomMap.size) return config;

  const next = { ...config };
  if (Array.isArray(config.teachers)) {
    next.teachers = config.teachers.map((teacher) => ({
      ...teacher,
      roomName: String(teacher.roomName || '').trim() || roomMap.get(makeRoomKey(teacher.teacherCode, teacher.subject)) || ''
    }));
  }

  if (config.optimizer?.lastResult?.rows) {
    next.optimizer = { ...(config.optimizer || {}) };
    next.optimizer.lastResult = {
      ...(config.optimizer.lastResult || {}),
      rows: config.optimizer.lastResult.rows.map((row) => ({
        ...row,
        roomName: String(row.roomName || '').trim() || roomMap.get(makeRoomKey(row.teacherCode, row.subject)) || ''
      }))
    };
  }

  return next;
}

function makeAssignmentRoomMap(config = {}) {
  const map = new Map();
  const planningTeachers = config.optimizer?.planningTeachers || [];
  planningTeachers.forEach((teacher, teacherIndex) => {
    const teacherCode = teacher.teacherCode || `전담${teacherIndex + 1}`;
    (teacher.assignments || []).forEach((assignment) => {
      const roomName = String(assignment.roomName || '').trim();
      if (!roomName) return;
      map.set(makeRoomKey(teacherCode, assignment.subject), roomName);
    });
  });
  return map;
}

function makeRoomKey(teacherCode, subject) {
  return `${String(teacherCode || '').trim()}__${String(subject || '').trim()}`;
}

function escapeHtml(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}
