/**
 * Prompt Safety and Validation Module
 * Filters malicious prompts and validates AI-generated code
 */

// Dangerous patterns that could be malicious
const DANGEROUS_PATTERNS = [
  /os\.system/gi,
  /subprocess\./gi,
  /eval\s*\(/gi,
  /exec\s*\(/gi,
  /__import__/gi,
  /open\s*\(/gi,
  /file\s*\(/gi,
  /import\s+os/gi,
  /import\s+sys/gi,
  /import\s+subprocess/gi,
  /bpy\.ops\.wm\.quit/gi,
  /bpy\.ops\.wm\.save/gi,
  /bpy\.app\.quit/gi,
  /\.unlink\(/gi,
  /os\.remove\(/gi,  // Only block os.remove, not all .remove
  /\.rmdir\(/gi,
  /shutil\./gi,
  /pathlib\./gi
];

// Allowed Blender operations whitelist
const ALLOWED_OPERATIONS = [
  'bpy.ops.mesh.',
  'bpy.ops.object.',
  'bpy.ops.transform.',
  'bpy.ops.material.',
  'bpy.ops.node.',
  'bpy.context.',
  'bpy.data.',
  'bpy.types.',
  'math.',
  'mathutils.',
  'print(',
  'len(',
  'range(',
  'enumerate(',
  'for ',
  'if ',
  'def ',
  'import bpy',
  'import math',
  'import mathutils',
  'from mathutils import'
];

// Prompt injection patterns
const INJECTION_PATTERNS = [
  /ignore\s+(previous|above|all)\s+instructions/gi,
  /system\s*:\s*/gi,
  /you\s+are\s+now/gi,
  /forget\s+(everything|all|your)/gi,
  /new\s+instructions/gi,
  /disregard\s+(previous|above)/gi,
  /<\|im_start\|>/gi,
  /<\|im_end\|>/gi,
  /SYSTEM:/gi,
  /ASSISTANT:/gi
];

/**
 * Check if prompt contains injection attempts
 */
function detectPromptInjection(prompt) {
  const lowerPrompt = prompt.toLowerCase();
  
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(prompt)) {
      return {
        safe: false,
        reason: 'Potential prompt injection detected',
        pattern: pattern.source
      };
    }
  }
  
  return { safe: true };
}

/**
 * Validate generated Python code for safety
 */
function validateGeneratedCode(code) {
  const issues = [];
  
  // Check for dangerous patterns
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      issues.push({
        severity: 'critical',
        message: `Dangerous operation detected: ${pattern.source}`,
        pattern: pattern.source
      });
    }
  }
  
  // Check if code uses only allowed operations
  const lines = code.split('\n');
  const codeLines = lines.filter(line => {
    const trimmed = line.trim();
    return trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('"""');
  });
  
  for (const line of codeLines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('import ') || trimmed.startsWith('from ')) {
      // Validate imports
      if (!trimmed.match(/^(import|from)\s+(bpy|math|mathutils)/)) {
        issues.push({
          severity: 'warning',
          message: `Suspicious import: ${trimmed}`,
          line: trimmed
        });
      }
    }
  }
  
  // Check for balanced brackets
  const openBrackets = (code.match(/\(/g) || []).length;
  const closeBrackets = (code.match(/\)/g) || []).length;
  
  if (openBrackets !== closeBrackets) {
    issues.push({
      severity: 'error',
      message: 'Unbalanced parentheses in generated code'
    });
  }
  
  return {
    safe: issues.filter(i => i.severity === 'critical').length === 0,
    issues,
    warningCount: issues.filter(i => i.severity === 'warning').length,
    errorCount: issues.filter(i => i.severity === 'error').length,
    criticalCount: issues.filter(i => i.severity === 'critical').length
  };
}

/**
 * Sanitize and preprocess user prompt
 */
function preprocessPrompt(prompt) {
  // Remove excessive whitespace
  let cleaned = prompt.trim().replace(/\s+/g, ' ');
  
  // Remove potential injection markers
  cleaned = cleaned.replace(/<\|.*?\|>/g, '');
  
  // Limit length
  if (cleaned.length > 500) {
    cleaned = cleaned.substring(0, 500);
  }
  
  return cleaned;
}

/**
 * Expand domain vocabulary for better AI understanding
 */
function expandDomainVocabulary(prompt) {
  const expansions = {
    'sphere': 'UV sphere mesh object',
    'cube': 'mesh cube primitive',
    'cylinder': 'mesh cylinder primitive',
    'torus': 'mesh torus primitive',
    'monkey': 'mesh Suzanne monkey head',
    'light': 'point light source',
    'camera': 'perspective camera',
    'red': 'red color (1, 0, 0)',
    'blue': 'blue color (0, 0, 1)',
    'green': 'green color (0, 1, 0)',
    'yellow': 'yellow color (1, 1, 0)',
    'rotate': 'rotation_euler transformation',
    'move': 'location transformation',
    'scale': 'scale transformation',
    'material': 'Principled BSDF material with shader nodes',
    'texture': 'image texture with UV mapping',
    'smooth': 'smooth shading with auto smooth',
    'glass': 'Principled BSDF with transmission = 1.0',
    'metal': 'Principled BSDF with metallic = 1.0'
  };
  
  // Context keywords that indicate working with existing objects
  const contextKeywords = {
    'keep': 'preserve existing without creating new',
    'preserve': 'maintain existing without creating new',
    'maintain': 'keep existing without creating new',
    'the object': 'the currently active/selected object',
    'active object': 'bpy.context.active_object',
    'selected': 'currently selected objects in scene',
    'current': 'the existing active object'
  };
  
  let expanded = prompt;
  
  // First check for context keywords
  for (const [term, hint] of Object.entries(contextKeywords)) {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    if (regex.test(expanded)) {
      expanded = `[Context: ${hint}] ${expanded}`;
      break; // Only add context hint once
    }
  }
  
  // Then expand domain vocabulary
  for (const [term, expansion] of Object.entries(expansions)) {
    const regex = new RegExp(`\\b${term}\\b`, 'gi');
    if (regex.test(expanded) && !expanded.includes(expansion)) {
      // Add hint without replacing original term
      expanded = expanded.replace(regex, `${term} (${expansion})`);
    }
  }
  
  return expanded;
}

/**
 * Build enhanced system prompt with safety constraints
 */
function buildEnhancedSystemPrompt() {
  return `You are a Blender Python code generator specialized in 3D modeling operations.

CRITICAL SAFETY RULES:
1. NEVER use: os, sys, subprocess, eval, exec, open, file operations
2. NEVER quit Blender or save files
3. ONLY use bpy (Blender Python API), math, and mathutils modules
4. NEVER access filesystem or network
5. Output ONLY executable Python code with NO explanations

CONTEXT AWARENESS:
- If user says "keep", "preserve", "maintain" - DO NOT create new objects
- If user says "the object", "active object", "selected" - work with existing selection
- If user says "add", "create", "make", "new" - create new objects
- Check if objects exist before creating: if not obj or obj.type != 'MESH'
- Use bpy.context.active_object for the currently selected object

REQUIRED CODE STRUCTURE:
- Always start with: import bpy
- Use try-except blocks for error handling
- Add print() statements to confirm actions
- Use proper indentation (4 spaces)
- Comment complex operations

MATERIAL CREATION (MANDATORY):
- ALWAYS use shader nodes: mat.use_nodes = True
- ALWAYS use Principled BSDF for materials
- NEVER use deprecated diffuse_color alone
- Set Base Color via: bsdf.inputs['Base Color'].default_value = (R, G, B, A)
- Color values are 0.0 to 1.0 (not 0-255)

COMMON OPERATIONS:

Working with Existing Objects:
- Get active: obj = bpy.context.active_object
- Get all selected: objs = bpy.context.selected_objects
- Check if mesh: if obj and obj.type == 'MESH'
- Modify existing: obj.location += Vector((1, 0, 0))

Creating Objects:
- Cube: bpy.ops.mesh.primitive_cube_add(location=(x, y, z))
- Sphere: bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0, location=(x, y, z))
- Cylinder: bpy.ops.mesh.primitive_cylinder_add(radius=1.0, depth=2.0, location=(x, y, z))
- Light: bpy.ops.object.light_add(type='POINT', location=(x, y, z))

Transformations:
- Move: obj.location = (x, y, z)
- Rotate: obj.rotation_euler = (rx, ry, rz)  # radians
- Scale: obj.scale = (sx, sy, sz)

Materials Example:
import bpy

# Get existing object or create new
obj = bpy.context.active_object
if not obj or obj.type != 'MESH':
    bpy.ops.mesh.primitive_cube_add()
    obj = bpy.context.active_object

# Create material with shader nodes
mat = bpy.data.materials.new(name="MyMaterial")
mat.use_nodes = True
nodes = mat.node_tree.nodes
links = mat.node_tree.links

# Get Principled BSDF
bsdf = nodes.get('Principled BSDF')
if bsdf:
    bsdf.inputs['Base Color'].default_value = (1.0, 0.0, 0.0, 1.0)  # Red
    bsdf.inputs['Metallic'].default_value = 0.0
    bsdf.inputs['Roughness'].default_value = 0.4

# Assign material
if len(obj.data.materials):
    obj.data.materials[0] = mat
else:
    obj.data.materials.append(mat)

print(f"Applied material to {obj.name}")

FORBIDDEN OPERATIONS:
❌ os.system(), subprocess.call()
❌ eval(), exec()
❌ bpy.ops.wm.quit(), bpy.ops.wm.save_mainfile()
❌ File I/O: open(), write()
❌ Network operations
❌ Destructive operations without confirmation

OUTPUT FORMAT:
- Pure Python code only
- No markdown formatting
- No explanations before/after code
- No ... or placeholders
- Complete, executable code`;
}

/**
 * Comprehensive prompt validation and preprocessing
 */
function processPrompt(userPrompt) {
  // Step 1: Detect injection
  const injectionCheck = detectPromptInjection(userPrompt);
  if (!injectionCheck.safe) {
    return {
      valid: false,
      error: injectionCheck.reason,
      stage: 'injection_detection'
    };
  }
  
  // Step 2: Preprocess and sanitize
  const cleaned = preprocessPrompt(userPrompt);
  
  // Step 3: Expand domain vocabulary
  const expanded = expandDomainVocabulary(cleaned);
  
  // Step 4: Build system prompt
  const systemPrompt = buildEnhancedSystemPrompt();
  
  return {
    valid: true,
    originalPrompt: userPrompt,
    cleanedPrompt: cleaned,
    expandedPrompt: expanded,
    systemPrompt: systemPrompt
  };
}

module.exports = {
  detectPromptInjection,
  validateGeneratedCode,
  preprocessPrompt,
  expandDomainVocabulary,
  buildEnhancedSystemPrompt,
  processPrompt,
  ALLOWED_OPERATIONS,
  DANGEROUS_PATTERNS
};
