# BuildIt 3D Game Generation Guidelines

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
- Test with 2 players joining/leaving