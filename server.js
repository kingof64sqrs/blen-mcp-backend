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
        
        print(f"SVG imported successfully: {final_obj.name}")
        print(f"Vertices: {len(final_obj.data.vertices)}")
        print(f"Faces: {len(final_obj.data.polygons)}")
else:
    print("No objects imported from SVG - check if the SVG file contains valid curves")
`;

    const result = await mcpClient.executeBlenderCode(importCode);
    
    res.json({
      success: true,
      message: 'SVG imported into Blender successfully',
      file: {
        name: req.file.originalname,
        path: svgPath,
        size: req.file.size
      },
      result: result
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
- Use proper Blender API syntax
- Handle common operations: creating objects, materials, animations, modifiers
- For positions, use location parameter in tuples
- For colors, use RGBA values (0-1 range)
- Add print statements to confirm actions

Examples:
User: "create a red cube"
Code: import bpy
bpy.ops.mesh.primitive_cube_add(location=(0, 0, 0))
obj = bpy.context.active_object
mat = bpy.data.materials.new(name='Red')
mat.diffuse_color = (1, 0, 0, 1)
obj.data.materials.append(mat)
print('Red cube created')

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
    
    res.json({
      success: true,
      prompt: prompt,
      generatedCode: generatedCode,
      result: result
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
