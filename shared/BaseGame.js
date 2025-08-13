class BaseGame {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.engine = new BABYLON.Engine(this.canvas, true);
    this.scene = null;
    this.camera = null;
    this.light = null;
    this.client = new Colyseus.Client('ws://localhost:3001');
    this.room = null;
    this.mySessionId = null;
    this.gameState = null;
    this.gui = null;
    this.playerModel = null;
    
    // Camera controls
    this.cameraRadius = 8; // Distance from player
    this.cameraHeight = 6; // Height above player
    this.cameraRotation = 0; // Horizontal rotation around player
    this.isMouseDown = false;
    this.lastMouseX = 0;
    this.cameraTargetPosition = null; // Stable position for camera tracking
    
    // Movement controls
    this.keys = {};
    this.currentPlayer = null;
    this.moveSpeed = 5; // Units per second (industry standard)
    
    // Jump physics
    this.isJumping = false;
    this.jumpVelocity = 0;
    this.jumpPower = 0.3;
    this.gravity = -0.015;
    this.groundLevel = 0;
    
    // Handle window resize
    window.addEventListener('resize', () => {
      this.engine.resize();
    });
  }

  async connectToGame(roomName) {
    try {
      this.room = await this.client.joinOrCreate(roomName);
      this.mySessionId = this.room.sessionId;
      
      // Standard handlers every game needs
      this.room.onStateChange((state) => {
        this.gameState = state;
        this.onStateUpdate(state);
      });
      
      this.room.onLeave(() => {
        this.onDisconnect();
      });

      this.setupMessageHandlers();
    } catch (error) {
      console.error('Failed to connect to game:', error);
      throw error;
    }
  }

  setupMessageHandlers() {
    // Override in child classes to add custom message handlers
  }

  sendInput(type, data) {
    if (this.room) {
      this.room.send(type, data);
    }
  }

  initializeScene() {
    // Create scene
    this.scene = new BABYLON.Scene(this.engine);
    
    // Create default camera
    this.camera = new BABYLON.UniversalCamera('camera', new BABYLON.Vector3(0, 5, -10), this.scene);
    this.camera.setTarget(BABYLON.Vector3.Zero());
    this.camera.detachControl(this.canvas); // We'll use custom controls
    
    // Create default light
    this.light = new BABYLON.HemisphericLight('light', new BABYLON.Vector3(0, 1, 0), this.scene);
    this.light.intensity = 0.7;
    
    // Create GUI layer
    this.gui = BABYLON.GUI.AdvancedDynamicTexture.CreateFullscreenUI('UI');
    
    // Initialize player model system
    this.playerModel = new PlayerModel(this.scene);
    
    // Setup input controls
    this.setupInputControls();
    
    // Initialize game-specific scene elements
    this.setupScene();
  }

  startGameLoop() {
    this.initializeScene();
    
    // Start render loop
    this.engine.runRenderLoop(() => {
      // Update animations
      if (this.playerModel) {
        this.playerModel.updateAnimation(this.scene.deltaTime);
      }
      
      // Handle base movement controls
      this.handleMovement();
      
      // Update camera
      this.updateCamera();
      
      // Game-specific updates
      this.update();
      
      this.scene.render();
    });
  }

  // Utility methods for 3D games
  createGround(size = 20, subdivisions = 2) {
    const ground = BABYLON.MeshBuilder.CreateGround('ground', {
      width: size,
      height: size,
      subdivisions: subdivisions
    }, this.scene);
    
    const groundMaterial = new BABYLON.StandardMaterial('groundMaterial', this.scene);
    groundMaterial.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.2);
    ground.material = groundMaterial;
    
    return ground;
  }

  createBox(name, size = 1, position = BABYLON.Vector3.Zero()) {
    const box = BABYLON.MeshBuilder.CreateBox(name, { size: size }, this.scene);
    box.position = position;
    return box;
  }

  createSphere(name, diameter = 1, position = BABYLON.Vector3.Zero()) {
    const sphere = BABYLON.MeshBuilder.CreateSphere(name, { diameter: diameter }, this.scene);
    sphere.position = position;
    return sphere;
  }

  // Input handling utilities
  setupPointerLock() {
    this.scene.onPointerObservable.add((pointerInfo) => {
      switch (pointerInfo.type) {
        case BABYLON.PointerEventTypes.POINTERDOWN:
          this.canvas.requestPointerLock();
          break;
      }
    });
  }

  setupInputControls() {
    // Keyboard controls
    document.addEventListener('keydown', (e) => {
      // Don't register movement keys if typing in an input field
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
        return;
      }
      this.keys[e.code] = true;
    });

    document.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
    
    // Mouse controls for camera
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // Prevent right-click menu
    
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { // Left click
        e.preventDefault();
        this.isMouseDown = true;
        this.lastMouseX = e.clientX;
      }
    });
    
    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.isMouseDown = false;
      }
    });
    
    document.addEventListener('mousemove', (e) => {
      if (this.isMouseDown && this.currentPlayer) {
        const deltaX = e.clientX - this.lastMouseX;
        this.cameraRotation += deltaX * 0.01;
        this.lastMouseX = e.clientX;
      }
    });
  }
  
  updateCamera() {
    // Update camera to orbit around current player
    if (this.currentPlayer) {
      // Initialize or update stable camera target position
      if (!this.cameraTargetPosition) {
        this.cameraTargetPosition = new BABYLON.Vector3(
          this.currentPlayer.position.x,
          0,
          this.currentPlayer.position.z
        );
      } else {
        // Smoothly update target position (filtering out small movements)
        this.cameraTargetPosition.x = BABYLON.Scalar.Lerp(
          this.cameraTargetPosition.x,
          this.currentPlayer.position.x,
          0.15
        );
        this.cameraTargetPosition.z = BABYLON.Scalar.Lerp(
          this.cameraTargetPosition.z,
          this.currentPlayer.position.z,
          0.15
        );
      }
      
      // Get player's rotation for default camera position
      const playerRotation = this.currentPlayer.rotation.y;
      
      // Default camera position is behind the player
      // Add cameraRotation offset when user drags mouse
      const cameraAngle = playerRotation + this.cameraRotation + Math.PI;
      
      // Calculate camera position using stable target
      const targetX = this.cameraTargetPosition.x + Math.sin(cameraAngle) * this.cameraRadius;
      const targetY = this.cameraHeight; // Fixed height
      const targetZ = this.cameraTargetPosition.z + Math.cos(cameraAngle) * this.cameraRadius;
      
      const targetPos = new BABYLON.Vector3(targetX, targetY, targetZ);
      
      // Smooth camera movement
      this.camera.position = BABYLON.Vector3.Lerp(this.camera.position, targetPos, 0.1);
      
      // Look at stable position with fixed height
      const lookAtPos = this.cameraTargetPosition.clone();
      lookAtPos.y = 1.5; // Fixed look-at height
      this.camera.setTarget(lookAtPos);
    }
  }
  
  handleMovement() {
    if (!this.currentPlayer || !this.room) return;
    
    // Track actual position separately from visual position
    if (!this.actualPosition) {
      this.actualPosition = {
        x: this.currentPlayer.position.x,
        y: this.currentPlayer.position.y,
        z: this.currentPlayer.position.z,
        rotation: this.currentPlayer.rotation.y
      };
    }
    
    // Calculate delta time in seconds for frame-independent movement
    const deltaTime = this.scene.deltaTime / 1000; // Convert ms to seconds
    
    let moved = false;
    let newX = this.actualPosition.x;
    let newY = this.actualPosition.y;
    let newZ = this.actualPosition.z;
    let newRotation = this.actualPosition.rotation;

    // Jump physics
    if (this.keys['Space'] && !this.isJumping && newY <= this.groundLevel + 0.1) {
      this.isJumping = true;
      this.jumpVelocity = this.jumpPower;
      moved = true;
    }
    
    // Apply gravity and update Y position (frame-independent)
    if (this.isJumping || newY > this.groundLevel) {
      this.jumpVelocity += this.gravity * deltaTime * 60; // Normalized for 60fps baseline
      newY += this.jumpVelocity * deltaTime * 60;
      
      // Land on ground
      if (newY <= this.groundLevel) {
        newY = this.groundLevel;
        this.isJumping = false;
        this.jumpVelocity = 0;
      }
      moved = true;
    }

    // WASD movement (frame-independent)
    const moveDistance = this.moveSpeed * deltaTime;
    const rotateSpeed = 2.0 * deltaTime; // 2 radians per second
    
    if (this.keys['KeyW'] || this.keys['ArrowUp']) {
      newX += Math.sin(newRotation) * moveDistance;
      newZ += Math.cos(newRotation) * moveDistance;
      moved = true;
    }
    if (this.keys['KeyS'] || this.keys['ArrowDown']) {
      newX -= Math.sin(newRotation) * moveDistance;
      newZ -= Math.cos(newRotation) * moveDistance;
      moved = true;
    }
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) {
      newRotation -= rotateSpeed;
      moved = true;
    }
    if (this.keys['KeyD'] || this.keys['ArrowRight']) {
      newRotation += rotateSpeed;
      moved = true;
    }

    // Send movement to server
    if (moved) {
      // Update our tracked position
      this.actualPosition.x = newX;
      this.actualPosition.y = newY;
      this.actualPosition.z = newZ;
      this.actualPosition.rotation = newRotation;
      
      // Directly update our own player position for smooth movement
      if (this.currentPlayer) {
        this.currentPlayer.position.x = newX;
        this.currentPlayer.position.y = newY;
        this.currentPlayer.position.z = newZ;
        this.currentPlayer.rotation.y = newRotation;
      }
      
      // Handle walking animation for our own player
      if (this.playerModel && this.mySessionId) {
        // Only trigger walking if moving horizontally (not just jumping)
        const isWalking = (this.keys['KeyW'] || this.keys['KeyS'] || 
                          this.keys['KeyA'] || this.keys['KeyD'] ||
                          this.keys['ArrowUp'] || this.keys['ArrowDown'] || 
                          this.keys['ArrowLeft'] || this.keys['ArrowRight']);
        
        if (isWalking) {
          this.playerModel.startWalking(this.mySessionId);
        } else {
          this.playerModel.stopWalking(this.mySessionId);
        }
      }
      
      this.sendInput("move", {
        x: newX,
        y: newY,
        z: newZ,
        rotation: newRotation
      });
    } else {
      // Stop walking animation when not moving
      if (this.playerModel && this.mySessionId) {
        this.playerModel.stopWalking(this.mySessionId);
      }
      this.sendInput("stopMove");
    }
  }
  
  // Base player update handler with client-side prediction
  handlePlayerUpdates(players) {
    players.forEach((player, id) => {
      // Skip our own player for client-side prediction
      if (id === this.mySessionId) {
        // Only sync actual position on first join
        if (!this.actualPosition && this.currentPlayer) {
          this.actualPosition = {
            x: player.x,
            y: player.y || 0,
            z: player.z,
            rotation: player.rotation
          };
          this.currentPlayer.position.x = player.x;
          this.currentPlayer.position.y = player.y || 0;
          this.currentPlayer.position.z = player.z;
          this.currentPlayer.rotation.y = player.rotation;
        }
        return;
      }
      
      // Update other players from server
      if (this.playerModel) {
        // Debug: Log when receiving jump data for other players
        if (player.y > 0) {
          console.log(`Received other player ${id} at Y: ${player.y}`);
        }
        
        this.playerModel.updatePlayerPosition(id, {
          x: player.x,
          y: player.y || 0,
          z: player.z
        });
        this.playerModel.updatePlayerRotation(id, player.rotation);
        
        // Handle walking animation
        if (player.isMoving) {
          this.playerModel.startWalking(id);
        } else {
          this.playerModel.stopWalking(id);
        }
      }
    });
  }
  
  // Games must implement these
  setupScene() {
    throw new Error("Must implement setupScene");
  }

  onStateUpdate(state) { 
    throw new Error("Must implement onStateUpdate"); 
  }
  
  onDisconnect() { 
    throw new Error("Must implement onDisconnect"); 
  }
  
  update() { 
    throw new Error("Must implement update"); 
  }
}

// Make it available globally
window.BaseGame = BaseGame;