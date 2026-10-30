# SafeZone: Privacy-First AI School Safety System

SafeZone helps a school notice danger sooner **without putting cameras where students expect privacy**.
Built for the "AI for Safer Schools" hackathon.

The level of monitoring follows the level of privacy in each place:

| Zone type | Examples | What is used | What is never used |
| --- | --- | --- | --- |
| Open | Courtyard, corridors, canteen | CCTV with AI fight detection | Face recognition |
| Semi-private | Classroom corridor, toilet entrance | Camera on the corridor or entrance only | Any view inside private rooms |
| Private | Toilets, changing rooms | SOS button, anonymous student report | Any camera or microphone |

**The AI only recommends. A person always reviews the case and decides.** Nothing happens to a student automatically.

## How it works

```
Signal in  ->  Fuse and score  ->  Alert  ->  Review  ->  Act
```

1. **Signal in:** a CCTV clip, an SOS press, or a student report.
2. **Fuse and score:** the backend combines the AI results and sets a severity (high, medium, low).
3. **Alert:** an incident and alert appear on the dashboard. High-severity cases also go to staff on Telegram.
4. **Review:** a teacher opens the case, sees the evidence image cut from the video, reads the AI's reasoning and adds notes.
5. **Act:** the teacher decides. Every action is written to an audit log.

### AI Model

Two pipelines run on the same clip:

- **Baseline:** YOLO pose detection + ByteTrack tracking, flags fast limb movement between nearby people.
- **Hybrid (refined):** YOLO + MoViNet-A0 (pretrained Kinetics-600 action model) scores a rolling crop around each tracked person.

If either flags the clip it is flagged. A baseline-only flag is capped at medium severity. Both are pretrained models; no training was needed.
The dashboard currently shows the hybrid result only (set `SHOW_BASELINE = true` in `VideoAnalysisPage.tsx` to show the comparison).

### Evidence image

When a clip is flagged, the backend cuts one still frame from the annotated video at the moment MoViNet scored highest (red box and label drawn on it)
and saves it on the incident. It shows in **Incident Management > incident details > Evidence**. It is a pointer for the reviewer, not proof.
Private zones never get an image or video.

## Dashboard pages

| Page | What it does |
| --- | --- |
| Overview | Current incidents, alerts and zone status |
| Safety Map | Every zone with its privacy level. Double-click a zone to open its incident video. Private zones show "no video is recorded here" |
| Video Analysis | Pick a camera feed, see the AI result, and **Create incident from this feed** for flagged feeds |
| Incident Management | Case register with severity, status, evidence image, AI reasoning, notes and an action timeline |
| Alerts & Notifications | Alerts and SOS calls to acknowledge or resolve |
| Student Portal | Anonymous or confidential report, or a request for immediate help |

## Tech stack

- **Frontend:** React + TypeScript (Vite), Tailwind
- **Backend:** FastAPI
- **AI:** Ultralytics YOLO, ByteTrack, MoViNet-A0 (TensorFlow Hub), OpenCV
- **Database:** Supabase Postgres
- **Alerts:** Telegram Bot API

## Project structure

```
SafeZone/
  backend/
    app/
      main.py                  FastAPI app, routes, static files
      config.py                settings loaded from .env
      supabase_client.py       database access
      incident_logic.py        severity fusion, ids, timelines, alerts
      cctv_incident.py         builds an incident from pipeline results
      evidence.py              cuts the evidence image from a video
      notifications.py         Telegram alerts
      pipelines/               baseline and refined (YOLO + MoViNet) pipelines
      routers/                 analyze, incidents, alerts, zones, sos, student_reports, demo_gallery, demo_incidents
      static/                  generated videos and images
    generate_demo_gallery.py   one-time: precompute the demo camera feeds
    evaluate_pipelines.py      fair accuracy test on random held-out clips
    backfill_evidence.py       one-time: add evidence images to old incidents
    requirements.txt
  frontend/
    src/pages/                 the six dashboard pages
    src/components/common/     shared components (badges, modals, toasts)
    src/services/              apiclient.ts (backend calls), incidentService.ts
```

## Run it locally

### 1. Backend

```powershell
cd backend
python -m venv ..\safezone          # first time only
..\safezone\Scripts\activate
pip install -r requirements.txt
```

Create `backend/.env` (never commit this file):

```
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
SUPABASE_ANON_KEY=...
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# optional: Telegram alerts
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
DASHBOARD_URL=http://localhost:5173
```

Start it:

```powershell
uvicorn app.main:app --reload --port 8000
```

Check `http://localhost:8000/api/health`. API docs are at `http://localhost:8000/docs`.

### 2. Demo gallery

```powershell
python generate_demo_gallery.py
```

This runs both pipelines on 6 hand-picked RWF-2000 clips and saves the results, so the demo needs no waiting.
It needs the RWF-2000 dataset in `backend/data/RWF-2000/val`. It takes several minutes on CPU.

### 3. Frontend

```powershell
cd frontend
npm install
```

Create `frontend/.env.local`:

```
VITE_API_BASE_URL=http://localhost:8000
```

```powershell
npm run dev
```

Open `http://localhost:5173`.

## Telegram alerts

1. Message **@BotFather**, send `/newbot`, copy the token into `TELEGRAM_BOT_TOKEN`.
2. Create a staff group, add the bot, send a message in the group.
3. Open `https://api.telegram.org/bot<TOKEN>/getUpdates` and copy the group's `chat` `id` (a negative number) into `TELEGRAM_CHAT_ID`.

Alerts are sent for: high-severity AI detections, every SOS press, and student reports marked as immediate danger.
**Privacy:** the message holds only place, time, severity, reason and incident number. Never video, images, names or report text.
Some company and school networks block Telegram, so test on a different network if it times out.

## Evaluating the AI fairly

```powershell
python evaluate_pipelines.py --per-class 20
```

Picks random clips from a fixed seed, leaves out the hand-picked demo clips, runs both pipelines, and writes `app/static/model_eval.json`.
The Video Analysis panel then shows accuracy, recall, false-alarm rate and speed from those clips. The 6 demo clips are chosen to look clear.

## Deployment

| Part | Where |
| --- | --- |
| Frontend | Vercel (set `VITE_API_BASE_URL` to the backend address) |
| Backend + models | Hugging Face Spaces (Docker). Set the `.env` values as Space secrets |
| Database | Supabase |

Set `ALLOWED_ORIGINS` on the backend to the Vercel address. The Docker image needs `ffmpeg` and `libglib2.0-0`.

## Privacy and safety

- No camera, recording or analysis in private zones. The dashboard blocks video there.
- A human reviews every case. The AI shows its confidence and reasoning and takes no action itself.
- Anonymous reports store no name, IP address or device fingerprint.
- Every system and staff action is recorded in an audit log.
- Secrets live only on the backend, never in the frontend or in Git.

## Status and known limits

| Area | Status |
| --- | --- |
| Video analysis with two pipelines, incidents, alerts, SOS, student reports | Working |
| Evidence image on incidents | Working |
| Telegram alerts | Working (needs a network that can reach Telegram) |
| Accuracy of the two pipelines on a fair test set | Not measured yet. Run `evaluate_pipelines.py` |
| Live camera streams | Not built. The demo uses precomputed feeds and uploaded clips |
| Automatic escalation when nobody acknowledges an alert | Not built |
| Automatic purge of old videos and images (the UI mentions 14 days) | Not built |
| Detection inside private rooms | By design, none: a student must press SOS or report |

Training data (RWF-2000) is not school footage, so real-world accuracy may be lower. The detectors can miss fights and raise false alarms,
which is why a person always decides.