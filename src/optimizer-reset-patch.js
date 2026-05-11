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

function getOptimizerCardSubject(input) {
  const card = input.closest('.optimizer-assignment-card');
  const label = card?.querySelector('.optimizer-assignment-head span')?.textContent || '';
  return label.split('·')[0].trim();
}

function correctOptimizerConflictDisplay() {
  const inputs = Array.from(document.querySelectorAll('input[data-result-row]'));
  if (!inputs.length) return;

  inputs.forEach((input) => {
    const chip = input.closest('.optimizer-class-chip');
    if (!chip) return;
    chip.classList.toggle('is-selected', input.checked);
    chip.classList.remove('is-conflict');
  });

  const map = new Map();
  inputs.filter((input) => input.checked).forEach((input) => {
    const subject = getOptimizerCardSubject(input);
    const key = `${subject}__${input.value}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(input);
  });

  const duplicated = Array.from(map.values()).filter((items) => items.length > 1);
  duplicated.forEach((items) => {
    items.forEach((input) => input.closest('.optimizer-class-chip')?.classList.add('is-conflict'));
  });

  const summary = document.querySelector('.optimizer-conflict-summary');
  if (summary) {
    summary.innerHTML = duplicated.length
      ? `<span class="optimizer-warning">중복 ${duplicated.length}건</span>`
      : '<span>중복 없음</span>';
  }
}

function observeOptimizerConflictDisplay() {
  const area = document.getElementById('optimizerArea') || document.body;
  if (!area || area.dataset.optimizerConflictObserver === '1') return;
  area.dataset.optimizerConflictObserver = '1';

  const observer = new MutationObserver(() => correctOptimizerConflictDisplay());
  observer.observe(area, { childList: true, subtree: true });
  setInterval(correctOptimizerConflictDisplay, 800);
}

window.addEventListener('DOMContentLoaded', () => {
  attachResetButton();
  observeOptimizerConflictDisplay();
  correctOptimizerConflictDisplay();
  document.querySelectorAll('.tab-button').forEach((button) => {
    button.addEventListener('click', () => {
      setTimeout(attachResetButton, 50);
      setTimeout(correctOptimizerConflictDisplay, 100);
    });
  });
});
