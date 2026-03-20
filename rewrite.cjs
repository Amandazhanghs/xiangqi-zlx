const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// Remove online mode from GameMode
content = content.replace("type GameMode = 'menu' | 'ai' | 'online' | 'local' | 'edit';", "type GameMode = 'menu' | 'ai' | 'local' | 'edit';");

// Remove socket state
content = content.replace(/  const \[roomId, setRoomId\] = useState\(''\);\n  const \[socket, setSocket\] = useState<WebSocket \| null>\(null\);\n  const \[socketConnected, setSocketConnected\] = useState\(false\);\n  const \[isWaiting, setIsWaiting\] = useState\(false\);\n/g, '');
content = content.replace(/  const \[creatorColor, setCreatorColor\] = useState<'red' \| 'black'>\('red'\);\n/g, '');

// Remove Socket setup useEffect
content = content.replace(/  \/\/ Socket setup\n  useEffect\(\(\) => \{[\s\S]*?  \}, \[mode\]\);\n/g, '');

// Remove socket.send from handleMove
content = content.replace(/      if \(mode === 'online' && socket\?\.readyState === WebSocket\.OPEN\) \{\n        socket\.send\(JSON\.stringify\(\{ type: 'move', payload: \{ roomId, move \} \}\)\);\n      \}\n/g, '');

// Remove socket.send from handleCheatAction
content = content.replace(/      if \(mode === 'online' && socket\?\.readyState === WebSocket\.OPEN\) \{\n        socket\.send\(JSON\.stringify\(\{\n          type: 'cheatAction',\n          payload: \{\n            roomId,\n            action: activeCheat,\n            payload: \{ r, c, piece: activeCheat === 'revive' \? revivePiece : undefined \}\n          \}\n        \}\)\);\n      \}\n/g, '');

// Remove createRoom and joinRoom
content = content.replace(/  const createRoom = \(\) => \{[\s\S]*?  \};\n\n  const joinRoom = \(e: React\.FormEvent<HTMLFormElement>\) => \{[\s\S]*?  \};\n/g, '');

// Remove online UI from menu
content = content.replace(/              <button\n                onClick=\{\(\) => setMode\('online'\)\}\n                className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-medium transition-colors"\n              >\n                联网对战\n              <\/button>\n/g, '');

// Remove online UI from return
content = content.replace(/      \{mode === 'online' && isWaiting && \([\s\S]*?      \}\)\n/g, '');
content = content.replace(/      \{mode === 'online' && !isWaiting && !roomId && \([\s\S]*?      \}\)\n/g, '');

// Remove online from gameOver button
content = content.replace(/\{mode === 'online' \? '返回主菜单' : '再来一局'\}/g, "'再来一局'");

fs.writeFileSync('src/App.tsx', content);
