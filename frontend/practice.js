const startPracticeBtn = document.querySelector('#startPracticeBtn');
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
let awaitingPracticeSentence = false;
let practiceReady = false;
let awaitingFeedback = false;

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

  if (awaitingPracticeSentence) {
    awaitingPracticeSentence = false;
    practiceReady = true;
    awaitingFeedback = false;
    updateStatus('练习句子已准备，请点击“开始录音”跟读。');
    recordBtn.disabled = false;
  } else if (awaitingFeedback) {
    awaitingFeedback = false;
    updateStatus('反馈已生成，可继续练习或重新开始。');
    recordBtn.disabled = sessionPaused || !isConnected;
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

function sendPcmChunk(pcm16) {
  if (!websocket || websocket.readyState !== WebSocket.OPEN) {
    return;
  }
  const buffer = pcm16.buffer.slice(pcm16.byteOffset, pcm16.byteOffset + pcm16.byteLength);
  websocket.send(buffer);
}

function processAudioChunk(chunk) {
  if (!isRecording || sessionPaused) {
    return;
  }
  bufferedFloat32 = concatFloat32(bufferedFloat32, chunk);
  const requiredSamples = Math.floor((inputSampleRate / 1000) * CHUNK_DURATION_MS);
  while (bufferedFloat32.length >= requiredSamples) {
    const slice = bufferedFloat32.slice(0, requiredSamples);
    bufferedFloat32 = bufferedFloat32.slice(requiredSamples);
    const pcm16 = downsampleTo16k(slice, inputSampleRate);
    if (pcm16.length) {
      sendPcmChunk(pcm16);
    }
  }
}

function flushAudioBuffer() {
  if (bufferedFloat32.length === 0) {
    return;
  }
  const pcm16 = downsampleTo16k(bufferedFloat32, inputSampleRate);
  if (pcm16.length) {
    sendPcmChunk(pcm16);
  }
  bufferedFloat32 = new Float32Array(0);
}

async function initAudioGraph() {
  if (audioContext) {
    return;
  }
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      echoCancellation: true,
      autoGainControl: true,
      noiseSuppression: true,
    },
  });
  audioContext = new AudioContext();
  inputSampleRate = audioContext.sampleRate;
  await audioContext.audioWorklet.addModule('worklets/recorder-processor.js');
  const source = audioContext.createMediaStreamSource(mediaStream);
  recorderNode = new AudioWorkletNode(audioContext, 'recorder-processor');
  recorderNode.port.onmessage = (event) => processAudioChunk(event.data);
  silentNode = audioContext.createGain();
  silentNode.gain.value = 0;
  source.connect(recorderNode);
  recorderNode.connect(silentNode);
  silentNode.connect(audioContext.destination);
}

async function startRecording() {
  if (!isConnected || sessionPaused) {
    updateStatus(sessionPaused ? '当前处于暂停状态，请先恢复。' : '请先开始练习。', 'warning');
    return;
  }
  if (!practiceReady) {
    updateStatus('请先获取练习句子后再开始录音。', 'warning');
    return;
  }
  if (isRecording) {
    return;
  }
  try {
    await initAudioGraph();
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    isRecording = true;
    recordBtn.disabled = true;
    stopBtn.disabled = false;
    updateStatus('🎙️ 正在录音，开口吧！');
  } catch (error) {
    updateStatus(`麦克风访问失败：${error.message}`, 'error');
  }
}

async function stopRecording({ sendTurnEnd = true } = {}) {
  if (!isRecording) {
    return;
  }
  isRecording = false;
  recordBtn.disabled = sessionPaused || !isConnected;
  stopBtn.disabled = true;
  flushAudioBuffer();
  if (sendTurnEnd && websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.send(JSON.stringify({ type: 'end-turn' }));
    awaitingFeedback = true;
    updateStatus('语音已发送，等待 AI 反馈。');
  }
  addMessage('user', '🎤 已发送语音，请稍候 AI 反馈。');
}

function disconnectWebSocket() {
  if (websocket && websocket.readyState === WebSocket.OPEN) {
    websocket.close(1000, 'client disconnect');
  }
}

function requestPracticeSentence() {
  if (!websocket || websocket.readyState !== WebSocket.OPEN) {
    return;
  }
  const theme = themeSelect.value;
  const scenario = scenarioSelect.value;
  websocket.send(
    JSON.stringify({
      type: 'start-practice',
      theme,
      scenario,
    })
  );
  awaitingPracticeSentence = true;
  practiceReady = false;
  awaitingFeedback = false;
  recordBtn.disabled = true;
  stopBtn.disabled = true;
  updateStatus('正在向 AI 请求练习句子…');
  addMessage('user', `📝 请求练习句子：${theme} - ${scenario}`);
}

async function connectWebSocket() {
  if (isConnected) {
    requestPracticeSentence();
    startPracticeBtn.disabled = false;
    return;
  }
  websocket = new WebSocket(wsUrl());
  websocket.binaryType = 'arraybuffer';

  websocket.addEventListener('open', () => {
    isConnected = true;
    startPracticeBtn.textContent = '重新开始练习';
    startPracticeBtn.disabled = false;
    applyScenarioBtn.disabled = false;
    updateStatus('已连接，正在请求练习句子。');
    requestPracticeSentence();
  });

  websocket.addEventListener('close', () => {
    isConnected = false;
    sessionPaused = false;
    recordBtn.disabled = true;
    stopBtn.disabled = true;
    applyScenarioBtn.disabled = true;
    practiceReady = false;
    awaitingPracticeSentence = false;
    awaitingFeedback = false;
    startPracticeBtn.textContent = '开始练习';
    startPracticeBtn.disabled = false;
    updateStatus('连接已关闭。');
    if (isRecording) {
      stopRecording({ sendTurnEnd: false });
    }
  });

  websocket.addEventListener('error', () => {
    updateStatus('WebSocket 出错，请稍后重试。', 'error');
    startPracticeBtn.disabled = false;
  });

  websocket.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'status':
          if (data.message === 'connected') {
            updateStatus('已连接到服务，请稍候。');
          } else if (data.message === 'voice-enabled') {
            updateStatus('AI 语音已启用，可提供发音示例。');
          } else if (data.message === 'voice-disabled') {
            updateStatus('当前语音播报不可用，将仅返回文本反馈。');
          } else {
            updateStatus(data.message ?? '');
          }
          break;
        case 'partial-response':
          appendPartialResponse(data.text ?? '');
          break;
        case 'final-response':
          finalizeResponse(data);
          break;
        case 'pause-state':
          sessionPaused = Boolean(data.paused);
          recordBtn.disabled = sessionPaused || !isConnected;
          break;
        case 'error':
          updateStatus(data.message ?? '发生未知错误', 'error');
          startPracticeBtn.disabled = false;
          break;
        case 'gemini-disconnected':
          updateStatus('与 Gemini 的连接已断开，请重新开始练习。', 'warning');
          practiceReady = false;
          awaitingFeedback = false;
          awaitingPracticeSentence = false;
          startPracticeBtn.textContent = '重新开始练习';
          startPracticeBtn.disabled = false;
          break;
        default:
          break;
      }
    } catch (err) {
      console.error('Failed to parse message', err);
    }
  });
}

async function loadThemes() {
  try {
    const res = await fetch('/api/themes');
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
  scenarios.forEach((scenario) => {
    const option = document.createElement('option');
    option.value = scenario;
    option.textContent = scenario;
    scenarioSelect.appendChild(option);
  });
}

function sendPreference() {
  if (!isConnected || !websocket || websocket.readyState !== WebSocket.OPEN) {
    updateStatus('请先开始练习并建立连接。', 'warning');
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
  addMessage('user', `🎯 更新练习偏好：${theme} - ${scenario}`);
  updateStatus('已发送新练习偏好，AI 会融合到后续对话。');
}

startPracticeBtn.addEventListener('click', () => {
  if (startPracticeBtn.disabled) {
    return;
  }
  startPracticeBtn.disabled = true;
  connectWebSocket();
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
updateStatus('请点击“开始练习”获取练习句子。');
applyScenarioBtn.disabled = true;
recordBtn.disabled = true;
stopBtn.disabled = true;
