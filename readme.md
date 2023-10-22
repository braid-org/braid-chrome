# Braid-Chrome

Chrome Extension adding Braid directly into your browser.

Features:
- Live-updates any Braid page, without the reload button
  - `Subscribe: true` to GET requests when your browser loads a page
  - the page live as updates occur to it
- Collaborative editing for text, markdown, javascript, and json URLs
  - Supports diamond-types merge-type
- Braid developer tools:
  - Watch the network messages
  - View and navigate version history
  - Edit the current page

## Installation

1. `git clone https://github.com/braid-org/braid-chrome.git`
2. Open chrome://extensions in chrome
3. Click "Load unpacked"
4. Choose the `braid-chrome` directory you just created

Try it out at https://dt.braid.org/foo.txt.  You probably have to click the
extension and make sure it has permissions to load on dt.braid.org.