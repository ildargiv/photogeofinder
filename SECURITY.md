# Security policy

## Supported versions

Only the [latest release](https://github.com/ildargiv/photogeofinder/releases/latest) receives fixes.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately: the **Security** tab of this repository, then **Report a vulnerability**
(<https://github.com/ildargiv/photogeofinder/security/advisories/new>).

Include the version, the operating system, what you did and what happened. A proof of concept helps, a fix is not required. You can expect a first answer within a week.

## What is in scope

- Anything that makes a photo or its metadata leave the device. The app reads photos locally and never uploads them; only coordinates go to the map, address and Wikipedia services.
- Script injection through photo metadata, file names or responses of those services (the app ships a strict Content Security Policy).
- The update check and the desktop installer.

## Checking a download

Releases are built by GitHub Actions from this repository ([release](.github/workflows/release.yml) and [desktop](.github/workflows/desktop.yml) workflows). Starting with the release after v2.0.0, each release file comes with a `.sha256` file next to it; GitHub also shows a SHA-256 digest next to each release file. The Windows installer is not code-signed, so SmartScreen may warn on first start.
