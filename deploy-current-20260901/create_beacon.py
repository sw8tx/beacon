from pathlib import Path
import math

import bpy


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


def cube(name, location, scale, material, bevel=0.0, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        bevel_mod = obj.modifiers.new("small polished bevels", "BEVEL")
        bevel_mod.width = bevel
        bevel_mod.segments = 2
        bevel_mod.affect = "EDGES"
        obj.modifiers.new("weighted crisp normals", "WEIGHTED_NORMAL")
    return obj


def cylinder(name, location, radius, depth, material, vertices=48, bevel=False):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    if bevel:
        bevel_mod = obj.modifiers.new("rounded rim", "BEVEL")
        bevel_mod.width = 0.025
        bevel_mod.segments = 2
        obj.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return obj


def rail(name, location, scale, material):
    return cube(name, location, scale, material, bevel=0.025)


def add_square_frame(prefix, z, size, thickness, material):
    rail(f"{prefix} north rail", (0, -size / 2, z), (size + thickness, thickness, thickness), material)
    rail(f"{prefix} south rail", (0, size / 2, z), (size + thickness, thickness, thickness), material)
    rail(f"{prefix} east rail", (size / 2, 0, z), (thickness, size + thickness, thickness), material)
    rail(f"{prefix} west rail", (-size / 2, 0, z), (thickness, size + thickness, thickness), material)


def add_voxel_ring(prefix, z, outer, inset, height, material, bevel=0.018):
    cube(f"{prefix} north slab", (0, -outer / 2 + inset / 2, z), (outer, inset, height), material, bevel)
    cube(f"{prefix} south slab", (0, outer / 2 - inset / 2, z), (outer, inset, height), material, bevel)
    cube(f"{prefix} east slab", (outer / 2 - inset / 2, 0, z), (inset, outer, height), material, bevel)
    cube(f"{prefix} west slab", (-outer / 2 + inset / 2, 0, z), (inset, outer, height), material, bevel)


def add_panel_marks(material):
    marks = [
        (-0.61, -0.825, 1.05, 0.22, 0.012, 0.035),
        (-0.18, -0.825, 1.38, 0.32, 0.012, 0.026),
        (0.42, -0.825, 0.74, 0.18, 0.012, 0.03),
        (0.825, -0.34, 1.17, 0.012, 0.22, 0.035),
        (0.825, 0.32, 1.47, 0.012, 0.28, 0.026),
        (-0.825, 0.46, 0.88, 0.012, 0.25, 0.028),
        (0.24, 0.825, 1.18, 0.3, 0.012, 0.03),
        (-0.48, 0.825, 1.5, 0.2, 0.012, 0.026),
    ]
    for i, (x, y, z, sx, sy, sz) in enumerate(marks):
        cube(f"tiny cyan glass etching {i + 1}", (x, y, z), (sx, sy, sz), material, bevel=0.004)


def add_corner_hardware(material):
    for x in (-1.0, 1.0):
        for y in (-1.0, 1.0):
            cube("obsidian corner foot", (x, y, 0.32), (0.28, 0.28, 0.18), material, bevel=0.018)
            cube("obsidian corner cap", (x, y, 1.83), (0.24, 0.24, 0.16), material, bevel=0.018)


def add_sparkle_cross(name, location, size, material):
    x, y, z = location
    cube(f"{name} vertical ray", (x, y, z), (size * 0.16, size * 0.16, size), material, bevel=0.01)
    cube(
        f"{name} horizontal ray",
        (x, y, z),
        (size * 0.16, size, size * 0.16),
        material,
        bevel=0.01,
        rotation=(0, 0, math.radians(45)),
    )
    cube(
        f"{name} diagonal ray",
        (x, y, z),
        (size * 0.12, size * 0.72, size * 0.12),
        material,
        bevel=0.008,
        rotation=(math.radians(35), 0, math.radians(-35)),
    )


def add_base_inlays(etched, metal):
    for side in (-1, 1):
        for offset in (-0.54, 0, 0.54):
            cube("front back cyan rune slot", (offset, side * 1.175, 0.325), (0.22, 0.018, 0.035), etched, bevel=0.004)
            cube("left right cyan rune slot", (side * 1.175, offset, 0.325), (0.018, 0.22, 0.035), etched, bevel=0.004)
        cube("thin front back metal lip", (0, side * 1.025, 0.51), (1.62, 0.045, 0.08), metal, bevel=0.01)
        cube("thin left right metal lip", (side * 1.025, 0, 0.51), (0.045, 1.62, 0.08), metal, bevel=0.01)


def add_floating_shards(material):
    shard_data = [
        (-0.92, 0.18, 1.96, 0.22, 0.035, 0.12, 18),
        (0.72, -0.52, 2.18, 0.18, 0.026, 0.1, -24),
        (0.18, 0.96, 1.86, 0.14, 0.024, 0.08, 41),
        (-0.18, -1.0, 1.54, 0.12, 0.022, 0.07, -38),
        (0.98, 0.16, 1.42, 0.1, 0.02, 0.06, 12),
        (-0.78, -0.72, 2.28, 0.16, 0.024, 0.1, 63),
    ]
    for i, (x, y, z, sx, sy, sz, rz) in enumerate(shard_data):
        cube(
            f"floating translucent prism shard {i + 1}",
            (x, y, z),
            (sx, sy, sz),
            material,
            bevel=0.01,
            rotation=(math.radians(22), math.radians(12), math.radians(rz)),
        )


def add_face_glyphs(material):
    glyphs = [
        (0, -0.872, 1.12, 0.035, 0.018, 0.38),
        (0, 0.872, 1.12, 0.035, 0.018, 0.38),
        (0.872, 0, 1.12, 0.018, 0.035, 0.38),
        (-0.872, 0, 1.12, 0.018, 0.035, 0.38),
    ]
    for i, (x, y, z, sx, sy, sz) in enumerate(glyphs):
        cube(f"vertical face glyph stroke {i + 1}", (x, y, z), (sx, sy, sz), material, bevel=0.004)
        cube(f"upper face glyph tick {i + 1}", (x, y, z + 0.2), (sx * 5, sy, sz * 0.12), material, bevel=0.004)
        cube(f"lower face glyph tick {i + 1}", (x, y, z - 0.2), (sx * 5, sy, sz * 0.12), material, bevel=0.004)


def create_model():
    clear_scene()

    obsidian = mat("layered obsidian black", (0.008, 0.014, 0.026, 1.0), roughness=0.5, metallic=0.05)
    obsidian_hi = mat("blue obsidian highlights", (0.025, 0.055, 0.085, 1.0), roughness=0.32, metallic=0.2)
    metal = mat("dark prism metal", (0.035, 0.075, 0.095, 1.0), roughness=0.2, metallic=0.55)
    glass = mat("thick aqua stained glass", (0.25, 1.0, 0.92, 0.28), roughness=0.05, alpha=0.28)
    glass_edge = mat("bright mint glass trim", (0.63, 1.0, 0.88, 0.64), roughness=0.08, alpha=0.64)
    etched = mat(
        "etched cyan details",
        (0.75, 1.0, 0.94, 0.82),
        roughness=0.12,
        alpha=0.82,
        emission=(0.25, 1.0, 0.9, 1.0),
        strength=1.2,
    )
    core_outer = mat(
        "glowing outer energy cube",
        (0.38, 1.0, 0.96, 0.68),
        roughness=0.1,
        alpha=0.68,
        emission=(0.18, 0.92, 1.0, 1.0),
        strength=2.0,
    )
    core_inner = mat(
        "white hot beacon heart",
        (0.86, 1.0, 1.0, 0.96),
        roughness=0.1,
        alpha=0.96,
        emission=(0.56, 1.0, 1.0, 1.0),
        strength=7.0,
    )
    prism = mat(
        "cyan prism lens",
        (0.76, 1.0, 0.97, 0.78),
        roughness=0.04,
        alpha=0.78,
        emission=(0.3, 1.0, 0.95, 1.0),
        strength=3.6,
    )
    beam_mat = mat(
        "wide translucent beacon beam",
        (0.28, 1.0, 0.9, 0.14),
        roughness=0.02,
        alpha=0.14,
        emission=(0.18, 0.9, 0.92, 1.0),
        strength=2.2,
    )
    sparkle_mat = mat(
        "white cyan sparkle shards",
        (0.95, 1.0, 1.0, 1),
        emission=(0.9, 1.0, 1.0, 1.0),
        strength=6,
    )

    add_voxel_ring("lowest stepped obsidian", 0.07, 2.7, 0.26, 0.14, obsidian, bevel=0.02)
    cube("deep center shadow underplate", (0, 0, 0.075), (1.86, 1.86, 0.13), obsidian, bevel=0.02)
    add_voxel_ring("blue black chamfered second step", 0.22, 2.34, 0.22, 0.16, obsidian_hi, bevel=0.018)
    cube("dark central raised square", (0, 0, 0.31), (1.86, 1.86, 0.14), metal, bevel=0.018)
    add_voxel_ring("thin cyan base glow channel", 0.42, 2.02, 0.08, 0.05, etched, bevel=0.01)

    cube("outer transparent glass shell", (0, 0, 1.12), (1.72, 1.72, 1.5), glass, bevel=0.035)
    cube("floating aqua inner shell", (0, 0, 1.12), (1.38, 1.38, 1.18), core_outer, bevel=0.045)
    cube("white cyan inner cube core", (0, 0, 1.12), (0.98, 0.98, 0.98), core_inner, bevel=0.05)
    cube("rotated internal prism", (0, 0, 1.12), (0.84, 0.84, 0.84), prism, bevel=0.035, rotation=(0, 0, math.radians(45)))

    for z, prefix, size, thickness in [
        (0.46, "lower reinforced", 1.98, 0.13),
        (1.12, "middle suspended", 1.88, 0.075),
        (1.78, "upper reinforced", 1.98, 0.13),
    ]:
        add_square_frame(prefix, z, size, thickness, glass_edge)

    for x in (-0.93, 0.93):
        for y in (-0.93, 0.93):
            rail("thick luminous vertical corner post", (x, y, 1.12), (0.14, 0.14, 1.52), glass_edge)
            rail("dark inner corner spine", (x * 0.96, y * 0.96, 1.12), (0.055, 0.055, 1.3), metal)

    add_corner_hardware(metal)
    add_panel_marks(etched)
    add_base_inlays(etched, metal)
    add_face_glyphs(etched)

    cube("thin top glass plate", (0, 0, 1.91), (1.28, 1.28, 0.055), prism, bevel=0.035)
    cube("rotated top glyph square", (0, 0, 1.955), (0.9, 0.9, 0.035), etched, bevel=0.025, rotation=(0, 0, math.radians(45)))
    cylinder("round hot light lens", (0, 0, 2.0), 0.48, 0.045, core_inner, vertices=80, bevel=True)
    cylinder("narrow inner lens ring", (0, 0, 2.035), 0.31, 0.035, prism, vertices=80, bevel=True)

    cylinder("wide square-like beacon light beam", (0, 0, 4.85), 0.54, 5.65, beam_mat, vertices=4)
    bpy.context.object.rotation_euler.z = math.radians(45)
    cylinder("soft round center beam", (0, 0, 4.9), 0.29, 5.75, beam_mat, vertices=72)

    for i, (x, y, z, s) in enumerate(
        [
            (-0.5, 0.36, 2.15, 0.28),
            (0.42, -0.22, 2.26, 0.18),
            (0.08, 0.62, 2.07, 0.14),
            (-0.74, -0.28, 1.73, 0.12),
            (0.68, 0.43, 1.68, 0.1),
        ]
    ):
        add_sparkle_cross(f"floating sparkle {i + 1}", (x, y, z), s, sparkle_mat)
    add_floating_shards(prism)

    for i in range(20):
        angle = i * math.tau / 20
        radius = 0.76 + (i % 3) * 0.1
        z = 0.72 + (i % 5) * 0.25
        size = 0.035 + (i % 4) * 0.006
        cube(
            f"orbiting cyan pixel {i + 1}",
            (math.cos(angle) * radius, math.sin(angle) * radius, z),
            (size, size, size),
            etched,
            bevel=0.004,
            rotation=(math.radians(20), 0, angle),
        )

    for i in range(16):
        angle = i * math.tau / 16 + math.radians(11)
        cube(
            f"top crown cyan pixel {i + 1}",
            (math.cos(angle) * 0.68, math.sin(angle) * 0.68, 2.075 + (i % 2) * 0.045),
            (0.045, 0.045, 0.045),
            sparkle_mat if i % 4 == 0 else etched,
            bevel=0.006,
            rotation=(math.radians(26), math.radians(15), angle),
        )

    bpy.ops.object.light_add(type="AREA", location=(0, -4.8, 5.4))
    light = bpy.context.object
    light.name = "huge softbox reflection"
    light.data.energy = 600
    light.data.size = 5.5

    bpy.ops.object.light_add(type="POINT", location=(0, 0, 2.1))
    point = bpy.context.object
    point.name = "cyan core point glow"
    point.data.energy = 260
    point.data.color = (0.55, 1.0, 0.95)

    bpy.ops.object.camera_add(location=(3.7, -4.7, 3.1), rotation=(math.radians(60), 0, math.radians(39)))
    bpy.context.scene.camera = bpy.context.object

    world = bpy.context.scene.world or bpy.data.worlds.new("World")
    bpy.context.scene.world = world
    world.color = (0.55, 0.84, 0.28)

    bpy.context.scene.render.engine = "CYCLES"
    bpy.context.scene.cycles.samples = 96
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
