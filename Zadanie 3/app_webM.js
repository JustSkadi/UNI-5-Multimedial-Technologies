let videoEncoderInstance = null;
let muxerInstance = null;
let cameraStream = null;
let encodedFrameCount = 0;
let isCurrentlyRecording = false;
let accumulatedSize = 0;
let keyFramesEncoded = 0;
let frameProcessingTimer = null;

window.recordedVideoBlob = null;

const inputVideo = document.getElementById('video-source');
const previewCanvas = document.getElementById('video-output');
const ctx = previewCanvas.getContext('2d');
const logsContainer = document.getElementById('logs');
const codecSelector = document.getElementById('codec-select');

function writeLog(text) {
    const now = new Date().toLocaleTimeString();
    const logEntry = `[${now}] ${text}`;
    
    const logDiv = document.createElement('div');
    logDiv.textContent = logEntry;
    logDiv.style.borderBottom = "1px solid #333";
    logDiv.style.padding = "2px 0";
    logsContainer.prepend(logDiv);
}

const AVAILABLE_CODECS = [
    { label: 'H.264 (AVC) Baseline', value: 'avc1.42001E' }, 
    { label: 'H.264 (AVC) High',     value: 'avc1.640028' }, 
    { label: 'VP8',                  value: 'vp8' },          
    { label: 'VP9',                  value: 'vp09.00.10.08' },
    { label: 'H.265 (HEVC)',         value: 'hev1.1.6.L93.B0' },
    { label: 'AV1',                  value: 'av01.0.05M.08' }  
];

async function checkCodecSupport() {
    codecSelector.innerHTML = '<option disabled selected>Skanowanie...</option>';
    let detectedCount = 0;
    
    codecSelector.innerHTML = '';

    for (const codecOption of AVAILABLE_CODECS) {
        try {
            const testConfig = {
                codec: codecOption.value,
                width: 1280, 
                height: 720,
                bitrate: 2_000_000, 
                framerate: 30
            };
            
            const supportCheck = await VideoEncoder.isConfigSupported(testConfig);

            if (supportCheck.supported) {
                const selectOption = document.createElement('option');
                selectOption.value = codecOption.value;
                
                const accelerationInfo = supportCheck.config.hardwareAcceleration === 'no-preference' 
                    ? '' 
                    : ` [${supportCheck.config.hardwareAcceleration}]`;
                    
                selectOption.text = `${codecOption.label}${accelerationInfo}`;
                codecSelector.appendChild(selectOption);
                detectedCount++;
            }
        } catch (err) {}
    }

    if (detectedCount === 0) {
        const errorOption = document.createElement('option');
        errorOption.text = "Brak wspieranych kodeków!";
        codecSelector.appendChild(errorOption);
        writeLog("BŁĄD KRYTYCZNY: Twoja przeglądarka nie wspiera WebCodecs dla popularnych formatów.");
    } else {
        writeLog(`Zakończono skanowanie. Dostępnych kodeków: ${detectedCount}`);
        codecSelector.selectedIndex = 0; 
    }
}

checkCodecSupport();

document.getElementById('btn-camera').addEventListener('click', async () => {
    try {
        if (cameraStream) {
            cameraStream.getTracks().forEach(track => track.stop());
        }
        
        cameraStream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                width: { ideal: 1280 }, 
                height: { ideal: 720 } 
            } 
        });
        
        inputVideo.srcObject = cameraStream;
        inputVideo.play();
        writeLog("Kamera uruchomiona.");
    } catch (err) {
        writeLog("Błąd kamery: " + err.message);
    }
});

document.getElementById('file-input').addEventListener('change', (evt) => {
    const uploadedFile = evt.target.files[0];
    if (uploadedFile) {
        inputVideo.srcObject = null;
        inputVideo.src = URL.createObjectURL(uploadedFile);
        inputVideo.loop = true;
        inputVideo.play();
        writeLog(`Załadowano plik: ${uploadedFile.name}`);
    }
});

document.getElementById('bitrate').addEventListener('input', (evt) => {
    document.getElementById('bitrate-val').innerText = evt.target.value;
});

document.getElementById('fps').addEventListener('input', (evt) => {
    document.getElementById('fps-val').innerText = evt.target.value;
});

async function beginRecording() {
    if (inputVideo.readyState < 2) {
        writeLog("Wideo niegotowe. Uruchom kamerę lub załaduj plik.");
        return;
    }
    
    const frameWidth = inputVideo.videoWidth;
    const frameHeight = inputVideo.videoHeight;
    
    if (!frameWidth || !frameHeight) {
        writeLog("Błąd: Nie można odczytać wymiarów wideo.");
        return;
    }

    const chosenCodec = codecSelector.value;
    if (!chosenCodec) { 
        writeLog("Wybierz kodek!"); 
        return; 
    }

    const targetBitrate = parseFloat(document.getElementById('bitrate').value) * 1_000_000;
    const targetFramerate = parseInt(document.getElementById('fps').value);

    encodedFrameCount = 0; 
    accumulatedSize = 0; 
    keyFramesEncoded = 0;
    updateStatistics(0, false);

    let muxerCodecType;
    
    if (chosenCodec.includes('avc') || chosenCodec.includes('h264')) {
        muxerCodecType = 'V_MPEG4/ISO/AVC';
    } else if (chosenCodec.includes('vp8')) {
        muxerCodecType = 'V_VP8';
    } else if (chosenCodec.includes('vp09') || chosenCodec.includes('vp9')) {
        muxerCodecType = 'V_VP9';
    } else if (chosenCodec.includes('av01')) {
        muxerCodecType = 'V_AV1';
    } else {
        muxerCodecType = 'V_VP9';
    }

    try {
        muxerInstance = new WebMMuxer.Muxer({
            target: new WebMMuxer.ArrayBufferTarget(),
            video: {
                codec: muxerCodecType,
                width: frameWidth,
                height: frameHeight,
                frameRate: targetFramerate
            },
            firstTimestampBehavior: 'offset'
        });
        writeLog(`Muxer start: ${muxerCodecType}`);
    } catch (err) {
        writeLog("BŁĄD MUXERA: " + err);
        return;
    }
    
    const encoderSetup = {
        output: handleVideoChunk,
        error: (err) => writeLog("Błąd Enkodera: " + err.message)
    };

    const encoderParams = {
        codec: chosenCodec,
        width: frameWidth,
        height: frameHeight,
        bitrate: targetBitrate,
        framerate: targetFramerate,
        bitrateMode: 'variable'
    };

    if (chosenCodec.includes('avc')) {
        encoderParams.avc = { format: 'annexb' };
    }

    try {
        videoEncoderInstance = new VideoEncoder(encoderSetup);
        videoEncoderInstance.configure(encoderParams);
        writeLog(`Enkoder start: ${chosenCodec} @ ${(targetBitrate/1e6).toFixed(1)}Mbps`);
    } catch (err) {
        writeLog("Błąd konfiguracji Enkodera: " + err.message);
        return;
    }

    isCurrentlyRecording = true;
    toggleControls(true);
    startFrameCapture(targetFramerate);
}

function startFrameCapture(framerate) {
    if (frameProcessingTimer) {
        clearInterval(frameProcessingTimer);
    }
    
    const captureInterval = 1000 / framerate;

    frameProcessingTimer = setInterval(async () => {
        if (!isCurrentlyRecording || !videoEncoderInstance) return;
        if (videoEncoderInstance.encodeQueueSize > 5) return;

        try {
            const capturedFrame = new VideoFrame(inputVideo);
            
            const keyframeSpacing = parseInt(document.getElementById('key-interval').value);
            const shouldBeKeyframe = (encodedFrameCount % keyframeSpacing === 0);

            videoEncoderInstance.encode(capturedFrame, { keyFrame: shouldBeKeyframe });
            capturedFrame.close();
            
            encodedFrameCount++;
        } catch (err) {}
    }, captureInterval);
}

function handleVideoChunk(encodedChunk, chunkMetadata) {
    accumulatedSize += encodedChunk.byteLength;
    const isKeyframeChunk = encodedChunk.type === 'key';
    
    if (isKeyframeChunk) {
        keyFramesEncoded++;
    }

    updateStatistics(encodedChunk.byteLength, isKeyframeChunk);

    try {
        muxerInstance.addVideoChunk(encodedChunk, chunkMetadata);
    } catch (err) {
        writeLog("Błąd zapisu chunka: " + err);
    }
}

function updateStatistics(chunkSize, wasKeyframe) {
    document.getElementById('stat-chunks').innerText = encodedFrameCount;
    document.getElementById('stat-size').innerText = (accumulatedSize / 1024 / 1024).toFixed(2);
    document.getElementById('stat-keyframes').innerText = keyFramesEncoded;
}

async function finishRecording() {
    if (!isCurrentlyRecording) return;
    
    isCurrentlyRecording = false;
    clearInterval(frameProcessingTimer);
    writeLog("Zatrzymywanie...");
    
    await videoEncoderInstance.flush();
    videoEncoderInstance.close();

    try {
        muxerInstance.finalize();
        const outputBuffer = muxerInstance.target.buffer;
        const outputBlob = new Blob([outputBuffer], { type: 'video/webm' });
        window.recordedVideoBlob = outputBlob;
        
        writeLog(`Plik gotowy! Rozmiar: ${(outputBlob.size/1024/1024).toFixed(2)} MB`);
        document.getElementById('btn-play-native').disabled = false;
        
    } catch (err) {
        writeLog("Błąd finalizacji pliku: " + err);
    }

    toggleControls(false);
}

document.getElementById('btn-play-native').addEventListener('click', () => {
    if (!window.recordedVideoBlob) return;
    
    const blobURL = URL.createObjectURL(window.recordedVideoBlob);
    
    const playerElement = document.createElement('video');
    playerElement.src = blobURL;
    playerElement.controls = true;
    playerElement.autoplay = true;
    playerElement.style.width = "100%";
    playerElement.style.marginTop = "10px";
    playerElement.style.border = "2px solid #4caf50";
    
    logsContainer.parentNode.insertBefore(playerElement, logsContainer);
    writeLog("Odtwarzanie natywne uruchomione.");
});

document.getElementById('btn-update-config').addEventListener('click', () => {
    if (!videoEncoderInstance || videoEncoderInstance.state === 'closed') return;
    
    const updatedBitrate = parseFloat(document.getElementById('bitrate').value) * 1_000_000;
    videoEncoderInstance.configure({ bitrate: updatedBitrate });
    writeLog(`Zmieniono bitrate w locie na: ${(updatedBitrate/1e6).toFixed(1)} Mbps`);
});

function toggleControls(recordingInProgress) {
    document.getElementById('btn-start').disabled = recordingInProgress;
    document.getElementById('btn-stop').disabled = !recordingInProgress;
    document.getElementById('btn-update-config').disabled = !recordingInProgress;
    document.getElementById('codec-select').disabled = recordingInProgress;
}

document.getElementById('btn-start').addEventListener('click', beginRecording);
document.getElementById('btn-stop').addEventListener('click', finishRecording);