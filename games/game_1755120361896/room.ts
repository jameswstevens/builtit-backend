// Game 896 - Server Room
import { Room, Client } from "colyseus";
import { GameState, Player } from "./state";

export class Game896Room extends Room<GameState> {
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
    console.log(`Player ${client.sessionId} joined`);
    
    const player = new Player();
    player.id = client.sessionId;
    player.x = Math.random() * 10 - 5;
    player.y = 0;
    player.z = Math.random() * 10 - 5;
    player.rotation = 0;
    
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client, consented: boolean) {
    console.log(`Player ${client.sessionId} left`);
    this.state.players.delete(client.sessionId);
  }

  update(deltaTime: number) {
    // Update game logic here
    // This is called 60 times per second
  }
}
