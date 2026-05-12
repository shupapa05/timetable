// Room group support for optimizer standalone.
// Purpose:
// - Actual timetable rooms stay separated (과학실1, 과학실2 ...)
// - Optimizer can treat them as one room group.
// - Dedicated teachers get fixed preferred room automatically.

const DEFAULT_ROOM_GROUPS = [
  {
    groupName: '과학실',
    rooms: ['과학실1', '과학실2', '과학실3'],
    fixedPerTeacher: true
  }
];

function normalize(value) {
  return String(value || '').trim();
}

function loadRoomGroups(config) {
  const saved = config?.optimizerStandalone?.roomGroups;
  if (Array.isArray(saved) && saved.length) return saved;
  return DEFAULT_ROOM_GROUPS;
}

function getGroupByRoom(roomName, roomGroups) {
  const room = normalize(roomName);
  return roomGroups.find((group) =>
    (group.rooms || []).map(normalize).includes(room)
  );
}

function assignPreferredRooms(rows, roomGroups) {
  const teacherRoomMap = new Map();
  const groupUsage = new Map();

  rows.forEach((row) => {
    const teacher = normalize(row.teacherCode || row.teacherName);
    const room = normalize(row.roomName);

    if (!teacher || !room) return;

    const group = getGroupByRoom(room, roomGroups);
    if (!group) return;

    const groupName = normalize(group.groupName);

    if (!groupUsage.has(groupName)) {
      groupUsage.set(groupName, [...(group.rooms || [])]);
    }

    const key = `${teacher}__${groupName}`;

    if (!teacherRoomMap.has(key)) {
      const available = groupUsage.get(groupName) || [];
      const preferredRoom = available.shift() || room;
      teacherRoomMap.set(key, preferredRoom);
      groupUsage.set(groupName, available);
    }

    row.preferredRoom = teacherRoomMap.get(key);
  });

  return rows.map((row) => {
    const preferredRoom = normalize(row.preferredRoom);
    const currentRoom = normalize(row.roomName);

    if (!preferredRoom || preferredRoom === currentRoom) {
      return {
        ...row,
        fixedRoom: preferredRoom || currentRoom
      };
    }

    return {
      ...row,
      fixedRoom: preferredRoom,
      warnings: [...new Set([
        ...(row.warnings || []),
        `${preferredRoom} 우선 사용 권장`
      ])]
    };
  });
}

async function applyRoomGroupsToSavedResult() {
  if (!window.desktopApi?.loadConfig || !window.desktopApi?.saveConfig) return;

  try {
    const config = await window.desktopApi.loadConfig();
    const result = config?.optimizerStandalone?.lastResult;

    if (!result?.rows?.length) return;

    const roomGroups = loadRoomGroups(config);

    const nextRows = assignPreferredRooms(result.rows || [], roomGroups);

    config.optimizerStandalone = {
      ...(config.optimizerStandalone || {}),
      roomGroups,
      lastResult: {
        ...result,
        rows: nextRows
      }
    };

    await window.desktopApi.saveConfig(config);
  } catch (error) {
    console.warn('[optimizer-room-group-patch]', error);
  }
}

function bindRoomGroupPatch() {
  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('#optimizerStandaloneRun');
    if (!button) return;

    window.setTimeout(applyRoomGroupsToSavedResult, 300);
    window.setTimeout(applyRoomGroupsToSavedResult, 900);
  }, true);
}

bindRoomGroupPatch();
