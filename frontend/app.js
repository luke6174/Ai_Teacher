console.warn('app.js 已废弃，请使用 practice.js。');
/*

const connectBtn = document.querySelector('#connectBtn');
const recordBtn = document.querySelector('#recordBtn');
const stopBtn = document.querySelector('#stopBtn');
const applyScenarioBtn = document.querySelector('#applyScenarioBtn');
const themeSelect = document.querySelector('#themeSelect');
const scenarioSelect = document.querySelector('#scenarioSelect');
const statusArea = document.querySelector('#statusArea');
const conversationContainer = document.querySelector('#conversation');
const messageTemplate = document.querySelector('#messageTemplate');
const scoreValue = document.querySelector('#scoreValue');
const ttsPlayer = document.querySelector('#ttsPlayer');

const TARGET_SAMPLE_RATE = 16000;
const CHUNK_DURATION_MS = 120;

let websocket = null;
let isConnected = false;
let isRecording = false;
let sessionPaused = false;
let streamingMessageEl = null;
let themesMap = {};

let audioContext = null;
let mediaStream = null;
let recorderNode = null;
let silentNode = null;
let inputSampleRate = TARGET_SAMPLE_RATE;
let bufferedFloat32 = new Float32Array(0);

function wsUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/conversation`;
}

function updateStatus(message, tone = 'info') {
  statusArea.textContent = message;
  statusArea.dataset.tone = tone;
}

function addMessage(role, text) {
  const fragment = messageTemplate.content.cloneNode(true);
  const article = fragment.querySelector('.message');
  article.classList.add(role === 'assistant' ? 'message--assistant' : 'message--user');
  const roleEl = fragment.querySelector('.message__role');
  const timeEl = fragment.querySelector('.message__time');
  const contentEl = fragment.querySelector('.message__content');
  roleEl.textContent = role === 'assistant' ? 'AI 老师' : '你';
  timeEl.textContent = new Date().toLocaleTimeString();
  contentEl.textContent = text;
  conversationContainer.appendChild(fragment);
  conversationContainer.scrollTop = conversationContainer.scrollHeight;
  return conversationContainer.lastElementChild;
}

function ensureStreamingMessage() {
  if (!streamingMessageEl) {
    streamingMessageEl = addMessage('assistant', '');
  let awaitingPracticeSentence = false;
  let practiceReady = false;
  let awaitingFeedback = false;
  }
  return streamingMessageEl;
}

function resetStreamingMessage() {
  streamingMessageEl = null;
}

function appendPartialResponse(text) {
  const element = ensureStreamingMessage();
  const contentEl = element.querySelector('.message__content');
  contentEl.textContent += text;
}

function finalizeResponse(payload) {
  const element = ensureStreamingMessage();
  const contentEl = element.querySelector('.message__content');
  contentEl.textContent = payload.text ?? contentEl.textContent;
  resetStreamingMessage();

  if (typeof payload.score === 'number') {
    scoreValue.textContent = payload.score.toString();
  }

  if (typeof payload.paused === 'boolean') {
    sessionPaused = payload.paused;
    const pauseText = sessionPaused ? 'AI 已暂停，准备休息。' : 'AI 已恢复，请继续练习。';
    updateStatus(pauseText);
    recordBtn.disabled = sessionPaused || !isConnected;
    stopBtn.disabled = !isRecording;
  }

  if (payload.audio) {
    ttsPlayer.hidden = false;
    ttsPlayer.src = `data:audio/mpeg;base64,${payload.audio}`;
    ttsPlayer.play().catch(() => void 0);
  }
}

function concatFloat32(a, b) {
  const result = new Float32Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

function downsampleTo16k(buffer, inputRate, targetRate = TARGET_SAMPLE_RATE) {
  if (inputRate === targetRate) {
    const int16 = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i += 1) {
      const s = Math.max(-1, Math.min(1, buffer[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16;
  }
  const sampleRateRatio = inputRate / targetRate;
  const newLength = Math.floor(buffer.length / sampleRateRatio);
  const result = new Int16Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < newLength) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {

    if (awaitingPracticeSentence) {
      awaitingPracticeSentence = false;
      practiceReady = true;
      awaitingFeedback = false;
      updateStatus('练习句子已准备，请点击开始录音并跟读。');
      recordBtn.disabled = false;
      applyScenarioBtn.disabled = false;
    } else if (awaitingFeedback) {
      awaitingFeedback = false;
      updateStatus('反馈已生成，如需继续请点击开始录音或重新开始练习。');
      recordBtn.disabled = sessionPaused || !isConnected;
    }
      console.warn('app.js 已废弃，请使用 practice.js。');
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    themesMap = await res.json();
    const themeKeys = Object.keys(themesMap);
    themeSelect.innerHTML = '';
    themeKeys.forEach((theme) => {
      const option = document.createElement('option');
      option.value = theme;
      option.textContent = theme;
      themeSelect.appendChild(option);
    });
    updateScenarioOptions();
  } catch (error) {
    updateStatus(`无法加载主题列表：${error.message}`, 'error');
  }
}

function updateScenarioOptions() {
  const theme = themeSelect.value;
  const scenarios = themesMap[theme] ?? [];
  scenarioSelect.innerHTML = '';
          case 'gemini-disconnected':
            updateStatus('与 Gemini 的连接已断开，请重新开始练习。', 'warning');
            practiceReady = false;
            awaitingFeedback = false;
            awaitingPracticeSentence = false;
            break;
  scenarios.forEach((scenario) => {
    const option = document.createElement('option');
    option.value = scenario;
    option.textContent = scenario;
    scenarioSelect.appendChild(option);
  });
}

function sendPreference() {
  if (!isConnected || !websocket || websocket.readyState !== WebSocket.OPEN) {
    updateStatus('请先连接服务。', 'warning');
    return;
  }
  const theme = themeSelect.value;
  const scenario = scenarioSelect.value;
  websocket.send(
    JSON.stringify({
      type: 'preference',
      theme,
      scenario,
    })
  );
  addMessage('user', `🎯 练习偏好：${theme} - ${scenario}`);
  updateStatus('已发送练习偏好，AI 会融合到后续对话。');
}

connectBtn.addEventListener('click', () => {
  if (isConnected) {
    disconnectWebSocket();
  } else {
    connectWebSocket();
  }
});

recordBtn.addEventListener('click', () => {
  startRecording();
});

stopBtn.addEventListener('click', () => {
  stopRecording();
});

applyScenarioBtn.addEventListener('click', () => {
  sendPreference();
});

themeSelect.addEventListener('change', () => {
  updateScenarioOptions();
});

window.addEventListener('beforeunload', () => {
  disconnectWebSocket();
});

loadThemes();
updateStatus('请先连接服务以开始练习。');

// --- start new implementation ---
const startPracticeBtn = document.querySelector('#startPracticeBtn');
const recordBtnV2 = document.querySelector('#recordBtn');
const stopBtnV2 = document.querySelector('#stopBtn');
const applyScenarioBtnV2 = document.querySelector('#applyScenarioBtn');
// Legacy implementation removed; see new implementation below.

function appendPartialResponseV2(text) {
  const element = ensureStreamingMessageV2();
  const contentEl = element.querySelector('.message__content');
  contentEl.textContent += text;
}

function finalizeResponseV2(payload) {
  const element = ensureStreamingMessageV2();
  const contentEl = element.querySelector('.message__content');
  contentEl.textContent = payload.text ?? contentEl.textContent;
  resetStreamingMessageV2();

  if (typeof payload.score === 'number') {
    scoreValueV2.textContent = payload.score.toString();
  }

  if (typeof payload.paused === 'boolean') {
    sessionPausedV2 = payload.paused;
    const pauseText = sessionPausedV2 ? 'AI 已暂停，准备休息。' : 'AI 已恢复，请继续练习。';
    updateStatusV2(pauseText);
    recordBtnV2.disabled = sessionPausedV2 || !isConnectedV2;
    stopBtnV2.disabled = !isRecordingV2;
  }

  if (payload.audio) {
    ttsPlayerV2.hidden = false;
    ttsPlayerV2.src = `data:audio/mpeg;base64,${payload.audio}`;
    ttsPlayerV2.play().catch(() => void 0);
  }

  if (awaitingPracticeSentenceV2) {
    awaitingPracticeSentenceV2 = false;
    practiceReadyV2 = true;
    awaitingFeedbackV2 = false;
    updateStatusV2('练习句子已准备，请点击“开始录音”跟读。');
    recordBtnV2.disabled = false;
  } else if (awaitingFeedbackV2) {
    awaitingFeedbackV2 = false;
    updateStatusV2('反馈已生成，可继续练习或重新开始。');
    recordBtnV2.disabled = sessionPausedV2 || !isConnectedV2;
  }
}

function concatFloat32V2(a, b) {
  const result = new Float32Array(a.length + b.length);
  result.set(a, 0);
  result.set(b, a.length);
  return result;
}

function downsampleTo16kV2(buffer, inputRate, targetRate = TARGET_SAMPLE_RATE_V2) {
  if (inputRate === targetRate) {
    const int16 = new Int16Array(buffer.length);
    for (let i = 0; i < buffer.length; i += 1) {
      const s = Math.max(-1, Math.min(1, buffer[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return int16;
  }
  const sampleRateRatio = inputRate / targetRate;
  const newLength = Math.floor(buffer.length / sampleRateRatio);
  const result = new Int16Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < newLength) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i += 1) {
      accum += buffer[i];
      count += 1;
    }
    const average = count > 0 ? accum / count : 0;
    const clamped = Math.max(-1, Math.min(1, average));
    result[offsetResult] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

function sendPcmChunkV2(pcm16) {
  if (!websocketV2 || websocketV2.readyState !== WebSocket.OPEN) {
    return;
  }
  const buffer = pcm16.buffer.slice(pcm16.byteOffset, pcm16.byteOffset + pcm16.byteLength);
  websocketV2.send(buffer);
}

function processAudioChunkV2(chunk) {
  if (!isRecordingV2 || sessionPausedV2) {
    return;
  }
  bufferedFloat32V2 = concatFloat32V2(bufferedFloat32V2, chunk);
  const requiredSamples = Math.floor((inputSampleRateV2 / 1000) * CHUNK_DURATION_MS_V2);
  while (bufferedFloat32V2.length >= requiredSamples) {
    const slice = bufferedFloat32V2.slice(0, requiredSamples);
    bufferedFloat32V2 = bufferedFloat32V2.slice(requiredSamples);
    const pcm16 = downsampleTo16kV2(slice, inputSampleRateV2);
    if (pcm16.length) {
      sendPcmChunkV2(pcm16);
    }
  }
}

function flushAudioBufferV2() {
  if (bufferedFloat32V2.length === 0) {
    return;
  }
  const pcm16 = downsampleTo16kV2(bufferedFloat32V2, inputSampleRateV2);
  if (pcm16.length) {
    sendPcmChunkV2(pcm16);
  }
  bufferedFloat32V2 = new Float32Array(0);
}

async function initAudioGraphV2() {
  if (audioContextV2) {
    return;
  }
  mediaStreamV2 = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      autoGainControl: true,
      noiseSuppression: true,
    },
  });
  audioContextV2 = new AudioContext();
  inputSampleRateV2 = audioContextV2.sampleRate;
  await audioContextV2.audioWorklet.addModule('worklets/recorder-processor.js');
  const source = audioContextV2.createMediaStreamSource(mediaStreamV2);
  recorderNodeV2 = new AudioWorkletNode(audioContextV2, 'recorder-processor');
  recorderNodeV2.port.onmessage = (event) => processAudioChunkV2(event.data);
  silentNodeV2 = audioContextV2.createGain();
  silentNodeV2.gain.value = 0;
  source.connect(recorderNodeV2);
  recorderNodeV2.connect(silentNodeV2);
  silentNodeV2.connect(audioContextV2.destination);
}

async function startRecordingV2() {
  if (!isConnectedV2 || sessionPausedV2) {
    updateStatusV2(sessionPausedV2 ? '当前处于暂停状态，请先恢复。' : '请先开始练习。', 'warning');
    return;
  }
  if (!practiceReadyV2) {
    updateStatusV2('请先获取练习句子后再开始录音。', 'warning');
    return;
  }
  if (isRecordingV2) {
    return;
  }
  try {
    await initAudioGraphV2();
    if (audioContextV2.state === 'suspended') {
      await audioContextV2.resume();
    }
    isRecordingV2 = true;
    recordBtnV2.disabled = true;
    stopBtnV2.disabled = false;
    updateStatusV2('🎙️ 正在录音，开口吧！');
  } catch (error) {
    updateStatusV2(`麦克风访问失败：${error.message}`, 'error');
  }
}

async function stopRecordingV2({ sendTurnEnd = true } = {}) {
  if (!isRecordingV2) {
    return;
  }
  isRecordingV2 = false;
  recordBtnV2.disabled = sessionPausedV2 || !isConnectedV2;
  stopBtnV2.disabled = true;
  flushAudioBufferV2();
  if (sendTurnEnd && websocketV2 && websocketV2.readyState === WebSocket.OPEN) {
    websocketV2.send(JSON.stringify({ type: 'end-turn' }));
    awaitingFeedbackV2 = true;
    updateStatusV2('语音已发送，等待 AI 反馈。');
  }
  addMessageV2('user', '🎤 已发送语音，请稍候 AI 反馈。');
}

function disconnectWebSocketV2() {
  if (websocketV2 && websocketV2.readyState === WebSocket.OPEN) {
    websocketV2.close(1000, 'client disconnect');
  }
}

function requestPracticeSentenceV2() {
  if (!websocketV2 || websocketV2.readyState !== WebSocket.OPEN) {
    return;
  }
  const theme = themeSelectV2.value;
  const scenario = scenarioSelectV2.value;
  websocketV2.send(
    JSON.stringify({
      type: 'start-practice',
      theme,
      scenario,
    })
  );
  awaitingPracticeSentenceV2 = true;
  practiceReadyV2 = false;
  awaitingFeedbackV2 = false;
  recordBtnV2.disabled = true;
  stopBtnV2.disabled = true;
  updateStatusV2('正在向 AI 请求练习句子…');
  addMessageV2('user', `📝 请求练习句子：${theme} - ${scenario}`);
}

async function connectWebSocketV2() {
  if (isConnectedV2) {
    requestPracticeSentenceV2();
    startPracticeBtn.disabled = false;
    return;
  }
  websocketV2 = new WebSocket(wsUrlV2());
  websocketV2.binaryType = 'arraybuffer';

  websocketV2.addEventListener('open', () => {
    isConnectedV2 = true;
    startPracticeBtn.textContent = '重新开始练习';
    startPracticeBtn.disabled = false;
    applyScenarioBtnV2.disabled = false;
    updateStatusV2('已连接，正在请求练习句子。');
    requestPracticeSentenceV2();
  });

  websocketV2.addEventListener('close', () => {
    isConnectedV2 = false;
    sessionPausedV2 = false;
    recordBtnV2.disabled = true;
    stopBtnV2.disabled = true;
    applyScenarioBtnV2.disabled = true;
    practiceReadyV2 = false;
    awaitingPracticeSentenceV2 = false;
    awaitingFeedbackV2 = false;
    startPracticeBtn.textContent = '开始练习';
    startPracticeBtn.disabled = false;
    updateStatusV2('连接已关闭。');
    if (isRecordingV2) {
      stopRecordingV2({ sendTurnEnd: false });
    }
  });

  websocketV2.addEventListener('error', () => {
    updateStatusV2('WebSocket 出错，请稍后重试。', 'error');
  });

  websocketV2.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'status':
          updateStatusV2(data.message ?? '');
          break;
        case 'partial-response':
          appendPartialResponseV2(data.text ?? '');
          break;
        case 'final-response':
          finalizeResponseV2(data);
          break;
        case 'pause-state':
          sessionPausedV2 = Boolean(data.paused);
          recordBtnV2.disabled = sessionPausedV2 || !isConnectedV2;
          break;
        case 'error':
          updateStatusV2(data.message ?? '发生未知错误', 'error');
          break;
        case 'gemini-disconnected':
          updateStatusV2('与 Gemini 的连接已断开，请重新开始练习。', 'warning');
          practiceReadyV2 = false;
          awaitingFeedbackV2 = false;
          awaitingPracticeSentenceV2 = false;
          break;
        default:
          break;
      }
    } catch (err) {
      console.error('Failed to parse message', err);
    }
  });
}

async function loadThemesV2() {
  try {
    const res = await fetch('/api/themes');
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    themesMapV2 = await res.json();
    const themeKeys = Object.keys(themesMapV2);
    themeSelectV2.innerHTML = '';
    themeKeys.forEach((theme) => {
      const option = document.createElement('option');
      option.value = theme;
      option.textContent = theme;
      themeSelectV2.appendChild(option);
    });
    updateScenarioOptionsV2();
  } catch (error) {
    updateStatusV2(`无法加载主题列表：${error.message}`, 'error');
  }
}

function updateScenarioOptionsV2() {
  const theme = themeSelectV2.value;
  const scenarios = themesMapV2[theme] ?? [];
  scenarioSelectV2.innerHTML = '';
  scenarios.forEach((scenario) => {
    const option = document.createElement('option');
    option.value = scenario;
    option.textContent = scenario;
    scenarioSelectV2.appendChild(option);
  });
}

function sendPreferenceV2() {
  if (!isConnectedV2 || !websocketV2 || websocketV2.readyState !== WebSocket.OPEN) {
    updateStatusV2('请先开始练习并建立连接。', 'warning');
    return;
  }
  const theme = themeSelectV2.value;
  const scenario = scenarioSelectV2.value;
  websocketV2.send(
    JSON.stringify({
      type: 'preference',
      theme,
      scenario,
    })
  );
  addMessageV2('user', `🎯 更新练习偏好：${theme} - ${scenario}`);
  updateStatusV2('已发送新练习偏好，AI 会融合到后续对话。');
}

startPracticeBtn.addEventListener('click', () => {
  if (startPracticeBtn.disabled) {
    return;
  }
  startPracticeBtn.disabled = true;
  connectWebSocketV2();
});

recordBtnV2.addEventListener('click', () => {
  startRecordingV2();
});

stopBtnV2.addEventListener('click', () => {
  stopRecordingV2();
});

applyScenarioBtnV2.addEventListener('click', () => {
  sendPreferenceV2();
});

themeSelectV2.addEventListener('change', () => {
  updateScenarioOptionsV2();
});

window.addEventListener('beforeunload', () => {
  disconnectWebSocketV2();
});

loadThemesV2();
updateStatusV2('请点击“开始练习”获取练习句子。');
applyScenarioBtnV2.disabled = true;
recordBtnV2.disabled = true;
stopBtnV2.disabled = true;
*/
