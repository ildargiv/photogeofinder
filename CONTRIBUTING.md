# Contributing

Bug reports, ideas and pull requests are welcome.

## Reporting a problem

Open an [issue](https://github.com/ildargiv/photogeofinder/issues) with the app version, the browser or desktop build, and the steps that lead to the problem. If a photo is needed to reproduce it, remember that it carries its GPS position. Security problems go through [SECURITY.md](SECURITY.md).

## Running locally

No build step: the app is plain HTML and JavaScript. Start `start-windows.bat` or `start-mac-linux.command`, or serve the folder with any static web server and open `index.html`.

## Pull requests

- One change per pull request; say in which browsers you checked it.
- Photos must stay on the device: do not add requests that send a photo or its file name anywhere. New network hosts have to be added to the Content Security Policy in `index.html` and explained in the pull request.
- Interface strings live in `i18n.js`; a new string needs at least English and Russian.

## Releasing (maintainer)

```
python3 tools/bump_version.py 2.1.0
git commit -am "Release 2.1.0"
git tag v2.1.0
git push origin main v2.1.0
```

GitHub builds `PhotoGeoFinder-v2.1.0.zip` and the Windows installer and publishes the release; installed copies then offer the update. The site is published from `main` by the pages workflow. Add the changes to [CHANGELOG.md](CHANGELOG.md) before tagging.

Contributions are accepted under the [MIT licence](LICENSE) of the project.
