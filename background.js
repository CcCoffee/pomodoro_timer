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