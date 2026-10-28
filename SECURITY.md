# Security Policy

## Supported versions

Only the latest published release receives security fixes. Upgrade before reporting a problem that may already be resolved.

## Pairing links are secrets

An Alma Desktop remote-access pairing link grants full access to that desktop through the client. Treat the complete link, connect code, relay URL parameters, and any derived credentials like a password.

Never paste a pairing link or token into:

- a public GitHub issue or pull request;
- screenshots or screen recordings;
- logs, crash reports, test fixtures, or terminal output;
- chat rooms or other public support channels.

Before sharing diagnostics, remove pairing links, tokens, private thread content, file paths, and other personal data. If a pairing link may have leaked, replace or revoke it in Alma Desktop before doing anything else.

## Reporting a vulnerability

Please do not open a public issue for a suspected vulnerability.

Use GitHub's private vulnerability reporting for this repository:

<https://github.com/lazyeo/alma-android/security/advisories/new>

Include:

- the affected app version from Settings › About;
- the Android and Alma Desktop versions;
- a concise impact description and reproduction steps;
- whether the issue requires a valid pairing;
- sanitized logs or a minimal proof of concept, with all secrets removed.

You should receive an acknowledgement within seven days. Please allow time to investigate and prepare a coordinated fix before publishing details.
