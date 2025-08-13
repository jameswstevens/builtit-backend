// Game 896 - Game State
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
