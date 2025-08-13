import { query, type SDKMessage } from "@anthropic-ai/claude-code";
import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface TokenUsage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface GameMetadata {
  id: string;
  name: string;
  description: string;
  icon: string;
  createdAt: string;
  claudeSessionId?: string;  // The actual Claude session ID
  hasActiveSession: boolean;
  improvementCount: number;
  lastImprovementAt?: string;  // ISO timestamp of last improvement
  contextSize?: number;  // Approximate context size in tokens
  lastImprovementCost?: number;  // Cost in USD of last improvement
  sessionImprovementCount?: number;  // Improvements in current session
}

export async function improveGame(
  gameId: string, 
  improvementRequest: string
): Promise<{ success: boolean; message: string }> {
  const gamePath = path.join(__dirname, '../games', gameId);
  const metadataPath = path.join(gamePath, 'metadata.json');
  
  // Check if game exists
  try {
    await fs.access(gamePath);
  } catch (error) {
    throw new Error(`Game ${gameId} not found`);
  }
  
  // Load metadata
  let metadata: GameMetadata;
  try {
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    metadata = JSON.parse(metadataContent);
  } catch (error) {
    throw new Error('Failed to load game metadata');
  }
  
  // Smart session management - decide whether to resume or start fresh
  const timeSinceLastImprovement = metadata.lastImprovementAt 
    ? (Date.now() - new Date(metadata.lastImprovementAt).getTime()) / 1000 / 60  // in minutes
    : null;  // null instead of Infinity for first improvement
  
  const contextSize = metadata.contextSize || 0;
  const sessionImprovements = metadata.sessionImprovementCount || 0;
  const lastCost = metadata.lastImprovementCost || 0;
  
  // Decision logic for reset vs resume
  const shouldReset = 
    !metadata.claudeSessionId ||  // No session exists
    timeSinceLastImprovement === null ||  // First improvement ever
    timeSinceLastImprovement > 5 ||  // More than 5 minutes passed (cache expired)
    sessionImprovements >= 5 ||  // 5 or more improvements in current session
    contextSize > 30000 ||  // Context exceeds 30k tokens
    lastCost > 0.20;  // Last improvement was expensive
  
  console.log(`🔧 Improving game: ${metadata.name}`);
  console.log(`   Game ID: ${gameId}`);
  console.log(`   Total improvements: ${metadata.improvementCount || 0}`);
  
  if (shouldReset) {
    console.log(`🔄 Starting fresh session (optimal for cost)`);
    if (timeSinceLastImprovement === null) {
      console.log(`   Reason: First improvement or no previous timestamp`);
    } else if (timeSinceLastImprovement > 5) {
      console.log(`   Reason: ${Math.round(timeSinceLastImprovement)} minutes since last improvement (cache expired)`);
    } else if (sessionImprovements >= 5) {
      console.log(`   Reason: ${sessionImprovements} improvements in session (context too large)`);
    } else if (contextSize > 30000) {
      console.log(`   Reason: Context size ${contextSize} tokens exceeds 30k threshold`);
    } else if (lastCost > 0.20) {
      console.log(`   Reason: Last improvement cost $${lastCost.toFixed(4)} exceeds $0.20`);
    }
    // Clear session data for fresh start
    metadata.claudeSessionId = undefined;
    metadata.sessionImprovementCount = 0;
  } else {
    console.log(`♻️  Resuming session (context still valuable)`);
    console.log(`   Session ID: ${metadata.claudeSessionId}`);
    console.log(`   Session improvements: ${sessionImprovements}`);
    console.log(`   Context size: ${contextSize} tokens`);
    console.log(`   Time since last: ${timeSinceLastImprovement ? Math.round(timeSinceLastImprovement) + ' minutes' : 'N/A'}`);
  }
  
  // Ensure shared files are read-only (in case they were modified somehow)
  const sharedPath = path.join(gamePath, 'shared');
  try {
    await fs.access(sharedPath);
    // Re-apply read-only permissions to all shared files
    const sharedFiles = await fs.readdir(sharedPath);
    for (const file of sharedFiles) {
      const filePath = path.join(sharedPath, file);
      await fs.chmod(filePath, 0o444);
    }
    console.log(`   🔒 Verified shared files are read-only`);
  } catch {
    // Shared directory doesn't exist or can't be accessed
    console.log(`   ⚠️  No shared directory found`);
  }
  
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
  
  console.log('🔢 Improvement Token Usage Tracking Started');
  console.log('========================================');
  
  if (shouldReset) {
    console.log('\n📁 Note: Initial cache creation (~16k tokens) is from reading game files');
    console.log('   This is a one-time cost for fresh sessions\n');
  }
  
  const improvePrompt = `You are improving an existing 3D multiplayer game called "${metadata.name}".
  
  Previous context: ${metadata.description}
  
  User's improvement request: ${improvementRequest}
  
  IMPORTANT REQUIREMENTS:
  1. Implement the requested improvement by MODIFYING the existing files
  2. Use MultiEdit to make your changes - do not just read files
  3. Focus ONLY on the requested improvement
  4. Test your changes mentally before writing
  5. Helper functions that create meshes MUST return the created object
     - Example: createGoal() must end with: return goal;
  6. To iterate over active players, use: Array.from(this.playerModel.models.keys())
     - DO NOT use getActivePlayerIds() - it doesn't exist!
  7. CRITICAL: When adding properties to Player or GameState:
     - MUST add them to state.ts with @type decorators
     - Example: @type("string") assignedGoal: string = "";
     - Then you can use them in room.ts
  8. After making changes, run TypeScript compilation: npx tsc room.ts state.ts --noEmit --strict
  9. Fix any TypeScript errors before completing, especially "Property does not exist" errors
  
  FILES YOU CAN MODIFY:
  - client.js (game client logic)
  - room.ts (server-side room logic)
  - state.ts (game state management)
  - index.html (if needed for UI changes)
  
  RESTRICTIONS:
  - The shared/ directory is read-only (contains core game engine files)
  - Do not create new files unless absolutely necessary
  - Make actual code changes to implement the improvement
  - ALWAYS run 'npx tsc room.ts state.ts --noEmit --strict' after making changes to check for errors`;
  
  try {
    // Run Claude Code SDK with existing session if available
    for await (const message of query({
      prompt: improvePrompt,
      options: {
        maxTurns: 30,
        cwd: gamePath,  // Work directly in the game directory
        allowedTools: ["Read", "MultiEdit", "Bash"],
        ...(!shouldReset && metadata.claudeSessionId ? { resume: metadata.claudeSessionId } : {}),  // Only resume if decision says so
        appendSystemPrompt: `
          You are improving an existing game. 
          ${!shouldReset && metadata.claudeSessionId ? 'The session history contains all previous changes.' : 'Starting fresh - analyze the current code state.'}
          Focus on the requested improvement only.
          DO NOT create new files unless absolutely necessary.
          DO NOT modify files in the shared/ directory.
          ALWAYS run 'npx tsc --noEmit' after making TypeScript changes to check for compilation errors.
          If there are TypeScript errors, fix them before completing the task.
        `
      },
    })) {
      messages.push(message);
      
      // Track token usage from assistant messages
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
          // Track the latest cache read size as approximate context size
          metadata.contextSize = usage.cache_read_input_tokens;
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
        console.log(`\n📊 Final Improvement Query Usage:`);
        console.log(`   Total Input: ${resultMessage.usage.input_tokens} tokens`);
        console.log(`   Total Output: ${resultMessage.usage.output_tokens} tokens`);
        console.log(`   Total Cost: $${totalCostUSD.toFixed(4)}`);
      }
      
      // Log progress
      if (message.type === 'assistant' && message.message.content) {
        const toolUses = message.message.content.filter((c: any) => c.type === 'tool_use');
        for (const toolUse of toolUses) {
          const toolName = toolUse.name;
          const input = toolUse.input;
          
          if (toolName === 'MultiEdit') {
            console.log(`📝 Editing file: ${input.file_path || 'file'}`);
          } else if (toolName === 'Read') {
            console.log(`📖 Reading file: ${input.file_path || 'file'}`);
          } else if (toolName === 'Bash') {
            console.log(`🔨 Running command: ${input.command || 'command'}`);
          }
        }
      }
      
      // Capture session ID
      if ('session_id' in message && message.session_id) {
        sessionId = message.session_id;
      }
      
      // Check for completion
      if (message.type === 'result') {
        console.log('✅ Improvement completed with status:', message.subtype);
      }
    }
    
    // Log final accumulated token summary
    if (stepCount > 0) {
      console.log('\n========================================');
      console.log('🎯 Final Improvement Token Summary:');
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
    
    // Update metadata with improvement count and session tracking
    metadata.improvementCount = (metadata.improvementCount || 0) + 1;
    metadata.hasActiveSession = true;
    metadata.lastImprovementAt = new Date().toISOString();
    metadata.lastImprovementCost = totalCostUSD;
    
    // Update session tracking
    if (shouldReset || !metadata.claudeSessionId) {
      // Fresh session started
      metadata.sessionImprovementCount = 1;
      if (sessionId) {
        metadata.claudeSessionId = sessionId;
      }
    } else {
      // Continuing session
      metadata.sessionImprovementCount = (metadata.sessionImprovementCount || 0) + 1;
    }
    
    console.log(`   Final context size: ${metadata.contextSize || 0} tokens`);
    
    await fs.writeFile(
      metadataPath,
      JSON.stringify(metadata, null, 2)
    );
    
    // Run TypeScript compilation check with strict mode
    console.log(`🔍 Running TypeScript compilation check...`);
    try {
      // Check both room.ts and state.ts with strict settings
      const { stdout, stderr } = await execAsync('npx tsc room.ts state.ts --noEmit --strict --esModuleInterop --skipLibCheck', {
        cwd: gamePath
      });
      
      if (stderr && stderr.trim()) {
        console.log(`⚠️  TypeScript warnings found:`);
        console.log(stderr);
      }
      if (stdout && stdout.trim()) {
        console.log(`⚠️  TypeScript output:`);
        console.log(stdout);
      }
      if (!stderr && !stdout) {
        console.log(`✅ TypeScript compilation check passed`);
      }
    } catch (tscError: any) {
      // TypeScript compilation failed with errors
      console.error(`❌ TypeScript compilation errors found:`);
      const errorOutput = tscError.stdout || tscError.stderr || tscError.message;
      console.error(errorOutput);
      
      // Parse for specific schema-related errors
      if (errorOutput && errorOutput.includes('does not exist on type')) {
        console.error(`💡 Tip: Make sure all properties are defined in state.ts with @type decorators`);
      }
      
      // Still mark as successful but with a warning message
      return {
        success: true,
        message: `Improvement applied to ${metadata.name} but with TypeScript errors. The game may not work correctly until these are fixed.`
      };
    }
    
    // Log final token usage summary
    console.log('\n========================================');
    console.log('🎯 Final Improvement Token Summary:');
    console.log(`   Total Input Tokens: ${totalTokenUsage.input_tokens}`);
    console.log(`   Total Output Tokens: ${totalTokenUsage.output_tokens}`);
    if (totalTokenUsage.cache_creation_input_tokens) {
      console.log(`   Cache Creation Tokens: ${totalTokenUsage.cache_creation_input_tokens}`);
    }
    if (totalTokenUsage.cache_read_input_tokens) {
      console.log(`   Cache Read Tokens: ${totalTokenUsage.cache_read_input_tokens}`);
    }
    console.log(`   Grand Total: ${totalTokenUsage.input_tokens + totalTokenUsage.output_tokens} tokens`);
    if (stepCount > 0) {
      console.log(`   Total Steps: ${stepCount}`);
      console.log(`   Average per Step: ${Math.round((totalTokenUsage.input_tokens + totalTokenUsage.output_tokens) / stepCount)} tokens`);
    }
    console.log('========================================\n');
    
    console.log(`✅ Game improved successfully`);
    console.log(`   Total improvements: ${metadata.improvementCount}`);
    
    // Cost analysis
    if (totalCostUSD > 0) {
      // Adjust expectations for fresh start (higher initial cost due to code reading)
      const decisionQuality = shouldReset 
        ? (totalCostUSD < 0.25 ? '🎆 Excellent' : totalCostUSD < 0.35 ? '✅ Good' : '⚠️ High')
        : (totalCostUSD < 0.20 ? '✅ Good reuse' : '⚠️ Consider reset next time');
      
      console.log(`\n💵 Cost Analysis:`);
      console.log(`   Decision: ${shouldReset ? 'Fresh start' : 'Resumed session'}`);
      console.log(`   Actual cost: $${totalCostUSD.toFixed(4)}`);
      console.log(`   Assessment: ${decisionQuality}`);
      
      if (!shouldReset && totalCostUSD > 0.20) {
        console.log(`   💡 Tip: Next improvement should start fresh to reduce costs`);
      }
    }
    
    return {
      success: true,
      message: `Successfully applied improvement to ${metadata.name}`
    };
    
  } catch (error) {
    console.error('Improvement failed:', error);
    return {
      success: false,
      message: `Failed to improve game: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

export async function listGamesWithSessions(): Promise<any[]> {
  const gamesDir = path.join(__dirname, '../games');
  const games = [];
  
  try {
    const gameDirectories = await fs.readdir(gamesDir);
    
    for (const gameId of gameDirectories) {
      const gamePath = path.join(gamesDir, gameId);
      const stats = await fs.stat(gamePath);
      
      if (stats.isDirectory()) {
        try {
          // Check if it's a valid game
          await fs.access(path.join(gamePath, 'index.html'));
          
          // Check for Claude session
          const claudePath = path.join(gamePath, '.claude');
          const hasSession = await fs.access(claudePath)
            .then(() => true)
            .catch(() => false);
          
          // Read metadata if available
          let metadata: Partial<GameMetadata> = {};
          try {
            const metadataContent = await fs.readFile(
              path.join(gamePath, 'metadata.json'), 
              'utf-8'
            );
            metadata = JSON.parse(metadataContent);
          } catch {
            // Use defaults if no metadata
            metadata = {
              id: gameId,
              name: gameId,
              improvementCount: 0
            };
          }
          
          games.push({
            id: gameId,
            name: metadata.name || gameId,
            hasActiveSession: !!metadata.claudeSessionId || hasSession,
            improvementCount: metadata.improvementCount || 0,
            canImprove: true,
            createdAt: metadata.createdAt
          });
        } catch {
          // Skip invalid game directories
        }
      }
    }
    
    return games;
  } catch (error) {
    console.error('Error listing games:', error);
    return [];
  }
}

export async function getGameSessionInfo(gameId: string): Promise<any> {
  const gamePath = path.join(__dirname, '../games', gameId);
  const claudePath = path.join(gamePath, '.claude');
  
  try {
    await fs.access(gamePath);
    
    const hasSession = await fs.access(claudePath)
      .then(() => true)
      .catch(() => false);
    
    let metadata: Partial<GameMetadata> = {};
    try {
      const metadataContent = await fs.readFile(
        path.join(gamePath, 'metadata.json'), 
        'utf-8'
      );
      metadata = JSON.parse(metadataContent);
    } catch {
      metadata = { id: gameId, improvementCount: 0 };
    }
    
    // Try to get conversation count from .claude directory
    let conversationCount = 0;
    if (hasSession) {
      try {
        const conversationsPath = path.join(claudePath, 'conversations');
        const files = await fs.readdir(conversationsPath);
        conversationCount = files.length;
      } catch {
        // Directory might not exist or be accessible
      }
    }
    
    return {
      gameId,
      gameName: metadata.name || gameId,
      hasSession,
      improvementCount: metadata.improvementCount || 0,
      conversationCount,
      claudeSessionPath: hasSession ? '.claude' : null,
      canImprove: true
    };
    
  } catch (error) {
    throw new Error(`Game ${gameId} not found`);
  }
}