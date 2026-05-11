function getSubjectGradeHourForApply(config, subject, grade) {
  const pools = config?.optimizer?.subjectPools || [];
  const pool = pools.find((item) => String(item.subject || '').trim() === String(subject || '').trim());
  const hours = pool?.gradeHours || pool?.hours || {};
  return Number(hours[grade] ?? hours[String(grade)] ?? 1) || 1;
}

function splitTeacherRowsByGradeHours(config) {
  if (!config?.optimizer?.lastResult?.rows || !Array.isArray(config.teachers)) return config;

  const fixedRows = [];

  config.teachers.forEach((teacher) => {
    const classes = Array.isArray(teacher.assignedClasses) ? teacher.assignedClasses : [];
    if (!classes.length || !teacher.subject) {
      fixedRows.push(teacher);
      return;
    }

    const groups = new Map();
    classes.forEach((classCode) => {
      const grade = Number(String(classCode).split('-')[0]);
      const weeklyHours = getSubjectGradeHourForApply(config, teacher.subject, grade);
      if (!groups.has(weeklyHours)) groups.set(weeklyHours, []);
      groups.get(weeklyHours).push(classCode);
    });

    groups.forEach((groupClasses, weeklyHours) => {
      fixedRows.push({
        ...teacher,
        weeklyHours,
        assignedClasses: groupClasses
      });
    });
  });

  config.teachers = fixedRows;
  return config;
}

function patchSaveConfigForOptimizerHours() {
  if (!window.desktopApi?.saveConfig || window.desktopApi.saveConfig.__optimizerHoursPatched) return;

  const originalSaveConfig = window.desktopApi.saveConfig.bind(window.desktopApi);
  const patchedSaveConfig = async (config) => {
    return originalSaveConfig(splitTeacherRowsByGradeHours(config));
  };

  patchedSaveConfig.__optimizerHoursPatched = true;
  window.desktopApi.saveConfig = patchedSaveConfig;
}

window.addEventListener('DOMContentLoaded', () => {
  patchSaveConfigForOptimizerHours();
});
