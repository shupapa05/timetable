// src/index.html에서 ./optimizer-standalone.js 로 불러와도 작동하도록 연결합니다.
// 루트 optimizer-standalone.js가 실패해도 전담최적화 탭은 항상 보이게 합니다.

let rootLoaded = false;
let rootError = null;

function escapeOptimizerError(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function ensureStandaloneShell() {
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

  if (button.dataset.shellBound === '1') return;
  button.dataset.shellBound = '1';
  button.addEventListener('click', function onOptimizerTabClick(event) {
    event.preventDefault();
    document.querySelectorAll('.tab-panel').forEach(function hideOtherPanels(el) {
      el.style.display = '';
      el.classList.toggle('active', el.id === 'optimizerStandalonePanel');
    });
    document.querySelectorAll('.app-tabs .tab-button').forEach(function toggleTab(el) {
      el.classList.toggle('active', el.id === 'optimizerStandaloneTab');
    });
    renderFallbackIfNeeded();
  });
}

function renderFallbackIfNeeded() {
  const area = document.getElementById('optimizerStandaloneArea');
  if (!area) return;
  if (rootLoaded && !rootError) return;

  const message = rootError
    ? escapeOptimizerError(rootError.stack || rootError.message || rootError)
    : '전담최적화 모듈을 불러오는 중입니다. 잠시 후 다시 탭을 눌러주세요.';

  area.innerHTML = [
    '<div class="panel" style="padding:18px;">',
    '<h2 style="margin:0 0 8px;">전담최적화</h2>',
    '<p class="panel-note" style="margin:0 0 12px;">전담최적화 화면을 불러오지 못했습니다.</p>',
    '<pre style="white-space:pre-wrap;padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--panel-soft);color:var(--text);font-size:12px;">',
    message,
    '</pre>',
    '</div>'
  ].join('');
}

async function bootStandaloneOptimizer() {
  ensureStandaloneShell();
  try {
    await import('../optimizer-standalone.js');
    rootLoaded = true;
    rootError = null;
    setTimeout(function checkRenderedTab() {
      ensureStandaloneShell();
    }, 100);
  } catch (error) {
    rootLoaded = false;
    rootError = error;
    console.error('[optimizer-standalone wrapper] load failed', error);
    ensureStandaloneShell();
    renderFallbackIfNeeded();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootStandaloneOptimizer);
} else {
  bootStandaloneOptimizer();
}
