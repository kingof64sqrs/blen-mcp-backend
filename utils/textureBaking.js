/**
 * Texture Baking Utility
 * Bakes procedural materials to image textures for GLB export
 */

/**
 * Generate Python code to bake procedural textures to images
 * This ensures procedural materials (gradients, noise, etc.) export correctly to GLB
 */
function generateTextureBaking() {
  return `
import bpy

print("\\n" + "=" * 60)
print("BAKING PROCEDURAL MATERIALS")
print("=" * 60)

baked_count = 0
skipped_count = 0

for obj in bpy.data.objects:
    if obj.type != 'MESH':
        continue
    
    for mat_slot in obj.material_slots:
        mat = mat_slot.material
        if not mat or not mat.use_nodes:
            continue
        
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        
        # Check if material has procedural texture nodes
        procedural_types = ['TEX_GRADIENT', 'TEX_NOISE', 'TEX_VORONOI', 'TEX_MUSGRAVE', 
                           'TEX_WAVE', 'TEX_MAGIC', 'TEX_CHECKER']
        has_procedural = any(node.type in procedural_types for node in nodes)
        
        if not has_procedural:
            skipped_count += 1
            continue
        
        try:
            print(f"\\nBaking material: {mat.name} on {obj.name}")
            
            # Ensure object has UV map
            if not obj.data.uv_layers:
                bpy.context.view_layer.objects.active = obj
                obj.select_set(True)
                bpy.ops.uv.smart_project(angle_limit=66, island_margin=0.02, scale_to_bounds=True)
                obj.select_set(False)
                print(f"  ✓ Created UV map")
            
            # Create image for baking (1024x1024 with alpha)
            img_name = f"{mat.name}_baked"
            if img_name in bpy.data.images:
                bpy.data.images.remove(bpy.data.images[img_name])
            
            img = bpy.data.images.new(img_name, width=1024, height=1024, alpha=True)
            img.colorspace_settings.name = 'sRGB'
            print(f"  ✓ Created 1024x1024 bake texture")
            
            # Create image texture node as bake target
            img_node = nodes.new('ShaderNodeTexImage')
            img_node.image = img
            img_node.name = 'BakeTarget'
            img_node.location = (0, 0)
            
            # Select the image node (required for baking)
            for node in nodes:
                node.select = False
            img_node.select = True
            nodes.active = img_node
            
            # Set object as active and select it
            bpy.ops.object.select_all(action='DESELECT')
            bpy.context.view_layer.objects.active = obj
            obj.select_set(True)
            
            # Configure render settings for baking
            original_engine = bpy.context.scene.render.engine
            bpy.context.scene.render.engine = 'CYCLES'
            bpy.context.scene.cycles.samples = 32  # Low samples for speed
            bpy.context.scene.cycles.bake_type = 'DIFFUSE'
            bpy.context.scene.render.bake.use_pass_direct = False
            bpy.context.scene.render.bake.use_pass_indirect = False
            
            print(f"  Baking diffuse pass...")
            
            # Perform the bake
            bpy.ops.object.bake(type='DIFFUSE')
            
            print(f"  ✓ Bake complete")
            
            # Reconnect material to use baked texture
            bsdf = nodes.get('Principled BSDF')
            if bsdf:
                # Store any existing color connections
                base_color_input = bsdf.inputs['Base Color']
                
                # Remove old connections to Base Color
                for link in list(base_color_input.links):
                    links.remove(link)
                
                # Connect baked image to Base Color
                links.new(img_node.outputs['Color'], base_color_input)
                print(f"  ✓ Connected baked texture to material")
                
                # Clean up procedural nodes (but keep baked image)
                nodes_to_remove = []
                for node in nodes:
                    if node.type in procedural_types + ['VALTORGB', 'MIX_RGB', 'MIX', 'TEX_COORD', 'MAPPING']:
                        if node != img_node and node != bsdf:
                            nodes_to_remove.append(node)
                
                for node in nodes_to_remove:
                    nodes.remove(node)
                
                if nodes_to_remove:
                    print(f"  ✓ Removed {len(nodes_to_remove)} procedural node(s)")
            
            # Restore render engine
            bpy.context.scene.render.engine = original_engine
            
            obj.select_set(False)
            baked_count += 1
            print(f"  ✓ Material baked successfully")
            
        except Exception as e:
            print(f"  ⚠ Failed to bake {mat.name}: {str(e)}")
            import traceback
            traceback.print_exc()

print(f"\\n{'=' * 60}")
if baked_count > 0:
    print(f"✓ Baked {baked_count} procedural material(s)")
if skipped_count > 0:
    print(f"⊘ Skipped {skipped_count} non-procedural material(s)")
if baked_count == 0 and skipped_count == 0:
    print("⊘ No materials to process")
print(f"{'=' * 60}")
`;
}

module.exports = {
  generateTextureBaking
};
