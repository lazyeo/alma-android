# Shared message UI

`src/messages` is the pure presentation layer for thread messages: the message shell, part dispatch, tool cards, reasoning, attachments, and end-resource cards. `ThreadScreen` remains the host layer and supplies app-specific behavior such as relay image loading, file/reference links, nested runs, long-press actions, usage metadata, and opening files or websites.

Capabilities are passed via props or render slots. Absent capability = hidden output; shared components contain no host checks.

To add a part type:

1. Extend the shared `MessagePart` shape in `src/screens/messageParts.ts` only if new fields need typing.
2. Add the presentation branch/component in `PartView`.
3. Pass any host-only operation as an optional capability prop; never import thread, routing, connection, or relay host state into this directory.
4. Add focused tests and keep `imports.test.ts` green.
