// 添加计时器状态枚举
const TimerState = {
  STOPPED: 'STOPPED',   // 计时器停止（初始状态或重置后）
  RUNNING: 'RUNNING',   // 计时器运行中
  PAUSED: 'PAUSED'     // 计时器暂停
};

let timer;

// 添加常量定义
const DEFAULT_WORK_TIME = 25;
const DEFAULT_BREAK_TIME = 5;
const WORK_END_SOUND_URL = '../../assets/sounds/notification.mp3';
const BREAK_END_SOUND_URL = '../../assets/sounds/notification.mp3';
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
  TEST_HISTORY: 'pomodoroTestHistory',
  TIME_LEFT: 'timeLeft',  // 添加 timeLeft 的存储键名
  TIMER_STATE: 'timerState', // 添加 timerState 的存储键名
  IS_WORK_TIME: 'isWorkTime' // 添加 isWorkTime 的存储键名
};

// 添加获取 timerState 的辅助函数
async function getTimerState() {
  const result = await chrome.storage.local.get([STORAGE_KEYS.TIMER_STATE]);
  return result[STORAGE_KEYS.TIMER_STATE] || TimerState.STOPPED;
}

// 添加设置 timerState 的辅助函数
async function setTimerState(state) {
  await chrome.storage.local.set({ [STORAGE_KEYS.TIMER_STATE]: state });
}

// 添加获取 isWorkTime 的辅助函数
async function getIsWorkTime() {
  const result = await chrome.storage.local.get([STORAGE_KEYS.IS_WORK_TIME]);
  return result[STORAGE_KEYS.IS_WORK_TIME] !== undefined ? result[STORAGE_KEYS.IS_WORK_TIME] : true;
}

// 添加设置 isWorkTime 的辅助函数
async function setIsWorkTime(value) {
  await chrome.storage.local.set({ [STORAGE_KEYS.IS_WORK_TIME]: value });
}

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
      "16": isWork ? "../../assets/images/icon16_work.png" : "../../assets/images/icon16_break.png",
      "48": isWork ? "../../assets/images/icon48_work.png" : "../../assets/images/icon48_break.png",
      "128": isWork ? "../../assets/images/icon128_work.png" : "../../assets/images/icon128_break.png"
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
        date: formatDate(date)
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
        date: formatDate(date)
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
        date: formatDate(date)
      });
    }
  }
  
  return testData;
}

// 添加时间格式化工具函数
function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatMonthDay(date) {
  return `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// 添加检查接收端是否存在的辅助函数
async function hasReceiver() {
  try {
    const views = await chrome.runtime.getViews({ type: 'popup' });
    return views.length > 0;
  } catch (error) {
    return false;
  }
}

// 添加安全的消息发送函数
async function sendMessageSafely(message) {
  if (await hasReceiver()) {
    try {
      await chrome.runtime.sendMessage(message);
    } catch (error) {
      if (error.message !== "Could not establish connection. Receiving end does not exist.") {
        console.error('发送消息时出错:', error);
      }
    }
  }
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
    await chrome.storage.local.set({ 
      [STORAGE_KEYS.TIME_LEFT]: workTime * 60,
      [STORAGE_KEYS.IS_WORK_TIME]: true,
      [STORAGE_KEYS.TIMER_STATE]: TimerState.STOPPED
    });
    
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
    
    const isWorkTime = await getIsWorkTime();
    await updateIcon(isWorkTime);
    await broadcastState();
  } catch (error) {
    console.error('初始化时出错:', error);
  }
});

// 修改启动监听器来处理浏览器启动时的状态
chrome.runtime.onStartup.addListener(async () => {
  try {
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
    const [timeLeft, timerState, isWorkTime] = await Promise.all([
      getTimeLeft(),
      getTimerState(),
      getIsWorkTime()
    ]);
    
    await chrome.storage.local.set({
      [STORAGE_KEYS.TIME_LEFT]: timeLeft,
      [STORAGE_KEYS.TIMER_STATE]: timerState,
      [STORAGE_KEYS.IS_WORK_TIME]: isWorkTime,
      lastSavedTime: Date.now()
    });
  } catch (error) {
    console.error('保存状态时出错:', error);
  }
}

// 添加获取 timeLeft 的辅助函数
async function getTimeLeft() {
  const result = await chrome.storage.local.get([STORAGE_KEYS.TIME_LEFT]);
  return result[STORAGE_KEYS.TIME_LEFT] || 0;
}

// 添加设置 timeLeft 的辅助函数
async function setTimeLeft(value) {
  await chrome.storage.local.set({ [STORAGE_KEYS.TIME_LEFT]: value });
}

// 修改处理来自popup的消息的函数
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handleMessage = async () => {
    const timerState = await getTimerState();
    
    switch (message.type) {
      case 'startTimer':
        if (timerState === TimerState.PAUSED) {
          await resumeTimer();
        } else {
          await startTimer();
        }
        return { success: true };
      case 'pauseTimer':
        await pauseTimer();
        return { success: true };
      case 'resetTimer':
        await resetTimer();
        return { success: true };
      case 'getState':
        const [timeLeft, currentTimerState, isWorkTime] = await Promise.all([
          getTimeLeft(),
          getTimerState(),
          getIsWorkTime()
        ]);
        return {
          timeLeft: timeLeft || 0,
          timerState: currentTimerState,
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
    const timerState = await getTimerState();
    if (timerState !== TimerState.RUNNING) {
      const [timeLeft, isWorkTime] = await Promise.all([
        getTimeLeft(),
        getIsWorkTime()
      ]);
      
      // 在启动计时器前检查 timeLeft
      if (timeLeft <= 0) {
        // 如果时间为0，根据当前模式重置时间
        const result = await chrome.storage.local.get([isWorkTime ? 'workTime' : 'breakTime']);
        await setTimeLeft(validateAndConvertTime(result[isWorkTime ? 'workTime' : 'breakTime'], isWorkTime) * 60);
      }
      
      // 确保清理之前的计时器
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      
      await setTimerState(TimerState.RUNNING);
      timer = setInterval(async () => {
        await updateTimer();
      }, 1000);  // 修改为1秒的间隔
      await broadcastState();
    }
  } catch (error) {
    console.error('启动计时器时出错:', error);
    await setTimerState(TimerState.STOPPED);
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }
}

async function resumeTimer() {
  console.log("恢复计时器")
  try {
    await setTimerState(TimerState.RUNNING);
    timer = setInterval(async () => {
      await updateTimer();
    }, 1000);  // 修改为1秒的间隔
    await broadcastState();
  } catch (error) {
    console.error('恢复计时器时出错:', error);
    await setTimerState(TimerState.STOPPED);
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }
}

async function pauseTimer() {
  try {
    const timerState = await getTimerState();
    if (timerState === TimerState.RUNNING) {
      await setTimerState(TimerState.PAUSED);
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      await broadcastState();
    }
  } catch (error) {
    console.error('暂停计时器时出错:', error);
  }
}

async function resetTimer() {
  await setTimerState(TimerState.STOPPED);
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  await setIsWorkTime(true);
  const isWorkTime = await getIsWorkTime();
  updateIcon(isWorkTime);
  
  const result = await chrome.storage.local.get(['workTime']);
  const workTime = validateAndConvertTime(result.workTime, true);
  await setTimeLeft(workTime * 60 || DEFAULT_WORK_TIME * 60); // 确保有默认值
  await broadcastState();
}

// 修改更新计时器函数
async function updateTimer() {
  try {
    const timeLeft = await getTimeLeft();
    if (timeLeft > 0) {
      await setTimeLeft(timeLeft - 1);
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
    const [timeLeft, timerState, isWorkTime] = await Promise.all([
      getTimeLeft(),
      getTimerState(),
      getIsWorkTime()
    ]);
    
    await sendMessageSafely({
      type: 'timerUpdate',
      state: {
        timeLeft: timeLeft || 0,
        timerState,
        isWorkTime
      }
    });
  } catch (error) {
    console.error('广播状态时出错:', error);
  }
  
  // 更新badge
  const [timerState, timeLeft, isWorkTime] = await Promise.all([
    getTimerState(),
    getTimeLeft(),
    getIsWorkTime()
  ]);
  
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
  await setTimerState(TimerState.STOPPED);
  
  // 获取通知和声音设置
  const settings = await chrome.storage.local.get(['soundEnabled', 'notificationEnabled']);
  const isWorkTime = await getIsWorkTime();
  
  // 根据设置播放提示音
  if (settings.soundEnabled) {
    await playNotificationSound(isWorkTime);
  }
  
  const notificationId = Date.now().toString();
  
  if (isWorkTime) {
    // 更新完成的番茄数和历史记录
    const now = new Date();
    const todayStr = formatDate(now);
    const historyKey = DEV_CONFIG.useTestData ? STORAGE_KEYS.TEST_HISTORY : STORAGE_KEYS.REAL_HISTORY;
    
    // 获取当前历史记录和今日完成数
    const result = await chrome.storage.local.get([historyKey, 'completedPomodoros']);
    const history = result[historyKey] || [];
    const count = (result.completedPomodoros || 0) + 1;
    
    // 更新历史记录
    history.push({ date: todayStr });
    
    // 同时更新两个数据
    await chrome.storage.local.set({ 
      [historyKey]: history,
      completedPomodoros: count 
    });
    
    // 自动切换到休息时间
    await setIsWorkTime(false);
    const breakResult = await chrome.storage.local.get(['breakTime']);
    const breakTime = validateAndConvertTime(breakResult.breakTime, false);
    await setTimeLeft(breakTime * 60);
    const newIsWorkTime = await getIsWorkTime();
    updateIcon(newIsWorkTime);
    await broadcastState();
    await startTimer();
    
    // 根据设置显示通知
    if (settings.notificationEnabled) {
      await chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('../../assets/images/icon128_break.png'),
        title: chrome.i18n.getMessage('workTimeComplete'),
        message: chrome.i18n.getMessage('breakTimeStarted'),
        requireInteraction: false
      });
    }

    // 广播更新番茄数
    await sendMessageSafely({
      type: 'updateCompletedPomodoros',
      count: count
    });
  } else {
    // 自动切换到工作时间
    await setIsWorkTime(true);
    const workResult = await chrome.storage.local.get(['workTime']);
    await setTimeLeft(validateAndConvertTime(workResult.workTime, true) * 60);
    const newIsWorkTime = await getIsWorkTime();
    updateIcon(newIsWorkTime);
    await broadcastState();
    await startTimer();
    
    // 根据设置显示通知
    if (settings.notificationEnabled) {
      await chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('../../assets/images/icon128_work.png'),
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
    const todayStr = formatDate(now);
    const historyKey = DEV_CONFIG.useTestData ? STORAGE_KEYS.TEST_HISTORY : STORAGE_KEYS.REAL_HISTORY;
    
    const result = await chrome.storage.local.get(['lastResetDate', historyKey]);
    
    if (!result.lastResetDate || result.lastResetDate !== todayStr) {
      console.log('新的一天，重置番茄数量', { lastResetDate: result.lastResetDate, todayStr });
      // 如果是新的一天，重置番茄数量为0
      await chrome.storage.local.set({
        completedPomodoros: 0,
        lastResetDate: todayStr
      });

      // 广播更新番茄数
      await sendMessageSafely({
        type: 'updateCompletedPomodoros',
        count: 0
      });

      // 确保历史记录中包含新的一天的初始化数据
      const history = result[historyKey] || [];
      await chrome.storage.local.set({ [historyKey]: history });
    } else {
      // 如果是同一天，从历史记录中计算今天的番茄数
      const history = result[historyKey] || [];
      const todayCount = history.filter(item => item.date === todayStr).length;
      
      await chrome.storage.local.set({
        completedPomodoros: todayCount
      });

      // 广播更新番茄数
      await sendMessageSafely({
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
    const dateStr = formatDate(date);
    labels.push(formatMonthDay(date)); // 只显示月-日
    
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
    const [year, month, day] = record.date.split('-').map(Number);
    const date = new Date(year, month - 1, day);
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
    const [year, month] = record.date.split('-').map(Number);
    const date = new Date(year, month - 1, 1);
    if (date >= startDate) {
      const monthKey = `${year}-${String(month).padStart(2, '0')}`;
      months[monthKey] = (months[monthKey] || 0) + 1;
    }
  });
  
  // 从当前月份开始，往前推12个月
  const now = new Date();
  const currentDate = new Date(now.getFullYear(), now.getMonth(), 1); // 当前月份的第一天
  
  for (let i = 11; i >= 0; i--) {
    const targetDate = new Date(currentDate);
    targetDate.setMonth(currentDate.getMonth() - i);
    
    const monthKey = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = String(targetDate.getMonth() + 1).padStart(2, '0');
    
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
  const now = new Date();
  const todayStr = formatDate(now);
  const historyKey = DEV_CONFIG.useTestData ? STORAGE_KEYS.TEST_HISTORY : STORAGE_KEYS.REAL_HISTORY;
  
  const result = await chrome.storage.local.get([historyKey]);
  const history = result[historyKey] || [];
  history.push({ date: todayStr });
  await chrome.storage.local.set({ [historyKey]: history });
}

async function prepareNextTimer() {
  try {
    const result = await chrome.storage.local.get(['workTime', 'breakTime']);
    if (isWorkTime) {
      const breakTime = validateAndConvertTime(result.breakTime, false);
      await setTimeLeft(breakTime * 60);
    } else {
      const workTime = validateAndConvertTime(result.workTime, true);
      await setTimeLeft(workTime * 60);
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
    url: 'src/offscreen/offscreen.html',
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