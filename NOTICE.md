# Notice

Alma Mobile is an unofficial, community-built client for
[Alma](https://github.com/yetone/alma-releases). It is not made or endorsed by
the Alma team.

## Alma mascot artwork

The Alma character artwork (the face image, its eye layers and `rig.json`)
is © yetone / Alma. It is **not** covered by this repository's MIT licence and
is not stored in this repository.

At build time, `scripts/prepare-mascot.mjs` downloads the official Alma
Android release (`Alma-1.92.apk` from
[yetone/alma-releases `android-v1.92`](https://github.com/yetone/alma-releases/releases/tag/android-v1.92)),
checks its SHA-256, and unpacks the artwork into `public/alma-mascot/`
(gitignored), from where it is bundled into the APK. The glasses Alma wears in
this app are an original vector drawing from this repository and are MIT
licensed.

Builds made with `ALMA_MASCOT=skip` contain none of this artwork and show a
built-in vector face instead.

Other third-party material is listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and the README's
"Third-party assets" section.
