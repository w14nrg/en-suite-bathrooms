import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const siteCss = await readFile(new URL('../assets/css/site.css', import.meta.url), 'utf8');
const publicChatWidget = await readFile(new URL('../assets/js/ensuite-chat-widget.js', import.meta.url), 'utf8');
const fixedEntry = await readFile(new URL('../ensuite-chat-webpush-patch/worker/src/fixed-entry.js', import.meta.url), 'utf8');
const reliabilityEntry = await readFile(new URL('../ensuite-chat-webpush-patch/worker/src/reliability-entry.js', import.meta.url), 'utf8');
const diagnosticsEntry = await readFile(new URL('../ensuite-chat-webpush-patch/worker/src/diagnostics-entry.js', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../ensuite-chat-webpush-patch/worker/wrangler.toml', import.meta.url), 'utf8');

test('public widget triggers one first-party visitor alert on page load', () => {
  assert.match(publicChatWidget, /void notifyOwnerOfVisit\(\);/);
  assert.equal((publicChatWidget.match(/void notifyOwnerOfVisit\(\);/g) || []).length, 1);
  assert.doesNotMatch(publicChatWidget, /tawk/i);
});

test('mobile chat stays above the fixed call and WhatsApp bar', () => {
  assert.match(publicChatWidget, /@media\(max-width:520px\)\{\.eb-chat-launch\{right:12px;bottom:72px\}/);
  assert.match(publicChatWidget, /\.eb-chat-panel\{right:6px;bottom:72px;/);
  assert.doesNotMatch(publicChatWidget, /\.eb-chat-launch\{right:12px;bottom:12px\}/);
});

test('live chat messages are forced back into a vertical stack', () => {
  assert.match(siteCss, /\.eb-chat-messages\.eb-chat-live-area\.active\{display:block!important;/);
  assert.match(fixedEntry, /ENSUITE_CHAT_VERTICAL_FIX_20260807/);
  assert.match(fixedEntry, /display:block!important;flex:1!important;overflow-y:auto!important/);
});

test('owner inbox repairs stale web-push subscriptions on load', () => {
  assert.match(fixedEntry, /registration\.pushManager\.getSubscription\(\)/);
  assert.match(fixedEntry, /registration\.pushManager\.subscribe/);
  assert.match(fixedEntry, /\/api\/admin\/push-devices/);
  assert.match(fixedEntry, /\/api\/admin\/push-test/);
  assert.match(fixedEntry, /applicationServerKey/);
});

test('reliability layer validates each bot step instead of accepting greetings as answers', () => {
  assert.match(reliabilityEntry, /validationError\(step, body\)/);
  assert.match(reliabilityEntry, /Please enter your first name rather than a greeting/);
  assert.match(reliabilityEntry, /Please enter the property postcode or area/);
  assert.match(reliabilityEntry, /Please enter a valid mobile number or email address/);
  assert.match(reliabilityEntry, /rejects_hi_as_contact/);
});

test('reliability layer rotates push subscriptions and records browser delivery receipts', () => {
  assert.match(reliabilityEntry, /subscription\.unsubscribe/);
  assert.match(reliabilityEntry, /push-repair-v2\.js/);
  assert.match(reliabilityEntry, /\/api\/push-receipt/);
  assert.match(reliabilityEntry, /\/api\/admin\/push-diagnostics/);
  assert.match(reliabilityEntry, /last_receipt_at/);
  assert.match(diagnosticsEntry, /push-receipt-status\.json/);
  assert.match(diagnosticsEntry, /push_receipts/);
});

test('production worker deploy points at the diagnostics-wrapped hardened entry file', () => {
  assert.match(wrangler, /name = "en-suite-bathrooms"/);
  assert.match(wrangler, /main = "src\/diagnostics-entry\.js"/);
  assert.doesNotMatch(wrangler, /PASTE_D1_DATABASE_ID_HERE/);
});
