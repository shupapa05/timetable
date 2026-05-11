// Compact visual patch for standalone optimizer result cards.
// Logic remains unchanged. This only improves the result display density.

function injectOptimizerResultCompactStyle() {
  if (document.getElementById('optimizerResultCompactPatchStyle')) return;

  const style = document.createElement('style');
  style.id = 'optimizerResultCompactPatchStyle';
  style.textContent = `
    #optimizerStandalonePanel .optimizer-result-box {
      padding: 14px !important;
    }

    #optimizerStandalonePanel #osResultArea {
      max-height: 520px !important;
      overflow-y: auto !important;
      padding-right: 8px !important;
    }

    #optimizerStandalonePanel .os-result-grid {
      display: grid !important;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)) !important;
      gap: 12px !important;
      align-items: start !important;
    }

    #optimizerStandalonePanel .os-result-card {
      min-height: unset !important;
      height: fit-content !important;
      padding: 12px !important;
      border-radius: 16px !important;
      background: linear-gradient(180deg, rgba(30, 41, 59, 0.92), rgba(15, 23, 42, 0.82)) !important;
      border: 1px solid rgba(96, 165, 250, 0.32) !important;
      box-shadow: 0 10px 24px rgba(2, 6, 23, 0.22) !important;
    }

    #optimizerStandalonePanel .os-result-card-head {
      display: grid !important;
      grid-template-columns: minmax(0, 1fr) auto !important;
      gap: 10px !important;
      align-items: start !important;
      padding-bottom: 10px !important;
      margin-bottom: 8px !important;
      border-bottom: 1px solid rgba(96, 125, 169, 0.24) !important;
    }

    #optimizerStandalonePanel .os-result-card-head > div:first-child {
      display: grid !important;
      gap: 4px !important;
      min-width: 0 !important;
    }

    #optimizerStandalonePanel .os-result-card-head strong {
      display: inline-flex !important;
      align-items: baseline !important;
      gap: 4px !important;
      color: #f8fafc !important;
      font-size: 15px !important;
      font-weight: 950 !important;
      line-height: 1.2 !important;
    }

    #optimizerStandalonePanel .os-result-card-head span {
      display: inline-flex !important;
      width: fit-content !important;
      max-width: 100% !important;
      padding: 3px 8px !important;
      border: 1px solid rgba(147, 197, 253, 0.3) !important;
      border-radius: 999px !important;
      background: rgba(37, 99, 235, 0.18) !important;
      color: #bfdbfe !important;
      font-size: 12px !important;
      font-weight: 900 !important;
      white-space: nowrap !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
    }

    #optimizerStandalonePanel .os-mini-badges {
      display: grid !important;
      grid-template-columns: 1fr !important;
      gap: 4px !important;
      justify-items: end !important;
    }

    #optimizerStandalonePanel .os-mini-badges em {
      min-width: 76px !important;
      min-height: 24px !important;
      padding: 3px 8px !important;
      border-radius: 999px !important;
      font-size: 12px !important;
      font-style: normal !important;
      font-weight: 950 !important;
      text-align: center !important;
    }

    #optimizerStandalonePanel .os-mini-badges em:first-child {
      background: rgba(71, 85, 105, 0.58) !important;
      color: #e2e8f0 !important;
    }

    #optimizerStandalonePanel .os-mini-badges em:last-child {
      background: rgba(37, 99, 235, 0.32) !important;
      border-color: rgba(96, 165, 250, 0.72) !important;
      color: #dbeafe !important;
    }

    #optimizerStandalonePanel .os-grade-blocks {
      display: grid !important;
      gap: 7px !important;
      margin-top: 8px !important;
    }

    #optimizerStandalonePanel .os-grade-block:not(:has(.os-chip.is-selected)) {
      display: none !important;
    }

    #optimizerStandalonePanel .os-grade-block {
      grid-template-columns: 48px minmax(0, 1fr) !important;
      align-items: center !important;
      min-height: unset !important;
      padding: 0 !important;
    }

    #optimizerStandalonePanel .os-grade-block strong {
      color: #cbd5e1 !important;
      font-size: 12px !important;
      font-weight: 950 !important;
      white-space: nowrap !important;
    }

    #optimizerStandalonePanel .os-grade-block > div {
      display: flex !important;
      flex-wrap: wrap !important;
      gap: 5px !important;
    }

    #optimizerStandalonePanel .os-result-card .os-chip:not(.is-selected) {
      display: none !important;
    }

    #optimizerStandalonePanel .os-result-card .os-chip {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      gap: 4px !important;
      min-width: 42px !important;
      min-height: 28px !important;
      padding: 4px 8px !important;
      border-radius: 999px !important;
      font-size: 12px !important;
      font-weight: 950 !important;
    }

    #optimizerStandalonePanel .os-result-card .os-chip.is-selected {
      background: rgba(37, 99, 235, 0.5) !important;
      border-color: rgba(147, 197, 253, 0.85) !important;
      color: #eff6ff !important;
    }

    #optimizerStandalonePanel .os-result-card .os-chip input {
      width: 12px !important;
      height: 12px !important;
      margin: 0 !important;
    }

    #optimizerStandalonePanel .os-warning {
      margin: 6px 0 0 !important;
      padding: 5px 8px !important;
      border: 1px solid rgba(251, 146, 60, 0.36) !important;
      border-radius: 10px !important;
      background: rgba(124, 45, 18, 0.2) !important;
      color: #fed7aa !important;
      font-size: 12px !important;
      font-weight: 800 !important;
    }

    #optimizerStandalonePanel .os-warning.compact {
      display: inline-flex !important;
      width: fit-content !important;
      margin-bottom: 10px !important;
    }

    @media (max-width: 920px) {
      #optimizerStandalonePanel .os-result-grid {
        grid-template-columns: 1fr !important;
      }
    }
  `;

  document.head.appendChild(style);
}

injectOptimizerResultCompactStyle();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectOptimizerResultCompactStyle);
}
