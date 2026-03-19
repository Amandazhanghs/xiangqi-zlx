import express from "express";
import { createServer as createViteServer } from "vite";
import { Server } from "socket.io";
import { createServer } from "http";
import path from "path";

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
  const rooms = new Map<string, { players: string[]; state: any }>();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("createRoom", (roomId) => {
      if (!rooms.has(roomId)) {
        rooms.set(roomId, { players: [socket.id], state: null });
        socket.join(roomId);
        socket.emit("roomCreated", roomId);
        socket.emit("playerColor", "red");
      } else {
        socket.emit("error", "Room already exists");
      }
    });

    socket.on("joinRoom", (roomId) => {
      const room = rooms.get(roomId);
      if (room) {
        if (room.players.length < 2) {
          room.players.push(socket.id);
          socket.join(roomId);
          socket.emit("playerColor", "black");
          io.to(roomId).emit("gameStart", { roomId });
        } else {
          socket.emit("error", "Room is full");
        }
      } else {
        socket.emit("error", "Room not found");
      }
    });

    socket.on("move", ({ roomId, move }) => {
      socket.to(roomId).emit("opponentMove", move);
    });

    socket.on("cheatAction", ({ roomId, action, payload }) => {
      socket.to(roomId).emit("opponentCheatAction", { action, payload });
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      rooms.forEach((room, roomId) => {
        if (room.players.includes(socket.id)) {
          io.to(roomId).emit("playerDisconnected");
          rooms.delete(roomId);
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
