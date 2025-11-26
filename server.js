const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const MCPClient = require('./mcpClient');
const User = require('./models/User');
const OTP = require('./models/OTP');
const Token = require('./models/Token');
const { generateAccessToken, generateRefreshToken } = require('./utils/jwt');
const { initEmailService, sendOTPEmail } = require('./services/emailService');

const app = express();
const PORT = process.env.PORT || 5000;

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Create exports directory if it doesn't exist
const exportsDir = path.join(__dirname, 'exports');
if (!fs.existsSync(exportsDir)) {
  fs.mkdirSync(exportsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/svg+xml' || file.originalname.endsWith('.svg')) {
      cb(null, true);
    } else {
      cb(new Error('Only SVG files are allowed'));
    }
  }
});

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static(uploadsDir)); // Serve uploaded files
app.use('/exports', express.static(exportsDir)); // Serve exported GLB files
app.use('/views', express.static(path.join(__dirname, 'views'))); // Serve HTML views

// Initialize MCP Client
const mcpClient = new MCPClient();
let isInitializing = false;

// Ensure MCP connection before handling requests
async function ensureConnection(req, res, next) {
  if (mcpClient.isConnected) {
    return next();
  }

  if (isInitializing) {
    return res.status(503).json({
      success: false,
      error: 'MCP server is initializing, please try again in a moment'
    });
  }

  try {
    isInitializing = true;
    await mcpClient.connect();
    isInitializing = false;
    next();
  } catch (error) {
    isInitializing = false;
    res.status(503).json({
      success: false,
      error: 'Failed to connect to MCP server: ' + error.message
    });
  }
}

// ============= HEALTH & STATUS ENDPOINTS =============

/**
 * GET /health
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    success: true,
    connected: mcpClient.isConnected,
    timestamp: new Date().toISOString()
  });
});

// ============= AUTH ENDPOINTS =============

/**
 * POST /api/auth/check-user
 * Check if user exists
 * Body: { email: "user@example.com" }
 */
app.post('/api/auth/check-user', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (user) {
      return res.json({ exists: true, user: { email: user.email, firstName: user.firstName } });
    } else {
      return res.json({ exists: false });
    }
  } catch (error) {
    console.error('Check user error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/**
 * POST /api/auth/register
 * Register new user
 * Body: { email, firstName, lastName, companyName?, phoneNumber? }
 */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, firstName, lastName, companyName, phoneNumber } = req.body;

    if (!email || !firstName || !lastName) {
      return res.status(400).json({ success: false, message: 'Email, first name, and last name are required' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'User already exists' });
    }

    const user = new User({
      email: email.toLowerCase(),
      firstName,
      lastName,
      companyName,
      phoneNumber
    });

    await user.save();

    return res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/**
 * POST /api/auth/send-otp
 * Send OTP to user's email
 * Body: { email: "user@example.com" }
 */
app.post('/api/auth/send-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Delete any existing OTPs for this email
    await OTP.deleteMany({ email: email.toLowerCase() });

    // Save new OTP
    const otpDoc = new OTP({
      email: email.toLowerCase(),
      otp
    });
    await otpDoc.save();

    // Send email
    await sendOTPEmail(email, otp, user.firstName);

    return res.json({
      success: true,
      message: 'OTP sent successfully to your email'
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    return res.status(500).json({ success: false, message: 'Failed to send OTP', error: error.message });
  }
});

/**
 * POST /api/auth/verify-otp
 * Verify OTP and login
 * Body: { email: "user@example.com", otp: "123456" }
 */
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'Email and OTP are required' });
    }

    const otpDoc = await OTP.findOne({ email: email.toLowerCase() });

    if (!otpDoc) {
      return res.status(400).json({ success: false, message: 'OTP expired or not found' });
    }

    if (otpDoc.attempts >= 3) {
      await OTP.deleteOne({ _id: otpDoc._id });
      return res.status(400).json({ success: false, message: 'Too many attempts. Please request a new OTP' });
    }

    if (otpDoc.otp !== otp) {
      otpDoc.attempts += 1;
      await otpDoc.save();
      return res.status(400).json({ success: false, message: 'Invalid OTP' });
    }

    // OTP verified, get user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Generate tokens
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Save refresh token
    const tokenDoc = new Token({
      userId: user._id,
      refreshToken
    });
    await tokenDoc.save();

    // Delete used OTP
    await OTP.deleteOne({ _id: otpDoc._id });

    return res.json({
      success: true,
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      }
    });
  } catch (error) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

/**
 * POST /api/auth/logout
 * Logout user
 * Body: { refreshToken: "token" }
 */
app.post('/api/auth/logout', async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await Token.deleteOne({ refreshToken });
    }

    return res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
});

// ============= BLENDER ENDPOINTS (UNCHANGED) =============

/**
 * GET /api/tools
 * List all available MCP tools
 */
app.get('/api/tools', ensureConnection, async (req, res) => {
  try {
    const result = await mcpClient.listTools();
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/status
 * Get integration statuses
 */
app.get('/api/status', ensureConnection, async (req, res) => {
  try {
    const [hunyuan3d, polyhaven, sketchfab] = await Promise.allSettled([
      mcpClient.getHunyuan3DStatus(),
      mcpClient.getPolyhavenStatus(),
      mcpClient.getSketchfabStatus()
    ]);

    res.json({
      success: true,
      data: {
        hunyuan3d: hunyuan3d.status === 'fulfilled' ? hunyuan3d.value : { error: hunyuan3d.reason.message },
        polyhaven: polyhaven.status === 'fulfilled' ? polyhaven.value : { error: polyhaven.reason.message },
        sketchfab: sketchfab.status === 'fulfilled' ? sketchfab.value : { error: sketchfab.reason.message }
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============= BLENDER CONTROL ENDPOINTS =============

/**
 * POST /api/blender/execute
 * Execute Python code in Blender
 * Body: { code: "import bpy\nbpy.ops.mesh.primitive_cube_add()" }
 */
app.post('/api/blender/execute', ensureConnection, async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Code is required'
      });
    }

    const result = await mcpClient.executeBlenderCode(code);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/blender/screenshot
 * Get viewport screenshot
 * Query: ?maxSize=800
 */
app.get('/api/blender/screenshot', ensureConnection, async (req, res) => {
  try {
    const maxSize = parseInt(req.query.maxSize) || 800;
    const result = await mcpClient.getViewportScreenshot(maxSize);
    
    // Extract screenshot from MCP response
    let screenshotData = null;
    
    if (result && result.content && Array.isArray(result.content)) {
      // MCP returns content as array with type and data
      const imageContent = result.content.find(item => item.type === 'image');
      if (imageContent && imageContent.data) {
        screenshotData = imageContent.data;
      }
    }
    
    res.json({
      success: true,
      screenshot: screenshotData,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/blender/export-glb
 * Export current Blender scene as GLB file
 * Returns URL to download the exported GLB
 */
app.post('/api/blender/export-glb', ensureConnection, async (req, res) => {
  try {
    const timestamp = Date.now();
    const filename = `model-${timestamp}.glb`;
    const exportPath = path.join(exportsDir, filename).replace(/\\/g, '/');
    
    // Python code to export scene as GLB
    const exportCode = `
import bpy
import os

# Enable GLTF exporter addon if not already enabled
if 'io_scene_gltf2' not in bpy.context.preferences.addons:
    try:
        bpy.ops.preferences.addon_enable(module='io_scene_gltf2')
        print("GLTF exporter addon enabled")
    except Exception as e:
        print(f"Warning: Could not enable GLTF exporter: {str(e)}")

export_path = r"${exportPath}"
print(f"Exporting to: {export_path}")

# Make sure export directory exists
os.makedirs(os.path.dirname(export_path), exist_ok=True)

# Convert all materials to use shader nodes for proper export
for mat in bpy.data.materials:
    if mat and not mat.use_nodes:
        print(f"Converting material '{mat.name}' to use nodes")
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        bsdf = nodes.get('Principled BSDF')
        if bsdf:
            # Copy viewport color to shader node
            bsdf.inputs['Base Color'].default_value = mat.diffuse_color
            print(f"Set Base Color to {mat.diffuse_color[:]}")

# Select all mesh objects
bpy.ops.object.select_all(action='DESELECT')
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        obj.select_set(True)

if not bpy.context.selected_objects:
    print("Warning: No mesh objects to export")
else:
    # Export selected objects as GLB
    bpy.ops.export_scene.gltf(
        filepath=export_path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_materials='EXPORT'
    )
    print(f"Successfully exported {len(bpy.context.selected_objects)} objects to GLB")
`;

    await mcpClient.executeBlenderCode(exportCode);
    
    // Return URL to access the exported file
    const fileUrl = `http://localhost:${PORT}/exports/${filename}`;
    
    res.json({
      success: true,
      message: 'Scene exported successfully',
      filename: filename,
      url: fileUrl,
      path: exportPath
    });
  } catch (error) {
    console.error('GLB export error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/blender/scene
 * Get current scene information
 */
app.get('/api/blender/scene', ensureConnection, async (req, res) => {
  try {
    const result = await mcpClient.getSceneInfo();
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/blender/test-export
 * Test export functionality with a simple cube
 */
app.post('/api/blender/test-export', ensureConnection, async (req, res) => {
  try {
    // Create a simple cube and export it
    const timestamp = Date.now();
    const filename = `test-cube-${timestamp}.glb`;
    const exportPath = path.join(exportsDir, filename).replace(/\\/g, '/');
    
    const testCode = `
import bpy

# Clear scene
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# Create a cube
bpy.ops.mesh.primitive_cube_add(location=(0, 0, 0))
cube = bpy.context.active_object
cube.name = "TestCube"

print(f"Created cube: {cube.name}")

# Export
export_path = r"${exportPath}"
import os
os.makedirs(os.path.dirname(export_path), exist_ok=True)

bpy.ops.object.select_all(action='DESELECT')
cube.select_set(True)

try:
    bpy.ops.export_scene.gltf(
        filepath=export_path,
        export_format='GLB',
        use_selection=True
    )
    if os.path.exists(export_path):
        print(f"SUCCESS: Test export created at {export_path}")
    else:
        print(f"ERROR: File not created")
except Exception as e:
    print(f"ERROR: {str(e)}")
`;

    await mcpClient.executeBlenderCode(testCode);
    
    const fileExists = fs.existsSync(exportPath);
    const fileUrl = `http://localhost:${PORT}/exports/${filename}`;
    
    res.json({
      success: true,
      message: 'Test export completed',
      export: {
        filename,
        url: fileUrl,
        exists: fileExists,
        path: exportPath
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/blender/import-svg
 * Upload and import SVG file into Blender
 * Multipart form data with 'file' field
 */
app.post('/api/blender/import-svg', upload.single('file'), ensureConnection, async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const svgPath = req.file.path.replace(/\\/g, '/'); // Normalize path for Blender
    
    // Python code to import SVG in Blender
    const importCode = `
import bpy
import os

# Enable SVG import addon if not already enabled
if 'io_curve_svg' not in bpy.context.preferences.addons:
    try:
        bpy.ops.preferences.addon_enable(module='io_curve_svg')
        print("SVG import addon enabled")
    except Exception as e:
        print(f"Warning: Could not enable SVG import addon: {str(e)}")

# Enable GLTF exporter addon if not already enabled
if 'io_scene_gltf2' not in bpy.context.preferences.addons:
    try:
        bpy.ops.preferences.addon_enable(module='io_scene_gltf2')
        print("GLTF exporter addon enabled")
    except Exception as e:
        print(f"Warning: Could not enable GLTF exporter: {str(e)}")

# Clear the entire scene first
print("Clearing scene...")
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
print("Scene cleared")

# Clear existing selection
bpy.ops.object.select_all(action='DESELECT')

# Import SVG
svg_path = "${svgPath}"
print(f"Attempting to import SVG from: {svg_path}")

try:
    # Store objects before import
    objects_before = set(bpy.data.objects)
    
    bpy.ops.import_curve.svg(filepath=svg_path)
    print(f"SVG import operation completed")
    
    # Find newly created objects
    objects_after = set(bpy.data.objects)
    imported_objects = list(objects_after - objects_before)
    
    # Also check selected objects as fallback
    if not imported_objects:
        imported_objects = list(bpy.context.selected_objects)
    
    print(f"Found {len(imported_objects)} imported objects")
    
except Exception as e:
    print(f"Error importing SVG: {str(e)}")
    raise

if imported_objects:
    # Store original colors from curve materials before conversion
    curve_colors = {}
    for obj in imported_objects:
        if obj.type == 'CURVE' and obj.data.materials:
            for mat in obj.data.materials:
                if mat:
                    # Store the material color (RGBA)
                    curve_colors[obj.name] = mat.diffuse_color[:]
                    print(f"Found color in {obj.name}: {mat.diffuse_color[:]}")
                    break
    
    # Convert curves to mesh
    for obj in imported_objects:
        print(f"Processing object: {obj.name}, type: {obj.type}")
        if obj.type == 'CURVE':
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            # Add extrusion depth
            obj.data.extrude = 0.1
            obj.data.bevel_depth = 0.01
            # Convert to mesh
            bpy.ops.object.convert(target='MESH')
    
    # Join all imported objects
    if len(imported_objects) > 1:
        bpy.ops.object.select_all(action='DESELECT')
        for obj in imported_objects:
            obj.select_set(True)
        bpy.context.view_layer.objects.active = imported_objects[0]
        bpy.ops.object.join()
    
    # Get the final object
    final_obj = bpy.context.active_object
    if final_obj:
        final_obj.name = "ImportedSVG"
        # Center to world origin
        bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
        final_obj.location = (0, 0, 0)
        
        # Apply the original SVG color to the mesh
        if curve_colors:
            # Use the first color found
            svg_color = list(curve_colors.values())[0]
            print(f"Applying SVG color: {svg_color}")
            
            # Create or update material with proper shader nodes
            mat_name = "SVG_Material"
            if mat_name in bpy.data.materials:
                mat = bpy.data.materials[mat_name]
            else:
                mat = bpy.data.materials.new(name=mat_name)
            
            # Enable nodes
            mat.use_nodes = True
            nodes = mat.node_tree.nodes
            nodes.clear()
            
            # Create Principled BSDF
            bsdf = nodes.new(type='ShaderNodeBsdfPrincipled')
            bsdf.location = (0, 0)
            bsdf.inputs['Base Color'].default_value = svg_color
            bsdf.inputs['Roughness'].default_value = 0.4
            bsdf.inputs['Metallic'].default_value = 0.3
            
            # Create Material Output
            output = nodes.new(type='ShaderNodeOutputMaterial')
            output.location = (300, 0)
            
            # Link nodes
            links = mat.node_tree.links
            links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])
            
            # Apply material to object
            if final_obj.data.materials:
                final_obj.data.materials[0] = mat
            else:
                final_obj.data.materials.append(mat)
            
            print(f"Material '{mat_name}' created and applied with color {svg_color}")
        else:
            print("Warning: No color information found in SVG, using default material")
        
        print(f"SVG imported successfully: {final_obj.name}")
        print(f"Vertices: {len(final_obj.data.vertices)}")
        print(f"Faces: {len(final_obj.data.polygons)}")
else:
    print("No objects imported from SVG - check if the SVG file contains valid curves")
`;

    const result = await mcpClient.executeBlenderCode(importCode);
    
    // Auto-export as GLB with better error handling
    const timestamp = Date.now();
    const filename = `svg-import-${timestamp}.glb`;
    const exportPath = path.join(exportsDir, filename).replace(/\\/g, '/');
    
    const exportCode = `
import bpy
import os

export_path = r"${exportPath}"
print(f"Export path: {export_path}")

# Ensure directory exists
export_dir = os.path.dirname(export_path)
os.makedirs(export_dir, exist_ok=True)
print(f"Export directory: {export_dir}")

# Convert all materials to use shader nodes for proper export
for mat in bpy.data.materials:
    if mat and not mat.use_nodes:
        print(f"Converting material '{mat.name}' to use nodes")
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        bsdf = nodes.get('Principled BSDF')
        if bsdf:
            # Copy viewport color to shader node
            bsdf.inputs['Base Color'].default_value = mat.diffuse_color
            print(f"Set Base Color to {mat.diffuse_color[:]}")

# Select all mesh objects
bpy.ops.object.select_all(action='DESELECT')
mesh_count = 0
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        obj.select_set(True)
        mesh_count += 1
        print(f"Selected mesh: {obj.name}")

print(f"Total meshes selected: {mesh_count}")

if mesh_count == 0:
    print("ERROR: No mesh objects found to export!")
else:
    try:
        # Export as GLB
        bpy.ops.export_scene.gltf(
            filepath=export_path,
            export_format='GLB',
            use_selection=True,
            export_apply=True,
            export_materials='EXPORT'
        )
        
        # Verify file was created
        if os.path.exists(export_path):
            file_size = os.path.getsize(export_path)
            print(f"SUCCESS: Exported {mesh_count} objects to {export_path} (size: {file_size} bytes)")
        else:
            print(f"ERROR: Export completed but file not found at {export_path}")
    except Exception as e:
        print(f"ERROR during export: {str(e)}")
        import traceback
        traceback.print_exc()
`;

    const exportResult = await mcpClient.executeBlenderCode(exportCode);
    console.log('Export result:', exportResult);
    
    // Check if file actually exists
    const fileExists = fs.existsSync(exportPath);
    console.log('File exists:', fileExists, 'at', exportPath);
    
    const fileUrl = `http://localhost:${PORT}/exports/${filename}`;
    
    res.json({
      success: true,
      message: 'SVG imported into Blender successfully',
      file: {
        name: req.file.originalname,
        path: svgPath,
        size: req.file.size
      },
      result: result,
      export: {
        filename: filename,
        url: fileUrl,
        exists: fileExists,
        path: exportPath
      },
      exportResult: exportResult
    });
  } catch (error) {
    console.error('SVG import error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/blender/texture
 * Apply texture to object
 * Body: { objectName: "Cube", textureId: "texture_id" }
 */
app.post('/api/blender/texture', ensureConnection, async (req, res) => {
  try {
    const { objectName, textureId } = req.body;
    
    if (!objectName || !textureId) {
      return res.status(400).json({
        success: false,
        error: 'objectName and textureId are required'
      });
    }

    const result = await mcpClient.setTexture(objectName, textureId);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============= SKETCHFAB ENDPOINTS =============

/**
 * GET /api/sketchfab/search
 * Search Sketchfab models
 * Query: ?query=car&count=20&categories=vehicles&downloadable=true
 */
app.get('/api/sketchfab/search', ensureConnection, async (req, res) => {
  try {
    const { query, count, categories, downloadable } = req.query;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    const result = await mcpClient.searchSketchfab(query, {
      count: count ? parseInt(count) : undefined,
      categories,
      downloadable: downloadable !== 'false'
    });

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/sketchfab/download
 * Download Sketchfab model
 * Body: { uid: "model-uid-here" }
 */
app.post('/api/sketchfab/download', ensureConnection, async (req, res) => {
  try {
    const { uid } = req.body;
    
    if (!uid) {
      return res.status(400).json({
        success: false,
        error: 'Model UID is required'
      });
    }

    const result = await mcpClient.downloadSketchfabModel(uid);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============= PROMPT ENDPOINT =============

/**
 * POST /api/prompt
 * Execute natural language prompt in Blender
 * Body: { prompt: "create a red cube at position 0,0,0" }
 */
app.post('/api/prompt', ensureConnection, async (req, res) => {
  try {
    const { prompt } = req.body;
    
    if (!prompt) {
      return res.status(400).json({
        success: false,
        error: 'Prompt is required'
      });
    }

    // Use Azure OpenAI to convert prompt to Blender Python code
    const systemPrompt = `You are a Blender Python code generator. Convert user prompts into executable Blender Python code.
Rules:
- Only output Python code, no explanations
- Always import bpy at the start
- Use proper Blender API syntax with shader nodes for materials
- Handle common operations: creating objects, materials, animations, modifiers
- For positions, use location parameter in tuples
- For colors, ALWAYS use shader nodes (Principled BSDF) with RGBA values (0-1 range)
- NEVER use diffuse_color alone - always set up proper shader nodes
- Add print statements to confirm actions

Examples:
User: "create a red cube"
Code: import bpy
bpy.ops.mesh.primitive_cube_add(location=(0, 0, 0))
obj = bpy.context.active_object
mat = bpy.data.materials.new(name='Red')
mat.use_nodes = True
nodes = mat.node_tree.nodes
bsdf = nodes.get('Principled BSDF')
if bsdf:
    bsdf.inputs['Base Color'].default_value = (1, 0, 0, 1)
obj.data.materials.append(mat)
print('Red cube created')

User: "change color to blue"
Code: import bpy
obj = bpy.context.active_object
if obj and obj.type == 'MESH':
    if not obj.data.materials:
        mat = bpy.data.materials.new(name='Blue')
        mat.use_nodes = True
        obj.data.materials.append(mat)
    else:
        mat = obj.data.materials[0]
        mat.use_nodes = True
    nodes = mat.node_tree.nodes
    bsdf = nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (0, 0, 1, 1)
    print('Changed color to blue')

User: "add a light above"
Code: import bpy
bpy.ops.object.light_add(type='POINT', location=(0, 0, 5))
print('Light added')`;

    const response = await axios.post(
      `${process.env.AZURE_OPENAI_ENDPOINT}/openai/deployments/${process.env.AZURE_OPENAI_MODEL}/chat/completions?api-version=${process.env.AZURE_OPENAI_API_VERSION}`,
      {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 500
      },
      {
        headers: {
          'api-key': process.env.AZURE_OPENAI_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    const generatedCode = response.data.choices[0].message.content.trim();
    
    // Execute the generated code in Blender
    const result = await mcpClient.executeBlenderCode(generatedCode);
    
    // Auto-export as GLB with better error handling
    const timestamp = Date.now();
    const filename = `model-${timestamp}.glb`;
    const exportPath = path.join(exportsDir, filename).replace(/\\/g, '/');
    
    const exportCode = `
import bpy
import os

# Enable GLTF exporter addon if not already enabled
if 'io_scene_gltf2' not in bpy.context.preferences.addons:
    try:
        bpy.ops.preferences.addon_enable(module='io_scene_gltf2')
        print("GLTF exporter addon enabled")
    except Exception as e:
        print(f"Warning: Could not enable GLTF exporter: {str(e)}")

export_path = r"${exportPath}"
print(f"Export path: {export_path}")

# Ensure directory exists
export_dir = os.path.dirname(export_path)
os.makedirs(export_dir, exist_ok=True)

# Convert all materials to use shader nodes for proper export
for mat in bpy.data.materials:
    if mat and not mat.use_nodes:
        print(f"Converting material '{mat.name}' to use nodes")
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        bsdf = nodes.get('Principled BSDF')
        if bsdf:
            # Copy viewport color to shader node
            bsdf.inputs['Base Color'].default_value = mat.diffuse_color
            print(f"Set Base Color to {mat.diffuse_color[:]}")

# Select all mesh objects
bpy.ops.object.select_all(action='DESELECT')
mesh_count = 0
for obj in bpy.data.objects:
    if obj.type == 'MESH':
        obj.select_set(True)
        mesh_count += 1

print(f"Total meshes selected: {mesh_count}")

if mesh_count > 0:
    try:
        bpy.ops.export_scene.gltf(
            filepath=export_path,
            export_format='GLB',
            use_selection=True,
            export_apply=True,
            export_materials='EXPORT'
        )
        if os.path.exists(export_path):
            print(f"SUCCESS: Exported {mesh_count} objects ({os.path.getsize(export_path)} bytes)")
        else:
            print(f"ERROR: Export completed but file not found")
    except Exception as e:
        print(f"ERROR during export: {str(e)}")
`;

    const exportResult = await mcpClient.executeBlenderCode(exportCode);
    const fileExists = fs.existsSync(exportPath);
    const fileUrl = `http://localhost:${PORT}/exports/${filename}`;
    
    res.json({
      success: true,
      prompt: prompt,
      generatedCode: generatedCode,
      result: result,
      export: {
        filename: filename,
        url: fileUrl,
        exists: fileExists
      }
    });
  } catch (error) {
    console.error('Prompt execution error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============= 3D GENERATION ENDPOINTS =============

/**
 * POST /api/generate/hyper3d
 * Generate 3D model using Hyper3D
 * Body: { textPrompt: "a red sports car", bboxCondition: [2, 1, 1] }
 */
app.post('/api/generate/hyper3d', ensureConnection, async (req, res) => {
  try {
    const { textPrompt, bboxCondition } = req.body;
    
    if (!textPrompt) {
      return res.status(400).json({
        success: false,
        error: 'textPrompt is required'
      });
    }

    const result = await mcpClient.generateHyper3DModel(textPrompt, bboxCondition);
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============= GENERIC TOOL ENDPOINT =============

/**
 * POST /api/tool/call
 * Call any MCP tool by name
 * Body: { toolName: "mcp_blender-mcp_execute_blender_code", args: { code: "..." } }
 */
app.post('/api/tool/call', ensureConnection, async (req, res) => {
  try {
    const { toolName, args } = req.body;
    
    if (!toolName) {
      return res.status(400).json({
        success: false,
        error: 'toolName is required'
      });
    }

    const result = await mcpClient.callTool(toolName, args || {});
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============= EMBED ENDPOINTS =============

/**
 * GET /embed/viewer
 * Standalone embeddable viewer page
 * Query params: url (model URL) or modelId (model filename)
 * Optional: bg (background color), autoRotate (true/false), controls (true/false)
 */
app.get('/embed/viewer', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'embed.html'));
});

/**
 * GET /api/embed/code/:modelId
 * Generate embed code for a model
 */
app.get('/api/embed/code/:modelId', (req, res) => {
  try {
    const { modelId } = req.params;
    const { width = '800', height = '600', autoRotate = 'false', controls = 'true', bg = '#1a1a1a' } = req.query;
    
    const baseUrl = `http://localhost:${PORT}`;
    const embedUrl = `${baseUrl}/embed/viewer?modelId=${modelId}&autoRotate=${autoRotate}&controls=${controls}&bg=${encodeURIComponent(bg)}`;
    
    const iframeCode = `<iframe 
  src="${embedUrl}" 
  width="${width}" 
  height="${height}" 
  frameborder="0" 
  allowfullscreen
></iframe>`;

    const htmlCode = `<!DOCTYPE html>
<html>
<head>
    <title>3D Model Viewer</title>
</head>
<body>
    ${iframeCode}
</body>
</html>`;

    const directLinkCode = `<a href="${embedUrl}" target="_blank">View 3D Model</a>`;

    res.json({
      success: true,
      modelId,
      embedUrl,
      codes: {
        iframe: iframeCode,
        html: htmlCode,
        directLink: directLinkCode,
        markdown: `[View 3D Model](${embedUrl})`
      },
      customization: {
        width: 'Iframe width (default: 800px)',
        height: 'Iframe height (default: 600px)',
        autoRotate: 'Auto-rotate model (true/false, default: false)',
        controls: 'Show controls help (true/false, default: true)',
        bg: 'Background color (hex, default: #1a1a1a)'
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============= ERROR HANDLING =============

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: err.message
  });
});

// ============= SERVER STARTUP =============

async function startServer() {
  try {
    // Connect to MongoDB
    if (process.env.MONGODB_URI) {
      try {
        await mongoose.connect(process.env.MONGODB_URI, {
          useNewUrlParser: true,
          useUnifiedTopology: true
        });
        console.log('✅ MongoDB connected');
      } catch (error) {
        console.log('⚠️  MongoDB not connected:', error.message);
      }
    }

    // Initialize email service
    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      initEmailService();
    }

    // Start HTTP server first
    app.listen(PORT, () => {
      console.log('\n╔═══════════════════════════════════════════╗');
      console.log('║     Blender MCP HTTP API Server          ║');
      console.log('║                                           ║');
      console.log(`║   Server: http://localhost:${PORT}            ║`);
      console.log('║   Status: RUNNING                         ║');
      console.log('║                                           ║');
      console.log(`║   Health: http://localhost:${PORT}/health     ║`);
      console.log(`║   Auth:   http://localhost:${PORT}/api/auth   ║`);
      console.log(`║   Tools:  http://localhost:${PORT}/api/tools  ║`);
      console.log(`║   Prompt: http://localhost:${PORT}/api/prompt ║`);
      console.log('║                                           ║');
      console.log(`║   Blender: ${process.env.BLENDER_HOST}:${process.env.BLENDER_PORT}      ║`);
      console.log('╚═══════════════════════════════════════════╝\n');
      console.log('⚠️  MCP will connect when first request is made');
      console.log('💡 Make sure Blender is running with MCP enabled\n');
    });

    // Try to connect to MCP server in background
    setTimeout(async () => {
      try {
        console.log('Attempting to connect to Blender MCP...');
        await mcpClient.connect();
        console.log('✅ MCP connected successfully!\n');
      } catch (error) {
        console.log('⚠️  MCP not connected yet. Will retry on first request.');
        console.log(`   Error: ${error.message}\n`);
      }
    }, 1000);

  } catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  mcpClient.disconnect();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down...');
  mcpClient.disconnect();
  process.exit(0);
});

// Start the server
startServer();
