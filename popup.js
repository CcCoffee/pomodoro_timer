let isWorkTime = true;

// DOM元素
const timeDisplay = document.getElementById('time-display');
const startButton = document.getElementById('start');
const pauseButton = document.getElementById('pause');
const resetButton = document.getElementById('reset');
const workTimeInput = document.getElementById('work-time');
const breakTimeInput = document.getElementById('break-time');
const completedCount = document.getElementById('completed-count');

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  // 加载保存的设置
  chrome.storage.local.get(['workTime', 'breakTime', 'completedPomodoros'], (result) => {
    if (result.workTime) {
      workTimeInput.value = result.workTime;
    }
    if (result.breakTime) {
      breakTimeInput.value = result.breakTime;
    }
    completedCount.textContent = result.completedPomodoros || 0;
    
    // 获取后台计时器状态
    chrome.runtime.sendMessage({ type: 'getState' }, (response) => {
      if (response) {
        isWorkTime = response.isWorkTime;
        updateButtonStates(response.isRunning);
        updateDisplayFromSeconds(response.timeLeft);
      }
    });
  });

  // 监听设置变化并保存
  workTimeInput.addEventListener('change', () => {
    chrome.storage.local.set({ workTime: workTimeInput.value });
    if (isWorkTime) {
      chrome.runtime.sendMessage({ type: 'resetTimer' });
    }
  });

  breakTimeInput.addEventListener('change', () => {
    chrome.storage.local.set({ breakTime: breakTimeInput.value });
    if (!isWorkTime) {
      chrome.runtime.sendMessage({ type: 'resetTimer' });
    }
  });
});

// 事件监听器
startButton.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'startTimer' });
});

pauseButton.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'pauseTimer' });
});

resetButton.addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'resetTimer' });
});

// 监听来自background的状态更新
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'timerUpdate') {
    const state = message.state;
    isWorkTime = state.isWorkTime;
    updateButtonStates(state.isRunning);
    updateDisplayFromSeconds(state.timeLeft);
  }
});

function updateButtonStates(isRunning) {
  startButton.disabled = isRunning;
  pauseButton.disabled = !isRunning;
}

function updateDisplayFromSeconds(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// 注册通知监听器
chrome.runtime.sendMessage({
  type: 'registerNotificationListeners'
}); 