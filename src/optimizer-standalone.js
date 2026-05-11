// src/index.html에서 ./optimizer-standalone.js 로 불러와도 작동하도록 연결합니다.
// 실제 전담최적화 구현은 루트의 optimizer-standalone.js에 있습니다.
// 루트 모듈 로딩이 실패해도 탭이 사라지지 않도록 최소 복구 UI를 제공합니다.

function showOptimizerFallback(error) {
  const nav = document.querySelector('.app-tabs');
  const app = document.querySelector('.app') || document.body;
  if (!nav || document.getElementById('optimizerStandaloneTab')) return;

  const button = document.createElement('button');
  button.id = 'optimizerStandaloneTab';
  button.className = 'tab-button';
  button.type = 'button';
  button.dataset.tabTarget = 'optimizerStandalonePanel';
  button.textContent = '전담최적화';
  nav.insertBefore(button, nav.children[2] || null);

  const panel = document.createElement('section');
  panel.id = 'optimizerStandalonePanel';
  panel.className = 'tab-panel optimizer-standalone-panel';
  panel.innerHTML = `
    <div class="panel" style="padding:18px;">
      <h2 style="margin:0 0 8px;">전담최적화</h2>
      <p class="panel-note" style="margin:0 0 12px;">전담최적화 모듈을 불러오지 못했습니다. 아래 오류를 복사해서 확인하세요.</p>
      <pre style="white-space:pre-wrap; padding:12px; border:1px solid var(--line); border-radius:8px; background:var(--panel-soft); color:var(--text); font-size:12px;">${String(error?.stack || error?.message || error || '알 수 없는 오류')}</pre>
    </div>
  `;

  const teacherTab = document.getElementById('teacherTab');
  if (teacherTab?.parentElement) {
    teacherTab.parentElement.insertBefore(panel, teacherTab.nextSibling);
  } else {
    app.appendChild(panel);
  }

  button.addEventListener('click', () => {
    document.querySelectorAll('.tab-panel').forEach((el) => el.classList.toggle('active', el.id === 'optimizerStandalonePanel'));
    document.querySelectorAll('.app-tabs .tab-button').forEach((el) => el.classList.toggle('active', el.id === 'optimizerStandaloneTab'));
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  try {
    await import('../optimizer-standalone.js');
    setTimeout(() => {
      if (!document.getElementById('optimizerStandaloneTab')) {
        showOptimizerFallback('루트 optimizer-standalone.js는 로드됐지만 탭 생성이 실행되지 않았습니다.');
      }
    }, 300);
  } catch (error) {
    console.error('[optimizer-standalone wrapper] load failed', error);
    showOptimizerFallback(error);
  }
});
