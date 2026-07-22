from pathlib import Path
import math

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
ASSETS.mkdir(exist_ok=True)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def mat(name, color, roughness=0.35, metallic=0.0, alpha=1.0, emission=None, strength=0.0):
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = color
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
        bsdf.inputs["Alpha"].default_value = alpha
        if emission:
            bsdf.inputs["Emission Color"].default_value = emission
            bsdf.inputs["Emission Strength"].default_value = strength
    material.blend_method = "BLEND" if alpha < 1 else "OPAQUE"
    material.use_screen_refraction = alpha < 1
    material.show_transparent_back = True
    return material


def cube(name, location, scale, material, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        bevel_mod = obj.modifiers.new("soft beveled voxel edges", "BEVEL")
        bevel_mod.width = bevel
        bevel_mod.segments = 2
        bevel_mod.affect = "EDGES"
        obj.modifiers.new("weighted highlights", "WEIGHTED_NORMAL")
    return obj


def add_bar(name, location, scale, material):
    return cube(name, location, scale, material, bevel=0.035)


def create_model():
    clear_scene()

    glass = mat("aqua stained glass", (0.24, 0.95, 0.92, 0.35), roughness=0.08, alpha=0.35)
    glass_edge = mat("mint glass edges", (0.50, 1.0, 0.82, 0.55), roughness=0.12, alpha=0.55)
    core = mat(
        "sparkle core",
        (0.45, 1.0, 1.0, 0.95),
        roughness=0.16,
        emission=(0.25, 0.95, 1.0, 1.0),
        strength=3.5,
    )
    top_glow = mat(
        "top beacon glow",
        (0.67, 1.0, 0.96, 0.9),
        roughness=0.2,
        alpha=0.9,
        emission=(0.32, 1.0, 0.95, 1.0),
        strength=5.5,
    )
    beam_mat = mat(
        "soft vertical light beam",
        (0.25, 1.0, 0.95, 0.18),
        roughness=0.05,
        alpha=0.18,
        emission=(0.18, 0.85, 0.9, 1.0),
        strength=1.6,
    )
    base = mat("obsidian base", (0.015, 0.025, 0.04, 1.0), roughness=0.45, metallic=0.05)
    trim = mat("dark prism trim", (0.035, 0.055, 0.09, 1.0), roughness=0.28, metallic=0.25)

    cube("black obsidian plinth", (0, 0, 0.08), (2.25, 2.25, 0.16), base, bevel=0.025)
    cube("raised dark lower plate", (0, 0, 0.22), (1.95, 1.95, 0.18), trim, bevel=0.025)

    cube("inner glowing cube", (0, 0, 0.92), (1.25, 1.25, 1.25), core, bevel=0.04)
    cube("outer transparent cube", (0, 0, 0.92), (1.55, 1.55, 1.55), glass, bevel=0.03)

    # Minecraft-like frame: four bottom rails, four top rails, and four vertical posts.
    z_bottom = 0.32
    z_top = 1.72
    for z, prefix in [(z_bottom, "bottom"), (z_top, "top")]:
        add_bar(f"{prefix} north rail", (0, -0.86, z), (1.85, 0.11, 0.11), glass_edge)
        add_bar(f"{prefix} south rail", (0, 0.86, z), (1.85, 0.11, 0.11), glass_edge)
        add_bar(f"{prefix} east rail", (0.86, 0, z), (0.11, 1.85, 0.11), glass_edge)
        add_bar(f"{prefix} west rail", (-0.86, 0, z), (0.11, 1.85, 0.11), glass_edge)

    for x in (-0.86, 0.86):
        for y in (-0.86, 0.86):
            add_bar("vertical glass corner", (x, y, 1.02), (0.12, 0.12, 1.46), glass_edge)

    cube("cyan light cap", (0, 0, 1.78), (1.1, 1.1, 0.08), top_glow, bevel=0.06)
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=0.48, depth=5.2, location=(0, 0, 4.35))
    beam = bpy.context.object
    beam.name = "transparent beacon beam"
    beam.data.materials.append(beam_mat)

    # A few tiny glowing facets on top so the model reads as "Sparkle" up close.
    sparkle_mat = mat(
        "white cyan sparkle glints",
        (0.9, 1.0, 1.0, 1),
        emission=(0.8, 1.0, 1.0, 1.0),
        strength=4,
    )
    for i, (x, y, z, s) in enumerate(
        [(-0.38, 0.28, 1.9, 0.08), (0.32, -0.22, 1.94, 0.06), (0.05, 0.45, 1.88, 0.045)]
    ):
        obj = cube(f"sparkle glint {i + 1}", (x, y, z), (s, s, s), sparkle_mat, bevel=0.01)
        obj.rotation_euler = (math.radians(45), math.radians(0), math.radians(45))

    bpy.ops.object.light_add(type="AREA", location=(0, -4, 5))
    light = bpy.context.object
    light.name = "large softbox"
    light.data.energy = 400
    light.data.size = 5

    bpy.ops.object.camera_add(location=(3.3, -4.0, 3.0), rotation=(math.radians(60), 0, math.radians(39)))
    bpy.context.scene.camera = bpy.context.object

    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.color = (0.55, 0.84, 0.28)

    bpy.context.scene.render.engine = "CYCLES"
    bpy.context.scene.cycles.samples = 64
    bpy.context.scene.render.resolution_x = 1280
    bpy.context.scene.render.resolution_y = 900
    bpy.context.scene.view_settings.view_transform = "Filmic"
    bpy.context.scene.view_settings.look = "Medium High Contrast"

    bpy.ops.wm.save_as_mainfile(filepath=str(ASSETS / "sparkle_beacon.blend"))
    bpy.ops.export_scene.gltf(
        filepath=str(ASSETS / "sparkle_beacon.glb"),
        export_format="GLB",
        export_yup=True,
        export_materials="EXPORT",
    )
    bpy.context.scene.render.filepath = str(ASSETS / "sparkle_beacon_preview.png")
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    create_model()
