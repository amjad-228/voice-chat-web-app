// إدارة اتصالات WebRTC للدردشة الصوتية

class VoiceManager {
    constructor() {
        this.localStream = null;
        this.peerConnections = new Map();
        this.isAudioEnabled = true;
        this.isSpeakerEnabled = true;
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.volumeCallback = null;
        
        // إعدادات WebRTC
        this.rtcConfiguration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        };
        
        this.initializeElements();
        this.bindEvents();
    }
    
    initializeElements() {
        this.micBtn = document.getElementById('mic-btn');
        this.speakerBtn = document.getElementById('speaker-btn');
        this.volumeBar = document.getElementById('volume-bar');
        
        // تحديث حالة الأزرار
        this.updateButtonStates();
    }
    
    bindEvents() {
        if (this.micBtn) {
            this.micBtn.addEventListener('click', () => this.toggleMicrophone());
        }
        
        if (this.speakerBtn) {
            this.speakerBtn.addEventListener('click', () => this.toggleSpeaker());
        }
        
        // ربط أحداث Socket.io
        if (typeof socket !== 'undefined') {
            socket.on('webrtc-signal', (data) => this.handleSignal(data));
            socket.on('user-joined', (data) => this.handleUserJoined(data));
            socket.on('user-left', (data) => this.handleUserLeft(data));
        }
    }
    
    async initializeAudio() {
        try {
            // طلب إذن الوصول للميكروفون
            this.localStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 44100
                },
                video: false
            });
            
            console.log('تم الحصول على إذن الميكروفون');
            
            // تهيئة مراقب مستوى الصوت
            await this.initializeVolumeMonitor();
            
            // تحديث حالة الأزرار
            this.updateButtonStates();
            
            return true;
        } catch (error) {
            console.error('خطأ في الحصول على إذن الميكروفون:', error);
            this.showError('لا يمكن الوصول إلى الميكروفون. يرجى التأكد من الأذونات.');
            return false;
        }
    }
    
    async initializeVolumeMonitor() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.microphone = this.audioContext.createMediaStreamSource(this.localStream);
            
            this.analyser.fftSize = 256;
            this.microphone.connect(this.analyser);
            
            // بدء مراقبة مستوى الصوت
            this.monitorVolume();
        } catch (error) {
            console.error('خطأ في تهيئة مراقب الصوت:', error);
        }
    }
    
    monitorVolume() {
        if (!this.analyser) return;
        
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        const updateVolume = () => {
            this.analyser.getByteFrequencyData(dataArray);
            
            // حساب متوسط مستوى الصوت
            let sum = 0;
            for (let i = 0; i < bufferLength; i++) {
                sum += dataArray[i];
            }
            const average = sum / bufferLength;
            const volume = (average / 255) * 100;
            
            // تحديث شريط مستوى الصوت
            if (this.volumeBar) {
                this.volumeBar.style.width = `${volume}%`;
            }
            
            // استدعاء callback إذا كان موجوداً
            if (this.volumeCallback) {
                this.volumeCallback(volume);
            }
            
            requestAnimationFrame(updateVolume);
        };
        
        updateVolume();
    }
    
    async handleUserJoined(userData) {
        console.log('مستخدم جديد انضم للدردشة الصوتية:', userData);
        
        // إنشاء اتصال WebRTC جديد
        await this.createPeerConnection(userData.socketId);
        
        // إنشاء عرض (offer)
        await this.createOffer(userData.socketId);
    }
    
    handleUserLeft(userData) {
        console.log('مستخدم غادر الدردشة الصوتية:', userData);
        
        // إغلاق اتصال WebRTC
        this.closePeerConnection(userData.socketId);
    }
    
    async createPeerConnection(socketId) {
        try {
            const peerConnection = new RTCPeerConnection(this.rtcConfiguration);
            
            // إضافة المسار الصوتي المحلي
            if (this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    peerConnection.addTrack(track, this.localStream);
                });
            }
            
            // معالجة المسارات الواردة
            peerConnection.ontrack = (event) => {
                console.log('تم استقبال مسار صوتي من:', socketId);
                this.handleRemoteStream(event.streams[0], socketId);
            };
            
            // معالجة ICE candidates
            peerConnection.onicecandidate = (event) => {
                if (event.candidate) {
                    socket.emit('webrtc-signal', {
                        targetSocketId: socketId,
                        signal: event.candidate,
                        type: 'ice-candidate'
                    });
                }
            };
            
            // معالجة تغيير حالة الاتصال
            peerConnection.onconnectionstatechange = () => {
                console.log(`حالة الاتصال مع ${socketId}:`, peerConnection.connectionState);
            };
            
            this.peerConnections.set(socketId, peerConnection);
            
        } catch (error) {
            console.error('خطأ في إنشاء اتصال WebRTC:', error);
        }
    }
    
    async createOffer(socketId) {
        try {
            const peerConnection = this.peerConnections.get(socketId);
            if (!peerConnection) return;
            
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            socket.emit('webrtc-signal', {
                targetSocketId: socketId,
                signal: offer,
                type: 'offer'
            });
            
        } catch (error) {
            console.error('خطأ في إنشاء العرض:', error);
        }
    }
    
    async createAnswer(socketId, offer) {
        try {
            const peerConnection = this.peerConnections.get(socketId);
            if (!peerConnection) return;
            
            await peerConnection.setRemoteDescription(offer);
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            socket.emit('webrtc-signal', {
                targetSocketId: socketId,
                signal: answer,
                type: 'answer'
            });
            
        } catch (error) {
            console.error('خطأ في إنشاء الإجابة:', error);
        }
    }
    
    async handleSignal(data) {
        const { signal, type, fromSocketId } = data;
        
        try {
            switch (type) {
                case 'offer':
                    // إنشاء اتصال جديد إذا لم يكن موجوداً
                    if (!this.peerConnections.has(fromSocketId)) {
                        await this.createPeerConnection(fromSocketId);
                    }
                    await this.createAnswer(fromSocketId, signal);
                    break;
                    
                case 'answer':
                    const peerConnection = this.peerConnections.get(fromSocketId);
                    if (peerConnection) {
                        await peerConnection.setRemoteDescription(signal);
                    }
                    break;
                    
                case 'ice-candidate':
                    const pc = this.peerConnections.get(fromSocketId);
                    if (pc) {
                        await pc.addIceCandidate(signal);
                    }
                    break;
            }
        } catch (error) {
            console.error('خطأ في معالجة إشارة WebRTC:', error);
        }
    }
    
    handleRemoteStream(stream, socketId) {
        // إنشاء عنصر audio لتشغيل الصوت
        const audioElement = document.createElement('audio');
        audioElement.srcObject = stream;
        audioElement.autoplay = true;
        audioElement.controls = false;
        audioElement.muted = !this.isSpeakerEnabled;
        audioElement.setAttribute('data-socket-id', socketId);
        
        // إضافة العنصر إلى الصفحة (مخفي)
        audioElement.style.display = 'none';
        document.body.appendChild(audioElement);
        
        console.log('تم إنشاء عنصر صوتي للمستخدم:', socketId);
    }
    
    toggleMicrophone() {
        this.isAudioEnabled = !this.isAudioEnabled;
        
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = this.isAudioEnabled;
            });
        }
        
        this.updateButtonStates();
        
        const status = this.isAudioEnabled ? 'تم تشغيل' : 'تم إيقاف';
        if (typeof showNotification === 'function') {
            showNotification(`${status} الميكروفون`, 'info');
        }
    }
    
    toggleSpeaker() {
        this.isSpeakerEnabled = !this.isSpeakerEnabled;
        
        // تحديث جميع عناصر الصوت
        document.querySelectorAll('audio[data-socket-id]').forEach(audio => {
            audio.muted = !this.isSpeakerEnabled;
        });
        
        this.updateButtonStates();
        
        const status = this.isSpeakerEnabled ? 'تم تشغيل' : 'تم إيقاف';
        if (typeof showNotification === 'function') {
            showNotification(`${status} السماعات`, 'info');
        }
    }
    
    updateButtonStates() {
        if (this.micBtn) {
            this.micBtn.classList.toggle('muted', !this.isAudioEnabled);
            this.micBtn.title = this.isAudioEnabled ? 'إيقاف الميكروفون' : 'تشغيل الميكروفون';
            
            const icon = this.micBtn.querySelector('i');
            if (icon) {
                icon.className = this.isAudioEnabled ? 'fas fa-microphone' : 'fas fa-microphone-slash';
            }
        }
        
        if (this.speakerBtn) {
            this.speakerBtn.classList.toggle('muted', !this.isSpeakerEnabled);
            this.speakerBtn.title = this.isSpeakerEnabled ? 'إيقاف السماعات' : 'تشغيل السماعات';
            
            const icon = this.speakerBtn.querySelector('i');
            if (icon) {
                icon.className = this.isSpeakerEnabled ? 'fas fa-volume-up' : 'fas fa-volume-mute';
            }
        }
    }
    
    closePeerConnection(socketId) {
        const peerConnection = this.peerConnections.get(socketId);
        if (peerConnection) {
            peerConnection.close();
            this.peerConnections.delete(socketId);
        }
        
        // إزالة عنصر الصوت
        const audioElement = document.querySelector(`audio[data-socket-id="${socketId}"]`);
        if (audioElement) {
            audioElement.remove();
        }
    }
    
    cleanup() {
        // إيقاف جميع الاتصالات
        this.peerConnections.forEach((pc, socketId) => {
            this.closePeerConnection(socketId);
        });
        
        // إيقاف المسار المحلي
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                track.stop();
            });
            this.localStream = null;
        }
        
        // إغلاق AudioContext
        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
        
        // إزالة جميع عناصر الصوت
        document.querySelectorAll('audio[data-socket-id]').forEach(audio => {
            audio.remove();
        });
    }
    
    showError(message) {
        if (typeof showNotification === 'function') {
            showNotification(message, 'warning');
        } else {
            console.error(message);
        }
    }
    
    // وظائف مساعدة
    setVolumeCallback(callback) {
        this.volumeCallback = callback;
    }
    
    getConnectionState(socketId) {
        const pc = this.peerConnections.get(socketId);
        return pc ? pc.connectionState : 'disconnected';
    }
    
    getConnectedUsers() {
        return Array.from(this.peerConnections.keys());
    }
}

// إنشاء مثيل عام لمدير الصوت
let voiceManager = null;

// تهيئة مدير الصوت عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    voiceManager = new VoiceManager();
});

// تصدير للاستخدام العام
window.VoiceManager = VoiceManager;
window.voiceManager = voiceManager;