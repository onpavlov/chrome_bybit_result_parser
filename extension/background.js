// Клик по иконке расширения — показать/скрыть панель на текущей вкладке.
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'bybit-pnl-toggle' }).catch(() => {});
});
