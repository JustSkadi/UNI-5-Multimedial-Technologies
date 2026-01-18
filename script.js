const AGORA_APP_ID = "d7b5402931ae4acbb01572d9a6655abf";
const REQUIRED_PASSWORD = "admin";

const rtcConfig = {
    iceServers: [
        { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
    ]
};

let authToken = null;
let userId = String(Math.floor(Math.random() * 100));
let rtmClient;
let rtmChannel;
let userLocalStream;
let userRemoteStream;
let connection;

const params = new URLSearchParams(window.location.search);
let currentRoom = params.get('room');

if (!currentRoom) {
    currentRoom = 'main';
    window.history.replaceState(null, null, `?room=${currentRoom}`);
}

document.getElementById('auth-form').addEventListener('submit', function(evt) {
    evt.preventDefault();
    const passwordInput = document.getElementById('password-input');
    const enteredPassword = passwordInput.value;
    const errorDiv = document.getElementById('auth-error');
    
    if (enteredPassword === REQUIRED_PASSWORD) {
        document.getElementById('auth-section').style.display = 'none';
        document.getElementById('main-app').style.display = 'block';
        document.getElementById('room-info').innerText = `Pokój: ${currentRoom}`;
        initializeApp();
    } else {
        errorDiv.style.display = 'block';
        passwordInput.value = '';
        passwordInput.focus();
        
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 3000);
    }
});

async function setupLocalMedia() {
    try {
        userLocalStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById('user-1').srcObject = userLocalStream;
    } catch (error) {
        console.error('Błąd dostępu do kamery/mikrofonu:', error);
        alert('Nie udało się uzyskać dostępu do kamery lub mikrofonu.');
    }
}

async function connectToAgoraRTM() {
    try {
        rtmClient = await AgoraRTM.createInstance(AGORA_APP_ID);
        await rtmClient.login({ uid: userId, token: authToken });
        rtmChannel = rtmClient.createChannel(currentRoom);
        await rtmChannel.join();
        rtmChannel.on('MemberJoined', onUserJoined);
        rtmClient.on('MessageFromPeer', onPeerMessage);
        rtmChannel.on('ChannelMessage', onChannelMessage);
        console.log('Zalogowano i dołączono do:', currentRoom);
    } catch (error) {
        console.error('Błąd połączenia z Agora RTM:', error);
    }
}

async function initializeApp() {
    await setupLocalMedia();
    await connectToAgoraRTM();
}

async function setupConnection(memberId) {
    connection = new RTCPeerConnection(rtcConfig);
    userRemoteStream = new MediaStream();
    document.getElementById('user-2').srcObject = userRemoteStream;

    userLocalStream.getTracks().forEach((track) => {
        connection.addTrack(track, userLocalStream);
    });

    connection.ontrack = (evt) => {
        evt.streams[0].getTracks().forEach((track) => {
            userRemoteStream.addTrack(track);
        });
    };

    connection.onicecandidate = async (evt) => {
        if (evt.candidate) {
            rtmClient.sendMessageToPeer({ 
                text: JSON.stringify({'type': 'candidate', 'candidate': evt.candidate}) 
            }, memberId);
        }
    };
}

async function onUserJoined(memberId) {
    console.log('User joined:', memberId);
    await setupConnection(memberId);
    let offerData = await connection.createOffer();
    await connection.setLocalDescription(offerData);
    rtmClient.sendMessageToPeer({ 
        text: JSON.stringify({'type': 'offer', 'offer': offerData}) 
    }, memberId);
}

async function onPeerMessage(message, memberId) {
    let data = JSON.parse(message.text);
    
    if (data.type === 'offer') {
        if (!connection) {
            await setupConnection(memberId);
        }
        await connection.setRemoteDescription(data.offer);
        let answerData = await connection.createAnswer();
        await connection.setLocalDescription(answerData);
        rtmClient.sendMessageToPeer({ 
            text: JSON.stringify({'type': 'answer', 'answer': answerData}) 
        }, memberId);
    } 
    else if (data.type === 'answer') {
        if (!connection.currentRemoteDescription) {
            await connection.setRemoteDescription(data.answer);
        }
    } 
    else if (data.type === 'candidate') {
        if (connection) {
            connection.addIceCandidate(data.candidate);
        }
    }
}

async function handleFormSubmit(evt) {
    evt.preventDefault();
    let formElement = evt.target;
    let messageText = formElement.message.value;
    
    if (messageText.trim()) {
        await rtmChannel.sendMessage({ 
            text: JSON.stringify({'type': 'chat', 'message': messageText, 'displayName': 'Użytkownik ' + userId}) 
        });
        displayMessage('Ja', messageText, true);
        formElement.reset();
    }
}

async function onChannelMessage(messageData, memberId) {
    let parsedData = JSON.parse(messageData.text);
    if (parsedData.type === 'chat') {
        displayMessage('Znajomy', parsedData.message, false);
    }
}

function displayMessage(senderName, content, isOwnMessage) {
    let chatContainer = document.getElementById('messages');
    let messageHTML = `<div class="message__wrapper ${isOwnMessage ? 'my-message' : ''}">
                        <div class="message__body">
                            <strong>${senderName}:</strong> ${content}
                        </div>
                      </div>`;
    chatContainer.insertAdjacentHTML('beforeend', messageHTML);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

document.getElementById('message-form').addEventListener('submit', handleFormSubmit);

async function switchCamera() {
    let videoStream = userLocalStream.getVideoTracks()[0];
    let btn = document.getElementById('camera-btn');
    if (videoStream.enabled) {
        videoStream.enabled = false;
        btn.innerText = 'Kamera: Wyłączona';
    } else {
        videoStream.enabled = true;
        btn.innerText = 'Kamera: Włączona';
    }
}

async function switchMicrophone() {
    let audioStream = userLocalStream.getAudioTracks()[0];
    let btn = document.getElementById('mic-btn');
    if (audioStream.enabled) {
        audioStream.enabled = false;
        btn.innerText = 'Mikrofon: Wyłączony';
    } else {
        audioStream.enabled = true;
        btn.innerText = 'Mikrofon: Włączony';
    }
}

document.getElementById('camera-btn').addEventListener('click', switchCamera);
document.getElementById('mic-btn').addEventListener('click', switchMicrophone);