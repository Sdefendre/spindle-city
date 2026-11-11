class_name Missions
extends Node3D
## Job offers and the job in progress: courier runs, rideshare fares and
## checkpoint time trials. Rewards are paid in cash through `game`.

const KINDS := {
	"courier": {"title": "Courier run", "color": Color(1.0, 0.62, 0.2), "blurb": "Deliver parcels before the clock runs out."},
	"ride": {"title": "Rideshare fare", "color": Color(0.3, 0.85, 1.0), "blurb": "Pick up a passenger and drive them smoothly."},
	"trial": {"title": "Time trial", "color": Color(1.0, 0.35, 0.8), "blurb": "Hit every checkpoint as fast as you can."},
}

var game: Node
var data: CityData
var offers: Array[Dictionary] = []
var job := {}                 # empty when no job is running
var _rng := RandomNumberGenerator.new()
var _target_marker: Node3D
var _passenger: Node3D
var _refresh := 0.0


func setup(owner_game: Node, city: CityData) -> void:
	game = owner_game
	data = city
	_rng.randomize()


static func beacon(color: Color, text: String, radius := 2.4) -> Node3D:
	var root := Node3D.new()
	var mi := MeshInstance3D.new()
	var mesh := CylinderMesh.new()
	mesh.top_radius = radius
	mesh.bottom_radius = radius
	mesh.height = 26.0
	mesh.cap_top = false
	mesh.cap_bottom = false
	mesh.radial_segments = 20
	mi.mesh = mesh
	mi.position.y = 13.0
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.albedo_color = Color(color.r, color.g, color.b, 0.26)
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	mat.no_depth_test = false
	mi.material_override = mat
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(mi)
	var ring := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = radius - 0.18
	torus.outer_radius = radius + 0.08
	ring.mesh = torus
	ring.position.y = 0.08
	var ring_mat := StandardMaterial3D.new()
	ring_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ring_mat.albedo_color = color
	ring.material_override = ring_mat
	ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(ring)
	if text != "":
		var label := Label3D.new()
		label.text = text
		label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		label.no_depth_test = true
		label.fixed_size = true
		label.pixel_size = 0.0011
		label.font_size = 30
		label.outline_size = 10
		label.modulate = color.lightened(0.4)
		label.position.y = 4.2
		label.visibility_range_end = 420.0
		root.add_child(label)
	return root


func _place(node: Node3D, pos: Vector2) -> void:
	node.position = Vector3(pos.x, 0.0, pos.y)


func _new_offer(kind: String, focus: Vector2) -> void:
	var hit := data.random_drive_point(_rng, focus, 90.0, 420.0)
	if hit.is_empty():
		return
	var pos: Vector2 = hit["p"]
	for o in offers:
		if (o["pos"] as Vector2).distance_to(pos) < 80.0:
			return
	var info: Dictionary = KINDS[kind]
	var marker := beacon(info["color"], info["title"])
	add_child(marker)
	_place(marker, pos)
	offers.append({"kind": kind, "pos": pos, "marker": marker})


func _point_from(origin: Vector2, min_d: float, max_d: float) -> Vector2:
	for attempt in 12:
		var hit := data.random_drive_point(_rng, origin, min_d, max_d)
		if not hit.is_empty() and data.find_route(origin, hit["p"]).size() > 1:
			return hit["p"]
	return Vector2.INF


func offer_at(pos: Vector2) -> Dictionary:
	if not job.is_empty():
		return {}
	for o in offers:
		if (o["pos"] as Vector2).distance_to(pos) < 5.0:
			return o
	return {}


func start(offer: Dictionary) -> void:
	var kind: String = offer["kind"]
	var origin: Vector2 = offer["pos"]
	var stops: Array[Vector2] = []
	var count := 1
	if kind == "courier":
		count = _rng.randi_range(2, 3)
	elif kind == "trial":
		count = 7
	elif kind == "ride":
		count = 2
	var from := origin
	var total := 0.0
	for i in count:
		var lo := 260.0 if kind != "trial" else 170.0
		var hi := 820.0 if kind != "trial" else 380.0
		if kind == "ride" and i == 0:
			lo = 120.0
			hi = 380.0
		var p := _point_from(from, lo, hi)
		if p == Vector2.INF:
			break
		total += CityData.path_length(data.find_route(from, p))
		stops.append(p)
		from = p
	if stops.size() < (2 if kind == "ride" else 1):
		game.toast("No route for that job from here. Try another marker.")
		return
	offers.erase(offer)
	(offer["marker"] as Node).queue_free()
	job = {"kind": kind, "stops": stops, "index": 0, "time": 0.0, "length": total, "comfort": 100.0, "boarded": false,
		"limit": total / 8.5 + 22.0 * stops.size() if kind == "courier" else 0.0}
	if kind == "ride":
		_passenger = (load(Pedestrians.MODELS[_rng.randi() % 3]) as PackedScene).instantiate()
		add_child(_passenger)
		_place(_passenger, stops[0] + Vector2(2.2, 0.0))
		var anim := _passenger.find_child("AnimationPlayer", true, false) as AnimationPlayer
		if anim != null and anim.has_animation("Idle"):
			anim.get_animation("Idle").loop_mode = Animation.LOOP_LINEAR
			anim.play("Idle")
	_show_target()
	game.sound.play("chime")
	game.toast(KINDS[kind]["title"] + " started · " + KINDS[kind]["blurb"])


func _show_target() -> void:
	if _target_marker != null:
		_target_marker.queue_free()
		_target_marker = null
	if job.is_empty():
		game.set_waypoint(Vector2.INF, "")
		return
	var stops: Array = job["stops"]
	var pos: Vector2 = stops[job["index"]]
	var kind: String = job["kind"]
	var text := "Checkpoint %d / %d" % [job["index"] + 1, stops.size()]
	if kind == "courier":
		text = "Drop-off %d / %d" % [job["index"] + 1, stops.size()]
	elif kind == "ride":
		text = "Pick up passenger" if not job["boarded"] else "Passenger's destination"
	_target_marker = beacon(KINDS[kind]["color"], text, 3.4 if kind == "trial" else 2.6)
	add_child(_target_marker)
	_place(_target_marker, pos)
	game.set_waypoint(pos, text)


func cancel(message := "Job cancelled") -> void:
	if job.is_empty():
		return
	job = {}
	if _passenger != null:
		_passenger.queue_free()
		_passenger = null
	_show_target()
	game.sound.play("fail")
	game.toast(message)


func on_crash(speed: float) -> void:
	if not job.is_empty() and job["kind"] == "ride" and job["boarded"]:
		job["comfort"] = maxf(20.0, job["comfort"] - speed * 2.2)


func objective() -> Dictionary:
	if job.is_empty():
		return {}
	var kind: String = job["kind"]
	var title: String = KINDS[kind]["title"]
	var stops: Array = job["stops"]
	var line := ""
	var clock := ""
	if kind == "courier":
		line = "Parcel %d of %d" % [job["index"] + 1, stops.size()]
		var left: float = job["limit"] - job["time"]
		clock = "%d:%02d left" % [int(left) / 60, int(left) % 60]
	elif kind == "ride":
		line = ("Passenger comfort %d%%" % int(job["comfort"])) if job["boarded"] else "Stop beside the passenger"
		clock = "%d:%02d" % [int(job["time"]) / 60, int(job["time"]) % 60]
	else:
		line = "Checkpoint %d of %d" % [job["index"] + 1, stops.size()]
		clock = "%d:%04.1f" % [int(job["time"]) / 60, fmod(job["time"], 60.0)]
	return {"title": title, "line": line, "clock": clock, "color": KINDS[kind]["color"]}


func update(delta: float, pos: Vector2, speed: float, in_vehicle: bool) -> void:
	_refresh -= delta
	if _refresh <= 0.0:
		_refresh = 2.0
		for o in offers.duplicate():
			if (o["pos"] as Vector2).distance_to(pos) > 900.0:
				offers.erase(o)
				(o["marker"] as Node).queue_free()
		if job.is_empty():
			for kind: String in KINDS:
				var have := false
				for o in offers:
					have = have or o["kind"] == kind
				if not have:
					_new_offer(kind, pos)
	for o in offers:
		(o["marker"] as Node3D).visible = job.is_empty()
	if job.is_empty():
		return
	job["time"] += delta
	var kind: String = job["kind"]
	var stops: Array = job["stops"]
	var target: Vector2 = stops[job["index"]]
	var dist := pos.distance_to(target)
	if kind == "courier" and job["time"] > job["limit"]:
		cancel("Out of time · the parcels went back to the depot")
		return
	var reached := false
	if kind == "trial":
		reached = dist < 9.0
	elif kind == "ride":
		reached = in_vehicle and dist < 8.0 and speed < 1.6
	else:
		reached = dist < 8.0 and speed < 6.0
	if not reached:
		return
	if kind == "ride" and not job["boarded"]:
		job["boarded"] = true
		job["time"] = 0.0
		if _passenger != null:
			_passenger.queue_free()
			_passenger = null
		game.sound.play("door_close")
	job["index"] += 1
	if job["index"] < stops.size():
		game.sound.play("chime", 1.0 + 0.05 * job["index"])
		_show_target()
		return
	_finish()


func _finish() -> void:
	var kind: String = job["kind"]
	var length: float = job["length"]
	var pay := 0
	var note := ""
	if kind == "courier":
		var left: float = job["limit"] - job["time"]
		pay = int(80.0 + length * 0.22 + left * 2.0)
		note = "Parcels delivered with %d s to spare" % int(left)
	elif kind == "ride":
		pay = int((35.0 + length * 0.3) * job["comfort"] / 100.0)
		note = "Fare complete · comfort %d%%" % int(job["comfort"])
	else:
		var t: float = job["time"]
		var medal := "Bronze"
		pay = 120
		if t < length / 15.0:
			medal = "Gold"
			pay = 450
		elif t < length / 11.5:
			medal = "Silver"
			pay = 260
		note = "%s · %d:%04.1f" % [medal, int(t) / 60, fmod(t, 60.0)]
		game.record_trial(t)
	job = {}
	_show_target()
	game.sound.play("chime", 1.3)
	game.add_money(pay, note)
	game.job_done(kind)
