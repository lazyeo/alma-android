# Releasing Alma Android

Releases are prepared, signed, and published locally by a maintainer. GitHub Actions validates tags but never receives the Android signing key and never publishes a release.

## Version policy

This project follows Semantic Versioning:

- **Major** (`X.0.0`): an intentionally incompatible change for users, pairing/storage migration that cannot be handled automatically, or a reset of a previously stable public contract.
- **Minor** (`0.X.0` or `X.Y.0`): a backward-compatible user-facing feature, major new screen, supported protocol capability, or substantial platform behavior.
- **Patch** (`X.Y.Z`): a backward-compatible bug fix, compatibility adjustment, security fix, documentation correction shipped with an app build, or small polish change.

Before 1.0, minor versions may still contain meaningful product changes, but maintainers should avoid breaking upgrades whenever practical.

Android `versionCode` is derived from the SemVer components:

```text
versionCode = major * 10000 + minor * 100 + patch
```

Each component must keep the result increasing. The release version is also shown in Settings › About and embedded in the generated `alma-build` metadata as `<version> <sha>`.

## Changelog and commits

Use Conventional Commits during development (`feat:`, `fix:`, `docs:`, `chore:`, and related types). Keep user-visible changes under `CHANGELOG.md` → `[Unreleased]` as they land.

The release helper moves the current `[Unreleased]` entries into a dated version section. Review the result: commit prefixes help categorize changes, but the changelog should describe user impact rather than repeat commit subjects mechanically.

## Signing key custody

The maintainer stores the Android keystore outside this repository and outside ordinary build artifacts. Keep an encrypted backup and a separate record of its alias and recovery procedure.

Required environment variables:

```text
ALMA_RELEASE_STORE_FILE
ALMA_RELEASE_STORE_PASSWORD
ALMA_RELEASE_KEY_ALIAS
ALMA_RELEASE_KEY_PASSWORD
```

Never commit the keystore or expose these values in shell history, logs, CI, issues, or pull requests.

Android updates must be signed by the same key. If the key is lost, existing users cannot install an update over the current app; they must uninstall it first, which removes local app data and pairings.

## Prepare a version

From a clean `main` branch:

```sh
node scripts/release.mjs <version> --dry-run
node scripts/release.mjs <version>
```

The helper verifies the branch and clean tree, validates SemVer, updates `package.json` and the root lockfile version fields, updates `CHANGELOG.md`, creates commit `chore(release): vX.Y.Z`, and creates annotated tag `vX.Y.Z`.

It never pushes. Inspect the commit and tag, then push explicitly:

```sh
git push --follow-tags origin main
```

The tag workflow checks that the tag matches `package.json` and that the changelog contains the version section. Wait for that workflow to pass.

## Build and draft the GitHub release

Export the four signing variables, ensure `gh auth status` succeeds, and run:

```sh
node scripts/release.mjs publish --dry-run
node scripts/release.mjs publish
```

Publishing performs the following locally:

1. verifies the current commit is tagged with `v<package version>`;
2. runs `npm run check`;
3. runs `npm run android:release`;
4. finds the release APK and verifies its signature with `apksigner`;
5. copies it to `alma-android-vX.Y.Z.apk`;
6. writes `alma-android-vX.Y.Z.apk.sha256`;
7. extracts the matching changelog section as release notes;
8. creates a **draft** GitHub release with the APK and checksum attached.

Review the draft on GitHub before publishing it.

## Release checklist

### Before versioning

- [ ] The intended version follows the policy above.
- [ ] `CHANGELOG.md` describes all user-visible changes under `[Unreleased]`.
- [ ] English and Simplified Chinese UI strings are complete.
- [ ] Documentation and screenshots match the release.
- [ ] `npm run check` passes.
- [ ] A debug or locally signed release build has been tested on an appropriate Android device.
- [ ] No pairing links, tokens, private content, signing files, or credentials are present.

### Before publishing

- [ ] The release commit and annotated tag are correct.
- [ ] The tag validation workflow passes.
- [ ] The keystore and four signing variables refer to the production key.
- [ ] `apksigner verify --verbose --print-certs` succeeds.
- [ ] The APK filename and checksum contain the expected version.
- [ ] `shasum -a 256 -c alma-android-vX.Y.Z.apk.sha256` succeeds.
- [ ] Settings › About shows the expected version.
- [ ] The draft release notes match the changelog.
- [ ] The APK installs as an update over the previous public release.

### After publishing

- [ ] Download the public APK and checksum and verify them again.
- [ ] Confirm the Releases page presents the APK, checksum, and notes.
- [ ] Announce only the final release URL; never distribute the signing key or pairing credentials.
