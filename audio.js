const audio = document.getElementById('audioPlayer');
let audioContext;
let source;
let notchFilter;
audio.addEventListener('play', function() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        source = audioContext.createMediaElementSource(audio); // łączymy z Web Audio API
        notchFilter = audioContext.createBiquadFilter();
        notchFilter.type = 'notch'; // wycinamy wąskie pasmo częstotliwości - notch
        notchFilter.frequency.value = 10;
        notchFilter.Q.value = 1; // Q to szerokość pasma wycięcia
        source.connect(notchFilter);
        notchFilter.connect(audioContext.destination);
    }
}, { once: true });

document.getElementById('speedSlider').addEventListener('input', function(e) {
    const value = parseFloat(e.target.value);
    audio.playbackRate = value;
    document.getElementById('speedValue').textContent = (value * 100).toFixed(0) + '%';
});
document.getElementById('pitchSlider').addEventListener('input', function(e) {
    const value = parseFloat(e.target.value);
    audio.playbackRate = value;
    document.getElementById('pitchValue').textContent = (value * 100).toFixed(0) + '%';
});

// speed i pitch działają tak samo lol

document.getElementById('freqASlider').addEventListener('input', function(e) {
    updateFilter();
    document.getElementById('freqAValue').textContent = e.target.value;
});
document.getElementById('freqBSlider').addEventListener('input', function(e) {
    updateFilter();
    document.getElementById('freqBValue').textContent = e.target.value;
});

function updateFilter() {
    if (!notchFilter) return;
    const a = parseFloat(document.getElementById('freqASlider').value);
    const b = parseFloat(document.getElementById('freqBSlider').value);
    notchFilter.frequency.value = (a + b) / 2; // częstotliwość środkowa
    const bandwidth = Math.abs(b - a); // szerokość pasma
    notchFilter.Q.value = bandwidth > 0 ? 1000 / bandwidth : 1; // jakość + żeby nie dzieliło przez 0
}