// Simple Socket.IO signaling server for WebRTC
// Usage: node server.js [port]

import http from 'http';
import { Server } from 'socket.io';

const port = Number(process.env.PORT || process.argv[2] || 3001);

const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Signaling server running');
});

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

io.on('connection', (socket) => {
  socket.on('join', () => {
    socket.broadcast.emit('user-joined', socket.id);
  });

  socket.on('offer', (payload) => {
    socket.to(payload.target).emit('offer', { from: socket.id, offer: payload.offer });
  });

  socket.on('answer', (payload) => {
    socket.to(payload.target).emit('answer', { answer: payload.answer });
  });

  socket.on('ice-candidate', (payload) => {
    socket.to(payload.target).emit('ice-candidate', { candidate: payload.candidate });
  });
});

server.listen(port, () => {
  console.log(`Signaling server listening on http://0.0.0.0:${port}`);
});


