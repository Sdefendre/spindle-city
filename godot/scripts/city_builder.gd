class_name CityBuilder
extends Node3D
## Generates the 3D city from CityData: ground, water, parks, roads, lane
## markings, buildings with collision, trees and street lamps. Everything is
## batched into 240 m chunks so off-screen neighbourhoods are culled.

const CHUNK := 240.0
const Y_GROUND := -0.14
const Y_WATER := -0.11
const Y_AREA := -0.09
const Y_WALK := -0.06
const Y_ROAD := -0.03
const Y_MARK := -0.012

class Buf:
	var v := PackedVector3Array()
	var n := PackedVector3Array()
	var uv := PackedVector2Array()
	var uv2 := PackedVector2Array()
	var c := PackedColorArray()
	var use_uv := false
	var use_color := false

	func tri(p0: Vector3, p1: Vector3, p2: Vector3, nrm: Vector3) -> void:
		# Godot front faces wind clockwise; flip when the triangle faces away.
		if (p2 - p0).cross(p1 - p0).dot(nrm) < 0.0:
			v.append(p0); v.append(p2); v.append(p1)
		else:
			v.append(p0); v.append(p1); v.append(p2)
		n.append(nrm); n.append(nrm); n.append(nrm)

	func quad(a: Vector3, b: Vector3, c2: Vector3, d: Vector3, nrm: Vector3) -> void:
		tri(a, b, c2, nrm)
		tri(a, c2, d, nrm)

	func commit(mesh: ArrayMesh, material: Material) -> void:
		if v.size() == 0:
			return
		var arrays := []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = v
		arrays[Mesh.ARRAY_NORMAL] = n
		if use_uv:
			arrays[Mesh.ARRAY_TEX_UV] = uv
			arrays[Mesh.ARRAY_TEX_UV2] = uv2
		if use_color:
			arrays[Mesh.ARRAY_COLOR] = c
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
		mesh.surface_set_material(mesh.get_surface_count() - 1, material)

var data: CityData
var lamp_positions: PackedVector3Array = PackedVector3Array()
var mat_asphalt: ShaderMaterial
var mat_sidewalk: ShaderMaterial
var mat_path: ShaderMaterial
var mat_facade: ShaderMaterial
var mat_roof: StandardMaterial3D
var mat_mark_white: StandardMaterial3D
var mat_mark_yellow: StandardMaterial3D
var mat_park: StandardMaterial3D
var mat_pitch: StandardMaterial3D
var mat_ground: StandardMaterial3D
var mat_water: ShaderMaterial
var mat_steel: StandardMaterial3D
var _rng := RandomNumberGenerator.new()
var _raised := {}

const WALL_TINTS := [
	Color(0.78, 0.40, 0.31), Color(0.70, 0.36, 0.29), Color(0.82, 0.50, 0.37), Color(0.64, 0.44, 0.37),
	Color(0.80, 0.72, 0.62), Color(0.66, 0.65, 0.62), Color(0.86, 0.58, 0.44), Color(0.74, 0.46, 0.40),
	Color(0.88, 0.84, 0.76), Color(0.58, 0.60, 0.62)]
const SIDING_TINTS := [
	Color(0.86, 0.84, 0.78), Color(0.74, 0.78, 0.74), Color(0.80, 0.72, 0.60), Color(0.62, 0.68, 0.72),
	Color(0.72, 0.62, 0.52), Color(0.56, 0.62, 0.55), Color(0.84, 0.80, 0.66), Color(0.66, 0.58, 0.58),
	Color(0.78, 0.66, 0.62), Color(0.52, 0.56, 0.62)]
const ROOF_TINTS := [Color(0.22, 0.22, 0.23), Color(0.28, 0.24, 0.22), Color(0.32, 0.30, 0.29), Color(0.24, 0.27, 0.26), Color(0.36, 0.25, 0.22)]


func _ground_material(color_path: String, normal_path: String, rough_path: String, tint: Color, tile: float, brightness: float) -> ShaderMaterial:
	var m := ShaderMaterial.new()
	m.shader = load("res://shaders/ground.gdshader")
	m.set_shader_parameter("albedo_tex", load(color_path))
	m.set_shader_parameter("normal_tex", load(normal_path))
	if rough_path != "":
		m.set_shader_parameter("rough_tex", load(rough_path))
	m.set_shader_parameter("tint", tint)
	m.set_shader_parameter("tile", tile)
	m.set_shader_parameter("brightness", brightness)
	return m


func _flat(color: Color, rough := 0.9) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = color
	m.roughness = rough
	return m


func _make_materials() -> void:
	var mats := "res://assets/materials/"
	mat_asphalt = _ground_material(mats + "asphalt-color.jpg", mats + "asphalt-normal.jpg", mats + "asphalt-rough.jpg", Color(0.78, 0.8, 0.84), 0.2, 1.0)
	mat_sidewalk = _ground_material(mats + "sidewalk-color.jpg", mats + "sidewalk-normal.jpg", mats + "sidewalk-rough.jpg", Color(0.92, 0.9, 0.86), 0.3, 1.05)
	mat_path = _ground_material(mats + "concrete-color.jpg", mats + "sidewalk-normal.jpg", mats + "sidewalk-rough.jpg", Color(0.9, 0.86, 0.76), 0.3, 1.0)
	mat_facade = ShaderMaterial.new()
	mat_facade.shader = load("res://shaders/facade.gdshader")
	mat_facade.set_shader_parameter("brick", load(mats + "brick-color.jpg"))
	mat_facade.set_shader_parameter("brick_normal", load(mats + "brick-normal.jpg"))
	mat_roof = StandardMaterial3D.new()
	mat_roof.vertex_color_use_as_albedo = true
	mat_roof.roughness = 0.92
	mat_mark_white = _flat(Color(0.9, 0.9, 0.86), 0.7)
	mat_mark_yellow = _flat(Color(0.86, 0.68, 0.2), 0.7)
	mat_park = _flat(Color(0.25, 0.4, 0.2), 1.0)
	mat_pitch = _flat(Color(0.3, 0.48, 0.25), 1.0)
	mat_ground = _flat(Color(0.34, 0.39, 0.3), 1.0)
	mat_steel = _flat(Color(0.33, 0.42, 0.4), 0.6)
	mat_steel.metallic = 0.5
	mat_water = ShaderMaterial.new()
	mat_water.shader = load("res://shaders/water.gdshader")
	var noise := FastNoiseLite.new()
	noise.frequency = 0.018
	noise.fractal_octaves = 4
	var tex := NoiseTexture2D.new()
	tex.noise = noise
	tex.seamless = true
	tex.as_normal_map = true
	tex.bump_strength = 6.0
	tex.width = 512
	tex.height = 512
	mat_water.set_shader_parameter("waves", tex)


func _chunk_key(p: Vector2) -> Vector2i:
	return Vector2i(floori(p.x / CHUNK), floori(p.y / CHUNK))


func _add_mesh(mesh: ArrayMesh, range_end: float, shadows: bool) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.visibility_range_end = range_end
	mi.visibility_range_end_margin = 40.0
	mi.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_DISABLED
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	return mi


## Builds everything. `progress` is called with (fraction, label) as it goes;
## the coroutine yields a frame between stages so the loading bar can draw.
func build(city: CityData, progress: Callable) -> void:
	data = city
	_rng.seed = 20261111
	_make_materials()
	progress.call(0.02, "Laying the ground")
	_build_base()
	await get_tree().process_frame
	progress.call(0.08, "Filling the river")
	_build_flat_polys()
	await get_tree().process_frame
	progress.call(0.14, "Paving streets")
	await _build_roads(progress)
	progress.call(0.42, "Raising buildings")
	await _build_buildings(progress)
	progress.call(0.9, "Planting trees and lamps")
	_build_trees_and_lamps()
	_build_bridge_details()
	await get_tree().process_frame
	progress.call(1.0, "Ready")


func _build_base() -> void:
	var plane := PlaneMesh.new()
	plane.size = Vector2(data.width + 9000.0, data.height + 3000.0)
	var mi := MeshInstance3D.new()
	mi.mesh = plane
	mi.material_override = mat_ground
	mi.position = Vector3(data.width * 0.5 - 2000.0, Y_GROUND, data.height * 0.5)
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	var body := StaticBody3D.new()
	body.name = "Ground"
	# A box rather than a WorldBoundaryShape3D: Jolt's boundary plane is only
	# 2 km across, smaller than the city.
	var shape := CollisionShape3D.new()
	var slab := BoxShape3D.new()
	slab.size = Vector3(data.width + 800.0, 20.0, data.height + 800.0)
	shape.shape = slab
	shape.position = Vector3(data.width * 0.5, -10.0, data.height * 0.5)
	body.add_child(shape)
	body.collision_layer = 1
	add_child(body)
	var physics_mat := PhysicsMaterial.new()
	physics_mat.friction = 1.0
	body.physics_material_override = physics_mat
	# Invisible walls at the edge of the mapped extract.
	var edges := [
		[Vector3(data.width * 0.5, 20, 6), Vector3(data.width, 40, 4)],
		[Vector3(data.width * 0.5, 20, data.height - 6), Vector3(data.width, 40, 4)],
		[Vector3(6, 20, data.height * 0.5), Vector3(4, 40, data.height)],
		[Vector3(data.width - 6, 20, data.height * 0.5), Vector3(4, 40, data.height)]]
	for e: Array in edges:
		var cs := CollisionShape3D.new()
		var box := BoxShape3D.new()
		box.size = e[1]
		cs.shape = box
		cs.position = e[0]
		body.add_child(cs)


func _poly_into(buf: Buf, p: PackedVector2Array, y: float) -> void:
	var idx := Geometry2D.triangulate_polygon(p)
	for i in range(0, idx.size(), 3):
		buf.tri(Vector3(p[idx[i]].x, y, p[idx[i]].y), Vector3(p[idx[i + 1]].x, y, p[idx[i + 1]].y), Vector3(p[idx[i + 2]].x, y, p[idx[i + 2]].y), Vector3.UP)


func _build_flat_polys() -> void:
	var water := Buf.new()
	for w in data.waters:
		_poly_into(water, w["p"], Y_WATER)
	for s in data.streams:
		_ribbon(water, s["p"], 9.0 if s["type"] == "river" else 4.5, Y_WATER)
	var mesh := ArrayMesh.new()
	water.commit(mesh, mat_water)
	_add_mesh(mesh, 0.0, false)
	var park := Buf.new()
	var pitch := Buf.new()
	for a in data.areas:
		_poly_into(pitch if a["type"] == "pitch" else park, a["p"], Y_AREA + (0.01 if a["type"] == "pitch" else 0.0))
	var mesh2 := ArrayMesh.new()
	park.commit(mesh2, mat_park)
	pitch.commit(mesh2, mat_pitch)
	_add_mesh(mesh2, 0.0, false)


## Flat strip along a polyline with mitred joints.
func _ribbon(buf: Buf, p: PackedVector2Array, width: float, y: float) -> void:
	var half := width * 0.5
	var left := PackedVector2Array()
	var right := PackedVector2Array()
	for i in p.size():
		var dir_in := (p[i] - p[i - 1]).normalized() if i > 0 else (p[1] - p[0]).normalized()
		var dir_out := (p[i + 1] - p[i]).normalized() if i < p.size() - 1 else dir_in
		var tangent := (dir_in + dir_out).normalized()
		if tangent == Vector2.ZERO:
			tangent = dir_out
		var normal := Vector2(-tangent.y, tangent.x)
		var scale := 1.0 / maxf(0.5, tangent.dot(dir_out))
		left.append(p[i] + normal * half * scale)
		right.append(p[i] - normal * half * scale)
	for i in range(p.size() - 1):
		buf.quad(Vector3(left[i].x, y, left[i].y), Vector3(left[i + 1].x, y, left[i + 1].y),
			Vector3(right[i + 1].x, y, right[i + 1].y), Vector3(right[i].x, y, right[i].y), Vector3.UP)


func _dashes(buf: Buf, p: PackedVector2Array, offset: float, dash: float, gap: float, width: float, y: float) -> void:
	var carry := 0.0
	for i in range(p.size() - 1):
		var a := p[i]
		var b := p[i + 1]
		var length := a.distance_to(b)
		if length < 0.01:
			continue
		var dir := (b - a) / length
		var normal := Vector2(-dir.y, dir.x)
		var t := carry
		while t < length:
			var e := minf(t + dash, length)
			if e - t > 0.4:
				var s0 := a + dir * t + normal * offset
				var s1 := a + dir * e + normal * offset
				var w := normal * width * 0.5
				buf.quad(Vector3(s0.x + w.x, y, s0.y + w.y), Vector3(s1.x + w.x, y, s1.y + w.y),
					Vector3(s1.x - w.x, y, s1.y - w.y), Vector3(s0.x - w.x, y, s0.y - w.y), Vector3.UP)
			t += dash + gap
		carry = t - length


func _build_roads(progress: Callable) -> void:
	var chunks := {}
	for r in data.roads:
		var key := _chunk_key((r["rect"] as Rect2).get_center())
		if not chunks.has(key):
			chunks[key] = {"asphalt": Buf.new(), "walk": Buf.new(), "path": Buf.new(), "white": Buf.new(), "yellow": Buf.new()}
		var c: Dictionary = chunks[key]
		var p: PackedVector2Array = r["p"]
		var w: float = r["width"]
		var lift := 0.006 * float(maxi(0, r["layer"]))
		if r["drive"]:
			_ribbon(c["asphalt"], p, w, Y_ROAD + lift)
			if not r["fast"] and r["type"] != "service" and not r["tunnel"]:
				_ribbon(c["walk"], p, w + 4.6, Y_WALK)
			if r["fast"]:
				_dashes(c["white"], p, 0.0, 3.0, 9.0, 0.16, Y_MARK + lift)
				_dashes(c["white"], p, w * 0.5 - 0.5, 400.0, 0.0, 0.14, Y_MARK + lift)
				_dashes(c["yellow"], p, -w * 0.5 + 0.5, 400.0, 0.0, 0.14, Y_MARK + lift)
			elif r["type"] in ["primary", "secondary", "tertiary"]:
				if r["oneway"]:
					_dashes(c["white"], p, 0.0, 3.0, 6.0, 0.13, Y_MARK + lift)
				else:
					_dashes(c["yellow"], p, 0.12, 400.0, 0.0, 0.1, Y_MARK + lift)
					_dashes(c["yellow"], p, -0.12, 400.0, 0.0, 0.1, Y_MARK + lift)
			elif r["type"] == "residential" and r["length"] > 60.0:
				_dashes(c["yellow"], p, 0.0, 3.0, 7.0, 0.11, Y_MARK + lift)
		else:
			_ribbon(c["path"], p, w, Y_WALK + 0.012)
	var done := 0
	for key: Vector2i in chunks:
		var c: Dictionary = chunks[key]
		var mesh := ArrayMesh.new()
		(c["walk"] as Buf).commit(mesh, mat_sidewalk)
		(c["path"] as Buf).commit(mesh, mat_path)
		(c["asphalt"] as Buf).commit(mesh, mat_asphalt)
		(c["white"] as Buf).commit(mesh, mat_mark_white)
		(c["yellow"] as Buf).commit(mesh, mat_mark_yellow)
		_add_mesh(mesh, 2200.0, false)
		done += 1
		if done % 24 == 0:
			progress.call(0.14 + 0.28 * float(done) / chunks.size(), "Paving streets")
			await get_tree().process_frame


func _find_raised() -> void:
	# Buildings that sit over a mapped tunnel road are lifted so the road
	# passes beneath them, and they get no collision.
	for r in data.roads:
		if not r["tunnel"] or not r["drive"]:
			continue
		var rect: Rect2 = (r["rect"] as Rect2).grow(8.0)
		for i in data.buildings.size():
			var b := data.buildings[i]
			if rect.intersects(b["rect"]) and Geometry2D.intersect_polyline_with_polygon(r["p"], b["p"]).size() > 0:
				_raised[i] = true


func _build_buildings(progress: Callable) -> void:
	_find_raised()
	var chunks := {}
	for i in data.buildings.size():
		var key := _chunk_key((data.buildings[i]["rect"] as Rect2).get_center())
		if not chunks.has(key):
			chunks[key] = PackedInt32Array()
		chunks[key].append(i)
	var done := 0
	for key: Vector2i in chunks:
		var walls := Buf.new()
		walls.use_uv = true
		walls.use_color = true
		var roofs := Buf.new()
		roofs.use_color = true
		var faces := PackedVector3Array()
		for bi: int in chunks[key]:
			_building(data.buildings[bi], bi, walls, roofs, faces)
		var mesh := ArrayMesh.new()
		walls.commit(mesh, mat_facade)
		roofs.commit(mesh, mat_roof)
		_add_mesh(mesh, 2600.0, true)
		if faces.size() > 0:
			var body := StaticBody3D.new()
			var cs := CollisionShape3D.new()
			var shape := ConcavePolygonShape3D.new()
			shape.backface_collision = true
			shape.set_faces(faces)
			cs.shape = shape
			body.add_child(cs)
			body.collision_layer = 1
			body.set_meta("kind", "building")
			add_child(body)
		done += 1
		if done % 6 == 0:
			progress.call(0.42 + 0.48 * float(done) / chunks.size(), "Raising buildings")
			await get_tree().process_frame


func _building(b: Dictionary, index: int, walls: Buf, roofs: Buf, faces: PackedVector3Array) -> void:
	var p: PackedVector2Array = b["p"]
	var h: float = b["h"]
	var rnd: float = b["rnd"]
	var raised := _raised.has(index)
	var base := 5.6 if raised else 0.0
	if raised:
		h = maxf(h, 12.0)
	var house: bool = b["area"] < 260.0 and b["type"] != "ship" and not raised
	var tint: Color
	if b["type"] == "ship":
		tint = Color(0.42, 0.45, 0.47)
	elif house:
		tint = SIDING_TINTS[index % SIDING_TINTS.size()]
	else:
		tint = WALL_TINTS[index % WALL_TINTS.size()]
	tint = tint.lightened(rnd * 0.12 - 0.04) if rnd > 0.33 else tint.darkened(0.06)
	tint.a = (0.5 if house else 0.0) + rnd * 0.49
	var sign_ccw := 1.0 if CityData._signed_area(p) > 0.0 else -1.0
	var count := p.size()
	var gable := house and count <= 8 and h < 11.0
	if gable:
		h = minf(h, 7.6)
	var along := 0.0
	for i in count:
		var a := p[i]
		var c := p[(i + 1) % count]
		var edge := c - a
		var length := edge.length()
		if length < 0.05:
			continue
		var out := Vector2(edge.y, -edge.x) / length * sign_ccw
		var nrm := Vector3(out.x, 0.0, out.y)
		var a0 := Vector3(a.x, base, a.y)
		var c0 := Vector3(c.x, base, c.y)
		var a1 := Vector3(a.x, h, a.y)
		var c1 := Vector3(c.x, h, c.y)
		var start := walls.v.size()
		walls.quad(a0, c0, c1, a1, nrm)
		for k in range(start, walls.v.size()):
			var vert := walls.v[k]
			var u := Vector2(vert.x - a.x, vert.z - a.y).length()
			walls.uv.append(Vector2(u, vert.y - base))
			walls.uv2.append(Vector2(h - base, length))
			walls.c.append(tint)
		if not raised:
			faces.append(a0); faces.append(c0); faces.append(c1)
			faces.append(a0); faces.append(c1); faces.append(a1)
		along += length
	var roof_tint: Color = ROOF_TINTS[index % ROOF_TINTS.size()] if house else Color(0.16, 0.16, 0.17).lerp(Color(0.27, 0.25, 0.24), rnd)
	var start_r := roofs.v.size()
	if gable:
		_gable_roof(p, h, roofs, walls, tint)
	else:
		_poly_into(roofs, p, h)
		if raised:
			_poly_into(roofs, p, base)
	for k in range(start_r, roofs.v.size()):
		roofs.c.append(roof_tint)


## Gable roof over the footprint's oriented bounding box, with the ridge along
## the longest wall. Adds the triangular gable ends to the wall buffer.
func _gable_roof(p: PackedVector2Array, h: float, roofs: Buf, walls: Buf, tint: Color) -> void:
	var best := 0.0
	var dir := Vector2.RIGHT
	for i in p.size():
		var e := p[(i + 1) % p.size()] - p[i]
		if e.length() > best:
			best = e.length()
			dir = e / best
	var nrm := Vector2(-dir.y, dir.x)
	var lo_d := INF
	var hi_d := -INF
	var lo_n := INF
	var hi_n := -INF
	for v in p:
		lo_d = minf(lo_d, v.dot(dir)); hi_d = maxf(hi_d, v.dot(dir))
		lo_n = minf(lo_n, v.dot(nrm)); hi_n = maxf(hi_n, v.dot(nrm))
	var over := 0.35
	lo_n -= over; hi_n += over; lo_d -= over * 0.6; hi_d += over * 0.6
	var mid_n := (lo_n + hi_n) * 0.5
	var rise := clampf((hi_n - lo_n) * 0.5 * 0.62, 1.2, 3.6)
	var corner := func(d: float, n: float, y: float) -> Vector3:
		var q := dir * d + nrm * n
		return Vector3(q.x, y, q.y)
	var eave := h - 0.05
	var r0: Vector3 = corner.call(lo_d, mid_n, h + rise)
	var r1: Vector3 = corner.call(hi_d, mid_n, h + rise)
	var a0: Vector3 = corner.call(lo_d, lo_n, eave)
	var a1: Vector3 = corner.call(hi_d, lo_n, eave)
	var b0: Vector3 = corner.call(lo_d, hi_n, eave)
	var b1: Vector3 = corner.call(hi_d, hi_n, eave)
	var slope_a := Vector3(-nrm.x * rise, (hi_n - lo_n) * 0.5, -nrm.y * rise).normalized()
	var slope_b := Vector3(nrm.x * rise, (hi_n - lo_n) * 0.5, nrm.y * rise).normalized()
	roofs.quad(a0, a1, r1, r0, slope_a)
	roofs.quad(b0, b1, r1, r0, slope_b)
	var inset := over * 0.6
	for side in 2:
		var d := (lo_d + inset) if side == 0 else (hi_d - inset)
		var out := Vector3(-dir.x, 0, -dir.y) if side == 0 else Vector3(dir.x, 0, dir.y)
		var g0: Vector3 = corner.call(d, lo_n + over, h)
		var g1: Vector3 = corner.call(d, hi_n - over, h)
		var g2: Vector3 = corner.call(d, mid_n, h + rise * (1.0 - over / maxf(0.5, (hi_n - lo_n) * 0.5)))
		walls.tri(g0, g1, g2, out)
		for k in 3:
			walls.uv.append(Vector2(0.0, 0.0))
			walls.uv2.append(Vector2(100.0, 0.0))
			walls.c.append(tint)


func _multimesh(mesh: Mesh, transforms: Array, colors: Array, range_end: float, shadows: bool) -> void:
	if transforms.size() == 0:
		return
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = colors.size() > 0
	mm.mesh = mesh
	mm.instance_count = transforms.size()
	for i in transforms.size():
		mm.set_instance_transform(i, transforms[i])
		if colors.size() > 0:
			mm.set_instance_color(i, colors[i])
	var mi := MultiMeshInstance3D.new()
	mi.multimesh = mm
	mi.visibility_range_end = range_end
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)


func _build_trees_and_lamps() -> void:
	var trunk := CylinderMesh.new()
	trunk.top_radius = 0.14
	trunk.bottom_radius = 0.22
	trunk.height = 3.2
	trunk.radial_segments = 6
	trunk.rings = 1
	trunk.material = _flat(Color(0.26, 0.2, 0.15))
	var crown := SphereMesh.new()
	crown.radius = 2.3
	crown.height = 4.2
	crown.radial_segments = 8
	crown.rings = 5
	var crown_mat := _flat(Color(1, 1, 1), 1.0)
	crown_mat.vertex_color_use_as_albedo = true
	crown.material = crown_mat
	var tree_chunks := {}
	var add_tree := func(pos: Vector2) -> void:
		if data.blocked(pos) or data.nearest_road(pos, false, false, 1)["d"] < 5.2:
			return
		var key := _chunk_key(pos)
		if not tree_chunks.has(key):
			tree_chunks[key] = {"t": [], "c": [], "col": []}
		var s := _rng.randf_range(0.75, 1.5)
		var basis := Basis(Vector3.UP, _rng.randf() * TAU).scaled(Vector3(s, s, s))
		tree_chunks[key]["t"].append(Transform3D(basis, Vector3(pos.x, 1.6 * s, pos.y)))
		tree_chunks[key]["c"].append(Transform3D(basis.scaled(Vector3(1, _rng.randf_range(0.85, 1.2), 1)), Vector3(pos.x, 4.6 * s, pos.y)))
		tree_chunks[key]["col"].append(Color(0.18, 0.36, 0.16).lerp(Color(0.42, 0.5, 0.2), _rng.randf()))
	for a in data.areas:
		if a["type"] == "pitch":
			continue
		var rect: Rect2 = a["rect"]
		var count := clampi(int(rect.get_area() / 420.0), 3, 90)
		for i in count:
			var q := Vector2(_rng.randf_range(rect.position.x, rect.end.x), _rng.randf_range(rect.position.y, rect.end.y))
			if Geometry2D.is_point_in_polygon(q, a["p"]):
				add_tree.call(q)
	# Street trees along residential roads, set back behind the sidewalk.
	for r in data.roads:
		if r["type"] != "residential" or r["length"] < 70.0:
			continue
		var p: PackedVector2Array = r["p"]
		var travelled := _rng.randf_range(8.0, 30.0)
		for i in range(p.size() - 1):
			var length := p[i].distance_to(p[i + 1])
			var dir := (p[i + 1] - p[i]) / maxf(length, 0.01)
			var normal := Vector2(-dir.y, dir.x)
			while travelled < length:
				var side := 1.0 if _rng.randf() < 0.5 else -1.0
				add_tree.call(p[i] + dir * travelled + normal * side * (float(r["width"]) * 0.5 + 3.4))
				travelled += _rng.randf_range(26.0, 60.0)
			travelled -= length
	for key: Vector2i in tree_chunks:
		var t: Dictionary = tree_chunks[key]
		_multimesh(trunk, t["t"], [], 420.0, true)
		_multimesh(crown, t["c"], t["col"], 900.0, true)

	var pole := CylinderMesh.new()
	pole.top_radius = 0.07
	pole.bottom_radius = 0.1
	pole.height = 7.0
	pole.radial_segments = 6
	pole.rings = 1
	pole.material = _flat(Color(0.2, 0.22, 0.22), 0.6)
	var head := BoxMesh.new()
	head.size = Vector3(0.34, 0.12, 0.9)
	var head_mat := ShaderMaterial.new()
	head_mat.shader = load("res://shaders/glow.gdshader")
	head.material = head_mat
	var lamp_chunks := {}
	for r in data.roads:
		if not (r["type"] in ["primary", "secondary", "tertiary", "residential"]) or r["tunnel"]:
			continue
		var spacing := 42.0 if r["type"] != "residential" else 64.0
		var p: PackedVector2Array = r["p"]
		var travelled := spacing * 0.5
		var flip := 1.0
		for i in range(p.size() - 1):
			var length := p[i].distance_to(p[i + 1])
			var dir := (p[i + 1] - p[i]) / maxf(length, 0.01)
			var normal := Vector2(-dir.y, dir.x)
			while travelled < length:
				var q: Vector2 = p[i] + dir * travelled + normal * flip * (float(r["width"]) * 0.5 + 1.0)
				if not data.blocked(q):
					var key := _chunk_key(q)
					if not lamp_chunks.has(key):
						lamp_chunks[key] = {"p": [], "h": []}
					var yaw := atan2(-normal.x * flip, -normal.y * flip)
					lamp_chunks[key]["p"].append(Transform3D(Basis(), Vector3(q.x, 3.5, q.y)))
					var inward := Vector3(-normal.x * flip, 0, -normal.y * flip)
					lamp_chunks[key]["h"].append(Transform3D(Basis(Vector3.UP, yaw), Vector3(q.x, 7.0, q.y) + inward * 0.5))
					lamp_positions.append(Vector3(q.x, 6.8, q.y) + inward * 0.9)
				flip = -flip
				travelled += spacing
			travelled -= length
	for key: Vector2i in lamp_chunks:
		_multimesh(pole, lamp_chunks[key]["p"], [], 320.0, false)
		_multimesh(head, lamp_chunks[key]["h"], [], 700.0, false)


## Guard rails on bridges, and steel through-truss frames on long ones.
func _build_bridge_details() -> void:
	var rail := Buf.new()
	for r in data.roads:
		if not r["bridge"] or not r["drive"]:
			continue
		var p: PackedVector2Array = r["p"]
		var truss: bool = r["length"] > 500.0 and r["fast"]
		for i in range(p.size() - 1):
			var a := p[i]
			var b := p[i + 1]
			var length := a.distance_to(b)
			if length < 0.5:
				continue
			var dir := (b - a) / length
			var normal := Vector2(-dir.y, dir.x)
			for side: float in [-1.0, 1.0]:
				var off: Vector2 = normal * side * (float(r["width"]) * 0.5 + 0.15)
				_box_between(rail, a + off, b + off, 0.0, 0.95, 0.16)
				if truss:
					_box_between(rail, a + off, b + off, 9.0, 9.5, 0.5)
					var steps := maxi(1, int(length / 14.0))
					for s in steps + 1:
						var q := a + dir * (length * float(s) / steps) + off
						_box_between(rail, q - dir * 0.25, q + dir * 0.25, 0.0, 9.5, 0.5)
	if rail.v.size() > 0:
		var mesh := ArrayMesh.new()
		rail.commit(mesh, mat_steel)
		_add_mesh(mesh, 1800.0, true)


func _box_between(buf: Buf, a: Vector2, b: Vector2, y0: float, y1: float, thick: float) -> void:
	var dir := (b - a).normalized()
	var n := Vector2(-dir.y, dir.x) * thick * 0.5
	var c := [a + n, b + n, b - n, a - n]
	for i in 4:
		var p0: Vector2 = c[i]
		var p1: Vector2 = c[(i + 1) % 4]
		var e := p1 - p0
		var out2 := Vector2(e.y, -e.x).normalized()
		if out2.dot((p0 + p1) * 0.5 - (a + b) * 0.5) < 0.0:
			out2 = -out2
		var out := Vector3(out2.x, 0, out2.y)
		buf.quad(Vector3(p0.x, y0, p0.y), Vector3(p1.x, y0, p1.y), Vector3(p1.x, y1, p1.y), Vector3(p0.x, y1, p0.y), out)
	buf.quad(Vector3(c[0].x, y1, c[0].y), Vector3(c[1].x, y1, c[1].y), Vector3(c[2].x, y1, c[2].y), Vector3(c[3].x, y1, c[3].y), Vector3.UP)
