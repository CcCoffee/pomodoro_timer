// 添加计时器状态枚举
const TimerState = {
  STOPPED: 'STOPPED',   // 计时器停止（初始状态或重置后）
  RUNNING: 'RUNNING',   // 计时器运行中
  PAUSED: 'PAUSED'     // 计时器暂停
};

let timer;
let timeLeft;
let timerState = TimerState.STOPPED;  // 使用新的状态变量替代 isRunning
let isWorkTime = true;

// 添加常量定义
const DEFAULT_WORK_TIME = 25;
const DEFAULT_BREAK_TIME = 5;
const WORK_END_SOUND_URL = 'sounds/notification.mp3';
const BREAK_END_SOUND_URL = 'sounds/notification.mp3';
const DEFAULT_SETTINGS = {
  soundEnabled: true,
  notificationEnabled: true
};

// 测试数据配置（仅供开发使用）
const DEV_CONFIG = {
  useTestData: false,  // 设置为 true 时使用测试数据
  testDataRanges: {
    daily: { min: 0, max: 7 },    // 近30天每天0-7个番茄钟
    weekly: { min: 0, max: 5 },   // 30-180天每天0-5个番茄钟
    yearly: { min: 0, max: 3 }    // 180-365天每天0-3个番茄钟
  }
};

// 存储键名常量
const STORAGE_KEYS = {
  REAL_HISTORY: 'pomodoroHistory',
  TEST_HISTORY: 'pomodoroTestHistory'
};

// 添加验证函数
function validateAndConvertTime(minutes, isWorkTime = true) {
  let value = parseInt(minutes);
  if (isNaN(value) || value < 1) {
    return isWorkTime ? DEFAULT_WORK_TIME : DEFAULT_BREAK_TIME;
  }
  return Math.floor(Math.min(Math.max(value, 1), 60));
}

// 更新图标状态
function updateIcon(isWork) {
  chrome.action.setIcon({
    path: {
      "16": isWork ? "images/icon16_work.png" : "images/icon16_break.png",
      "48": isWork ? "images/icon48_work.png" : "images/icon48_break.png",
      "128": isWork ? "images/icon128_work.png" : "images/icon128_break.png"
    }
  });
}

// 在 chrome.runtime.onInstalled.addListener 之前添加测试数据初始化函数
function initializeTestData() {
  const today = new Date();
  const testData = [];
  
  // 生成过去30天的数据
  for (let i = 0; i < 30; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const count = Math.floor(Math.random() * 
      (DEV_CONFIG.testDataRanges.daily.max - DEV_CONFIG.testDataRanges.daily.min + 1)) 
      + DEV_CONFIG.testDataRanges.daily.min;
    
    for (let j = 0; j < count; j++) {
      testData.push({
        date: date.toISOString().split('T')[0]
      });
    }
  }
  
  // 生成过去半年的额外数据
  for (let i = 30; i < 180; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const count = Math.floor(Math.random() * 
      (DEV_CONFIG.testDataRanges.weekly.max - DEV_CONFIG.testDataRanges.weekly.min + 1)) 
      + DEV_CONFIG.testDataRanges.weekly.min;
    
    for (let j = 0; j < count; j++) {
      testData.push({
        date: date.toISOString().split('T')[0]
      });
    }
  }
  
  // 生成剩余的一年数据
  for (let i = 180; i < 365; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const count = Math.floor(Math.random() * 
      (DEV_CONFIG.testDataRanges.yearly.max - DEV_CONFIG.testDataRanges.yearly.min + 1)) 
      + DEV_CONFIG.testDataRanges.yearly.min;
    
    for (let j = 0; j < count; j++) {
      testData.push({
        date: date.toISOString().split('T')[0]
      });
    }
  }
  
  return testData;
}

// 修改 chrome.runtime.onInstalled 监听器
chrome.runtime.onInstalled.addListener(async () => {
  try {
    const result = await chrome.storage.local.get([
      'workTime', 
      'soundEnabled', 
      'notificationEnabled'
    ]);
    
    const workTime = validateAndConvertTime(result.workTime, true);
    timeLeft = workTime * 60;
    isWorkTime = true;
    timerState = TimerState.STOPPED;
    
    // 设置默认值
    const defaultValues = {
      soundEnabled: DEFAULT_SETTINGS.soundEnabled,
      notificationEnabled: DEFAULT_SETTINGS.notificationEnabled
    };

    // 只设置未定义的值
    const valuesToSet = {};
    for (const [key, value] of Object.entries(defaultValues)) {
      if (result[key] === undefined) {
        valuesToSet[key] = value;
      }
    }

    if (Object.keys(valuesToSet).length > 0) {
      await chrome.storage.local.set(valuesToSet);
    }
    
    // 初始化测试数据（如果启用）
    if (DEV_CONFIG.useTestData) {
      const testHistory = await chrome.storage.local.get([STORAGE_KEYS.TEST_HISTORY]);
      if (!testHistory[STORAGE_KEYS.TEST_HISTORY]) {
        const initialTestData = initializeTestData();
        await chrome.storage.local.set({ [STORAGE_KEYS.TEST_HISTORY]: initialTestData });
      }
    }
    
    await updateIcon(isWorkTime);
    await broadcastState();
  } catch (error) {
    console.error('初始化时出错:', error);
  }
});

// 添加启动监听器来处理浏览器启动时的状态
chrome.runtime.onStartup.addListener(async () => {
  try {
    // 重置计时器和图标状态
    await resetTimer();
    
    // 检查并重置番茄数量
    await checkAndResetPomodoroCount();
  } catch (error) {
    console.error('浏览器启动时重置状态出错:', error);
  }
});

// 修改保存状态到storage的函数
async function saveState() {
  try {
    await chrome.storage.local.set({
      timeLeft,
      timerState,
      isWorkTime
    });
  } catch (error) {
    console.error('保存状态时出错:', error);
  }
}

// 修改处理来自popup的消息的函数
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handleMessage = async () => {
    switch (message.type) {
      case 'startTimer':
        await startTimer();
        return { success: true };
      case 'pauseTimer':
        await pauseTimer();
        return { success: true };
      case 'resetTimer':
        await resetTimer();
        return { success: true };
      case 'getState':
        return {
          timeLeft: timeLeft || 0,
          timerState,
          isWorkTime
        };
      case 'getStats':
        return processHistoryData();
      case 'checkAndReset':
        await checkAndResetPomodoroCount();
        return { success: true };
    }
  };

  handleMessage().then(sendResponse);
  return true;
});

// 修改计时器控制函数
async function startTimer() {
  try {
    if (timerState !== TimerState.RUNNING) {
      timerState = TimerState.RUNNING;
      timer = setInterval(async () => {
        await updateTimer();
      }, 100);
      await broadcastState();
    }
  } catch (error) {
    console.error('启动计时器时出错:', error);
    timerState = TimerState.STOPPED;
  }
}

async function pauseTimer() {
  try {
    if (timerState === TimerState.RUNNING) {
      timerState = TimerState.PAUSED;
      clearInterval(timer);
      await broadcastState();
    }
  } catch (error) {
    console.error('暂停计时器时出错:', error);
  }
}

async function resetTimer() {
  timerState = TimerState.STOPPED;
  clearInterval(timer);
  isWorkTime = true;
  updateIcon(isWorkTime);
  
  const result = await chrome.storage.local.get(['workTime']);
  const workTime = validateAndConvertTime(result.workTime, true);
  timeLeft = workTime * 60;
  await broadcastState();
}

// 修改更新计时器函数
async function updateTimer() {
  try {
    if (timeLeft > 0) {
      timeLeft--;
      await broadcastState();
    } else {
      await handleTimerComplete();
    }
  } catch (error) {
    console.error('更新计时器时出错:', error);
    await pauseTimer();
  }
}

// 修改广播状态函数
async function broadcastState() {
  try {
    await chrome.runtime.sendMessage({
      type: 'timerUpdate',
      state: {
        timeLeft: timeLeft || 0,
        timerState,
        isWorkTime
      }
    });
  } catch (error) {
    if (error.message !== "Could not establish connection. Receiving end does not exist.") {
      console.error('广播状态时出错:', error);
    }
  }
  
  // 更新badge
  if (timerState === TimerState.PAUSED) {
    await chrome.action.setBadgeText({ text: '||' });
  } else if (timerState === TimerState.STOPPED) {
    await chrome.action.setBadgeText({ text: '' });
  } else {
    const minutes = Math.ceil((timeLeft || 0) / 60);
    await chrome.action.setBadgeText({ text: minutes.toString() });
  }
  await chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
  await chrome.action.setBadgeBackgroundColor({ 
    color: isWorkTime ? '#e74c3c' : '#2ecc71'
  });
  
  updateIcon(isWorkTime);
  await saveState();
}

// 修改计时器完成处理函数
async function handleTimerComplete() {
  clearInterval(timer);
  timerState = TimerState.STOPPED;
  
  // 获取通知和声音设置
  const settings = await chrome.storage.local.get(['soundEnabled', 'notificationEnabled']);
  
  // 根据设置播放提示音
  if (settings.soundEnabled) {
    await playNotificationSound(isWorkTime);
  }
  
  const notificationId = Date.now().toString();
  
  if (isWorkTime) {
    // 更新完成的番茄数和历史记录
    const today = new Date().toISOString().split('T')[0];
    const historyKey = DEV_CONFIG.useTestData ? STORAGE_KEYS.TEST_HISTORY : STORAGE_KEYS.REAL_HISTORY;
    
    // 获取当前历史记录和今日完成数
    const result = await chrome.storage.local.get([historyKey, 'completedPomodoros']);
    const history = result[historyKey] || [];
    const count = (result.completedPomodoros || 0) + 1;
    
    // 更新历史记录
    history.push({ date: today });
    
    // 同时更新两个数据
    await chrome.storage.local.set({ 
      [historyKey]: history,
      completedPomodoros: count 
    });
    
    // 自动切换到休息时间
    isWorkTime = false;
    const breakResult = await chrome.storage.local.get(['breakTime']);
    const breakTime = validateAndConvertTime(breakResult.breakTime, false);
    timeLeft = breakTime * 60;
    updateIcon(isWorkTime);
    await broadcastState();
    await startTimer();
    
    // 根据设置显示通知
    if (settings.notificationEnabled) {
      await chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('images/icon128_break.png'),
        title: chrome.i18n.getMessage('workTimeComplete'),
        message: chrome.i18n.getMessage('breakTimeStarted'),
        requireInteraction: false
      });
    }

    // 广播更新番茄数
    chrome.runtime.sendMessage({
      type: 'updateCompletedPomodoros',
      count: count
    });
  } else {
    // 自动切换到工作时间
    isWorkTime = true;
    const workResult = await chrome.storage.local.get(['workTime']);
    timeLeft = validateAndConvertTime(workResult.workTime, true) * 60;
    updateIcon(isWorkTime);
    await broadcastState();
    await startTimer();
    
    // 根据设置显示通知
    if (settings.notificationEnabled) {
      await chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('images/icon128_work.png'),
        title: chrome.i18n.getMessage('breakTimeComplete'),
        message: chrome.i18n.getMessage('workTimeStarted'),
        requireInteraction: false
      });
    }
  }
}

// 修改每日重置函数
async function checkAndResetPomodoroCount() {
  try {
    const now = new Date();
    const today = now.toDateString();
    const todayStr = now.toISOString().split('T')[0];
    const historyKey = DEV_CONFIG.useTestData ? STORAGE_KEYS.TEST_HISTORY : STORAGE_KEYS.REAL_HISTORY;
    
    const result = await chrome.storage.local.get(['lastResetDate', historyKey]);
    
    if (!result.lastResetDate || result.lastResetDate !== today) {
      // 如果是新的一天，重置番茄数量为0
      await chrome.storage.local.set({
        completedPomodoros: 0,
        lastResetDate: today
      });

      // 广播更新番茄数
      chrome.runtime.sendMessage({
        type: 'updateCompletedPomodoros',
        count: 0
      });
    } else {
      // 如果是同一天，从历史记录中计算今天的番茄数
      const history = result[historyKey] || [];
      const todayCount = history.filter(item => item.date === todayStr).length;
      
      await chrome.storage.local.set({
        completedPomodoros: todayCount
      });

      // 广播更新番茄数
      chrome.runtime.sendMessage({
        type: 'updateCompletedPomodoros',
        count: todayCount
      });
    }
  } catch (error) {
    console.error('重置番茄数量时出错:', error);
  }
}

// 统计数据处理
async function processHistoryData() {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

  // 根据配置决定使用哪个数据源
  const historyKey = DEV_CONFIG.useTestData ? STORAGE_KEYS.TEST_HISTORY : STORAGE_KEYS.REAL_HISTORY;
  const result = await chrome.storage.local.get([historyKey]);
  let history = result[historyKey] || [];
  
  // 如果是测试数据且没有初始化过，则初始化
  if (DEV_CONFIG.useTestData && history.length === 0) {
    history = initializeTestData();
    await chrome.storage.local.set({ [STORAGE_KEYS.TEST_HISTORY]: history });
  }

  return {
    daily: processDailyData(history, thirtyDaysAgo),
    weekly: processWeeklyData(history, sixMonthsAgo),
    monthly: processMonthlyData(history, oneYearAgo)
  };
}

function processDailyData(history, startDate) {
  const dailyData = new Array(30).fill(0);
  const labels = [];
  
  for (let i = 29; i >= 0; i--) {
    const date = new Date(new Date().getTime() - i * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split('T')[0];
    labels.push(dateStr.slice(5)); // 只显示月-日
    
    const count = history.filter(h => h.date === dateStr).length;
    dailyData[29 - i] = count;
  }
  
  return { data: dailyData, labels };
}

function processWeeklyData(history, startDate) {
  const weeklyData = new Array(26).fill(0);
  const labels = [];
  const weeks = {};
  
  history.forEach(record => {
    const date = new Date(record.date);
    if (date >= startDate) {
      const weekKey = getWeekNumber(date);
      weeks[weekKey] = (weeks[weekKey] || 0) + 1;
    }
  });
  
  for (let i = 25; i >= 0; i--) {
    const date = new Date(new Date().getTime() - i * 7 * 24 * 60 * 60 * 1000);
    const weekKey = getWeekNumber(date);
    labels.push('W' + weekKey.split('-')[1]);
    weeklyData[25 - i] = weeks[weekKey] || 0;
  }
  
  return { data: weeklyData, labels };
}

function processMonthlyData(history, startDate) {
  const monthlyData = new Array(12).fill(0);
  const labels = [];
  const months = {};
  
  // 先统计所有历史数据
  history.forEach(record => {
    const date = new Date(record.date);
    if (date >= startDate) {
      // 使用年月作为键，避免时区问题
      const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
      months[monthKey] = (months[monthKey] || 0) + 1;
    }
  });
  
  // 从当前月份开始，往前推12个月
  const now = new Date();
  const currentDate = new Date(now.getFullYear(), now.getMonth(), 1); // 当前月份的第一天
  
  for (let i = 11; i >= 0; i--) {
    const targetDate = new Date(currentDate);
    targetDate.setMonth(currentDate.getMonth() - i);
    
    // 使用相同的键格式
    const monthKey = `${targetDate.getFullYear()}-${(targetDate.getMonth() + 1).toString().padStart(2, '0')}`;
    const monthLabel = (targetDate.getMonth() + 1).toString().padStart(2, '0');
    
    labels.push(monthLabel);
    monthlyData[11 - i] = months[monthKey] || 0;
  }
  
  return { data: monthlyData, labels };
}

function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return d.getFullYear() + '-' + weekNo;
}

// 修改更新番茄历史记录函数为异步函数
async function updatePomodoroHistory() {
  const today = new Date().toISOString().split('T')[0];
  const historyKey = DEV_CONFIG.useTestData ? STORAGE_KEYS.TEST_HISTORY : STORAGE_KEYS.REAL_HISTORY;
  
  const result = await chrome.storage.local.get([historyKey]);
  const history = result[historyKey] || [];
  history.push({ date: today });
  await chrome.storage.local.set({ [historyKey]: history });
} 