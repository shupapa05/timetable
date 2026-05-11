// 전담최적화 임시 안정화 버전
// 루트 optimizer-standalone.js에 문법 오류가 있어도 앱이 죽지 않도록 이 파일 단독으로 탭과 안내 화면을 제공합니다.

function ensureStandaloneOptimizerTab() {
  const nav = document.querySelector('.app-tabs');
  const app = document.querySelector('.app') || document.body;
  if (!nav || !app) return;

  let button = document.getElementById('optimizerStandaloneTab');
  if (!button) {
    button = document.createElement('button');
    button.id = 'optimizerStandaloneTab';
    button.className = 'tab-button';
    button.type = 'button';
    button.dataset.tabTarget = 'optimizerStandalonePanel';
    button.textContent = '전담최적화';
    nav.insertBefore(button, nav.children[2] || null);
  }

  let panel = document.getElementById('optimizerStandalonePanel');
  if (!panel) {
    panel = document.createElement('section');
    panel.id = 'optimizerStandalonePanel';
    panel.className = 'tab-panel optimizer-standalone-panel';
    panel.innerHTML = '<div id="optimizerStandaloneArea"></div>';

    const teacherTab = document.getElementById('teacherTab');
    if (teacherTab && teacherTab.parentElement) {
      teacherTab.parentElement.insertBefore(panel, teacherTab.nextSibling);
    } else {
      app.appendChild(panel);
    }
  }

  if (button.dataset.optimizerBound === '1') return;
  button.dataset.optimizerBound = '1';
  button.addEventListener('click', function(event) {
    event.preventDefault();

    document.querySelectorAll('.tab-panel').forEach(function(el) {
      el.style.display = '';
      el.classList.toggle('active', el.id === 'optimizerStandalonePanel');
    });

    document.querySelectorAll('.app-tabs .tab-button').forEach(function(el) {
      el.classList.toggle('active', el.id === 'optimizerStandaloneTab');
    });

    renderStandaloneOptimizerNotice();
  });
}

function renderStandaloneOptimizerNotice() {
  const area = document.getElementById('optimizerStandaloneArea');
  if (!area) return;

  area.innerHTML = [
    '<div class="panel" style="padding:18px;">',
    '<div class="panel-head" style="margin:-18px -18px 16px;">',
    '<h2>전담최적화</h2>',
    '<p class="panel-note">전담최적화 화면 복구 모드입니다.</p>',
    '</div>',
    '<div style="display:grid;gap:12px;">',
    '<div style="padding:14px;border:1px solid var(--line);border-radius:10px;background:var(--panel-soft);">',
    '<strong>현재 상태</strong>',
    '<p class="panel-note" style="margin:8px 0 0;">루트 optimizer-standalone.js에 남아 있는 문법 오류 때문에 자동배정 본체는 잠시 차단했습니다. 대신 앱 전체가 죽지 않고 탭은 유지됩니다.</p>',
    '</div>',
    '<div style="padding:14px;border:1px solid var(--line);border-radius:10px;background:var(--panel-soft);">',
    '<strong>다음 조치</strong>',
    '<p class="panel-note" style="margin:8px 0 0;">이제 루트 파일의 calculateSchoolTotalHours 함수만 고치면 자동배정 화면을 다시 연결할 수 있습니다.</p>',
    '</div>',
    '</div>',
    '</div>'
  ].join('');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ensureStandaloneOptimizerTab);
} else {
  ensureStandaloneOptimizerTab();
}
