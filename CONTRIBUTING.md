# Contributing

Thanks for helping improve Alma Android. This is an unofficial client, so changes should remain compatible with Alma Desktop without implying upstream affiliation.

## Development setup

Requirements:

- Node.js 22
- JDK 21
- Android SDK with API 36 installed

```sh
git clone https://github.com/lazyeo/alma-android.git
cd alma-android
npm ci
npm run check
npm run android:build
```

Useful commands:

```sh
npm run dev            # local Vite development server
npm run typecheck      # TypeScript
npm run test           # Vitest
npm run format:check   # Prettier check
npm run android:build  # web build, Capacitor sync, debug APK
```

`npm run check` combines type checking, tests, and formatting. It must pass before a pull request is ready for review.

### Optional device and relay checks

`npm run android:run` installs the debug APK with the Android SDK's `adb` and launches it. Set `ANDROID_HOME` when the SDK is outside the default macOS location. If more than one device is connected, set `ANDROID_SERIAL` to the target shown by `adb devices`.

`npm run smoke` exercises the relay against an already running, paired Alma Desktop on the same machine. It reads the active relay URL and connect code at runtime from the desktop's loopback settings endpoint (`http://127.0.0.1:23001/api/settings`); it does not use or create a pairing file, and pairing links or codes must never be stored in the repository or pasted into logs.

## Development rules

### Test logic first

For logic in `src/screens/*.ts`, write or update the focused Vitest test first, run it to confirm the expected failure, then implement the smallest change that passes. Keep rendering details in components and reusable state or protocol logic in testable modules.

### Internationalization

Every user-visible string must exist in both the English and Simplified Chinese catalogs under `src/i18n/en/` and `src/i18n/zh/`. Do not hard-code UI copy in a component. The catalog parity/guard tests are part of `npm run check`.

### Design language

Follow [docs/design-language.md](docs/design-language.md). In short:

- use the existing semantic theme tokens and shared primitives;
- keep the interface quiet, content-first, and touch-friendly;
- use Lucide icons and established haptic helpers;
- preserve safe areas, inner scrolling, reduced motion, and overlay/back behavior;
- avoid literal colors, decorative gradients, duplicate status text, and one-off settings rows or sheets.

UI changes should include before/after screenshots or a short recording in the pull request.

### Security and privacy

Never commit or paste pairing links, connect codes, registration keys, tokens, private desktop content, signing files, or signing passwords. Synthetic fixtures are preferred for tests and screenshots. Read [SECURITY.md](SECURITY.md) before reporting a vulnerability.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` user-facing capability
- `fix:` bug fix
- `docs:` documentation only
- `test:` tests or fixtures
- `refactor:` behavior-preserving restructuring
- `chore:` tooling, dependency, or release maintenance

Keep commits focused and write the subject in the imperative mood, for example:

```text
fix: preserve queued messages after reconnect
```

## Pull request checklist

- [ ] The change is focused and described clearly.
- [ ] Tests were added first for new or changed logic in `src/screens/*.ts`.
- [ ] `npm run check` passes locally.
- [ ] Every user-visible string exists in both English and Simplified Chinese catalogs.
- [ ] UI changes follow `docs/design-language.md` and include screenshots.
- [ ] No pairing links, tokens, private content, credentials, or signing material are included.
- [ ] Documentation and the changelog are updated when behavior changes.

## Releases

Maintainers prepare releases locally with `scripts/release.mjs`; CI validates tags but does not sign or publish APKs. See [docs/releasing.md](docs/releasing.md) for the SemVer policy, signing requirements, and complete checklist.
