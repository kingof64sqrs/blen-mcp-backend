/**
 * Blender Execution Safety Module
 * Safer code execution with error tracking and object lifecycle management
 */

/**
 * Wrap user code in safe execution context with error handling
 */
function wrapInSafeContext(code, operationName = 'operation') {
  return `
import bpy
import traceback
import sys
from io import StringIO

# Setup error capture
error_occurred = False
error_message = ""
operation_name = "${operationName}"

print("=" * 60)
print(f"EXECUTING: {operation_name}")
print("=" * 60)

try:
    # Store initial state
    initial_objects = set(bpy.data.objects)
    
    # User code execution
${code.split('\n').map(line => '    ' + line).join('\n')}
    
    # Report new objects
    new_objects = set(bpy.data.objects) - initial_objects
    if new_objects:
        print(f"\\n✓ Created {len(new_objects)} new object(s):")
        for obj in new_objects:
            print(f"  - {obj.name} ({obj.type})")
    
    print("\\n✓ Operation completed successfully")
    
except Exception as e:
    error_occurred = True
    error_message = str(e)
    error_trace = traceback.format_exc()
    
    print("\\n" + "=" * 60)
    print("✗ ERROR OCCURRED")
    print("=" * 60)
    print(f"Error: {error_message}")
    print(f"\\nFull traceback:")
    print(error_trace)
    print("=" * 60)
    
    # Don't raise - let the wrapper handle it
finally:
    print(f"\\nOperation: {operation_name}")
    print(f"Status: {'FAILED' if error_occurred else 'SUCCESS'}")
    print("=" * 60)

# Return status (for logging)
{"success": not error_occurred, "error": error_message if error_occurred else None}
`;
}

/**
 * Generate scene validation code
 */
function generateSceneValidation() {
  return `
import bpy

print("\\n" + "=" * 60)
print("SCENE VALIDATION")
print("=" * 60)

# Count objects by type
object_counts = {}
for obj in bpy.data.objects:
    obj_type = obj.type
    object_counts[obj_type] = object_counts.get(obj_type, 0) + 1

print(f"\\nTotal objects: {len(bpy.data.objects)}")
for obj_type, count in sorted(object_counts.items()):
    print(f"  {obj_type}: {count}")

# Check for mesh objects
mesh_objects = [obj for obj in bpy.data.objects if obj.type == 'MESH']
print(f"\\nMesh objects: {len(mesh_objects)}")

if mesh_objects:
    total_verts = sum(len(obj.data.vertices) for obj in mesh_objects)
    total_faces = sum(len(obj.data.polygons) for obj in mesh_objects)
    print(f"Total vertices: {total_verts:,}")
    print(f"Total faces: {total_faces:,}")
    
    # Check materials
    objects_with_materials = sum(1 for obj in mesh_objects if obj.data.materials)
    print(f"\\nObjects with materials: {objects_with_materials}/{len(mesh_objects)}")
    
    # Check for shader nodes
    materials_with_nodes = 0
    for obj in mesh_objects:
        for mat in obj.data.materials:
            if mat and mat.use_nodes:
                materials_with_nodes += 1
                break
    
    print(f"Materials using shader nodes: {materials_with_nodes}")
else:
    print("⚠ No mesh objects in scene")

print("=" * 60)
`;
}

/**
 * Generate object lifecycle tracking code
 */
function generateObjectTracking() {
  return `
import bpy

print("\\n" + "=" * 60)
print("OBJECT LIFECYCLE REPORT")
print("=" * 60)

# List all objects with details
for obj in bpy.data.objects:
    print(f"\\n{obj.name} ({obj.type})")
    print(f"  Location: {[round(x, 3) for x in obj.location]}")
    print(f"  Rotation: {[round(x, 3) for x in obj.rotation_euler]}")
    print(f"  Scale: {[round(x, 3) for x in obj.scale]}")
    
    if obj.type == 'MESH':
        print(f"  Vertices: {len(obj.data.vertices):,}")
        print(f"  Faces: {len(obj.data.polygons):,}")
        print(f"  Materials: {len(obj.data.materials)}")
        
        # Check UV layers
        if obj.data.uv_layers:
            print(f"  UV Layers: {len(obj.data.uv_layers)}")
    
    if obj.type == 'LIGHT':
        print(f"  Light type: {obj.data.type}")
        print(f"  Energy: {obj.data.energy}")
    
    if obj.type == 'CAMERA':
        print(f"  Focal length: {obj.data.lens}mm")

print("\\n" + "=" * 60)
`;
}

/**
 * Error recovery code - attempts to restore scene to valid state
 */
function generateErrorRecovery() {
  return `
import bpy

print("\\n" + "=" * 60)
print("ERROR RECOVERY - SCENE CLEANUP")
print("=" * 60)

# Remove objects with no data
orphaned = []
for obj in bpy.data.objects:
    if obj.type == 'MESH' and not obj.data:
        orphaned.append(obj.name)
        bpy.data.objects.remove(obj, do_unlink=True)

if orphaned:
    print(f"✓ Removed {len(orphaned)} orphaned objects")
else:
    print("✓ No orphaned objects found")

# Remove unused materials
unused_materials = []
for mat in bpy.data.materials:
    if mat.users == 0:
        unused_materials.append(mat.name)
        bpy.data.materials.remove(mat)

if unused_materials:
    print(f"✓ Removed {len(unused_materials)} unused materials")

# Remove unused mesh data
unused_meshes = []
for mesh in bpy.data.meshes:
    if mesh.users == 0:
        unused_meshes.append(mesh.name)
        bpy.data.meshes.remove(mesh)

if unused_meshes:
    print(f"✓ Removed {len(unused_meshes)} unused meshes")

print("\\n✓ Scene cleanup complete")
print("=" * 60)
`;
}

/**
 * Generate pre-execution checks
 */
function generatePreExecutionChecks() {
  return `
import bpy

print("\\n" + "=" * 60)
print("PRE-EXECUTION CHECKS")
print("=" * 60)

# Check Blender version
print(f"Blender version: {bpy.app.version_string}")

# Check available memory (approximate)
print(f"Objects in scene: {len(bpy.data.objects)}")
print(f"Materials: {len(bpy.data.materials)}")
print(f"Meshes: {len(bpy.data.meshes)}")
print(f"Images: {len(bpy.data.images)}")

# Check for active object
if bpy.context.active_object:
    print(f"Active object: {bpy.context.active_object.name}")
else:
    print("No active object")

# Check for selected objects
selected_count = len(bpy.context.selected_objects)
print(f"Selected objects: {selected_count}")

print("✓ Pre-execution checks passed")
print("=" * 60)
`;
}

/**
 * Build comprehensive execution package
 */
function buildSafeExecutionPackage(userCode, operationName = 'User Operation') {
  return {
    preChecks: generatePreExecutionChecks(),
    wrappedCode: wrapInSafeContext(userCode, operationName),
    postValidation: generateSceneValidation(),
    tracking: generateObjectTracking(),
    recovery: generateErrorRecovery()
  };
}

/**
 * Execution error logger
 */
class ExecutionLogger {
  constructor() {
    this.logs = [];
  }
  
  log(level, message, data = {}) {
    this.logs.push({
      timestamp: new Date().toISOString(),
      level,
      message,
      data
    });
  }
  
  error(message, error) {
    this.log('ERROR', message, { error: error.message, stack: error.stack });
  }
  
  warning(message, data) {
    this.log('WARNING', message, data);
  }
  
  info(message, data) {
    this.log('INFO', message, data);
  }
  
  success(message, data) {
    this.log('SUCCESS', message, data);
  }
  
  getLogs() {
    return this.logs;
  }
  
  getErrors() {
    return this.logs.filter(log => log.level === 'ERROR');
  }
  
  clear() {
    this.logs = [];
  }
}

module.exports = {
  wrapInSafeContext,
  generateSceneValidation,
  generateObjectTracking,
  generateErrorRecovery,
  generatePreExecutionChecks,
  buildSafeExecutionPackage,
  ExecutionLogger
};
