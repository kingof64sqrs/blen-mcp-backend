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
 * Detect SVG type and characteristics
 */
function detectSVGType(content) {
  const type = {
    isTechnical: false,
    isPhoto: false,
    isIllustration: false,
    hasLayers: false,
    hasComplexGradients: false,
    hasClipPaths: false,
    hasMasks: false
  };

  // Technical drawing indicators
  if (content.includes('CAD') || content.includes('technical') || 
      content.match(/line[^>]*stroke-width\s*=\s*["'][0-9.]+["']/i)) {
    type.isTechnical = true;
  }

  // Photo-style (many gradients, complex filters)
  const gradientCount = (content.match(/<linearGradient|<radialGradient/gi) || []).length;
  if (gradientCount > 10) {
    type.hasComplexGradients = true;
    type.isPhoto = true;
  }

  // Layer detection (groups with ids or classes)
  const groupCount = (content.match(/<g\s+[^>]*id\s*=/gi) || []).length;
  if (groupCount > 3) {
    type.hasLayers = true;
  }

  // Clip paths and masks
  if (content.includes('<clipPath')) {
    type.hasClipPaths = true;
  }
  if (content.includes('<mask')) {
    type.hasMasks = true;
  }

  // Illustration style
  if (!type.isTechnical && !type.isPhoto && groupCount > 1) {
    type.isIllustration = true;
  }

  return type;
}

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
    
    // Detect SVG type
    const svgType = detectSVGType(content);
    
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
    const lineCount = (content.match(/<line/gi) || []).length;
    const groupCount = (content.match(/<g[\s>]/gi) || []).length;
    
    const totalShapes = pathCount + circleCount + rectCount + ellipseCount + polygonCount + polylineCount + lineCount;
    
    if (totalShapes === 0) {
      warnings.push('No drawable shapes found in SVG');
    }
    
    if (totalShapes > 1000) {
      warnings.push(`High complexity: ${totalShapes} shapes (may slow down processing)`);
    }
    
    // Check for unsupported features
    if (content.includes('<image')) {
      warnings.push('SVG contains embedded images (will be converted to rectangles)');
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
      warnings.push(`SVG contains ${textCount} text elements (will be converted to paths)`);
    }
    
    // Estimate path complexity
    const pathData = content.match(/d\s*=\s*["']([^"']+)["']/gi) || [];
    let totalPathPoints = 0;
    let maxPathPoints = 0;
    
    for (const pathAttr of pathData) {
      // Count commands in path (rough estimate)
      const commands = pathAttr.match(/[MLHVCSQTAZmlhvcsqtaz]/g) || [];
      totalPathPoints += commands.length;
      maxPathPoints = Math.max(maxPathPoints, commands.length);
    }
    
    if (totalPathPoints > MAX_PATH_POINTS) {
      warnings.push(`Very complex paths: ~${totalPathPoints} points (will use adaptive quality)`);
    }
    
    // Check for gradients and patterns
    const gradientCount = (content.match(/<linearGradient|<radialGradient/gi) || []).length;
    if (gradientCount > 0) {
      warnings.push(`SVG contains ${gradientCount} gradients (will extract average color)`);
    }
    
    if (content.includes('<pattern')) {
      warnings.push('SVG contains patterns (will be simplified)');
    }

    // Type-specific warnings
    if (svgType.isTechnical) {
      warnings.push('Technical drawing detected - using high-precision import');
    }
    if (svgType.hasComplexGradients) {
      warnings.push('Complex gradients detected - will be simplified');
    }
    if (svgType.hasLayers && groupCount > 10) {
      warnings.push(`${groupCount} layers detected - will preserve hierarchy`);
    }
    
    return {
      valid: issues.length === 0,
      issues,
      warnings,
      svgType,
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
          lines: lineCount,
          groups: groupCount,
          total: totalShapes
        },
        estimatedPathPoints: totalPathPoints,
        maxPathPoints: maxPathPoints,
        gradientCount: gradientCount,
        hasText: textCount > 0,
        hasGradients: gradientCount > 0,
        hasAnimations: content.includes('animate'),
        hasClipPaths: svgType.hasClipPaths,
        hasMasks: svgType.hasMasks
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
  simplified = simplified.replace(/<animateMotion[^>]*>[\s\S]*?<\/animateMotion>/gi, '');
  simplified = simplified.replace(/<set[^>]*>[\s\S]*?<\/set>/gi, '');
  
  // Remove foreign objects
  simplified = simplified.replace(/<foreignObject[^>]*>[\s\S]*?<\/foreignObject>/gi, '');
  
  // Convert embedded images to placeholder rectangles (preserve layout)
  simplified = simplified.replace(/<image\s+([^>]*)\s*\/>/gi, (match, attrs) => {
    const xMatch = attrs.match(/x\s*=\s*["']([^"']*)["']/);
    const yMatch = attrs.match(/y\s*=\s*["']([^"']*)["']/);
    const wMatch = attrs.match(/width\s*=\s*["']([^"']*)["']/);
    const hMatch = attrs.match(/height\s*=\s*["']([^"']*)["']/);
    
    if (xMatch && yMatch && wMatch && hMatch) {
      return `<rect x="${xMatch[1]}" y="${yMatch[1]}" width="${wMatch[1]}" height="${hMatch[1]}" fill="#cccccc" opacity="0.5"/>`;
    }
    return '<!-- image removed -->';
  });
  
  simplified = simplified.replace(/<image[^>]*>[\s\S]*?<\/image>/gi, '<!-- image removed -->');
  
  // Remove metadata and desc (not needed for 3D)
  simplified = simplified.replace(/<metadata[^>]*>[\s\S]*?<\/metadata>/gi, '');
  simplified = simplified.replace(/<desc[^>]*>[\s\S]*?<\/desc>/gi, '');
  simplified = simplified.replace(/<title[^>]*>[\s\S]*?<\/title>/gi, '');
  
  // Simplify gradients to solid colors (extract first stop color)
  simplified = simplified.replace(/<linearGradient([^>]*)>([\s\S]*?)<\/linearGradient>/gi, (match, attrs, content) => {
    const idMatch = attrs.match(/id\s*=\s*["']([^"']*)["']/);
    const stopMatch = content.match(/stop-color\s*:\s*([^;"'\s]+)|stop-color\s*=\s*["']([^"']*)["']/i);
    
    if (idMatch && stopMatch) {
      const color = stopMatch[1] || stopMatch[2] || '#808080';
      return `<!-- gradient ${idMatch[1]} replaced with solid color ${color} -->`;
    }
    return '<!-- gradient removed -->';
  });
  
  simplified = simplified.replace(/<radialGradient([^>]*)>([\s\S]*?)<\/radialGradient>/gi, (match, attrs, content) => {
    const idMatch = attrs.match(/id\s*=\s*["']([^"']*)["']/);
    const stopMatch = content.match(/stop-color\s*:\s*([^;"'\s]+)|stop-color\s*=\s*["']([^"']*)["']/i);
    
    if (idMatch && stopMatch) {
      const color = stopMatch[1] || stopMatch[2] || '#808080';
      return `<!-- gradient ${idMatch[1]} replaced with solid color ${color} -->`;
    }
    return '<!-- gradient removed -->';
  });
  
  // Replace gradient references with solid colors
  simplified = simplified.replace(/fill\s*=\s*["']url\(#([^)]+)\)["']/gi, 'fill="#808080"');
  simplified = simplified.replace(/stroke\s*=\s*["']url\(#([^)]+)\)["']/gi, 'stroke="#404040"');
  
  // Remove patterns
  simplified = simplified.replace(/<pattern[^>]*>[\s\S]*?<\/pattern>/gi, '<!-- pattern removed -->');
  
  // Remove filters (can cause issues)
  simplified = simplified.replace(/<filter[^>]*>[\s\S]*?<\/filter>/gi, '<!-- filter removed -->');
  simplified = simplified.replace(/filter\s*=\s*["']url\(#[^)]+\)["']/gi, '');
  
  // Remove unnecessary whitespace and newlines
  simplified = simplified.replace(/>\s+</g, '><');
  simplified = simplified.replace(/\s+/g, ' ');
  
  // Remove empty groups
  simplified = simplified.replace(/<g[^>]*>\s*<\/g>/gi, '');
  
  return simplified;
}

/**
 * Advanced SVG preprocessing for technical drawings
 */
function preprocessTechnicalSVG(svgContent) {
  let processed = svgContent;
  
  // Ensure all paths have proper fill
  processed = processed.replace(/<path([^>]*)\s+d\s*=\s*["']([^"']+)["']([^>]*)>/gi, (match, before, d, after) => {
    // If no fill specified, add one
    if (!match.includes('fill=') && !match.includes('fill:')) {
      return `<path${before} d="${d}" fill="currentColor"${after}>`;
    }
    return match;
  });
  
  // Convert none fills to visible
  processed = processed.replace(/fill\s*=\s*["']none["']/gi, 'fill="#e0e0e0"');
  
  // Ensure strokes are preserved for technical drawings
  processed = processed.replace(/<line([^>]*)>/gi, (match, attrs) => {
    if (!match.includes('stroke=') && !match.includes('stroke:')) {
      return `<line${attrs} stroke="currentColor">`;
    }
    return match;
  });
  
  return processed;
}

/**
 * Calculate adaptive geometry settings based on SVG complexity
 */
function calculateAdaptiveSettings(validationResult) {
  const stats = validationResult.stats;
  const svgType = validationResult.svgType || {};
  const totalShapes = stats.shapes.total;
  const pathPoints = stats.estimatedPathPoints;
  const maxPathPoints = stats.maxPathPoints || 0;
  
  let settings = {
    extrudeDepth: 0.1,
    bevelDepth: 0.01,
    curveResolution: 12,
    simplify: false,
    simplifyThreshold: 0.001,
    decimateRatio: 1.0,
    preserveLayers: false,
    highPrecision: false,
    separateByColor: false,
    convertTextToPaths: true,
    batchSize: 50  // Process objects in batches
  };
  
  // Technical drawings need high precision but still reasonable performance
  if (svgType.isTechnical) {
    settings.highPrecision = true;
    settings.curveResolution = 16;  // Reduced from 24 for performance
    settings.simplify = false;
    settings.extrudeDepth = 0.05;
    settings.bevelDepth = 0.005;
    settings.preserveLayers = false;  // Disabled to prevent hanging
    settings.batchSize = 30;
  }
  // Photo-style with complex gradients
  else if (svgType.isPhoto || svgType.hasComplexGradients) {
    settings.curveResolution = 12;
    settings.simplify = true;
    settings.simplifyThreshold = 0.005;
    settings.separateByColor = false;  // Disabled to prevent hanging
    settings.extrudeDepth = 0.08;
    settings.batchSize = 40;
  }
  // Layer-based illustrations
  else if (svgType.hasLayers && stats.shapes.groups > 5) {
    settings.preserveLayers = false;  // Disabled to prevent hanging
    settings.curveResolution = 12;
    settings.separateByColor = false;
    settings.extrudeDepth = 0.1;
    settings.batchSize = 40;
  }
  // Standard complexity adjustments
  else if (totalShapes > 500 || pathPoints > 5000) {
    // High complexity - aggressive optimization
    settings.curveResolution = 8;
    settings.simplify = true;
    settings.simplifyThreshold = 0.01;
    settings.decimateRatio = 0.7;
    settings.batchSize = 25;
  } else if (totalShapes > 200 || pathPoints > 2000) {
    // Medium complexity
    settings.curveResolution = 10;
    settings.simplify = true;
    settings.simplifyThreshold = 0.005;
    settings.decimateRatio = 0.8;
    settings.batchSize = 40;
  } else {
    // Low complexity - high quality
    settings.curveResolution = 14;
    settings.simplify = false;
    settings.batchSize = 100;
  }
  
  // Very complex single paths need special handling
  if (maxPathPoints > 500) {
    settings.simplify = true;
    settings.simplifyThreshold = Math.max(settings.simplifyThreshold, 0.01);
    settings.curveResolution = Math.min(settings.curveResolution, 10);
  }
  
  // Adjust extrude depth based on file size
  const sizeMB = parseFloat(stats.fileSizeMB);
  if (sizeMB < 0.1) {
    settings.extrudeDepth = Math.max(0.05, settings.extrudeDepth * 0.5);
    settings.bevelDepth = Math.max(0.005, settings.bevelDepth * 0.5);
  } else if (sizeMB > 2) {
    settings.extrudeDepth = Math.min(0.15, settings.extrudeDepth * 1.2);
    settings.bevelDepth = Math.min(0.015, settings.bevelDepth * 1.2);
  }
  
  return settings;
}

/**
 * Generate simple Blender import code (like manual import)
 */
function generateImportCode(svgPath, settings) {
  // Settings are already calculated, just use them directly
  const curveResolution = settings.curveResolution || 12;
  const extrusionDepth = settings.extrudeDepth || 0.1;
  
  return `
import bpy

# Clear scene
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# Import SVG
svg_path = r"${svgPath}"
bpy.ops.import_curve.svg(filepath=svg_path)

# Collect curves and colors
curves_data = []
for obj in bpy.context.scene.objects:
    if obj.type == 'CURVE':
        color = (0.8, 0.8, 0.8, 1.0)
        if obj.active_material:
            color = tuple(obj.active_material.diffuse_color[:])
        curves_data.append({'obj': obj, 'color': color})

# Set properties and convert
for data in curves_data:
    obj = data['obj']
    obj.data.resolution_u = ${curveResolution}
    obj.data.extrude = ${extrusionDepth}
    obj.data.bevel_depth = 0
    obj.data.fill_mode = 'BOTH'

# Convert all at once
bpy.ops.object.select_all(action='DESELECT')
for data in curves_data:
    data['obj'].select_set(True)
bpy.ops.object.convert(target='MESH')

# Apply colors only
for data in curves_data:
    obj = data['obj']
    if obj.type == 'MESH':
        obj.data.materials.clear()
        mat = bpy.data.materials.new(name=f"{obj.name}_Mat")
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs[0].default_value = data['color']
        obj.data.materials.append(mat)

print("Import complete")
`.trim();
}

module.exports = {
  validateSVG,
  simplifySVG,
  preprocessTechnicalSVG,
  detectSVGType,
  calculateAdaptiveSettings,
  generateImportCode,
  MAX_FILE_SIZE
};
