extends SceneTree
func _initialize() -> void:
	var glb: Node3D = (load("res://assets/models/tesla-model-y/model-y.glb") as PackedScene).instantiate()
	for node in glb.find_children("*", "MeshInstance3D", true, false):
		var mi := node as MeshInstance3D
		for i in mi.mesh.get_surface_count():
			var mat := mi.mesh.surface_get_material(i) as BaseMaterial3D
			var n: int = mi.mesh.surface_get_arrays(i)[Mesh.ARRAY_VERTEX].size()
			print(mi.name, " surf ", i, " mat='", mat.resource_name if mat else "null", "' albedo=", mat.albedo_color if mat else "", " metal=", mat.metallic if mat else "", " verts=", n)
	quit()
