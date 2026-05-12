// Runtime patch: prioritize keeping one room per dedicated teacher.
// This patch adjusts optimizer result display data only.
// Goal:
// 1. Same teacher prefers same roomName.
// 2. Different room used only when unavoidable.

function normalize(value) {
  return String(value || '').trim();
}

function getPrimaryRoom(rows = []) {
  const counter = new Map();

  rows.forEach((row) => {
    const room = normalize(row.roomName);
    if (!room) return;

    const current = counter.get(room) || 0;
    counter.set(room, current + Number(row.recommendedHours || row.weeklyHours || 1));
  });

  return [...counter.entries()]
    .sort((a, b) => b[1] - a[1])[0]?.[0] || '';
}

function applyRoomConsistency(result) {
  if (!result?.rows?.length) return result;

  const grouped = new Map();

  result.rows.forEach((row) => {
    const code = normalize(row.teacherCode || row.teacherName);
    if (!grouped.has(code)) grouped.set(code, []);
    grouped.get(code).push(row);
  });

  grouped.forEach((rows) => {
    const primaryRoom = getPrimaryRoom(rows);
    if (!primaryRoom) return;

    rows.forEach((row) => {
      row.primaryRoom = primaryRoom;
      row.roomConsistencyScore = normalize(row.roomName) === primaryRoom ? 100 : 40;

      if (normalize(row.roomName) !== primaryRoom) {
        row.warnings = [...new Set([
          ...(row.warnings || []),
          `다중 특별실 사용 (${primaryRoom} 우선)`
        ])];
      }
    });
  });

  return result;
}

function patchWindowResult() {
  const original = window.renderOptimizerStandaloneResult;
  if (typeof original !== 'function') return;
  if (original.__roomConsistencyPatched) return;

  const wrapped = function patchedRender(result, ...args) {
    return original.call(this, applyRoomConsistency(result), ...args);
  };

  wrapped.__roomConsistencyPatched = true;
  window.renderOptimizerStandaloneResult = wrapped;
}

function waitPatch() {
  patchWindowResult();

  let retry = 0;
  const timer = setInterval(() => {
    retry += 1;
    patchWindowResult();

    if (window.renderOptimizerStandaloneResult || retry > 30) {
      clearInterval(timer);
    }
  }, 500);
}

waitPatch();
