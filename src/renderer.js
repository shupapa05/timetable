import {
  buildRecoveryCandidates,
  buildTimetableCandidates,
  inspectConfig,
  DAYS,
  PERIODS,
  getDefaultConfig,
  getDefaultWeeklySchedule,
  normalizeConfig
} from './timetable-core.js';

const SUBJECT_OPTIONS = [
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

let appConfig = getDefaultConfig();
let lastResult = null;
let timetableCandidates = [];
let configIssues = [];
let autoSaveTimer = null;
let isLoadingConfig = false;
let profileList = [];
let activeDragLesson = null;
let activeTimetableAreaId = 'timetableArea';
let activeRoomAreaId = 'roomTimetableArea';
let activeUnplacedAreaId = 'unplacedArea';
let activeWarningAreaId = 'warningArea';
let manualLessonTeacherFilter = 'all';
let timetableUndoStack = [];

document.addEventListener('DOMContentLoaded', async () => {
  isLoadingConfig = true;
  const saved = await window.desktopApi.loadConfig();
  appConfig = normalizeConfig(saved || getDefaultConfig());
  applyTheme(appConfig.viewOptions?.theme || 'light');
  renderAll();
  await refreshProfileList();
  isLoadingConfig = false;

  document.getElementById('addRoomBtn').addEventListener('click', () => {
    appConfig.rooms.push({ name: '', capacity: 1 });
    renderRooms();
    updateSummary();
    focusLastRoomNameInput();
  });

  document.getElementById('addTeacherBtn').addEventListener('click', () => {
    collectTeachers();
    appConfig.teachers.push(makeEmptyAssignment(getNextTeacherCode()));
    renderTeachers();
    updateSummary();
  });

  document.getElementById('schoolNameInput')?.addEventListener('change', () => {
    collectSchoolProfile();
    scheduleAutoSave();
  });

  document.getElementById('schoolYearInput')?.addEventListener('change', () => {
    collectSchoolProfile();
    scheduleAutoSave();
  });

  document.getElementById('profileSaveBtn')?.addEventListener('click', saveSchoolYearProfile);
  document.getElementById('profileLoadBtn')?.addEventListener('click', loadSelectedProfile);
  document.getElementById('profileRenameBtn')?.addEventListener('click', renameSelectedProfile);
  document.getElementById('profileDeleteBtn')?.addEventListener('click', deleteSelectedProfile);

  document.getElementById('themeToggleBtn')?.addEventListener('click', toggleThemeMode);
  document.getElementById('saveBtn').addEventListener('click', saveConfig);
  document.getElementById('quickUndoBtn')?.addEventListener('click', undoTimetableChange);
  document.getElementById('exportConfigBtn')?.addEventListener('click', exportConfigFile);
  document.getElementById('importConfigBtn')?.addEventListener('click', importConfigFile);
  document.getElementById('sampleConfigBtn')?.addEventListener('click', loadSampleConfig);
  document.getElementById('resetConfigBtn')?.addEventListener('click', resetConfig);
  document.getElementById('excelSaveBtn')?.addEventListener('click', exportExcel);
  document.getElementById('buildBtn').addEventListener('click', build);
  document.getElementById('quickBuildBtn')?.addEventListener('click', build);
  document.getElementById('quickTimetableSaveBtn')?.addEventListener('click', saveCurrentTimetable);
  document.getElementById('saveTimetableBtn')?.addEventListener('click', saveCurrentTimetable);
  document.getElementById('loadTimetableBtn')?.addEventListener('click', loadSavedTimetable);
  document.getElementById('undoTimetableBtn')?.addEventListener('click', undoTimetableChange);
  document.getElementById('weeklyHoursBtn').addEventListener('click', showWeeklyHoursView);
  document.getElementById('manualBlankBtn')?.addEventListener('click', createBlankManualBoard);
  document.getElementById('manualFromAutoBtn')?.addEventListener('click', createManualBoardFromAuto);
  document.getElementById('manualValidateBtn')?.addEventListener('click', validateManualBoard);
  document.getElementById('clearTeacherBoardBtn')?.addEventListener('click', clearSelectedTeacherBoard);
  document.getElementById('validateViewerBtn')?.addEventListener('click', validateViewerBoard);
  const colorModeSelect = document.getElementById('colorModeSelect');
  if (colorModeSelect) {
    colorModeSelect.value = appConfig.viewOptions?.colorMode || 'subject';
    colorModeSelect.addEventListener('change', () => {
      appConfig.viewOptions = { ...(appConfig.viewOptions || {}), colorMode: colorModeSelect.value || 'subject' };
      if (lastResult) renderTimetable(lastResult);
      scheduleAutoSave();
    });
  }
  const manualColorModeSelect = document.getElementById('manualColorModeSelect');
  if (manualColorModeSelect) {
    manualColorModeSelect.value = appConfig.viewOptions?.colorMode || 'subject';
    manualColorModeSelect.addEventListener('change', () => {
      appConfig.viewOptions = { ...(appConfig.viewOptions || {}), colorMode: manualColorModeSelect.value || 'subject' };
      if (lastResult) renderManualWorkspace(lastResult);
      scheduleAutoSave();
    });
  }
  document.getElementById('printPreviewBtn').addEventListener('click', showPrintPreview);
  document.getElementById('directPrintBtn')?.addEventListener('click', printCurrentResult);
  document.querySelectorAll('[data-preset]').forEach((button) => {
    button.addEventListener('click', () => applyRulePreset(button.dataset.preset));
  });
  document.querySelectorAll('.tab-button').forEach((button) => {
    button.addEventListener('click', () => switchTab(button.dataset.tabTarget));
  });

  document.addEventListener('change', () => scheduleAutoSave());
  document.addEventListener('click', (event) => {
    if (event.target.closest('.chip, .teacher-grade-name, .block-cell, .room-class-chip, .room-grade-name, .remove-room, .remove-teacher, .remove-assignment, .add-assignment, #addTeacherBtn, .room-fixed-first')) {
      setTimeout(scheduleAutoSave, 0);
    }
  });
});

function applyTheme(theme) {
  const mode = theme === 'dark' ? 'dark' : 'light';
  document.body.dataset.theme = mode;
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode === 'dark' ? 'dark' : 'light';

  const button = document.getElementById('themeToggleBtn');
  if (button) {
    button.textContent = mode === 'dark' ? '일반 모드' : '다크 모드';
    button.setAttribute('aria-pressed', mode === 'dark' ? 'true' : 'false');
  }
}

function toggleThemeMode() {
  const current = appConfig.viewOptions?.theme === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  appConfig.viewOptions = { ...(appConfig.viewOptions || {}), theme: next };
  applyTheme(next);
  scheduleAutoSave();
}

function makeCleanConfig() {
  const theme = appConfig.viewOptions?.theme || 'light';

  return normalizeConfig({
    school: {
      maxPeriods: 6,
      name: '',
      year: new Date().getFullYear()
    },
    gradeClasses: [1, 2, 3, 4, 5, 6].map((grade) => ({ grade, classCount: 0 })),
    rooms: [],
    teachers: [],
    commonBlocks: [],
    teacherBlocks: [],
    roomBlocks: [],
    roomAssignments: [],
    lockedLessons: [],
    weeklySchedule: getDefaultWeeklySchedule(),
    viewOptions: { colorMode: 'subject', focusHighlight: false, theme },
    rules: {
      lowerGradeMorningFirst: true,
      subjectFirst: true,
      sameGradeFirst: true,
      classNumberOrder: true,
      balanceDays: true,
      maxDailyClassLoadEnabled: true,
      maxDailySameSubjectEnabled: true,
      useDoubleBlocks: true,
      roomAssignmentsFirst: false
    }
  });
}

async function resetConfig() {
  if (!confirm('\uD604\uC7AC \uD654\uBA74\uC758 \uC124\uC815\uACFC \uC2DC\uAC04\uD45C \uACB0\uACFC\uB97C \uCD08\uAE30\uD654\uD560\uAE4C\uC694? \uC800\uC7A5\uB41C \uD559\uAD50/\uD559\uB144\uB3C4 \uBAA9\uB85D\uC740 \uC0AD\uC81C\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.')) return;

  appConfig = makeCleanConfig();
  lastResult = null;
  timetableCandidates = [];
  configIssues = [];
  applyTheme(appConfig.viewOptions?.theme || 'light');
  renderAll();
  renderCandidateSelector([], 0);
  resetTimetableViews();
  await window.desktopApi.saveConfig(appConfig);
  setAutoSaveStatus('\uCD08\uAE30\uD654\uB428');
  switchTab('basicTab');
}

function makeSampleConfig() {
  return normalizeConfig({
    school: {
      maxPeriods: 6,
      name: '샘플초등학교',
      year: new Date().getFullYear()
    },
    gradeClasses: [
      { grade: 1, classCount: 1 },
      { grade: 2, classCount: 1 },
      { grade: 3, classCount: 2 },
      { grade: 4, classCount: 2 },
      { grade: 5, classCount: 2 },
      { grade: 6, classCount: 2 }
    ],
    rooms: [
      { name: '과학실', capacity: 1 },
      { name: '영어실', capacity: 1 },
      { name: '체육관', capacity: 1 },
      { name: '도서관', capacity: 1 }
    ],
    teachers: [
      {
        teacherCode: '전담1',
        teacherName: '김과학, 과학전담',
        subject: '과학',
        roomName: '과학실',
        weeklyHours: 2,
        blockPattern: '2',
        assignedClasses: ['3-1', '3-2', '4-1', '4-2', '5-1', '5-2', '6-1', '6-2']
      },
      {
        teacherCode: '전담2',
        teacherName: '이체육, 체육전담',
        subject: '체육',
        roomName: '체육관',
        weeklyHours: 2,
        blockPattern: '2',
        assignedClasses: ['3-1', '3-2', '4-1', '4-2', '5-1', '5-2', '6-1', '6-2']
      },
      {
        teacherCode: '전담3',
        teacherName: '박영어, 영어전담',
        subject: '영어',
        roomName: '영어실',
        weeklyHours: 2,
        blockPattern: '1+1',
        assignedClasses: ['5-1', '5-2']
      },
      {
        teacherCode: '전담4',
        teacherName: '최음악, 음악전담',
        subject: '음악',
        roomName: '',
        weeklyHours: 1,
        blockPattern: '1',
        assignedClasses: ['3-1', '3-2', '4-1', '4-2']
      }
    ],
    commonBlocks: [
      { day: '수', period: 5 }
    ],
    teacherBlocks: [
      { teacherCode: '전담2', day: '금', period: 6 }
    ],
    roomBlocks: [
      { roomName: '도서관', day: '금', period: 6 }
    ],
    roomAssignments: [
      {
        roomName: '도서관',
        fixedFirst: false,
        items: [
          { grade: 1, classCodes: ['1-1'], hours: 1, blockMode: 'single' },
          { grade: 2, classCodes: ['2-1'], hours: 1, blockMode: 'single' },
          { grade: 5, classCodes: ['5-1', '5-2'], hours: 1, blockMode: 'single' }
        ]
      }
    ],
    lockedLessons: [],
    weeklySchedule: getDefaultWeeklySchedule(),
    viewOptions: { colorMode: 'subject', focusHighlight: false, theme: appConfig.viewOptions?.theme || 'light' },
    rules: {
      lowerGradeMorningFirst: true,
      subjectFirst: true,
      sameGradeFirst: true,
      classNumberOrder: true,
      balanceDays: true,
      maxDailyClassLoadEnabled: true,
      maxDailySameSubjectEnabled: true,
      useDoubleBlocks: true,
      roomAssignmentsFirst: false
    }
  });
}

async function loadSampleConfig() {
  if (!confirm('\uC0D8\uD50C \uC124\uC815\uC744 \uBD88\uB7EC\uC62C\uAE4C\uC694? \uD604\uC7AC \uD654\uBA74\uC758 \uBBF8\uC800\uC7A5 \uB0B4\uC6A9\uC740 \uB2EC\uB77C\uC9C8 \uC218 \uC788\uC2B5\uB2C8\uB2E4.')) return;

  appConfig = makeSampleConfig();
  lastResult = null;
  timetableCandidates = [];
  configIssues = [];
  applyTheme(appConfig.viewOptions?.theme || 'light');
  renderAll();
  renderCandidateSelector([], 0);
  resetTimetableViews();
  await window.desktopApi.saveConfig(appConfig);
  setAutoSaveStatus('\uC0D8\uD50C \uC124\uC815 \uBD88\uB7EC\uC634');
  switchTab('basicTab');
}

function applyRulePreset(preset) {
  appConfig.rules = { ...(appConfig.rules || {}) };

  if (preset === 'balance') {
    appConfig.rules.balanceDays = true;
    appConfig.rules.maxDailyClassLoadEnabled = true;
    appConfig.rules.maxDailySameSubjectEnabled = true;
  }

  if (preset === 'minUnplaced') {
    appConfig.rules.balanceDays = false;
    appConfig.rules.maxDailyClassLoadEnabled = false;
    appConfig.rules.maxDailySameSubjectEnabled = false;
    appConfig.rules.lowerGradeMorningFirst = false;
  }

  if (preset === 'block') {
    appConfig.rules.useDoubleBlocks = true;
    appConfig.rules.balanceDays = true;
  }

  if (preset === 'lowerMorning') {
    appConfig.rules.lowerGradeMorningFirst = true;
    appConfig.rules.balanceDays = true;
  }

  scheduleAutoSave();
  alert('조건 프리셋이 적용되었습니다. 시간표 작성을 다시 실행하세요.');
}

function pushTimetableUndo() {
  if (!lastResult) return;
  timetableUndoStack.push(JSON.parse(JSON.stringify(lastResult)));
  if (timetableUndoStack.length > 30) timetableUndoStack.shift();
}

function clearTimetableUndo() {
  timetableUndoStack = [];
}

function undoTimetableChange() {
  const previous = timetableUndoStack.pop();
  if (!previous) {
    alert('되돌릴 작업이 없습니다.');
    return;
  }

  lastResult = previous;
  clearManualCheckWarnings();
  updateDerivedViewsFromCurrentResult();
  renderAllResultViews();
  setValidationStatus('되돌림 완료', 'idle');
}

function createBlankManualBoard() {
  collectSchoolProfile();
  collectGrades();
  collectWeeklySchedule();
  collectTeachers();
  collectRooms(false);
  collectRoomAssignments();

  appConfig = normalizeConfig(appConfig);
  configIssues = inspectConfig(appConfig);
  lastResult = makeBlankManualResult(appConfig);
  timetableCandidates = [];
  clearTimetableUndo();
  renderCandidateSelector([], 0);
  renderViewerWorkspace(lastResult);
  switchTab('timetableTab');
  scheduleAutoSave();
}

function createManualBoardFromAuto() {
  collectSchoolProfile();
  collectGrades();
  collectWeeklySchedule();
  collectTeachers();
  collectRooms(false);
  collectRoomAssignments();

  if (!lastResult) {
    const candidates = buildTimetableCandidates(appConfig, 3);
    lastResult = candidates[0]?.result || null;
    timetableCandidates = candidates;
  }

  if (!lastResult) {
    alert('가져올 시간표가 없습니다.');
    return;
  }

  configIssues = inspectConfig(appConfig);
  renderViewerWorkspace(lastResult);
  switchTab('timetableTab');
}

function validateManualBoard() {
  if (!lastResult) {
    alert('먼저 수동 작성 또는 시간표 작성을 해주세요.');
    return;
  }

  updateDerivedViewsFromCurrentResult();
  renderViewerWorkspace(lastResult);
}

function validateViewerBoard() {
  if (!lastResult) {
    alert('먼저 시간표를 작성하세요.');
    return;
  }

  updateDerivedViewsFromCurrentResult();
  lastResult.warnings = getManualValidationWarnings();
  renderAllResultViews();
  const unplacedCount = (lastResult.unplacedLessons || []).length;
  const warningCount = (lastResult.warnings || []).filter((warning) => !isWeeklyHoursWarning(warning)).length;
  const message = !unplacedCount && !warningCount
    ? '검사 완료: 남은 수업과 문제가 없습니다.'
    : `검사 완료: 남은 수업 ${unplacedCount}개, 확인할 문제 ${warningCount}개`;
  setValidationStatus(message, unplacedCount || warningCount ? 'bad' : 'good');
}

function clearSelectedTeacherBoard() {
  if (!lastResult) {
    alert('먼저 시간표를 작성하거나 자동안을 가져오세요.');
    return;
  }

  const teacherCode = document.getElementById('editTeacherSelect')?.value || '';
  const teacher = findResultTeacher(teacherCode);
  if (!teacher) {
    alert('비울 전담을 선택하세요.');
    return;
  }

  if (!confirm(`${teacher.displayName || teacher.teacherName} 시간표만 빈판으로 바꾸고, 있던 수업은 왼쪽/미배치 목록으로 돌릴까요?`)) return;

  const lessons = [];
  for (let periodIndex = 0; periodIndex < PERIODS.length; periodIndex += 1) {
    for (let dayIndex = 0; dayIndex < DAYS.length; dayIndex += 1) {
      const lesson = getLessonUnitFromCell(teacher.teacherName, dayIndex, periodIndex + 1);
      if (!lesson || lessons.some((item) => isSameLessonPosition(item, lesson))) continue;
      lessons.push(lesson);
    }
  }

  pushTimetableUndo();
  lessons.forEach((lesson) => {
    clearLessonUnit(lesson);
    removeLockForLesson(lesson);
    (lastResult.unplacedLessons ||= []).push(makeUnplacedItemFromLesson(lesson, '선택전담 수동작성'));
  });

  clearManualCheckWarnings();
  updateDerivedViewsFromCurrentResult();
  renderAllResultViews();
}

function renderManualWorkspace(result) {
  renderViewerWorkspace(result);
}

function setValidationStatus(message, tone = 'idle') {
  const area = document.getElementById('validationStatus');
  if (!area) return;
  area.textContent = message;
  area.dataset.tone = tone;
}

function renderViewerWorkspace(result) {
  activeTimetableAreaId = 'timetableArea';
  activeRoomAreaId = 'roomTimetableArea';
  activeUnplacedAreaId = 'unplacedArea';
  activeWarningAreaId = 'warningArea';

  renderManualLessonBank(result?.unplacedLessons || []);
  renderRoomLessonBank(result?.unplacedLessons || []);
  renderTimetable(result, 'timetableArea');
  renderRoomTimetable(result, 'roomTimetableArea');
  renderUnplaced(result?.unplacedLessons || [], 'unplacedArea');
  renderWarnings([...(configIssues || []), ...(result?.warnings || [])], 'warningArea');
  updateSummary();
}

function renderManualLessonBank(items) {
  const area = document.getElementById('manualLessonBank');
  if (!area) return;

  const teacherCodes = (lastResult?.teachers || [])
    .map((teacher) => teacher.teacherName)
    .filter(Boolean)
    .sort(compareTeacherCode);
  if (manualLessonTeacherFilter !== 'all' && !teacherCodes.includes(manualLessonTeacherFilter)) {
    manualLessonTeacherFilter = 'all';
  }
  const visibleItems = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => manualLessonTeacherFilter === 'all' || item.teacher === manualLessonTeacherFilter);

  area.classList.remove('empty');
  area.innerHTML = `
    <div class="manual-bank-head">
      <label>
        <span>전담</span>
        <select id="manualLessonTeacherFilter">
          <option value="all" ${manualLessonTeacherFilter === 'all' ? 'selected' : ''}>전체</option>
          ${teacherCodes.map((teacherCode) => `<option value="${escapeAttr(teacherCode)}" ${manualLessonTeacherFilter === teacherCode ? 'selected' : ''}>${escapeHtml(getTeacherDisplayNameForManual(teacherCode))}</option>`).join('')}
        </select>
      </label>
      <strong>${visibleItems.length} / ${items.length}</strong>
    </div>
    ${items.length ? (visibleItems.length ? visibleItems.map(({ item, index }) => `
      <div class="manual-lesson-card ${isBlockUnit(item) ? 'block-card' : ''}" draggable="true" data-unplaced-index="${index}">
        <strong>${escapeHtml(item.subject)} ${escapeHtml(item.classCode)}</strong>
        <span>${escapeHtml(getTeacherDisplayNameForManual(item.teacher))} · ${escapeHtml(item.unitType)}</span>
        <em>${escapeHtml(item.roomName || '교실')}</em>
      </div>
    `).join('') : '<div class="manual-bank-empty">이 전담의 남은 수업이 없습니다.</div>') : '<div class="manual-bank-empty">배치할 남은 수업이 없습니다.</div>'}
  `;

  area.querySelector('#manualLessonTeacherFilter')?.addEventListener('change', (event) => {
    manualLessonTeacherFilter = event.target.value || 'all';
    renderManualLessonBank(lastResult?.unplacedLessons || []);
  });

  area.querySelectorAll('.manual-lesson-card').forEach((card) => {
    card.addEventListener('dragstart', (event) => {
      const index = Number(card.dataset.unplacedIndex);
      const item = lastResult?.unplacedLessons?.[index];
      if (!item) {
        event.preventDefault();
        return;
      }

      const lesson = makeDragLessonFromUnplaced(item);
      activeDragLesson = { type: 'unplaced', index, lesson };
      event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'unplaced', index }));
      showPlacementHints(lesson);
    });

    card.addEventListener('dragend', () => {
      clearPlacementHints();
      activeDragLesson = null;
    });
  });
}

function renderRoomLessonBank(items) {
  const area = document.getElementById('roomLessonBank');
  if (!area) return;

  const visibleItems = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.teacher === '특별실');

  area.classList.remove('empty');
  area.innerHTML = `
    ${makeRoomGradeCardBankHtml()}
    <div class="manual-bank-head">
      <strong>${visibleItems.length} / ${items.length}</strong>
    </div>
    ${visibleItems.length ? visibleItems.map(({ item, index }) => `
      <div class="manual-lesson-card ${isBlockUnit(item) ? 'block-card' : ''}" draggable="true" data-unplaced-index="${index}">
        <strong>${escapeHtml(item.subject)} ${escapeHtml(item.classCode)}</strong>
        <span>${escapeHtml(item.unitType)}</span>
        <em>${escapeHtml(item.roomName || item.subject || '특별실')}</em>
      </div>
    `).join('') : '<div class="manual-bank-empty">배치할 특별실 카드가 없습니다.</div>'}
  `;

  bindRoomGradeCards(area);

  area.querySelectorAll('.manual-lesson-card').forEach((card) => {
    card.addEventListener('dragstart', (event) => {
      const index = Number(card.dataset.unplacedIndex);
      const item = lastResult?.unplacedLessons?.[index];
      if (!item) {
        event.preventDefault();
        return;
      }

      const lesson = makeDragLessonFromUnplaced(item);
      activeDragLesson = { type: 'unplaced', index, lesson };
      event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'unplaced', index }));
    });

    card.addEventListener('dragend', () => {
      clearPlacementHints();
      activeDragLesson = null;
    });
  });
}

function makeRoomGradeCardBankHtml() {
  return `
    <div class="room-grade-card-bank">
      <strong>학년 카드</strong>
      <div class="room-grade-card-list">
        ${[1, 2, 3, 4, 5, 6].map((grade) => `
          <div class="room-grade-drag-card" draggable="true" data-grade="${grade}">${grade}학년</div>
        `).join('')}
      </div>
    </div>
  `;
}

function bindRoomGradeCards(area) {
  area.querySelectorAll('.room-grade-drag-card').forEach((card) => {
    card.addEventListener('dragstart', (event) => {
      const grade = Number(card.dataset.grade || 0);
      if (!grade) {
        event.preventDefault();
        return;
      }
      activeDragLesson = { type: 'room-grade', grade };
      event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'room-grade', grade }));
    });

    card.addEventListener('dragend', () => {
      clearPlacementHints();
      activeDragLesson = null;
    });
  });
}

function getTeacherDisplayNameForManual(teacherCode) {
  const found = (lastResult?.teachers || []).find((teacher) => teacher.teacherName === teacherCode);
  return found?.displayName || teacherCode;
}

function makeBlankManualResult(config) {
  const teachers = getTeacherCodesFromConfig().map((teacherCode) => {
    const lessons = (config.teachers || []).filter((teacher) => teacher.teacherCode === teacherCode);
    const displayName = lessons.find((lesson) => String(lesson.teacherName || '').trim())?.teacherName || teacherCode;
    const header = makeManualTeacherHeader(displayName, lessons);
    return {
      teacherName: teacherCode,
      displayName,
      header,
      grid: PERIODS.map((period) => DAYS.map((day, dayIndex) => ({
        dayIndex,
        period,
        value: '',
        isBlocked: isTeacherBlocked(config, teacherCode, day, period),
        roomName: '',
        classCode: '',
        subject: '',
        teacher: teacherCode,
        locked: false
      })))
    };
  });

  const rooms = (config.rooms || []).filter((room) => String(room.name || '').trim()).map((room) => ({
    roomName: room.name,
    capacity: Math.max(1, Number(room.capacity || 1)),
    grid: PERIODS.map((period) => DAYS.map((day, dayIndex) => ({
      dayIndex,
      period,
      value: '',
      entries: [],
      isBlocked: isRoomBlockedManual(config, room.name, day, period)
    })))
  }));

  const result = {
    days: DAYS,
    periods: PERIODS,
    teachers,
    rooms,
    lessons: [],
    unplacedLessons: makeManualLessonItems(config),
    warnings: [],
    classTimetables: [],
    classHourSummaries: [],
    teacherLoadSummaries: []
  };

  updateManualResultSummaries(result);
  return result;
}

function makeManualTeacherHeader(displayName, lessons) {
  const subjects = [...new Set((lessons || []).map((lesson) => {
    const grades = (lesson.assignedClasses || []).map((code) => String(code).split('-')[0]).filter(Boolean);
    const gradeText = [...new Set(grades)].join(',');
    return `${lesson.subject || '과목'}${gradeText ? `(${gradeText}학년)` : ''}`;
  }).filter(Boolean))];
  return `${displayName} ${subjects.length ? '(' + subjects.join(', ') + ')' : ''}`.trim();
}

function makeManualLessonItems(config) {
  const items = [];
  (config.teachers || []).forEach((teacher) => {
    const teacherCode = String(teacher.teacherCode || '').trim();
    const subject = String(teacher.subject || '').trim();
    const roomName = String(teacher.roomName || '').trim();
    const weeklyHours = Math.max(0, Number(teacher.weeklyHours || 0));
    const roomHours = roomName ? Math.max(0, Math.min(weeklyHours, Number(teacher.roomHours ?? weeklyHours))) : 0;
    const classHours = Math.max(0, weeklyHours - roomHours);
    if (!teacherCode || !subject || weeklyHours <= 0) return;

    (teacher.assignedClasses || []).forEach((classCode) => {
      pushManualLessonUnits(items, teacherCode, subject, classCode, roomName, roomHours, teacher.blockPattern);
      pushManualLessonUnits(items, teacherCode, subject, classCode, '', classHours, teacher.blockPattern);
    });
  });
  pushManualRoomAssignmentItems(items, config);
  return items;
}

function pushManualLessonUnits(items, teacherCode, subject, classCode, roomName, hours, pattern) {
  getManualUnits(pattern, hours).forEach((unit) => {
    const parsed = parseClassCodeLocal(classCode);
    items.push({
      teacher: teacherCode,
      subject,
      grade: parsed.grade,
      classNo: parsed.classNo,
      classCode,
      unitType: unit === 2 ? '2시간 블록' : '1시간 단일',
      roomName,
      reason: '수동 배치 대기'
    });
  });
}

function pushManualRoomAssignmentItems(items, config) {
  (config.roomAssignments || []).forEach((assignment) => {
    const roomName = String(assignment.roomName || '').trim();
    if (!roomName) return;

    (assignment.items || []).forEach((item) => {
      const classCodes = Array.isArray(item.classCodes) ? item.classCodes.filter(Boolean) : [];
      const hours = Math.max(0, Number(item.hours || 0));
      if (!classCodes.length || !hours) return;

      if (item.hoursMode === 'perGrade') {
        const units = makeRoomAssignmentUnits(hours, item.blockMode);
        units.forEach((unit, index) => {
          pushManualRoomAssignmentUnit(items, roomName, classCodes[index % classCodes.length], unit);
        });
        return;
      }

      classCodes.forEach((classCode) => {
        makeRoomAssignmentUnits(hours, item.blockMode).forEach((unit) => {
          pushManualRoomAssignmentUnit(items, roomName, classCode, unit);
        });
      });
    });
  });
}

function makeRoomAssignmentUnits(hours, blockMode) {
  let total = Math.max(0, Number(hours || 0));
  const units = [];
  if (blockMode === 'double') {
    while (total >= 2) {
      units.push(2);
      total -= 2;
    }
  }
  while (total >= 1) {
    units.push(1);
    total -= 1;
  }
  return units;
}

function pushManualRoomAssignmentUnit(items, roomName, classCode, unit) {
  const parsed = parseClassCodeLocal(classCode);
  items.push({
    teacher: '특별실',
    subject: roomName,
    grade: parsed.grade,
    classNo: parsed.classNo,
    classCode,
    unitType: unit === 2 ? '2시간 블록' : '1시간 단일',
    roomName,
    reason: '특별실 수동 배치 대기'
  });
}

function getManualUnits(pattern, hours) {
  let total = Math.max(0, Number(hours || 0));
  if (!total) return [];
  const parts = String(pattern || '').split('+').map((part) => Number(part.trim())).filter((value) => value === 1 || value === 2);
  if (parts.length && parts.reduce((sum, value) => sum + value, 0) === total) return parts;
  const units = [];
  while (total >= 2) {
    units.push(2);
    total -= 2;
  }
  while (total >= 1) {
    units.push(1);
    total -= 1;
  }
  return units;
}

function parseClassCodeLocal(classCode) {
  const match = String(classCode || '').match(/^(\d+)-(\d+)/);
  return {
    grade: match ? Number(match[1]) : 0,
    classNo: match ? Number(match[2]) : 0
  };
}

function isTeacherBlocked(config, teacherCode, day, period) {
  return (config.commonBlocks || []).some((block) => block.day === day && Number(block.period) === period)
    || (config.teacherBlocks || []).some((block) => String(block.teacherCode || '') === teacherCode && block.day === day && Number(block.period) === period);
}

function isRoomBlockedManual(config, roomName, day, period) {
  return (config.roomBlocks || []).some((block) => String(block.roomName || '') === String(roomName || '') && block.day === day && Number(block.period) === period);
}

function updateManualResultSummaries(result) {
  const previous = lastResult;
  lastResult = result;
  updateDerivedViewsFromCurrentResult();
  lastResult = result || previous;
}

function renderAll() {
  renderSchoolProfile();
  renderGrades();
  renderRooms();
  renderTeachers();
  renderExcludeTimes();
  renderRoomAssignments();
  updateSummary();
}

function renderSchoolProfile() {
  const school = appConfig.school || {};
  const nameInput = document.getElementById('schoolNameInput');
  const yearInput = document.getElementById('schoolYearInput');

  if (nameInput) nameInput.value = school.name || '';
  if (yearInput) yearInput.value = Number(school.year || new Date().getFullYear());
}

function collectSchoolProfile() {
  const nameInput = document.getElementById('schoolNameInput');
  const yearInput = document.getElementById('schoolYearInput');
  const schoolName = String(nameInput?.value || '').trim();
  const schoolYear = Number(yearInput?.value || new Date().getFullYear());

  appConfig.school = {
    ...(appConfig.school || {}),
    name: schoolName,
    year: schoolYear || new Date().getFullYear()
  };
}

async function refreshProfileList(selectedId) {
  if (!window.desktopApi.listProfiles) return;

  profileList = await window.desktopApi.listProfiles();
  const select = document.getElementById('profileSelect');
  if (!select) return;

  const currentId = selectedId || select.value;
  if (!profileList.length) {
    select.innerHTML = '<option value="">학교 설정 없음</option>';
    return;
  }

  select.innerHTML = profileList.map((profile) => {
    const updated = profile.updatedAt ? ' / ' + new Date(profile.updatedAt).toLocaleDateString('ko-KR') : '';
    return '<option value="' + escapeAttr(profile.id) + '">' + escapeHtml(profile.name || profile.id) + escapeHtml(updated) + '</option>';
  }).join('');

  if (currentId && profileList.some((profile) => profile.id === currentId)) {
    select.value = currentId;
  }
}

async function saveSchoolYearProfile() {
  collectCurrentConfigFromScreen();

  const result = await saveCurrentProfile();
  if (!result.ok) {
    alert('학교/연도별 저장에 실패했습니다.');
    return;
  }

  setAutoSaveStatus('학교/연도 저장됨');
  alert((result.profile?.name || '현재 설정') + '으로 저장되었습니다.');
}

function collectCurrentConfigFromScreen() {
  collectSchoolProfile();
  collectGrades();
  collectWeeklySchedule();
  collectTeachers();
  collectRooms(false);
  collectRoomAssignments();
}

async function saveCurrentProfile() {
  if (!window.desktopApi.saveProfile) {
    const saved = await window.desktopApi.saveConfig(appConfig);
    return saved.ok ? { ok: true, profile: null } : saved;
  }

  const result = await window.desktopApi.saveProfile(appConfig);
  if (!result.ok) {
    return result;
  }

  await refreshProfileList(result.profile?.id);
  return result;
}

async function loadSelectedProfile() {
  const select = document.getElementById('profileSelect');
  const profileId = select?.value || '';
  if (!profileId) {
    alert('불러올 학교/연도 설정이 없습니다.');
    return;
  }

  const profile = profileList.find((item) => item.id === profileId);
  const label = profile?.name || '선택한 설정';
  if (!confirm(label + '\uC744 \uBD88\uB7EC\uC62C\uAE4C\uC694? \uD604\uC7AC \uD654\uBA74\uC758 \uBBF8\uC800\uC7A5 \uBCC0\uACBD\uC740 \uBC14\uB00C \uC218 \uC788\uC2B5\uB2C8\uB2E4.')) return;

  const result = await window.desktopApi.loadProfile(profileId);
  if (!result.ok) {
    alert(result.message || '설정을 불러오지 못했습니다.');
    return;
  }

  appConfig = normalizeConfig(result.config || {});
  lastResult = null;
  timetableCandidates = [];
  configIssues = [];
  renderAll();
  await refreshProfileList(profileId);
  renderCandidateSelector([], 0);
  resetTimetableViews();
  setAutoSaveStatus('학교/연도 설정 불러옴');
}

function getSelectedProfile() {
  const select = document.getElementById('profileSelect');
  const profileId = select?.value || '';
  if (!profileId) return null;
  return profileList.find((item) => item.id === profileId) || null;
}

async function renameSelectedProfile() {
  const profile = getSelectedProfile();
  if (!profile) {
    alert('\uC774\uB984\uC744 \uBC14\uAFC0 \uD559\uAD50/\uC5F0\uB3C4 \uC124\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.');
    return;
  }

  const schoolName = prompt('\uC0C8 \uD559\uAD50\uBA85\uC744 \uC785\uB825\uD558\uC138\uC694.', profile.schoolName || '');
  if (schoolName === null) return;

  const yearText = prompt('\uC0C8 \uD559\uB144\uB3C4\uB97C \uC785\uB825\uD558\uC138\uC694.', String(profile.schoolYear || new Date().getFullYear()));
  if (yearText === null) return;

  const nextName = schoolName.trim();
  const nextYear = Number(yearText);
  if (!nextName || !nextYear) {
    alert('\uD559\uAD50\uBA85\uACFC \uD559\uB144\uB3C4\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.');
    return;
  }

  const result = await window.desktopApi.renameProfile({
    profileId: profile.id,
    schoolName: nextName,
    schoolYear: nextYear
  });

  if (!result.ok) {
    alert(result.message || '\uC124\uC815 \uC774\uB984\uC744 \uBC14\uAFB8\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.');
    return;
  }

  appConfig = normalizeConfig(result.config || appConfig);
  renderAll();
  await refreshProfileList(result.profile?.id);
  setAutoSaveStatus('\uC774\uB984 \uBCC0\uACBD\uB428');
  alert((result.profile?.name || '\uC120\uD0DD\uD55C \uC124\uC815') + '\uC73C\uB85C \uC774\uB984\uC744 \uBC14\uAFC4\uC2B5\uB2C8\uB2E4.');
}

async function deleteSelectedProfile() {
  const profile = getSelectedProfile();
  if (!profile) {
    alert('\uC0AD\uC81C\uD560 \uD559\uAD50/\uC5F0\uB3C4 \uC124\uC815\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.');
    return;
  }

  const label = profile.name || profile.id;
  if (!confirm(label + '\uC744 \uC0AD\uC81C\uD560\uAE4C\uC694? \uD604\uC7AC \uD654\uBA74\uC758 \uC124\uC815\uC740 \uC720\uC9C0\uB418\uC9C0\uB9CC, \uC800\uC7A5 \uBAA9\uB85D\uC5D0\uC11C\uB294 \uC0AC\uB77C\uC9D1\uB2C8\uB2E4.')) return;

  const result = await window.desktopApi.deleteProfile(profile.id);
  if (!result.ok) {
    alert(result.message || '\uC124\uC815\uC744 \uC0AD\uC81C\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.');
    return;
  }

  await refreshProfileList();
  setAutoSaveStatus('\uC800\uC7A5 \uC124\uC815 \uC0AD\uC81C\uB428');
  alert('\uC800\uC7A5\uB41C \uC124\uC815\uC744 \uC0AD\uC81C\uD588\uC2B5\uB2C8\uB2E4.');
}

function renderGrades() {
  const area = document.getElementById('gradeArea');
  area.innerHTML = '';

  for (let grade = 1; grade <= 6; grade += 1) {
    const found = appConfig.gradeClasses.find((item) => Number(item.grade) === grade);
    area.insertAdjacentHTML('beforeend', `
      <label class="grade-row">
        <span>${grade}학년</span>
        <input type="number" min="0" max="20" value="${Number(found?.classCount || 0)}" data-grade="${grade}">
      </label>
    `);
  }

  area.querySelectorAll('input').forEach((input) => {
    input.addEventListener('change', () => {
      collectGrades();
      renderTeachers();
      renderRoomAssignments();
      updateSummary();
    });
  });
}

function renderWeeklySchedule(targetArea) {
  const area = targetArea || document.getElementById('weeklyScheduleArea');
  if (!area) return;

  area.innerHTML = makeWeeklyScheduleInputHtml();
  bindWeeklyScheduleInputs(area);
}

function makeWeeklyScheduleInputHtml() {
  const schedule = Array.isArray(appConfig.weeklySchedule) ? appConfig.weeklySchedule : getDefaultWeeklySchedule();
  return `
    <div class="weekly-header">
      <span>학년</span>
      ${DAYS.map((day) => `<span>${day}</span>`).join('')}
      <span>계</span>
    </div>
    ${[1, 2, 3, 4, 5, 6].map((grade) => {
      const found = schedule.find((item) => Number(item.grade) === grade) || getDefaultWeeklySchedule().find((item) => item.grade === grade);
      const daily = found.daily || [];
      const total = daily.reduce((sum, value) => sum + Number(value || 0), 0);
      return `
        <div class="weekly-row" data-grade="${grade}">
          <strong>${grade}학년</strong>
          ${DAYS.map((_day, index) => `<input type="number" min="0" max="6" value="${Number(daily[index] || 0)}" data-day-index="${index}">`).join('')}
          <b class="weekly-total">${total}</b>
        </div>
      `;
    }).join('')}
  `;
}

function bindWeeklyScheduleInputs(area) {
  area.querySelectorAll('.weekly-row input').forEach((input) => {
    input.addEventListener('change', () => {
      updateWeeklyScheduleTotals(area);
    });
  });
}

function updateWeeklyScheduleTotals(area) {
  area.querySelectorAll('.weekly-row').forEach((row) => {
    const total = DAYS.reduce((sum, _day, index) => sum + Number(row.querySelector(`input[data-day-index="${index}"]`)?.value || 0), 0);
    const totalCell = row.querySelector('.weekly-total');
    if (totalCell) totalCell.textContent = total;
  });
}

function renderRooms() {
  const area = document.getElementById('roomArea');
  area.innerHTML = '';

  appConfig.rooms.forEach((room, index) => {
    area.insertAdjacentHTML('beforeend', `
      <div class="room-row" data-index="${index}">
        <input class="room-name" value="${escapeAttr(room.name || '')}" placeholder="특별실명">
        <input class="room-capacity" type="number" min="1" value="${Number(room.capacity || 1)}" title="수용">
        <button class="small remove-room">삭제</button>
      </div>
    `);
  });

  area.querySelectorAll('.room-row').forEach((row) => {
    row.querySelector('.room-name').addEventListener('input', () => {
      collectRooms(false);
      scheduleAutoSave();
    });
    row.querySelector('.room-name').addEventListener('change', collectRooms);
    row.querySelector('.room-capacity').addEventListener('input', () => {
      collectRooms(false);
      scheduleAutoSave();
    });
    row.querySelector('.room-capacity').addEventListener('change', collectRooms);
    row.querySelector('.remove-room').addEventListener('click', () => {
      appConfig.rooms.splice(Number(row.dataset.index), 1);
      renderRooms();
      renderTeachers();
      renderExcludeTimes();
      renderRoomAssignments();
      updateSummary();
    });
  });
}

function focusLastRoomNameInput() {
  const inputs = document.querySelectorAll('#roomArea .room-name');
  const input = inputs[inputs.length - 1];
  if (!input) return;
  input.focus();
  input.select();
}

function renderTeachers() {
  const area = document.getElementById('teacherArea');
  area.innerHTML = '';

  const groups = groupTeachersByCode();

  groups.forEach((group, index) => {
    area.insertAdjacentHTML('beforeend', `
      <div class="teacher-card" data-index="${index}">
        <div class="teacher-card-head">
          <div class="teacher-identity">
            <label>
              <span>전담번호</span>
              ${makeTeacherSelect(group.teacherCode)}
            </label>
            <label>
              <span>표시 이름</span>
              <input class="teacher-display-name" value="${escapeAttr(group.teacherName || group.teacherCode)}" placeholder="예: 김OO, 과학전담">
            </label>
            <div class="teacher-load-badge" data-role="teacher-load">${makeTeacherLoadText(group.assignments)}</div>
          </div>
          <div class="teacher-actions">
            <button class="small add-assignment">과목+</button>
            <button class="small remove-teacher">전담 삭제</button>
          </div>
        </div>

        <div class="assignment-list">
          ${group.assignments.map((teacher, assignmentIndex) => makeAssignmentHtml(teacher, assignmentIndex)).join('')}
        </div>
      </div>
    `);
  });

  area.querySelectorAll('.teacher-card').forEach((card) => {
    const teacherCodeSelect = card.querySelector('.teacher-code');
    if (teacherCodeSelect) {
      teacherCodeSelect.dataset.previousValue = teacherCodeSelect.value;
    }

    const displayNameInput = card.querySelector('.teacher-display-name');
    if (displayNameInput) {
      displayNameInput.addEventListener('input', () => {
        collectTeachers();
        scheduleAutoSave();
      });
    }

    card.querySelectorAll('select, input').forEach((control) => {
      control.addEventListener('change', () => {
        if (control.classList.contains('teacher-code')) {
          if (isDuplicateTeacherCodeSelect(control)) {
            alert('\uC774\uBBF8 \uC0AC\uC6A9 \uC911\uC778 \uC804\uB2F4\uBC88\uD638\uC785\uB2C8\uB2E4.');
            control.value = control.dataset.previousValue || control.value;
            return;
          }
          control.dataset.previousValue = control.value;
        }

        if (control.classList.contains('teacher-hours')) {
          refreshTeacherBlockOptions(control.closest('.assignment-card'));
        }
        if (control.classList.contains('teacher-room')) {
          refreshTeacherRoomHoursInput(control.closest('.assignment-card'));
        }
        if (
          control.classList.contains('teacher-hours')
          || control.classList.contains('teacher-room-hours')
          || control.classList.contains('teacher-room')
          || control.classList.contains('teacher-block')
        ) {
          refreshAssignmentHelp(control.closest('.assignment-card'));
        }
        collectTeachers();
        if (control.classList.contains('teacher-code') || control.classList.contains('teacher-room') || control.classList.contains('teacher-display-name')) {
          renderExcludeTimes();
          renderRoomAssignments();
        }
      });
    });
    card.querySelector('.add-assignment').addEventListener('click', () => {
      collectTeachers();
      const teacherCode = card.querySelector('.teacher-code').value;
      appConfig.teachers.push(makeEmptyAssignment(teacherCode));
      renderTeachers();
      renderExcludeTimes();
      updateSummary();
    });
    card.querySelector('.remove-teacher').addEventListener('click', () => {
      collectTeachers();
      const teacherCode = card.querySelector('.teacher-code').value;
      appConfig.teachers = appConfig.teachers.filter((teacher) => teacher.teacherCode !== teacherCode);
      renderTeachers();
      renderExcludeTimes();
      renderRoomAssignments();
      updateSummary();
    });
    card.querySelectorAll('.remove-assignment').forEach((button) => {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        collectTeachers();
        const teacherCode = card.querySelector('.teacher-code').value;
        const assignmentIndex = Number(button.closest('.assignment-card').dataset.assignmentIndex);
        const sameTeacher = appConfig.teachers.filter((teacher) => teacher.teacherCode === teacherCode);
        const keepOtherTeachers = appConfig.teachers.filter((teacher) => teacher.teacherCode !== teacherCode);
        sameTeacher.splice(assignmentIndex, 1);
        appConfig.teachers = keepOtherTeachers.concat(sameTeacher.length ? sameTeacher : [makeEmptyAssignment(teacherCode)]);
        renderTeachers();
        renderRoomAssignments();
        updateSummary();
      });
    });
    card.querySelectorAll('.assignment-summary').forEach((summary) => {
      summary.addEventListener('click', (event) => {
        if (event.target.closest('button, input, select')) return;
        const assignmentCard = summary.closest('.assignment-card');
        assignmentCard.classList.toggle('collapsed');
      });
    });
    card.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        chip.classList.toggle('active');
        collectTeachers();
      });
    });
    card.querySelectorAll('.teacher-grade-name').forEach((button) => {
      button.addEventListener('click', () => {
        const row = button.closest('.teacher-class-row');
        const chips = Array.from(row.querySelectorAll('.chip'));
        const shouldSelect = chips.some((chip) => !chip.classList.contains('active'));
        chips.forEach((chip) => chip.classList.toggle('active', shouldSelect));
        collectTeachers();
      });
    });

    card.querySelectorAll('.assignment-card').forEach((assignmentCard) => {
      refreshTeacherBlockOptions(assignmentCard);
      refreshTeacherRoomHoursInput(assignmentCard);
      refreshAssignmentHelp(assignmentCard);
    });
  });

  updateTeacherLoadBadges();
}

function renderExcludeTimes() {
  const area = document.getElementById('excludeArea');
  if (!area) return;

  const targetType = area.querySelector('#blockTargetType')?.value || 'teacher';
  const targetValue = area.querySelector('#blockTargetSelect')?.value || '';
  const targets = targetType === 'teacher' ? getTeacherCodesFromConfig() : getRoomNamesFromConfig();
  const selectedTarget = targets.includes(targetValue) ? targetValue : (targets[0] || '');

  area.innerHTML = `
    <div class="exclude-grid-layout">
      <div class="exclude-card">
        <div class="mini-section-title">공통 제외시간</div>
        ${makeBlockGrid('common', '', appConfig.commonBlocks || [])}
      </div>

      <div class="exclude-card">
        <div class="mini-section-title">대상별 제외시간</div>
        <div class="target-block-row">
          <select id="blockTargetType">
            <option value="teacher" ${targetType === 'teacher' ? 'selected' : ''}>전담</option>
            <option value="room" ${targetType === 'room' ? 'selected' : ''}>특별실</option>
          </select>
          <select id="blockTargetSelect">
            ${targets.length
              ? targets.map((target) => `<option value="${escapeAttr(target)}" ${target === selectedTarget ? 'selected' : ''}>${escapeHtml(target)}</option>`).join('')
              : '<option value="">대상 없음</option>'
            }
          </select>
        </div>
        ${makeBlockGrid(targetType, selectedTarget, targetType === 'teacher' ? appConfig.teacherBlocks || [] : appConfig.roomBlocks || [])}
      </div>
    </div>
  `;

  area.querySelector('#blockTargetType').addEventListener('change', renderExcludeTimes);
  area.querySelector('#blockTargetSelect').addEventListener('change', renderExcludeTimes);

  area.querySelectorAll('.block-cell').forEach((cell) => {
    cell.addEventListener('click', () => {
      const type = cell.dataset.type;
      const target = cell.dataset.target || '';
      const day = cell.dataset.day;
      const period = Number(cell.dataset.period);

      toggleBlock(type, target, day, period);
      renderExcludeTimes();
      updateSummary();
    });
  });
}

function makeBlockGrid(type, target, blocks) {
  const rows = PERIODS.map((period) => `
    <tr>
      <th>${period}</th>
      ${DAYS.map((day) => {
        const active = isBlockActive(type, target, blocks, day, period);
        return `
          <td>
            <button
              type="button"
              class="block-cell ${active ? 'active' : ''}"
              data-type="${escapeAttr(type)}"
              data-target="${escapeAttr(target)}"
              data-day="${day}"
              data-period="${period}"
            >${active ? '제외' : ''}</button>
          </td>
        `;
      }).join('')}
    </tr>
  `).join('');

  return `
    <table class="block-grid">
      <thead>
        <tr>
          <th></th>
          ${DAYS.map((day) => `<th>${day}</th>`).join('')}
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function isBlockActive(type, target, blocks, day, period) {
  if (type === 'common') {
    return blocks.some((block) => block.day === day && Number(block.period) === Number(period));
  }

  if (type === 'teacher') {
    return blocks.some((block) => block.teacherCode === target && block.day === day && Number(block.period) === Number(period));
  }

  return blocks.some((block) => block.roomName === target && block.day === day && Number(block.period) === Number(period));
}

function toggleBlock(type, target, day, period) {
  if (type === 'common') {
    appConfig.commonBlocks = toggleBlockItem(appConfig.commonBlocks || [], { day, period }, (block) =>
      block.day === day && Number(block.period) === Number(period)
    );
    return;
  }

  if (!target) return;

  if (type === 'teacher') {
    appConfig.teacherBlocks = toggleBlockItem(appConfig.teacherBlocks || [], { teacherCode: target, day, period }, (block) =>
      block.teacherCode === target && block.day === day && Number(block.period) === Number(period)
    );
    return;
  }

  appConfig.roomBlocks = toggleBlockItem(appConfig.roomBlocks || [], { roomName: target, day, period }, (block) =>
    block.roomName === target && block.day === day && Number(block.period) === Number(period)
  );
}

function toggleBlockItem(items, newItem, isSame) {
  const exists = items.some(isSame);
  return exists ? items.filter((item) => !isSame(item)) : items.concat(newItem);
}

function renderRoomAssignments() {
  const area = document.getElementById('roomAssignmentArea');
  if (!area) return;

  const rooms = getIndependentRoomNamesForAssignment();
  const saved = Array.isArray(appConfig.roomAssignments) ? appConfig.roomAssignments : [];

  if (!rooms.length) {
    area.innerHTML = `${makeRoomLunchSettingsHtml()}<div class="room-assignment-grid"><div class="empty-guide">전담 과목과 연결되지 않은 특별실이 없습니다.</div></div>`;
    bindRoomLunchSettings(area);
    return;
  }

  area.innerHTML = `${makeRoomLunchSettingsHtml()}<div class="room-assignment-grid">${rooms.map((roomName) => {
    const found = saved.find((item) => item.roomName === roomName);
    const items = Array.isArray(found?.items) ? found.items : [];
    const fixedFirst = found?.fixedFirst === true || (appConfig.rules?.roomAssignmentsFirst === true && found?.fixedFirst !== false);

    return `
      <div class="room-assignment-card" data-room-name="${escapeAttr(roomName)}">
        <div class="room-assignment-title">
          <span>${escapeHtml(roomName)}</span>
          <label class="room-fixed-option">
            <input class="room-fixed-first" type="checkbox" ${fixedFirst ? 'checked' : ''}>
            <span>먼저 고정</span>
          </label>
        </div>
        ${makeRoomAssignmentRows(items)}
      </div>
    `;
  }).join('')}</div>`;

  bindRoomLunchSettings(area);

  area.querySelectorAll('.room-class-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const row = chip.closest('.room-grade-row');
      if (row?.dataset.hoursMode === 'perGrade') {
        return;
      }
      chip.classList.toggle('active');
      collectRoomAssignments();
    });
  });

  area.querySelectorAll('.room-grade-name').forEach((button) => {
    button.addEventListener('click', () => {
      const row = button.closest('.room-grade-row');
      const chips = Array.from(row.querySelectorAll('.room-class-chip'));
      if (row.dataset.hoursMode === 'perGrade') {
        chips.forEach((chip) => chip.classList.add('active'));
        collectRoomAssignments();
        return;
      }
      const shouldSelect = chips.some((chip) => !chip.classList.contains('active'));
      chips.forEach((chip) => chip.classList.toggle('active', shouldSelect));
      collectRoomAssignments();
    });
  });

  area.querySelectorAll('.room-hour-input, .room-block-mode, .room-fixed-first').forEach((control) => {
    control.addEventListener('change', collectRoomAssignments);
  });

  area.querySelectorAll('.room-hours-mode').forEach((select) => {
    select.addEventListener('change', () => {
      const row = select.closest('.room-grade-row');
      row.dataset.hoursMode = select.value === 'perGrade' ? 'perGrade' : 'perClass';
      if (select.value === 'perGrade') {
        row.querySelectorAll('.room-class-chip').forEach((chip) => chip.classList.add('active'));
      }
      collectRoomAssignments();
    });
  });
}

function makeRoomLunchSettingsHtml() {
  const enabled = appConfig.roomLunch?.enabled === true;
  const lunchAfterByGrade = getRoomLunchAfterByGrade();
  return `
    <div class="room-lunch-settings">
      <div class="room-assignment-title">
        <span>특별실 시간 기준</span>
        <label class="room-fixed-option">
          <input id="roomLunchEnabled" type="checkbox" ${enabled ? 'checked' : ''}>
          <span>점심 분리 사용</span>
        </label>
      </div>
      <div class="room-lunch-grid">
        ${[1, 2, 3, 4, 5, 6].map((grade) => `
          <label>
            <span>${grade}학년</span>
            <select class="room-lunch-after" data-grade="${grade}" ${enabled ? '' : 'disabled'}>
              ${[3, 4, 5].map((period) => `<option value="${period}" ${Number(lunchAfterByGrade[grade]) === period ? 'selected' : ''}>${period}교시 후 점심</option>`).join('')}
            </select>
          </label>
        `).join('')}
      </div>
    </div>
  `;
}

function bindRoomLunchSettings(area) {
  const enabled = area.querySelector('#roomLunchEnabled');
  enabled?.addEventListener('change', () => {
    collectRoomLunchSettings();
    renderRoomAssignments();
    if (lastResult) renderAllResultViews();
    scheduleAutoSave();
  });

  area.querySelectorAll('.room-lunch-after').forEach((select) => {
    select.addEventListener('change', () => {
      collectRoomLunchSettings();
      if (lastResult) renderAllResultViews();
      scheduleAutoSave();
    });
  });
}

function makeRoomAssignmentRows(savedItems) {
  const grades = appConfig.gradeClasses.filter((item) => Number(item.classCount || 0) > 0);

  if (!grades.length) {
    return '<div class="empty-guide">학급 수를 먼저 입력하세요.</div>';
  }

  return grades.map((gradeItem) => {
    const grade = Number(gradeItem.grade);
    const found = savedItems.find((item) => Number(item.grade) === grade);
    const hoursMode = found?.hoursMode === 'perGrade' ? 'perGrade' : 'perClass';
    const defaultSelected = hoursMode === 'perGrade'
      ? getGradeClassCodes(grade)
      : [];
    const selected = Array.isArray(found?.classCodes) && found.classCodes.length ? found.classCodes : defaultSelected;
    const hours = Number(found?.hours || 1);
    const blockMode = found?.blockMode || 'single';

    const chips = Array.from({ length: Number(gradeItem.classCount || 0) }, (_value, index) => {
      const classCode = `${grade}-${index + 1}`;
      return `<button type="button" class="room-class-chip ${selected.includes(classCode) ? 'active' : ''}" data-class-code="${classCode}">${index + 1}반</button>`;
    }).join('');

    return `
      <div class="room-grade-row" data-grade="${grade}" data-hours-mode="${hoursMode}">
        <button type="button" class="room-grade-name" title="${grade}학년 전체 선택/해제">${grade}학년</button>
        <div class="room-class-list">${chips}</div>
        <select class="room-hours-mode" title="시간 기준">
          <option value="perClass" ${hoursMode === 'perClass' ? 'selected' : ''}>반별</option>
          <option value="perGrade" ${hoursMode === 'perGrade' ? 'selected' : ''}>학년총량</option>
        </select>
        <input class="room-hour-input" type="number" min="1" value="${hours}" title="반별 또는 학년총량 시간">
        <select class="room-block-mode" title="배정 방식">
          <option value="single" ${blockMode === 'single' ? 'selected' : ''}>1+1</option>
          <option value="double" ${blockMode === 'double' ? 'selected' : ''}>2</option>
        </select>
      </div>
    `;
  }).join('');
}

function makeAssignmentHtml(teacher, assignmentIndex) {
  const hours = Number(teacher.weeklyHours || 1);
  const savedRoomHours = teacher.roomHours;
  const defaultRoomHours = teacher.roomName ? hours : 0;
  const roomHours = clampRoomHoursForWeeklyHours(
    savedRoomHours === undefined || savedRoomHours === null || savedRoomHours === ''
      ? defaultRoomHours
      : savedRoomHours,
    hours
  );
  const blockPattern = normalizeBlockPatternForHours(teacher.blockPattern, hours);
  const selectedCount = (teacher.assignedClasses || []).length;
  const collapsedClass = assignmentIndex === 0 ? '' : ' collapsed';
  const classSummary = summarizeAssignedClasses(teacher.assignedClasses || []);

  return `
    <div class="assignment-card${collapsedClass}" data-assignment-index="${assignmentIndex}">
      <div class="assignment-summary" role="button" tabindex="0" title="클릭해서 반 선택 열기/닫기">
        <div>
          <strong>${escapeHtml(teacher.subject || '과목')}</strong>
          <span>${escapeHtml(teacher.roomName || '교실')} · ${hours}시간 · ${blockPattern} · ${escapeHtml(classSummary)}</span>
        </div>
        <em>${selectedCount}개 반</em>
      </div>
      <div class="teacher-grid-labels" aria-hidden="true">
        <span>과목</span>
        <span>실</span>
        <span>시수</span>
        <span>실시수</span>
        <span>패턴</span>
        <span>관리</span>
      </div>
      <div class="teacher-grid">
        ${makeSubjectSelect(teacher.subject)}
        ${makeRoomSelect(teacher.roomName)}
        <input class="teacher-hours" type="number" min="1" max="10" value="${hours}" title="총 시수" placeholder="총">
        <input class="teacher-room-hours" type="number" min="0" max="${hours}" value="${roomHours}" title="특별실 시수" placeholder="실">
        <select class="teacher-block" title="수업형태">
          ${makeBlockPatternOptions(hours, blockPattern)}
        </select>
        <button class="small remove-assignment">삭제</button>
      </div>
      <div class="assignment-help" data-role="assignment-help">${makeAssignmentHelpText(teacher)}</div>
      <div class="teacher-class-picker">${makeClassChips(teacher.assignedClasses || [])}</div>
    </div>
  `;
}

function summarizeAssignedClasses(selected) {
  const selectedSet = new Set((selected || []).map(String));
  if (!selectedSet.size) return '선택 없음';

  const parts = [];
  (appConfig.gradeClasses || [])
    .filter((item) => Number(item.classCount || 0) > 0)
    .forEach((gradeItem) => {
      const grade = Number(gradeItem.grade);
      const classCount = Number(gradeItem.classCount || 0);
      const chosen = [];
      for (let classNo = 1; classNo <= classCount; classNo += 1) {
        if (selectedSet.has(`${grade}-${classNo}`)) chosen.push(classNo);
      }
      if (!chosen.length) return;
      parts.push(chosen.length === classCount
        ? `${grade}학년 전체`
        : `${grade}학년 ${chosen.join(',')}반`);
    });

  return parts.join(', ') || '선택 없음';
}

function groupTeachersByCode() {
  const map = new Map();

  appConfig.teachers.forEach((teacher) => {
    const teacherCode = teacher.teacherCode || getNextTeacherCode();
    if (!map.has(teacherCode)) {
      map.set(teacherCode, {
        teacherCode,
        teacherName: teacher.teacherName || teacher.displayName || teacherCode,
        assignments: []
      });
    }
    if (teacher.teacherName || teacher.displayName) {
      map.get(teacherCode).teacherName = teacher.teacherName || teacher.displayName;
    }
    map.get(teacherCode).assignments.push(teacher);
  });

  if (!map.size) {
    const teacherCode = '전담1';
    map.set(teacherCode, {
      teacherCode,
      teacherName: teacherCode,
      assignments: [makeEmptyAssignment(teacherCode)]
    });
  }

  return Array.from(map.values()).sort((a, b) => compareTeacherCode(a.teacherCode, b.teacherCode));
}

function makeEmptyAssignment(teacherCode) {
  return {
    teacherCode,
    teacherName: teacherCode,
    subject: '과학',
    roomName: '',
    weeklyHours: 1,
    roomHours: 0,
    blockPattern: '1',
    assignedClasses: []
  };
}

function clampRoomHoursForWeeklyHours(roomHours, weeklyHours) {
  const total = Math.max(1, Number(weeklyHours || 1));
  return Math.max(0, Math.min(total, Number(roomHours || 0)));
}

function refreshTeacherBlockOptions(assignmentCard) {
  if (!assignmentCard) return;

  const hoursInput = assignmentCard.querySelector('.teacher-hours');
  const roomHoursInput = assignmentCard.querySelector('.teacher-room-hours');
  const blockSelect = assignmentCard.querySelector('.teacher-block');
  if (!hoursInput || !blockSelect) return;

  const hours = Math.max(1, Number(hoursInput.value || 1));
  hoursInput.value = String(hours);
  if (roomHoursInput) {
    const safeRoomHours = clampRoomHoursForWeeklyHours(roomHoursInput.value, hours);
    roomHoursInput.max = String(hours);
    roomHoursInput.value = String(safeRoomHours);
  }
  const selected = normalizeBlockPatternForHours(blockSelect.value, hours);
  blockSelect.innerHTML = makeBlockPatternOptions(hours, selected);
}

function refreshTeacherRoomHoursInput(assignmentCard) {
  if (!assignmentCard) return;

  const roomSelect = assignmentCard.querySelector('.teacher-room');
  const hoursInput = assignmentCard.querySelector('.teacher-hours');
  const roomHoursInput = assignmentCard.querySelector('.teacher-room-hours');
  if (!roomSelect || !hoursInput || !roomHoursInput) return;

  const totalHours = Math.max(1, Number(hoursInput.value || 1));
  roomHoursInput.max = String(totalHours);
  const wasDisabled = roomHoursInput.disabled;
  const safeRoomHours = clampRoomHoursForWeeklyHours(roomHoursInput.value, totalHours);

  if (!roomSelect.value) {
    roomHoursInput.value = '0';
    roomHoursInput.disabled = true;
  } else {
    roomHoursInput.disabled = false;
    roomHoursInput.value = String(wasDisabled && safeRoomHours === 0 ? totalHours : safeRoomHours);
  }
}

function makeAssignmentHelpText(teacher) {
  const totalHours = Math.max(1, Number(teacher?.weeklyHours || 1));
  const roomName = String(teacher?.roomName || '').trim();
  const rawRoomHours = teacher?.roomHours;
  const roomHours = roomName
    ? clampRoomHoursForWeeklyHours(
      rawRoomHours === undefined || rawRoomHours === null || rawRoomHours === ''
        ? totalHours
        : rawRoomHours,
      totalHours
    )
    : 0;
  const classHours = Math.max(0, totalHours - roomHours);
  const pattern = String(teacher?.blockPattern || '1');
  const roomPattern = formatPatternForHours(pattern, roomHours);
  const classPattern = formatPatternForHours(pattern, classHours);

  if (roomName) {
    return `입력 해석: 총시수 ${totalHours}, 특별실시수 ${roomHours}(교실 ${classHours}) · 블록 ${pattern} → 특별실 ${roomPattern}, 교실 ${classPattern}`;
  }

  return `입력 해석: 총시수 ${totalHours}, 특별실시수 0(교실 ${classHours}) · 블록 ${pattern} → 교실 ${classPattern}`;
}

function makeTeacherLoadText(assignments) {
  const total = (assignments || []).reduce((sum, item) => {
    const weekly = Math.max(0, Number(item.weeklyHours || 0));
    const classes = Array.isArray(item.assignedClasses) ? item.assignedClasses.length : 0;
    return sum + (weekly * classes);
  }, 0);
  return `전담시수 ${total}차시`;
}

function updateTeacherLoadBadges() {
  document.querySelectorAll('#teacherArea .teacher-card').forEach((card) => {
    const badge = card.querySelector('[data-role="teacher-load"]');
    if (!badge) return;

    const total = Array.from(card.querySelectorAll('.assignment-card')).reduce((sum, assignment) => {
      const weekly = Math.max(0, Number(assignment.querySelector('.teacher-hours')?.value || 0));
      const classes = assignment.querySelectorAll('.chip.active').length;
      return sum + (weekly * classes);
    }, 0);

    badge.textContent = `전담시수 ${total}차시`;
  });
}

function refreshAssignmentHelp(assignmentCard) {
  if (!assignmentCard) return;

  const hint = assignmentCard.querySelector('[data-role="assignment-help"]');
  if (!hint) return;

  const totalHours = Math.max(1, Number(assignmentCard.querySelector('.teacher-hours')?.value || 1));
  const roomName = assignmentCard.querySelector('.teacher-room')?.value || '';
  const roomHoursRaw = assignmentCard.querySelector('.teacher-room-hours')?.value || 0;
  const roomHours = roomName ? clampRoomHoursForWeeklyHours(roomHoursRaw, totalHours) : 0;
  const classHours = Math.max(0, totalHours - roomHours);
  const pattern = assignmentCard.querySelector('.teacher-block')?.value || '1';

  const roomPattern = formatPatternForHours(pattern, roomHours);
  const classPattern = formatPatternForHours(pattern, classHours);

  if (roomName) {
    hint.textContent = `입력 해석: 총시수 ${totalHours}, 특별실시수 ${roomHours}(교실 ${classHours}) · 블록 ${pattern} → 특별실 ${roomPattern}, 교실 ${classPattern}`;
  } else {
    hint.textContent = `입력 해석: 총시수 ${totalHours}, 특별실시수 0(교실 ${classHours}) · 블록 ${pattern} → 교실 ${classPattern}`;
  }
}

function formatPatternForHours(pattern, hours) {
  const units = parsePatternUnitsForHours(pattern, hours);
  return units.length ? units.join('+') : '-';
}

function parsePatternUnitsForHours(pattern, hours) {
  let total = Math.max(0, Number(hours || 0));
  if (total <= 0) return [];

  const text = String(pattern || '').trim();
  if (text) {
    const parts = text
      .split('+')
      .map((part) => Number(part.trim()))
      .filter((value) => value === 1 || value === 2);
    const sum = parts.reduce((acc, cur) => acc + cur, 0);
    if (parts.length && sum === total) return parts;
  }

  const result = [];
  while (total >= 2) {
    result.push(2);
    total -= 2;
  }
  while (total > 0) {
    result.push(1);
    total -= 1;
  }
  return result;
}

function makeBlockPatternOptions(hours, selected) {
  const options = getBlockPatternsForHours(hours);
  const safeSelected = options.includes(selected) ? selected : options[0];

  return options.map((option) => `<option value="${option}" ${option === safeSelected ? 'selected' : ''}>${option}</option>`).join('');
}

function normalizeBlockPatternForHours(pattern, hours) {
  const options = getBlockPatternsForHours(hours);
  return options.includes(pattern) ? pattern : options[0];
}

function getBlockPatternsForHours(hours) {
  const total = Math.max(1, Number(hours || 1));
  const patterns = [];

  patterns.push(Array.from({ length: total }, () => 1).join('+'));

  for (let doubles = Math.floor(total / 2); doubles >= 1; doubles -= 1) {
    const parts = [];
    for (let i = 0; i < doubles; i += 1) parts.push(2);
    for (let i = 0; i < total - doubles * 2; i += 1) parts.push(1);
    const pattern = parts.join('+');
    if (!patterns.includes(pattern)) patterns.push(pattern);
  }

  return patterns;
}

function makeTeacherSelect(selected) {
  let html = '<select class="teacher-code">';
  for (let i = 1; i <= 20; i += 1) {
    const code = `전담${i}`;
    html += `<option value="${code}" ${selected === code ? 'selected' : ''}>${code}</option>`;
  }
  return `${html}</select>`;
}

function makeSubjectSelect(selected) {
  const options = SUBJECT_OPTIONS.map((subject) => `<option value="${subject}" ${selected === subject ? 'selected' : ''}>${subject}</option>`).join('');
  return `<select class="teacher-subject">${options}</select>`;
}

function makeRoomSelect(selected) {
  const rooms = appConfig.rooms.filter((room) => room.name);
  const options = rooms.map((room) => `<option value="${escapeAttr(room.name)}" ${selected === room.name ? 'selected' : ''}>${escapeHtml(room.name)}</option>`).join('');
  return `<select class="teacher-room"><option value="">특별실 없음</option>${options}</select>`;
}

function makeClassChips(selected) {
  const grades = appConfig.gradeClasses.filter((item) => Number(item.classCount || 0) > 0);
  if (!grades.length) return '<div class="empty-guide">\uD559\uAE09 \uC218\uB97C \uBA3C\uC800 \uC785\uB825\uD558\uC138\uC694.</div>';

  return grades.map((gradeItem) => {
    const grade = Number(gradeItem.grade);
    const classCount = Number(gradeItem.classCount || 0);
    const chips = Array.from({ length: classCount }, (_value, index) => {
      const classNo = index + 1;
      const code = `${grade}-${classNo}`;
      return `<button type="button" class="chip ${selected.includes(code) ? 'active' : ''}" data-class-code="${code}">${classNo}\uBC18</button>`;
    }).join('');

    return `
      <div class="teacher-class-row" data-grade="${grade}">
        <button type="button" class="teacher-grade-name" title="${grade}\uD559\uB144 \uC804\uCCB4 \uC120\uD0DD/\uD574\uC81C">${grade}\uD559\uB144</button>
        <div class="teacher-class-list">${chips}</div>
      </div>
    `;
  }).join('');
}

function getGradeClassCodes(grade) {
  const gradeItem = appConfig.gradeClasses.find((item) => Number(item.grade) === Number(grade));
  const classCount = Number(gradeItem?.classCount || 0);
  return Array.from({ length: classCount }, (_value, index) => `${grade}-${index + 1}`);
}

function collectGrades() {
  appConfig.gradeClasses = Array.from(document.querySelectorAll('#gradeArea input')).map((input) => ({
    grade: Number(input.dataset.grade),
    classCount: Number(input.value || 0)
  }));
}

function collectRooms(refreshTeachers = true) {
  appConfig.rooms = Array.from(document.querySelectorAll('#roomArea .room-row')).map((row) => ({
    name: row.querySelector('.room-name').value.trim(),
    capacity: Number(row.querySelector('.room-capacity').value || 1)
  })).filter((room) => room.name);
  if (refreshTeachers) {
    renderTeachers();
    renderExcludeTimes();
    renderRoomAssignments();
  }
  updateSummary();
}

function isDuplicateTeacherCodeSelect(select) {
  if (!select) return false;

  return Array.from(document.querySelectorAll('#teacherArea .teacher-code'))
    .filter((other) => other !== select)
    .some((other) => other.value === select.value);
}

function collectTeachers() {
  appConfig.teachers = Array.from(document.querySelectorAll('#teacherArea .teacher-card')).flatMap((card) => {
    const teacherCode = card.querySelector('.teacher-code').value;
    const teacherName = card.querySelector('.teacher-display-name')?.value.trim() || teacherCode;

    return Array.from(card.querySelectorAll('.assignment-card')).map((assignment) => {
      const weeklyHours = Number(assignment.querySelector('.teacher-hours').value || 1);
      const roomHours = clampRoomHoursForWeeklyHours(assignment.querySelector('.teacher-room-hours')?.value, weeklyHours);
      const roomName = assignment.querySelector('.teacher-room').value;

      return {
        teacherCode,
        teacherName,
        subject: assignment.querySelector('.teacher-subject').value,
        roomName,
        weeklyHours,
        roomHours: roomName ? roomHours : 0,
        blockPattern: normalizeBlockPatternForHours(assignment.querySelector('.teacher-block').value, weeklyHours),
        assignedClasses: Array.from(assignment.querySelectorAll('.chip.active')).map((chip) => chip.dataset.classCode)
      };
    });
  });
  updateTeacherLoadBadges();
  document.querySelectorAll('#teacherArea .assignment-card').forEach((assignmentCard) => refreshAssignmentHelp(assignmentCard));
  updateSummary();
}

async function saveConfig() {
  collectCurrentConfigFromScreen();
  const result = await window.desktopApi.saveConfig(appConfig);
  const profileResult = result.ok ? await saveCurrentProfile() : result;
  setAutoSaveStatus(profileResult.ok ? '설정 저장됨' : '저장 실패');
  const profileName = profileResult.profile?.name || makeSchoolYearLabel();
  alert(profileResult.ok ? `${profileName} 설정이 저장되었습니다.` : '설정 저장에 실패했습니다.');
}

async function autoSaveConfig() {
  if (isLoadingConfig) return;

  collectSchoolProfile();
  collectGrades();
  collectWeeklySchedule();
  collectTeachers();
  collectRooms(false);
  collectRoomAssignments();

  const result = await window.desktopApi.saveConfig(appConfig);
  setAutoSaveStatus(result.ok ? '자동 저장됨' : '자동 저장 실패');
}

function scheduleAutoSave() {
  if (isLoadingConfig) return;

  setAutoSaveStatus('자동 저장 중...');
  clearTimeout(autoSaveTimer);
  autoSaveTimer = setTimeout(() => {
    autoSaveConfig().catch(() => setAutoSaveStatus('자동 저장 실패'));
  }, 900);
}

function setAutoSaveStatus(text) {
  const el = document.getElementById('autoSaveStatus');
  if (el) el.textContent = text;

  const quickEl = document.getElementById('quickDockStatus');
  if (quickEl) quickEl.textContent = text;
}

async function exportConfigFile() {
  collectCurrentConfigFromScreen();

  const result = await window.desktopApi.saveJson({
    type: '전담시간표 설정',
    dialogTitle: '설정 파일 내보내기',
    defaultPath: `${makeSafeSchoolYearLabel()}_설정.json`,
    savedAt: new Date().toISOString(),
    config: appConfig
  });

  if (result.ok) {
    setAutoSaveStatus('설정 파일 저장됨');
    alert('설정 파일을 내보냈습니다.');
  }
}

async function importConfigFile() {
  const result = await window.desktopApi.loadJson();
  if (!result.ok) {
    if (result.message) alert(result.message);
    return;
  }

  const rawConfig = result.data?.config || result.data;
  appConfig = normalizeConfig(rawConfig);
  lastResult = null;
  timetableCandidates = [];
  configIssues = [];
  renderAll();
  renderCandidateSelector([], 0);
  resetTimetableViews();
  await window.desktopApi.saveConfig(appConfig);
  setAutoSaveStatus('불러온 설정 저장됨');
  alert('설정 파일을 불러왔습니다.');
}

async function saveCurrentTimetable() {
  if (!lastResult) {
    alert('저장할 시간표가 없습니다. 먼저 시간표 작성 또는 수동 작성을 해주세요.');
    return;
  }

  collectCurrentConfigFromScreen();
  updateDerivedViewsFromCurrentResult();

  const result = await window.desktopApi.saveJson({
    type: '전담시간표 작업본',
    dialogTitle: '시간표 파일 저장',
    defaultPath: makeDefaultTimetableFileName(),
    savedAt: new Date().toISOString(),
    config: appConfig,
    result: lastResult
  });

  setAutoSaveStatus(result.ok ? '시간표 저장됨' : '시간표 저장 실패');
  alert(result.ok ? '현재 시간표가 저장되었습니다.' : '시간표 저장에 실패했습니다.');
}

async function loadSavedTimetable() {
  const loaded = await window.desktopApi.loadJson();
  if (!loaded.ok) {
    if (loaded.message) alert(loaded.message);
    return;
  }

  const saved = loaded.data || {};
  if (!saved.result) {
    alert('시간표 작업본 파일이 아닙니다.');
    return;
  }

  appConfig = normalizeConfig(saved.config || appConfig || getDefaultConfig());
  lastResult = saved.result;
  timetableCandidates = [];
  configIssues = inspectConfig(appConfig);
  applyTheme(appConfig.viewOptions?.theme || 'light');
  renderAll();
  updateDerivedViewsFromCurrentResult();
  renderCandidateSelector([], 0);
  renderViewerWorkspace(lastResult);
  clearTimetableUndo();
  switchTab('timetableTab');
  await window.desktopApi.saveConfig(appConfig);
  setAutoSaveStatus('시간표 불러옴');
  alert('시간표 파일을 불러왔습니다.');
}

function makeDefaultTimetableFileName() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${makeSafeSchoolYearLabel()}_시간표작업본_${yyyy}${mm}${dd}.json`;
}

function makeSchoolYearLabel() {
  const school = appConfig.school || {};
  const year = Number(school.year || new Date().getFullYear());
  const schoolName = String(school.name || '').trim() || '학교명없음';
  return `${year}학년도 ${schoolName}`;
}

function makeSafeSchoolYearLabel() {
  return makeSchoolYearLabel().replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_') || '전담시간표';
}

function build() {
  collectSchoolProfile();
  collectGrades();
  collectWeeklySchedule();
  collectTeachers();
  collectRooms(false);
  collectRoomAssignments();

  try {
    configIssues = inspectConfig(appConfig);
    timetableCandidates = buildTimetableCandidates(appConfig, 3);
    lastResult = timetableCandidates[0].result;
    clearTimetableUndo();
    renderCandidateSelector(timetableCandidates, 0);
    renderViewerWorkspace(lastResult);
    switchTab('timetableTab');
  } catch (err) {
    alert(err.message || err);
  }
}

function retryUnplacedBuild() {
  if (!lastResult || !lastResult.unplacedLessons?.length) return;

  try {
    configIssues = inspectConfig(appConfig);
    timetableCandidates = buildRecoveryCandidates(appConfig, 3);
    lastResult = timetableCandidates[0]?.result || null;
    if (!lastResult) {
      alert('재시도 후보를 만들 수 없습니다.');
      return;
    }

    clearTimetableUndo();
    renderCandidateSelector(timetableCandidates, 0);
    renderViewerWorkspace(lastResult);
  } catch (err) {
    alert(err.message || err);
  }
}

function renderCandidateSelector(candidates, activeIndex) {
  const area = document.getElementById('candidateArea');
  if (!area) return;

  if (!candidates || !candidates.length) {
    area.innerHTML = '';
    return;
  }

  area.innerHTML = `
    <div class="candidate-head">
      <div>
        <div class="candidate-title">\uC2DC\uAC04\uD45C \uD6C4\uBCF4</div>
        <div class="candidate-subtitle">\uCD94\uCC9C 1\uC548\uC774 \uC790\uB3D9\uC73C\uB85C \uC120\uD0DD\uB429\uB2C8\uB2E4.</div>
      </div>
      ${candidates[activeIndex]?.result?.unplacedLessons?.length ? '<button type="button" id="retryUnplacedBtn" class="small retry-button">\uBBF8\uBC30\uCE58 \uC904\uC774\uAE30 \uC7AC\uC2DC\uB3C4</button>' : ''}
    </div>
    <div class="candidate-list">
      ${candidates.map((candidate, index) => `
        <button type="button" class="candidate-card ${index === activeIndex ? 'active' : ''} ${index === 0 ? 'recommended' : ''}" data-candidate-index="${index}">
          <div class="candidate-badge-row">
            ${index === 0 ? '<small class="recommend-badge">\uCD94\uCC9C 1\uC548</small>' : ''}
            ${index === activeIndex ? '<small class="selected-badge">\uD604\uC7AC \uC120\uD0DD\uB428</small>' : ''}
          </div>
          <strong>${escapeHtml(index === 0 ? ('\uCD94\uCC9C 1\uC548 \u00B7 ' + (candidate.name || ('\uD6C4\uBCF4 ' + (index + 1)))) : (candidate.name || ('\uD6C4\uBCF4 ' + (index + 1))))}</strong>
          <span>${escapeHtml(candidate.summary || '')}</span>
          ${makeCandidateMetricHtml(candidate.result)}
          ${index === 0 ? `<small class="recommend-reason">${escapeHtml(makeRecommendationReason(candidate.result))}</small>` : ''}
        </button>
      `).join('')}
    </div>
  `;

  area.querySelector('#retryUnplacedBtn')?.addEventListener('click', retryUnplacedBuild);

  area.querySelectorAll('.candidate-card').forEach((button) => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.candidateIndex || 0);
      const candidate = timetableCandidates[index];
      if (!candidate) return;

      lastResult = candidate.result;
      clearTimetableUndo();
      renderCandidateSelector(timetableCandidates, index);
      renderViewerWorkspace(lastResult);
    });
  });
}
function makeRecommendationReason(result) {
  const metrics = result?.metrics || {};
  return '\uCD94\uCC9C \uAE30\uC900: \uBBF8\uBC30\uCE58 ' + Number(metrics.unplacedCount || 0) + ' / 1-2\uAD50\uC2DC ' + Number(metrics.morningCount || 0) + ' / 5-6\uAD50\uC2DC ' + Number(metrics.lateCount || 0) + ' / \uC694\uC77C\uD3B8\uCC28 ' + Number(metrics.daySpread || 0);
}

function makeCandidateMetricHtml(result) {
  const metrics = result?.metrics || {};
  return `
    <div class="candidate-metrics">
      <em class="${metrics.unplacedCount ? 'bad' : 'good'}">\uBBF8\uBC30\uCE58 ${Number(metrics.unplacedCount || 0)}</em>
      <em>1-2\uAD50\uC2DC ${Number(metrics.morningCount || 0)}</em>
      <em>5-6\uAD50\uC2DC ${Number(metrics.lateCount || 0)}</em>
    </div>
  `;
}
function switchTab(targetId) {
  if (targetId === 'timetableTab') {
    activeTimetableAreaId = 'timetableArea';
    activeRoomAreaId = 'roomTimetableArea';
    activeUnplacedAreaId = 'unplacedArea';
    activeWarningAreaId = 'warningArea';
  }

  if (targetId === 'roomTimetableTab') {
    activeRoomAreaId = 'roomTimetableArea';
    if (lastResult) {
      renderRoomLessonBank(lastResult.unplacedLessons || []);
      renderRoomTimetable(lastResult, 'roomTimetableArea');
    }
  }

  document.querySelectorAll('.tab-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.tabTarget === targetId);
  });

  document.querySelectorAll('.tab-panel').forEach((panel) => {
    panel.classList.toggle('active', panel.id === targetId);
  });
}

function collectRoomAssignments() {
  const area = document.getElementById('roomAssignmentArea');
  if (!area) return;

  collectRoomLunchSettings(area);
  appConfig.rules = { ...(appConfig.rules || {}), roomAssignmentsFirst: false };
  const allowedRooms = new Set(getIndependentRoomNamesForAssignment());

  appConfig.roomAssignments = Array.from(area.querySelectorAll('.room-assignment-card')).map((card) => {
    const roomName = card.dataset.roomName;
    if (!allowedRooms.has(roomName)) return null;
    const fixedFirst = card.querySelector('.room-fixed-first')?.checked === true;
    const items = Array.from(card.querySelectorAll('.room-grade-row')).map((row) => {
      const grade = Number(row.dataset.grade);
      const hoursMode = row.querySelector('.room-hours-mode')?.value === 'perGrade' ? 'perGrade' : 'perClass';
      const selectedClassCodes = Array.from(row.querySelectorAll('.room-class-chip.active')).map((chip) => chip.dataset.classCode);
      const classCodes = hoursMode === 'perGrade'
        ? getGradeClassCodes(grade)
        : selectedClassCodes;

      return {
        grade,
        classCodes,
        hoursMode,
        hours: Number(row.querySelector('.room-hour-input')?.value || 1),
        blockMode: row.querySelector('.room-block-mode')?.value || 'single'
      };
    }).filter((item) => item.classCodes.length);

    return { roomName, fixedFirst, items };
  }).filter((item) => item && item.items.length);
}

function collectRoomLunchSettings(area = document.getElementById('roomAssignmentArea')) {
  const enabled = area?.querySelector('#roomLunchEnabled')?.checked === true;
  const lunchAfterByGrade = {};
  [1, 2, 3, 4, 5, 6].forEach((grade) => {
    const value = Number(area?.querySelector(`.room-lunch-after[data-grade="${grade}"]`)?.value || 4);
    lunchAfterByGrade[grade] = [3, 4, 5].includes(value) ? value : 4;
  });
  appConfig.roomLunch = { enabled, lunchAfterByGrade };
}

function getRoomLunchAfterByGrade() {
  const saved = appConfig.roomLunch?.lunchAfterByGrade || {};
  const result = {};
  [1, 2, 3, 4, 5, 6].forEach((grade) => {
    const value = Number(saved[grade] || saved[String(grade)] || 4);
    result[grade] = [3, 4, 5].includes(value) ? value : 4;
  });
  return result;
}

function collectWeeklySchedule(area = document.getElementById('weeklyScheduleArea')) {
  if (!area) return;

  appConfig.weeklySchedule = Array.from(area.querySelectorAll('.weekly-row')).map((row) => ({
    grade: Number(row.dataset.grade),
    daily: DAYS.map((_day, index) => Number(row.querySelector(`input[data-day-index="${index}"]`)?.value || 0))
  }));
}


async function exportExcel() {
  if (!lastResult) {
    build();
  }

  if (!lastResult) return;

  const result = await window.desktopApi.saveExcel({
    config: appConfig,
    result: lastResult
  });

  if (result.ok) alert('\uC5D1\uC140 \uD30C\uC77C\uB85C \uC800\uC7A5\uB418\uC5C8\uC2B5\uB2C8\uB2E4.');
}

function renderTimetable(result, areaId = 'timetableArea') {
  activeTimetableAreaId = areaId;
  const area = document.getElementById(areaId);
  area.classList.remove('empty');
  renderEditTeacherSelect(result);

  area.innerHTML = `
    <div class="teacher-table-grid">
      ${result.teachers.map((teacher) => `
        <div class="teacher-table">
          <div class="teacher-title">${escapeHtml(teacher.header)}</div>
          <table>
            <thead>
              <tr>
                <th>교시</th>
                ${DAYS.map((day) => `<th>${day}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${teacher.grid.map((row, periodIndex) => `
                <tr>
                  <th>${periodIndex + 1}</th>
                  ${row.map((cell, dayIndex) => `
                    <td
                      class="${cell.isBlocked ? 'blocked' : ''} ${getCellToneClass(cell)}"
                      data-teacher="${escapeAttr(teacher.teacherName)}"
                      data-day-index="${dayIndex}"
                      data-period="${periodIndex + 1}"
                      ${cell.value && !cell.locked ? 'draggable="true"' : ''}
                    >${makeTeacherCellHtml(cell)}</td>
                  `).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `).join('')}
    </div>
  `;

  bindTimetableInteractions(area);
}

function renderEditTeacherSelect(result) {
  const select = document.getElementById('editTeacherSelect');
  if (!select) return;

  const current = select.value;
  const teachers = result?.teachers || [];
  select.innerHTML = teachers.map((teacher) => (
    `<option value="${escapeAttr(teacher.teacherName)}">${escapeHtml(teacher.displayName || teacher.teacherName)}</option>`
  )).join('');

  if (teachers.some((teacher) => teacher.teacherName === current)) {
    select.value = current;
  }
}

function makeTeacherCellHtml(cell) {
  if (!cell || cell.isBlocked) return '';
  if (!cell.value) return '';

  return `
    <button type="button" class="cell-lock-btn ${cell.locked ? 'locked' : ''}" draggable="false" title="${cell.locked ? '고정 해제' : '이 수업만 고정'}" aria-label="${cell.locked ? '고정 해제' : '이 수업만 고정'}">${cell.locked ? '🔒' : '🔓'}</button>
    <div class="lesson-value">${escapeHtml(cell.value)}</div>
    <div class="lesson-room ${cell.roomName === '교실' ? 'classroom' : ''}">${escapeHtml(cell.roomName || '교실')}</div>
  `;
}

function bindTimetableInteractions(area) {
  area.querySelectorAll('.cell-lock-btn').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleCellLock(button.closest('td'));
    });
    button.addEventListener('dragstart', (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
  });

  area.querySelectorAll('td[draggable="true"]').forEach((cell) => {
    cell.addEventListener('dragstart', (event) => {
      const lesson = getLessonUnitFromCell(cell.dataset.teacher, Number(cell.dataset.dayIndex), Number(cell.dataset.period));
      if (!lesson || lesson.locked) {
        event.preventDefault();
        return;
      }

      activeDragLesson = { type: 'lesson', lesson };
      event.dataTransfer.setData('text/plain', JSON.stringify({
        type: 'lesson',
        teacher: cell.dataset.teacher,
        dayIndex: Number(cell.dataset.dayIndex),
        period: Number(cell.dataset.period)
      }));
      showPlacementHints(lesson);
    });

    cell.addEventListener('dragend', () => {
      clearPlacementHints();
      activeDragLesson = null;
    });
  });

  area.querySelectorAll('td').forEach((cell) => {
    cell.addEventListener('dragover', (event) => {
      if (!activeDragLesson) return;
      event.preventDefault();
      showDropTarget(cell);
    });
    cell.addEventListener('dragleave', () => {
      clearDropTarget();
    });
    cell.addEventListener('drop', (event) => {
      event.preventDefault();
      try {
        const source = JSON.parse(event.dataTransfer.getData('text/plain'));
        const target = {
          teacher: cell.dataset.teacher,
          dayIndex: Number(cell.dataset.dayIndex),
          period: Number(cell.dataset.period)
        };
        clearDropTarget();
        clearPlacementHints();
        activeDragLesson = null;

        if (source.type === 'unplaced') {
          manuallyPlaceUnplaced(Number(source.index), target.dayIndex, target.period, target.teacher, false);
          return;
        }

        moveLessonCell(source, target);
      } catch (_err) {
        // no-op
      }
    });
  });
}

function toggleCellLock(td) {
  if (!td || !lastResult) return;

  const lesson = getLessonUnitFromCell(td.dataset.teacher, Number(td.dataset.dayIndex), Number(td.dataset.period));
  if (!lesson || !lesson.value) return;

  if (!appConfig.lockedLessons) appConfig.lockedLessons = [];

  const exists = appConfig.lockedLessons.some((item) => isSameLock(item, lesson));
  appConfig.lockedLessons = exists
    ? appConfig.lockedLessons.filter((item) => !isSameLock(item, lesson))
    : appConfig.lockedLessons.concat(lesson);

  const teacher = findResultTeacher(lesson.teacher);
  for (let i = 0; i < lesson.duration; i += 1) {
    const cell = teacher.grid[lesson.period - 1 + i][lesson.dayIndex];
    if (cell) cell.locked = !exists;
  }

  scheduleAutoSave();
  renderAllResultViews();
}

function isSameLock(a, b) {
  return String(a.teacher) === String(b.teacher) &&
    String(a.subject) === String(b.subject) &&
    String(a.classCode) === String(b.classCode) &&
    String(a.roomName || '') === String(b.roomName || '') &&
    Number(a.dayIndex) === Number(b.dayIndex) &&
    Number(a.period) === Number(b.period) &&
    Number(a.duration || 1) === Number(b.duration || 1);
}

function isSameLessonPosition(a, b) {
  return String(a.teacher) === String(b.teacher) &&
    Number(a.dayIndex) === Number(b.dayIndex) &&
    Number(a.period) === Number(b.period) &&
    Number(a.duration || 1) === Number(b.duration || 1);
}

function makeUnplacedItemFromLesson(lesson, reason = '수동 수정') {
  return {
    teacher: lesson.teacher,
    subject: lesson.subject || extractSubjectFromValue(lesson.value),
    classCode: lesson.classCode,
    roomName: lesson.roomName || '',
    unitType: Number(lesson.duration || 1) >= 2 ? '2시간 블록' : '1시간 단일',
    blockSize: Number(lesson.duration || 1),
    reason
  };
}

function moveLessonCell(source, target) {
  if (!lastResult) return;
  if (!source || !target) return;
  if (source.teacher === target.teacher && source.dayIndex === target.dayIndex && source.period === target.period) return;

  const lesson = getLessonUnitFromCell(source.teacher, source.dayIndex, source.period);
  if (!lesson || !lesson.value || lesson.locked) return;

  const targetLesson = getLessonUnitFromCell(target.teacher, target.dayIndex, target.period);
  if (targetLesson?.value && !isSameLessonPosition(lesson, targetLesson)) {
    swapLessonCells(lesson, targetLesson);
    return;
  }

  const check = canPlaceDragLesson(lesson, target, lesson, { freeMove: true });
  if (!check.ok) {
    alert(check.message);
    return;
  }

  pushTimetableUndo();
  placeLessonFreely(lesson, target);
  updateDerivedViewsFromCurrentResult();
  renderAllResultViews();
}

function swapLessonCells(sourceLesson, targetLesson) {
  if (!lastResult || !sourceLesson || !targetLesson) return false;
  if (isSameLessonPosition(sourceLesson, targetLesson)) return true;
  if (sourceLesson.locked || targetLesson.locked) {
    alert('잠금 처리된 수업은 교환할 수 없습니다.');
    return true;
  }
  if (String(sourceLesson.teacher) !== String(targetLesson.teacher)) {
    alert('다른 전담 시간표와는 교환할 수 없습니다.');
    return true;
  }
  if (Number(sourceLesson.duration || 1) !== Number(targetLesson.duration || 1)) {
    alert('1시간 수업은 1시간 수업끼리, 2시간 블록은 2시간 블록끼리만 교환할 수 있습니다.');
    return true;
  }

  const snapshot = JSON.parse(JSON.stringify(lastResult));
  const sourceTarget = {
    teacher: targetLesson.teacher,
    dayIndex: targetLesson.dayIndex,
    period: targetLesson.period
  };
  const targetTarget = {
    teacher: sourceLesson.teacher,
    dayIndex: sourceLesson.dayIndex,
    period: sourceLesson.period
  };

  clearLessonUnit(sourceLesson);
  clearLessonUnit(targetLesson);

  const sourceCheck = canPlaceDragLesson(sourceLesson, sourceTarget, targetLesson, { freeMove: true });
  const targetCheck = canPlaceDragLesson(targetLesson, targetTarget, sourceLesson, { freeMove: true });
  if (!sourceCheck.ok || !targetCheck.ok) {
    lastResult = snapshot;
    const failed = !sourceCheck.ok ? sourceCheck : targetCheck;
    alert(failed.message || '교환할 수 없습니다.');
    renderAllResultViews();
    return true;
  }

  timetableUndoStack.push(snapshot);
  if (timetableUndoStack.length > 30) timetableUndoStack.shift();
  placeLessonUnit(sourceLesson, sourceTarget);
  placeLessonUnit(targetLesson, targetTarget);
  removeLockForLesson(sourceLesson);
  removeLockForLesson(targetLesson);
  updateDerivedViewsFromCurrentResult();
  renderAllResultViews();
  return true;
}

function placeLessonFreely(lesson, target, options = {}) {
  if (!lastResult || !lesson || !target) return;

  clearManualCheckWarnings();
  const pending = collectDisplacedLessons(lesson, target, options);
  pending.forEach((item) => clearLessonUnit(item));
  clearLessonUnit(lesson);
  placeLessonUnit(lesson, target);
  removeLockForLesson(lesson);

  const lessonKey = makeLessonKey(lesson);
  const uniquePending = [];
  const seen = new Set([lessonKey]);
  pending.forEach((item) => {
    const key = makeLessonKey(item);
    if (seen.has(key)) return;
    seen.add(key);
    uniquePending.push(item);
  });

  if (uniquePending.length) {
    lastResult.unplacedLessons ||= [];
    uniquePending.forEach((item) => {
      removeLockForLesson(item);
      lastResult.unplacedLessons.push(makeUnplacedItemFromLesson(item, '수동 이동으로 대기'));
    });
  }
}

function clearManualCheckWarnings() {
  if (!lastResult) return;
  lastResult.warnings = (lastResult.warnings || []).filter((warning) => warning?.type !== 'MANUAL_CHECK');
}

function collectDisplacedLessons(lesson, target, options = {}) {
  const displaced = [];
  const duration = Number(lesson.duration || 1);
  const periods = Array.from({ length: duration }, (_v, index) => Number(target.period) + index);
  const sourceLesson = options.sourceLesson || lesson;

  periods.forEach((period) => {
    const targetLesson = getLessonUnitFromCell(target.teacher, Number(target.dayIndex), period);
    if (targetLesson?.value && !isSourceTeacherCell(sourceLesson, target.teacher, Number(target.dayIndex), period)) {
      addDisplacedLesson(displaced, targetLesson);
    }

    (lastResult.teachers || []).forEach((teacher) => {
      const cell = teacher.grid?.[period - 1]?.[Number(target.dayIndex)];
      if (!cell?.value || String(cell.classCode || '') !== String(lesson.classCode || '')) return;
      if (isSourceTeacherCell(sourceLesson, teacher.teacherName, Number(target.dayIndex), period)) return;
      const conflict = getLessonUnitFromCell(teacher.teacherName, Number(target.dayIndex), period);
      addDisplacedLesson(displaced, conflict);
    });

    const roomName = String(lesson.roomName || '').trim();
    if (roomName && roomName !== '교실') {
      const room = findManualRoom(roomName);
      const roomCell = room?.grid?.[period - 1]?.[Number(target.dayIndex)];
      const entries = Array.isArray(roomCell?.entries) ? roomCell.entries : [];
      entries.forEach((entry) => {
        if (String(entry.classCode || '') === String(lesson.classCode || '')) return;
        const linked = findLessonByClassTime(String(entry.classCode || ''), Number(target.dayIndex), period);
        addDisplacedLesson(displaced, linked);
      });
    }
  });

  return displaced.filter((item) => item && !item.locked);
}

function addDisplacedLesson(list, lesson) {
  if (!lesson?.value || lesson.locked) return;
  const key = makeLessonKey(lesson);
  if (list.some((item) => makeLessonKey(item) === key)) return;
  list.push(lesson);
}

function makeLessonKey(lesson) {
  return [
    lesson?.teacher || '',
    lesson?.classCode || '',
    lesson?.subject || '',
    lesson?.roomName || '',
    lesson?.dayIndex ?? '',
    lesson?.period ?? '',
    lesson?.duration || 1
  ].join('|');
}

function findLessonByClassTime(classCode, dayIndex, period) {
  for (const teacher of lastResult?.teachers || []) {
    const cell = teacher.grid?.[period - 1]?.[dayIndex];
    if (!cell?.value || String(cell.classCode || '') !== String(classCode || '')) continue;
    return getLessonUnitFromCell(teacher.teacherName, dayIndex, period);
  }
  return null;
}

function placeLessonUnit(lesson, target) {
  const teacher = findResultTeacher(target.teacher);
  if (!teacher) return;

  const periods = Array.from({ length: Number(lesson.duration || 1) }, (_v, index) => Number(target.period) + index);
  periods.forEach((period) => {
    teacher.grid[period - 1][target.dayIndex] = {
      ...(lesson.cell || {
        value: lesson.value,
        isBlocked: false,
        roomName: lesson.roomName || '교실',
        classCode: lesson.classCode,
        subject: lesson.subject || extractSubjectFromValue(lesson.value),
        teacher: lesson.teacher
      }),
      dayIndex: target.dayIndex,
      period,
      locked: false
    };
  });

  if (lesson.roomName && lesson.roomName !== '교실') {
    const room = findManualRoom(lesson.roomName);
    periods.forEach((period) => {
      if (!room?.grid?.[period - 1]) return;
      room.grid[period - 1][target.dayIndex] = {
        dayIndex: target.dayIndex,
        period,
        value: lesson.value,
        entries: [{
          value: lesson.value,
          classCode: lesson.classCode,
          source: '전담'
        }],
        isBlocked: false
      };
    });
  }
}

function showPlacementHints(lesson) {
  clearPlacementHints();
  const area = document.getElementById(activeTimetableAreaId || 'timetableArea');
  if (!area || !lesson) return;

  if (lesson.sourceLesson) return;
  for (let i = 0; i < Number(lesson.duration || 1); i += 1) {
    const sourceCell = area.querySelector(`td[data-teacher="${cssEscape(lesson.teacher)}"][data-day-index="${lesson.dayIndex}"][data-period="${lesson.period + i}"]`);
    sourceCell?.classList.add('placement-source');
  }
}

function clearPlacementHints() {
  document.querySelectorAll('.placement-ok, .placement-warn, .placement-bad, .placement-source, .placement-swap, .placement-target').forEach((cell) => {
    cell.classList.remove('placement-ok', 'placement-warn', 'placement-bad', 'placement-source', 'placement-swap', 'placement-target');
    cell.removeAttribute('title');
  });
}

function clearDropTarget() {
  document.querySelectorAll('.placement-target, .placement-ok, .placement-warn, .placement-bad, .placement-swap').forEach((cell) => {
    cell.classList.remove('placement-target', 'placement-ok', 'placement-warn', 'placement-bad', 'placement-swap');
    cell.removeAttribute('title');
    delete cell.dataset.dropReason;
  });
}

function showDropTarget(cell) {
  clearDropTarget();
  if (!cell || !activeDragLesson?.lesson) return;

  const lesson = activeDragLesson.lesson;
  const duration = Number(lesson.duration || 1);
  const teacher = cell.dataset.teacher;
  const dayIndex = Number(cell.dataset.dayIndex);
  const period = Number(cell.dataset.period);
  const area = document.getElementById(activeTimetableAreaId || 'timetableArea');
  const target = { teacher, dayIndex, period };
  const result = canPlaceDragLesson(lesson, target, lesson.sourceLesson || lesson, { freeMove: true });
  const occupancies = getOccupiedTargetLessons(lesson.sourceLesson || lesson, target, lesson);
  const occupied = occupancies.length > 0;
  const toneClass = result.ok && !occupied ? 'placement-ok' : 'placement-bad';
  const shortReason = occupied ? makeShortOccupancyLabel(occupancies[0]) : '';
  const message = occupied ? makeOccupiedTargetMessage(target, lesson) : result.message;

  for (let i = 0; i < duration; i += 1) {
    const targetCell = area?.querySelector(`td[data-teacher="${cssEscape(teacher)}"][data-day-index="${dayIndex}"][data-period="${period + i}"]`);
    targetCell?.classList.add('placement-target', toneClass);
    if (targetCell) {
      targetCell.title = message || '';
      if (shortReason) targetCell.dataset.dropReason = shortReason;
    }
  }
}

function canSwapLessonHint(sourceLesson, targetLesson) {
  if (!sourceLesson || !targetLesson) return false;
  if (!Number.isFinite(Number(sourceLesson.dayIndex)) || !Number.isFinite(Number(sourceLesson.period))) return false;
  if (isSameLessonPosition(sourceLesson, targetLesson)) return false;
  if (sourceLesson.locked || targetLesson.locked) return false;
  if (String(sourceLesson.teacher) !== String(targetLesson.teacher)) return false;
  return Number(sourceLesson.duration || 1) === Number(targetLesson.duration || 1);
}

function hasOccupiedTargetForDrag(sourceLesson, target, lesson) {
  return getOccupiedTargetLessons(sourceLesson, target, lesson).length > 0;
}

function getOccupiedTargetLessons(sourceLesson, target, lesson) {
  const duration = Number(lesson?.duration || 1);
  const occupied = [];
  const teacher = findResultTeacher(target.teacher);
  const targetDay = Number(target.dayIndex);
  for (let i = 0; i < duration; i += 1) {
    const period = Number(target.period) + i;
    if (isSourceTeacherCell(sourceLesson, target.teacher, targetDay, period)) continue;

    const directCell = teacher?.grid?.[period - 1]?.[targetDay];
    if (directCell?.value) {
      occupied.push({ period, value: directCell.value, type: '전담' });
    }

    addClassConflictOccupancies(occupied, sourceLesson, lesson, targetDay, period);
    addRoomConflictOccupancies(occupied, sourceLesson, lesson, targetDay, period);
    addSinglePatternDayOccupancies(occupied, sourceLesson, lesson, targetDay, period);
  }
  return uniqueOccupancies(occupied);
}

function makeOccupiedTargetMessage(target, lesson) {
  const messages = getOccupiedTargetLessons(lesson.sourceLesson || lesson, target, lesson)
    .map((item) => `${item.period}교시 ${item.type ? `${item.type} ` : ''}${item.value}`);
  return messages.length ? `이미 수업 있음: ${messages.join(', ')}` : '이미 수업이 있습니다.';
}

function makeShortOccupancyLabel(item) {
  if (!item) return '';
  const value = String(item.value || '').trim();
  if (item.type === '특별실') return value.replace(/\s+/g, ' ');
  if (item.type === '같은 반') return value.replace(/\s+/g, ' ');
  if (item.type === '단일수업') return value.replace(/\s+/g, ' ');
  return value;
}

function addClassConflictOccupancies(occupied, sourceLesson, lesson, dayIndex, period) {
  const classCode = String(lesson?.classCode || '').trim();
  if (!classCode) return;

  (lastResult?.teachers || []).forEach((teacher) => {
    if (isSourceTeacherCell(sourceLesson, teacher.teacherName, dayIndex, period)) return;
    const cell = teacher.grid?.[period - 1]?.[dayIndex];
    if (!cell?.value || String(cell.classCode || '').trim() !== classCode) return;
    occupied.push({
      period,
      value: `${teacher.displayName || teacher.teacherName} ${cell.value}`,
      type: '같은 반'
    });
  });
}

function addRoomConflictOccupancies(occupied, sourceLesson, lesson, dayIndex, period) {
  const roomName = String(lesson?.roomName || '').trim();
  if (!roomName || roomName === '교실') return;
  if (isSourceRoomCell(sourceLesson, roomName, dayIndex, period)) return;

  const room = findManualRoom(roomName);
  const cell = room?.grid?.[period - 1]?.[dayIndex];
  if (cell?.isBlocked) {
    occupied.push({
      period,
      value: `${roomName} 제외시간`,
      type: '특별실'
    });
    return;
  }

  if (!cell?.value) return;

  const entries = Array.isArray(cell.entries) ? cell.entries : [];
  const otherEntries = entries.filter((entry) => String(entry.classCode || '').trim() !== String(lesson.classCode || '').trim());
  if (entries.length && !otherEntries.length) return;

  occupied.push({
    period,
    value: `${roomName} ${joinRoomEntries(otherEntries) || cell.value}`,
    type: '특별실'
  });
}

function addSinglePatternDayOccupancies(occupied, sourceLesson, lesson, dayIndex, period) {
  const subject = String(lesson?.subject || extractSubjectFromValue(lesson?.value)).trim();
  const classCode = String(lesson?.classCode || '').trim();
  const teacherCode = String(lesson?.teacher || '').trim();
  if (!subject || !classCode || !teacherCode) return;
  if (!isAllSinglePatternForManualLesson(teacherCode, subject, classCode)) return;

  const teacher = findResultTeacher(teacherCode);
  if (!teacher) return;

  (teacher.grid || []).forEach((row, periodIndex) => {
    const existingPeriod = periodIndex + 1;
    if (existingPeriod === Number(period)) return;
    if (isSourceTeacherCell(sourceLesson, teacher.teacherName, dayIndex, existingPeriod)) return;

    const cell = row?.[dayIndex];
    if (!cell?.value || String(cell.classCode || '').trim() !== classCode) return;
    const cellSubject = String(cell.subject || extractSubjectFromValue(cell.value)).trim();
    const sameSubject = cellSubject === subject || cellSubject.charAt(0) === subject.charAt(0);
    if (!sameSubject) return;

    occupied.push({
      period,
      value: `${DAYS[dayIndex]} ${existingPeriod}교시 ${cell.value}`,
      type: '단일수업'
    });
  });
}

function uniqueOccupancies(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = `${item.period}|${item.type || ''}|${item.value || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(String(value || ''));
  return String(value || '').replace(/["\\]/g, '\\$&');
}

function canPlaceDragLesson(lesson, target, sourceLesson = null, options = {}) {
  const duration = Number(lesson.duration || 1);
  const periods = Array.from({ length: duration }, (_v, index) => Number(target.period) + index);
  const teacherCode = String(lesson.teacher || '');
  const targetTeacherCode = String(target.teacher || '');
  const freeMove = options.freeMove === true;

  if (!findResultTeacher(targetTeacherCode)) {
    return { ok: false, message: '해당 전담 시간표를 찾을 수 없습니다.' };
  }

  if (teacherCode !== targetTeacherCode) {
    return { ok: false, message: '다른 전담 시간표로는 이동할 수 없습니다.' };
  }

  if (periods.some((period) => period < 1 || period > 6)) {
    return { ok: false, message: '선택한 위치에는 연속 시간이 부족합니다.' };
  }

  for (const period of periods) {
    const teacher = findResultTeacher(targetTeacherCode);
    const targetCell = teacher.grid[period - 1]?.[target.dayIndex];
    if (targetCell?.isBlocked && !freeMove) return { ok: false, message: '제외시간입니다.' };
    if (freeMove && targetCell?.locked && !isSourceTeacherCell(sourceLesson, targetTeacherCode, target.dayIndex, period)) {
      return { ok: false, message: '고정된 수업이 있는 칸입니다.' };
    }
    if (!freeMove && targetCell?.value && !isSourceTeacherCell(sourceLesson, targetTeacherCode, target.dayIndex, period)) {
      return { ok: false, message: '해당 전담의 시간이 비어 있지 않습니다.' };
    }

    if (freeMove && hasLockedClassConflict(lesson.classCode, target.dayIndex, period, sourceLesson)) {
      return { ok: false, message: '같은 반의 고정된 수업이 이미 있습니다.' };
    }
    if (!freeMove && hasClassAtManualTimeExcept(lesson.classCode, target.dayIndex, period, sourceLesson)) {
      return { ok: false, message: '같은 반 수업이 이미 있습니다.' };
    }

    const roomName = String(lesson.roomName || '').trim();
    if (roomName && roomName !== '교실') {
      const room = findManualRoom(roomName);
      if (!room) return { ok: false, message: '해당 특별실 시간표를 찾을 수 없습니다.' };
      const roomCell = room.grid?.[period - 1]?.[target.dayIndex];
      if (roomCell?.isBlocked && !freeMove) return { ok: false, message: '특별실 제외시간입니다.' };
      if (freeMove && hasLockedRoomConflict(roomName, target.dayIndex, period, lesson.classCode)) {
        return { ok: false, message: '특별실에 연결된 고정 수업이 있습니다.' };
      }
      if (!freeMove && roomCell?.value && !isSourceRoomCell(sourceLesson, roomName, target.dayIndex, period)) {
        return { ok: false, message: '특별실이 이미 사용 중입니다.' };
      }
    }
  }

  const warning = periods.some((period) => period >= 5);
  return {
    ok: true,
    warning,
    message: warning ? '배치 가능하지만 5~6교시입니다.' : '배치 가능'
  };
}

function hasLockedClassConflict(classCode, dayIndex, period, sourceLesson) {
  return (lastResult?.teachers || []).some((teacher) => {
    const cell = teacher.grid?.[period - 1]?.[dayIndex];
    if (!cell?.value || !cell.locked || String(cell.classCode || '') !== String(classCode || '')) return false;
    return !isSourceTeacherCell(sourceLesson, teacher.teacherName, dayIndex, period);
  });
}

function hasLockedRoomConflict(roomName, dayIndex, period, classCode) {
  const room = findManualRoom(roomName);
  const cell = room?.grid?.[period - 1]?.[dayIndex];
  const entries = Array.isArray(cell?.entries) ? cell.entries : [];
  return entries.some((entry) => {
    if (String(entry.classCode || '') === String(classCode || '')) return false;
    const linked = findLessonByClassTime(String(entry.classCode || ''), dayIndex, period);
    return linked?.locked;
  });
}

function isSourceTeacherCell(sourceLesson, teacherCode, dayIndex, period) {
  if (!sourceLesson) return false;
  if (String(sourceLesson.teacher || '') !== String(teacherCode || '')) return false;
  if (Number(sourceLesson.dayIndex) !== Number(dayIndex)) return false;
  return period >= Number(sourceLesson.period) && period < Number(sourceLesson.period) + Number(sourceLesson.duration || 1);
}

function isSourceRoomCell(sourceLesson, roomName, dayIndex, period) {
  if (!sourceLesson) return false;
  if (String(sourceLesson.roomName || '') !== String(roomName || '')) return false;
  if (Number(sourceLesson.dayIndex) !== Number(dayIndex)) return false;
  return period >= Number(sourceLesson.period) && period < Number(sourceLesson.period) + Number(sourceLesson.duration || 1);
}

function getLessonUnitFromCell(teacherCode, dayIndex, period) {
  const teacher = findResultTeacher(teacherCode);
  const cell = teacher?.grid?.[period - 1]?.[dayIndex];
  if (!teacher || !cell || !cell.value) return null;
  const subject = cell.subject || extractSubjectFromValue(cell.value);
  const singlePattern = isAllSinglePatternForManualLesson(teacher.teacherName, subject, cell.classCode);

  let start = period;
  if (!singlePattern) {
    while (start > 1) {
      const prev = teacher.grid[start - 2][dayIndex];
      if (!prev || prev.value !== cell.value || prev.classCode !== cell.classCode) break;
      start -= 1;
    }
  }

  let duration = 1;
  if (!singlePattern) {
    while (start + duration <= 6) {
      const next = teacher.grid[start - 1 + duration][dayIndex];
      if (!next || next.value !== cell.value || next.classCode !== cell.classCode) break;
      duration += 1;
    }
  }

  return {
    teacher: teacher.teacherName,
    subject,
    classCode: cell.classCode,
    roomName: cell.roomName === '교실' ? '' : (cell.roomName || ''),
    dayIndex,
    period: start,
    duration,
    value: cell.value,
    locked: !!cell.locked,
    cell
  };
}

function clearLessonUnit(lesson) {
  const dayIndex = Number(lesson?.dayIndex);
  const period = Number(lesson?.period);
  const duration = Number(lesson?.duration || 1);
  if (!Number.isFinite(dayIndex) || !Number.isFinite(period) || !Number.isFinite(duration)) return;

  const teacher = findResultTeacher(lesson.teacher);
  if (!teacher) return;

  for (let i = 0; i < duration; i += 1) {
    const rowIndex = period - 1 + i;
    if (!teacher.grid?.[rowIndex]?.[dayIndex]) continue;
    teacher.grid[rowIndex][dayIndex] = {
      dayIndex,
      period: period + i,
      value: '',
      isBlocked: false,
      roomName: '',
      classCode: '',
      subject: '',
      teacher: lesson.teacher
    };
  }

  if (lesson.roomName) {
    const room = findManualRoom(lesson.roomName);
    if (room) {
      for (let i = 0; i < duration; i += 1) {
        const cell = room.grid?.[period - 1 + i]?.[dayIndex];
        if (!cell) continue;
        if (Array.isArray(cell.entries) && cell.entries.length) {
          const nextEntries = cell.entries.filter((entry) => String(entry.classCode || '').trim() !== String(lesson.classCode || '').trim());
          cell.entries = nextEntries;
          cell.value = joinRoomEntries(nextEntries);
          continue;
        }
        if (String(cell.value || '').includes(lesson.classCode)) {
          cell.value = '';
        }
      }
    }
  }
}

function removeLockForLesson(lesson) {
  appConfig.lockedLessons = (appConfig.lockedLessons || []).filter((item) => !isSameLock(item, lesson));
}

function findResultTeacher(teacherCode) {
  return (lastResult?.teachers || []).find((teacher) => teacher.teacherName === teacherCode || teacher.displayName === teacherCode);
}

function extractSubjectFromValue(value) {
  const first = String(value || '').charAt(0);
  const found = SUBJECT_OPTIONS.find((subject) => subject.charAt(0) === first);
  return found || first;
}

function getCellToneClass(cell) {
  if (!cell || cell.isBlocked || !cell.value) return '';

  const mode = appConfig.viewOptions?.colorMode || 'subject';
  if (mode === 'none') return '';

  if (mode === 'grade') {
    const grade = Number(String(cell.classCode || '').split('-')[0]);
    return grade ? `tone-grade-${grade}` : 'tone-etc';
  }

  const first = String(cell.subject || cell.value || '').charAt(0);
  const map = {
    국: 'tone-korean',
    도: 'tone-ethics',
    사: 'tone-social',
    수: 'tone-math',
    과: 'tone-science',
    실: 'tone-practical',
    체: 'tone-pe',
    음: 'tone-music',
    미: 'tone-art',
    영: 'tone-english',
    창: 'tone-creative',
    기: 'tone-etc'
  };

  return map[first] || 'tone-etc';
}

function renderRoomTimetable(result, areaId = 'roomTimetableArea') {
  const area = document.getElementById(areaId);
  if (!area) return;

  const rooms = result.rooms || [];
  if (!rooms.length) {
    area.classList.add('empty');
    area.textContent = '등록된 특별실이 없습니다.';
    return;
  }

  area.classList.remove('empty');
  area.innerHTML = rooms.map((room) => `
    <div class="room-table">
      <div class="teacher-title">${escapeHtml(room.roomName)} <span class="room-capacity-label">수용 ${room.capacity}</span></div>
      <table>
        <thead>
          <tr>
            <th>교시</th>
            ${DAYS.map((day) => `<th>${day}</th>`).join('')}
          </tr>
        </thead>
        <tbody>
          ${getRoomDisplaySlotsForRoom(room.roomName).map((slot, slotIndex) => `
            <tr>
              <th>${escapeHtml(slot.label)}</th>
              ${DAYS.map((_day, dayIndex) => {
                const cell = makeRoomDisplayCell(room, dayIndex, slot);
                const periodAttr = cell.period ? `data-period="${cell.period}"` : '';
                return `<td class="${cell.isBlocked ? 'blocked' : ''} room-value-cell" data-room-name="${escapeAttr(room.roomName)}" data-day-index="${dayIndex}" data-slot-index="${slotIndex}" ${periodAttr}>${makeRoomCellContentHtml(room, cell)}</td>`;
              }).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `).join('');

  bindRoomTimetableInteractions(area);
}

function getNormalRoomDisplaySlots() {
  return PERIODS.map((period) => ({
    label: String(period),
    actualSlot: period,
    gradesByPeriod: { [period]: [1, 2, 3, 4, 5, 6] }
  }));
}

function getRoomDisplaySlots() {
  if (appConfig.roomLunch?.enabled !== true) {
    return getNormalRoomDisplaySlots();
  }

  const lunchAfterByGrade = getRoomLunchAfterByGrade();
  const slots = new Map();
  [1, 2, 3, 4, 5, 6].forEach((grade) => {
    const lunchAfter = Number(lunchAfterByGrade[grade] || 4);
    PERIODS.forEach((period) => {
      const actualSlot = period <= lunchAfter ? period : period + 1;
      const slot = slots.get(actualSlot) || { actualSlot, gradesByPeriod: {} };
      slot.gradesByPeriod[period] ||= [];
      slot.gradesByPeriod[period].push(grade);
      slots.set(actualSlot, slot);
    });
  });

  return Array.from(slots.values())
    .sort((a, b) => a.actualSlot - b.actualSlot)
    .map((slot) => ({ ...slot, label: makeRoomDisplaySlotLabel(slot) }));
}

function getRoomDisplaySlotsForRoom(roomName) {
  return shouldUseSplitRoomSlots(roomName) ? getRoomDisplaySlots() : getNormalRoomDisplaySlots();
}

function shouldUseSplitRoomSlots(roomName) {
  return appConfig.roomLunch?.enabled === true && isIndependentRoomForAssignment(roomName);
}

function makeRoomDisplaySlotLabel(slot) {
  const parts = Object.entries(slot.gradesByPeriod)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([period, grades]) => {
      const cleanGrades = [...new Set(grades.map(Number))].sort((a, b) => a - b);
      return cleanGrades.length === 6 ? `${period}` : `${period}(${cleanGrades.join(',')})`;
    });
  return parts.join(' / ');
}

function makeRoomDisplayCell(room, dayIndex, slot) {
  const entries = [];
  let isBlocked = false;
  const splitRoom = shouldUseSplitRoomSlots(room?.roomName);
  Object.entries(slot.gradesByPeriod).forEach(([periodText, grades]) => {
    const period = Number(periodText);
    const cell = room?.grid?.[period - 1]?.[dayIndex];
    if (cell?.isBlocked) isBlocked = true;
    const cellEntries = Array.isArray(cell?.entries) ? cell.entries : [];
    cellEntries.forEach((entry) => {
      const grade = getGradeFromClassCode(entry.classCode);
      if (splitRoom) {
        if (getRoomEntryActualSlot(entry, period, room.roomName) !== Number(slot.actualSlot)) return;
      } else if (!grades.map(Number).includes(grade)) {
        return;
      }
      entries.push({ ...entry, period });
    });
  });

  const value = joinRoomEntries(entries);
  return {
    dayIndex,
    period: entries.length === 1 ? entries[0].period : '',
    value,
    entries,
    isBlocked: isBlocked && !entries.length
  };
}

function makeRoomCellContentHtml(room, cell) {
  if (cell.isBlocked) return '';
  const entries = Array.isArray(cell.entries) ? cell.entries : [];
  if (!entries.length) return escapeHtml(cell.value || '');

  const capacity = Math.max(1, Number(room?.capacity || 1));
  const splitClass = capacity > 1 || entries.length > 1 ? ' room-entry-stack' : '';
  return `<div class="room-entry-list${splitClass}">${entries.map((entry) => {
    const movable = String(entry.source || '') === '특별실';
    const removable = entry.isGradeCard === true || isGradeCardClassCode(entry.classCode);
    const label = String(entry.value || entry.classCode || '').trim();
    return `<div class="room-entry-chip ${movable ? 'room-entry-movable' : ''} ${removable ? 'room-entry-removable' : ''}" data-room-name="${escapeAttr(room.roomName)}" data-day-index="${cell.dayIndex}" data-period="${entry.period || cell.period || ''}" data-class-code="${escapeAttr(entry.classCode || '')}" ${movable ? 'draggable="true"' : ''}>
      <span>${escapeHtml(label)}</span>
      ${removable ? '<button type="button" class="room-entry-delete" title="삭제">×</button>' : ''}
    </div>`;
  }).join('')}</div>`;
}

function getMovableRoomEntry(cell) {
  if (!cell || cell.isBlocked) return null;
  const entries = Array.isArray(cell.entries) ? cell.entries : [];
  if (entries.length !== 1) return null;
  const entry = entries[0];
  if (!entry || String(entry.source || '') !== '특별실') return null;
  if (!String(entry.classCode || '').trim()) return null;
  return entry;
}

function getRoomLessonUnitFromCell(roomName, dayIndex, period, classCode) {
  const room = findManualRoom(roomName);
  const firstCell = room?.grid?.[Number(period) - 1]?.[Number(dayIndex)];
  const firstEntry = getRoomEntryFromCell(firstCell, classCode);
  if (!room || !firstEntry || String(firstEntry.source || '') !== '특별실') return null;

  let start = Number(period);
  while (start > 1) {
    const prevEntry = getRoomEntryFromCell(room.grid?.[start - 2]?.[dayIndex], classCode);
    if (!isSameRoomLessonEntry(prevEntry, firstEntry)) break;
    start -= 1;
  }

  let duration = 1;
  while (start + duration <= 6) {
    const nextEntry = getRoomEntryFromCell(room.grid?.[start - 1 + duration]?.[dayIndex], classCode);
    if (!isSameRoomLessonEntry(nextEntry, firstEntry)) break;
    duration += 1;
  }

  return {
    roomName,
    dayIndex,
    period: start,
    duration,
    classCode: String(firstEntry.classCode || '').trim()
  };
}

function getRoomEntryFromCell(cell, classCode) {
  const targetClass = String(classCode || '').trim();
  const entries = Array.isArray(cell?.entries) ? cell.entries : [];
  return entries.find((entry) => String(entry.classCode || '').trim() === targetClass) || null;
}

function isSameRoomLessonEntry(a, b) {
  if (!a || !b) return false;
  return String(a.source || '') === String(b.source || '') &&
    String(a.classCode || '') === String(b.classCode || '') &&
    String(a.value || '') === String(b.value || '');
}

function bindRoomTimetableInteractions(area) {
  area.querySelectorAll('.room-entry-delete').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const chip = button.closest('.room-entry-chip');
      if (!chip) return;
      deleteRoomGradeEntry({
        roomName: chip.dataset.roomName,
        dayIndex: Number(chip.dataset.dayIndex),
        period: Number(chip.dataset.period),
        classCode: chip.dataset.classCode
      });
    });
  });

  area.querySelectorAll('.room-entry-chip[draggable="true"]').forEach((chip) => {
    chip.addEventListener('dragstart', (event) => {
      const roomName = chip.dataset.roomName;
      const dayIndex = Number(chip.dataset.dayIndex);
      const period = Number(chip.dataset.period);
      const classCode = chip.dataset.classCode;
      const unit = getRoomLessonUnitFromCell(roomName, dayIndex, period, classCode);
      if (!unit) {
        event.preventDefault();
        return;
      }
      activeDragLesson = { type: 'room-cell', source: unit };
      chip.classList.add('room-entry-dragging');
      event.dataTransfer.setData('text/plain', JSON.stringify(unit));
    });
    chip.addEventListener('dragend', () => {
      clearDropTarget();
      clearRoomEntryDragging();
      activeDragLesson = null;
    });
  });

  area.querySelectorAll('td.room-value-cell').forEach((cell) => {
    cell.addEventListener('dragover', (event) => {
      event.preventDefault();
      showRoomDropTarget(cell);
    });
    cell.addEventListener('dragleave', () => {
      clearDropTarget();
    });
    cell.addEventListener('drop', (event) => {
      event.preventDefault();
      clearDropTarget();
      try {
        const source = JSON.parse(event.dataTransfer.getData('text/plain'));
        if (source.type === 'unplaced') {
          manuallyPlaceUnplacedInRoom(Number(source.index), {
            roomName: cell.dataset.roomName,
            dayIndex: Number(cell.dataset.dayIndex),
            period: getRoomTargetPeriodFromCell(cell, lastResult?.unplacedLessons?.[Number(source.index)]?.classCode)
          });
          return;
        }
        if (source.type === 'room-grade') {
          manuallyPlaceRoomGradeCard(source.grade, {
            roomName: cell.dataset.roomName,
            dayIndex: Number(cell.dataset.dayIndex),
            period: getRoomTargetPeriodFromCell(cell, `${source.grade}학년`)
          });
          return;
        }
        const targetChip = event.target.closest?.('.room-entry-chip');
        const targetClassCode = shouldSwapRoomDrop(cell, targetChip, source)
          ? (targetChip?.dataset.classCode || '')
          : '';
        moveRoomCell(source, {
          roomName: cell.dataset.roomName,
          dayIndex: Number(cell.dataset.dayIndex),
          period: getRoomTargetPeriodFromCell(cell, source.classCode),
          targetClassCode
        });
      } catch (_err) {
        // no-op
      }
    });
  });
}

function getRoomTargetPeriodFromCell(cell, classCode) {
  const explicit = Number(cell?.dataset.period);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;

  const grade = getGradeFromClassCode(classCode);
  const slot = getRoomDisplaySlotsForRoom(cell?.dataset.roomName)[Number(cell?.dataset.slotIndex)];
  if (!slot || !grade) return 0;

  const found = Object.entries(slot.gradesByPeriod).find(([_period, grades]) => grades.map(Number).includes(grade));
  return found ? Number(found[0]) : 0;
}

function shouldSwapRoomDrop(cell, targetChip, source) {
  if (!cell || !targetChip || !source) return false;
  const room = findManualRoom(cell.dataset.roomName);
  const capacity = Math.max(1, Number(room?.capacity || 1));
  if (capacity <= 1) return true;

  const dayIndex = Number(cell.dataset.dayIndex);
  const period = getRoomTargetPeriodFromCell(cell, source.classCode);
  const entries = getRoomEntriesForSlot(cell.dataset.roomName, dayIndex, period, source.classCode)
    .filter((entry) => !isRoomUnitCell(source, cell.dataset.roomName, dayIndex, period, entry.classCode));
  return entries.length >= capacity;
}

function moveRoomCell(source, target) {
  if (!lastResult) return;
  if (!source || !target) return;
  if (String(source.roomName || '') !== String(target.roomName || '')) {
    alert('같은 특별실 시간표 안에서만 이동할 수 있습니다.');
    return;
  }
  if (String(source.roomName) === String(target.roomName) &&
      Number(source.dayIndex) === Number(target.dayIndex) &&
      Number(source.period) === Number(target.period)) return;

  const sourceRoom = findManualRoom(source.roomName);
  const targetRoom = findManualRoom(target.roomName);
  if (!sourceRoom || !targetRoom) return;

  const sourcePeriod = Number(source.period);
  const sourceDay = Number(source.dayIndex);
  const targetPeriod = Number(target.period);
  const targetDay = Number(target.dayIndex);
  const duration = Math.max(1, Number(source.duration || 1));
  const sourceCell = sourceRoom.grid?.[sourcePeriod - 1]?.[sourceDay];
  const movingEntry = getRoomEntryFromCell(sourceCell, source.classCode);
  if (!movingEntry || String(movingEntry.source || '') !== '특별실') {
    alert('전담과 연계된 특별실 수업은 여기서 이동할 수 없습니다.');
    return;
  }

  const targetPeriods = Array.from({ length: duration }, (_value, index) => targetPeriod + index);
  if (targetPeriods.some((period) => period < 1 || period > 6)) {
    alert('선택한 위치에는 연속 시간이 부족합니다.');
    return;
  }

  const classCode = String(movingEntry.classCode || '').trim();
  const swapUnit = target.targetClassCode
    ? getSwappableRoomUnitAt(targetRoom.roomName, targetDay, targetPeriod, classCode, {
      roomName: String(source.roomName),
      dayIndex: sourceDay,
      period: sourcePeriod,
      duration
    }, target.targetClassCode)
    : null;
  if (swapUnit && Number(swapUnit.duration || 1) !== duration) {
    alert('시간 길이가 같은 수업끼리만 교환할 수 있습니다.');
    return;
  }

  for (const period of targetPeriods) {
    const targetCell = targetRoom.grid?.[period - 1]?.[targetDay];
    if (!targetCell || targetCell.isBlocked) {
      alert('특별실 제외시간입니다.');
      return;
    }
    if (hasClassAtManualTime(classCode, targetDay, period)) {
      alert('해당 시간에 같은 반 전담 수업이 있어 이동할 수 없습니다.');
      return;
    }
    if (hasClassInRoomAtManualTimeExcept(classCode, targetDay, period, {
      roomName: String(source.roomName),
      dayIndex: sourceDay,
      period: sourcePeriod,
      duration
    }, swapUnit ? [swapUnit] : [])) {
      alert('해당 시간에 같은 반 특별실 배정이 이미 있습니다.');
      return;
    }
    if (hasRoomSlotConflict(targetRoom.roomName, targetDay, period, classCode, {
      roomName: String(source.roomName),
      dayIndex: sourceDay,
      period: sourcePeriod,
      duration
    }, swapUnit ? [swapUnit] : [])) {
      alert('대상 칸이 비어 있을 때만 이동하거나, 같은 길이의 특별실 수업과 교환할 수 있습니다.');
      return;
    }
  }

  if (swapUnit) {
    const swapClassCode = String(swapUnit.classCode || '').trim();
    const sourcePeriods = Array.from({ length: duration }, (_value, index) => sourcePeriod + index);
    for (const period of sourcePeriods) {
      if (hasClassAtManualTime(swapClassCode, sourceDay, period)) {
        alert('교환할 수업의 반이 원래 자리 시간에 전담 수업이 있어 교환할 수 없습니다.');
        return;
      }
      if (hasClassInRoomAtManualTimeExcept(swapClassCode, sourceDay, period, swapUnit, [source])) {
        alert('교환할 수업의 반이 원래 자리 시간에 특별실 배정이 있어 교환할 수 없습니다.');
        return;
      }
      if (hasRoomSlotConflict(sourceRoom.roomName, sourceDay, period, swapClassCode, swapUnit, [source])) {
        alert('원래 자리에도 교환할 수 없는 특별실 수업이 있습니다.');
        return;
      }
    }
  }

  pushTimetableUndo();
  const swapEntry = swapUnit
    ? getRoomEntryFromCell(targetRoom.grid?.[targetPeriod - 1]?.[targetDay], swapUnit.classCode)
    : null;

  for (let index = 0; index < duration; index += 1) {
    removeRoomEntryAt(sourceRoom, sourceDay, sourcePeriod + index, classCode);
  }
  if (swapUnit) {
    for (let index = 0; index < duration; index += 1) {
      removeRoomEntryAt(targetRoom, targetDay, targetPeriod + index, swapUnit.classCode);
    }
  }
  for (let index = 0; index < duration; index += 1) {
    addRoomEntryAt(targetRoom, targetDay, targetPeriod + index, {
      ...movingEntry,
      period: undefined,
      actualSlot: shouldUseSplitRoomSlots(targetRoom.roomName)
        ? getRoomActualSlotForClass(classCode, targetPeriod + index, targetRoom.roomName)
        : undefined
    });
  }
  if (swapUnit && swapEntry) {
    for (let index = 0; index < duration; index += 1) {
      addRoomEntryAt(sourceRoom, sourceDay, sourcePeriod + index, {
        ...swapEntry,
        period: undefined,
        actualSlot: shouldUseSplitRoomSlots(sourceRoom.roomName)
          ? getRoomActualSlotForClass(swapUnit.classCode, sourcePeriod + index, sourceRoom.roomName)
          : undefined
      });
    }
  }

  updateDerivedViewsFromCurrentResult();
  renderAllResultViews();
}

function getSwappableRoomUnitAt(roomName, dayIndex, period, movingClassCode, sourceUnit, preferredClassCode = '') {
  const room = findManualRoom(roomName);
  const cell = room?.grid?.[Number(period) - 1]?.[Number(dayIndex)];
  if (!cell) return null;

  let entries = getRoomEntriesForSlot(roomName, dayIndex, period, movingClassCode)
    .filter((entry) => String(entry.classCode || '').trim() !== String(movingClassCode || '').trim())
    .filter((entry) => !isRoomUnitCell(sourceUnit, roomName, dayIndex, period, entry.classCode))
    .filter((entry) => String(entry.source || '') === '특별실');
  if (preferredClassCode) {
    entries = entries.filter((entry) => String(entry.classCode || '').trim() === String(preferredClassCode || '').trim());
  }
  if (entries.length !== 1) return null;

  return getRoomLessonUnitFromCell(roomName, Number(dayIndex), Number(period), entries[0].classCode);
}

function getRoomEntriesForSlot(roomName, dayIndex, period, classCodeForSlot) {
  const room = findManualRoom(roomName);
  const cell = room?.grid?.[Number(period) - 1]?.[Number(dayIndex)];
  const entries = Array.isArray(cell?.entries) ? cell.entries : [];
  if (!shouldUseSplitRoomSlots(roomName)) return entries;

  const targetSlot = getRoomActualSlotForClass(classCodeForSlot, period, roomName);
  return entries.filter((entry) => getRoomEntryActualSlot(entry, period, roomName) === targetSlot);
}

function isRoomUnitCell(unit, roomName, dayIndex, period, classCode = '') {
  if (!unit) return false;
  const start = Number(unit.period);
  const end = start + Math.max(1, Number(unit.duration || 1));
  if (String(unit.roomName || '') !== String(roomName || '')) return false;
  if (Number(unit.dayIndex) !== Number(dayIndex)) return false;
  if (Number(period) < start || Number(period) >= end) return false;
  if (classCode && String(unit.classCode || '').trim() !== String(classCode || '').trim()) return false;
  return true;
}

function clearRoomEntryDragging() {
  document.querySelectorAll('.room-entry-dragging').forEach((chip) => {
    chip.classList.remove('room-entry-dragging');
  });
}

function manuallyPlaceUnplacedInRoom(index, target) {
  if (!lastResult || !lastResult.unplacedLessons || !lastResult.unplacedLessons[index]) return;

  const item = lastResult.unplacedLessons[index];
  if (item.teacher !== '특별실') {
    alert('특별실 수업카드만 특별실 시간표에 배치할 수 있습니다.');
    return;
  }

  const roomName = String(item.roomName || item.subject || '').trim();
  if (String(target.roomName || '') !== roomName) {
    alert(`${roomName} 수업카드는 ${roomName} 시간표에 배치하세요.`);
    return;
  }

  const period = Number(target.period);
  const dayIndex = Number(target.dayIndex);
  const periods = isBlockUnit(item) ? [period, period + 1] : [period];
  const check = canManualPlace(item, dayIndex, periods);
  if (!check.ok) {
    alert(check.message);
    return;
  }

  pushTimetableUndo();
  lastResult.unplacedLessons.splice(index, 1);
  clearManualCheckWarnings();
  placeManualRoomLesson(item, dayIndex, periods);
  updateDerivedViewsFromCurrentResult();
  renderAllResultViews();
}

function manuallyPlaceRoomGradeCard(grade, target) {
  if (!lastResult) {
    alert('먼저 수동 작성 또는 시간표 작성을 해주세요.');
    return;
  }

  const roomName = String(target.roomName || '').trim();
  const period = Number(target.period);
  const dayIndex = Number(target.dayIndex);
  if (!roomName || !grade || !period) return;

  const item = {
    teacher: '특별실',
    subject: roomName,
    grade: Number(grade),
    classNo: 0,
    classCode: `${grade}학년`,
    unitType: '1시간 학년',
    roomName,
    reason: '학년 카드',
    isGradeCard: true
  };

  const check = canManualPlace(item, dayIndex, [period]);
  if (!check.ok) {
    alert(check.message);
    return;
  }

  pushTimetableUndo();
  clearManualCheckWarnings();
  placeManualRoomLesson(item, dayIndex, [period]);
  updateDerivedViewsFromCurrentResult();
  renderAllResultViews();
}

function deleteRoomGradeEntry(target) {
  if (!lastResult) return;
  const room = findManualRoom(target.roomName);
  const period = Number(target.period);
  const dayIndex = Number(target.dayIndex);
  const classCode = String(target.classCode || '').trim();
  const entry = getRoomEntryFromCell(room?.grid?.[period - 1]?.[dayIndex], classCode);
  if (!room || !entry || !(entry.isGradeCard === true || isGradeCardClassCode(entry.classCode))) return;

  pushTimetableUndo();
  removeRoomEntryAt(room, dayIndex, period, classCode);
  clearManualCheckWarnings();
  updateDerivedViewsFromCurrentResult();
  renderAllResultViews();
}

function showRoomDropTarget(cell) {
  clearDropTarget();
  if (!cell || !activeDragLesson) return;

  if (activeDragLesson.type === 'room-cell') {
    const source = activeDragLesson.source;
    const period = getRoomTargetPeriodFromCell(cell, source.classCode);
    const dayIndex = Number(cell.dataset.dayIndex);
    const duration = Math.max(1, Number(source.duration || 1));
    const periods = Array.from({ length: duration }, (_value, index) => period + index);
    const sameRoom = String(cell.dataset.roomName || '') === String(source.roomName || '');
    const swapUnit = sameRoom
      ? getSwappableRoomUnitAt(cell.dataset.roomName, dayIndex, period, source.classCode, source)
      : null;
    const extraExcepts = swapUnit && Number(swapUnit.duration || 1) === duration ? [swapUnit] : [];
    const ok = sameRoom &&
      period > 0 &&
      periods.every((targetPeriod) => targetPeriod >= 1 && targetPeriod <= 6) &&
      periods.every((targetPeriod) => !hasClassAtManualTime(source.classCode, dayIndex, targetPeriod)) &&
      periods.every((targetPeriod) => !hasClassInRoomAtManualTimeExcept(source.classCode, dayIndex, targetPeriod, source, extraExcepts)) &&
      periods.every((targetPeriod) => !hasRoomSlotConflict(cell.dataset.roomName, dayIndex, targetPeriod, source.classCode, source, extraExcepts));
    const toneClass = ok ? 'placement-ok' : 'placement-bad';
    const area = document.getElementById(activeRoomAreaId || 'roomTimetableArea');
    const highlightCells = getRoomDisplayCellsForPeriods(area, cell.dataset.roomName, dayIndex, source.classCode, periods);
    if (!highlightCells.length) highlightCells.push(cell);
    highlightCells.forEach((targetCell) => {
      targetCell?.classList.add('placement-target', toneClass);
      if (targetCell) targetCell.title = ok ? (extraExcepts.length ? '교환 가능' : '이동 가능') : '이동 불가';
    });
    return;
  }

  if (activeDragLesson.type === 'room-grade') {
    const grade = Number(activeDragLesson.grade || 0);
    const item = {
      teacher: '특별실',
      subject: cell.dataset.roomName || '',
      classCode: `${grade}학년`,
      unitType: '1시간 학년',
      roomName: cell.dataset.roomName || '',
      isGradeCard: true
    };
    const period = getRoomTargetPeriodFromCell(cell, item.classCode);
    const dayIndex = Number(cell.dataset.dayIndex);
    const check = canManualPlace(item, dayIndex, [period]);
    const toneClass = check.ok ? 'placement-ok' : 'placement-bad';
    cell.classList.add('placement-target', toneClass);
    cell.title = check.message || (check.ok ? '배치 가능' : '배치 불가');
    return;
  }

  if (activeDragLesson.type !== 'unplaced') return;

  const item = lastResult?.unplacedLessons?.[Number(activeDragLesson.index)];
  if (!item || item.teacher !== '특별실') return;

  const period = getRoomTargetPeriodFromCell(cell, item.classCode);
  const dayIndex = Number(cell.dataset.dayIndex);
  const periods = isBlockUnit(item) ? [period, period + 1] : [period];
  const roomName = String(item.roomName || item.subject || '').trim();
  const sameRoom = String(cell.dataset.roomName || '') === roomName;
  const check = sameRoom
    ? canManualPlace(item, dayIndex, periods)
    : { ok: false, message: `${roomName} 시간표에 배치하세요.` };
  const toneClass = check.ok ? 'placement-ok' : 'placement-bad';
  const area = document.getElementById(activeRoomAreaId || 'roomTimetableArea');

  const highlightCells = getRoomDisplayCellsForPeriods(area, cell.dataset.roomName, dayIndex, item.classCode, periods);
  if (!highlightCells.length) highlightCells.push(cell);
  highlightCells.forEach((targetCell) => {
    targetCell?.classList.add('placement-target', toneClass);
    if (targetCell) targetCell.title = check.message || (check.ok ? '배치 가능' : '배치 불가');
  });
}

function getRoomDisplayCellsForPeriods(area, roomName, dayIndex, classCode, periods) {
  return Array.from(area?.querySelectorAll(`td[data-room-name="${cssEscape(roomName)}"][data-day-index="${dayIndex}"]`) || [])
    .filter((cell) => periods.includes(getRoomTargetPeriodFromCell(cell, classCode)));
}


function makeWeeklyHoursHtml(result) {
  const resultHtml = result
    ? `${makeGradeHourSummaryHtml(result)}${makeTeacherWeeklyHoursHtml(result)}`
    : '<div class="empty-guide">시간표 작성을 실행하면 학년별 전담시수와 잔여 주당수업시수가 표시됩니다.</div>';

  return `
    <div class="aux-split">
      <section class="aux-section">
        <div class="aux-section-head">
          <div>
            <h3>시수 입력</h3>
            <p>학년별 요일 운영 교시를 필요할 때만 수정합니다.</p>
          </div>
          <button type="button" id="applyWeeklyHoursBtn" class="small">시수 저장</button>
        </div>
        <div id="weeklyScheduleModalArea" class="weekly-schedule-area compact">
          ${makeWeeklyScheduleInputHtml()}
        </div>
      </section>
      <section class="aux-section">
        <div class="aux-section-head">
          <div>
            <h3>시수 결과</h3>
            <p>학년별 수업시수와 전담별 주당시수를 함께 확인합니다.</p>
          </div>
        </div>
        ${resultHtml}
      </section>
    </div>
  `;
}

function makeGradeHourSummaryHtml(result) {
  const rows = getGradeHourRows(result);
  return `
    <table class="hours-table">
      <thead>
        <tr>
          <th>학년</th>
          <th>학급 수</th>
          <th>총시수</th>
          <th>전담시수</th>
          <th>주당수업시수</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <th>${row.grade}학년</th>
            <td>${row.classCount}</td>
            <td>${row.totalHours}</td>
            <td>${escapeHtml(row.dedicatedText)}</td>
            <td>${escapeHtml(row.remainingText)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function makeTeacherWeeklyHoursHtml(result) {
  const rows = result?.teacherLoadSummaries || [];
  if (!rows.length) return '';

  return `
    <div class="teacher-hours-block">
      <div class="hours-subtitle">
        <strong>\uC804\uB2F4\uBCC4 \uC8FC\uB2F9\uC2DC\uC218</strong>
        <span>\uD604\uC7AC \uC791\uC131\uB41C \uC804\uB2F4\uC2DC\uAC04\uD45C \uAE30\uC900</span>
      </div>
      <table class="hours-table teacher-hours-table">
        <thead>
          <tr>
            <th>\uC804\uB2F4</th>
            ${DAYS.map((day) => `<th>${day}</th>`).join('')}
            <th>\uACC4</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => {
            const name = row.displayName || row.teacherName || '';
            const daily = Array.isArray(row.daily) ? row.daily : [0, 0, 0, 0, 0];
            const total = Number(row.total || daily.reduce((sum, value) => sum + Number(value || 0), 0));
            return `
              <tr>
                <th>${escapeHtml(name)}</th>
                ${DAYS.map((_day, index) => `<td>${Number(daily[index] || 0)}</td>`).join('')}
                <td><strong>${total}</strong></td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function getGradeHourRows(result) {
  const schedule = appConfig.weeklySchedule || getDefaultWeeklySchedule();
  const summaries = result?.classHourSummaries || [];

  return [1, 2, 3, 4, 5, 6].map((grade) => {
    const gradeClasses = appConfig.gradeClasses.find((item) => Number(item.grade) === grade);
    const classCount = Number(gradeClasses?.classCount || 0);
    const daily = schedule.find((item) => Number(item.grade) === grade)?.daily || getDefaultWeeklySchedule().find((item) => item.grade === grade)?.daily || [0, 0, 0, 0, 0];
    const gradeSummaries = summaries.filter((item) => Number(item.grade) === grade);
    const dedicated = gradeSummaries.map((item) => Number(item.dedicatedHours || 0));
    const remaining = gradeSummaries.map((item) => Number(item.remainingHours || 0));

    return {
      grade,
      classCount,
      totalHours: daily.reduce((sum, value) => sum + Number(value || 0), 0),
      dedicatedText: dedicated.length ? formatHourRange(dedicated) : '-',
      remainingText: remaining.length ? formatHourRange(remaining) : '-'
    };
  });
}

function formatHourRange(values) {
  const filtered = values.filter((value) => !Number.isNaN(Number(value)));
  if (!filtered.length) return '-';
  const min = Math.min(...filtered);
  const max = Math.max(...filtered);
  return min === max ? `${min}` : `${min}~${max}`;
}


function getClassLoadNotices(result) {
  const grouped = new Map();

  (result?.classHourSummaries || []).forEach((summary) => {
    (summary.warnings || [])
      .filter((warning) => Number(warning.hours || 0) >= 3)
      .forEach((warning) => {
        const hours = Number(warning.hours || 0);
        const key = `${summary.classCode}|${hours}`;
        if (!grouped.has(key)) {
          grouped.set(key, { classCode: summary.classCode, days: [], hours });
        }
        grouped.get(key).days.push(warning.day);
      });
  });

  return Array.from(grouped.values()).map((item) => ({
    ...item,
    dayText: item.days.map((day) => `${day}요일`).join(', ')
  }));
}

function showWeeklyHoursView() {
  showAuxView('주당 수업시수', '필요할 때만 시수 입력과 결과를 확인합니다.', makeWeeklyHoursHtml(lastResult));
  bindWeeklyHoursView();
}

function bindWeeklyHoursView() {
  const body = document.getElementById('auxViewBody');
  if (!body) return;

  const scheduleArea = body.querySelector('#weeklyScheduleModalArea');
  bindWeeklyScheduleInputs(scheduleArea);

  body.querySelector('#applyWeeklyHoursBtn')?.addEventListener('click', () => {
    collectWeeklySchedule(scheduleArea);
    updateDerivedViewsFromCurrentResult();
    scheduleAutoSave();
    body.innerHTML = makeWeeklyHoursHtml(lastResult);
    bindWeeklyHoursView();
  });
}

function showAuxView(title, subtitle, bodyHtml) {
  let overlay = document.getElementById('auxViewOverlay');
  if (!overlay) {
    document.body.insertAdjacentHTML('beforeend', `
      <div id="auxViewOverlay" class="print-preview-overlay">
        <div class="print-preview-panel aux-view-panel">
          <div class="print-preview-head">
            <div>
              <h2 id="auxViewTitle"></h2>
              <p id="auxViewSubtitle"></p>
            </div>
            <button type="button" id="closeAuxViewBtn">닫기</button>
          </div>
          <div id="auxViewBody" class="print-preview-body"></div>
        </div>
      </div>
    `);
    overlay = document.getElementById('auxViewOverlay');
    document.getElementById('closeAuxViewBtn').addEventListener('click', () => overlay.classList.remove('active'));
  }

  document.getElementById('auxViewTitle').textContent = title;
  document.getElementById('auxViewSubtitle').textContent = subtitle;
  document.getElementById('auxViewBody').innerHTML = bodyHtml;
  overlay.classList.add('active');
}


function renderAllResultViews() {
  if (!lastResult) return;
  renderTimetable(lastResult, activeTimetableAreaId || 'timetableArea');
  renderRoomTimetable(lastResult, activeRoomAreaId || 'roomTimetableArea');
  renderUnplaced(lastResult.unplacedLessons || [], activeUnplacedAreaId || 'unplacedArea');
  renderManualLessonBank(lastResult.unplacedLessons || []);
  renderRoomLessonBank(lastResult.unplacedLessons || []);
  renderWarnings([...(configIssues || []), ...(lastResult.warnings || [])], activeWarningAreaId || 'warningArea');
  updateSummary();
}

function updateDerivedViewsFromCurrentResult() {
  if (!lastResult) return;

  const classCodes = [];
  (appConfig.gradeClasses || []).forEach((item) => {
    const grade = Number(item.grade);
    const classCount = Number(item.classCount || 0);
    for (let classNo = 1; classNo <= classCount; classNo += 1) {
      classCodes.push(`${grade}-${classNo}`);
    }
  });

  lastResult.classTimetables = classCodes.map((classCode) => {
    const [grade, classNo] = classCode.split('-').map(Number);
    const grid = PERIODS.map((period) => DAYS.map((_day, dayIndex) => ({
      dayIndex,
      period,
      value: '',
      teacher: '',
      subject: '',
      roomName: '',
      source: ''
    })));

    (lastResult.teachers || []).forEach((teacher) => {
      (teacher.grid || []).forEach((row, periodIndex) => {
        row.forEach((cell, dayIndex) => {
          if (!cell?.value || cell.classCode !== classCode) return;
          grid[periodIndex][dayIndex] = {
            dayIndex,
            period: periodIndex + 1,
            value: cell.value,
            teacher: teacher.displayName || teacher.teacherName,
            subject: cell.subject || '',
            roomName: cell.roomName || '교실',
            source: '전담'
          };
        });
      });
    });

    return { classCode, grade, classNo, grid };
  });

  const schedule = appConfig.weeklySchedule || getDefaultWeeklySchedule();
  lastResult.classHourSummaries = lastResult.classTimetables.map((item) => {
    const dailyTotal = (schedule.find((row) => Number(row.grade) === item.grade)?.daily || [0, 0, 0, 0, 0]).map(Number);
    const dailyDedicated = DAYS.map((_day, dayIndex) => item.grid.reduce((count, row) => count + (row[dayIndex]?.value ? 1 : 0), 0));
    const totalHours = dailyTotal.reduce((sum, value) => sum + value, 0);
    const dedicatedHours = dailyDedicated.reduce((sum, value) => sum + value, 0);
    return {
      classCode: item.classCode,
      grade: item.grade,
      classNo: item.classNo,
      dailyTotal,
      dailyDedicated,
      totalHours,
      dedicatedHours,
      remainingHours: Math.max(0, totalHours - dedicatedHours),
      warnings: dailyDedicated
        .map((hours, dayIndex) => ({ day: DAYS[dayIndex], hours, limit: dailyTotal[dayIndex] || 0 }))
        .filter((row) => row.hours >= 3 || row.hours > row.limit)
    };
  });

  lastResult.teacherLoadSummaries = (lastResult.teachers || []).map((teacher) => {
    const daily = DAYS.map((_day, dayIndex) => (teacher.grid || []).reduce((count, row) => count + (row[dayIndex]?.value ? 1 : 0), 0));
    return {
      teacherName: teacher.teacherName,
      displayName: teacher.displayName,
      header: teacher.header,
      daily,
      total: daily.reduce((sum, value) => sum + value, 0)
    };
  });
}

function resetTimetableViews() {
  document.getElementById('warningArea').innerHTML = '';
  renderManualLessonBank([]);

  const timetableArea = document.getElementById('timetableArea');
  timetableArea.className = 'timetable-wrap empty';
  timetableArea.textContent = '수동 작성 또는 시간표 작성을 누르면 전담시간표가 표시됩니다.';

  const roomArea = document.getElementById('roomTimetableArea');
  roomArea.className = 'room-timetable-wrap empty';
  roomArea.textContent = '시간표 작성 후 특별실별 시간표가 표시됩니다.';

  const unplacedArea = document.getElementById('unplacedArea');
  unplacedArea.className = 'unplaced-list';
  unplacedArea.textContent = '수동 작성 또는 시간표 작성 후 확인할 수 있습니다.';
  updateSummary();
}

function makePrintPreviewHtml() {
  return `
    <h3>\uC804\uB2F4\uC2DC\uAC04\uD45C</h3>
    <div class="print-pair-grid">${makePrintTeacherBlocks(lastResult)}</div>
    <h3>\uD2B9\uBCC4\uC2E4 \uC2DC\uAC04\uD45C</h3>
    <div class="print-pair-grid">${makePrintRoomBlocks(lastResult)}</div>
  `;
}

function showPrintPreview() {
  if (!lastResult) {
    alert('\uBA3C\uC800 \uC2DC\uAC04\uD45C \uC791\uC131\uC744 \uC2E4\uD589\uD558\uC138\uC694.');
    return;
  }

  let overlay = document.getElementById('printPreviewOverlay');
  if (!overlay) {
    document.body.insertAdjacentHTML('beforeend', `
      <div id="printPreviewOverlay" class="print-preview-overlay">
        <div class="print-preview-panel">
          <div class="print-preview-head">
            <div>
              <h2>\uCD9C\uB825\uC6A9 \uBCF4\uAE30</h2>
              <p>\uCD9C\uB825 \uD615\uD0DC\uC640 \uBE44\uC2B7\uD558\uAC8C 2\uAC1C\uC529 \uBB36\uC5B4 \uD655\uC778\uD569\uB2C8\uB2E4.</p>
            </div>
            <div class="print-preview-actions">
              <button type="button" id="printNowBtn" class="primary">\uCD9C\uB825</button>
              <button type="button" id="closePrintPreviewBtn">\uB2EB\uAE30</button>
            </div>
          </div>
          <div id="printPreviewBody" class="print-preview-body"></div>
        </div>
      </div>
    `);
    overlay = document.getElementById('printPreviewOverlay');
    document.getElementById('closePrintPreviewBtn').addEventListener('click', () => {
      overlay.classList.remove('active');
    });
    document.getElementById('printNowBtn')?.addEventListener('click', () => window.print());
  }

  document.getElementById('printPreviewBody').innerHTML = makePrintPreviewHtml();
  overlay.classList.add('active');
}

function printCurrentResult() {
  if (!lastResult) {
    build();
  }

  if (!lastResult) return;

  showPrintPreview();
  setTimeout(() => window.print(), 120);
}
function makePrintTeacherBlocks(result) {
  return (result.teachers || []).map((teacher) => `
    <div class="print-block">
      <div class="teacher-title">${escapeHtml(teacher.header)}</div>
      <table>
        <thead>
          <tr><th>교시</th>${DAYS.map((day) => `<th>${day}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${teacher.grid.map((row, index) => `
            <tr>
              <th>${index + 1}</th>
              ${row.map((cell) => `<td class="${cell.isBlocked ? 'blocked' : ''} ${getCellToneClass(cell)}">${makeTeacherCellHtml(cell)}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `).join('');
}

function makePrintRoomBlocks(result) {
  return (result.rooms || []).map((room) => `
    <div class="print-block">
      <div class="teacher-title">${escapeHtml(room.roomName)} <span class="room-capacity-label">수용 ${room.capacity}</span></div>
      <table>
        <thead>
          <tr><th>교시</th>${DAYS.map((day) => `<th>${day}</th>`).join('')}</tr>
        </thead>
        <tbody>
          ${room.grid.map((row, index) => `
            <tr>
              <th>${index + 1}</th>
              ${row.map((cell) => `<td class="${cell.isBlocked ? 'blocked' : ''} room-value-cell">${escapeHtml(cell.isBlocked ? '' : cell.value || '')}</td>`).join('')}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `).join('');
}


function renderUnplaced(items, areaId = 'unplacedArea') {
  const area = document.getElementById(areaId);
  if (!area) return;

  if (!items.length) {
    area.innerHTML = '<div class="unplaced-status good"><strong>남은 수업 없음</strong><span>왼쪽 수업카드에도 남은 카드가 없습니다.</span></div>';
    return;
  }

  const preview = items
    .slice(0, 4)
    .map((item) => `${item.teacher} ${item.subject} ${item.classCode}`)
    .join(', ');

  area.innerHTML = `
    <div class="unplaced-status">
      <strong>남은 수업 ${items.length}개</strong>
      <span>${escapeHtml(preview)}${items.length > 4 ? ' 외' : ''}</span>
      <span>배치와 수정은 왼쪽 수업카드에서 진행하세요.</span>
    </div>
  `;
}

function makeManualPeriodOptions(item) {
  if (isBlockUnit(item)) {
    return `
      <option value="1">1-2교시</option>
      <option value="3">3-4교시</option>
      <option value="5">5-6교시</option>
    `;
  }

  return [1, 2, 3, 4, 5, 6].map((period) => `<option value="${period}">${period}교시</option>`).join('');
}

function manuallyPlaceUnplaced(index, dayIndex, period, targetTeacher = '', askConfirm = true) {
  if (!lastResult || !lastResult.unplacedLessons || !lastResult.unplacedLessons[index]) return;

  const item = lastResult.unplacedLessons[index];
  const periods = isBlockUnit(item) ? [period, period + 1] : [period];

  if (targetTeacher && item.teacher !== '특별실' && String(targetTeacher) !== String(item.teacher)) {
    alert('해당 수업의 전담 시간표에만 배치할 수 있습니다.');
    return;
  }

  if (askConfirm && !confirm('선택한 수업을 먼저 배치합니다.\n같은 반/같은 전담/특별실에 이미 있던 수업은 남은 수업으로 이동합니다.')) {
    return;
  }

  if (item.teacher === '특별실') {
    clearManualCheckWarnings();
    const roomCheck = canManualPlace(item, dayIndex, periods, { freeMove: true });
    if (!roomCheck.ok) {
      alert(roomCheck.message);
      return;
    }
    pushTimetableUndo();
    lastResult.unplacedLessons.splice(index, 1);
    placeManualRoomLesson(item, dayIndex, periods);
  } else {
    const lesson = makeDragLessonFromUnplaced(item);
    const check = canPlaceDragLesson(lesson, { teacher: item.teacher, dayIndex, period }, null, { freeMove: true });
    if (!check.ok) {
      alert(check.message);
      return;
    }
    pushTimetableUndo();
    lastResult.unplacedLessons.splice(index, 1);
    placeLessonFreely(lesson, { teacher: item.teacher, dayIndex, period }, { sourceLesson: null });
  }
  updateDerivedViewsFromCurrentResult();
  renderAllResultViews();
}

function makeDragLessonFromUnplaced(item) {
  return {
    teacher: item.teacher,
    subject: item.subject || '',
    classCode: item.classCode || '',
    roomName: item.roomName || '',
    duration: isBlockUnit(item) ? 2 : 1,
    value: `${String(item.subject || '').trim().substring(0, 1)}(${item.classCode})`,
    sourceLesson: null
  };
}

function canManualPlace(item, dayIndex, periods, options = {}) {
  const freeMove = options.freeMove === true;
  if (periods.some((period) => period < 1 || period > 6)) {
    return { ok: false, message: '선택한 교시가 올바르지 않습니다.' };
  }

  if (!freeMove && periods.some((period) => hasClassAtManualTime(item.classCode, dayIndex, period))) {
    return { ok: false, message: '해당 시간에 같은 반 수업이 이미 있습니다.' };
  }

  if (!freeMove && periods.some((period) => hasClassInRoomAtManualTime(item.classCode, dayIndex, period))) {
    return { ok: false, message: '해당 시간에 같은 반이 이미 특별실 시간표에 있습니다.' };
  }

  if (item.teacher !== '특별실') {
    const teacher = findManualTeacher(item.teacher);
    if (!teacher) return { ok: false, message: '해당 전담 시간표를 찾을 수 없습니다.' };

    if (!freeMove && periods.some((period) => {
      const cell = teacher.grid[period - 1][dayIndex];
      return cell && (cell.isBlocked || cell.value);
    })) {
      return { ok: false, message: '해당 전담의 선택 시간이 비어 있지 않습니다.' };
    }
  }

  if (item.roomName) {
    const room = findManualRoom(item.roomName);
    if (!room) return { ok: false, message: '해당 특별실 시간표를 찾을 수 없습니다.' };

    if (!freeMove && periods.some((period) => {
      const cell = room.grid[period - 1][dayIndex];
      if (!cell) return false;
      if (cell.isBlocked) return true;
      if (item.teacher === '특별실' && shouldUseSplitRoomSlots(item.roomName)) {
        return hasRoomSlotConflict(item.roomName, dayIndex, period, item.classCode);
      }
      return !!cell.value;
    })) {
      return { ok: false, message: '해당 특별실의 선택 시간이 비어 있지 않습니다.' };
    }
  }

  return { ok: true };
}

function placeManualTeacherLesson(item, dayIndex, periods) {
  const teacher = findManualTeacher(item.teacher);
  const mark = `${String(item.subject || '').trim().substring(0, 1)}(${item.classCode})`;
  const roomName = item.roomName || '교실';

  periods.forEach((period) => {
    teacher.grid[period - 1][dayIndex] = {
      dayIndex,
      period,
      value: mark,
      isBlocked: false,
      roomName,
      classCode: item.classCode,
      subject: item.subject || '',
      teacher: item.teacher
    };
  });

  if (item.roomName) {
    placeManualRoomLesson(item, dayIndex, periods, mark);
  }
}

function placeManualRoomLesson(item, dayIndex, periods, value) {
  const room = findManualRoom(item.roomName || item.subject);
  if (!room) return;

  const mark = value || item.classCode;
  const sourceType = item.teacher === '특별실' && !value ? '특별실' : '전담';
  periods.forEach((period) => {
    const entry = {
      value: mark,
      classCode: item.classCode,
      source: sourceType,
      isGradeCard: item.isGradeCard === true
    };
    if (sourceType === '특별실' && shouldUseSplitRoomSlots(room.roomName)) {
      entry.actualSlot = getRoomActualSlotForClass(item.classCode, period, room.roomName);
    }
    addRoomEntryAt(room, dayIndex, period, entry);
  });
}

function hasClassAtManualTime(classCode, dayIndex, period) {
  return (lastResult.teachers || []).some((teacher) => {
    const cell = teacher.grid[period - 1][dayIndex];
    return cell && cell.classCode === classCode;
  });
}

function hasClassAtManualTimeExcept(classCode, dayIndex, period, exceptLesson) {
  return (lastResult.teachers || []).some((teacher) => {
    const cell = teacher.grid[period - 1][dayIndex];
    if (!cell || cell.classCode !== classCode) return false;
    return !isSourceTeacherCell(exceptLesson, teacher.teacherName, dayIndex, period);
  });
}

function hasClassInRoomAtManualTime(classCode, dayIndex, period) {
  return (lastResult.rooms || []).some((room) => {
    const cell = room.grid[period - 1][dayIndex];
    if (!cell) return false;
    if (Array.isArray(cell.entries) && cell.entries.length) {
      return cell.entries.some((entry) => String(entry.classCode || '').trim() === String(classCode || '').trim());
    }
    return String(cell.value || '').split('/').map((value) => value.trim()).includes(classCode);
  });
}

function hasClassInRoomAtManualTimeExcept(classCode, dayIndex, period, exceptCell, extraExceptUnits = []) {
  const targetClass = String(classCode || '').trim();
  return (lastResult.rooms || []).some((room) => {
    const roomName = String(room.roomName || '');
    const exceptStart = Number(exceptCell?.period);
    const exceptEnd = exceptStart + Math.max(1, Number(exceptCell?.duration || 1));
    if (exceptCell &&
      roomName === String(exceptCell.roomName || '') &&
      Number(dayIndex) === Number(exceptCell.dayIndex) &&
      Number(period) >= exceptStart &&
      Number(period) < exceptEnd) {
      return false;
    }
    if (extraExceptUnits.some((unit) => isRoomUnitCell(unit, roomName, dayIndex, period))) {
      return false;
    }
    const cell = room.grid[period - 1][dayIndex];
    if (!cell) return false;
    if (Array.isArray(cell.entries) && cell.entries.length) {
      return cell.entries.some((entry) => String(entry.classCode || '').trim() === targetClass);
    }
    return String(cell.value || '').split('/').map((value) => value.trim()).includes(targetClass);
  });
}

function hasRoomSlotConflict(roomName, dayIndex, period, classCode, exceptCell = null, extraExceptUnits = []) {
  const room = findManualRoom(roomName);
  const cell = room?.grid?.[Number(period) - 1]?.[Number(dayIndex)];
  if (!cell) return false;
  if (cell.isBlocked) return true;
  const capacity = Math.max(1, Number(room?.capacity || 1));

  const exceptStart = Number(exceptCell?.period);
  const exceptEnd = exceptStart + Math.max(1, Number(exceptCell?.duration || 1));
  const isExceptCell = exceptCell &&
    String(roomName || '') === String(exceptCell.roomName || '') &&
    Number(dayIndex) === Number(exceptCell.dayIndex) &&
    Number(period) >= exceptStart &&
    Number(period) < exceptEnd;
  const isExtraExceptEntry = (entry) => extraExceptUnits.some((unit) => isRoomUnitCell(unit, roomName, dayIndex, period, entry.classCode));

  const entries = Array.isArray(cell.entries) ? cell.entries : [];
  if (shouldUseSplitRoomSlots(roomName)) {
    const targetSlot = getRoomActualSlotForClass(classCode, period, roomName);
    const slotEntries = entries.filter((entry) => {
      if (isExceptCell && String(entry.classCode || '').trim() === String(classCode || '').trim()) return false;
      if (isExtraExceptEntry(entry)) return false;
      return getRoomEntryActualSlot(entry, period, roomName) === targetSlot;
    });
    return slotEntries.length >= capacity;
  }

  const targetEntries = entries.filter((entry) => {
    if (isExceptCell && String(entry.classCode || '').trim() === String(classCode || '').trim()) return false;
    if (isExtraExceptEntry(entry)) return false;
    return true;
  });
  return targetEntries.length >= capacity || (!entries.length && !!String(cell.value || '').trim());
}

function getRoomActualSlotForClass(classCode, period, roomName) {
  const cleanPeriod = Number(period);
  if (!shouldUseSplitRoomSlots(roomName)) return cleanPeriod;
  const grade = getGradeFromClassCode(classCode);
  const lunchAfter = Number(getRoomLunchAfterByGrade()[grade] || 4);
  return cleanPeriod <= lunchAfter ? cleanPeriod : cleanPeriod + 1;
}

function getRoomEntryActualSlot(entry, period, roomName) {
  const explicit = Number(entry?.actualSlot);
  return Number.isFinite(explicit) && explicit > 0
    ? explicit
    : getRoomActualSlotForClass(entry?.classCode, period, roomName);
}

function addRoomEntryAt(room, dayIndex, period, entry) {
  if (!room?.grid?.[Number(period) - 1]) return;
  const current = room.grid[Number(period) - 1][Number(dayIndex)] || {};
  const entries = Array.isArray(current.entries) ? [...current.entries] : [];
  const nextEntry = { ...entry };
  const nextEntries = entries.filter((oldEntry) => {
    if (String(oldEntry.classCode || '').trim() !== String(nextEntry.classCode || '').trim()) return true;
    if (shouldUseSplitRoomSlots(room.roomName)) {
      return getRoomEntryActualSlot(oldEntry, period, room.roomName) !== getRoomEntryActualSlot(nextEntry, period, room.roomName);
    }
    return false;
  });
  nextEntries.push(nextEntry);
  room.grid[Number(period) - 1][Number(dayIndex)] = {
    ...current,
    dayIndex: Number(dayIndex),
    period: Number(period),
    value: joinRoomEntries(nextEntries),
    entries: nextEntries,
    isBlocked: false
  };
}

function removeRoomEntryAt(room, dayIndex, period, classCode) {
  const cell = room?.grid?.[Number(period) - 1]?.[Number(dayIndex)];
  if (!cell) return;
  const nextEntries = (Array.isArray(cell.entries) ? cell.entries : [])
    .filter((entry) => String(entry.classCode || '').trim() !== String(classCode || '').trim());
  cell.entries = nextEntries;
  cell.value = joinRoomEntries(nextEntries);
}

function joinRoomEntries(entries) {
  const values = (entries || []).map((entry) => String(entry.value || '').trim()).filter(Boolean);
  return [...new Set(values)].join(' / ');
}

function findManualTeacher(teacherCode) {
  return (lastResult.teachers || []).find((teacher) => teacher.teacherName === teacherCode);
}

function findManualRoom(roomName) {
  return (lastResult.rooms || []).find((room) => room.roomName === roomName);
}

function getGradeFromClassCode(classCode) {
  const text = String(classCode || '').trim();
  const matched = text.match(/^(\d+)/);
  return matched ? Number(matched[1]) : 0;
}

function isGradeCardClassCode(classCode) {
  return /^\d+학년$/.test(String(classCode || '').trim());
}

function isBlockUnit(item) {
  const text = String(item.unitType || '');
  return text.includes('2시간') || text.includes('블록');
}

function isAllSinglePatternForManualLesson(teacherCode, subject, classCode) {
  const teacherText = String(teacherCode || '').trim();
  const subjectText = String(subject || '').trim();
  const subjectInitial = subjectText.charAt(0);
  const classText = String(classCode || '').trim();

  const setting = (appConfig.teachers || []).find((teacher) => {
    const teacherMatch = String(teacher.teacherCode || '').trim() === teacherText;
    const subjectName = String(teacher.subject || '').trim();
    const subjectMatch = subjectName === subjectText || subjectName.charAt(0) === subjectInitial;
    const classMatch = (teacher.assignedClasses || []).map(String).includes(classText);
    return teacherMatch && subjectMatch && classMatch;
  });
  if (!setting) return false;

  const units = getManualUnits(setting.blockPattern, Number(setting.weeklyHours || 0));
  return units.length > 1 && units.every((unit) => unit === 1);
}

function getManualValidationWarnings() {
  if (!lastResult) return [];

  const warnings = [];
  const add = (warning) => warnings.push({ type: 'MANUAL_CHECK', ...warning });

  (lastResult.unplacedLessons || []).forEach((item) => {
    add({
      location: '남은 수업',
      message: `${item.teacher} ${item.subject} ${item.classCode} 수업이 아직 배치되지 않았습니다.`
    });
  });

  (lastResult.teachers || []).forEach((teacher) => {
    (teacher.grid || []).forEach((row, periodIndex) => {
      row.forEach((cell, dayIndex) => {
        if (!cell?.value) return;
        const period = periodIndex + 1;
        const day = DAYS[dayIndex];
        if (isTeacherBlocked(appConfig, teacher.teacherName, day, period)) {
          add({
            location: `${teacher.displayName || teacher.teacherName} ${day} ${period}교시`,
            message: '전담 제외시간에 수업이 있습니다.',
            teacher: teacher.teacherName,
            dayIndex,
            period
          });
        }
      });
    });

    DAYS.forEach((day, dayIndex) => {
      const singleLessonCounts = new Map();
      PERIODS.forEach((period) => {
        const cell = teacher.grid?.[period - 1]?.[dayIndex];
        if (!cell?.value || !cell.subject || !cell.classCode) return;
        if (!isAllSinglePatternForManualLesson(teacher.teacherName, cell.subject, cell.classCode)) return;
        const key = `${cell.subject}|${cell.classCode}`;
        const list = singleLessonCounts.get(key) || [];
        list.push({ period, cell });
        singleLessonCounts.set(key, list);
      });

      singleLessonCounts.forEach((items) => {
        if (items.length <= 1) return;
        items.forEach(({ period, cell }) => {
          add({
            location: `${teacher.displayName || teacher.teacherName} ${day} ${period}교시`,
            message: `${cell.subject} ${cell.classCode}은(는) 단일 패턴이라 하루에 2번 이상 들어가면 안 됩니다.`,
            teacher: teacher.teacherName,
            dayIndex,
            period
          });
        });
      });
    });
  });

  DAYS.forEach((day, dayIndex) => {
    PERIODS.forEach((period) => {
      const byClass = new Map();
      (lastResult.teachers || []).forEach((teacher) => {
        const cell = teacher.grid?.[period - 1]?.[dayIndex];
        if (!cell?.value || !cell.classCode) return;
        const key = String(cell.classCode);
        const list = byClass.get(key) || [];
        list.push({ teacher });
        byClass.set(key, list);
      });

      byClass.forEach((items, classCode) => {
        if (items.length <= 1) return;
        items.forEach(({ teacher }) => {
          add({
            location: `${classCode} ${day} ${period}교시`,
            message: `같은 반 수업이 ${items.length}개 겹칩니다.`,
            teacher: teacher.teacherName,
            dayIndex,
            period
          });
        });
      });
    });
  });

  (lastResult.rooms || []).forEach((room) => {
    (room.grid || []).forEach((row, periodIndex) => {
      row.forEach((cell, dayIndex) => {
        if (!cell?.value) return;
        const period = periodIndex + 1;
        const day = DAYS[dayIndex];
        if (isRoomBlockedManual(appConfig, room.roomName, day, period)) {
          add({
            location: `${room.roomName} ${day} ${period}교시`,
            message: '특별실 제외시간에 수업이 있습니다.',
            roomName: room.roomName,
            dayIndex,
            period
          });
        }

        const entries = Array.isArray(cell.entries) ? cell.entries : [];
        if (entries.length > Number(room.capacity || 1)) {
          add({
            location: `${room.roomName} ${day} ${period}교시`,
            message: '특별실 수용 가능 수보다 많은 수업이 있습니다.',
            roomName: room.roomName,
            dayIndex,
            period
          });
        }
      });
    });
  });

  return warnings;
}

function renderWarnings(warnings, areaId = 'warningArea') {
  const area = document.getElementById(areaId);
  if (!area) return;
  area.innerHTML = '';

  const visibleWarnings = (warnings || []).filter((warning) => !isWeeklyHoursWarning(warning));
  const warningHtml = visibleWarnings.map((warning) => `
    <div class="warning">
      ${warning.location ? `<strong>${escapeHtml(warning.location)}</strong>` : ''}
      <span>${escapeHtml(warning.message)}</span>
    </div>
  `).join('');

  area.innerHTML = warningHtml;
  markValidationWarningCells(visibleWarnings);
}

function markValidationWarningCells(warnings) {
  document.querySelectorAll('.validation-warning-cell').forEach((cell) => cell.classList.remove('validation-warning-cell'));
  (warnings || []).forEach((warning) => {
    if (warning.teacher) {
      const cell = document.querySelector(`td[data-teacher="${cssEscape(warning.teacher)}"][data-day-index="${warning.dayIndex}"][data-period="${warning.period}"]`);
      cell?.classList.add('validation-warning-cell');
    }
    if (warning.roomName) {
      const cell = document.querySelector(`td[data-room-name="${cssEscape(warning.roomName)}"][data-day-index="${warning.dayIndex}"][data-period="${warning.period}"]`);
      cell?.classList.add('validation-warning-cell');
    }
  });
}

function makeMainFocusNoticeHtml(result) {
  const notices = getClassLoadNotices(result);
  if (!notices.length) return '';

  const checked = appConfig.viewOptions?.focusHighlight ? 'checked' : '';

  return `
    <div class="main-focus-list">
      <div class="main-focus-head">
        <div class="main-focus-title">집중 확인</div>
        <label class="focus-highlight-toggle">
          <input id="focusHighlightToggle" type="checkbox" ${checked}>
          <span>시간표 칸 강조</span>
        </label>
      </div>
      <div class="main-focus-grid">
        ${notices.map((notice) => `
          <div class="focus-brief-card">
            <strong>${escapeHtml(notice.classCode)}반</strong>
            <span>${escapeHtml(notice.dayText)}</span>
            <em>전담 ${notice.hours}시간</em>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function isWeeklyHoursWarning(warning) {
  return warning?.type === 'CLASS_DAILY_OVER' || warning?.type === 'CLASS_DAILY_HEAVY';
}

function updateSummary() {
  document.getElementById('teacherCount').textContent = `${new Set(appConfig.teachers.map((teacher) => teacher.teacherCode)).size}명`;
  document.getElementById('roomCount').textContent = `${appConfig.rooms.filter((room) => room.name).length}개`;
  document.getElementById('unplacedCount').textContent = `${lastResult?.unplacedLessons?.length || 0}건`;
}

function getTeacherCodesFromConfig() {
  return Array.from(new Set(appConfig.teachers.map((teacher) => teacher.teacherCode).filter(Boolean))).sort(compareTeacherCode);
}

function getRoomNamesFromConfig() {
  return appConfig.rooms.map((room) => room.name).filter(Boolean);
}

function getIndependentRoomNamesForAssignment() {
  const linkedRooms = new Set((appConfig.teachers || [])
    .map((teacher) => String(teacher.roomName || '').trim())
    .filter(Boolean));
  return getRoomNamesFromConfig().filter((roomName) => !linkedRooms.has(String(roomName || '').trim()));
}

function isIndependentRoomForAssignment(roomName) {
  const cleanName = String(roomName || '').trim();
  return getIndependentRoomNamesForAssignment().some((name) => String(name || '').trim() === cleanName);
}

function getNextTeacherCode() {
  const used = new Set(appConfig.teachers.map((teacher) => teacher.teacherCode));
  for (let i = 1; i <= 20; i += 1) {
    const code = `전담${i}`;
    if (!used.has(code)) return code;
  }
  return `전담${used.size + 1}`;
}

function compareTeacherCode(a, b) {
  return (Number(String(a).replace('전담', '')) || 999) - (Number(String(b).replace('전담', '')) || 999);
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("'", '&#39;');
}
const floatingTeacherBtn = document.getElementById('addTeacherFloatingBtn');
const addTeacherBtn = document.getElementById('addTeacherBtn');

if (floatingTeacherBtn && addTeacherBtn) {
  floatingTeacherBtn.addEventListener('click', () => {
    addTeacherBtn.click();
  });
}
