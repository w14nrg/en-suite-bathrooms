EN-SUITE WEBSITE VISITOR PING UPDATE

This is the complete latest live-chat update, including:
- first-name capture
- "Chat to a human live now" wording
- live takeover wording
- website visitor phone notification

Visitor alert behaviour:
- waits 5 seconds so instant bounces and many bots do not trigger it
- alerts Nicholas once per visitor/browser every 30 minutes
- includes the page being viewed and, where available, the source such as Google
- does not create a fake chat or clutter the enquiry inbox
- a separate named alert is still sent when the visitor starts chatting

Replace these files in GitHub under ensuite-chat-webpush-patch/worker:
- src/index.js
- public/widget.js
- public/inbox.html

No database change or new Cloudflare secret is required.
