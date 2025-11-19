const audio = document.getElementById('audioPlayer');
let audioContext;
let source;
let notchFilter;
audio.addEventListener('play', function() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        source = audioContext.createMediaElementSource(audio); // łączymy z Web Audio API
        notchFilter = audioContext.createBiquadFilter();
        notchFilter.type = 'notch'; // Q to szerokość pasma wycięcia
        notchFilter.frequency.value = 10;
        notchFilter.Q.value = 1; // Q to szerokość pasma wycięcia
        source.connect(notchFilter);
        notchFilter.connect(audioContext.destination);
    }
    
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
});

audio.addEventListener('pause', function() {
    if (audioContext && audioContext.state === 'running') {
        audioContext.suspend();
    }
});

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
    const centerFreq = (a + b) / 2;
    notchFilter.frequency.value = centerFreq;
    const bandwidth = Math.abs(b - a);
    notchFilter.Q.value = bandwidth > 0 ? centerFreq / bandwidth : 1;
}