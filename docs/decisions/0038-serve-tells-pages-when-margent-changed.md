---
title: serve tells open pages when margent changed on disk
status: accepted
updated: 2026-10-26
---

# 0038 `serve` tells open pages when margent changed on disk

## Context

`margent serve` bundles the renderer and the page runtime into `dist/cli.js` and loads them once at startup. After a rebuild, or after `npm i -g margent`, a server that is already running keeps serving the old code, and nothing says so.

On 2026-10-25 this hid the note line-break fix ([0037](0037-note-line-breaks-as-br.md)). Two servers, started at 16:24 and 17:18, kept showing `<br>` as text and dropped Shift+Enter after the fix was built at 22:14. It looked as if the fix did not work.

## Decision

A running server notices when its own file changes, and says so.

- `margent serve` passes the file it was loaded from (`dist/cli.js`, or the copy in a global install). At startup the server hashes that file with sha256. A read failure is a startup error.
- The server polls the file with `fs.watchFile` once a second. A tick where the file is missing (mid-install) is skipped. The same bytes change nothing, so a touch or an identical rebuild is quiet. Different bytes mark the server outdated, for good.
- When it becomes outdated, the server writes one line to stderr: `margent serve: margent changed on disk since this server started ({self}); restart margent serve to use the new version`. Every open page gets an `outdated` event on its `/_events` stream, and a stream opened later gets it at once.
- The page shows a banner in its existing banner host (`data-kind="outdated"`, `role="status"`): "margent was updated after this server started, so this page shows the old version. Restart margent serve, then reload the page." The banner never clears. A restarted server is a new process, and the next page load comes from it. The page does not reload by itself.

The error page and the `/` index carry no banner. A reload after the restart fixes them, and the terminal line covers the person who runs the server.

## Consequences

- The server never restarts itself. The person who runs it decides when, so a restart cannot drop unsaved edits or change the port or the background job they started.
- The watch costs one `stat` a second per server.
- A rebuild that changes the bytes shows the banner even when the version string stays the same, which is the case that hid the fix.
- `self` is optional, so a test server watches nothing unless the test is about this, and then it points `self` at a temp file it rewrites.

## Alternatives considered

- **Compare the version string.** Rejected: a rebuild in a linked checkout (`npm link`) keeps the same version, which is exactly the case that happened.
- **`fs.watch` on the file.** Rejected: `npm i -g` replaces the whole package folder, so a watch on the old file goes quiet. A stat poll on the path survives the replacement.
- **Restart the server by itself.** Rejected: it would drop open pages' unsaved edits and change the process the user started. Telling is enough.
- **Reload the page into the new version.** Impossible: the running process only has the old code.
