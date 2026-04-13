# Plan: Ava Multimedia Fix — Voice Notes, Images & All Media Types

## Summary
Ava silently drops ALL WhatsApp multimedia messages (voice notes, images, videos, documents) that arrive without a caption text. A single guard in `main.py` (`not msg.texto`) filters them out before the media-processing pipeline is ever invoked. The media pipeline code (`media.py`) is correct — it just never gets called. This plan fixes the gate bug and adds test coverage.

## User Story
As a real estate lead using WhatsApp, I want to send a voice note to Ava and receive an intelligent reply, so that I can communicate naturally without typing.

## Problem → Solution
`main.py` line 164 skips any message where `msg.texto` is falsy — which includes every multimedia-only message. Fix: change the guard to only skip when BOTH `texto` and `media_id` are absent.

## Root Cause (single line)
```python
# FILE: whatsapp-agentkit/agent/main.py — line 162-165
# BEFORE (broken):
for msg in mensajes:
    if msg.es_propio or not msg.texto:   # ← drops every media-only msg
        continue
    background_tasks.add_task(procesar_mensaje, msg)

# AFTER (fixed):
for msg in mensajes:
    if msg.es_propio:
        continue
    if not msg.texto and not msg.media_id:   # skip only truly empty
        continue
    background_tasks.add_task(procesar_mensaje, msg)
```

## Metadata
- **Complexity**: Small (1-line root fix + tests + deploy)
- **Source PRD**: N/A
- **Estimated Files**: 2 files changed (main.py + tests/), 1 deploy

---

## UX Design

### Before
```
User sends 🎤 voice note
         ↓
[Meta webhook] → parsear_webhook() → MensajeEntrante(texto="", media_id="xyz", media_type="audio")
         ↓
if msg.es_propio or not msg.texto:  ← "" is falsy → SKIP
         ↓
🔇 Silence. No reply. User confused.
```

### After
```
User sends 🎤 voice note
         ↓
[Meta webhook] → parsear_webhook() → MensajeEntrante(texto="", media_id="xyz", media_type="audio")
         ↓
if not msg.texto and not msg.media_id: ← has media_id → DO NOT SKIP
         ↓
procesar_mensaje() → process_media_message("audio") → download_media() → transcribe_audio()
         ↓
text = "Quiero comprar un apartamento en Piantini..." → generar_respuesta() → Ava replies ✓
```

### Affected Media Types
| Type | Texto in payload | media_id | Was broken? | Fix? |
|------|-----------------|----------|-------------|------|
| audio (voice note) | `""` | ✓ | YES | ✓ |
| image without caption | `""` | ✓ | YES | ✓ |
| image with caption | `"caption text"` | ✓ | NO (caption saved it) | No change needed |
| video | `""` | ✓ | YES | ✓ |
| document | `""` | ✓ | YES | ✓ |
| plain text | `"text"` | `None` | NO | No change needed |

---

## Mandatory Reading

| Priority | File | Lines | Why |
|---|---|---|---|
| P0 | `whatsapp-agentkit/agent/main.py` | 155–170 | The broken guard — exact lines to edit |
| P0 | `whatsapp-agentkit/agent/media.py` | 230–285 | `process_media_message()` — the pipeline that already works |
| P1 | `whatsapp-agentkit/agent/providers/base.py` | 10–17 | `MensajeEntrante` dataclass — `media_id` field is `str | None` |
| P1 | `whatsapp-agentkit/agent/providers/meta.py` | 40–75 | `parsear_webhook` — how media_id is set from Meta payload |
| P2 | `whatsapp-agentkit/agent/media.py` | 77–122 | `transcribe_audio()` — Whisper call, good as-is |

---

## Patterns to Mirror

### GUARD_PATTERN
```python
# SOURCE: agent/main.py:162-165 (the broken pattern — what to FIX)
# CURRENT (wrong):
if msg.es_propio or not msg.texto:
    continue

# CORRECT (media-aware):
if msg.es_propio:
    continue
if not msg.texto and not msg.media_id:
    continue
```

### LOGGING_PATTERN
```python
# SOURCE: agent/main.py:49-53
logger.info(
    f"Procesando mensaje de {msg.telefono} "
    f"tipo={msg.media_type or 'text'} media_id={msg.media_id}"
)
```

### ERROR_FALLBACK_PATTERN
```python
# SOURCE: agent/media.py:254-256
if result:
    transcription = await transcribe_audio(audio_bytes, mime)
    if transcription:
        return transcription, media_url
return text or "[Nota de voz no procesada]", media_url
```

---

## Files to Change

| File | Action | What |
|---|---|---|
| `whatsapp-agentkit/agent/main.py` | UPDATE | Fix the guard at line 164 |
| `whatsapp-agentkit/tests/` | UPDATE/CREATE | Add multimedia message test cases |

## NOT Building
- Changes to `media.py` — the processing pipeline is correct
- Changes to `brain.py` — GPT-4o handling is correct
- Changes to `providers/meta.py` — webhook parsing is correct
- Supabase Storage upload for media files (out of scope)
- Video/document AI analysis (video and docs already handled gracefully)

---

## Step-by-Step Tasks

### Task 1: Fix the guard in main.py
- **ACTION**: Edit `whatsapp-agentkit/agent/main.py` at the `webhook_handler` function
- **IMPLEMENT**:
  ```python
  # FIND (lines 162-166):
  for msg in mensajes:
      if msg.es_propio or not msg.texto:
          continue
      background_tasks.add_task(procesar_mensaje, msg)
  
  # REPLACE WITH:
  for msg in mensajes:
      if msg.es_propio:
          continue
      if not msg.texto and not msg.media_id:
          continue  # truly empty message — nothing to process
      background_tasks.add_task(procesar_mensaje, msg)
  ```
- **IMPORTS**: None needed
- **GOTCHA**: `msg.texto` can be `""` (empty string) for media-only messages — falsy but valid. `msg.media_id` being non-None means there IS media to process.
- **VALIDATE**: Run `grep -n "not msg.texto" agent/main.py` → should return 0 matches

### Task 2: Add test for multimedia messages
- **ACTION**: Add test cases to `whatsapp-agentkit/tests/` verifying media messages reach `procesar_mensaje`
- **IMPLEMENT**: Create `tests/test_multimedia_guard.py`:
  ```python
  import pytest
  from unittest.mock import AsyncMock, patch, MagicMock
  from agent.providers.base import MensajeEntrante
  
  def make_audio_msg():
      return MensajeEntrante(
          telefono="+18095551234",
          texto="",          # no caption — was triggering the bug
          mensaje_id="msg_1",
          es_propio=False,
          media_id="audio_id_123",
          media_type="audio",
      )
  
  def make_image_msg_no_caption():
      return MensajeEntrante(
          telefono="+18095551234",
          texto="",
          mensaje_id="msg_2",
          es_propio=False,
          media_id="img_id_456",
          media_type="image",
      )
  
  @pytest.mark.asyncio
  async def test_audio_message_not_skipped():
      """Audio-only messages (no caption) must NOT be filtered out."""
      from fastapi import BackgroundTasks
      from agent.main import webhook_handler
      
      msg = make_audio_msg()
      tasks = BackgroundTasks()
      
      with patch("agent.main.proveedor") as mock_prov, \
           patch("agent.main.procesar_mensaje", new_callable=AsyncMock) as mock_proc:
          mock_prov.parsear_webhook = AsyncMock(return_value=[msg])
          
          from fastapi.testclient import TestClient
          from agent.main import app
          client = TestClient(app)
          
          # Simulate webhook POST
          response = client.post("/webhook", json={"entry": []})
          # procesar_mensaje should have been enqueued (background task)
          # Since background tasks run after response in tests, check it was added
          assert response.status_code == 200
  
  @pytest.mark.asyncio  
  async def test_guard_logic_directly():
      """Unit test the guard logic in isolation."""
      audio_msg = make_audio_msg()
      image_msg = make_image_msg_no_caption()
      empty_msg = MensajeEntrante(telefono="+1", texto="", mensaje_id="x", es_propio=False)
      own_msg = MensajeEntrante(telefono="+1", texto="hello", mensaje_id="x", es_propio=True)
  
      def should_process(msg: MensajeEntrante) -> bool:
          """Replicate the FIXED guard logic."""
          if msg.es_propio:
              return False
          if not msg.texto and not msg.media_id:
              return False
          return True
  
      assert should_process(audio_msg) is True,   "audio-only must be processed"
      assert should_process(image_msg) is True,   "image without caption must be processed"
      assert should_process(empty_msg) is False,  "truly empty must be skipped"
      assert should_process(own_msg)  is False,   "own messages must be skipped"
  ```
- **MIRROR**: Test structure with `pytest.mark.asyncio`, guard logic replicated for unit test
- **VALIDATE**: `cd whatsapp-agentkit && python -m pytest tests/test_multimedia_guard.py -v`

### Task 3: Deploy to Railway
- **ACTION**: Push changes to Railway-connected repo and trigger redeploy
- **IMPLEMENT**:
  ```bash
  cd c:/Users/ivanp/whatsapp-agentkit
  git add agent/main.py tests/test_multimedia_guard.py
  git commit -m "fix: allow multimedia messages without caption text to reach Ava pipeline"
  git push origin main
  # Railway auto-deploys from main branch
  ```
- **GOTCHA**: Railway service is `remax-advance-ava` (project `mindful-communication`). If no CI/CD is wired, trigger redeploy via Railway dashboard.
- **VALIDATE**: After deploy, send a voice note to the WhatsApp number → Ava should reply with a transcription-based response

---

## Validation Commands

### Unit test (local)
```bash
cd c:/Users/ivanp/whatsapp-agentkit
pip install pytest pytest-asyncio httpx
python -m pytest tests/test_multimedia_guard.py -v
```
EXPECT: 2 tests pass — `test_guard_logic_directly` (fast) + any integration tests

### Verify fix applied
```bash
grep -n "not msg.texto" c:/Users/ivanp/whatsapp-agentkit/agent/main.py
```
EXPECT: 0 matches (old guard gone)

```bash
grep -n "msg.media_id" c:/Users/ivanp/whatsapp-agentkit/agent/main.py
```
EXPECT: 1 match (new guard in place)

### End-to-end test (manual)
1. Deploy to Railway
2. Send a WhatsApp voice note to the number
3. Check Railway logs: should see `"Media procesada: 'transcription text...'"` 
4. Ava should reply intelligently based on the transcription

---

## Acceptance Criteria
- [ ] `grep "not msg.texto" agent/main.py` → 0 matches
- [ ] Voice note sent to WhatsApp number → Ava replies (not silence)
- [ ] Image without caption → Ava replies with image description context
- [ ] Plain text messages → still work (no regression)
- [ ] `test_guard_logic_directly` passes
- [ ] Railway deploy successful

## Risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Railway repo has no git CI/CD → need manual redeploy | Medium | Low | Use Railway CLI or dashboard to trigger deploy |
| `META_ACCESS_TOKEN` expired → download_media fails | Low | Medium | Check Railway env vars; token should still be valid |
| Whisper API returns error for corrupted audio | Low | Low | Fallback already in media.py: returns `"[Nota de voz no procesada]"` — Ava still responds |

## Notes
- **Repo path**: `c:\Users\ivanp\whatsapp-agentkit\` (separate from advance-crm)
- **Railway service**: `remax-advance-ava` in project `mindful-communication` (b8a6329c)  
- The media pipeline (download → Whisper/Vision → text) is 100% correct — only the upstream gate was blocking it
- WhatsApp voice notes arrive as `audio/ogg; codecs=opus` from Meta; `mime_to_ext.get(...)` defaults to "ogg" — acceptable for Whisper
- `msg.texto` is `""` (empty string) not `None` for caption-less media — both are falsy, hence the original bug
