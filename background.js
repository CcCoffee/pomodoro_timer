let timer;
let timeLeft = 25 * 60;
let isRunning = false;
let isWorkTime = true;

// 添加常量定义
const DEFAULT_WORK_TIME = 25;
const DEFAULT_BREAK_TIME = 5;
const NOTIFICATION_SOUND_URL = 'sounds/notification.mp3';

// 添加验证函数
function validateAndConvertTime(minutes) {
  let value = parseInt(minutes);
  if (isNaN(value) || value < 1) {
    return DEFAULT_WORK_TIME;
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

// 初始化状态
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['workTime'], (result) => {
    const workTime = validateAndConvertTime(result.workTime);
    timeLeft = workTime * 60;
    isWorkTime = true;
    isRunning = false;
    updateIcon(isWorkTime);
    broadcastState();
  });
});

// 保存状态到storage
function saveState() {
  chrome.storage.local.set({
    timeLeft,
    isRunning,
    isWorkTime
  });
}

// 处理来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'startTimer':
      startTimer();
      sendResponse({ success: true });
      break;
    case 'pauseTimer':
      pauseTimer();
      sendResponse({ success: true });
      break;
    case 'resetTimer':
      resetTimer();
      sendResponse({ success: true });
      break;
    case 'getState':
      sendResponse({
        timeLeft: timeLeft || 0,
        isRunning,
        isWorkTime
      });
      break;
    case 'registerNotificationListeners':
      setupNotificationListeners();
      sendResponse({ success: true });
      break;
  }
  return true;
});

function startTimer() {
  if (!isRunning) {
    isRunning = true;
    timer = setInterval(updateTimer, 1000);
    broadcastState();
  }
}

function pauseTimer() {
  if (isRunning) {
    isRunning = false;
    clearInterval(timer);
    broadcastState();
  }
}

function resetTimer() {
  isRunning = false;
  clearInterval(timer);
  isWorkTime = true;
  updateIcon(isWorkTime);
  
  chrome.storage.local.get(['workTime'], (result) => {
    const workTime = validateAndConvertTime(result.workTime);
    timeLeft = workTime * 60;
    broadcastState();
  });
}

function updateTimer() {
  if (timeLeft > 0) {
    timeLeft--;
    broadcastState();
  } else {
    handleTimerComplete();
  }
}

function broadcastState() {
  chrome.runtime.sendMessage({
    type: 'timerUpdate',
    state: {
      timeLeft: timeLeft || 0,
      isRunning,
      isWorkTime
    }
  }).catch(error => {
    if (error.message !== "Could not establish connection. Receiving end does not exist.") {
      console.error('广播状态时出错:', error);
    }
  });
  
  updateIcon(isWorkTime);
  saveState();
}

function prepareNextTimer() {
  chrome.storage.local.get(['workTime', 'breakTime'], (result) => {
    if (isWorkTime) {
      const breakTime = validateAndConvertTime(result.breakTime);
      timeLeft = breakTime * 60;
    } else {
      const workTime = validateAndConvertTime(result.workTime);
      timeLeft = workTime * 60;
    }
    updateIcon(isWorkTime);
    broadcastState();
  });
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

async function playNotificationSound() {
  try {
    await createOffscreenDocument();
    const response = await chrome.runtime.sendMessage({
      target: 'offscreen',
      type: 'playSound',
      soundUrl: chrome.runtime.getURL(NOTIFICATION_SOUND_URL)
    });
    
    if (!response || !response.success) {
      console.error('播放提示音失败:', response?.error || '未知错误');
    }
  } catch (error) {
    console.error('播放提示音失败:', error);
  }
}

function handleTimerComplete() {
  clearInterval(timer);
  isRunning = false;
  
  // 播放提示音
  playNotificationSound();
  
  const notificationId = Date.now().toString();
  
  if (isWorkTime) {
    chrome.storage.local.get(['completedPomodoros'], (result) => {
      const count = (result.completedPomodoros || 0) + 1;
      chrome.storage.local.set({ completedPomodoros: count });
    });
    
    chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('images/icon128_work.png'),
      title: '番茄时间完成！',
      message: '恭喜完成一个番茄时间！点击此通知开始休息时间。',
      requireInteraction: true,
      buttons: [
        { title: '开始休息' },
        { title: '跳过休息' }
      ]
    });
  } else {
    chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('images/icon128_break.png'),
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

function setupNotificationListeners() {
  chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    if (isWorkTime) {
      if (buttonIndex === 0) {
        // 开始休息
        isWorkTime = false;
        prepareNextTimer();
        startTimer();
      } else {
        // 跳过休息
        chrome.storage.local.get(['workTime'], (result) => {
          isWorkTime = true;
          timeLeft = (result.workTime || 25) * 60;
          updateIcon(isWorkTime);
          broadcastState();
        });
      }
    } else {
      if (buttonIndex === 0) {
        // 开始新番茄
        isWorkTime = true;
        chrome.storage.local.get(['workTime'], (result) => {
          timeLeft = (result.workTime || 25) * 60;
          updateIcon(isWorkTime);
          broadcastState();
          startTimer();
        });
      } else {
        // 继续休息
        chrome.storage.local.get(['breakTime'], (result) => {
          isWorkTime = false;
          timeLeft = (result.breakTime || 5) * 60;
          updateIcon(isWorkTime);
          startTimer();
          isRunning = true;
          broadcastState();
        });
      }
    }
    chrome.notifications.clear(notificationId);
  });
} 