# Finn Lens — beta 0.9.1

**Finn Lens** is a browser extension that helps someone choose between FINN car
subscriptions by chatting with it on finn.com. It asks what the car has to do
for them, judges the cars on the page against that, puts its verdict on each
car's card, and explains its pick.

It's **unofficial**: an independent project, not made by or with FINN. This is
a beta, and this build is for its first outside review.

## Install it (Chrome on a computer, about two minutes)

1. Download [`finn-lens-0.9.1-chrome.zip`](https://github.com/orjwan-alrajaby/finn-lens/raw/main/releases/finn-lens-0.9.1-chrome.zip) and unzip it. You get
   a folder holding `manifest.json`.
2. Open `chrome://extensions` and switch on **Developer mode** (top right).
3. Click **Load unpacked** and choose that folder. Keep the folder where it
   is: Chrome loads Lens from it each time.
4. Lens opens finn.com in a new tab, and its chat opens by itself. If it
   doesn't, click the **Lens** bubble in the bottom-right corner.

It runs only on `www.finn.com`. Tabs that were already open need a reload.
Lens isn't on the Chrome Web Store, so Chrome may warn about extensions in
developer mode; that's expected for a build loaded directly.

## Try it (five minutes)

1. On a car listing — apply any filters you like — answer the chat's
   questions. The **i** beside an answer says what it means and what Lens
   checks for it.
2. Read **"Here's what you told me, and what I understood"**. "This doesn't
   look right" opens a panel to correct it.
3. After the judgement, every car on the page wears a chip. Click one for how
   that car fits; click the gold one for why it won. Every car that wasn't
   ruled out can be saved as a PDF from its drawer.
4. Try a limit nothing fits — a very low budget, or a long rental — and see
   how Lens says so.

## Read more

The **beta guide** explains how Lens decides, how to read its results, and
this beta's known limits in full. Open it from the Lens icon in Chrome's
toolbar (under the puzzle piece, if it isn't pinned). In Lens's Settings it
sits beside a **Product demo**, a reader's journey in screenshots, and the
**Documentation**, which includes [how Lens decides](HOW-FINN-LENS-DECIDES.md):
every mechanism, number and source. All three are also published at
[orjwan-alrajaby.github.io/finn-lens](https://orjwan-alrajaby.github.io/finn-lens/).

## Data and privacy

- Everything Lens keeps — chats, saved answers, the cars it has read — stays
  in the browser, up to the 40 most recent chats. Settings shows all of it and
  deletes any of it, and uninstalling Lens removes it.
- There's no account and no Lens server. Its only requests are to finn.com —
  for FINN's own API, for cars on the page it hasn't seen yet — and for the
  car photos FINN's data links to.
- No AI model is involved. Typed words are read by fixed keyword rules.

## Feedback and bug reports

Found a bug, a result that looks wrong, something confusing, or an idea for
improvement? Send it to the person who gave you this beta.

Your chats stay on your computer, so whoever reads your report can only check
Lens by doing what you did, step by step. The beta guide's
[Feedback and bug reports](https://orjwan-alrajaby.github.io/finn-lens/#guide-feedback)
lists what to include.
