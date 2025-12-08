/**
 * Model Quality Assessment and Improvement Module
 * Validates and scores exported 3D models
 */

const fs = require('fs');
const path = require('path');

/**
 * Generate advanced geometry cleanup code
 */
function generateGeometryCleanup() {
  return `
import bpy
import bmesh

print("\\n" + "=" * 60)
print("ADVANCED GEOMETRY CLEANUP")
print("=" * 60)

obj = bpy.context.active_object

if not obj or obj.type != 'MESH':
    print("✗ No active mesh object")
else:
    # Switch to edit mode
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    
    # 1. Remove doubles/merge by distance
    print("\\n[1/7] Merging duplicate vertices...")
    merge_count = bpy.ops.mesh.remove_doubles(threshold=0.0001)
    print(f"✓ Merged vertices")
    
    # 2. Delete loose geometry
    print("\\n[2/7] Removing loose geometry...")
    bpy.ops.mesh.delete_loose()
    print("✓ Removed loose vertices/edges")
    
    # 3. Dissolve degenerate faces
    print("\\n[3/7] Dissolving degenerate geometry...")
    bpy.ops.mesh.dissolve_degenerate(threshold=0.0001)
    print("✓ Dissolved degenerate faces")
    
    # 4. Fix non-planar faces
    print("\\n[4/7] Fixing non-planar faces...")
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.beautify_fill(angle_limit=3.14159)
    print("✓ Beautified mesh topology")
    
    # 5. Recalculate normals
    print("\\n[5/7] Recalculating normals...")
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    print("✓ Fixed normals")
    
    # 6. Remove doubles again (after cleanup)
    print("\\n[6/7] Final merge pass...")
    bpy.ops.mesh.remove_doubles(threshold=0.0001)
    print("✓ Final merge complete")
    
    # 7. Validate mesh
    print("\\n[7/7] Validating mesh...")
    bpy.ops.object.mode_set(mode='OBJECT')
    
    # Get final stats
    vertex_count = len(obj.data.vertices)
    face_count = len(obj.data.polygons)
    edge_count = len(obj.data.edges)
    
    print(f"\\n✓ Cleanup complete!")
    print(f"  Vertices: {vertex_count:,}")
    print(f"  Edges: {edge_count:,}")
    print(f"  Faces: {face_count:,}")
    
    # Check for issues
    issues = []
    
    # Check for non-manifold edges
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='DESELECT')
    bpy.ops.mesh.select_non_manifold()
    selected_count = len([v for v in obj.data.vertices if v.select])
    
    if selected_count > 0:
        issues.append(f"Non-manifold geometry: {selected_count} vertices")
    
    bpy.ops.object.mode_set(mode='OBJECT')
    
    if issues:
        print(f"\\n⚠ Issues found:")
        for issue in issues:
            print(f"  - {issue}")
    else:
        print("\\n✓ No issues found - mesh is clean!")

print("=" * 60)
`;
}

/**
 * Generate PBR material enhancement code (preserves existing colors)
 */
function generatePBRMaterialEnhancementPreserveColors() {
  return `
import bpy

print("\\n" + "=" * 60)
print("PBR MATERIAL ENHANCEMENT (PRESERVING COLORS)")
print("=" * 60)

enhanced_count = 0

for obj in bpy.data.objects:
    if obj.type != 'MESH':
        continue
    
    print(f"\\nProcessing: {obj.name}")
    
    # Ensure object has materials
    if not obj.data.materials:
        print("  Creating default material...")
        mat = bpy.data.materials.new(name=f"{obj.name}_Material")
        mat.use_nodes = True
        obj.data.materials.append(mat)
    
    # Process each material
    for i, mat in enumerate(obj.data.materials):
        if not mat:
            continue
        
        print(f"  Material {i + 1}: {mat.name}")
        
        # Enable nodes if not already
        if not mat.use_nodes:
            mat.use_nodes = True
            print("    ✓ Enabled shader nodes")
        
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        
        # Find or create Principled BSDF
        bsdf = nodes.get('Principled BSDF')
        if not bsdf:
            bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
            print("    ✓ Added Principled BSDF")
        
        # Store current color BEFORE making changes
        current_color = bsdf.inputs['Base Color'].default_value[:]
        
        # Find or create Material Output
        output = None
        for node in nodes:
            if node.type == 'OUTPUT_MATERIAL':
                output = node
                break
        
        if not output:
            output = nodes.new(type='ShaderNodeOutputMaterial')
            print("    ✓ Added Material Output")
        
        # Link BSDF to Output
        if not output.inputs['Surface'].is_linked:
            links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
            print("    ✓ Linked BSDF to output")
        
        # Restore original color (preserve user/SVG colors)
        bsdf.inputs['Base Color'].default_value = current_color
        
        # Ensure reasonable PBR values (but don't touch color)
        current_roughness = bsdf.inputs['Roughness'].default_value
        if current_roughness < 0.1 or current_roughness > 0.95:
            bsdf.inputs['Roughness'].default_value = 0.4
            print("    ✓ Adjusted roughness to 0.4")
        
        current_metallic = bsdf.inputs['Metallic'].default_value
        if current_metallic > 0.5:
            bsdf.inputs['Metallic'].default_value = 1.0
            print("    ✓ Set metallic to 1.0")
        else:
            bsdf.inputs['Metallic'].default_value = 0.0
        
        # Set specular
        if 'Specular IOR Level' in bsdf.inputs:
            bsdf.inputs['Specular IOR Level'].default_value = 0.5
        elif 'Specular' in bsdf.inputs:
            bsdf.inputs['Specular'].default_value = 0.5
        
        print(f"    ✓ Color preserved: RGB{tuple(round(c, 3) for c in current_color[:3])}")
        enhanced_count += 1

print(f"\\n✓ Enhanced {enhanced_count} materials (colors preserved)")
print("=" * 60)
`;
}

/**
 * Generate PBR material enhancement code (original - may override colors)
 */
function generatePBRMaterialEnhancement() {
  return `
import bpy

print("\\n" + "=" * 60)
print("PBR MATERIAL ENHANCEMENT")
print("=" * 60)

enhanced_count = 0

for obj in bpy.data.objects:
    if obj.type != 'MESH':
        continue
    
    print(f"\\nProcessing: {obj.name}")
    
    # Ensure object has materials
    if not obj.data.materials:
        print("  Creating default material...")
        mat = bpy.data.materials.new(name=f"{obj.name}_Material")
        mat.use_nodes = True
        obj.data.materials.append(mat)
    
    # Process each material
    for i, mat in enumerate(obj.data.materials):
        if not mat:
            continue
        
        print(f"  Material {i + 1}: {mat.name}")
        
        # Enable nodes if not already
        if not mat.use_nodes:
            mat.use_nodes = True
            print("    ✓ Enabled shader nodes")
        
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        
        # Find or create Principled BSDF
        bsdf = nodes.get('Principled BSDF')
        if not bsdf:
            bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
            print("    ✓ Added Principled BSDF")
        
        # Find or create Material Output
        output = None
        for node in nodes:
            if node.type == 'OUTPUT_MATERIAL':
                output = node
                break
        
        if not output:
            output = nodes.new(type='ShaderNodeOutputMaterial')
            print("    ✓ Added Material Output")
        
        # Link BSDF to Output
        if not output.inputs['Surface'].is_linked:
            links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
            print("    ✓ Linked BSDF to output")
        
        # Ensure reasonable PBR values
        current_roughness = bsdf.inputs['Roughness'].default_value
        if current_roughness < 0.1 or current_roughness > 0.95:
            bsdf.inputs['Roughness'].default_value = 0.4
            print("    ✓ Adjusted roughness to 0.4")
        
        current_metallic = bsdf.inputs['Metallic'].default_value
        if current_metallic > 0.5:
            # If metallic, ensure it's fully metallic
            bsdf.inputs['Metallic'].default_value = 1.0
            print("    ✓ Set metallic to 1.0")
        else:
            # If non-metallic, ensure it's 0
            bsdf.inputs['Metallic'].default_value = 0.0
        
        # Set specular
        if 'Specular IOR Level' in bsdf.inputs:
            bsdf.inputs['Specular IOR Level'].default_value = 0.5
        elif 'Specular' in bsdf.inputs:
            bsdf.inputs['Specular'].default_value = 0.5
        
        enhanced_count += 1

print(f"\\n✓ Enhanced {enhanced_count} materials with PBR properties")
print("=" * 60)
`;
}

/**
 * Generate UV consistency check and fix
 */
function generateUVConsistencyFix() {
  return `
import bpy

print("\\n" + "=" * 60)
print("UV CONSISTENCY CHECK & FIX")
print("=" * 60)

fixed_count = 0

for obj in bpy.data.objects:
    if obj.type != 'MESH':
        continue
    
    print(f"\\nChecking: {obj.name}")
    
    # Check for UV layers
    if not obj.data.uv_layers:
        print("  ⚠ No UV layers - creating...")
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(island_margin=0.02)
        bpy.ops.object.mode_set(mode='OBJECT')
        print("  ✓ UV layer created")
        fixed_count += 1
    else:
        uv_layer_count = len(obj.data.uv_layers)
        print(f"  ✓ Has {uv_layer_count} UV layer(s)")
        
        # Ensure active UV layer
        if not obj.data.uv_layers.active:
            obj.data.uv_layers[0].active = True
            print("  ✓ Set active UV layer")

print(f"\\n✓ Fixed UV layers for {fixed_count} object(s)")
print("=" * 60)
`;
}

/**
 * Generate auto-scaling and origin fix
 */
function generateAutoScaleAndOriginFix() {
  return `
import bpy

print("\\n" + "=" * 60)
print("AUTO-SCALE & ORIGIN FIX")
print("=" * 60)

# Process all mesh objects
mesh_objects = [obj for obj in bpy.data.objects if obj.type == 'MESH']

if not mesh_objects:
    print("⚠ No mesh objects found")
else:
    print(f"Processing {len(mesh_objects)} mesh object(s)...")
    
    for obj in mesh_objects:
        print(f"\\n{obj.name}:")
        
        # Set origin to geometry center
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
        print("  ✓ Origin centered")
        
        # Move to world origin
        original_location = obj.location.copy()
        obj.location = (0, 0, 0)
        print(f"  ✓ Moved to origin (was at {[round(x, 3) for x in original_location]})")
        
        # Get dimensions
        dimensions = obj.dimensions
        max_dim = max(dimensions)
        
        print(f"  Dimensions: {[round(d, 3) for d in dimensions]}")
        print(f"  Max dimension: {round(max_dim, 3)}")
        
        # Scale to reasonable size (max dimension = 2 units)
        if max_dim > 0.001:  # Avoid division by zero
            target_size = 2.0
            scale_factor = target_size / max_dim
            
            obj.scale = (scale_factor, scale_factor, scale_factor)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            print(f"  ✓ Scaled by {round(scale_factor, 4)} (now max={round(target_size, 3)})")
        else:
            print("  ⚠ Object too small, skipping scale")
        
        obj.select_set(False)
    
    print(f"\\n✓ Processed {len(mesh_objects)} object(s)")

print("=" * 60)
`;
}

/**
 * Generate origin fix only (preserves user-set scales/sizes)
 */
function generateOriginFixPreserveScale() {
  return `
import bpy

print("\\n" + "=" * 60)
print("ORIGIN FIX (PRESERVING CUSTOM SCALES)")
print("=" * 60)

# Process all mesh objects - only fix origins, preserve sizes
mesh_objects = [obj for obj in bpy.data.objects if obj.type == 'MESH']

if not mesh_objects:
    print("⚠ No mesh objects found")
else:
    print(f"Processing {len(mesh_objects)} mesh object(s)...")
    
    for obj in mesh_objects:
        print(f"\\n{obj.name}:")
        
        # Store current scale and dimensions
        current_dimensions = obj.dimensions.copy()
        max_dim = max(current_dimensions)
        
        print(f"  Current dimensions: {[round(d, 3) for d in current_dimensions]}")
        print(f"  Max dimension: {round(max_dim, 3)}")
        
        # Set origin to geometry center
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
        print("  ✓ Origin centered (scale preserved)")
        
        # Verify dimensions unchanged
        new_dimensions = obj.dimensions.copy()
        print(f"  Verified dimensions: {[round(d, 3) for d in new_dimensions]}")
        
        obj.select_set(False)
    
    print(f"\\n✓ Processed {len(mesh_objects)} object(s) - custom sizes preserved")

print("=" * 60)
`;
}

/**
 * Quality scoring code
 */
function generateQualityScore() {
  return `
import bpy

print("\\n" + "=" * 60)
print("MODEL QUALITY ASSESSMENT")
print("=" * 60)

score = 100
issues = []
warnings = []

mesh_objects = [obj for obj in bpy.data.objects if obj.type == 'MESH']

if not mesh_objects:
    score = 0
    issues.append("No mesh objects in scene")
else:
    print(f"\\nAnalyzing {len(mesh_objects)} mesh object(s)...")
    
    total_verts = 0
    total_faces = 0
    objects_with_materials = 0
    objects_with_uvs = 0
    materials_with_nodes = 0
    
    for obj in mesh_objects:
        verts = len(obj.data.vertices)
        faces = len(obj.data.polygons)
        total_verts += verts
        total_faces += faces
        
        # Check materials
        if obj.data.materials:
            objects_with_materials += 1
            for mat in obj.data.materials:
                if mat and mat.use_nodes:
                    materials_with_nodes += 1
                    break
        
        # Check UVs
        if obj.data.uv_layers:
            objects_with_uvs += 1
        
        # Check for issues
        if verts == 0:
            issues.append(f"{obj.name}: No vertices")
            score -= 10
        
        if faces == 0:
            issues.append(f"{obj.name}: No faces")
            score -= 10
        
        if not obj.data.materials:
            warnings.append(f"{obj.name}: No materials")
            score -= 5
        
        if not obj.data.uv_layers:
            warnings.append(f"{obj.name}: No UV mapping")
            score -= 5
    
    # Scoring
    print(f"\\nGeometry:")
    print(f"  Total vertices: {total_verts:,}")
    print(f"  Total faces: {total_faces:,}")
    
    if total_verts > 100000:
        warnings.append(f"High vertex count: {total_verts:,} (may impact performance)")
        score -= 10
    elif total_verts < 3:
        issues.append(f"Too few vertices: {total_verts}")
        score -= 20
    
    print(f"\\nMaterials:")
    print(f"  Objects with materials: {objects_with_materials}/{len(mesh_objects)}")
    print(f"  Materials with shader nodes: {materials_with_nodes}")
    
    material_coverage = (objects_with_materials / len(mesh_objects)) * 100
    if material_coverage < 50:
        issues.append(f"Low material coverage: {material_coverage:.1f}%")
        score -= 15
    
    print(f"\\nUV Mapping:")
    print(f"  Objects with UVs: {objects_with_uvs}/{len(mesh_objects)}")
    
    uv_coverage = (objects_with_uvs / len(mesh_objects)) * 100
    if uv_coverage < 50:
        warnings.append(f"Low UV coverage: {uv_coverage:.1f}%")
        score -= 10

# Ensure score is within bounds
score = max(0, min(100, score))

print(f"\\n{'=' * 60}")
print(f"QUALITY SCORE: {score}/100")
print(f"{'=' * 60}")

if score >= 90:
    print("Rating: ⭐⭐⭐⭐⭐ Excellent")
elif score >= 75:
    print("Rating: ⭐⭐⭐⭐ Good")
elif score >= 60:
    print("Rating: ⭐⭐⭐ Fair")
elif score >= 40:
    print("Rating: ⭐⭐ Poor")
else:
    print("Rating: ⭐ Very Poor")

if issues:
    print(f"\\n❌ ISSUES ({len(issues)}):")
    for issue in issues:
        print(f"  - {issue}")

if warnings:
    print(f"\\n⚠ WARNINGS ({len(warnings)}):")
    for warning in warnings:
        print(f"  - {warning}")

if score == 100:
    print("\\n✓ Perfect model - no issues found!")

print("=" * 60)
`;
}

/**
 * Validate GLB output file
 */
async function validateGLBOutput(glbPath) {
  try {
    if (!fs.existsSync(glbPath)) {
      return {
        valid: false,
        error: 'GLB file does not exist'
      };
    }
    
    const stats = fs.statSync(glbPath);
    
    // Check file size
    if (stats.size === 0) {
      return {
        valid: false,
        error: 'GLB file is empty'
      };
    }
    
    if (stats.size < 100) {
      return {
        valid: false,
        error: 'GLB file is too small (possibly corrupted)'
      };
    }
    
    // Read GLB header (first 12 bytes)
    const fd = fs.openSync(glbPath, 'r');
    const header = Buffer.alloc(12);
    fs.readSync(fd, header, 0, 12, 0);
    fs.closeSync(fd);
    
    // Check magic number (0x46546C67 = "glTF")
    const magic = header.readUInt32LE(0);
    if (magic !== 0x46546C67) {
      return {
        valid: false,
        error: 'Invalid GLB file format (wrong magic number)'
      };
    }
    
    // Check version (should be 2)
    const version = header.readUInt32LE(4);
    if (version !== 2) {
      return {
        valid: false,
        error: `Unsupported GLB version: ${version} (expected 2)`
      };
    }
    
    // Check file length
    const length = header.readUInt32LE(8);
    if (length !== stats.size) {
      return {
        valid: false,
        error: 'GLB file length mismatch (possibly corrupted)'
      };
    }
    
    return {
      valid: true,
      size: stats.size,
      sizeMB: (stats.size / 1024 / 1024).toFixed(2),
      version: version
    };
    
  } catch (error) {
    return {
      valid: false,
      error: `Validation error: ${error.message}`
    };
  }
}

/**
 * Generate comprehensive quality improvement pipeline
 */
function generateQualityPipeline() {
  return `
${generateGeometryCleanup()}

${generatePBRMaterialEnhancement()}

${generateUVConsistencyFix()}

${generateAutoScaleAndOriginFix()}

${generateQualityScore()}
`;
}

/**
 * Generate comprehensive quality improvement pipeline (preserves colors)
 */
function generateQualityPipelinePreserveColors() {
  return `
${generateGeometryCleanup()}

${generatePBRMaterialEnhancementPreserveColors()}

${generateUVConsistencyFix()}

${generateAutoScaleAndOriginFix()}

${generateQualityScore()}
`;
}

/**
 * Generate selective quality pipeline preserving both colors AND custom scales
 * Only fixes: cleanup geometry, UV consistency, origin centering
 * Skips: auto-scaling (preserves user-set sizes)
 */
function generateQualityPipelinePreserveColorsAndScale() {
  return `
${generateGeometryCleanup()}

${generatePBRMaterialEnhancementPreserveColors()}

${generateUVConsistencyFix()}

${generateOriginFixPreserveScale()}

${generateQualityScore()}
`;
}

module.exports = {
  generateGeometryCleanup,
  generatePBRMaterialEnhancement,
  generatePBRMaterialEnhancementPreserveColors,
  generateUVConsistencyFix,
  generateAutoScaleAndOriginFix,
  generateOriginFixPreserveScale,
  generateQualityScore,
  generateQualityPipeline,
  generateQualityPipelinePreserveColors,
  generateQualityPipelinePreserveColorsAndScale,
  validateGLBOutput
};
