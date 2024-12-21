let timer;
let timeLeft;
let isRunning = false;
let isWorkTime = true;

// 初始化状态
chrome.runtime.onInstalled.addListener(() => {
  resetTimer();
});

// 处理来自popup的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'startTimer':
      startTimer();
      break;
    case 'pauseTimer':
      pauseTimer();
      break;
    case 'resetTimer':
      resetTimer();
      break;
    case 'getState':
      sendResponse({
        timeLeft,
        isRunning,
        isWorkTime
      });
      break;
    case 'registerNotificationListeners':
      setupNotificationListeners();
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
  
  // 从存储中获取工作时间
  chrome.storage.local.get(['workTime'], (result) => {
    timeLeft = (result.workTime || 25) * 60;
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
      timeLeft,
      isRunning,
      isWorkTime
    }
  });
}

function prepareNextTimer() {
  chrome.storage.local.get(['workTime', 'breakTime'], (result) => {
    if (isWorkTime) {
      timeLeft = (result.breakTime || 5) * 60;
    } else {
      timeLeft = (result.workTime || 25) * 60;
    }
    isWorkTime = !isWorkTime;
    broadcastState();
  });
}

function handleTimerComplete() {
  clearInterval(timer);
  isRunning = false;
  
  const notificationId = Date.now().toString();
  
  if (isWorkTime) {
    chrome.storage.local.get(['completedPomodoros'], (result) => {
      const count = (result.completedPomodoros || 0) + 1;
      chrome.storage.local.set({ completedPomodoros: count });
    });
    
    chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: 'images/icon128.png',
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
      iconUrl: 'images/icon128.png',
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
        prepareNextTimer();
        startTimer();
      } else {
        chrome.storage.local.get(['workTime'], (result) => {
          isWorkTime = true;
          timeLeft = (result.workTime || 25) * 60;
          broadcastState();
        });
      }
    } else {
      if (buttonIndex === 0) {
        prepareNextTimer();
        startTimer();
      } else {
        chrome.storage.local.get(['breakTime'], (result) => {
          timeLeft = (result.breakTime || 5) * 60;
          broadcastState();
        });
      }
    }
    chrome.notifications.clear(notificationId);
  });
} 