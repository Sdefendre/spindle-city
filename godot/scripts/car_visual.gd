class_name CarVisual
extends RefCounted
## Builds car bodies. The Model Y uses the licensed GLB; every other type is
## a simple procedural body. Returns the node plus handles for lights/wheels.

const SPECS := {
	"model_y": {"name": "Model Y", "length": 4.75, "width": 1.98, "height": 1.6, "wheel_r": 0.369, "track": 0.773, "front": 1.465, "rear": -1.416,
		"mass": 1950.0, "accel": 6.4, "top": 56.0, "awd": true, "grip": 3.4, "price": 0},
	"hatch": {"name": "Hatchback", "length": 4.1, "width": 1.76, "height": 1.48, "wheel_r": 0.31, "track": 0.76, "front": 1.28, "rear": -1.25,
		"mass": 1250.0, "accel": 3.6, "top": 44.0, "awd": false, "grip": 3.0, "price": 0},
	"sedan": {"name": "Sedan", "length": 4.7, "width": 1.84, "height": 1.44, "wheel_r": 0.33, "track": 0.79, "front": 1.42, "rear": -1.4,
		"mass": 1500.0, "accel": 4.0, "top": 48.0, "awd": false, "grip": 3.1, "price": 900},
	"pickup": {"name": "Pickup", "length": 5.5, "width": 2.0, "height": 1.85, "wheel_r": 0.4, "track": 0.86, "front": 1.75, "rear": -1.75,
		"mass": 2300.0, "accel": 3.6, "top": 42.0, "awd": true, "grip": 2.9, "price": 2200},
	"van": {"name": "Delivery Van", "length": 5.3, "width": 2.0, "height": 2.35, "wheel_r": 0.36, "track": 0.85, "front": 1.7, "rear": -1.6,
		"mass": 2500.0, "accel": 2.9, "top": 38.0, "awd": false, "grip": 2.8, "price": 1600},
	"coupe": {"name": "Sport Coupe", "length": 4.4, "width": 1.9, "height": 1.26, "wheel_r": 0.34, "track": 0.81, "front": 1.32, "rear": -1.3,
		"mass": 1450.0, "accel": 8.2, "top": 72.0, "awd": false, "grip": 3.9, "price": 7500},
}
const TRAFFIC_TYPES := ["hatch", "sedan", "sedan", "pickup", "van", "hatch", "coupe"]
const PAINTS := [Color(0.74, 0.72, 0.62), Color(0.2, 0.3, 0.36), Color(0.56, 0.2, 0.16), Color(0.7, 0.58, 0.32), Color(0.4, 0.46, 0.38),
	Color(0.12, 0.13, 0.15), Color(0.82, 0.83, 0.84), Color(0.16, 0.24, 0.5), Color(0.45, 0.45, 0.47), Color(0.86, 0.5, 0.14)]

static var _cache := {}
static var _model_y: PackedScene


static func _mat(key: String, color: Color, rough: float, metal := 0.0, emit := Color.BLACK, energy := 0.0) -> StandardMaterial3D:
	if _cache.has(key):
		return _cache[key]
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = rough
	m.metallic = metal
	if energy > 0.0:
		m.emission_enabled = true
		m.emission = emit
		m.emission_energy_multiplier = energy
	_cache[key] = m
	return m


static func paint(color: Color) -> StandardMaterial3D:
	var m := _mat("paint" + color.to_html(), color, 0.28, 0.35)
	m.clearcoat_enabled = true
	m.clearcoat = 0.8
	m.clearcoat_roughness = 0.15
	return m


static func _box(parent: Node3D, size: Vector3, pos: Vector3, mat: Material) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	var mesh := BoxMesh.new()
	mesh.size = size
	mi.mesh = mesh
	mi.position = pos
	mi.material_override = mat
	parent.add_child(mi)
	return mi


static func wheel_mesh(radius: float) -> Node3D:
	var root := Node3D.new()
	var tire := MeshInstance3D.new()
	var cyl := CylinderMesh.new()
	cyl.top_radius = radius
	cyl.bottom_radius = radius
	cyl.height = 0.24
	cyl.radial_segments = 18
	cyl.rings = 1
	tire.mesh = cyl
	tire.rotation.z = PI * 0.5
	tire.material_override = _mat("rubber", Color(0.05, 0.05, 0.055), 0.95)
	root.add_child(tire)
	var hub := MeshInstance3D.new()
	var hc := CylinderMesh.new()
	hc.top_radius = radius * 0.62
	hc.bottom_radius = radius * 0.62
	hc.height = 0.25
	hc.radial_segments = 10
	hc.rings = 1
	hub.mesh = hc
	hub.rotation.z = PI * 0.5
	hub.material_override = _mat("rim", Color(0.55, 0.58, 0.6), 0.35, 0.85)
	root.add_child(hub)
	return root


## Returns {root, body, wheels: {FL, FR, RL, RR}, brake: Material, head: Material}.
## `body` is the part that may pitch and roll; wheels are separate nodes placed
## at the hub centres, relative to a root whose origin is on the ground.
static func build(type: String, color: Color) -> Dictionary:
	var spec: Dictionary = SPECS[type]
	var root := Node3D.new()
	var out := {"root": root, "wheels": {}, "spec": spec}
	var brake := StandardMaterial3D.new()
	brake.albedo_color = Color(0.5, 0.04, 0.03)
	brake.emission_enabled = true
	brake.emission = Color(1.0, 0.1, 0.06)
	brake.emission_energy_multiplier = 0.5
	var head := StandardMaterial3D.new()
	head.albedo_color = Color(0.9, 0.92, 0.95)
	head.emission_enabled = true
	head.emission = Color(1.0, 0.96, 0.88)
	head.emission_energy_multiplier = 0.4
	out["brake"] = brake
	out["head"] = head
	var w: float = spec["width"]
	var l: float = spec["length"]
	var h: float = spec["height"]
	var r: float = spec["wheel_r"]
	var body := Node3D.new()
	root.add_child(body)
	out["body"] = body
	var corners := {"FL": Vector3(spec["track"], r, spec["front"]), "FR": Vector3(-spec["track"], r, spec["front"]),
		"RL": Vector3(spec["track"], r, spec["rear"]), "RR": Vector3(-spec["track"], r, spec["rear"])}
	if type == "model_y":
		if _model_y == null:
			_model_y = load("res://assets/models/tesla-model-y/model-y.glb")
		var glb: Node3D = _model_y.instantiate()
		body.add_child(glb)
		var names := {"FL": "FL", "FR": "FR", "RL": "RL", "RR": "RR"}
		for key: String in names:
			var steer := glb.find_child("Steer_" + key, true, false) as Node3D
			var holder := Node3D.new()
			root.add_child(holder)
			if steer != null:
				holder.position = steer.position
				for child in steer.get_children():
					child.owner = null
					steer.remove_child(child)
					holder.add_child(child)
					(child as Node3D).transform = Transform3D.IDENTITY
			else:
				holder.position = corners[key]
				holder.add_child(wheel_mesh(r))
			out["wheels"][key] = holder
		var pearl := StandardMaterial3D.new()
		pearl.albedo_color = color
		pearl.metallic = 0.25
		pearl.roughness = 0.22
		pearl.clearcoat_enabled = true
		pearl.clearcoat = 1.0
		pearl.clearcoat_roughness = 0.1
		var tinted := _mat("y_glass", Color(0.04, 0.06, 0.08), 0.05, 0.65)
		var chrome := _mat("y_chrome", Color(0.82, 0.84, 0.86), 0.14, 1.0)
		var dark_chrome := _mat("y_chrome_dark", Color(0.2, 0.21, 0.22), 0.25, 0.9)
		var lens := _mat("y_lens", Color(0.75, 0.78, 0.8), 0.08, 0.5)
		var swaps := {"body": pearl, "glass_body": tinted, "chrome": chrome, "chrome_dark": dark_chrome, "alum": chrome,
			"metal": dark_chrome, "chrome_rear_lights": brake, "chrome_rear_2": lens, "glass_lights": lens, "glass_front_lights": head}
		for node in glb.find_children("*", "MeshInstance3D", true, false):
			var mi := node as MeshInstance3D
			for i in mi.mesh.get_surface_count():
				var mat := mi.mesh.surface_get_material(i)
				if mat != null and swaps.has(mat.resource_name):
					mi.set_surface_override_material(i, swaps[mat.resource_name])
		return out
	var pm := paint(color)
	var glass := _mat("glass", Color(0.07, 0.1, 0.12), 0.08, 0.6)
	var trim := _mat("trim", Color(0.06, 0.06, 0.065), 0.7)
	var floor_y := r * 0.75
	var lower_h := (0.62 if type != "van" else 1.0) * (h / 1.5)
	_box(body, Vector3(w, lower_h, l), Vector3(0, floor_y + lower_h * 0.5, 0), pm)
	var top_y := floor_y + lower_h
	var cabin_h := h - top_y
	match type:
		"pickup":
			_box(body, Vector3(w * 0.9, cabin_h, l * 0.34), Vector3(0, top_y + cabin_h * 0.5, l * 0.08), glass)
			_box(body, Vector3(w * 0.92, 0.07, l * 0.35), Vector3(0, h, l * 0.08), pm)
			for side: float in [-1.0, 1.0]:
				_box(body, Vector3(0.08, 0.36, l * 0.36), Vector3(side * (w * 0.5 - 0.04), top_y + 0.18, -l * 0.3), pm)
			_box(body, Vector3(w, 0.36, 0.08), Vector3(0, top_y + 0.18, -l * 0.5 + 0.04), pm)
		"van":
			_box(body, Vector3(w * 0.98, cabin_h, l * 0.7), Vector3(0, top_y + cabin_h * 0.5, -l * 0.14), pm)
			_box(body, Vector3(w * 0.9, cabin_h * 0.8, l * 0.2), Vector3(0, top_y + cabin_h * 0.4, l * 0.3), glass)
			_box(body, Vector3(w * 0.92, 0.06, l * 0.22), Vector3(0, top_y + cabin_h * 0.82, l * 0.3), pm)
		_:
			var cl := l * (0.5 if type == "coupe" else 0.56)
			_box(body, Vector3(w * 0.88, cabin_h, cl), Vector3(0, top_y + cabin_h * 0.5, -l * 0.05), glass)
			_box(body, Vector3(w * 0.86, 0.06, cl * 0.72), Vector3(0, h, -l * 0.05), pm)
			for side: float in [-1.0, 1.0]:
				for z: float in [cl * 0.5 - 0.06, -cl * 0.5 + 0.06, 0.0]:
					_box(body, Vector3(0.07, cabin_h, 0.09), Vector3(side * w * 0.43, top_y + cabin_h * 0.5, -l * 0.05 + z), pm)
	_box(body, Vector3(w * 1.01, 0.16, 0.12), Vector3(0, floor_y + 0.12, l * 0.5), trim)
	_box(body, Vector3(w * 1.01, 0.16, 0.12), Vector3(0, floor_y + 0.12, -l * 0.5), trim)
	for side: float in [-1.0, 1.0]:
		_box(body, Vector3(w * 0.24, 0.11, 0.05), Vector3(side * w * 0.33, floor_y + lower_h * 0.72, l * 0.5 + 0.01), head)
		_box(body, Vector3(w * 0.22, 0.1, 0.05), Vector3(side * w * 0.35, floor_y + lower_h * 0.74, -l * 0.5 - 0.01), brake)
	for key: String in corners:
		var holder := Node3D.new()
		holder.position = corners[key]
		holder.add_child(wheel_mesh(r))
		root.add_child(holder)
		out["wheels"][key] = holder
	return out
