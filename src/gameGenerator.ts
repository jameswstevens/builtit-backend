import { query, type SDKMessage } from "@anthropic-ai/claude-code";
import * as fs from "fs/promises";
import * as path from "path";

interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

export async function generateGame(prompt: string): Promise<{ gameName: string; gameId: string; message?: string }> {
  const gameId = `game_${Date.now()}`;
  const gameName = extractGameName(prompt);
  const gamePath = path.join(__dirname, '../games', gameId);
  
  // Create game directory - Claude will work directly here
  await fs.mkdir(gamePath, { recursive: true });
  
  // Create minimal template files
  const clientTemplate = `// ${gameName} - Client Side (3D)
class ${gameName.replace(/\s+/g, '')}Game extends BaseGame {
  constructor(canvasId) {
    super(canvasId);
  }
  
  setupScene() {
    // CRITICAL: Initialize player model system first!
    this.playerModel = new PlayerModel(this.scene);
    
    // Create ground
    this.createGround(40);
    
    // Add some basic lighting
    const light = new BABYLON.DirectionalLight("dirLight", 
      new BABYLON.Vector3(-1, -2, -1), this.scene);
    light.intensity = 0.5;
    
    // Add game-specific objects here
  }
  
  onStateUpdate(state) {
    // Handle player creation and updates
    state.players.forEach((player, id) => {
      // Check if player mesh exists
      if (!this.playerModel.getPlayerMesh(id)) {
        // Create new player
        this.playerModel.loadPlayerModel(id, {
          x: player.x,
          y: player.y,
          z: player.z
        });
        
        // Set as current player if it's us
        if (id === this.room.sessionId) {
          this.currentPlayer = this.playerModel.getPlayerMesh(id);
          this.mySessionId = id;
        }
      }
    });
    
    // Update all player positions
    this.handlePlayerUpdates(state.players);
    
    // Remove disconnected players
    // Note: PlayerModel stores models in a Map, we need to check each one
    const playerIds = Array.from(this.playerModel.models.keys());
    playerIds.forEach(id => {
      if (!state.players.has(id)) {
        this.playerModel.removePlayerModel(id);
        if (id === this.mySessionId) {
          this.currentPlayer = null;
        }
      }
    });
  }
  
  onDisconnect() {
    console.log("Disconnected from game");
  }
  
  update() {
    // Game-specific update logic
    // Called before each render
  }
}

// Initialize and connect
const game = new ${gameName.replace(/\s+/g, '')}Game('gameCanvas');
game.connectToGame('${gameId}').then(() => {
  game.startGameLoop();
});
`;

  const roomTemplate = `// ${gameName} - Server Room
import { Room, Client } from "colyseus";
import { GameState, Player } from "./state";

export class ${gameName.replace(/\s+/g, '')}Room extends Room<GameState> {
  maxClients = 4;

  onCreate(options: any) {
    this.setState(new GameState());
    
    // Set up message handlers
    this.onMessage("move", (client, data) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.x = data.x;
        player.y = data.y;
        player.z = data.z;
        player.rotation = data.rotation;
        player.isMoving = true;
      }
    });
    
    this.onMessage("stopMove", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (player) {
        player.isMoving = false;
      }
    });
    
    // Start game loop (60 FPS)
    this.setSimulationInterval((deltaTime) => this.update(deltaTime), 1000 / 60);
  }

  onJoin(client: Client, options: any) {
    console.log(\`Player \${client.sessionId} joined\`);
    
    const player = new Player();
    player.id = client.sessionId;
    player.x = Math.random() * 10 - 5;
    player.y = 0;
    player.z = Math.random() * 10 - 5;
    player.rotation = 0;
    
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client, consented: boolean) {
    console.log(\`Player \${client.sessionId} left\`);
    this.state.players.delete(client.sessionId);
  }

  update(deltaTime: number) {
    // Update game logic here
    // This is called 60 times per second
  }
}
`;

  const stateTemplate = `// ${gameName} - Game State
import { Schema, type, MapSchema } from "@colyseus/schema";

export class Player extends Schema {
  @type("string") id: string = "";
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") z: number = 0;
  @type("number") rotation: number = 0;
  @type("number") score: number = 0;
  @type("boolean") ready: boolean = false;
  @type("boolean") isMoving: boolean = false;
}

export class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type("boolean") gameStarted: boolean = false;
  @type("string") winnerId: string = "";
  
  // Add additional game state properties here with @type decorators
}
`;

  const indexTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${gameName}</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background-color: #0a0a0a;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            font-family: Arial, sans-serif;
            overflow: hidden;
        }
        
        #gameCanvas {
            width: 100vw;
            height: 100vh;
            display: block;
        }
        
        .game-info {
            position: absolute;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            color: white;
            font-size: 24px;
            text-align: center;
            z-index: 10;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
        }
    </style>
</head>
<body>
    <div class="game-info">
        <h1>${gameName}</h1>
        <div id="status">Waiting for players...</div>
    </div>
    
    <canvas id="gameCanvas"></canvas>
    
    <script src="https://unpkg.com/colyseus.js@^0.16.0/dist/colyseus.js"></script>
    <script src="https://cdn.babylonjs.com/babylon.js"></script>
    <script src="https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js"></script>
    <script src="https://cdn.babylonjs.com/gui/babylon.gui.min.js"></script>
    <script src="https://cdn.babylonjs.com/materialsLibrary/babylonjs.materials.min.js"></script>
    <!-- Core Game Scripts -->
    <script src="../../shared/BaseGame.js"></script>
    <script src="../../shared/PlayerModel.js"></script>
    
    <!-- Platform Layer -->
    <script src="../../platform/NetworkManager.js"></script>
    <script src="../../platform/InputManager.js"></script>
    <script src="../../platform/UIKit.js"></script>
    <script src="../../platform/PlatformServices.js"></script>
    <script src="../../platform/PlatformUI.js"></script>
    <link rel="stylesheet" href="../../platform/styles/platform.css">
    
    <!-- Game Client -->
    <script src="client.js"></script>
    
    <!-- Initialize Platform -->
    <script>
        // Initialize platform UI after page loads
        window.addEventListener('load', () => {
            // Small delay to ensure all scripts are loaded
            setTimeout(() => {
                if (window.PlatformUI && window.PlatformUI.init) {
                    window.PlatformUI.init({
                        gameId: '${gameId}',
                        showImprove: true,
                        showChat: false  // Chat not implemented yet
                    });
                } else {
                    console.error('PlatformUI not loaded');
                }
            }, 100);
        });
    </script>
</body>
</html>
`;

  // Create Claude.md file with game-specific instructions
  const claudeMdContent = `# BuildIt 3D Game Generation Guidelines

## Project Context
- Platform: BuildIt multiplayer game framework using Colyseus and Babylon.js
- Language: TypeScript 4.9.5 (strict mode enabled) - DO NOT use TypeScript 5.x
- 3D Engine: Babylon.js for all client-side rendering

## Shared Files (READ-ONLY)
The 'shared' folder contains READ-ONLY framework files that you can read but MUST NOT modify:
- BaseGame.js - Client-side base class with camera, movement, and player handling
- PlayerModel.js - Player model management system (creates Roblox-style characters)

IMPORTANT: These files are for reference only. DO NOT attempt to edit them - they have chmod 444 (read-only) permissions.

## Game Implementation Checklist

### Before Starting
1. READ THE SHARED FILES FIRST - especially shared/BaseGame.js to understand available methods

### 3D Game Specifics
1. BaseGame provides:
   - this.scene - Babylon.js scene
   - this.camera - Third-person camera that follows the player automatically
   - this.engine - Babylon.js engine
   - this.gui - GUI layer for UI elements
   - this.playerModel - MUST be initialized in setupScene()!
   - Helper methods: createGround(), createBox(), createSphere()

2. CRITICAL: You MUST do these in setupScene():
   - First line MUST be: this.playerModel = new PlayerModel(this.scene);
   - Then create your game world (ground, objects, etc.)

3. In onStateUpdate(), you MUST:
   - Check if player exists: if (!this.playerModel.getPlayerMesh(id))
   - Create player models: this.playerModel.loadPlayerModel(id, {x: player.x, y: player.y, z: player.z})
   - Set currentPlayer: if (id === this.room.sessionId) this.currentPlayer = this.playerModel.getPlayerMesh(id)
   - Update positions: this.handlePlayerUpdates(state.players)
   - Clean up: if (!state.players.has(id)) this.playerModel.removePlayerModel(id)
   - NEVER use: getPlayer, createPlayer, removePlayer (these don't exist!)

4. The update() method is called before each render
5. No need to call scene.render() - BaseGame handles this

### State Management
The template already includes a working Player and GameState schema with all required @type decorators:
- Player has: id, x, y, z, rotation, score, ready, isMoving
- GameState has: players (MapSchema), gameStarted, winnerId
- You can ADD new properties but MUST include @type decorators for each

### Common Mistakes to Avoid
1. ALL state properties MUST have @type decorators
2. Remember Y is up in Babylon.js (not Z)
3. The room already handles basic movement - build on top of it
4. Helper functions that create meshes MUST return the created object
   - Example: createGoal() must end with: return goal;
5. To iterate over active players, use: Array.from(this.playerModel.models.keys())
   - DO NOT use getActivePlayerIds() - it doesn't exist!

## Testing Approach
- Your code WILL be tested with TypeScript compiler before acceptance
- Ensure TypeScript compilation succeeds with --strict flag
- Check all abstract methods are implemented
- Verify state properties have @type decorators
- Test with 2 players joining/leaving`;

  // Write template files directly to game directory
  await fs.writeFile(path.join(gamePath, 'CLAUDE.md'), claudeMdContent);
  await fs.writeFile(path.join(gamePath, 'client.js'), clientTemplate);
  await fs.writeFile(path.join(gamePath, 'room.ts'), roomTemplate);
  await fs.writeFile(path.join(gamePath, 'state.ts'), stateTemplate);
  await fs.writeFile(path.join(gamePath, 'index.html'), indexTemplate);
  
  // Copy shared files as read-only to prevent modification
  const sharedSourcePath = path.join(__dirname, '../shared');
  const sharedDestPath = path.join(gamePath, 'shared');
  
  // Create shared directory in game folder
  await fs.mkdir(sharedDestPath, { recursive: true });
  
  // List of shared files to copy (only files Claude needs to understand)
  const sharedFiles = [
    'BaseGame.js',
    'PlayerModel.js'
  ];
  
  // Copy each file and make it read-only
  for (const file of sharedFiles) {
    const sourcePath = path.join(sharedSourcePath, file);
    const destPath = path.join(sharedDestPath, file);
    
    // Copy the file
    await fs.copyFile(sourcePath, destPath);
    
    // Make it read-only (444 = r--r--r--)
    await fs.chmod(destPath, 0o444);
    console.log(`   📁 Copied ${file} as read-only`);
  }
  
  try {
    // Check if API key is set
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    
    // Base class files are documented in CLAUDE.md instead of including them directly
    
    const messages: SDKMessage[] = [];
    let sessionId: string | undefined;
    let totalCostUSD: number = 0;
    
    // Initialize token tracking
    let totalTokenUsage: TokenUsage = {
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0
    };
    let stepCount = 0;
    
    console.log('🔢 Generation Token Usage Tracking Started');
    console.log('========================================');
    
    const generatePrompt = `You are an expert game developer creating 3D multiplayer games for the BuildIt platform. 

    Create a 3D multiplayer game called "${gameName}" based on this description: ${prompt}
    Reference the shared base files and build the game on top of them. I provided you the files you should edit, make sure you fill out the required fields.`;
    
    console.log('Starting game generation for:', gameName);
    console.log('Game directory:', gamePath);
    
    // Run Claude Code SDK directly in game directory
    for await (const message of query({
      prompt: generatePrompt,
      options: {
        maxTurns: 50,
        cwd: gamePath,  // Work directly in the game directory
        allowedTools: ["Read", "Write", "MultiEdit", "Bash"],
      },
    })) {
      messages.push(message);
      
      // Track token usage from assistant messages (per-step tracking)
      if (message.type === 'assistant' && message.message && (message.message as any).usage) {
        stepCount++;
        const usage = (message.message as any).usage as TokenUsage;
        
        // Log current step usage
        console.log(`\n📊 Step ${stepCount} Token Usage:`);
        console.log(`   Input: ${usage.input_tokens || 0} tokens`);
        console.log(`   Output: ${usage.output_tokens || 0} tokens`);
        if (usage.cache_creation_input_tokens) {
          console.log(`   Cache Creation: ${usage.cache_creation_input_tokens} tokens`);
        }
        if (usage.cache_read_input_tokens) {
          console.log(`   Cache Read: ${usage.cache_read_input_tokens} tokens`);
        }
        console.log(`   Step Total: ${(usage.input_tokens || 0) + (usage.output_tokens || 0)} tokens`);
        
        // Accumulate totals
        totalTokenUsage.input_tokens += usage.input_tokens || 0;
        totalTokenUsage.output_tokens += usage.output_tokens || 0;
        if (usage.cache_creation_input_tokens) {
          totalTokenUsage.cache_creation_input_tokens! += usage.cache_creation_input_tokens;
        }
        if (usage.cache_read_input_tokens) {
          totalTokenUsage.cache_read_input_tokens! += usage.cache_read_input_tokens;
        }
        
        console.log(`   Running Total: ${totalTokenUsage.input_tokens + totalTokenUsage.output_tokens} tokens`);
      }
      
      // Also track final usage from result message
      if (message.type === 'result' && 'usage' in message) {
        const resultMessage = message as any;
        totalCostUSD = resultMessage.total_cost_usd;
        console.log('\n========================================');
        console.log('📊 Final Generation Query Usage:');
        console.log(`   Total Input: ${resultMessage.usage.input_tokens} tokens`);
        console.log(`   Total Output: ${resultMessage.usage.output_tokens} tokens`);
        console.log(`   Total Cost: $${totalCostUSD.toFixed(4)}`);
        console.log(`   Duration: ${(resultMessage.duration_ms / 1000).toFixed(2)}s`);
        console.log(`   Turns: ${resultMessage.num_turns}`);
        console.log('========================================\n');
      }
      
      // Log high-level progress
      if (message.type === 'assistant' && message.message.content) {
        // Extract tool uses from the message
        const toolUses = message.message.content.filter((c: any) => c.type === 'tool_use');
        for (const toolUse of toolUses) {
          const toolName = toolUse.name;
          const input = toolUse.input;
          
          if (toolName === 'Write' || toolName === 'MultiEdit') {
            console.log(`📝 Creating/Editing file: ${input.file_path || 'file'}`);
          } else if (toolName === 'Read') {
            console.log(`📖 Reading file: ${input.file_path || 'file'}`);
          }
        }
        
        // Log text responses
        const textContent = message.message.content.find((c: any) => c.type === 'text');
        if (textContent && textContent.text) {
          // Extract first line or summary
          const firstLine = textContent.text.split('\n')[0].substring(0, 100);
          if (firstLine.length > 0) {
            console.log(`💭 Claude: ${firstLine}${firstLine.length >= 100 ? '...' : ''}`);
          }
        }
      }
      
      // Log result messages
      if (message.type === 'result') {
        console.log('✅ Generation completed with status:', message.subtype);
        if (message.subtype === 'error_max_turns') {
          console.log('⚠️  Reached maximum turns limit');
        } else if (message.subtype === 'error_during_execution') {
          console.log('❌ Error occurred during generation');
        }
      }
      
      // Log system messages and capture session ID
      if (message.type === 'system' && message.subtype === 'init') {
        sessionId = message.session_id;
        console.log('🚀 Claude Code initialized');
        console.log('   Session ID:', sessionId);
        console.log('   Available tools:', message.tools.join(', '));
      }
      
      // Capture session ID from all message types (as backup)
      if ('session_id' in message && message.session_id) {
        sessionId = message.session_id;
      }
    }
    
    // Verify all required files were generated
    const requiredFiles = ['client.js', 'room.ts', 'state.ts', 'index.html'];
    const generatedFiles = await fs.readdir(gamePath);
    console.log('Files in game directory:', generatedFiles);
    
    let missingFiles = [];
    for (const file of requiredFiles) {
      try {
        await fs.access(path.join(gamePath, file));
      } catch {
        missingFiles.push(file);
      }
    }
    
    if (missingFiles.length > 0) {
      console.error('Missing required files:', missingFiles);
      throw new Error(`Failed to generate required files: ${missingFiles.join(', ')}`);
    }
    
    // Fix import paths if needed (Claude might use ./shared/ instead of ../../shared/)
    for (const file of requiredFiles) {
      if (file.endsWith('.ts') || file.endsWith('.js')) {
        const filePath = path.join(gamePath, file);
        let content = await fs.readFile(filePath, 'utf8');
        
        // Fix import paths to use relative path to shared
        if (content.includes('./shared/')) {
          content = content.replace(/from\s+["']\.\/shared\//g, 'from "../../shared/');
          await fs.writeFile(filePath, content);
        }
      }
    }
    
    // Save game metadata with session ID
    const metadata = {
      id: gameId,
      name: gameName,
      description: `AI-generated 3D game: ${prompt.substring(0, 100)}...`,
      icon: '🎯',
      createdAt: new Date().toISOString(),
      claudeSessionId: sessionId,  // Store the actual session ID
      hasActiveSession: !!sessionId,
      improvementCount: 0
    };
    
    await fs.writeFile(
      path.join(gamePath, 'metadata.json'),
      JSON.stringify(metadata, null, 2)
    );
    
    // Log final accumulated token summary
    if (stepCount > 0) {
      console.log('\n========================================');
      console.log('🎯 Accumulated Token Usage Summary:');
      console.log(`   Total Input Tokens: ${totalTokenUsage.input_tokens}`);
      console.log(`   Total Output Tokens: ${totalTokenUsage.output_tokens}`);
      if (totalTokenUsage.cache_creation_input_tokens) {
        console.log(`   Cache Creation Tokens: ${totalTokenUsage.cache_creation_input_tokens}`);
      }
      if (totalTokenUsage.cache_read_input_tokens) {
        console.log(`   Cache Read Tokens: ${totalTokenUsage.cache_read_input_tokens}`);
      }
      console.log(`   Grand Total: ${totalTokenUsage.input_tokens + totalTokenUsage.output_tokens} tokens`);
      console.log(`   Total Steps: ${stepCount}`);
      console.log(`   Average per Step: ${Math.round((totalTokenUsage.input_tokens + totalTokenUsage.output_tokens) / stepCount)} tokens`);
      console.log(`   💰 Total Cost: $${totalCostUSD.toFixed(4)}`);
      console.log('========================================\n');
    }
    
    console.log(`✅ Game created successfully with persistent Claude session`);
    console.log(`   Game ID: ${gameId}`);
    console.log(`   Location: ${gamePath}`);
    console.log(`   Session: ${gamePath}/.claude`);
    
    return { 
      gameName, 
      gameId
    };
    
  } catch (error) {
    // Clean up on error - only remove game directory
    await fs.rm(gamePath, { recursive: true, force: true });
    throw error;
  }
}

function extractGameName(prompt: string): string {
  // Try to extract a game name from the prompt
  const nameMatch = prompt.match(/(?:create|make|build|design)\s+(?:a|an)?\s*"?([^"]+)"?\s*(?:game|multiplayer)/i);
  if (nameMatch && nameMatch[1]) {
    return nameMatch[1].trim()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }
  
  // Fallback to generic name
  return `Game ${Date.now() % 1000}`;
}