import { fillTotalDedicatedHours } from './optimizer-fill-total-patch.js';

let isFilling = false;

async function fillSavedOptimizerResult() {
  if (isFilling || !window.desktopApi?.loadConfig || !window.desktopApi?.saveConfig) return;
  isFilling = true;

  try {
    const config = await window.desktopApi.loadConfig();
    const settings = config?.optimizerStandalone || config?.optimizer || {};
    const savedResult = settings?.lastResult;

    if (!config || !savedResult?.rows?.length) return;

    const filledResult = fillTotalDedicatedHours(config, settings, savedResult);
    if (!filledResult?.rows?.length) return;

    const beforeTotal = Number(savedResult.summary?.recommendedTotal || 0);
    const afterTotal = Number(filledResult.summary?.recommendedTotal || 0);

    if (afterTotal <= beforeTotal) return;

    config.optimizerStandalone = {
      ...(config.optimizerStandalone || {}),
      lastResult: filledResult
    };
    config.optimizer = {
      ...(config.optimizer || {}),
      lastResult: filledResult
    };

    await window.desktopApi.saveConfig(config);

    const reloadButton = document.getElementById('optimizerStandaloneReload');
    if (reloadButton) {
      reloadButton.click();
    }
  } catch (error) {
    console.warn('[optimizer-fill-total-runtime-patch] 부족 시수 보정 실패', error);
  } finally {
    isFilling = false;
  }
}

function bindOptimizerRunFillPatch() {
  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('#optimizerStandaloneRun');
    if (!button) return;

    window.setTimeout(fillSavedOptimizerResult, 250);
    window.setTimeout(fillSavedOptimizerResult, 700);
  }, true);
}

bindOptimizerRunFillPatch();
