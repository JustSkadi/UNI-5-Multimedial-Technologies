let encoder = null;
let decoder = null;
let webmMuxer = null;
let mediaStream = null;
let processedFrames = 0;
let recordingActive = false;
let totalEncodedBytes = 0;
let keyframeCounter = 0;
let captureTimer = null;
let encodedPackets = []; 
let cachedDecoderConfig = null;
let timestampMap = new Map(); 

window.recordedVideoBlob = null;

const sourceVideoElement = document.getElementById('video-source');
const outputCanvasElement = document.getElementById('video-output');
const canvasContext = outputCanvasElement.getContext('2d');
const consoleLogElement = document.getElementById('logs');
const codecDropdown = document.getElementById('codec-select');

function addLogEntry(message) {
    const timestamp = new Date().toLocaleTimeString();
    const logText = `[${timestamp}] ${message}`;
    const logLine = document.createElement('div');
    logLine.textContent = logText;
    logLine.style.borderBottom = "1px solid #333";
    logLine.style.padding = "2px 0";
    consoleLogElement.prepend(logLine);
}

const SUPPORTED_CODECS = [
    { label: 'H.264 (AVC) Baseline', codec: 'avc1.42001E' },
    { label: 'H.264 (AVC) High',     codec: 'avc1.640028' },
    { label: 'VP8',                  codec: 'vp8' },
    { label: 'VP9',                  codec: 'vp09.00.10.08' },
    { label: 'H.265 (HEVC)',         codec: 'hev1.1.6.L93.B0' },
    { label: 'AV1',                  codec: 'av01.0.05M.08' }
];

async function detectAvailableCodecs() {
    codecDropdown.innerHTML = '';
    let availableCodecs = 0;

    for (const item of SUPPORTED_CODECS) {
        try {
            const config = {
                codec: item.codec,
                width: 1280, 
                height: 720,
                bitrate: 2_000_000, 
                framerate: 30
            };
            const result = await VideoEncoder.isConfigSupported(config);
            
            if (result.supported) {
                const optionElement = document.createElement('option');
                optionElement.value = item.codec;
                const hwLabel = result.config.hardwareAcceleration === 'no-preference' 
                    ? '' 
                    : ` [${result.config.hardwareAcceleration}]`;
                optionElement.text = `${item.label}${hwLabel}`;
                codecDropdown.appendChild(optionElement);
                availableCodecs++;
            }
        } catch (err) {}
    }
    
    if (availableCodecs === 0) {
        const fallback = document.createElement('option');
        fallback.text = "Brak wsparcia!";
        codecDropdown.appendChild(fallback);
    } else {
        codecDropdown.selectedIndex = 0;
    }
}

detectAvailableCodecs();

document.getElementById('btn-camera').addEventListener('click', async () => {
    try {
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
        }
        
        mediaStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 1280 }, 
                height: { ideal: 720 } 
            } 
        });
        
        sourceVideoElement.srcObject = mediaStream;
        sourceVideoElement.play();
        addLogEntry("Kamera uruchomiona.");
    } catch (error) { 
        addLogEntry("Błąd kamery: " + error.message); 
    }
});

document.getElementById('file-input').addEventListener('change', (event) => {
    const selectedFile = event.target.files[0];
    if (selectedFile) {
        sourceVideoElement.srcObject = null;
        sourceVideoElement.src = URL.createObjectURL(selectedFile);
        sourceVideoElement.loop = true;
        sourceVideoElement.play();
        addLogEntry(`Załadowano plik: ${selectedFile.name}`);
    }
});

document.getElementById('bitrate').addEventListener('input', (e) => {
    document.getElementById('bitrate-val').innerText = e.target.value;
});

document.getElementById('fps').addEventListener('input', (e) => {
    document.getElementById('fps-val').innerText = e.target.value;
});

async function initiateRecording() {
    if (sourceVideoElement.readyState < 2) { 
        addLogEntry("Najpierw uruchom wideo!"); 
        return; 
    }

    clearOutputDisplay();

    const videoWidth = sourceVideoElement.videoWidth;
    const videoHeight = sourceVideoElement.videoHeight;
    const selectedCodec = codecDropdown.value;
    const bitrateValue = parseFloat(document.getElementById('bitrate').value) * 1_000_000;
    const fpsValue = parseInt(document.getElementById('fps').value);

    processedFrames = 0; 
    totalEncodedBytes = 0; 
    keyframeCounter = 0;
    encodedPackets = []; 
    timestampMap.clear();
    refreshStats();

    let webmCodecString = 'V_VP9'; 
    
    if (selectedCodec.includes('avc') || selectedCodec.includes('h264')) {
        webmCodecString = 'V_MPEG4/ISO/AVC';
    } else if (selectedCodec.includes('vp8')) {
        webmCodecString = 'V_VP8';
    } else if (selectedCodec.includes('vp09') || selectedCodec.includes('vp9')) {
        webmCodecString = 'V_VP9';
    } else if (selectedCodec.includes('hev') || selectedCodec.includes('hvc')) {
        webmCodecString = 'V_MPEGH/ISO/HEVC';
    } else if (selectedCodec.includes('av01')) {
        webmCodecString = 'V_AV1';
    }

    try {
        webmMuxer = new WebMMuxer.Muxer({
            target: new WebMMuxer.ArrayBufferTarget(),
            video: { 
                codec: webmCodecString, 
                width: videoWidth, 
                height: videoHeight, 
                frameRate: fpsValue 
            },
            firstTimestampBehavior: 'offset'
        });
    } catch (error) { 
        addLogEntry("Błąd Muxera: " + error); 
        return; 
    }

    const encoderCallbacks = {
        output: processEncodedChunk,
        error: (err) => addLogEntry("Błąd Enkodera: " + err.message)
    };

    const encoderConfiguration = {
        codec: selectedCodec,
        width: videoWidth, 
        height: videoHeight, 
        bitrate: bitrateValue, 
        framerate: fpsValue,
        bitrateMode: 'variable'
    };
    
    if (selectedCodec.includes('avc')) {
        encoderConfiguration.avc = { format: 'annexb' };
    }
    
    cachedDecoderConfig = encoderConfiguration;

    try {
        encoder = new VideoEncoder(encoderCallbacks);
        encoder.configure(encoderConfiguration);
        addLogEntry(`Start enkodera: ${selectedCodec}`);
    } catch (error) { 
        addLogEntry("Błąd konfiguracji Enkodera: " + error); 
        return; 
    }

    recordingActive = true;
    updateButtonStates(true);
    captureFrames(fpsValue);
}

function captureFrames(targetFps) {
    if (captureTimer) {
        clearInterval(captureTimer);
    }
    
    const frameInterval = 1000 / targetFps;

    captureTimer = setInterval(async () => {
        if (!recordingActive || !encoder) return;
        if (encoder.encodeQueueSize > 5) return;

        try {
            const videoFrame = new VideoFrame(sourceVideoElement);
            timestampMap.set(videoFrame.timestamp, performance.now());

            const keyframeInterval = parseInt(document.getElementById('key-interval').value);
            const isKeyframe = (processedFrames % keyframeInterval === 0);
            
            encoder.encode(videoFrame, { keyFrame: isKeyframe });
            videoFrame.close();
            processedFrames++;
        } catch (error) {}
    }, frameInterval);
}

function processEncodedChunk(encodedChunk, metadata) {
    const currentTime = performance.now();
    const frameStartTime = timestampMap.get(encodedChunk.timestamp);
    
    if (frameStartTime) {
        const latency = currentTime - frameStartTime;
        document.getElementById('stat-latency').innerText = latency.toFixed(1);
        timestampMap.delete(encodedChunk.timestamp);
    }

    totalEncodedBytes += encodedChunk.byteLength;
    if (encodedChunk.type === 'key') {
        keyframeCounter++;
    }
    
    refreshStats();

    try { 
        webmMuxer.addVideoChunk(encodedChunk, metadata); 
    } catch (error) {}

    const chunkBuffer = new Uint8Array(encodedChunk.byteLength);
    encodedChunk.copyTo(chunkBuffer);
    
    encodedPackets.push({
        type: encodedChunk.type,
        timestamp: encodedChunk.timestamp,
        duration: encodedChunk.duration,
        data: chunkBuffer
    });
}

function refreshStats() {
    document.getElementById('stat-chunks').innerText = processedFrames;
    document.getElementById('stat-size').innerText = (totalEncodedBytes / 1024 / 1024).toFixed(2);
    document.getElementById('stat-keyframes').innerText = keyframeCounter;
}

async function terminateRecording() {
    if (!recordingActive) return;
    
    recordingActive = false;
    clearInterval(captureTimer);

    if (encoder.state !== 'closed') {
        await encoder.flush();
        encoder.close();
    }

    try {
        webmMuxer.finalize();
        const videoBlob = new Blob([webmMuxer.target.buffer], { type: 'video/webm' });
        window.recordedVideoBlob = videoBlob;
        addLogEntry(`Nagranie gotowe: ${(videoBlob.size/1024/1024).toFixed(2)} MB`);
        
        document.getElementById('btn-play-native').disabled = false;
        document.getElementById('btn-play-decoded').disabled = false;
    } catch (error) { 
        addLogEntry("Błąd zapisu: " + error); 
    }

    updateButtonStates(false);
}

function clearOutputDisplay() {
    outputCanvasElement.style.display = 'block';
    const overlayVideo = document.getElementById('native-player-overlay');
    if (overlayVideo) {
        overlayVideo.remove();
    }
    canvasContext.clearRect(0, 0, outputCanvasElement.width, outputCanvasElement.height);
}

document.getElementById('btn-play-native').addEventListener('click', () => {
    if (!window.recordedVideoBlob) { 
        addLogEntry("Brak pliku!"); 
        return; 
    }
    
    addLogEntry("Tryb: Odtwarzacz Natywny (WebM)");
    
    const parentContainer = outputCanvasElement.parentNode;
    outputCanvasElement.style.display = 'none';
    
    const existingPlayer = document.getElementById('native-player-overlay');
    if (existingPlayer) {
        existingPlayer.remove();
    }

    const playerElement = document.createElement('video');
    playerElement.id = 'native-player-overlay';
    playerElement.src = URL.createObjectURL(window.recordedVideoBlob);
    playerElement.controls = true;
    playerElement.autoplay = true;
    playerElement.muted = true;
    playerElement.loop = true;
    playerElement.style.maxWidth = "100%";
    playerElement.style.maxHeight = "400px";
    playerElement.style.border = "1px solid #333";
    
    parentContainer.appendChild(playerElement);
});

document.getElementById('btn-play-decoded').addEventListener('click', async () => {
    if (encodedPackets.length === 0) { 
        addLogEntry("Bufor pusty!"); 
        return; 
    }
    
    addLogEntry("Tryb: WebCodecs Decoder (Renderowanie na Canvas)");
    clearOutputDisplay();

    const decoderCallbacks = {
        output: (decodedFrame) => {
            outputCanvasElement.width = decodedFrame.displayWidth;
            outputCanvasElement.height = decodedFrame.displayHeight;
            canvasContext.drawImage(decodedFrame, 0, 0);
            decodedFrame.close();
        },
        error: (err) => addLogEntry("Decoder Error: " + err.message)
    };

    decoder = new VideoDecoder(decoderCallbacks);
    decoder.configure(cachedDecoderConfig);

    try {
        for (let packet of encodedPackets) {
            const videoChunk = new EncodedVideoChunk({
                type: packet.type,
                timestamp: packet.timestamp,
                duration: packet.duration,
                data: packet.data
            });
            decoder.decode(videoChunk);
            await new Promise(resolve => setTimeout(resolve, 10));
        }
        await decoder.flush();
        addLogEntry("Dekodowanie zakończone.");
    } catch (error) { 
        addLogEntry("Błąd dekodowania: " + error); 
    }
});

function updateButtonStates(isRecording) {
    document.getElementById('btn-start').disabled = isRecording;
    document.getElementById('btn-stop').disabled = !isRecording;
    document.getElementById('codec-select').disabled = isRecording;
    
    if (isRecording) {
        document.getElementById('btn-play-native').disabled = true;
        document.getElementById('btn-play-decoded').disabled = true;
    }
}

document.getElementById('btn-start').addEventListener('click', initiateRecording);
document.getElementById('btn-stop').addEventListener('click', terminateRecording);