let timer;
let timeLeft;
let isRunning = false;
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
    isRunning = false;
    
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

// 保存状态到storage
async function saveState() {
  try {
    await chrome.storage.local.set({
      timeLeft,
      isRunning,
      isWorkTime
    });
  } catch (error) {
    console.error('保存状态时出错:', error);
  }
}

// 处理来自popup的消息
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
          isRunning,
          isWorkTime
        };
      case 'getStats':
        return processHistoryData();
      case 'toggleTestData':
        await chrome.storage.local.set({ testDataEnabled: message.enabled });
        return processHistoryData();
    }
  };

  handleMessage().then(sendResponse);
  return true;
});

async function startTimer() {
  try {
    if (!isRunning) {
      isRunning = true;
      timer = setInterval(async () => {
        await updateTimer();
      }, 1000);
      await broadcastState();
    }
  } catch (error) {
    console.error('启动计时器时出错:', error);
    isRunning = false;
  }
}

async function pauseTimer() {
  try {
    if (isRunning) {
      isRunning = false;
      clearInterval(timer);
      await broadcastState();
    }
  } catch (error) {
    console.error('暂停计时器时出错:', error);
  }
}

async function resetTimer() {
  isRunning = false;
  clearInterval(timer);
  isWorkTime = true;
  updateIcon(isWorkTime);
  
  const result = await chrome.storage.local.get(['workTime']);
  const workTime = validateAndConvertTime(result.workTime, true);
  timeLeft = workTime * 60;
  await broadcastState();
}

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

async function broadcastState() {
  try {
    await chrome.runtime.sendMessage({
      type: 'timerUpdate',
      state: {
        timeLeft: timeLeft || 0,
        isRunning,
        isWorkTime
      }
    });
  } catch (error) {
    if (error.message !== "Could not establish connection. Receiving end does not exist.") {
      console.error('广播状态时出错:', error);
    }
  }
  
  // 更新badge
  if (!isRunning) {
    await chrome.action.setBadgeText({ text: '' });
  } else {
    const minutes = Math.ceil((timeLeft || 0) / 60);
    await chrome.action.setBadgeText({ text: minutes.toString() });
    await chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
    await chrome.action.setBadgeBackgroundColor({ 
      color: isWorkTime ? '#e74c3c' : '#2ecc71'
    });
  }
  
  updateIcon(isWorkTime);
  await saveState();
}

async function prepareNextTimer() {
  try {
    const result = await chrome.storage.local.get(['workTime', 'breakTime']);
    if (isWorkTime) {
      const breakTime = validateAndConvertTime(result.breakTime, false);
      timeLeft = breakTime * 60;
    } else {
      const workTime = validateAndConvertTime(result.workTime, true);
      timeLeft = workTime * 60;
    }
    await updateIcon(isWorkTime);
    await broadcastState();
  } catch (error) {
    console.error('准备下一个计时器时出错:', error);
  }
}

async function createOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT']
  });
  
  if (existingContexts.length > 0) return;
  
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Playing notification sound'
  });
}

async function playNotificationSound(isWorkTime) {
  try {
    // 检查声音是否开启
    const result = await chrome.storage.local.get(['soundEnabled']);
    if (!result.soundEnabled) {
      return; // 如果声音被禁用，直接返回
    }

    await createOffscreenDocument();
    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'playSound',
      soundUrl: chrome.runtime.getURL(isWorkTime ? WORK_END_SOUND_URL : BREAK_END_SOUND_URL)
    });
    
    if (!response || !response.success) {
      console.error('播放提示音失败:', response?.error || '未知错误');
    }
  } catch (error) {
    console.error('播放提示音失败:', error);
  }
}

async function handleTimerComplete() {
  clearInterval(timer);
  isRunning = false;
  
  // 获取通知和声音设置
  const settings = await chrome.storage.local.get(['soundEnabled', 'notificationEnabled']);
  
  // 根据设置播放提示音
  if (settings.soundEnabled) {
    await playNotificationSound(isWorkTime);
  }
  
  const notificationId = Date.now().toString();
  
  if (isWorkTime) {
    const pomodoroResult = await chrome.storage.local.get(['completedPomodoros']);
    const count = (pomodoroResult.completedPomodoros || 0) + 1;
    await chrome.storage.local.set({ completedPomodoros: count });
    
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
  
  history.forEach(record => {
    const date = new Date(record.date);
    if (date >= startDate) {
      const monthKey = date.toISOString().slice(0, 7);
      months[monthKey] = (months[monthKey] || 0) + 1;
    }
  });
  
  for (let i = 11; i >= 0; i--) {
    const date = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
    const monthKey = date.toISOString().slice(0, 7);
    labels.push(monthKey.slice(5)); // 只显示月份
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

// 更新番茄历史记录
function updatePomodoroHistory() {
  const today = new Date().toISOString().split('T')[0];
  const historyKey = DEV_CONFIG.useTestData ? STORAGE_KEYS.TEST_HISTORY : STORAGE_KEYS.REAL_HISTORY;
  
  chrome.storage.local.get([historyKey], (result) => {
    const history = result[historyKey] || [];
    history.push({ date: today });
    chrome.storage.local.set({ [historyKey]: history });
  });
} 