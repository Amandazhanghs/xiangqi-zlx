import express from "express";
import { createServer as createViteServer } from "vite";
import { Server } from "socket.io";
import { createServer } from "http";
import path from "path";

interface Room {
  players: string[];
  state: any;
  creatorColor: 'red' | 'black';
}

async function startServer() {
  const app = express();
  const PORT = 3000;
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Socket.io logic
  const rooms = new Map<string, Room>();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("createRoom", ({ roomId, color }: { roomId: string; color: 'red' | 'black' }) => {
      if (!rooms.has(roomId)) {
        const creatorColor: 'red' | 'black' = color === 'black' ? 'black' : 'red';
        rooms.set(roomId, { players: [socket.id], state: null, creatorColor });
        socket.join(roomId);
        socket.emit("roomCreated", roomId);
        socket.emit("playerColor", creatorColor);
        console.log(`Room ${roomId} created by ${socket.id}, creator plays ${creatorColor}`);
      } else {
        socket.emit("error", "Room already exists");
      }
    });

    socket.on("joinRoom", (roomId: string) => {
      const room = rooms.get(roomId);
      if (room) {
        if (room.players.length < 2) {
          room.players.push(socket.id);
          socket.join(roomId);
          // Joiner gets the opposite color of the creator
          const joinerColor: 'red' | 'black' = room.creatorColor === 'red' ? 'black' : 'red';
          socket.emit("playerColor", joinerColor);
          io.to(roomId).emit("gameStart", { roomId });
          console.log(`${socket.id} joined room ${roomId}, plays ${joinerColor}`);
        } else {
          socket.emit("error", "Room is full");
        }
      } else {
        socket.emit("error", "Room not found");
      }
    });

    socket.on("move", ({ roomId, move }: { roomId: string; move: any }) => {
      socket.to(roomId).emit("opponentMove", move);
    });

    socket.on("cheatAction", ({ roomId, action, payload }: { roomId: string; action: string; payload: any }) => {
      socket.to(roomId).emit("opponentCheatAction", { action, payload });
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      rooms.forEach((room, roomId) => {
        if (room.players.includes(socket.id)) {
          io.to(roomId).emit("playerDisconnected");
          rooms.delete(roomId);
          console.log(`Room ${roomId} deleted due to disconnect`);
        }
      });
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
