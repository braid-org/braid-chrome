# Braid-Chrome

Chrome Extension adding Braid-HTTP directly into your browser.

Features:
- Live-updates any Braid-HTTP page, without the reload button
  - Sends `Subscribe: true` for pages with content-type of text, markdown, javascript, or json, as well as html pages that send a `Subscribed: false` header
  - If response has `Subscribe: true`, the page live-updates as updates occur to it
- Collaborative editing for text, markdown, javascript, and json URLs
  - Supports diamond-types merge-type
  - Supports [simpleton](https://braid.org/meeting-76/simpleton-demo) too
- Braid developer tools:
  - Watch the network messages
  - View and navigate version history
  - Edit the current page

See the release [Demo Video](https://braid.org/video/https://invisiblecollege.s3.us-west-1.amazonaws.com/braid-meeting-75.mp4#1479) from [Braid Meeting 75](https://braid.org/meeting-75).

## Installation

1. `git clone https://github.com/braid-org/braid-chrome.git`

### Chrome

2. Open chrome://extensions in chrome
3. Click "Load unpacked"
4. Choose the `braid-chrome` directory you just created

### Firefox

2. Open about:debugging#/runtime/this-firefox in firefox
3. Click "Load Temporary Add-on…"
4. Choose the `manifest.json` inside the `braid-chrome` directory

Firefox forgets a temporary add-on when it quits, so this is once per session.
There is a "Reload" button beside it for after you edit the source.

Firefox needs version 140 or newer, and it hands out host permissions only when
asked: click the extensions button in the toolbar, pick Braid, and allow it on
the site you are visiting, or the page will simply load as it normally would.

Firefox also renders `application/json` with a viewer of its own, which builds
itself after we have taken the page over and puts its own view back. To edit
json resources, set `devtools.jsonview.enabled` to false in about:config.

Try it out at https://dt.braid.org/foo.txt.  You probably have to click the
extension and make sure it has permissions to load on dt.braid.org.
