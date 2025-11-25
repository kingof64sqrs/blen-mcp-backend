# Quick Start Guide - Blender MCP HTTP API

## 🚀 Start the Server

```powershell
.\start-mcp-server.ps1
```

Or manually:
```powershell
cd mcp
npm start
```

## 📍 Base URL
```
http://localhost:5000
```

## 🔥 Quick Examples

### 1. Health Check
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/health"
```

### 2. Create a Cube
```powershell
$body = @{
    code = "import bpy`nbpy.ops.mesh.primitive_cube_add(size=2)"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/blender/execute" `
    -Method Post -Body $body -ContentType "application/json"
```

### 3. Get Scene Info
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/blender/scene"
```

### 4. Take Screenshot
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/blender/screenshot?maxSize=800"
```

### 5. Search Sketchfab
```powershell
Invoke-RestMethod -Uri "http://localhost:5000/api/sketchfab/search?query=car&count=10"
```

### 6. Generate AI Model
```powershell
$body = @{
    textPrompt = "a red sports car"
} | ConvertTo-Json

Invoke-RestMethod -Uri "http://localhost:5000/api/generate/hyper3d" `
    -Method Post -Body $body -ContentType "application/json"
```

## 📋 All Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Server health check |
| GET | `/api/tools` | List all MCP tools |
| GET | `/api/status` | Integration status |
| POST | `/api/blender/execute` | Execute Python code |
| GET | `/api/blender/screenshot` | Get viewport screenshot |
| GET | `/api/blender/scene` | Get scene info |
| POST | `/api/blender/texture` | Apply texture |
| GET | `/api/sketchfab/search` | Search models |
| POST | `/api/sketchfab/download` | Download model |
| POST | `/api/generate/hyper3d` | Generate 3D model |
| POST | `/api/tool/call` | Generic tool call |

## 🧪 Run Test Suite

```powershell
cd mcp
.\test-api.ps1
```

## 📖 Full Documentation

See `mcp/README.md` for complete API documentation.

## ⚠️ Requirements

1. **Blender must be running** with MCP addon enabled on port 9876
2. Node.js installed
3. `uvx` installed (`pip install uv`)

## 🛠️ Troubleshooting

**Server won't start:**
- Run: `cd mcp; npm install`
- Check `.env` file exists

**MCP connection fails:**
- Ensure Blender is running
- Check Blender MCP addon is enabled on port 9876
- Verify `BLENDER_HOST` and `BLENDER_PORT` in `.env`

**Commands not executing:**
- Check Blender console for errors
- Verify Python syntax is correct
