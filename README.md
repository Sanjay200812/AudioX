# AudioX

Private Audio Download & Offline Listening Tool.

## Features

- **YouTube Single Video Audio Processing**: Direct audio extraction in high-fidelity MP3 and M4A formats.
- **YouTube Playlist Detection & Sequential Processing**: Automatically analyzes full playlists, provides one-click batch queueing or individual track selection, and processes sequential downloads safely.
- **Offline PWA Experience**: Mobile-first responsive interface with offline player and custom download directory support.
- **Zero Public Login**: 100% anonymous, privacy-respecting client experience without collecting personal data.
- **Private Admin Dashboard (`/admin`)**: Protected operations portal with access-key authentication for monitoring system health, downloads, and anonymous traffic.

---

## AUDIOX SUPABASE SETUP

1. Create Supabase project.
2. Open Supabase Project Settings / API Keys.
3. Copy Project URL.
4. Copy server Secret key.
5. Put them in `.env.local`:

```env
SUPABASE_URL=...
SUPABASE_SECRET_KEY=...
```

6. Run SQL from:

`supabase/audiox-analytics.sql`

inside Supabase SQL Editor.

7. Restart development server.

8. Add the same environment variables to production hosting.

---

## Environment Variables

| Variable | Description | Required | Scope |
|---|---|---|---|
| `SUPABASE_URL` | Supabase Project URL (`https://xyz.supabase.co`) | Required for real-time analytics | Server only |
| `SUPABASE_SECRET_KEY` | Supabase Server Secret Key (`service_role`) | Required for real-time analytics | Server only |
| `AUDIOX_ADMIN_KEY` | Secret access key to unlock `/admin` | Yes | Server only |
| `AUDIOX_TEMP_DIR` | Working directory for audio processing | Optional (defaults to OS temp) | Server only |
| `AUDIOX_DB_PATH` | Path for local SQLite fallback database | Optional | Server only |

> **Important Security Rule**: `SUPABASE_SECRET_KEY` and `AUDIOX_ADMIN_KEY` are **server-only**. Never prefix them with `NEXT_PUBLIC_` or expose them to browser bundles.

---

## Private Admin Operations

The administrative operations console is available directly at:
`/admin`

- Access by manually appending `/admin` to any deployment domain URL.
- Authenticate using the configured `AUDIOX_ADMIN_KEY`.
- Protected by rate limiting and encrypted HttpOnly session cookies.
- No public links exist to this route.
