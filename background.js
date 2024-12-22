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

// 初始化状态
chrome.runtime.onInstalled.addListener(async () => {
  try {
    const result = await chrome.storage.local.get(['workTime', 'soundEnabled', 'notificationEnabled']);
    const workTime = validateAndConvertTime(result.workTime, true);
    timeLeft = workTime * 60;
    isWorkTime = true;
    isRunning = false;
    
    // 如果声音和通知设置不存在，设置默认值
    if (result.soundEnabled === undefined || result.notificationEnabled === undefined) {
      await chrome.storage.local.set({
        soundEnabled: DEFAULT_SETTINGS.soundEnabled,
        notificationEnabled: DEFAULT_SETTINGS.notificationEnabled
      });
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