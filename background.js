// 每天零点重置番茄数
chrome.alarms.create('resetDaily', {
  when: getNextMidnight(),
  periodInMinutes: 24 * 60
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'resetDaily') {
    chrome.storage.local.set({ completedPomodoros: 0 });
  }
});

function getNextMidnight() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow.getTime();
}

// 处理通知按钮点击
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  chrome.notifications.clear(notificationId);
  
  // 获取当前活动的popup窗口
  chrome.runtime.sendMessage({
    type: 'notificationButtonClicked',
    buttonIndex: buttonIndex
  });
});

// 监听来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'registerNotificationListeners') {
    // 通知已注册
    sendResponse({ status: 'ok' });
  }
}); 