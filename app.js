const AGORA_APP_ID = '5994dc40ec2848cba09fc2bbfc3eb9a6';

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

let localStream = null;
let peerConnection = null;
let rtmClient = null;
let rtmChannel = null;
let currentRoom = null;
let currentUser = null;
let videoEnabled = false;
let audioEnabled = false;
const loginPanel = document.getElementById('loginPanel');
const mainPanel = document.getElementById('mainPanel');
const roomNameInput = document.getElementById('roomName');
const usernameInput = document.getElementById('username');
const joinBtn = document.getElementById('joinBtn');
const leaveBtn = document.getElementById('leaveBtn');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const toggleVideoBtn = document.getElementById('toggleVideoBtn');
const toggleAudioBtn = document.getElementById('toggleAudioBtn');
const shareScreenBtn = document.getElementById('shareScreenBtn');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const connectionStatus = document.getElementById('connectionStatus');
const currentRoomSpan = document.getElementById('currentRoom');
const currentUserSpan = document.getElementById('currentUser');
const remoteLabel = document.getElementById('remoteLabel');

joinBtn.onclick = joinRoom;
leaveBtn.onclick = leaveRoom;
toggleVideoBtn.onclick = toggleVideo;
toggleAudioBtn.onclick = toggleAudio;
shareScreenBtn.onclick = shareScreen;
sendBtn.onclick = sendMessage;
chatInput.onkeypress = (e) => e.key === 'Enter' && sendMessage();

async function joinRoom() {
    const room = roomNameInput.value.trim();
    const user = usernameInput.value.trim();

    if (!room || !user) {
        alert('Wpisz nazwę pokoju i nick');
        return;
    }

    if (AGORA_APP_ID === 'YOUR_AGORA_APP_ID_HERE') {
        alert('Ustaw APP ID w app.js');
        return;
    }

    currentRoom = room;
    currentUser = user;

    try {
        rtmClient = AgoraRTM.createInstance(AGORA_APP_ID);
        
        rtmClient.on('MessageFromPeer', async (msg, peerId) => {
            handleSignal(JSON.parse(msg.text));
        });

        await rtmClient.login({ uid: currentUser });

        rtmChannel = rtmClient.createChannel(currentRoom);
        
        rtmChannel.on('ChannelMessage', async (msg, memberId) => {
            const data = JSON.parse(msg.text);
            if (data.type === 'chat') {
                addMessage(data.user, data.msg, false);
            } else {
                handleSignal(data);
            }
        });

        rtmChannel.on('MemberJoined', (memberId) => {
            addMessage('System', memberId + ' dołączył', false);
        });

        rtmChannel.on('MemberLeft', (memberId) => {
            addMessage('System', memberId + ' wyszedł', false);
            remoteLabel.textContent = 'Czekam...';
        });

        await rtmChannel.join();

        loginPanel.classList.add('hidden');
        mainPanel.classList.remove('hidden');
        currentRoomSpan.textContent = currentRoom;
        currentUserSpan.textContent = currentUser;
        connectionStatus.textContent = 'Połączony z pokojem';

    } catch (error) {
        alert('Błąd: ' + error.message);
    }
}

async function leaveRoom() {
    if (peerConnection) peerConnection.close();
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (rtmChannel) await rtmChannel.leave();
    if (rtmClient) await rtmClient.logout();

    localVideo.srcObject = null;
    remoteVideo.srcObject = null;
    chatMessages.innerHTML = '';
    videoEnabled = false;
    audioEnabled = false;
    updateButtons();

    mainPanel.classList.add('hidden');
    loginPanel.classList.remove('hidden');
    connectionStatus.textContent = 'Rozłączony';
}

function createPeerConnection() {
    if (peerConnection) return;

    peerConnection = new RTCPeerConnection(ICE_SERVERS);

    peerConnection.onicecandidate = (e) => {
        if (e.candidate) {
            sendSignal({ type: 'ice', candidate: e.candidate });
        }
    };

    peerConnection.ontrack = (e) => {
        remoteVideo.srcObject = e.streams[0];
        remoteLabel.textContent = 'Rozmówca';
        connectionStatus.textContent = 'Połączony';
    };

    if (localStream) {
        localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
    }
}

async function handleSignal(msg) {
    if (msg.type === 'offer') {
        createPeerConnection();
        await peerConnection.setRemoteDescription(msg.offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        sendSignal({ type: 'answer', answer: answer });
    } else if (msg.type === 'answer') {
        await peerConnection.setRemoteDescription(msg.answer);
    } else if (msg.type === 'ice') {
        await peerConnection.addIceCandidate(msg.candidate);
    } else if (msg.type === 'ready') {
        createPeerConnection();
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        sendSignal({ type: 'offer', offer: offer });
    }
}

function sendSignal(msg) {
    if (rtmChannel) {
        rtmChannel.sendMessage({ text: JSON.stringify(msg) });
    }
}

async function toggleVideo() {
    videoEnabled = !videoEnabled;

    try {
        if (videoEnabled) {
            if (!localStream) {
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: audioEnabled
                });
                localVideo.srcObject = localStream;

                if (peerConnection) {
                    localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
                }
            }
            sendSignal({ type: 'ready' });
        } else {
            localStream.getVideoTracks().forEach(t => t.stop());
        }
        updateButtons();
    } catch (error) {
        alert('Błąd kamery: ' + error.message);
        videoEnabled = false;
        updateButtons();
    }
}

async function toggleAudio() {
    audioEnabled = !audioEnabled;

    try {
        if (audioEnabled) {
            if (!localStream) {
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: videoEnabled,
                    audio: true
                });
                localVideo.srcObject = localStream;

                if (peerConnection) {
                    localStream.getTracks().forEach(t => peerConnection.addTrack(t, localStream));
                }
            }
            sendSignal({ type: 'ready' });
        } else {
            localStream.getAudioTracks().forEach(t => t.stop());
        }
        updateButtons();
    } catch (error) {
        alert('Błąd mikrofonu: ' + error.message);
        audioEnabled = false;
        updateButtons();
    }
}

async function shareScreen() {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const track = stream.getVideoTracks()[0];

        if (peerConnection) {
            const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
            if (sender) sender.replaceTrack(track);
        }

        localVideo.srcObject = stream;

        track.onended = () => {
            if (videoEnabled && localStream) {
                const videoTrack = localStream.getVideoTracks()[0];
                const sender = peerConnection.getSenders().find(s => s.track?.kind === 'video');
                if (sender && videoTrack) sender.replaceTrack(videoTrack);
                localVideo.srcObject = localStream;
            }
        };
    } catch (error) {
        alert('Błąd: ' + error.message);
    }
}

function updateButtons() {
    toggleVideoBtn.textContent = videoEnabled ? 'Wyłącz wideo' : 'Włącz wideo';
    toggleVideoBtn.classList.toggle('active', videoEnabled);
    toggleAudioBtn.textContent = audioEnabled ? 'Wyłącz audio' : 'Włącz audio';
    toggleAudioBtn.classList.toggle('active', audioEnabled);
}

function sendMessage() {
    const msg = chatInput.value.trim();
    if (!msg || !rtmChannel) return;

    sendSignal({ type: 'chat', user: currentUser, msg: msg });
    addMessage(currentUser, msg, true);
    chatInput.value = '';
}

function addMessage(user, msg, own) {
    const div = document.createElement('div');
    div.className = 'chat-message' + (own ? ' own' : '');
    div.textContent = user + ': ' + msg;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}