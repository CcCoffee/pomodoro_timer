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
  chrome.storage.local.get(['completedPomodoros'], (result) => {
    completedCount.textContent = result.completedPomodoros || 0;
  });
  
  resetTimer();
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

function handleTimerComplete() {
  clearInterval(timer);
  isRunning = false;
  
  if (isWorkTime) {
    // 完成一个番茄时间
    chrome.storage.local.get(['completedPomodoros'], (result) => {
      const count = (result.completedPomodoros || 0) + 1;
      chrome.storage.local.set({ completedPomodoros: count });
      completedCount.textContent = count;
    });
    
    // 发送通知
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'images/icon128.png',
      title: '休息时间到了！',
      message: '恭喜完成一个番茄时间！现在休息一下吧。'
    });
    
    timeLeft = breakTimeInput.value * 60;
  } else {
    // 休息结束
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'images/icon128.png',
      title: '休息结束！',
      message: '开始新的番茄时间吧！'
    });
    
    timeLeft = workTimeInput.value * 60;
  }
  
  isWorkTime = !isWorkTime;
  updateDisplay();
  startButton.disabled = false;
} 