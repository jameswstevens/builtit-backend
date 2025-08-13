// Me The Most Simple - Client Side (3D)
class MeTheMostSimpleGame extends BaseGame {
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
const game = new MeTheMostSimpleGame('gameCanvas');
game.connectToGame('game_1755121331061').then(() => {
  game.startGameLoop();
});
