let isWorkTime = true;
let timeUnit = 'min';

// 添加计时器状态枚举（与background.js保持一致）
const TimerState = {
  STOPPED: 'STOPPED',   // 计时器停止（初始状态或重置后）
  RUNNING: 'RUNNING',   // 计时器运行中
  PAUSED: 'PAUSED'     // 计时器暂停
};

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
        if (response.timeLeft === 0 && response.timerState === TimerState.STOPPED) {
          // 如果时间为0且状态为停止，尝试恢复默认工作时间
          chrome.storage.local.get(['workTime'], (result) => {
            const workTime = result.workTime || 25;
            updateDisplayFromSeconds(workTime * 60);
          });
        } else {
          updateDisplayFromSeconds(response.timeLeft);
        }
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
async function checkAndResetPomodoroCount() {
  chrome.runtime.sendMessage({ type: 'checkAndReset' });
}

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOMContentLoaded');
  // 初始化国际化文本
  initializeI18n();
  
  // 检查是否需要重置番茄数量
  checkAndResetPomodoroCount();
  
  chrome.storage.local.get([
    'workTime', 
    'breakTime', 
    'completedPomodoros', 
    'timeUnit', 
    'soundEnabled', 
    'notificationEnabled'
  ], (result) => {
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
        if (response.timeLeft === 0 && response.timerState === TimerState.STOPPED) {
          // 如果时间为0且状态为停止，尝试恢复默认工作时间
          chrome.storage.local.get(['workTime'], (result) => {
            const workTime = result.workTime || 25;
            updateDisplayFromSeconds(workTime * 60);
          });
        } else {
          updateDisplayFromSeconds(response.timeLeft);
        }
        isWorkTime = response.isWorkTime;
        updateButtonStates(response.timerState);
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

  // 导航按钮文本
  document.querySelectorAll('[data-i18n]').forEach(element => {
    const messageKey = element.getAttribute('data-i18n');
    element.textContent = chrome.i18n.getMessage(messageKey);
  });
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
    updateButtonStates(state.timerState);
    updateDisplayFromSeconds(state.timeLeft);
    updateStateVisuals(state.isWorkTime);
  } else if (message.type === 'updateCompletedPomodoros') {
    completedCount.textContent = message.count;
    // 如果当前在统计页面，立即刷新统计数据
    if (document.querySelector('.container-wrapper').classList.contains('show-stats')) {
      loadAndDisplayStats();
    }
  }
});

function updateButtonStates(timerState) {
  startButton.disabled = timerState === TimerState.RUNNING;
  pauseButton.disabled = timerState !== TimerState.RUNNING;
  resetButton.disabled = timerState === TimerState.STOPPED;
}

function updateDisplayFromSeconds(seconds) {
  timeDisplay.textContent = formatTimeDisplay(seconds);
}

chrome.runtime.sendMessage({
  type: 'registerNotificationListeners'
});

// 统计相关的代码
let charts = {
  daily: null,
  weekly: null,
  monthly: null
};

// 导航按钮处理
document.querySelectorAll('.nav-button').forEach(button => {
  button.addEventListener('click', () => {
    const page = button.dataset.page;
    document.querySelectorAll('.nav-button').forEach(b => b.classList.remove('active'));
    button.classList.add('active');
    document.querySelector('.container-wrapper').classList.toggle('show-stats', page === 'stats');
    
    if (page === 'stats') {
      loadAndDisplayStats();
    }
  });
});

// 加载并显示统计数据
async function loadAndDisplayStats() {
  chrome.runtime.sendMessage({ type: 'getStats' }, (stats) => {
    if (stats) {
      updateCharts(stats);
      updateTotalCounts(stats);
    }
  });
}

// 更新总计数据
function updateTotalCounts(stats) {
  document.getElementById('daily-total').textContent = chrome.i18n.getMessage('totalCount', [stats.daily.data.reduce((a, b) => a + b, 0)]);
  document.getElementById('weekly-total').textContent = chrome.i18n.getMessage('totalCount', [stats.weekly.data.reduce((a, b) => a + b, 0)]);
  document.getElementById('monthly-total').textContent = chrome.i18n.getMessage('totalCount', [stats.monthly.data.reduce((a, b) => a + b, 0)]);
}

// 更新图表
function updateCharts(stats) {
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
      }
    },
    scales: {
      x: {
        grid: {
          display: false
        },
        ticks: {
          font: {
            size: 10
          }
        }
      },
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
          font: {
            size: 10
          }
        },
        grid: {
          color: '#E2E8F0'
        }
      }
    },
    elements: {
      bar: {
        borderRadius: 4
      }
    }
  };

  // 更新日统计图表
  if (charts.daily) charts.daily.destroy();
  charts.daily = new Chart(document.getElementById('dailyChart'), {
    type: 'bar',
    data: {
      labels: stats.daily.labels,
      datasets: [{
        label: chrome.i18n.getMessage('dailyPomodoroCount'),
        data: stats.daily.data,
        backgroundColor: '#FF6B6B88',
        borderColor: '#FF6B6B',
        borderWidth: 1
      }]
    },
    options: commonOptions
  });

  // 更新周统计图表
  if (charts.weekly) charts.weekly.destroy();
  charts.weekly = new Chart(document.getElementById('weeklyChart'), {
    type: 'bar',
    data: {
      labels: stats.weekly.labels,
      datasets: [{
        label: chrome.i18n.getMessage('weeklyPomodoroCount'),
        data: stats.weekly.data,
        backgroundColor: '#2ECC7188',
        borderColor: '#2ECC71',
        borderWidth: 1
      }]
    },
    options: commonOptions
  });

  // 更新月统计图表
  if (charts.monthly) charts.monthly.destroy();
  charts.monthly = new Chart(document.getElementById('monthlyChart'), {
    type: 'bar',
    data: {
      labels: stats.monthly.labels,
      datasets: [{
        label: chrome.i18n.getMessage('monthlyPomodoroCount'),
        data: stats.monthly.data,
        backgroundColor: '#3498DB88',
        borderColor: '#3498DB',
        borderWidth: 1
      }]
    },
    options: commonOptions
  });
}

// 修改现有的完成番茄时的处理逻辑
function updatePomodoroHistory() {
  const today = new Date().toISOString().split('T')[0];
  chrome.storage.local.get(['pomodoroHistory'], (result) => {
    const history = result.pomodoroHistory || [];
    history.push({ date: today });
    chrome.storage.local.set({ pomodoroHistory: history });
  });
}

// 在番茄钟完成时调用更新历史记录
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'timerUpdate') {
    const state = message.state;
    isWorkTime = state.isWorkTime;
    updateButtonStates(state.timerState);
    updateDisplayFromSeconds(state.timeLeft);
    updateStateVisuals(state.isWorkTime);
  } else if (message.type === 'updateCompletedPomodoros') {
    completedCount.textContent = message.count;
    // 如果当前在统计页面，立即刷新统计数据
    if (document.querySelector('.container-wrapper').classList.contains('show-stats')) {
      loadAndDisplayStats();
    }
  }
});
  