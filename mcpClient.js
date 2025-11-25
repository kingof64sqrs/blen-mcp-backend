const { spawn } = require('child_process');
const EventEmitter = require('events');

/**
 * MCP Client - Communicates with Blender MCP server via stdio
 * Handles JSON-RPC protocol for tool execution
 */
class MCPClient extends EventEmitter {
  constructor() {
    super();
    this.process = null;
    this.isConnected = false;
    this.requestId = 0;
    this.pendingRequests = new Map();
    this.buffer = '';
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;
  }

  /**
   * Connect to MCP server by spawning blender-mcp process
   */
  async connect() {
    if (this.isConnected) {
      console.log('Already connected to MCP server');
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        console.log('Starting MCP server process...');
        
        // Spawn the blender-mcp server using uvx
        this.process = spawn('cmd.exe', ['/c', 'uvx', 'blender-mcp'], {
          env: {
            ...process.env,
            BLENDER_HOST: process.env.BLENDER_HOST || 'localhost',
            BLENDER_PORT: process.env.BLENDER_PORT || '9876'
          },
          stdio: ['pipe', 'pipe', 'pipe']
        });

        // Handle stdout - MCP server responses
        this.process.stdout.on('data', (data) => {
          this.handleData(data);
        });

        // Handle stderr - logs and errors
        this.process.stderr.on('data', (data) => {
          const message = data.toString();
          console.error('MCP stderr:', message);
        });

        // Handle process close
        this.process.on('close', (code) => {
          console.log(`MCP process closed with code ${code}`);
          this.isConnected = false;
          this.process = null;
          
          // Auto-reconnect logic
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => this.connect().catch(console.error), 2000);
          }
        });

        // Handle process errors
        this.process.on('error', (err) => {
          console.error('MCP process error:', err.message);
          reject(err);
        });

        // Initialize the MCP protocol
        setTimeout(async () => {
          try {
            await this.initialize();
            this.isConnected = true;
            this.reconnectAttempts = 0;
            console.log('✓ MCP Client connected and initialized');
            resolve();
          } catch (error) {
            console.error('Failed to initialize MCP:', error.message);
            reject(error);
          }
        }, 3000); // Give process time to start and connect to Blender

      } catch (error) {
        console.error('Failed to spawn MCP process:', error);
        reject(error);
      }
    });
  }

  /**
   * Handle incoming data from stdout
   */
  handleData(data) {
    this.buffer += data.toString();
    
    // Split by newlines to get complete JSON-RPC messages
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse JSON:', error.message);
          console.error('Raw data:', line);
        }
      }
    }
  }

  /**
   * Handle parsed JSON-RPC message
   */
  handleMessage(message) {
    // Response to our request
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve, reject, timer } = this.pendingRequests.get(message.id);
      clearTimeout(timer);
      this.pendingRequests.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message || JSON.stringify(message.error)));
      } else {
        resolve(message.result);
      }
    } 
    // Notification from server
    else if (message.method) {
      this.emit('notification', message);
    }
  }

  /**
   * Send JSON-RPC request to MCP server
   */
  async sendRequest(method, params = {}) {
    if (!this.process || this.process.killed) {
      throw new Error('MCP process not running');
    }

    return new Promise((resolve, reject) => {
      const id = ++this.requestId;
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params
      };

      // Timeout handling
      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`Request timeout: ${method}`));
        }
      }, 60000); // 60 second timeout

      this.pendingRequests.set(id, { resolve, reject, timer });

      // Send request
      const jsonRequest = JSON.stringify(request) + '\n';
      this.process.stdin.write(jsonRequest);
    });
  }

  /**
   * Initialize MCP protocol handshake
   */
  async initialize() {
    console.log('Initializing MCP protocol...');
    
    const result = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: { listChanged: true },
        sampling: {}
      },
      clientInfo: {
        name: 'Blender MCP HTTP Server',
        version: '1.0.0'
      }
    });

    // Send initialized notification
    this.process.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized'
    }) + '\n');

    console.log('MCP initialized:', result.serverInfo);
    return result;
  }

  /**
   * List available tools
   */
  async listTools() {
    return await this.sendRequest('tools/list', {});
  }

  /**
   * Call a specific tool
   */
  async callTool(name, args = {}) {
    return await this.sendRequest('tools/call', {
      name,
      arguments: args
    });
  }

  /**
   * Execute Blender Python code
   */
  async executeBlenderCode(code) {
    return await this.callTool('execute_blender_code', { code });
  }

  /**
   * Get viewport screenshot
   */
  async getViewportScreenshot(maxSize = 800) {
    return await this.callTool('get_viewport_screenshot', { max_size: maxSize });
  }

  /**
   * Get scene information
   */
  async getSceneInfo() {
    return await this.callTool('get_scene_info', {});
  }

  /**
   * Search Sketchfab models
   */
  async searchSketchfab(query, options = {}) {
    return await this.callTool('search_sketchfab_models', {
      query,
      categories: options.categories || null,
      count: options.count || 20,
      downloadable: options.downloadable !== false
    });
  }

  /**
   * Download Sketchfab model
   */
  async downloadSketchfabModel(uid) {
    return await this.callTool('download_sketchfab_model', { uid });
  }

  /**
   * Generate 3D model with Hyper3D
   */
  async generateHyper3DModel(textPrompt, bboxCondition = null) {
    return await this.callTool('generate_hyper3d_model_via_text', {
      text_prompt: textPrompt,
      bbox_condition: bboxCondition
    });
  }

  /**
   * Apply texture to object
   */
  async setTexture(objectName, textureId) {
    return await this.callTool('set_texture', {
      object_name: objectName,
      texture_id: textureId
    });
  }

  /**
   * Get integration statuses
   */
  async getHunyuan3DStatus() {
    return await this.callTool('get_hunyuan3d_status', {});
  }

  async getPolyhavenStatus() {
    return await this.callTool('get_polyhaven_status', {});
  }

  async getSketchfabStatus() {
    return await this.callTool('get_sketchfab_status', {});
  }

  /**
   * Disconnect and cleanup
   */
  disconnect() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.isConnected = false;
    this.pendingRequests.clear();
    console.log('MCP Client disconnected');
  }
}

module.exports = MCPClient;
