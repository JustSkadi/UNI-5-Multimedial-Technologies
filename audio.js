const audio = document.getElementById('audioPlayer');
let audioContext, source, analyserSpectrum, splitter, leftAnalyser, rightAnalyser;
const spectrumCanvas = document.getElementById('spectrumCanvas');
const oscilloscopeCanvas = document.getElementById('oscilloscopeCanvas');
const spectrumCtx = spectrumCanvas.getContext('2d');
const oscilloscopeCtx = oscilloscopeCanvas.getContext('2d');

function setupCanvas() {
    spectrumCanvas.width = spectrumCanvas.offsetWidth;
    spectrumCanvas.height = 300;
    oscilloscopeCanvas.width = oscilloscopeCanvas.offsetWidth;
    oscilloscopeCanvas.height = 400;
}

setupCanvas();
window.addEventListener('resize', setupCanvas);

let maxAmplitudes = null;
let leftChannelEnabled = true;
let rightChannelEnabled = true;

drawSpectrum();
drawOscilloscope();

document.getElementById('leftChannelToggle').addEventListener('change', (e) => {
    leftChannelEnabled = e.target.checked;
});

document.getElementById('rightChannelToggle').addEventListener('change', (e) => {
    rightChannelEnabled = e.target.checked;
});

audio.addEventListener('play', function() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        source = audioContext.createMediaElementSource(audio);

        analyserSpectrum = audioContext.createAnalyser();
        analyserSpectrum.fftSize = 2048;
        analyserSpectrum.smoothingTimeConstant = 0.8;
        splitter = audioContext.createChannelSplitter(2);
        leftAnalyser = audioContext.createAnalyser();
        leftAnalyser.fftSize = 2048;
        leftAnalyser.smoothingTimeConstant = 0.3;
        rightAnalyser = audioContext.createAnalyser();
        rightAnalyser.fftSize = 2048;
        rightAnalyser.smoothingTimeConstant = 0.3;
        source.connect(analyserSpectrum);
        source.connect(splitter);
        splitter.connect(leftAnalyser, 0);
        splitter.connect(rightAnalyser, 1);
        
        analyserSpectrum.connect(audioContext.destination);
        maxAmplitudes = new Array(analyserSpectrum.frequencyBinCount).fill(0);
    }
}, { once: true });

function drawSpectrum() {
    requestAnimationFrame(drawSpectrum);
    if (!analyserSpectrum) {
        spectrumCtx.fillStyle = 'rgb(0, 0, 0)';
        spectrumCtx.fillRect(0, 0, spectrumCanvas.width, spectrumCanvas.height);
        return;
    }
    const bufferLength = analyserSpectrum.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserSpectrum.getByteFrequencyData(dataArray);

    const WIDTH = spectrumCanvas.width;
    const HEIGHT = spectrumCanvas.height;
    spectrumCtx.fillStyle = 'rgb(0, 0, 0)';
    spectrumCtx.fillRect(0, 0, WIDTH, HEIGHT);
    const numBars = Math.min(bufferLength, 200);
    const barWidth = WIDTH / numBars;
    for (let i = 0; i < numBars; i++) {
        const amplitude = dataArray[Math.floor(i * bufferLength / numBars)];
        if (amplitude > maxAmplitudes[i]) maxAmplitudes[i] = amplitude;
        const barHeight = (amplitude / 255) * HEIGHT;
        const maxBarHeight = (maxAmplitudes[i] / 255) * HEIGHT;
        spectrumCtx.fillStyle = `hsl(${120 - (amplitude / 255) * 120}, 100%, 50%)`;
        spectrumCtx.fillRect(i * barWidth, HEIGHT - barHeight, barWidth - 1, barHeight);
        spectrumCtx.fillStyle = 'rgba(255, 140, 0, 0.8)';
        spectrumCtx.fillRect(i * barWidth, HEIGHT - maxBarHeight - 2, barWidth - 1, 3);
    }
    for (let i = 0; i < maxAmplitudes.length; i++) {
        if (maxAmplitudes[i] > 0) maxAmplitudes[i] -= 0.5;
    }
}

function drawOscilloscope() {
    requestAnimationFrame(drawOscilloscope);
    const WIDTH = oscilloscopeCanvas.width;
    const HEIGHT = oscilloscopeCanvas.height;
    oscilloscopeCtx.fillStyle = 'rgb(0, 0, 0)';
    oscilloscopeCtx.fillRect(0, 0, WIDTH, HEIGHT);
    if (!leftAnalyser || !rightAnalyser) return;
    oscilloscopeCtx.strokeStyle = 'rgba(100, 100, 100, 0.5)';
    oscilloscopeCtx.lineWidth = 1;
    oscilloscopeCtx.beginPath();
    oscilloscopeCtx.moveTo(0, HEIGHT / 2);
    oscilloscopeCtx.lineTo(WIDTH, HEIGHT / 2);
    oscilloscopeCtx.stroke();
    if (leftChannelEnabled) {
        const dataArray = new Uint8Array(leftAnalyser.fftSize);
        leftAnalyser.getByteTimeDomainData(dataArray);

        oscilloscopeCtx.lineWidth = 2;
        oscilloscopeCtx.strokeStyle = 'rgb(77, 171, 247)';
        oscilloscopeCtx.beginPath();
        const sliceWidth = WIDTH / leftAnalyser.fftSize;
        for (let i = 0; i < leftAnalyser.fftSize; i++) {
            const y = (dataArray[i] / 128.0 - 1) * HEIGHT / 4 + HEIGHT / 4;
            i === 0 ? oscilloscopeCtx.moveTo(0, y) : oscilloscopeCtx.lineTo(i * sliceWidth, y);
        }
        oscilloscopeCtx.stroke();
    }
    if (rightChannelEnabled) {
        const dataArray = new Uint8Array(rightAnalyser.fftSize);
        rightAnalyser.getByteTimeDomainData(dataArray);

        oscilloscopeCtx.lineWidth = 2;
        oscilloscopeCtx.strokeStyle = 'rgb(255, 107, 107)';
        oscilloscopeCtx.beginPath();
        const sliceWidth = WIDTH / rightAnalyser.fftSize;
        for (let i = 0; i < rightAnalyser.fftSize; i++) {
            const y = (dataArray[i] / 128.0 - 1) * HEIGHT / 4 + 3 * HEIGHT / 4;
            i === 0 ? oscilloscopeCtx.moveTo(0, y) : oscilloscopeCtx.lineTo(i * sliceWidth, y);
        }
        oscilloscopeCtx.stroke();
    }
    oscilloscopeCtx.fillStyle = 'rgba(77, 171, 247, 0.8)';
    oscilloscopeCtx.font = '14px Arial';
    oscilloscopeCtx.fillText('LEFT', 10, 20);
    oscilloscopeCtx.fillStyle = 'rgba(255, 107, 107, 0.8)';
    oscilloscopeCtx.fillText('RIGHT', 10, HEIGHT / 2 + 20);
}