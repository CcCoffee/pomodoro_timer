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
  statusText.textContent = isWork ? '工作时间' : '休息时间';
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

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.local.get(['workTime', 'breakTime', 'completedPomodoros', 'timeUnit'], (result) => {
    if (result.workTime) workTimeInput.value = result.workTime;
    if (result.breakTime) breakTimeInput.value = result.breakTime;
    if (result.timeUnit) {
      timeUnit = result.timeUnit;
      unitButtons.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.unit === timeUnit);
      });
    }
    completedCount.textContent = result.completedPomodoros || 0;
    
    chrome.runtime.sendMessage({ type: 'getState' }, (response) => {
      if (response) {
        isWorkTime = response.isWorkTime;
        updateButtonStates(response.isRunning);
        updateDisplayFromSeconds(response.timeLeft);
        updateStateVisuals(response.isWorkTime);
      }
    });
  });

  workTimeInput.addEventListener('change', () => {
    const value = parseInt(workTimeInput.value);
    workTimeInput.value = Math.min(Math.max(value, 1), 60);
    chrome.storage.local.set({ workTime: workTimeInput.value });
    if (isWorkTime) {
      chrome.runtime.sendMessage({ type: 'resetTimer' });
    }
  });

  breakTimeInput.addEventListener('change', () => {
    const value = parseInt(breakTimeInput.value);
    breakTimeInput.value = Math.min(Math.max(value, 1), 60);
    chrome.storage.local.set({ breakTime: breakTimeInput.value });
    if (!isWorkTime) {
      chrome.runtime.sendMessage({ type: 'resetTimer' });
    }
  });
});

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