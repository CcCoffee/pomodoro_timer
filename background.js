let timer;
let timeLeft = 25 * 60;
let isRunning = false;
let isWorkTime = true;
let isClosedByButton = false;

// 添加常量定义
const DEFAULT_WORK_TIME = 25;
const DEFAULT_BREAK_TIME = 5;
const NOTIFICATION_SOUND_URL = 'sounds/notification.mp3';

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
    const result = await chrome.storage.local.get(['workTime', 'soundEnabled', 'autoSwitch']);
    const workTime = validateAndConvertTime(result.workTime, true);
    timeLeft = workTime * 60;
    console.log('初始化设置 timeLeft:', timeLeft);
    isWorkTime = true;
    isRunning = false;
    
    // 如果声音设置不存在，默认开启
    if (result.soundEnabled === undefined) {
      await chrome.storage.local.set({ soundEnabled: true });
    }
    // 如果自动轮替设置不存在，默认开启
    if (result.autoSwitch === undefined) {
      await chrome.storage.local.set({ autoSwitch: true });
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
      case 'registerNotificationListeners':
        setupNotificationListeners();
        return { success: true };
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
      }, 100);
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
  console.log('重置计时器设置 timeLeft:', timeLeft);
  await broadcastState();
}

async function updateTimer() {
  try {
    if (timeLeft > 0) {
      timeLeft--;
      console.log('更新计时器设置 timeLeft:', timeLeft);
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
  
  updateIcon(isWorkTime);
  await saveState();
}

async function prepareNextTimer() {
  try {
    const result = await chrome.storage.local.get(['workTime', 'breakTime']);
    if (isWorkTime) {
      const breakTime = validateAndConvertTime(result.breakTime, false);
      timeLeft = breakTime * 60;
      console.log('准备休息时间设置 timeLeft:', timeLeft);
    } else {
      const workTime = validateAndConvertTime(result.workTime, true);
      timeLeft = workTime * 60;
      console.log('准备工作时间设置 timeLeft:', timeLeft);
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

async function playNotificationSound() {
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
      soundUrl: chrome.runtime.getURL(NOTIFICATION_SOUND_URL)
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
  
  // 播放提示音
  await playNotificationSound();
  
  const notificationId = Date.now().toString();
  const result = await chrome.storage.local.get(['autoSwitch']);
  const autoSwitch = result.autoSwitch ?? true;
  
  if (isWorkTime) {
    const pomodoroResult = await chrome.storage.local.get(['completedPomodoros']);
    const count = (pomodoroResult.completedPomodoros || 0) + 1;
    await chrome.storage.local.set({ completedPomodoros: count });
    await resetCurrentTimer();
    
    if (autoSwitch) {
      // 自动开始休息时间
      isWorkTime = false;
      const breakResult = await chrome.storage.local.get(['breakTime']);
      const breakTime = validateAndConvertTime(breakResult.breakTime, false);
      timeLeft = breakTime * 60;
      updateIcon(isWorkTime);
      await broadcastState();
      await startTimer();
      
      // 显示非阻塞通知
      await chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('images/icon128_work.png'),
        title: '番茄时间完成！',
        message: '已自动开始休息时间。',
        requireInteraction: false
      });
    } else {
      // 显示需要用户交互的通知
      await chrome.notifications.create(notificationId, {
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
    }
  } else {
    await resetCurrentTimer();
    
    if (autoSwitch) {
      // 自动开始新的工作时间
      isWorkTime = true;
      const workResult = await chrome.storage.local.get(['workTime']);
      timeLeft = validateAndConvertTime(workResult.workTime, true) * 60;
      updateIcon(isWorkTime);
      await broadcastState();
      await startTimer();
      
      // 显示非阻塞通知
      await chrome.notifications.create(notificationId, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('images/icon128_break.png'),
        title: '休息时间结束！',
        message: '已自动开始新的番茄时间。',
        requireInteraction: false
      });
    } else {
      // 显示需要用户交互的通知
      await chrome.notifications.create(notificationId, {
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
}

function setupNotificationListeners() {
  chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
    try {
      isClosedByButton = true;
      if (isWorkTime) {
        if (buttonIndex === 0) {
          // 开始休息
          isWorkTime = false;
          const result = await chrome.storage.local.get(['breakTime']);
          const breakTime = validateAndConvertTime(result.breakTime, false);
          timeLeft = breakTime * 60;
          await updateIcon(isWorkTime);
          await broadcastState();
          await startTimer();
        } else {
          // 跳过休息，开始新番茄
          isWorkTime = true;
          const result = await chrome.storage.local.get(['workTime']);
          const workTime = validateAndConvertTime(result.workTime, true);
          timeLeft = workTime * 60;
          await updateIcon(isWorkTime);
          await broadcastState();
          await startTimer();
        }
      } else {
        if (buttonIndex === 0) {
          // 开始新番茄
          isWorkTime = true;
          const result = await chrome.storage.local.get(['workTime']);
          const workTime = validateAndConvertTime(result.workTime, true);
          timeLeft = workTime * 60;
          await updateIcon(isWorkTime);
          await broadcastState();
          await startTimer();
        } else {
          // 继续休息
          isWorkTime = false;
          const result = await chrome.storage.local.get(['breakTime']);
          const breakTime = validateAndConvertTime(result.breakTime, false);
          timeLeft = breakTime * 60;
          await updateIcon(isWorkTime);
          await broadcastState();
          await startTimer();
        }
      }
      await chrome.notifications.clear(notificationId);
    } catch (error) {
      console.error('处理通知按钮点击时出错:', error);
    }
  });
}

async function resetCurrentTimer() {
  isRunning = false;
  clearInterval(timer);
  
  // 根据当前模式重置时间
  const result = await chrome.storage.local.get(['workTime', 'breakTime']);
  if (isWorkTime) {
    timeLeft = validateAndConvertTime(result.workTime, true) * 60;
  } else {
    timeLeft = validateAndConvertTime(result.breakTime, false) * 60;
  }
  console.log('重置当前计时器 timeLeft:', timeLeft);
  updateIcon(isWorkTime);
  await broadcastState();
} 