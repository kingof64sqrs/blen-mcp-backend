# AI Prompt Endpoint - Blender MCP API

## 🎯 Natural Language Blender Control

Execute natural language prompts that get converted to Blender Python code using Azure OpenAI.

---

## Endpoint

```
POST http://localhost:5000/api/prompt
```

---

## Request Format

**Headers:**
```
Content-Type: application/json
```

**Body:**
```json
{
  "prompt": "your natural language command here"
}
```

---

## cURL Examples

### 1. Create a Blue Sphere
```bash
curl -X POST http://localhost:5000/api/prompt \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"create a blue sphere\"}"
```

### 2. Create a Red Cube at Position
```bash
curl -X POST http://localhost:5000/api/prompt \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"create a red cube at position 5,0,0\"}"
```

### 3. Add a Point Light Above
```bash
curl -X POST http://localhost:5000/api/prompt \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"add a point light at position 0,0,10\"}"
```

### 4. Create a Green Cylinder
```bash
curl -X POST http://localhost:5000/api/prompt \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"create a green cylinder with radius 2 and height 5\"}"
```

### 5. Add Camera Looking at Origin
```bash
curl -X POST http://localhost:5000/api/prompt \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"add a camera at position 10,10,10 looking at the origin\"}"
```

### 6. Create Multiple Objects
```bash
curl -X POST http://localhost:5000/api/prompt \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"create 5 cubes in a row along the x axis\"}"
```

### 7. Apply Smooth Shading
```bash
curl -X POST http://localhost:5000/api/prompt \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"apply smooth shading to all selected objects\"}"
```

### 8. Delete All Cubes
```bash
curl -X POST http://localhost:5000/api/prompt \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"delete all cubes in the scene\"}"
```

---

## PowerShell Examples

### Basic Prompt
```powershell
$body = @{prompt="create a blue sphere"} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:5000/api/prompt" -Method Post -Body $body -ContentType "application/json"
```

### With Position
```powershell
$body = @{prompt="create a red cube at position 3,0,0"} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:5000/api/prompt" -Method Post -Body $body -ContentType "application/json"
```

### Complex Object
```powershell
$body = @{prompt="create a metallic torus with major radius 2 and minor radius 0.5"} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:5000/api/prompt" -Method Post -Body $body -ContentType "application/json"
```

---

## Response Format

```json
{
  "success": true,
  "prompt": "create a blue sphere",
  "generatedCode": "import bpy\nbpy.ops.mesh.primitive_uv_sphere_add(location=(0, 0, 0))\nobj = bpy.context.active_object\nmat = bpy.data.materials.new(name='Blue')\nmat.diffuse_color = (0, 0, 1, 1)\nobj.data.materials.append(mat)\nprint('Blue sphere created')",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Blue sphere created"
      }
    ]
  }
}
```

---

## Example Prompts

**Creating Objects:**
- "create a cube"
- "add a sphere at position 5,0,0"
- "make a red cylinder"
- "create a UV sphere with radius 2"

**Materials & Colors:**
- "make it blue"
- "apply a red metallic material"
- "set the emission to yellow"

**Transformations:**
- "move the selected object to 10,0,0"
- "rotate the cube 45 degrees on the z axis"
- "scale the sphere by 2"

**Lighting:**
- "add a sun light"
- "create a point light above at 0,0,10"
- "add an area light with strength 100"

**Camera:**
- "add a camera at 10,10,10"
- "point the camera at the origin"

**Modifiers:**
- "add a subdivision surface modifier"
- "apply smooth shading"
- "add a bevel modifier"

**Scene Management:**
- "delete all cubes"
- "select all spheres"
- "clear the scene"

---

## Testing

Test the endpoint quickly:

**PowerShell:**
```powershell
$body = @{prompt="create a rainbow colored cube"} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:5000/api/prompt" -Method Post -Body $body -ContentType "application/json"
```

**cURL:**
```bash
curl -X POST http://localhost:5000/api/prompt \
  -H "Content-Type: application/json" \
  -d "{\"prompt\":\"create a glowing sphere\"}"
```

---

## How It Works

1. **You send** a natural language prompt
2. **Azure OpenAI** converts it to Blender Python code
3. **MCP Server** executes the code in Blender
4. **You receive** the generated code + execution result

---

## Requirements

- Server running on `http://localhost:5000`
- Blender with MCP enabled on port 9876
- Azure OpenAI credentials in `.env` file

---

## Error Handling

If the prompt fails:
```json
{
  "success": false,
  "error": "Error message here"
}
```

Common issues:
- Invalid prompt → Refine your natural language
- Blender not connected → Start Blender with MCP
- Azure API error → Check your API keys in `.env`
