"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const colyseus_1 = require("colyseus");
const http_1 = require("http");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const fs = __importStar(require("fs/promises"));
const gameGenerator_1 = require("./gameGenerator");
const gameImprover_1 = require("./gameImprover");
const dotenv_1 = __importDefault(require("dotenv"));
// Load environment variables from .env file
dotenv_1.default.config();
const port = Number(process.env.PORT || 3000);
const app = (0, express_1.default)();
// Simple CORS setup - allow everything in development
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Serve shared files
app.use('/shared', express_1.default.static(path_1.default.join(__dirname, '../shared')));
// Serve platform files
app.use('/platform', express_1.default.static(path_1.default.join(__dirname, '../platform')));
// Serve tools files
app.use('/tools', express_1.default.static(path_1.default.join(__dirname, '../tools')));
// Serve each game
app.use('/games/:gameId', (req, res, next) => {
    const gamePath = path_1.default.join(__dirname, '../games', req.params.gameId);
    express_1.default.static(gamePath)(req, res, next);
});
// API endpoint to list all games
app.get('/api/games', async (req, res) => {
    const gamesDir = path_1.default.join(__dirname, '../games');
    const games = [];
    try {
        const gameDirectories = await fs.readdir(gamesDir);
        for (const gameId of gameDirectories) {
            const gamePath = path_1.default.join(gamesDir, gameId);
            const stats = await fs.stat(gamePath);
            if (stats.isDirectory()) {
                // Check if index.html exists
                try {
                    await fs.access(path_1.default.join(gamePath, 'index.html'));
                    // Try to read game metadata
                    let gameName = gameId;
                    let description = '';
                    let icon = '🎮';
                    // Special cases for built-in games
                    if (gameId === 'pong') {
                        gameName = 'Pong';
                        description = 'Classic arcade action! Control your paddle to bounce the ball past your opponent. First to 5 points wins!';
                        icon = '🏓';
                    }
                    else if (gameId === 'snake') {
                        gameName = 'Snake';
                        description = 'Competitive snake game! Eat food to grow longer while avoiding walls and your opponent. Last snake slithering wins!';
                        icon = '🐍';
                    }
                    else {
                        // For generated games, try to read metadata
                        try {
                            const metadataPath = path_1.default.join(gamePath, 'metadata.json');
                            const metadataContent = await fs.readFile(metadataPath, 'utf-8');
                            const metadata = JSON.parse(metadataContent);
                            gameName = metadata.name || gameId;
                            description = metadata.description || 'AI-generated 3D multiplayer game';
                            icon = metadata.icon || '🎯';
                        }
                        catch (err) {
                            // Fallback if no metadata
                            const match = gameId.match(/game_(\d+)/);
                            if (match) {
                                gameName = `Game ${match[1]}`;
                                description = 'AI-generated 3D multiplayer game';
                                icon = '🎯';
                            }
                        }
                    }
                    games.push({
                        id: gameId,
                        name: gameName,
                        description: description,
                        icon: icon,
                        url: `/games/${gameId}/`
                    });
                }
                catch (err) {
                    // Skip if no index.html
                }
            }
        }
        res.json(games);
    }
    catch (error) {
        console.error('Error listing games:', error);
        res.status(500).json({ error: 'Failed to list games' });
    }
});
// Game generation API endpoint
app.post('/api/generate-game', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({ error: 'Invalid prompt' });
        }
        const result = await (0, gameGenerator_1.generateGame)(prompt);
        // Dynamically register the new game room
        try {
            const roomModule = await Promise.resolve(`${`../games/${result.gameId}/room`}`).then(s => __importStar(require(s)));
            const RoomClass = roomModule[`${result.gameName.replace(/\s+/g, '')}Room`] || roomModule.default;
            gameServer.define(result.gameId, RoomClass);
            console.log(`Registered new game room: ${result.gameId}`);
        }
        catch (error) {
            console.error('Failed to register game room:', error);
            return res.status(500).json({ error: 'Game created but failed to register room' });
        }
        res.json(result);
    }
    catch (error) {
        console.error('Game generation error:', error);
        res.status(500).json({ error: 'Failed to generate game' });
    }
});
// Game improvement API endpoint
app.post('/api/improve-game', async (req, res) => {
    try {
        const { gameId, prompt } = req.body;
        if (!gameId || typeof gameId !== 'string') {
            return res.status(400).json({ error: 'Invalid game ID' });
        }
        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({ error: 'Invalid prompt' });
        }
        // Use the new improveGame function from gameImprover.ts
        const result = await (0, gameImprover_1.improveGame)(gameId, prompt);
        if (result.success) {
            // Re-register the improved game room
            try {
                // Clear the module cache to reload the updated room
                const roomPath = path_1.default.join(__dirname, `../games/${gameId}/room`);
                delete require.cache[require.resolve(roomPath)];
                const roomModule = await Promise.resolve(`${`../games/${gameId}/room`}`).then(s => __importStar(require(s)));
                // Try to find the room class - it might have various names
                const roomKeys = Object.keys(roomModule);
                const RoomClass = roomModule.default ||
                    roomModule[roomKeys.find(k => k.includes('Room')) || ''] ||
                    roomModule[Object.keys(roomModule)[0]];
                if (RoomClass) {
                    gameServer.define(gameId, RoomClass);
                    console.log(`Re-registered improved game room: ${gameId}`);
                }
            }
            catch (error) {
                console.error('Failed to re-register game room:', error);
                // Not a critical error - the game may still work
            }
        }
        res.json(result);
    }
    catch (error) {
        console.error('Game improvement error:', error);
        res.status(500).json({ error: 'Failed to improve game' });
    }
});
// Get game session info
app.get('/api/games/:gameId/session', async (req, res) => {
    try {
        const sessionInfo = await (0, gameImprover_1.getGameSessionInfo)(req.params.gameId);
        res.json(sessionInfo);
    }
    catch (error) {
        res.status(404).json({ error: error instanceof Error ? error.message : 'Game not found' });
    }
});
// List all games with session information
app.get('/api/games-with-sessions', async (req, res) => {
    try {
        const games = await (0, gameImprover_1.listGamesWithSessions)();
        res.json(games);
    }
    catch (error) {
        console.error('Error listing games with sessions:', error);
        res.status(500).json({ error: 'Failed to list games' });
    }
});
// Serve lobby  
app.use('/', express_1.default.static(path_1.default.join(__dirname, '../public')));
const server = (0, http_1.createServer)(app);
const gameServer = new colyseus_1.Server({
    server,
});
// Register dynamically generated games
async function registerGeneratedGames() {
    const gamesDir = path_1.default.join(__dirname, '../games');
    try {
        const gameDirectories = await fs.readdir(gamesDir);
        for (const gameId of gameDirectories) {
            // Check if it's a directory and has a room.ts file
            const gamePath = path_1.default.join(gamesDir, gameId);
            const stats = await fs.stat(gamePath);
            if (stats.isDirectory()) {
                const roomPath = path_1.default.join(gamePath, 'room.ts');
                try {
                    await fs.access(roomPath);
                    // Import and register the room
                    const roomModule = await Promise.resolve(`${`../games/${gameId}/room`}`).then(s => __importStar(require(s)));
                    const RoomClass = Object.values(roomModule).find((exported) => exported.prototype && exported.prototype.onCreate) || roomModule.default;
                    if (RoomClass) {
                        gameServer.define(gameId, RoomClass);
                        console.log(`Registered generated game room: ${gameId}`);
                    }
                }
                catch (error) {
                    console.warn(`Failed to register game ${gameId}:`, error);
                }
            }
        }
    }
    catch (error) {
        console.error('Error scanning games directory:', error);
    }
}
// Register generated games and then start the server
registerGeneratedGames().then(() => {
    gameServer.listen(port);
});
console.log(`Listening on ws://localhost:${port}`);
