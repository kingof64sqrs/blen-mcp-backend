# Simple API Test for Blender MCP Server
# Run after starting the server

$baseUrl = "http://localhost:5000"

Write-Host "`n=== Blender MCP API Test Suite ===" -ForegroundColor Cyan

# Test 1: Health Check
Write-Host "`n[1] Health Check..." -ForegroundColor Yellow
$health = Invoke-RestMethod -Uri "$baseUrl/health"
Write-Host "Success: $($health.success), Connected: $($health.connected)" -ForegroundColor Green

# Test 2: List Tools
Write-Host "`n[2] Listing Tools..." -ForegroundColor Yellow
$tools = Invoke-RestMethod -Uri "$baseUrl/api/tools"
Write-Host "Found $($tools.data.tools.Count) tools" -ForegroundColor Green
$tools.data.tools | Select-Object -First 5 name | ForEach-Object { Write-Host "  - $($_.name)" -ForegroundColor Gray }

# Test 3: Get Scene Info
Write-Host "`n[3] Getting Scene Info..." -ForegroundColor Yellow
$scene = Invoke-RestMethod -Uri "$baseUrl/api/blender/scene"
Write-Host "Scene info retrieved successfully" -ForegroundColor Green

# Test 4: Create a Cube
Write-Host "`n[4] Creating a Cube..." -ForegroundColor Yellow
$cubeCode = "import bpy`nbpy.ops.mesh.primitive_cube_add(size=2, location=(0, 0, 3))`nprint('Test cube created!')"
$body = @{code=$cubeCode} | ConvertTo-Json
$result = Invoke-RestMethod -Uri "$baseUrl/api/blender/execute" -Method Post -Body $body -ContentType "application/json"
Write-Host "Cube created: $($result.success)" -ForegroundColor Green

# Test 5: Create a Sphere
Write-Host "`n[5] Creating a Sphere..." -ForegroundColor Yellow
$sphereCode = "import bpy`nbpy.ops.mesh.primitive_uv_sphere_add(radius=1, location=(3, 0, 0))`nprint('Sphere created!')"
$body = @{code=$sphereCode} | ConvertTo-Json
$result = Invoke-RestMethod -Uri "$baseUrl/api/blender/execute" -Method Post -Body $body -ContentType "application/json"
Write-Host "Sphere created: $($result.success)" -ForegroundColor Green

# Test 6: Add Material
Write-Host "`n[6] Adding Red Material..." -ForegroundColor Yellow
$matCode = @"
import bpy
obj = bpy.context.active_object
if obj:
    mat = bpy.data.materials.new(name='RedMaterial')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs[0].default_value = (1, 0, 0, 1)
    if obj.data.materials:
        obj.data.materials[0] = mat
    else:
        obj.data.materials.append(mat)
    print('Red material applied')
"@
$body = @{code=$matCode} | ConvertTo-Json
$result = Invoke-RestMethod -Uri "$baseUrl/api/blender/execute" -Method Post -Body $body -ContentType "application/json"
Write-Host "Material applied: $($result.success)" -ForegroundColor Green

# Test 7: Get Screenshot
Write-Host "`n[7] Taking Screenshot..." -ForegroundColor Yellow
$screenshot = Invoke-RestMethod -Uri "$baseUrl/api/blender/screenshot?maxSize=800"
Write-Host "Screenshot captured: $($result.success)" -ForegroundColor Green

# Test 8: Integration Status
Write-Host "`n[8] Checking Integration Status..." -ForegroundColor Yellow
$status = Invoke-RestMethod -Uri "$baseUrl/api/status"
Write-Host "Status retrieved: $($status.success)" -ForegroundColor Green

Write-Host "`n=== All Tests Completed ===" -ForegroundColor Green
Write-Host "Check Blender to see the created objects!`n" -ForegroundColor Cyan
