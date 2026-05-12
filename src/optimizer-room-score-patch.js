// Adds room consistency scoring to optimizer runtime.
// Goal:
// - Prefer same room for one teacher.
// - Penalize spreading across many special rooms.

function normalize(value) {
  return String(value || '').trim();
}

function calculateRoomScore(row, classCode) {
  const room = normalize(row.roomName || row.fixedRoom || row.preferredRoom);
  if (!room) return 0;

  const usedRooms = new Set(
    (row.recommendedClassesDetailed || [])
      .map((item) => normalize(item.roomName || item.room))
      .filter(Boolean)
  );

  if (!usedRooms.size) {
    return 120;
  }

  if (usedRooms.has(room)) {
    return 100;
  }

  return -90;
}

function applyRoomScore(result) {
  if (!result?.rows?.length) return result;

  result.rows.forEach((row) => {
    row.roomOptimizationScore = calculateRoomScore(row);

    if (row.roomOptimizationScore < 0) {
      row.warnings = [...new Set([
        ...(row.warnings || []),
        '특별실 분산 배정 발생'
      ])];
    }
  });

  return result;
}

function patchOptimizerResultRuntime() {
  const original = window.renderOptimizerStandaloneResult;
  if (typeof original !== 'function') return;
  if (original.__roomScorePatched) return;

  const wrapped = function patched(result, ...args) {
    return original.call(this, applyRoomScore(result), ...args);
  };

  wrapped.__roomScorePatched = true;
  window.renderOptimizerStandaloneResult = wrapped;
}

function waitPatch() {
  patchOptimizerResultRuntime();

  let retry = 0;
  const timer = setInterval(() => {
    retry += 1;
    patchOptimizerResultRuntime();

    if (window.renderOptimizerStandaloneResult || retry > 40) {
      clearInterval(timer);
    }
  }, 400);
}

waitPatch();
