let isWorkTime = true;
let timeUnit = 'min';

// DOM元素
const timeDisplay = document.getElementById('time-display');
const startButton = document.getElementById('start');
const pauseButton = document.getElementById('pause');
const resetButton = document.getElementById('reset');
const workTimeInput = document.getElementById('work-time');
const breakTimeInput = document.getElementById('break-time');
const completedCount = document.getElementById('completed-count');
const container = document.getElementById('container');
const statusText = document.getElementById('status-text');
const unitButtons = document.querySelectorAll('.unit-btn');

// 时间单位切换
unitButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    unitButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    timeUnit = btn.dataset.unit;
    chrome.storage.local.set({ timeUnit });
    chrome.runtime.sendMessage({ type: 'getState' }, (response) => {
      if (response) {
        updateDisplayFromSeconds(response.timeLeft);
      }
    });
  });
});

// 更新状态视觉效果
function updateStateVisuals(isWork) {
  container.className = isWork ? 'work-mode' : 'break-mode';
  statusText.textContent = chrome.i18n.getMessage(isWork ? 'workStatus' : 'breakStatus');
}

// 格式化时间显示
function formatTimeDisplay(seconds) {
  if (timeUnit === 'sec') {
    return seconds.toString();
  } else {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
}

// 添加重置番茄数量的函数
function checkAndResetPomodoroCount() {
  chrome.storage.local.get(['lastResetDate'], (result) => {
    const now = new Date();
    const today = now.toDateString();
    
    if (!result.lastResetDate || result.lastResetDate !== today) {
      // 如果是新的一天，重置番茄数量
      chrome.storage.local.set({
        completedPomodoros: 0,
        lastResetDate: today
      });
      completedCount.textContent = '0';
    }
  });
}

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOMContentLoaded');
  // 初始化国际化文本
  initializeI18n();
  
  // 检查是否需要重置番茄数量
  checkAndResetPomodoroCount();
  
  chrome.storage.local.get(['workTime', 'breakTime', 'completedPomodoros', 'timeUnit', 'soundEnabled', 'notificationEnabled'], (result) => {
    console.log('get storage', result);
    if (result.workTime) workTimeInput.value = result.workTime;
    if (result.breakTime) breakTimeInput.value = result.breakTime;
    if (result.timeUnit) {
      timeUnit = result.timeUnit;
      unitButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.unit === timeUnit);
      });
    }
    completedCount.textContent = result.completedPomodoros || 0;
    
    // 获取声音和通知设置
    const soundEnabled = result.soundEnabled !== undefined ? result.soundEnabled : true;
    const notificationEnabled = result.notificationEnabled !== undefined ? result.notificationEnabled : true;
    document.getElementById('sound-enabled').checked = soundEnabled;
    document.getElementById('notification-enabled').checked = notificationEnabled;
    
    chrome.runtime.sendMessage({ type: 'getState' }, (response) => {
      if (response) {
        console.log('getState', response);
        isWorkTime = response.isWorkTime;
        updateButtonStates(response.isRunning);
        updateDisplayFromSeconds(response.timeLeft);
        updateStateVisuals(response.isWorkTime);
      }
    });
  });

  workTimeInput.addEventListener('change', () => {
    let value = parseInt(workTimeInput.value);
    if (isNaN(value)) value = 25; // 默认值
    value = Math.floor(Math.min(Math.max(value, 1), 60));
    workTimeInput.value = value;
    chrome.storage.local.set({ workTime: value });
    if (isWorkTime) {
      chrome.runtime.sendMessage({ type: 'resetTimer' });
    }
  });

  breakTimeInput.addEventListener('change', () => {
    let value = parseInt(breakTimeInput.value);
    if (isNaN(value)) value = 5; // 默认值
    value = Math.floor(Math.min(Math.max(value, 1), 60));
    breakTimeInput.value = value;
    chrome.storage.local.set({ breakTime: value });
    if (!isWorkTime) {
      chrome.runtime.sendMessage({ type: 'resetTimer' });
    }
  });

  // 监听声音设置变化
  document.getElementById('sound-enabled').addEventListener('change', (e) => {
    chrome.storage.local.set({ soundEnabled: e.target.checked });
  });

  // 监听通知设置变化
  document.getElementById('notification-enabled').addEventListener('change', (e) => {
    chrome.storage.local.set({ notificationEnabled: e.target.checked });
  });
});

function initializeI18n() {
  // 状态文本
  document.getElementById('status-text').textContent = chrome.i18n.getMessage('workStatus');
  
  // 时间单位选择器
  const unitButtons = document.querySelectorAll('.unit-btn');
  unitButtons[0].textContent = chrome.i18n.getMessage('minutes');
  unitButtons[1].textContent = chrome.i18n.getMessage('seconds');
  
  // 设置标签
  document.getElementById('work-duration-label').textContent = chrome.i18n.getMessage('workDuration');
  document.getElementById('break-duration-label').textContent = chrome.i18n.getMessage('breakDuration');
  document.getElementById('sound-label').textContent = chrome.i18n.getMessage('soundEnabled');
  document.getElementById('notification-label').textContent = chrome.i18n.getMessage('notificationEnabled');
  
  // 分钟标签
  const minutesLabels = document.querySelectorAll('.minutes-label');
  minutesLabels.forEach(label => {
    label.textContent = chrome.i18n.getMessage('minutes');
  });
  
  // 按钮文本
  document.getElementById('start').textContent = chrome.i18n.getMessage('start');
  document.getElementById('pause').textContent = chrome.i18n.getMessage('pause');
  document.getElementById('reset').textContent = chrome.i18n.getMessage('reset');
  
  // 完成计数文本
  document.getElementById('completed-text').textContent = chrome.i18n.getMessage('completedPomodoros');
}

// 更新状态文本的函数
function updateStatusText(isWorkTime) {
  const statusText = document.getElementById('status-text');
  statusText.textContent = chrome.i18n.getMessage(isWorkTime ? 'workStatus' : 'breakStatus');
}

startButton.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'startTimer' });
});

pauseButton.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'pauseTimer' });
});

resetButton.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'resetTimer' });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'timerUpdate') {
    const state = message.state;
    isWorkTime = state.isWorkTime;
    updateButtonStates(state.isRunning);
    updateDisplayFromSeconds(state.timeLeft);
    updateStateVisuals(state.isWorkTime);
  } else if (message.type === 'updateCompletedPomodoros') {
    completedCount.textContent = message.count;
  }
});

function updateButtonStates(isRunning) {
  startButton.disabled = isRunning;
  pauseButton.disabled = !isRunning;
}

function updateDisplayFromSeconds(seconds) {
  timeDisplay.textContent = formatTimeDisplay(seconds);
}

chrome.runtime.sendMessage({
  type: 'registerNotificationListeners'
}); 