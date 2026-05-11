const ELEMENTARY_2022_SUBJECTS = [
  '',
  '국어',
  '수학',
  '바른 생활',
  '슬기로운 생활',
  '즐거운 생활',
  '사회',
  '도덕',
  '과학',
  '실과',
  '체육',
  '음악',
  '미술',
  '영어',
  '창의적 체험활동',
  '기타'
];

function patchSubjectSelect(select) {
  if (!select || select.dataset.subjectOptionsPatched === '1') return;
  const current = select.value || '';
  select.innerHTML = ELEMENTARY_2022_SUBJECTS
    .map((subject) => {
      const label = subject || '선택';
      const selected = subject === current ? ' selected' : '';
      return `<option value="${escapeOption(subject)}"${selected}>${escapeOption(label)}</option>`;
    })
    .join('');
  if (current && !ELEMENTARY_2022_SUBJECTS.includes(current)) {
    const option = document.createElement('option');
    option.value = current;
    option.textContent = current;
    option.selected = true;
    select.appendChild(option);
  }
  select.dataset.subjectOptionsPatched = '1';
}

function escapeOption(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function patchAllSubjectSelects() {
  document
    .querySelectorAll('#optimizerStandalonePanel select[data-os-field="subject"]')
    .forEach(patchSubjectSelect);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', patchAllSubjectSelects);
} else {
  patchAllSubjectSelects();
}

const subjectObserver = new MutationObserver(() => patchAllSubjectSelects());
subjectObserver.observe(document.documentElement, { childList: true, subtree: true });
