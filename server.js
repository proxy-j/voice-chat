const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

const users = new Map();
const rooms = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('register', (username) => {
        users.set(socket.id, { username, socketId: socket.id });
        socket.emit('registered', { 
            socketId: socket.id, 
            username 
        });
        
        // Send updated user list to everyone
        broadcastUserList();
    });

    socket.on('join-room', (roomId) => {
        socket.join(roomId);
        
        if (!rooms.has(roomId)) {
            rooms.set(roomId, new Set());
        }
        rooms.get(roomId).add(socket.id);

        // Notify others in the room
        socket.to(roomId).emit('user-joined', {
            socketId: socket.id,
            username: users.get(socket.id)?.username
        });

        // Send list of existing users in room to the new joiner
        const usersInRoom = Array.from(rooms.get(roomId))
            .filter(id => id !== socket.id)
            .map(id => ({
                socketId: id,
                username: users.get(id)?.username
            }));

        socket.emit('existing-users', usersInRoom);
        
        console.log(`${socket.id} joined room ${roomId}`);
    });

    socket.on('signal', ({ to, signal, from }) => {
        io.to(to).emit('signal', {
            signal,
            from
        });
    });

    socket.on('leave-room', (roomId) => {
        socket.leave(roomId);
        if (rooms.has(roomId)) {
            rooms.get(roomId).delete(socket.id);
            if (rooms.get(roomId).size === 0) {
                rooms.delete(roomId);
            }
        }
        socket.to(roomId).emit('user-left', socket.id);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // Remove from all rooms
        rooms.forEach((userSet, roomId) => {
            if (userSet.has(socket.id)) {
                userSet.delete(socket.id);
                socket.to(roomId).emit('user-left', socket.id);
                if (userSet.size === 0) {
                    rooms.delete(roomId);
                }
            }
        });

        users.delete(socket.id);
        broadcastUserList();
    });

    function broadcastUserList() {
        const userList = Array.from(users.values());
        io.emit('user-list', userList);
    }
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
