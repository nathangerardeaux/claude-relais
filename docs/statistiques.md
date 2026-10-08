# Anonymous usage statistics (opt-in)

The Relais desktop app sends usage statistics **only if the user said yes** (asked once at first launch,
changeable any time in Settings). Nothing is sent before the answer, nothing after a "no". The plugins
(relais, avocat, images) never send anything themselves: the app reads their state on disk and includes
it in its own report.

What is never sent: e-mail, name, account, file or folder paths, project names, conversation content,
token counts of conversations, IP address storage (the server does not keep it).

## Contract v1

Base URL: `https://api.nybo.fr/api/relais`

### `POST /stats`

JSON body, 16 KB max, `Content-Type: application/json`, no cookies. Answer `204`. Idempotent: values are
per-day totals, the server **replaces** the stored day (it never adds), so sending the same day twice is safe.

```json
{
  "v": 1,
  "id": "3f0c2a9e-6a4b-4c1e-9f7d-2b8e1c4d5a6f",
  "app": "1.0.7",
  "os": "10.0.26200",
  "claude": "2.1.291",
  "node": "22.11.0",
  "langue": "fr",
  "plugins": {
    "relais": { "installe": true, "version": "2.3.0", "relais7j": 4 },
    "avocat": { "installe": true, "version": "1.0.0", "actif": false },
    "images": { "installe": false, "version": "" }
  },
  "jours": [
    { "date": "2026-10-08", "ouvertures": 3, "minutes": 42,
      "onglets": { "vue": 5, "conversations": 2, "skills": 1, "gestion": 0, "memoire": 1, "avocat": 0, "parametres": 1 } }
  ]
}
```

Validation (anything else: `400`, nothing stored):

| Field | Rule |
|---|---|
| `v` | exactly `1` |
| `id` | random UUID v4, lowercase (`/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/`) |
| `app`, `claude`, `node` | string, 0 to 40 chars, `/^[0-9A-Za-z.+-]*$/` (`""` = unknown) |
| `os` | string, 0 to 40 chars, `/^[0-9A-Za-z. ()_+-]*$/` |
| `langue` | `"fr"` or `"en"` |
| `plugins.<relais\|avocat\|images>` | object; `installe` boolean, `version` as `app`; `relais7j` integer 0 to 10000 (relais only); `actif` boolean (avocat only). Unknown keys rejected. |
| `jours` | array, 0 to 31 items, distinct dates |
| `jours[].date` | `YYYY-MM-DD`, not older than 40 days, not later than tomorrow (UTC) |
| `jours[].ouvertures` | integer 0 to 1000 (app launches that day) |
| `jours[].minutes` | integer 0 to 1440 (minutes with the app window in the foreground that day) |
| `jours[].onglets` | object, keys only among `vue, conversations, skills, gestion, memoire, avocat, parametres`, integers 0 to 10000 (times the tab was opened that day) |

### `DELETE /stats/:id`

Deletes everything stored for that id. Answer `204` (also when the id is unknown). The app calls it from
Settings ("Delete my data from the server"), then draws a new random id.

### Limits

Rate limit per IP on both routes (about 30 requests per hour), no CSRF cookie (not a browser), CORS not
needed. Rows of an id not seen for 400 days are purged.
