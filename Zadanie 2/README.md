# Instrukcja uruchomienia i testów
## Pliki projektowe
- app.js: główna logika kodowania WebCodecs i segmentacji
- index.html: interface
- styles.css: styl strony
- server.js: serwer lokalny Node.js

## Wymagania
- Node.js zainstalowany w systemie
- Przeglądarka wspierająca WebCodecs API (np. Chrome, Edge)

## Uruchomienie projektu
1. Umieść wszystkie pliki w jednym folderze
2. Otwórz terminal w tym folderze
3. Uruchom serwer komendą: node server.js
4. Otwórz w przeglądarce adres: http://localhost:8080

- lub otworzyć plik index.html przy pomocy LiveServer

## Instrukcja przeprowadzania testów
1. Wybierz źródło wideo (kamera lub plik lokalny)
2. Wybierz kodek (np. H.264 Main)
3. Kliknij "URUCHOM KODOWANIE"
4. W trakcie pracy zmieniaj parametry suwakami (Bitrate, FPS)
5. Kliknij "ZASTOSUJ ZMIANY", aby zaktualizować konfigurację enkodera w locie
6. Obserwuj wpływ zmian na wykresach opóźnienia i rozmiaru segmentów

## Generowanie testowego pliku wideo
Jeśli chcesz przetestować plik lokalny zamiast kamery, możesz go wygenerować komendą:
ffmpeg -f lavfi -i testsrc=duration=60:size=1280x720:rate=30 test_video.mp4