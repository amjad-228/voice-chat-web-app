const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// إعداد الملفات الثابتة
app.use(express.static(path.join(__dirname, 'public')));

// متغيرات لتخزين بيانات الغرف والمستخدمين
const rooms = new Map();
const users = new Map();

// الصفحة الرئيسية
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// معالجة اتصالات Socket.io
io.on('connection', (socket) => {
  console.log('مستخدم جديد متصل:', socket.id);

  // انضمام المستخدم إلى غرفة
  socket.on('join-room', (data) => {
    const { roomId, username } = data;
    
    // إنشاء معرف فريد للمستخدم
    const userId = uuidv4();
    
    // حفظ بيانات المستخدم
    users.set(socket.id, {
      id: userId,
      username: username,
      roomId: roomId,
      socketId: socket.id
    });

    // إنشاء الغرفة إذا لم تكن موجودة
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        id: roomId,
        users: new Map(),
        createdAt: new Date()
      });
    }

    const room = rooms.get(roomId);
    room.users.set(socket.id, users.get(socket.id));

    // انضمام المستخدم إلى الغرفة
    socket.join(roomId);

    // إشعار المستخدمين الآخرين في الغرفة
    socket.to(roomId).emit('user-joined', {
      userId: userId,
      username: username,
      socketId: socket.id
    });

    // إرسال قائمة المستخدمين الحاليين للمستخدم الجديد
    const roomUsers = Array.from(room.users.values()).map(user => ({
      id: user.id,
      username: user.username,
      socketId: user.socketId
    }));

    socket.emit('room-users', roomUsers);
    socket.emit('joined-room', { roomId, userId, username });

    console.log(`${username} انضم إلى الغرفة ${roomId}`);
  });

  // معالجة إشارات WebRTC
  socket.on('webrtc-signal', (data) => {
    const { targetSocketId, signal, type } = data;
    socket.to(targetSocketId).emit('webrtc-signal', {
      signal: signal,
      type: type,
      fromSocketId: socket.id
    });
  });

  // معالجة الرسائل النصية
  socket.on('chat-message', (data) => {
    const user = users.get(socket.id);
    if (user) {
      const messageData = {
        id: uuidv4(),
        username: user.username,
        message: data.message,
        timestamp: new Date(),
        userId: user.id
      };
      
      // إرسال الرسالة لجميع المستخدمين في الغرفة
      io.to(user.roomId).emit('chat-message', messageData);
    }
  });

  // معالجة قطع الاتصال
  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    
    if (user) {
      const { roomId, username } = user;
      
      // إزالة المستخدم من الغرفة
      if (rooms.has(roomId)) {
        const room = rooms.get(roomId);
        room.users.delete(socket.id);
        
        // إشعار المستخدمين الآخرين
        socket.to(roomId).emit('user-left', {
          username: username,
          socketId: socket.id
        });

        // حذف الغرفة إذا كانت فارغة
        if (room.users.size === 0) {
          rooms.delete(roomId);
          console.log(`تم حذف الغرفة ${roomId} لأنها فارغة`);
        }
      }
      
      // إزالة المستخدم من القائمة
      users.delete(socket.id);
      
      console.log(`${username} غادر التطبيق`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`الخادم يعمل على المنفذ ${PORT}`);
  console.log(`افتح المتصفح على: http://localhost:${PORT}`);
});