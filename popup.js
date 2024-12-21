let timer;
let timeLeft;
let isRunning = false;
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
    resetTimer();
  });

  // 监听设置变化并保存
  workTimeInput.addEventListener('change', () => {
    chrome.storage.local.set({ workTime: workTimeInput.value });
    if (isWorkTime) {
      resetTimer();
    }
  });

  breakTimeInput.addEventListener('change', () => {
    chrome.storage.local.set({ breakTime: breakTimeInput.value });
    if (!isWorkTime) {
      resetTimer();
    }
  });
});

// 事件监听器
startButton.addEventListener('click', startTimer);
pauseButton.addEventListener('click', pauseTimer);
resetButton.addEventListener('click', resetTimer);

function startTimer() {
  if (!isRunning) {
    isRunning = true;
    timer = setInterval(updateTimer, 1000);
    startButton.disabled = true;
    pauseButton.disabled = false;
  }
}

function pauseTimer() {
  if (isRunning) {
    isRunning = false;
    clearInterval(timer);
    startButton.disabled = false;
    pauseButton.disabled = true;
  }
}

function resetTimer() {
  isRunning = false;
  clearInterval(timer);
  isWorkTime = true;
  timeLeft = workTimeInput.value * 60;
  updateDisplay();
  startButton.disabled = false;
  pauseButton.disabled = true;
}

function updateTimer() {
  if (timeLeft > 0) {
    timeLeft--;
    updateDisplay();
  } else {
    handleTimerComplete();
  }
}

function updateDisplay() {
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  timeDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

function prepareNextTimer() {
  if (isWorkTime) {
    timeLeft = breakTimeInput.value * 60;
  } else {
    timeLeft = workTimeInput.value * 60;
  }
  isWorkTime = !isWorkTime;
  updateDisplay();
  startButton.disabled = false;
}

function handleTimerComplete() {
  clearInterval(timer);
  isRunning = false;
  
  const notificationId = Date.now().toString();
  
  if (isWorkTime) {
    // 完成一个番茄时间
    chrome.storage.local.get(['completedPomodoros'], (result) => {
      const count = (result.completedPomodoros || 0) + 1;
      chrome.storage.local.set({ completedPomodoros: count });
      completedCount.textContent = count;
    });
    
    // 发送带确认按钮的通知
    chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('images/icon128.png'),
      title: '番茄时间完成！',
      message: '恭喜完成一个番茄时间！点击此通知开始休息时间。',
      requireInteraction: true,
      buttons: [
        { title: '开始休息' },
        { title: '跳过休息' }
      ]
    });
  } else {
    // 休息结束通知
    chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('images/icon128.png'),
      title: '休息时间结束！',
      message: '休息结束了！点击此通知开始新的番茄时间。',
      requireInteraction: true,
      buttons: [
        { title: '开始新番茄' },
        { title: '继续休息' }
      ]
    });
  }
}

// 添加到background.js中的消息监听器
chrome.runtime.sendMessage({
  type: 'registerNotificationListeners'
});

// 监听来自background的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'notificationButtonClicked') {
    if (isWorkTime) {
      // 工作时间结束的通知按钮
      if (message.buttonIndex === 0) {
        // "开始休息"按钮
        prepareNextTimer();
        startTimer();
      } else {
        // "跳过休息"按钮
        isWorkTime = true;
        timeLeft = workTimeInput.value * 60;
        updateDisplay();
      }
    } else {
      // 休息时间结束的通知按钮
      if (message.buttonIndex === 0) {
        // "开始新番茄"按钮
        prepareNextTimer();
        startTimer();
      } else {
        // "继续休息"按钮
        timeLeft = breakTimeInput.value * 60;
        updateDisplay();
      }
    }
  }
}); 