# RescueMind

RescueMind is an emergency-response coordination dashboard for organizing incoming distress reports, identifying urgent situations, and planning resource recommendations. It is an operator-support prototype, not an emergency service or autonomous dispatch system.

## Features

- Accepts multilingual text reports and JPEG, PNG, or WebP SOS screenshots.
- Uses the Gemini `generateContent` API with a configured Gemma 4 model for image/text translation and triage.
- Validates model responses against a strict Zod schema; failed or unavailable inference is reported, not silently replaced.
- Offers a clearly labelled local, text-only demo mode with seeded sample incidents.
- Maps reports with coordinates and ranks incidents using severity, type, and proximity to the configured response centre.
- Suggests the nearest available compatible unit without reserving or dispatching it.
- Requires human review before response; AI classifications and recommendations are advisory.
- Stores incidents and sample units in an atomic local JSON file.

## Requirements and local run

Requirements: Node.js 20+ and npm. No Python runtime is needed.

```bash
npm ci
npm run build
cp .env.example .env
npm start
```

Open [http://localhost:8000](http://localhost:8000). Demo mode works without a model key; image analysis requires Gemini mode.

To enable Gemma 4 inference, set in `.env`:

```dotenv
AI_PROVIDER=gemini
GEMINI_API_KEY=your-key
GEMINI_MODEL=gemma-4-e4b-it
```

Model availability can vary by API account. Confirm that your configured model is available to your Gemini API key. Distress text and images are sent to the configured model provider; do not submit sensitive personal or medical details unless your organization has approved that data flow.

The local `.env` file is ignored by Git and contains no credentials by default. `.env.example` is the safe template to commit. For production, configure environment variables in the Cloudways/DigitalOcean control panel, use `AI_PROVIDER=gemini`, and provide a newly generated dashboard key of at least 32 characters. For example, generate a key locally with `node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('hex'))"` and enter it directly in the deployment environment settings—never commit it.

## Configuration

| Variable | Purpose |
| --- | --- |
| `AI_PROVIDER` | `demo` (default) or `gemini` |
| `GEMINI_API_KEY` | Server-side API key; never put it in browser code or commit it |
| `GEMINI_MODEL` | Model available to the configured Gemini API account |
| `GEMINI_API_BASE_URL` | Gemini API base URL; defaults to Google's `v1beta` API |
| `DASHBOARD_API_KEY` | Optional shared API secret, sent as `X-Dashboard-Key` |
| `DISPATCH_BASE_LAT`, `DISPATCH_BASE_LON` | Dispatch centre coordinates; set both or leave both blank |
| `MAX_IMAGE_BYTES` | Image upload limit in bytes (default 5 MiB) |
| `DATA_FILE` | JSON store path (default `data/rescuemind.json`) |
| `HOST`, `PORT` | Bind address and port; Cloudways supplies its port where applicable |

Production mode refuses to start without a dashboard key of at least 32 characters. Use a unique key and HTTPS for a public deployment. The shared-key gate is not user accounts or role-based access. For operational use, place the dashboard behind an authenticated reverse proxy.

## API

- `GET /api/health` — liveness and model configuration status; no secret values returned.
- `GET /api/dashboard` — ranked incidents, units, and proposed dispatch list.
- `POST /api/incidents` — multipart `message` and optional `image`.
- `PATCH /api/incidents/{id}/review` — mark an incident reviewed.
- `PATCH /api/incidents/{id}/resolve` — resolve an incident.

All API routes except health require `X-Dashboard-Key` when `DASHBOARD_API_KEY` is configured. Uploaded image bytes are processed in memory and sent to Gemini; they are not saved to the JSON store.

## Deploy on Cloudways

The supplied Cloudways log shows that `npm install` and `npm run build` exited successfully; Tailwind completed. `Browserslist: caniuse-lite is outdated` is a warning, not a build failure. The later `Status: FAILED (rc=-1)` does not identify a failed command or show the subsequent startup/health-check phase, so the excerpt alone cannot establish the exact cause.

This repository now targets Cloudways' Node runtime end-to-end: API server, multipart upload handling, Gemini integration, persistence, health endpoint, and startup are all Node-based. Node 24 (the version shown in the provided log) is supported by this application; there is no Python installation requirement.

1. Deploy the repository to the Cloudways Node application and select Node.js 24.
2. Set the build command to `npm run build` and the start command to `npm start` in the Cloudways application settings.
3. Configure the environment variables from `.env.example` in Cloudways; explicitly set `NODE_ENV=production`, `DASHBOARD_API_KEY`, Gemini settings, and response-centre coordinates. Do not commit `.env` or secrets.
4. Ensure the application process binds to Cloudways' assigned `PORT`; the server reads `PORT` and binds to `0.0.0.0` by default.
5. After deployment, open `https://<your-domain>/api/health` and confirm `status` is `ok`. Then load `/` and submit a test report. Check the Cloudways application runtime/startup logs if health does not respond.

The `rc=-1` is generated by the deployment runner, not explained by this build log. If it persists after this Node-only startup change, collect the full deployment activity (including steps after “Build”), the Cloudways application startup log, selected Node version, configured start command, and `/api/health` result for Cloudways support. Do not infer a Tailwind build error from the final wrapper status when the build step itself reports exit code 0.

## DigitalOcean / Docker

```bash
cp .env.example .env
# Configure secrets, AI_PROVIDER, and the dispatch-centre coordinates.
docker compose up --build -d
docker compose logs -f rescuemind
```

The image runs as the non-root Node user and Compose keeps JSON records in a persistent volume. Put HTTPS and access control in front of the service and back up the volume. The JSON store is for a single application process; use PostgreSQL and shared durable storage before scaling to multiple instances or high-concurrency operations.

## Tests

```bash
npm test
npm run build
```

## Safety note

RescueMind is a prototype for response coordination. AI may misclassify messages or locations; operators must verify details with trained responders. Do not rely on AI output as the sole basis for emergency action.

## License

This project is distributed under the MIT License. See [LICENSE](./LICENSE).
