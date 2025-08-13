class PlayerModel {
    constructor(scene) {
        this.scene = scene;
        this.models = new Map();
        this.defaultModelUrl = null;
        this.modelScale = { x: 1, y: 1, z: 1 };
        this.modelOffset = { x: 0, y: 0, z: 0 };
        
        // Player color palette for default capsule models
        this.playerColors = [
            new BABYLON.Color3(1, 0.3, 0.3),     // Red
            new BABYLON.Color3(0.3, 0.3, 1),     // Blue
            new BABYLON.Color3(0.3, 1, 0.3),     // Green
            new BABYLON.Color3(1, 1, 0.3),       // Yellow
            new BABYLON.Color3(1, 0.3, 1),       // Magenta
            new BABYLON.Color3(0.3, 1, 1),       // Cyan
            new BABYLON.Color3(1, 0.6, 0.2),     // Orange
            new BABYLON.Color3(0.6, 0.3, 0.8)    // Purple
        ];
    }

    /**
     * Set the default player model URL (can be a local file or remote URL)
     * Supports GLB/GLTF formats
     */
    setDefaultModel(modelUrl, options = {}) {
        this.defaultModelUrl = modelUrl;
        if (options.scale) this.modelScale = options.scale;
        if (options.offset) this.modelOffset = options.offset;
    }

    /**
     * Load a player model for a specific player ID
     */
    async loadPlayerModel(playerId, position = { x: 0, y: 0, z: 0 }, customModelUrl = null) {
        try {
            // Remove existing model if any
            if (this.models.has(playerId)) {
                this.removePlayerModel(playerId);
            }

            const modelUrl = customModelUrl || this.defaultModelUrl;
            
            if (!modelUrl) {
                // Fallback to a simple capsule mesh if no model URL is provided
                return this.createDefaultMesh(playerId, position);
            }

            // Load the 3D model
            const result = await BABYLON.SceneLoader.LoadAssetContainerAsync(
                modelUrl.substring(0, modelUrl.lastIndexOf('/') + 1),
                modelUrl.substring(modelUrl.lastIndexOf('/') + 1),
                this.scene
            );

            // Add loaded meshes to scene
            const meshes = result.instantiateModelsToScene();
            const rootMesh = meshes.rootNodes[0];

            // Configure the model
            rootMesh.name = `player_${playerId}`;
            rootMesh.position = new BABYLON.Vector3(position.x, position.y, position.z);
            rootMesh.scaling = new BABYLON.Vector3(this.modelScale.x, this.modelScale.y, this.modelScale.z);
            
            // Apply offset if needed
            if (this.modelOffset.x || this.modelOffset.y || this.modelOffset.z) {
                rootMesh.position.addInPlace(new BABYLON.Vector3(
                    this.modelOffset.x,
                    this.modelOffset.y,
                    this.modelOffset.z
                ));
            }

            // Store the model reference
            this.models.set(playerId, {
                rootMesh,
                meshes: meshes.rootNodes,
                animationGroups: meshes.animationGroups,
                container: result
            });

            return rootMesh;

        } catch (error) {
            console.error(`Failed to load player model: ${error.message}`);
            // Fallback to default mesh
            return this.createDefaultMesh(playerId, position);
        }
    }

    /**
     * Create a Roblox-style blocky character
     */
    createDefaultMesh(playerId, position) {
        // Parent mesh for the entire player
        const playerMesh = new BABYLON.Mesh(`player_${playerId}`, this.scene);
        
        // Character dimensions (Roblox proportions)
        const torsoWidth = 0.8;
        const torsoHeight = 0.8;
        const torsoDepth = 0.4;
        const headSize = 0.6;
        const armWidth = 0.25;
        const armHeight = 0.6;
        const legWidth = 0.25;
        const legHeight = 0.7;
        
        // Create materials
        const skinMaterial = new BABYLON.StandardMaterial(`skin_mat_${playerId}`, this.scene);
        skinMaterial.diffuseColor = new BABYLON.Color3(1, 0.8, 0.6); // Skin color
        
        const shirtMaterial = new BABYLON.StandardMaterial(`shirt_mat_${playerId}`, this.scene);
        const pantsMaterial = new BABYLON.StandardMaterial(`pants_mat_${playerId}`, this.scene);
        
        // Player colors for shirt
        // Use color from palette based on player ID
        const colorIndex = Math.abs(playerId.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % this.playerColors.length;
        shirtMaterial.diffuseColor = this.playerColors[colorIndex];
        pantsMaterial.diffuseColor = new BABYLON.Color3(0.2, 0.2, 0.4); // Dark blue pants
        
        // Torso (body)
        const torso = BABYLON.MeshBuilder.CreateBox(`torso_${playerId}`, {
            width: torsoWidth,
            height: torsoHeight,
            depth: torsoDepth
        }, this.scene);
        torso.parent = playerMesh;
        torso.position.y = legHeight + torsoHeight / 2;
        torso.material = shirtMaterial;
        
        // Head
        const head = BABYLON.MeshBuilder.CreateBox(`head_${playerId}`, {
            width: headSize,
            height: headSize,
            depth: headSize
        }, this.scene);
        head.parent = playerMesh;
        head.position.y = legHeight + torsoHeight + headSize / 2;
        head.material = skinMaterial;
        
        // Face (simple features)
        const eyeLeft = BABYLON.MeshBuilder.CreateBox(`eye_left_${playerId}`, {
            width: 0.1,
            height: 0.1,
            depth: 0.05
        }, this.scene);
        eyeLeft.parent = head;
        eyeLeft.position.x = -0.15;
        eyeLeft.position.y = 0.1;
        eyeLeft.position.z = headSize / 2;
        const eyeMat = new BABYLON.StandardMaterial(`eye_mat_${playerId}`, this.scene);
        eyeMat.diffuseColor = new BABYLON.Color3(0, 0, 0);
        eyeLeft.material = eyeMat;
        
        const eyeRight = eyeLeft.clone(`eye_right_${playerId}`);
        eyeRight.parent = head;
        eyeRight.position.x = 0.15;
        
        // Arms
        const leftArm = BABYLON.MeshBuilder.CreateBox(`left_arm_${playerId}`, {
            width: armWidth,
            height: armHeight,
            depth: armWidth
        }, this.scene);
        leftArm.parent = playerMesh;
        leftArm.position.x = -(torsoWidth / 2 + armWidth / 2);
        leftArm.position.y = legHeight + torsoHeight - armHeight / 2;
        leftArm.material = skinMaterial;
        leftArm.setPivotPoint(new BABYLON.Vector3(0, armHeight / 2, 0));
        
        const rightArm = BABYLON.MeshBuilder.CreateBox(`right_arm_${playerId}`, {
            width: armWidth,
            height: armHeight,
            depth: armWidth
        }, this.scene);
        rightArm.parent = playerMesh;
        rightArm.position.x = torsoWidth / 2 + armWidth / 2;
        rightArm.position.y = legHeight + torsoHeight - armHeight / 2;
        rightArm.material = skinMaterial;
        rightArm.setPivotPoint(new BABYLON.Vector3(0, armHeight / 2, 0));
        
        // Legs
        const leftLeg = BABYLON.MeshBuilder.CreateBox(`left_leg_${playerId}`, {
            width: legWidth,
            height: legHeight,
            depth: legWidth
        }, this.scene);
        leftLeg.parent = playerMesh;
        leftLeg.position.x = -torsoWidth / 4;
        leftLeg.position.y = legHeight / 2;
        leftLeg.material = pantsMaterial;
        leftLeg.setPivotPoint(new BABYLON.Vector3(0, legHeight / 2, 0));
        
        const rightLeg = BABYLON.MeshBuilder.CreateBox(`right_leg_${playerId}`, {
            width: legWidth,
            height: legHeight,
            depth: legWidth
        }, this.scene);
        rightLeg.parent = playerMesh;
        rightLeg.position.x = torsoWidth / 4;
        rightLeg.position.y = legHeight / 2;
        rightLeg.material = pantsMaterial;
        rightLeg.setPivotPoint(new BABYLON.Vector3(0, legHeight / 2, 0));
        
        // Set position
        playerMesh.position = new BABYLON.Vector3(position.x, position.y, position.z);
        
        // Store the model reference with body parts for animation
        this.models.set(playerId, {
            rootMesh: playerMesh,
            meshes: [playerMesh, torso, head, leftArm, rightArm, leftLeg, rightLeg],
            bodyParts: {
                torso,
                head,
                leftArm,
                rightArm,
                leftLeg,
                rightLeg
            },
            animationGroups: [],
            isWalking: false,
            walkTime: 0
        });
        
        return playerMesh;
    }

    /**
     * Update player model position
     */
    updatePlayerPosition(playerId, position) {
        const model = this.models.get(playerId);
        if (model && model.rootMesh) {
            // Store target position for smooth interpolation
            if (!model.targetPosition) {
                model.targetPosition = new BABYLON.Vector3(position.x, position.y, position.z);
                model.rootMesh.position = model.targetPosition.clone();
            } else {
                model.targetPosition.x = position.x;
                model.targetPosition.y = position.y;
                model.targetPosition.z = position.z;
            }
        }
    }

    /**
     * Update player model rotation
     */
    updatePlayerRotation(playerId, rotation) {
        const model = this.models.get(playerId);
        if (model && model.rootMesh) {
            // Store target rotation for smooth interpolation
            if (!model.targetRotation) {
                model.targetRotation = new BABYLON.Vector3(0, 0, 0);
            }
            
            if (typeof rotation === 'number') {
                // Single Y-axis rotation
                model.targetRotation.y = rotation;
            } else {
                // Full rotation object
                model.targetRotation.x = rotation.x || 0;
                model.targetRotation.y = rotation.y || 0;
                model.targetRotation.z = rotation.z || 0;
            }
        }
    }

    /**
     * Play animation on player model
     */
    playAnimation(playerId, animationName) {
        const model = this.models.get(playerId);
        if (model && model.animationGroups) {
            const animGroup = model.animationGroups.find(ag => ag.name === animationName);
            if (animGroup) {
                // Stop all other animations
                model.animationGroups.forEach(ag => ag.stop());
                // Play the requested animation
                animGroup.play(true); // true for loop
            }
        }
    }

    /**
     * Remove a player model from the scene
     */
    removePlayerModel(playerId) {
        const model = this.models.get(playerId);
        if (model) {
            // Dispose of all meshes
            if (model.meshes) {
                model.meshes.forEach(mesh => {
                    if (mesh) mesh.dispose();
                });
            }
            
            // Stop animations
            if (model.animationGroups) {
                model.animationGroups.forEach(ag => ag.dispose());
            }
            
            // Remove from map
            this.models.delete(playerId);
        }
    }

    /**
     * Get player model mesh
     */
    getPlayerMesh(playerId) {
        const model = this.models.get(playerId);
        return model ? model.rootMesh : null;
    }

    /**
     * Set player color (for default mesh only)
     */
    setPlayerColor(playerId, color) {
        const model = this.models.get(playerId);
        if (model && model.bodyParts) {
            // Only change shirt color for Roblox-style character
            if (model.bodyParts.torso && model.bodyParts.torso.material) {
                model.bodyParts.torso.material.diffuseColor = new BABYLON.Color3(color.r, color.g, color.b);
            }
        }
    }
    
    /**
     * Start walking animation for a player
     */
    startWalking(playerId) {
        const model = this.models.get(playerId);
        if (model) {
            model.isWalking = true;
        }
    }
    
    /**
     * Stop walking animation for a player
     */
    stopWalking(playerId) {
        const model = this.models.get(playerId);
        if (model) {
            model.isWalking = false;
            // Reset limbs to default position
            if (model.bodyParts) {
                model.bodyParts.leftArm.rotation.x = 0;
                model.bodyParts.rightArm.rotation.x = 0;
                model.bodyParts.leftLeg.rotation.x = 0;
                model.bodyParts.rightLeg.rotation.x = 0;
            }
        }
    }
    
    /**
     * Update walking animation
     */
    updateAnimation(deltaTime) {
        this.models.forEach((model, playerId) => {
            // Smooth position interpolation
            if (model.targetPosition && model.rootMesh) {
                const lerpFactor = model.isWalking ? 0.3 : 0.25; // Increased for more responsive movement
                model.rootMesh.position = BABYLON.Vector3.Lerp(
                    model.rootMesh.position,
                    model.targetPosition,
                    lerpFactor
                );
            }
            
            // Smooth rotation interpolation
            if (model.targetRotation && model.rootMesh) {
                model.rootMesh.rotation = BABYLON.Vector3.Lerp(
                    model.rootMesh.rotation,
                    model.targetRotation,
                    0.2
                );
            }
            
            // Walking animation
            if (model.isWalking && model.bodyParts) {
                model.walkTime += deltaTime * 0.005;
                
                // Arm swing
                model.bodyParts.leftArm.rotation.x = Math.sin(model.walkTime * 8) * 0.5;
                model.bodyParts.rightArm.rotation.x = -Math.sin(model.walkTime * 8) * 0.5;
                
                // Leg movement
                model.bodyParts.leftLeg.rotation.x = -Math.sin(model.walkTime * 8) * 0.4;
                model.bodyParts.rightLeg.rotation.x = Math.sin(model.walkTime * 8) * 0.4;
            }
        });
    }
}

// Preset configurations for common model sources
const PlayerModelPresets = {
    // Simple geometric models
    CAPSULE: {
        type: 'default',
        scale: { x: 1, y: 1, z: 1 }
    },
    
    // Example configurations for popular free models
    QUATERNIUS: {
        url: 'https://quaternius.com/models/lowpoly_character.glb', // Example URL
        scale: { x: 0.01, y: 0.01, z: 0.01 }, // Quaternius models are often large
        offset: { x: 0, y: 0, z: 0 }
    },
    
    MIXAMO: {
        url: 'path/to/mixamo_model.glb', // User would provide their own
        scale: { x: 0.01, y: 0.01, z: 0.01 },
        offset: { x: 0, y: 0, z: 0 }
    },
    
    READYPLAYERME: {
        url: 'path/to/rpm_avatar.glb', // Generated from Ready Player Me
        scale: { x: 1, y: 1, z: 1 },
        offset: { x: 0, y: -0.9, z: 0 } // RPM avatars are often centered at pelvis
    }
};

// Make it available globally
window.PlayerModel = PlayerModel;
window.PlayerModelPresets = PlayerModelPresets;