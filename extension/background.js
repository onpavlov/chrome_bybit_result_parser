// Toolbar icon click: show/hide the panel on the current tab.
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'bybit-pnl-toggle' }).catch(() => {});
});
