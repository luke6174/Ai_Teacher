# Gemini 英语口语助手（Web 版）

新版应用在保留原始命令行逻辑的基础上，引入 HTML + JavaScript 前端界面和 FastAPI 后端服务，实现更友好的实时练习体验。下面提供部署与使用指南。

## 功能概览

- 浏览器端实时录音上传，后端转发至 Gemini Bidi 接口。
- AI 双语反馈（英文在前、中文在后），包含语法与发音建议。
- 自动计算发音评分，并支持 ElevenLabs 在线播报示范音频。
- 支持“Can I have a break”“OK let's continue”等控制指令。
- 主题 / 场景偏好可在界面上快速发送。

## 环境需求

| 组件 | 说明 |
| --- | --- |
| Python | 3.11 及以上版本 |
| 浏览器 | 支持 AudioWorklet（最新 Chrome / Edge / Safari 16+） |
| API Key | `GOOGLE_API_KEY`（必填），`ELEVENLABS_API_KEY`（可选） |

> 若需代理，请设置 `HTTP_PROXY` 环境变量。

## 安装步骤

1. **创建虚拟环境并安装依赖**

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate  # Windows 使用 .venv\Scripts\activate
   pip install -r backend/requirements.txt
   ```

2. **配置环境变量（.env）**

   ```env
   GOOGLE_API_KEY=你的谷歌密钥
   ELEVENLABS_API_KEY=可选
   ELEVENLABS_VOICE_ID=nPczCjzI2devNBz1zQrb
   ELEVENLABS_VOICE_MODEL=eleven_flash_v2_5
   GEMINI_MODEL=gemini-2.0-flash-exp
   HTTP_PROXY=http://user:pass@proxy:port
   ```

3. **启动后端服务**

   ```bash
   uvicorn backend.app:app --reload
   ```

4. **访问前端界面**

   打开浏览器访问 `http://127.0.0.1:8000/`，允许麦克风权限即可开始练习。

## 使用说明

1. 点击“连接服务”建立 WebSocket；成功后可选择主题与场景。
2. 选择完毕后点击“发送偏好”，AI 会在后续对话中参考。
3. 点击“开始录音”并说话，结束后点击“结束发言”提交音频。
4. AI 会输出双语反馈、发音评分与练习句子；若配置了 ElevenLabs，会自动播放示范音频。
5. 若 AI 或你说出 “Can I have a break”，录音按钮会禁用；“OK let's continue” 恢复练习。

## 目录说明

- `backend/app.py`：FastAPI 应用，处理 WebSocket 会话、音频转发与 Gemini 交互。
- `backend/services/gemini_session.py`：封装 Gemini Bidi 会话。
- `backend/services/tts_client.py`：ElevenLabs 文本转语音客户端。
- `frontend/index.html | app.js | styles.css`：前端界面与交互逻辑。
- `frontend/worklets/recorder-processor.js`：AudioWorklet 采集麦克风 PCM。

## 常见问题

- **连接报错 401/403**：检查 `GOOGLE_API_KEY` 是否具备实时接口权限。
- **浏览器录音失败**：需使用 HTTPS 或 localhost，确保已允许麦克风权限。
- **音色不合适**：可在 `.env` 中替换 `ELEVENLABS_VOICE_ID` / `VOICE_MODEL`。
- **需要代理**：设置 `HTTP_PROXY`，后端会自动通过代理建立 Gemini WebSocket。

## 后续可扩展方向

- 增加聊天历史持久化与导出。
- 接入文字输入模式，便于无麦克风环境使用。
- 引入更精细的发音评估算法（如使用专用 SDK）。
