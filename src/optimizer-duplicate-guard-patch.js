function getOptimizerResultSubject(input) {
  const card = input.closest('.optimizer-assignment-card');
  const text = card?.querySelector('.optimizer-assignment-head span')?.textContent || '';
  return text.split('·')[0].trim();
}

function bindOptimizerDuplicateGuard() {
  document.querySelectorAll('input[data-result-row]').forEach((input) => {
    if (input.dataset.optimizerDuplicateGuard === '1') return;
    input.dataset.optimizerDuplicateGuard = '1';
    input.addEventListener('change', () => {
      if (!input.checked) return;
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
    });
  });
}

window.addEventListener('DOMContentLoaded', () => {
  bindOptimizerDuplicateGuard();
  setInterval(bindOptimizerDuplicateGuard, 700);
});
