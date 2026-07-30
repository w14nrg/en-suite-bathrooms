# En-Suites & Bathrooms — WhatsApp-style live chat

This package is the standalone live-chat system for `en-suite.co.uk`. It does **not** depend on the unfinished bathroom planner.

## What is included

### Customer website chat

- Branded **Message us** button on every page.
- WhatsApp-style conversation window.
- Short qualification flow: project type, area/postcode, brief, timing, name and contact details.
- Nicholas can take over the same conversation without the customer repeating anything.
- Optional **Continue on WhatsApp** button.

### Nicholas's phone app

- Installable **En-Suite Leads** web app for the Pixel.
- WhatsApp-style conversation list and chat screen.
- Immediate push alert after a visitor's first real message.
- Reminder alerts after roughly 2 minutes and 5 minutes while unread.
- Tapping the notification opens the exact conversation.
- Opening or replying to the conversation stops further reminders.
- Take over, reply, WhatsApp the customer and change lead stage.

### Cost

This version does not use OpenAI and has no paid chatbot subscription. It uses Cloudflare Workers/D1 and Firebase Cloud Messaging. Both have free allowances suitable for this early enquiry volume. Normal service limits still apply.

## Files

- `worker/src/index.js` — Cloudflare Worker API, qualification flow, inbox authentication, FCM push sending and reminder schedule.
- `worker/public/widget.js` — customer website widget.
- `worker/public/inbox.html` — Nicholas's installable WhatsApp-style inbox.
- `worker/public/manifest.webmanifest` and icons — phone app installation.
- `worker/schema.sql` — fresh D1 database.
- `worker/migrate-from-old.sql` — only for upgrading the unused Pushover prototype database.
- `site/embed-snippet.html` — code added to the public website.
- `TEST-CHECKLIST.txt` — required testing before Tawk.to is removed.

# Deployment

## 1. Create the free Firebase project

1. Sign in at `https://console.firebase.google.com/`.
2. Create a project named **En-Suite Leads**. Google Analytics is not required.
3. In the project overview, choose the **Web** app icon and register an app named **En-Suite Leads Web**.
4. Firebase displays a configuration object. Copy these values into `worker/wrangler.toml`:
   - `apiKey` → `FIREBASE_API_KEY`
   - `authDomain` → `FIREBASE_AUTH_DOMAIN`
   - `projectId` → `FIREBASE_PROJECT_ID`
   - `storageBucket` → `FIREBASE_STORAGE_BUCKET`
   - `messagingSenderId` → `FIREBASE_MESSAGING_SENDER_ID`
   - `appId` → `FIREBASE_APP_ID`
5. Open **Project settings → Cloud Messaging → Web Push certificates**.
6. Generate a new key pair and copy it into `FIREBASE_VAPID_KEY` in `wrangler.toml`.
7. Open **Project settings → Service accounts** and choose **Generate new private key**. Save the downloaded JSON securely. Never put this JSON into GitHub.

## 2. Create and initialise Cloudflare D1

Open PowerShell in the `worker` folder:

```powershell
npm install
npx wrangler login
npx wrangler d1 create ensuite-live-chat-db
```

Copy the returned `database_id` into `worker/wrangler.toml`, replacing `PASTE_D1_DATABASE_ID_HERE`.

Then create the tables:

```powershell
npx wrangler d1 execute ensuite-live-chat-db --remote --file=./schema.sql
```

## 3. Add encrypted secrets

Create the inbox password:

```powershell
npx wrangler secret put ADMIN_PASSWORD
```

Create a random session secret. This must be at least 32 characters:

```powershell
npx wrangler secret put SESSION_SECRET
```

Upload the Firebase service-account JSON as one encrypted secret:

```powershell
Get-Content -Raw "C:\path\to\downloaded-service-account.json" | npx wrangler secret put FIREBASE_SERVICE_ACCOUNT_JSON
```

The private service-account JSON must never be placed in `wrangler.toml`, the website or GitHub.

## 4. Deploy

```powershell
npx wrangler deploy
```

First open the generated `workers.dev` address and check:

- `/health`
- `/inbox.html`
- `/widget.js`

## 5. Connect the chat subdomain

In Cloudflare, connect the Worker to:

`chat.en-suite.co.uk`

The configuration already expects the owner inbox at:

`https://chat.en-suite.co.uk/inbox.html`

Deploy again after the custom domain is connected:

```powershell
npx wrangler deploy
```

## 6. Install the inbox on Nicholas's Pixel

1. Open `https://chat.en-suite.co.uk/inbox.html` in Chrome.
2. Sign in with `ADMIN_PASSWORD`.
3. Tap **Enable alerts**.
4. Allow notifications.
5. Confirm the automatic test notification arrives.
6. Tap **Install**, or use Chrome's menu and choose **Add to Home screen**.
7. Long-press the app icon or open Android notification settings and set En-Suite Leads notifications to an audible, high-priority sound.

The code requests high urgency, vibration and a persistent notification, but Android controls the final notification sound and volume.

## 7. Add the widget to the website

The embed code is in `site/embed-snippet.html`:

```html
<script
  src="https://chat.en-suite.co.uk/widget.js"
  data-api="https://chat.en-suite.co.uk"
  data-whatsapp="442073860000"
  defer
></script>
```

Add it once immediately before `</body>` on each public page.

`442073860000` is the international format for 0207 386 0000. Confirm that this is the actual WhatsApp Business number before publishing. If WhatsApp uses a different number, replace it with that number in international format without `+`, spaces or brackets.

## 8. Test before removing Tawk.to

Use every item in `TEST-CHECKLIST.txt`. Keep Tawk.to active until alerts have been tested with:

- the Pixel locked;
- Chrome closed;
- the app installed;
- a real customer-style message;
- the 2-minute and 5-minute reminder sequence;
- live takeover and reply.

# Important behaviour

- Merely opening the chat does not alert Nicholas. The alert starts when the visitor sends a real message.
- The first push is immediate.
- Cloudflare's one-minute scheduled check sends the unread reminders at approximately 2 and 5 minutes.
- Opening the conversation marks it read and cancels later reminders.
- The rule-based assistant works without an AI API. AI FAQ answers can be added later, after lead notifications are proven reliable.
- The planner remains untouched and can be connected later.
