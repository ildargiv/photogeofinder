# Как выложить PhotoGeoFinder на GitHub

## 1. Создать репозиторий
1. На github.com нажмите **New repository**. Имя: `photogeofinder`, видимость **Public**. Галочки README и License не ставьте, они уже есть.
2. Загрузите все файлы этой папки (кнопка **uploading an existing file** или `git push`).

## 2. Описание и теги (раздел About, шестерёнка справа)
**Description:**
> See where any photo was taken. Private photo viewer: EXIF GPS on Google, Yandex and OpenStreetMap, address, time and camera, nearby photos and Wikipedia. Photos never leave your device. 15 languages.

**Website:** `https://ВАШ-ЛОГИН.github.io/photogeofinder/`

**Topics** (20, это максимум):
`photo-viewer` `exif` `exif-viewer` `gps` `geotagging` `geolocation` `photo-location` `pwa` `maps` `openstreetmap` `leaflet` `google-maps` `yandex-maps` `reverse-geocoding` `privacy` `offline-first` `photography` `travel` `metadata` `wikimedia-commons`

**Social preview** (Settings › General): загрузите картинку 1280×640, можно взять баннер с холста бренда.

## 3. Включить сайт и автообновление
Уже настроено: сайт публикуется из ветки `gh-pages`, её обновляет workflow при каждом изменении в `main`. Установленные программы сами предложат «Перезапустить». `config.js` уже указывает на `ildargiv/photogeofinder`, поэтому копии на компьютерах раз в день проверяют новые выпуски.

## 4. Выпуск новой версии
```
python3 tools/bump_version.py 2.1.0
git commit -am "Release 2.1.0"
git tag v2.1.0
git push origin main v2.1.0
```
GitHub сам соберёт `PhotoGeoFinder-v2.1.0.zip` и создаст выпуск (Release). Программа покажет пользователям «Доступна новая версия».

## 5. Чтобы программу находили
- Тема репозитория и описание выше уже содержат то, что ищут люди: «where was this photo taken», «EXIF GPS viewer», «photo location».
- README на 15 языках: GitHub и поисковики индексируют каждый файл.
- Добавьте ссылку на сайт в профиль, расскажите о проекте на Habr, Reddit (r/photography, r/opensource), Product Hunt.
