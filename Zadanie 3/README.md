## Pliki projektowe
- **app.js**: główna logika kodowania WebCodecs z dekoderem i buforem
- **app_webM.js**: alternatywna wersja z muxerem WebM
- **index.html**: interfejs użytkownika
- **styles.css**: stylizacja strony
- **server.js**: serwer lokalny Node.js
- **package.json**: konfiguracja projektu npm

## Wymagania
- Node.js (wersja 14 lub nowsza)
- Przeglądarka wspierająca WebCodecs API (Chrome 94+, Edge 94+)

## Uruchomienie projektu
1. Umieść wszystkie pliki w jednym folderze
2. Otwórz terminal w tym folderze
3. Uruchom serwer komendą: `node server.js`
4. Otwórz w przeglądarce adres: http://localhost:8080

- Lub otwórz plik `index.html` przy pomocy LiveServer

## Instrukcja przeprowadzania testów

### Kodowanie z kamery
1. Kliknij przycisk "Włącz Kamerę"
2. Wybierz kodek z listy dostępnych (np. H.264 High, VP9)
3. Ustaw parametry (Bitrate: 2-8 Mbps, FPS: 30, Interwał klatek: 30)
4. Kliknij "Rozpocznij"

### Lub Kodowanie z pliku
1. Kliknij "Choose File" i wybierz plik wideo
2. Wykonaj kroki 2-5 z Testu 1

### Dalej:
1. Podczas kodowania zmień wartość Bitrate suwakiem
2. Kliknij "Zastosuj zmiany"
3. Obserwuj wpływ zmian na statystyki
Po zatrzymaniu nagrania:
1. Kliknij "Video Player" - odtworzenie natywne (WebM)
2. Lub kliknij "Canvas Preview" - dekodowanie przez WebCodecs

## Generowanie testowego pliku wideo
```bash
ffmpeg -f lavfi -i testsrc=duration=60:size=1280x720:rate=30 test_video.mp4
```

```bash
ffmpeg -f lavfi -i testsrc=duration=30:size=1920x1080:rate=60 -pix_fmt yuv420p test_hd.mp4
```