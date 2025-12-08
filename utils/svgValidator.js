/**
 * SVG Validation and Processing Module
 * Validates, simplifies, and optimizes SVG files before Blender import
 */

const fs = require('fs');
const path = require('path');

// Maximum file size (5MB)
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// Maximum path points for complexity check
const MAX_PATH_POINTS = 10000;

/**
 * Validate SVG file structure and content
 */
async function validateSVG(filePath) {
  const issues = [];
  const warnings = [];
  
  try {
    // Check file exists
    if (!fs.existsSync(filePath)) {
      return {
        valid: false,
        issues: ['File does not exist'],
        warnings: []
      };
    }
    
    // Check file size
    const stats = fs.statSync(filePath);
    if (stats.size > MAX_FILE_SIZE) {
      issues.push(`File too large: ${(stats.size / 1024 / 1024).toFixed(2)}MB (max 5MB)`);
    }
    
    if (stats.size === 0) {
      issues.push('File is empty');
    }
    
    // Read file content
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Check if it's valid XML/SVG
    if (!content.includes('<svg') && !content.includes('<SVG')) {
      issues.push('File does not contain SVG content');
    }
    
    // Check for required SVG elements
    if (!content.match(/<svg[^>]*>/i)) {
      issues.push('Missing SVG root element');
    }
    
    // Check for viewBox or width/height
    const hasDimensions = content.match(/viewBox\s*=/i) || 
                         (content.match(/width\s*=/i) && content.match(/height\s*=/i));
    if (!hasDimensions) {
      warnings.push('SVG missing viewBox or dimensions - may have scaling issues');
    }
    
    // Count path elements for complexity
    const pathCount = (content.match(/<path/gi) || []).length;
    const circleCount = (content.match(/<circle/gi) || []).length;
    const rectCount = (content.match(/<rect/gi) || []).length;
    const ellipseCount = (content.match(/<ellipse/gi) || []).length;
    const polygonCount = (content.match(/<polygon/gi) || []).length;
    const polylineCount = (content.match(/<polyline/gi) || []).length;
    
    const totalShapes = pathCount + circleCount + rectCount + ellipseCount + polygonCount + polylineCount;
    
    if (totalShapes === 0) {
      warnings.push('No drawable shapes found in SVG');
    }
    
    if (totalShapes > 1000) {
      warnings.push(`High complexity: ${totalShapes} shapes (may slow down processing)`);
    }
    
    // Check for unsupported features
    if (content.includes('<image')) {
      warnings.push('SVG contains embedded images (will be ignored)');
    }
    
    if (content.includes('<foreignObject')) {
      warnings.push('SVG contains foreign objects (will be ignored)');
    }
    
    if (content.includes('<animate') || content.includes('<animateTransform')) {
      warnings.push('SVG contains animations (will be ignored)');
    }
    
    if (content.includes('<script')) {
      issues.push('SVG contains scripts (security risk - rejected)');
    }
    
    // Check for text elements
    const textCount = (content.match(/<text/gi) || []).length;
    if (textCount > 0) {
      warnings.push(`SVG contains ${textCount} text elements (may not convert properly)`);
    }
    
    // Estimate path complexity
    const pathData = content.match(/d\s*=\s*["']([^"']+)["']/gi) || [];
    let totalPathPoints = 0;
    
    for (const pathAttr of pathData) {
      // Count commands in path (rough estimate)
      const commands = pathAttr.match(/[MLHVCSQTAZmlhvcsqtaz]/g) || [];
      totalPathPoints += commands.length;
    }
    
    if (totalPathPoints > MAX_PATH_POINTS) {
      warnings.push(`Very complex paths: ~${totalPathPoints} points (may require simplification)`);
    }
    
    // Check for gradients and patterns
    if (content.includes('<linearGradient') || content.includes('<radialGradient')) {
      warnings.push('SVG contains gradients (will be converted to solid colors)');
    }
    
    if (content.includes('<pattern')) {
      warnings.push('SVG contains patterns (will be ignored)');
    }
    
    return {
      valid: issues.length === 0,
      issues,
      warnings,
      stats: {
        fileSize: stats.size,
        fileSizeMB: (stats.size / 1024 / 1024).toFixed(2),
        shapes: {
          paths: pathCount,
          circles: circleCount,
          rectangles: rectCount,
          ellipses: ellipseCount,
          polygons: polygonCount,
          polylines: polylineCount,
          total: totalShapes
        },
        estimatedPathPoints: totalPathPoints,
        hasText: textCount > 0,
        hasGradients: content.includes('Gradient'),
        hasAnimations: content.includes('animate')
      }
    };
    
  } catch (error) {
    return {
      valid: false,
      issues: [`Validation error: ${error.message}`],
      warnings: []
    };
  }
}

/**
 * Simplify SVG by removing unsupported elements
 */
function simplifySVG(svgContent) {
  let simplified = svgContent;
  
  // Remove scripts (security)
  simplified = simplified.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  
  // Remove event handlers
  simplified = simplified.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
  
  // Remove animations
  simplified = simplified.replace(/<animate[^>]*>[\s\S]*?<\/animate>/gi, '');
  simplified = simplified.replace(/<animateTransform[^>]*>[\s\S]*?<\/animateTransform>/gi, '');
  
  // Remove foreign objects
  simplified = simplified.replace(/<foreignObject[^>]*>[\s\S]*?<\/foreignObject>/gi, '');
  
  // Remove embedded images (keep as placeholder comment)
  simplified = simplified.replace(/<image[^>]*\/>/gi, '<!-- image removed -->');
  simplified = simplified.replace(/<image[^>]*>[\s\S]*?<\/image>/gi, '<!-- image removed -->');
  
  // Remove metadata and desc (not needed for 3D)
  simplified = simplified.replace(/<metadata[^>]*>[\s\S]*?<\/metadata>/gi, '');
  simplified = simplified.replace(/<desc[^>]*>[\s\S]*?<\/desc>/gi, '');
  
  // Remove unnecessary whitespace
  simplified = simplified.replace(/>\s+</g, '><');
  
  return simplified;
}

/**
 * Calculate adaptive geometry settings based on SVG complexity
 */
function calculateAdaptiveSettings(validationResult) {
  const stats = validationResult.stats;
  const totalShapes = stats.shapes.total;
  const pathPoints = stats.estimatedPathPoints;
  
  let settings = {
    extrudeDepth: 0.1,
    bevelDepth: 0.01,
    curveResolution: 12,
    simplify: false,
    simplifyThreshold: 0.001,
    decimateRatio: 1.0
  };
  
  // Adjust based on complexity
  if (totalShapes > 500 || pathPoints > 5000) {
    // High complexity - reduce quality for performance
    settings.curveResolution = 8;
    settings.simplify = true;
    settings.simplifyThreshold = 0.005;
    settings.decimateRatio = 0.7;
  } else if (totalShapes > 200 || pathPoints > 2000) {
    // Medium complexity
    settings.curveResolution = 10;
    settings.simplify = true;
    settings.simplifyThreshold = 0.002;
    settings.decimateRatio = 0.85;
  } else {
    // Low complexity - high quality
    settings.curveResolution = 16;
    settings.simplify = false;
  }
  
  // Adjust extrude depth based on file size (smaller SVGs = smaller extrusion)
  const sizeMB = parseFloat(stats.fileSizeMB);
  if (sizeMB < 0.1) {
    settings.extrudeDepth = 0.05;
    settings.bevelDepth = 0.005;
  } else if (sizeMB > 2) {
    settings.extrudeDepth = 0.15;
    settings.bevelDepth = 0.015;
  }
  
  return settings;
}

/**
 * Generate optimized Blender import code with adaptive settings
 */
function generateImportCode(svgPath, settings) {
  return `
import bpy
import os

print("=" * 60)
print("OPTIMIZED SVG IMPORT PIPELINE")
print("=" * 60)

# Enable required addons
if 'io_curve_svg' not in bpy.context.preferences.addons:
    try:
        bpy.ops.preferences.addon_enable(module='io_curve_svg')
        print("✓ SVG importer enabled")
    except Exception as e:
        print(f"⚠ Warning: {e}")

if 'io_scene_gltf2' not in bpy.context.preferences.addons:
    try:
        bpy.ops.preferences.addon_enable(module='io_scene_gltf2')
        print("✓ GLTF exporter enabled")
    except Exception as e:
        print(f"⚠ Warning: {e}")

# Clear scene
print("\\n[1/9] Clearing scene...")
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
print("✓ Scene cleared")

# Import SVG
svg_path = r"${svgPath}"
print(f"\\n[2/9] Importing SVG: {os.path.basename(svg_path)}")

try:
    objects_before = set(bpy.data.objects)
    bpy.ops.import_curve.svg(filepath=svg_path)
    objects_after = set(bpy.data.objects)
    imported_objects = list(objects_after - objects_before)
    
    if not imported_objects:
        imported_objects = list(bpy.context.selected_objects)
    
    print(f"✓ Imported {len(imported_objects)} objects")
except Exception as e:
    print(f"✗ Import failed: {e}")
    raise

if not imported_objects:
    raise Exception("No objects imported")

# Extract colors
print("\\n[3/9] Extracting colors...")
svg_color = (1.0, 0.0, 0.0, 1.0)  # Default red
for obj in imported_objects:
    if obj.type == 'CURVE' and obj.data.materials:
        for mat in obj.data.materials:
            if mat:
                svg_color = mat.diffuse_color[:]
                print(f"✓ Color: RGB{tuple(round(c, 3) for c in svg_color[:3])}")
                break
        if svg_color != (1.0, 0.0, 0.0, 1.0):
            break

# Convert to mesh with adaptive settings
print("\\n[4/9] Converting curves to mesh...")
print(f"Settings: extrude={${settings.extrudeDepth}}, bevel={${settings.bevelDepth}}, resolution={${settings.curveResolution}}")

for obj in imported_objects:
    if obj.type == 'CURVE':
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        obj.data.extrude = ${settings.extrudeDepth}
        obj.data.bevel_depth = ${settings.bevelDepth}
        obj.data.resolution_u = ${settings.curveResolution}
        bpy.ops.object.convert(target='MESH')
        print(f"✓ Converted {obj.name}")

# Join objects
print("\\n[5/9] Joining objects...")
if len(imported_objects) > 1:
    bpy.ops.object.select_all(action='DESELECT')
    for obj in imported_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = imported_objects[0]
    bpy.ops.object.join()
    print(f"✓ Joined {len(imported_objects)} objects")

final_obj = bpy.context.active_object
if not final_obj:
    raise Exception("No final object")

final_obj.name = "SVG_Model"

# Center and normalize
print("\\n[6/9] Normalizing geometry...")
bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
final_obj.location = (0, 0, 0)

current_max = max(final_obj.dimensions)
if current_max > 0:
    scale_factor = 2.0 / current_max
    final_obj.scale = (scale_factor, scale_factor, scale_factor)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    print(f"✓ Scaled by {round(scale_factor, 3)}")

# Advanced cleanup
print("\\n[7/9] Advanced cleanup...")
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.0001)
bpy.ops.mesh.delete_loose()
bpy.ops.mesh.dissolve_degenerate()

${settings.simplify ? `# Simplify mesh
bpy.ops.mesh.dissolve_limited(angle_limit=0.0872665)  # 5 degrees
print("✓ Simplified geometry")` : ''}

bpy.ops.object.mode_set(mode='OBJECT')

vertex_count = len(final_obj.data.vertices)
face_count = len(final_obj.data.polygons)
print(f"✓ Final mesh: {vertex_count:,} verts, {face_count:,} faces")

# Shading and normals
print("\\n[8/9] Finalizing shading...")
bpy.ops.object.shade_smooth()
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.normals_make_consistent(inside=False)
bpy.ops.object.mode_set(mode='OBJECT')

# UV unwrap
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(island_margin=0.02)
bpy.ops.object.mode_set(mode='OBJECT')
print("✓ UV unwrapped")

# PBR Material
print("\\n[9/9] Creating PBR material...")
final_obj.data.materials.clear()

mat = bpy.data.materials.new(name="SVG_Material")
mat.use_nodes = True
nodes = mat.node_tree.nodes
links = mat.node_tree.links
nodes.clear()

# Principled BSDF
bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
bsdf.location = (0, 0)
bsdf.inputs['Base Color'].default_value = svg_color
bsdf.inputs['Roughness'].default_value = 0.4
bsdf.inputs['Metallic'].default_value = 0.0
bsdf.inputs['Specular IOR Level'].default_value = 0.5

output = nodes.new(type='ShaderNodeOutputMaterial')
output.location = (300, 0)
links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

final_obj.data.materials.append(mat)

print("\\n" + "=" * 60)
print("SVG IMPORT COMPLETE!")
print(f"Object: {final_obj.name}")
print(f"Vertices: {vertex_count:,}")
print(f"Faces: {face_count:,}")
print(f"Materials: {len(final_obj.data.materials)}")
print("=" * 60)
`;
}

module.exports = {
  validateSVG,
  simplifySVG,
  calculateAdaptiveSettings,
  generateImportCode,
  MAX_FILE_SIZE
};
