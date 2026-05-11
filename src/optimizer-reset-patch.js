function normalizeSubjectPools(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      subject: String(item.subject || '').trim(),
      grades: Array.isArray(item.grades)
        ? item.grades.map(Number).filter((grade) => grade >= 1 && grade <= 6)
        : []
    }))
    .filter((item) => item.subject);
}

function makePlanningTeachersFromSchoolSettings(config) {
  const optimizer = config.optimizer || {};
  const teacherCount = Math.max(0, Number(optimizer.teacherCount || 0));
  const subjectPools = normalizeSubjectPools(optimizer.subjectPools || []);
  const firstSubject = subjectPools[0]?.subject || '';

  return Array.from({ length: teacherCount }, (_unused, index) => ({
    teacherCode: `전담${index + 1}`,
    teacherName: `전담${index + 1}`,
    assignments: [
      {
        subject: firstSubject,
        weeklyHours: 1,
        fixedTargetHours: '',
        preferredGrades: [],
        assignedClasses: []
      }
    ]
  }));
}

async function resetDedicatedPlanFromSchoolSettings() {
  if (!window.desktopApi?.loadConfig || !window.desktopApi?.saveConfig) {
    alert('설정 저장 API를 찾을 수 없습니다.');
    return;
  }

  const ok = confirm('학교 설정의 전담 수와 전담 과목을 기준으로 전담 배정을 다시 구성할까요? 기존 전담 배정 수정 내용은 초기화됩니다.');
  if (!ok) return;

  const config = await window.desktopApi.loadConfig();
  config.optimizer = config.optimizer || {};
  config.optimizer.subjectPools = normalizeSubjectPools(config.optimizer.subjectPools || []);
  config.optimizer.planningTeachers = makePlanningTeachersFromSchoolSettings(config);
  config.optimizer.lastResult = null;

  await window.desktopApi.saveConfig(config);
  location.reload();
}

function attachResetButton() {
  const actions = document.querySelector('#teacherTab .optimizer-actions');
  if (!actions || document.getElementById('optimizerResetFromSettingsBtn')) return;

  const button = document.createElement('button');
  button.id = 'optimizerResetFromSettingsBtn';
  button.type = 'button';
  button.textContent = '학교 설정 기준으로 다시 구성';
  button.addEventListener('click', resetDedicatedPlanFromSchoolSettings);

  actions.prepend(button);
}

window.addEventListener('DOMContentLoaded', () => {
  attachResetButton();
  document.querySelectorAll('.tab-button').forEach((button) => {
    button.addEventListener('click', () => setTimeout(attachResetButton, 50));
  });
});
