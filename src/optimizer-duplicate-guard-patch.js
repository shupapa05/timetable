function getOptimizerResultSubject(input) {
  const card = input.closest('.optimizer-assignment-card');
  const text = card?.querySelector('.optimizer-assignment-head span')?.textContent || '';
  return text.split('·')[0].trim();
}

function getOptimizerDuplicateGroups() {
  const map = new Map();
  document.querySelectorAll('input[data-result-row]:checked').forEach((input) => {
    const subject = getOptimizerResultSubject(input);
    const classCode = input.value;
    const key = `${subject}__${classCode}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(input);
  });
  return Array.from(map.values()).filter((group) => group.length > 1);
}

function refreshOptimizerDuplicateDisplay() {
  document.querySelectorAll('input[data-result-row]').forEach((input) => {
    const chip = input.closest('.optimizer-class-chip');
    if (!chip) return;
    chip.classList.toggle('is-selected', input.checked);
    chip.classList.remove('is-conflict');
  });

  const duplicates = getOptimizerDuplicateGroups();
  duplicates.forEach((group) => {
    group.forEach((input) => input.closest('.optimizer-class-chip')?.classList.add('is-conflict'));
  });

  const summary = document.querySelector('.optimizer-conflict-summary');
  if (summary) {
    summary.innerHTML = duplicates.length
      ? `<span class="optimizer-warning">중복 ${duplicates.length}건</span>`
      : '<span>중복 없음</span>';
  }
}

function bindOptimizerDuplicateGuardOnce() {
  document.querySelectorAll('input[data-result-row]').forEach((input) => {
    if (input.dataset.optimizerDuplicateGuard === '1') return;
    input.dataset.optimizerDuplicateGuard = '1';
    input.addEventListener('change', () => {
      if (input.checked) {
        const subject = getOptimizerResultSubject(input);
        const classCode = input.value;
        const duplicated = Array.from(document.querySelectorAll('input[data-result-row]:checked')).some((other) => {
          if (other === input) return false;
          return getOptimizerResultSubject(other) === subject && other.value === classCode;
        });
        if (duplicated) {
          input.checked = false;
          alert('같은 과목은 같은 학급에 중복 배정할 수 없습니다.');
        }
      }
      refreshOptimizerDuplicateDisplay();
    });
  });
  refreshOptimizerDuplicateDisplay();
}

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('optimizerRunBtn')?.addEventListener('click', () => {
    setTimeout(bindOptimizerDuplicateGuardOnce, 0);
    setTimeout(bindOptimizerDuplicateGuardOnce, 100);
  });
  document.querySelectorAll('.tab-button').forEach((button) => {
    button.addEventListener('click', () => setTimeout(bindOptimizerDuplicateGuardOnce, 100));
  });
});
