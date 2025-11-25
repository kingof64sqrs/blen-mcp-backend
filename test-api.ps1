# Example API Requests for Blender MCP Server
# Run these after starting the server with: .\start-mcp-server.ps1

$baseUrl = "http://localhost:5000"

Write-Host "`n╔═══════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Blender MCP API Test Suite             ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Test 1: Health Check
Write-Host "[1] Health Check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$baseUrl/health"
    Write-Host "✓ Server Status: $($health.success)" -ForegroundColor Green
    Write-Host "  Connected: $($health.connected)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Server not responding. Make sure it's running!" -ForegroundColor Red
    exit 1
}

# Test 2: List Tools
Write-Host "`n[2] Listing Available Tools..." -ForegroundColor Yellow
try {
    $tools = Invoke-RestMethod -Uri "$baseUrl/api/tools"
    $toolCount = $tools.data.tools.Count
    Write-Host "✓ Found $toolCount tools" -ForegroundColor Green
    $tools.data.tools | Select-Object -First 5 | ForEach-Object {
        Write-Host "  - $($_.name)" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Failed to list tools: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 3: Get Scene Info
Write-Host "`n[3] Getting Scene Information..." -ForegroundColor Yellow
try {
    $scene = Invoke-RestMethod -Uri "$baseUrl/api/blender/scene"
    Write-Host "✓ Scene info retrieved" -ForegroundColor Green
    Write-Host "  $($scene.data.content[0].text)" -ForegroundColor Gray
} catch {
    Write-Host "❌ Failed to get scene info: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 4: Execute Python Code - Create a Cube
Write-Host "`n[4] Creating a Cube in Blender..." -ForegroundColor Yellow
$createCube = @{
    code = @"
import bpy
# Delete default cube if it exists
if 'Cube' in bpy.data.objects:
    bpy.data.objects.remove(bpy.data.objects['Cube'], do_unlink=True)

# Create new cube
bpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 0))
bpy.context.active_object.name = 'TestCube'
print('Created TestCube')
"@
} | ConvertTo-Json

try {
    $result = Invoke-RestMethod -Uri "$baseUrl/api/blender/execute" -Method Post -Body $createCube -ContentType "application/json"
    Write-Host "✓ Cube created successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to create cube: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 5: Execute Python Code - Add Material
Write-Host "`n[5] Adding Red Material to Cube..." -ForegroundColor Yellow
$addMaterial = @{
    code = @"
import bpy

# Get the cube
obj = bpy.data.objects.get('TestCube')
if obj:
    # Create a new material
    mat = bpy.data.materials.new(name='RedMaterial')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    
    # Set base color to red
    bsdf = nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (1, 0, 0, 1)
    
    # Assign material to object
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
    
    print('Red material applied')
else:
    print('TestCube not found')
"@
} | ConvertTo-Json

try {
    $result = Invoke-RestMethod -Uri "$baseUrl/api/blender/execute" -Method Post -Body $addMaterial -ContentType "application/json"
    Write-Host "✓ Material applied successfully" -ForegroundColor Green
} catch {
    Write-Host "❌ Failed to apply material: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 6: Get Integration Status
Write-Host "`n[6] Checking Integration Status..." -ForegroundColor Yellow
try {
    $status = Invoke-RestMethod -Uri "$baseUrl/api/status"
    Write-Host "✓ Integration status retrieved" -ForegroundColor Green
    Write-Host "  Hunyuan3D: $($status.data.hunyuan3d.content[0].text -replace '`n.*')" -ForegroundColor Gray
    Write-Host "  PolyHaven: $($status.data.polyhaven.content[0].text -replace '`n.*')" -ForegroundColor Gray
    Write-Host "  Sketchfab: $($status.data.sketchfab.content[0].text -replace '`n.*')" -ForegroundColor Gray
} catch {
    Write-Host "❌ Failed to get status: $($_.Exception.Message)" -ForegroundColor Red
}

# Test 7: Search Sketchfab (if enabled)
Write-Host "`n[7] Searching Sketchfab Models..." -ForegroundColor Yellow
try {
    $search = Invoke-RestMethod -Uri "$baseUrl/api/sketchfab/search?query=low+poly+car&count=3"
    Write-Host "✓ Search completed" -ForegroundColor Green
    # Display first result if available
    if ($search.data.content[0].text -match "Found \d+ models") {
        Write-Host "  $($search.data.content[0].text -split "`n" | Select-Object -First 3)" -ForegroundColor Gray
    }
} catch {
    Write-Host "⚠ Sketchfab search unavailable: $($_.Exception.Message)" -ForegroundColor Yellow
}

# Test 8: Take Screenshot
Write-Host "`n[8] Capturing Viewport Screenshot..." -ForegroundColor Yellow
try {
    $screenshot = Invoke-RestMethod -Uri "$baseUrl/api/blender/screenshot?maxSize=800"
    Write-Host "✓ Screenshot captured" -ForegroundColor Green
    if ($screenshot.data.content[0].type -eq "image") {
        Write-Host "  Image format: $($screenshot.data.content[0].mimeType)" -ForegroundColor Gray
        $dataLength = $screenshot.data.content[0].data.Length
        Write-Host "  Data size: $([math]::Round($dataLength/1024, 2)) KB" -ForegroundColor Gray
    }
} catch {
    Write-Host "❌ Failed to capture screenshot: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n╔═══════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║           Test Suite Complete             ║" -ForegroundColor Green
Write-Host "╚═══════════════════════════════════════════╝`n" -ForegroundColor Green

Write-Host "Check Blender to see the TestCube with red material!" -ForegroundColor Cyan
Write-Host "API documentation: http://localhost:5000/api/tools`n" -ForegroundColor Cyan
