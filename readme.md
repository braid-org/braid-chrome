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
2. Open chrome://extensions in chrome
3. Click "Load unpacked"
4. Choose the `braid-chrome` directory you just created

Try it out at https://dt.braid.org/foo.txt.  You probably have to click the
extension and make sure it has permissions to load on dt.braid.org.
