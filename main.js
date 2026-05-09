const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');

const userDataPath = () => app.getPath('userData');
const configPath = () => path.join(userDataPath(), 'timetable-config.json');
const profilesDir = () => path.join(userDataPath(), 'profiles');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1100,
    minHeight: 720,
    title: '전담시간표',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(() => {
  ipcMain.handle('config:load', async () => {
    try {
      if (!fs.existsSync(configPath())) return null;
      return JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    } catch (err) {
      return null;
    }
  });

  ipcMain.handle('config:save', async (_event, config) => {
    fs.mkdirSync(userDataPath(), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf8');
    return { ok: true, path: configPath() };
  });

  ipcMain.handle('config:listProfiles', async () => {
    return listSavedProfiles();
  });

  ipcMain.handle('config:saveProfile', async (_event, config) => {
    fs.mkdirSync(profilesDir(), { recursive: true });
    const profile = makeProfileMeta(config || {});
    const filePath = path.join(profilesDir(), profile.id + '.json');
    const payload = {
      ...profile,
      config,
      updatedAt: new Date().toISOString()
    };

    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
    fs.mkdirSync(userDataPath(), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf8');

    return { ok: true, profile: payload, path: filePath };
  });

  ipcMain.handle('config:loadProfile', async (_event, profileId) => {
    const safeId = sanitizeFileName(String(profileId || ''));
    const filePath = path.join(profilesDir(), safeId + '.json');
    if (!safeId || !fs.existsSync(filePath)) {
      return { ok: false, message: '\uC800\uC7A5\uB41C \uC124\uC815\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.' };
    }

    try {
      const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      fs.mkdirSync(userDataPath(), { recursive: true });
      fs.writeFileSync(configPath(), JSON.stringify(payload.config || {}, null, 2), 'utf8');
      return { ok: true, profile: payload, config: payload.config || {} };
    } catch (err) {
      return { ok: false, message: '\uC124\uC815 \uD30C\uC77C\uC744 \uC77D\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.' };
    }
  });

  ipcMain.handle('config:renameProfile', async (_event, payload) => {
    const profileId = sanitizeFileName(String((payload && payload.profileId) || ''));
    const schoolName = String((payload && payload.schoolName) || '').trim();
    const schoolYear = Number((payload && payload.schoolYear) || new Date().getFullYear());
    const oldFilePath = path.join(profilesDir(), profileId + '.json');

    if (!profileId || !fs.existsSync(oldFilePath)) {
      return { ok: false, message: '\uC774\uB984\uC744 \uBC14\uAFC0 \uC124\uC815\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.' };
    }

    if (!schoolName || !schoolYear) {
      return { ok: false, message: '\uD559\uAD50\uBA85\uACFC \uD559\uB144\uB3C4\uB97C \uD655\uC778\uD574 \uC8FC\uC138\uC694.' };
    }

    try {
      const current = JSON.parse(fs.readFileSync(oldFilePath, 'utf8'));
      const config = current.config || {};
      config.school = {
        ...(config.school || {}),
        name: schoolName,
        year: schoolYear
      };

      const meta = makeProfileMeta(config);
      const nextPayload = {
        ...current,
        ...meta,
        config,
        updatedAt: new Date().toISOString()
      };
      const nextFilePath = path.join(profilesDir(), meta.id + '.json');

      fs.mkdirSync(profilesDir(), { recursive: true });
      fs.writeFileSync(nextFilePath, JSON.stringify(nextPayload, null, 2), 'utf8');
      if (nextFilePath !== oldFilePath && fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }

      fs.mkdirSync(userDataPath(), { recursive: true });
      fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf8');

      return { ok: true, profile: nextPayload, config };
    } catch (err) {
      return { ok: false, message: '\uC124\uC815 \uC774\uB984\uC744 \uBC14\uAFB8\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.' };
    }
  });

  ipcMain.handle('config:deleteProfile', async (_event, profileId) => {
    const safeId = sanitizeFileName(String(profileId || ''));
    const filePath = path.join(profilesDir(), safeId + '.json');

    if (!safeId || !fs.existsSync(filePath)) {
      return { ok: false, message: '\uC0AD\uC81C\uD560 \uC124\uC815\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.' };
    }

    try {
      fs.unlinkSync(filePath);
      return { ok: true };
    } catch (err) {
      return { ok: false, message: '\uC124\uC815\uC744 \uC0AD\uC81C\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4.' };
    }
  });

  ipcMain.handle('file:saveJson', async (_event, payload) => {
    const { dialogTitle, defaultPath, ...filePayload } = payload || {};
    const result = await dialog.showSaveDialog({
      title: dialogTitle || 'JSON 파일 저장',
      defaultPath: defaultPath || '전담시간표_설정.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });

    if (result.canceled || !result.filePath) return { ok: false };
    fs.writeFileSync(result.filePath, JSON.stringify(filePayload, null, 2), 'utf8');
    return { ok: true, path: result.filePath };
  });

  ipcMain.handle('file:loadJson', async () => {
    const result = await dialog.showOpenDialog({
      title: 'JSON 파일 불러오기',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });

    if (result.canceled || !result.filePaths || !result.filePaths[0]) return { ok: false };

    try {
      const content = fs.readFileSync(result.filePaths[0], 'utf8');
      return { ok: true, path: result.filePaths[0], data: JSON.parse(content) };
    } catch (err) {
      return { ok: false, message: '설정 파일을 읽을 수 없습니다.' };
    }
  });

  ipcMain.handle('file:saveExcel', async (_event, payload) => {
    const result = await dialog.showSaveDialog({
      title: '전담시간표 엑셀 저장',
      defaultPath: makeDefaultExcelName(),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    });

    if (result.canceled || !result.filePath) return { ok: false };

    const workbook = buildExcelWorkbook(payload && payload.result ? payload.result : {});
    XLSX.writeFile(workbook, result.filePath);
    return { ok: true, path: result.filePath };
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

function makeDefaultExcelName() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `전담시간표_${yyyy}${mm}${dd}.xlsx`;
}

function buildExcelWorkbook(result) {
  const workbook = XLSX.utils.book_new();

  appendTeacherSheet(workbook, result);
  appendClassSummarySheet(workbook, result);
  appendRoomSheet(workbook, result);
  appendUnplacedSheet(workbook, result);

  return workbook;
}

function appendClassSummarySheet(workbook, result) {
  const rows = [['학년', '학급 수', '총시수', '전담시수', '주당수업시수', '집중 확인']];
  const summaries = result.classHourSummaries || [];
  const defaultTotals = { 1: 23, 2: 23, 3: 26, 4: 26, 5: 29, 6: 29 };

  for (let grade = 1; grade <= 6; grade += 1) {
    const items = summaries.filter((item) => Number(item.grade) === grade);
    const dedicated = items.map((item) => Number(item.dedicatedHours || 0));
    const remaining = items.map((item) => Number(item.remainingHours || 0));
    const total = items.map((item) => Number(item.totalHours || 0));
    const warnings = items.flatMap((item) => (item.warnings || []).map((warning) => `${item.classCode}반 ${warning.day} ${warning.hours}시간`));

    rows.push([
      `${grade}학년`,
      items.length,
      total.length ? formatHourRangeForExcel(total) : defaultTotals[grade],
      dedicated.length ? formatHourRangeForExcel(dedicated) : '-',
      remaining.length ? formatHourRangeForExcel(remaining) : '-',
      warnings.join(', ')
    ]);
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 14 },
    { wch: 36 }
  ];
  sheet['!margins'] = makePrintMargins();
  XLSX.utils.book_append_sheet(workbook, sheet, '주당수업시수');
}

function formatHourRangeForExcel(values) {
  const clean = values.filter((value) => !Number.isNaN(Number(value)));
  if (!clean.length) return '-';
  const min = Math.min(...clean);
  const max = Math.max(...clean);
  return min === max ? min : `${min}~${max}`;
}


function appendTeacherSheet(workbook, result) {
  const days = result.days || ['월', '화', '수', '목', '금'];
  const teachers = result.teachers || [];

  if (!teachers.length) {
    const sheet = XLSX.utils.aoa_to_sheet([['전담시간표 없음']]);
    XLSX.utils.book_append_sheet(workbook, sheet, '전담시간표');
    return;
  }

  const blocks = teachers.map((teacher) => {
    const block = [];
    block.push([teacher.header || teacher.displayName || teacher.teacherName || '전담', '', '', '', '', '']);
    block.push(['교시'].concat(days));
    (teacher.grid || []).forEach((row, index) => {
      block.push([`${index + 1}교시`].concat(row.map((cell) => makeTeacherCellValue(cell))));
    });
    return block;
  });

  const { rows, merges } = makePairedRows(blocks, 6);
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!merges'] = merges;
  sheet['!cols'] = makePairedColumns(days.length);
  sheet['!rows'] = rows.map((row) => ({ hpt: row.some((cell) => String(cell || '').includes('\n')) ? 34 : 22 }));
  sheet['!margins'] = makePrintMargins();
  XLSX.utils.book_append_sheet(workbook, sheet, '전담시간표');
}

function appendRoomSheet(workbook, result) {
  const days = result.days || ['월', '화', '수', '목', '금'];
  const rooms = result.rooms || [];

  if (!rooms.length) {
    const sheet = XLSX.utils.aoa_to_sheet([['특별실시간표 없음']]);
    XLSX.utils.book_append_sheet(workbook, sheet, '특별실시간표');
    return;
  }

  const blocks = rooms.map((room) => {
    const block = [];
    block.push([`${room.roomName || '특별실'} (수용 ${room.capacity || 1})`, '', '', '', '', '']);
    block.push(['교시'].concat(days));
    (room.grid || []).forEach((row, index) => {
      block.push([`${index + 1}교시`].concat(row.map((cell) => cell && !cell.isBlocked && cell.value ? cell.value : '')));
    });
    return block;
  });

  const { rows, merges } = makePairedRows(blocks, 6);
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!merges'] = merges;
  sheet['!cols'] = makePairedColumns(days.length);
  sheet['!rows'] = rows.map((row) => ({ hpt: row.some((cell) => String(cell || '').includes(' / ')) ? 32 : 22 }));
  sheet['!margins'] = makePrintMargins();
  XLSX.utils.book_append_sheet(workbook, sheet, '특별실시간표');
}

function appendUnplacedSheet(workbook, result) {
  const items = result.unplacedLessons || [];
  const rows = [['전담/구분', '과목/특별실', '학년', '반', '반코드', '배치단위', '특별실', '미배치 사유']];

  if (!items.length) {
    rows.push(['미배치 수업 없음']);
  } else {
    items.forEach((item) => {
      rows.push([
        item.teacher || '',
        item.subject || '',
        item.grade || '',
        item.classNo || '',
        item.classCode || '',
        item.unitType || '',
        item.roomName || '',
        item.reason || ''
      ]);
    });
  }

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 14 },
    { wch: 14 },
    { wch: 8 },
    { wch: 8 },
    { wch: 10 },
    { wch: 14 },
    { wch: 14 },
    { wch: 36 }
  ];
  XLSX.utils.book_append_sheet(workbook, sheet, '미배치수업');
}

function makePairedRows(blocks, blockWidth) {
  const rows = [];
  const merges = [];
  const gap = [''];

  for (let i = 0; i < blocks.length; i += 2) {
    const left = blocks[i] || [];
    const right = blocks[i + 1] || null;
    const startRow = rows.length;
    const maxRows = Math.max(left.length, right ? right.length : 0);

    for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
      const leftRow = padRow(left[rowIndex], blockWidth);
      const rightRow = right ? padRow(right[rowIndex], blockWidth) : [];
      rows.push(leftRow.concat(gap, rightRow));
    }

    merges.push({ s: { r: startRow, c: 0 }, e: { r: startRow, c: blockWidth - 1 } });
    if (right) {
      merges.push({ s: { r: startRow, c: blockWidth + 1 }, e: { r: startRow, c: blockWidth * 2 } });
    }

    rows.push([]);
  }

  return { rows, merges };
}

function padRow(row, width) {
  const next = Array.isArray(row) ? row.slice(0, width) : [];
  while (next.length < width) next.push('');
  return next;
}

function makePairedColumns(dayCount) {
  const block = [{ wch: 9 }].concat(Array.from({ length: dayCount }, () => ({ wch: 15 })));
  return block.concat([{ wch: 3 }], block);
}

function makePrintMargins() {
  return {
    left: 0.35,
    right: 0.35,
    top: 0.45,
    bottom: 0.45,
    header: 0.2,
    footer: 0.2
  };
}

function makeTeacherCellValue(cell) {
  if (!cell || cell.isBlocked) return cell && cell.isBlocked ? '제외' : '';

  const value = cell.value || '';
  const roomName = cell.roomName || '교실';

  if (!value) return '';
  return `${value}\n${roomName}`;
}




function listSavedProfiles() {
  if (!fs.existsSync(profilesDir())) return [];

  return fs.readdirSync(profilesDir())
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      try {
        const payload = JSON.parse(fs.readFileSync(path.join(profilesDir(), file), 'utf8'));
        const meta = makeProfileMeta(payload.config || {});
        return {
          ...meta,
          id: payload.id || meta.id || path.basename(file, '.json'),
          name: payload.name || meta.name,
          schoolName: payload.schoolName || meta.schoolName,
          schoolYear: payload.schoolYear || meta.schoolYear,
          updatedAt: payload.updatedAt || ''
        };
      } catch (err) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')) || String(a.name || '').localeCompare(String(b.name || '')));
}

function makeProfileMeta(config) {
  const school = config.school || {};
  const schoolName = String(school.name || '').trim() || '\uD559\uAD50\uBA85\uC5C6\uC74C';
  const schoolYear = Number(school.year || new Date().getFullYear());
  const id = sanitizeFileName(String(schoolYear) + '_' + schoolName);

  return {
    id,
    name: String(schoolYear) + '\uD559\uB144\uB3C4 ' + schoolName,
    schoolName,
    schoolYear
  };
}

function sanitizeFileName(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 120) || 'profile';
}
