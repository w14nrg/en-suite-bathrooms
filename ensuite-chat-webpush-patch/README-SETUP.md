# En-Suites & Bathrooms live chat — no Firebase

This is the standalone website chat and Nicholas's WhatsApp-style owner inbox. It does not depend on the unfinished planner.

## What it does

- Branded chat on the En-Suites & Bathrooms website.
- Short qualification flow.
- WhatsApp-style owner inbox on Nicholas's Pixel.
- Immediate phone notification on the first customer message.
- Reminder notifications while the enquiry remains unread.
- Tap the notification to open the exact conversation.
- Nicholas can take over the same conversation live.
- Continue-on-WhatsApp button.

## No extra notification account

Phone alerts use standard Web Push directly from the Cloudflare Worker. There is no Firebase project, Pushover account or paid live-chat subscription.

## The files that changed from the earlier upload

Replace these files in GitHub with the versions in this package:

- `worker/src/index.js`
- `worker/public/inbox.html`
- `worker/wrangler.toml`
- `worker/package.json`
- `worker/schema.sql`

Also add:

- `worker/migrate-push-to-webpush.sql`

## Deploy from the worker folder

Open PowerShell in the `worker` folder and run:

```powershell
npm install
npx wrangler login
npx wrangler d1 create ensuite-live-chat-db
```

Copy the returned `database_id` into `worker/wrangler.toml`.

Create the database tables:

```powershell
npx wrangler d1 execute ensuite-live-chat-db --remote --file=./schema.sql
```

Create the private inbox password and session secret:

```powershell
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
```

Generate the two Web Push keys:

```powershell
npx web-push generate-vapid-keys --json
```

Copy the public and private values when prompted by these two commands:

```powershell
npx wrangler secret put VAPID_PUBLIC_KEY
npx wrangler secret put VAPID_PRIVATE_KEY
```

Deploy:

```powershell
npx wrangler deploy
```

Then open the generated Worker address:

- `/health`
- `/inbox.html`

After the Worker works, connect the custom domain `chat.en-suite.co.uk` in Cloudflare.

## Install on Nicholas's Pixel

1. Open `https://chat.en-suite.co.uk/inbox.html` in Chrome.
2. Sign in.
3. Press **Enable alerts**.
4. Allow notifications.
5. Confirm the test notification arrives.
6. Choose **Install** or **Add to Home screen**.
7. In Android notification settings, make En-Suite Leads audible and high priority.

## Add the customer widget

Add this immediately before `</body>` on each public website page:

```html
<script
  src="https://chat.en-suite.co.uk/widget.js"
  data-api="https://chat.en-suite.co.uk"
  data-whatsapp="442073860000"
  defer
></script>
```

Confirm that `442073860000` is the number used by WhatsApp Business before publishing.

Keep Tawk.to active until the new phone notification has been tested with the Pixel locked and Chrome closed.
