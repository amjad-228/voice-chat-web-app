// متغيرات عامة
let socket;
let currentUser = null;
let currentRoom = null;
let isConnected = false;

// عناصر DOM
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const usernameInput = document.getElementById('username');
const roomIdInput = document.getElementById('room-id');
const joinBtn = document.getElementById('join-btn');
const leaveRoomBtn = document.getElementById('leave-room');
const currentRoomSpan = document.getElementById('current-room');
const userCountSpan = document.getElementById('user-count');
const usersListDiv = document.getElementById('users-list');
const messagesDiv = document.getElementById('messages');
const messageTextInput = document.getElementById('message-text');
const sendMessageBtn = document.getElementById('send-message');
const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const statusDot = statusIndicator.querySelector('.status-dot');
const notificationsDiv = document.getElementById('notifications');

// تهيئة التطبيق
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    // تهيئة Socket.io
    socket = io();
    
    // ربط الأحداث
    bindEvents();
    
    // تحديث حالة الاتصال
    updateConnectionStatus(false);
}

function bindEvents() {
    // أحداث Socket.io
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('joined-room', onJoinedRoom);
    socket.on('room-users', onRoomUsers);
    socket.on('user-joined', onUserJoined);
    socket.on('user-left', onUserLeft);
    socket.on('chat-message', onChatMessage);
    
    // أحداث واجهة المستخدم
    joinBtn.addEventListener('click', joinRoom);
    leaveRoomBtn.addEventListener('click', leaveRoom);
    sendMessageBtn.addEventListener('click', sendMessage);
    messageTextInput.addEventListener('keypress', onMessageKeyPress);
    
    // التركيز على حقل اسم المستخدم
    usernameInput.focus();
    
    // منع إرسال النموذج
    usernameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            joinRoom();
        }
    });
    
    roomIdInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            joinRoom();
        }
    });
}

// أحداث Socket.io
function onConnect() {
    console.log('متصل بالخادم');
    updateConnectionStatus(true);
    showNotification('تم الاتصال بالخادم بنجاح', 'success');
}

function onDisconnect() {
    console.log('انقطع الاتصال بالخادم');
    updateConnectionStatus(false);
    showNotification('انقطع الاتصال بالخادم', 'warning');
    
    // العودة إلى شاشة الدخول
    if (currentRoom) {
        showScreen('login');
        resetChat();
    }
}

function onJoinedRoom(data) {
    console.log('انضممت إلى الغرفة:', data);
    currentUser = {
        id: data.userId,
        username: data.username
    };
    currentRoom = data.roomId;
    
    // تحديث واجهة المستخدم
    currentRoomSpan.textContent = currentRoom;
    showScreen('chat');
    
    showNotification(`مرحباً بك في الغرفة ${currentRoom}`, 'success');
}

function onRoomUsers(users) {
    console.log('مستخدمو الغرفة:', users);
    updateUsersList(users);
    updateUserCount(users.length);
}

function onUserJoined(data) {
    console.log('مستخدم جديد انضم:', data);
    addUserToList(data);
    showNotification(`${data.username} انضم إلى الغرفة`, 'info');
    
    // تحديث عدد المستخدمين
    const currentCount = parseInt(userCountSpan.textContent.split(': ')[1]) || 0;
    updateUserCount(currentCount + 1);
}

function onUserLeft(data) {
    console.log('مستخدم غادر:', data);
    removeUserFromList(data.socketId);
    showNotification(`${data.username} غادر الغرفة`, 'info');
    
    // تحديث عدد المستخدمين
    const currentCount = parseInt(userCountSpan.textContent.split(': ')[1]) || 0;
    updateUserCount(Math.max(0, currentCount - 1));
}

function onChatMessage(data) {
    console.log('رسالة جديدة:', data);
    addMessageToChat(data);
}

// وظائف واجهة المستخدم
function joinRoom() {
    const username = usernameInput.value.trim();
    const roomId = roomIdInput.value.trim() || generateRoomId();
    
    if (!username) {
        showNotification('يرجى إدخال اسم المستخدم', 'warning');
        usernameInput.focus();
        return;
    }
    
    if (username.length < 2) {
        showNotification('اسم المستخدم يجب أن يكون حرفين على الأقل', 'warning');
        usernameInput.focus();
        return;
    }
    
    // إرسال طلب الانضمام
    socket.emit('join-room', {
        username: username,
        roomId: roomId
    });
    
    showNotification('جاري الانضمام إلى الغرفة...', 'info');
}

function leaveRoom() {
    if (currentRoom) {
        socket.disconnect();
        socket.connect();
        
        showScreen('login');
        resetChat();
        
        showNotification('تم مغادرة الغرفة', 'info');
    }
}

function sendMessage() {
    const message = messageTextInput.value.trim();
    
    if (!message) {
        return;
    }
    
    if (message.length > 500) {
        showNotification('الرسالة طويلة جداً (الحد الأقصى 500 حرف)', 'warning');
        return;
    }
    
    // إرسال الرسالة
    socket.emit('chat-message', {
        message: message
    });
    
    // مسح حقل الإدخال
    messageTextInput.value = '';
    messageTextInput.focus();
}

function onMessageKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

// وظائف مساعدة
function showScreen(screenName) {
    // إخفاء جميع الشاشات
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    
    // إظهار الشاشة المطلوبة
    const targetScreen = document.getElementById(`${screenName}-screen`);
    if (targetScreen) {
        targetScreen.classList.add('active');
    }
}

function updateConnectionStatus(connected) {
    isConnected = connected;
    
    if (connected) {
        statusText.textContent = 'متصل';
        statusDot.classList.add('connected');
    } else {
        statusText.textContent = 'غير متصل';
        statusDot.classList.remove('connected');
    }
}

function updateUsersList(users) {
    usersListDiv.innerHTML = '';
    
    users.forEach(user => {
        addUserToList(user);
    });
}

function addUserToList(user) {
    const userElement = document.createElement('div');
    userElement.className = 'user-item';
    userElement.setAttribute('data-socket-id', user.socketId);
    
    const isCurrentUser = currentUser && user.socketId === socket.id;
    
    userElement.innerHTML = `
        <div class="user-avatar">
            ${user.username.charAt(0).toUpperCase()}
        </div>
        <div class="user-info">
            <div class="user-name">
                ${user.username} ${isCurrentUser ? '(أنت)' : ''}
            </div>
            <div class="user-status">متصل</div>
        </div>
    `;
    
    usersListDiv.appendChild(userElement);
}

function removeUserFromList(socketId) {
    const userElement = usersListDiv.querySelector(`[data-socket-id="${socketId}"]`);
    if (userElement) {
        userElement.remove();
    }
}

function updateUserCount(count) {
    userCountSpan.textContent = `المستخدمين: ${count}`;
}

function addMessageToChat(messageData) {
    const messageElement = document.createElement('div');
    messageElement.className = 'message';
    
    const isOwnMessage = currentUser && messageData.userId === currentUser.id;
    messageElement.classList.add(isOwnMessage ? 'own' : 'other');
    
    const timestamp = new Date(messageData.timestamp);
    const timeString = timestamp.toLocaleTimeString('ar-SA', {
        hour: '2-digit',
        minute: '2-digit'
    });
    
    messageElement.innerHTML = `
        <div class="message-header">
            ${isOwnMessage ? 'أنت' : messageData.username}
        </div>
        <div class="message-text">${escapeHtml(messageData.message)}</div>
        <div class="message-time">${timeString}</div>
    `;
    
    messagesDiv.appendChild(messageElement);
    
    // التمرير إلى أسفل
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    // تأثير صوتي (اختياري)
    if (!isOwnMessage) {
        playNotificationSound();
    }
}

function resetChat() {
    currentUser = null;
    currentRoom = null;
    usersListDiv.innerHTML = '';
    messagesDiv.innerHTML = '';
    userCountSpan.textContent = 'المستخدمين: 0';
    currentRoomSpan.textContent = '';
    usernameInput.value = '';
    roomIdInput.value = '';
    messageTextInput.value = '';
}

function generateRoomId() {
    return 'room-' + Math.random().toString(36).substr(2, 9);
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    notificationsDiv.appendChild(notification);
    
    // إزالة الإشعار بعد 5 ثوان
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 5000);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function playNotificationSound() {
    // يمكن إضافة صوت إشعار هنا
    try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBSuBzvLZiTYIG2m98OScTgwOUarm7rdkHAU5kdXzzHkrBSJ2yO/eizEIHWq+8+OWT');
        audio.volume = 0.1;
        audio.play().catch(() => {
            // تجاهل الأخطاء إذا لم يُسمح بتشغيل الصوت
        });
    } catch (e) {
        // تجاهل الأخطاء
    }
}

// تصدير الوظائف للاستخدام العام
window.VoiceChat = {
    joinRoom,
    leaveRoom,
    sendMessage,
    showNotification
};