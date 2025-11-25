# Blender MCP HTTP API Server

A standalone HTTP API server that provides REST endpoints for interacting with Blender via the Model Context Protocol (MCP).

## Quick Start

### 1. Install Dependencies
```powershell
cd mcp
npm install
```

### 2. Configure Environment
The `.env` file is already configured with:
```env
PORT=5000
BLENDER_HOST=localhost
BLENDER_PORT=9876
```

### 3. Start the Server
```powershell
npm start
```

Or for development with auto-reload:
```powershell
npm run dev
```

## Server Information

- **Base URL**: `http://localhost:5000`
- **Protocol**: REST API with JSON responses
- **MCP Connection**: Connects to Blender MCP via stdio (uvx blender-mcp)

## API Endpoints

### Health & Status

#### GET /health
Check if the server is running and connected to MCP.

**Response:**
```json
{
  "success": true,
  "connected": true,
  "timestamp": "2025-11-25T10:30:00.000Z"
}
```

#### GET /api/tools
List all available MCP tools.

**Response:**
```json
{
  "success": true,
  "data": {
    "tools": [
      {
        "name": "mcp_blender-mcp_execute_blender_code",
        "description": "Execute arbitrary Python code in Blender",
        "inputSchema": {...}
      }
    ]
  }
}
```

#### GET /api/status
Get integration status for Hunyuan3D, PolyHaven, and Sketchfab.

**Response:**
```json
{
  "success": true,
  "data": {
    "hunyuan3d": {...},
    "polyhaven": {...},
    "sketchfab": {...}
  }
}
```

---

### Blender Control

#### POST /api/blender/execute
Execute Python code in Blender.

**Request Body:**
```json
{
  "code": "import bpy\nbpy.ops.mesh.primitive_cube_add(location=(0, 0, 0))"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "content": [
      {
        "type": "text",
        "text": "Execution successful"
      }
    ]
  }
}
```

**Example (PowerShell):**
```powershell
$body = @{
    code = "import bpy`nbpy.ops.mesh.primitive_cube_add(location=(2, 0, 0))"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/blender/execute" -Method Post -Body $body -ContentType "application/json"
```

#### GET /api/blender/screenshot
Capture a screenshot of the Blender viewport.

**Query Parameters:**
- `maxSize` (optional): Maximum dimension in pixels (default: 800)

**Example:**
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/blender/screenshot?maxSize=1024"
```

#### GET /api/blender/scene
Get information about the current Blender scene.

**Response:**
```json
{
  "success": true,
  "data": {
    "content": [
      {
        "type": "text",
        "text": "Scene info: objects: 3, cameras: 1..."
      }
    ]
  }
}
```

**Example:**
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/blender/scene"
```

#### POST /api/blender/texture
Apply a texture to an object.

**Request Body:**
```json
{
  "objectName": "Cube",
  "textureId": "wood_floor_01"
}
```

**Example (PowerShell):**
```powershell
$body = @{
    objectName = "Cube"
    textureId = "wood_floor_01"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/blender/texture" -Method Post -Body $body -ContentType "application/json"
```

---

### Sketchfab Integration

#### GET /api/sketchfab/search
Search for 3D models on Sketchfab.

**Query Parameters:**
- `query` (required): Search term
- `count` (optional): Number of results (default: 20)
- `categories` (optional): Comma-separated categories
- `downloadable` (optional): Only downloadable models (default: true)

**Example:**
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/sketchfab/search?query=car&count=10"
```

#### POST /api/sketchfab/download
Download and import a Sketchfab model into Blender.

**Request Body:**
```json
{
  "uid": "model-uid-from-search"
}
```

**Example (PowerShell):**
```powershell
$body = @{
    uid = "abc123xyz"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/sketchfab/download" -Method Post -Body $body -ContentType "application/json"
```

---

### 3D Generation

#### POST /api/generate/hyper3d
Generate a 3D model using Hyper3D AI.

**Request Body:**
```json
{
  "textPrompt": "a red sports car",
  "bboxCondition": [2, 1, 1]
}
```

- `textPrompt` (required): Description of the model to generate
- `bboxCondition` (optional): Size ratio [length, width, height]

**Example (PowerShell):**
```powershell
$body = @{
    textPrompt = "a medieval castle"
    bboxCondition = @(2, 2, 3)
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/generate/hyper3d" -Method Post -Body $body -ContentType "application/json"
```

---

### Generic Tool Call

#### POST /api/tool/call
Call any MCP tool by name with custom arguments.

**Request Body:**
```json
{
  "toolName": "mcp_blender-mcp_execute_blender_code",
  "args": {
    "code": "import bpy\nprint(bpy.context.scene.name)"
  }
}
```

**Example (PowerShell):**
```powershell
$body = @{
    toolName = "mcp_blender-mcp_get_scene_info"
    args = @{}
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/tool/call" -Method Post -Body $body -ContentType "application/json"
```

---

## Complete Usage Example

Here's a complete workflow example:

```powershell
# 1. Check server health
Invoke-RestMethod -Uri "http://localhost:5000/health"

# 2. List available tools
Invoke-RestMethod -Uri "http://localhost:5000/api/tools"

# 3. Create a cube in Blender
$createCube = @{
    code = @"
import bpy
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
bpy.context.active_object.name = 'MyCube'
"@
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/blender/execute" -Method Post -Body $createCube -ContentType "application/json"

# 4. Get scene information
Invoke-RestMethod -Uri "http://localhost:5000/api/blender/scene"

# 5. Take a screenshot
Invoke-RestMethod -Uri "http://localhost:5000/api/blender/screenshot?maxSize=800"

# 6. Search for models
Invoke-RestMethod -Uri "http://localhost:5000/api/sketchfab/search?query=dragon&count=5"

# 7. Generate AI model
$generateModel = @{
    textPrompt = "a futuristic spaceship"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/generate/hyper3d" -Method Post -Body $generateModel -ContentType "application/json"
```

## Error Handling

All endpoints return consistent error responses:

```json
{
  "success": false,
  "error": "Error message here"
}
```

Common HTTP status codes:
- `200`: Success
- `400`: Bad request (missing parameters)
- `500`: Server error
- `503`: Service unavailable (MCP not connected)

## Architecture

```
[Client] → HTTP Request → [Express Server (server.js)]
                              ↓
                          [MCP Client (mcpClient.js)]
                              ↓
                          stdio (JSON-RPC)
                              ↓
                          [uvx blender-mcp]
                              ↓
                          [Blender via port 9876]
```

## Troubleshooting

### Server won't start
- Ensure `uvx` is installed: `pip install uv`
- Check Blender is running with MCP enabled on port 9876
- Verify `.env` file has correct `BLENDER_HOST` and `BLENDER_PORT`

### MCP connection fails
- Make sure Blender is running
- Check Blender MCP addon is enabled
- Verify port 9876 is not blocked by firewall

### Commands not executing
- Check Blender console for Python errors
- Verify the Python code syntax is correct
- Ensure objects/resources referenced exist in scene

## Development

The server uses:
- **Express**: HTTP server framework
- **child_process**: For spawning MCP server process
- **JSON-RPC 2.0**: Protocol for MCP communication

To add new endpoints:
1. Add route handler in `server.js`
2. Add corresponding method in `mcpClient.js` if needed
3. Update this documentation

## License

ISC
