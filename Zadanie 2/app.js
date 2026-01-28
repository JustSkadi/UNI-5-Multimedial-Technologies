let videoEncoder = null;
let mediaStream = null;
let sourceVideo = null;
let isEncoding = false;
let frameCount = 0;
let keyframeCount = 0;
let segmentCount = 0;
let mp4boxSegmentCount = 0;
let segmentChart = null;
let mp4boxSegmentChart = null;
let latencyChart = null;
let animationFrameId = null;
let currentSegmentChunks = [];
let currentSegmentSize = 0;
let segmentStartTime = 0;
let mp4boxFile = null;
let trackId = null;
let realBitrate = 0;
let bitrateWindow = [];
let encodeStartTimeMap = new Map();

const config = {
    codec: 'avc1.4D401E',
    width: 1280,
    height: 720,
    bitrate: 2000000,
    framerate: 30,
    keyframeInterval: 60,
    segmentDuration: 2000,
    rateControl: 'variable'
};

let currentFrameInterval = 1000 / 30;

document.addEventListener('DOMContentLoaded', () => {
    checkBrowserSupport();
    initCharts();
    setupUI();
    detectSupportedCodecs();
});

function checkBrowserSupport() {
    if (!('VideoEncoder' in window)) {
        alert('Twoja przeglądarka nie wspiera WebCodecs API!');
        return false;
    }
    return true;
}

async function detectSupportedCodecs() {
    const codecs = [
        { value: 'avc1.42001E', label: 'H.264 Baseline' },
        { value: 'avc1.4D401E', label: 'H.264 Main' },
        { value: 'avc1.64001F', label: 'H.264 High' },
        { value: 'vp09.00.10.08', label: 'VP9' }
    ];
    const select = document.getElementById('codec');
    select.innerHTML = '';
    for (const codec of codecs) {
        try {
            const support = await VideoEncoder.isConfigSupported({
                codec: codec.value, width: 1280, height: 720, bitrate: 2000000, framerate: 30
            });
            if (support.supported) {
                const option = document.createElement('option');
                option.value = codec.value;
                option.textContent = codec.label;
                select.appendChild(option);
            }
        } catch (e) {}
    }
}

function setupUI() {
    document.getElementById('startBtn').onclick = startEncoding;
    document.getElementById('stopBtn').onclick = stopEncoding;
    document.getElementById('applyBtn').onclick = applyConfigChanges;
    
    document.getElementById('videoSource').onchange = (e) => {
        document.getElementById('videoFile').style.display = e.target.value === 'file' ? 'block' : 'none';
    };

    ['bitrate', 'framerate', 'keyframeInterval', 'segmentDuration'].forEach(id => {
        const slider = document.getElementById(id);
        slider.oninput = (e) => {
            const val = parseInt(e.target.value);
            document.getElementById(id + 'Value').textContent = val;
            config[id] = (id === 'bitrate') ? val * 1000 : val;
            document.getElementById('applyBtn').classList.add('modified');
        };
    });
}

async function applyConfigChanges() {
    currentFrameInterval = 1000 / config.framerate;
    if (!isEncoding || !videoEncoder) return;
    
    try {
        const newConfig = {
            codec: document.getElementById('codec').value,
            width: sourceVideo.videoWidth || config.width,
            height: sourceVideo.videoHeight || config.height,
            bitrate: config.bitrate,
            framerate: config.framerate,
            latencyMode: 'realtime',
            bitrateMode: document.getElementById('rateControl').value
        };
        
        await videoEncoder.configure(newConfig);
        console.log("%c[SYSTEM] Rekonfiguracja udana:", "color: #0070f3", newConfig);
        document.getElementById('applyBtn').classList.remove('modified');
    } catch (e) {
        console.error("Błąd rekonfiguracji:", e);
    }
}

async function startEncoding() {
    try {
        resetState();
        sourceVideo = document.getElementById('sourceVideo');

        if (document.getElementById('videoSource').value === 'camera') {
            mediaStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
            sourceVideo.srcObject = mediaStream;
        }
        
        await sourceVideo.play();
        currentFrameInterval = 1000 / config.framerate;

        videoEncoder = new VideoEncoder({
            output: (chunk, metadata) => {
                const now = performance.now();
                const startTime = encodeStartTimeMap.get(chunk.timestamp);
                let actualLatency = 0;
                if (startTime) {
                    actualLatency = now - startTime;
                    encodeStartTimeMap.delete(chunk.timestamp);
                }
                if (metadata && metadata.decoderConfig) {
                    console.log("%c[ENKODER] Aktywny kodek: " + metadata.decoderConfig.codec, "color: #00ff88; font-weight: bold;");
                    if (trackId === null) {
                        trackId = mp4boxFile.addTrack({
                            type: 'video', timescale: 1000000,
                            width: sourceVideo.videoWidth, height: sourceVideo.videoHeight,
                            avcDecoderConfigRecord: new Uint8Array(metadata.decoderConfig.description)
                        });
                        mp4boxFile.setSegmentOptions(trackId, null, { nbSamples: config.framerate * 2 });
                    }
                }
                if (chunk.type === 'key') keyframeCount++;
                bitrateWindow.push({ size: chunk.byteLength, timestamp: now });
                bitrateWindow = bitrateWindow.filter(item => (now - item.timestamp) < 1000);
                realBitrate = Math.round((bitrateWindow.reduce((sum, i) => sum + i.size, 0) * 8) / 1000);
                document.getElementById('totalFrames').textContent = frameCount;
                document.getElementById('keyframeCount').textContent = keyframeCount;
                document.getElementById('currentBitrate').textContent = realBitrate + ' kbps';
                document.getElementById('avgLatency').textContent = actualLatency.toFixed(2) + ' ms';

                if (latencyChart) {
                    latencyChart.data.labels.push(`#${frameCount}`);
                    latencyChart.data.datasets[0].data.push(actualLatency);
                    if (latencyChart.data.labels.length > 50) {
                        latencyChart.data.labels.shift();
                        latencyChart.data.datasets[0].data.shift();
                    }
                    latencyChart.update('none');
                }
                const buffer = new ArrayBuffer(chunk.byteLength);
                chunk.copyTo(buffer);
                currentSegmentChunks.push(buffer);
                currentSegmentSize += chunk.byteLength;
                
                if (segmentStartTime === 0) segmentStartTime = chunk.timestamp;
                if ((chunk.timestamp - segmentStartTime) / 1000 >= config.segmentDuration) finalizeSegment();
                
                if (mp4boxFile && trackId !== null) {
                    mp4boxFile.addSample(trackId, buffer, {
                        duration: chunk.duration || (1000000 / config.framerate),
                        is_sync: chunk.type === 'key'
                    });
                }
            },
            error: (e) => console.error(e)
        });

        videoEncoder.configure({
            codec: document.getElementById('codec').value,
            width: sourceVideo.videoWidth,
            height: sourceVideo.videoHeight,
            bitrate: config.bitrate,
            framerate: config.framerate,
            latencyMode: 'realtime',
            bitrateMode: document.getElementById('rateControl').value
        });

        mp4boxFile = MP4Box.createFile();
        mp4boxFile.onSegment = (id, user, buffer) => handleMp4boxSegment(buffer);

        isEncoding = true;
        document.getElementById('startBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;

        let lastEncodeTime = performance.now();
        
        function encodeLoop() {
            if (!isEncoding) return;
            const now = performance.now();

            if (now - lastEncodeTime >= currentFrameInterval) {
                if (sourceVideo.readyState >= 2) {
                    const ts = now * 1000;
                    encodeStartTimeMap.set(ts, now);
                    
                    const frame = new VideoFrame(sourceVideo, { timestamp: ts });
                    const isKey = (frameCount % config.keyframeInterval) === 0;
                    
                    videoEncoder.encode(frame, { keyFrame: isKey });
                    frame.close();
                    
                    frameCount++;
                    lastEncodeTime = now;
                }
            }
            animationFrameId = requestAnimationFrame(encodeLoop);
        }
        encodeLoop();

    } catch (err) {
        alert("Błąd: " + err.message);
        stopEncoding();
    }
}

function handleMp4boxSegment(buffer) {
    mp4boxSegmentCount++;
    const sizeKB = (buffer.byteLength / 1024).toFixed(2);
    updateSegmentChart(mp4boxSegmentChart, mp4boxSegmentCount, sizeKB);
    const list = document.getElementById('mp4boxSegmentsList');
    if (list.querySelector('.no-segments')) list.innerHTML = '';
    const item = document.createElement('div');
    item.className = 'seg-item';
    item.innerHTML = `<span>MP4 Seg ${mp4boxSegmentCount}: ${sizeKB} KB</span>`;
    list.appendChild(item);
}

function finalizeSegment() {
    if (currentSegmentChunks.length === 0) return;
    segmentCount++;
    const sizeKB = (currentSegmentSize / 1024).toFixed(2);
    updateSegmentChart(segmentChart, segmentCount, sizeKB);
    
    const blob = new Blob(currentSegmentChunks, { type: 'video/raw' });
    const url = URL.createObjectURL(blob);
    const list = document.getElementById('segmentsList');
    if (list.querySelector('.no-segments')) list.innerHTML = '';
    
    const item = document.createElement('div');
    item.className = 'seg-item';
    item.innerHTML = `<span>Segment ${segmentCount}: ${sizeKB} KB</span><button class="download-btn" onclick="window.open('${url}')">POBIERZ</button>`;
    list.appendChild(item);
    
    currentSegmentChunks = [];
    currentSegmentSize = 0;
    segmentStartTime = 0;
}

function updateSegmentChart(chart, count, size) {
    if (!chart) return;
    chart.data.labels.push(`S${count}`);
    chart.data.datasets[0].data.push(parseFloat(size));
    if (chart.data.labels.length > 20) {
        chart.data.labels.shift();
        chart.data.datasets[0].data.shift();
    }
    chart.update('none');
}

function stopEncoding() {
    isEncoding = false;
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    if (videoEncoder) {
        videoEncoder.flush();
        videoEncoder.close();
    }
    if (mediaStream) mediaStream.getTracks().forEach(t => t.stop());
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    encodeStartTimeMap.clear();
}

function resetState() {
    frameCount = 0; keyframeCount = 0; segmentCount = 0; mp4boxSegmentCount = 0;
    currentSegmentChunks = []; currentSegmentSize = 0; segmentStartTime = 0;
    trackId = null; bitrateWindow = []; encodeStartTimeMap.clear();
    document.getElementById('segmentsList').innerHTML = '<div class="no-segments">Brak segmentów</div>';
    document.getElementById('mp4boxSegmentsList').innerHTML = '<div class="no-segments">Brak segmentów</div>';
}

function initCharts() {
    const commonOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
            x: { display: false }
        },
        plugins: { legend: { display: false } }
    };

    segmentChart = new Chart(document.getElementById('segmentChart'), {
        type: 'bar',
        data: { labels: [], datasets: [{ data: [], backgroundColor: '#0070f3' }] },
        options: commonOptions
    });

    mp4boxSegmentChart = new Chart(document.getElementById('mp4boxSegmentChart'), {
        type: 'bar',
        data: { labels: [], datasets: [{ data: [], backgroundColor: '#00ff88' }] },
        options: commonOptions
    });

    latencyChart = new Chart(document.getElementById('latencyChart'), {
        type: 'line',
        data: { labels: [], datasets: [{ data: [], borderColor: '#ff4d4d', tension: 0.1, pointRadius: 0 }] },
        options: commonOptions
    });
}