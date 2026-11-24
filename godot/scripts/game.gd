extends Node3D
## Spindle City: main game controller. Loads a city, builds the world, and
## runs the play loop: walking, driving, traffic, jobs, GPS, saves and UI.

const SAVE_PATH := "user://save.cfg"
const PLACE_REWARD := 250

var data := CityData.new()
var world: Node3D
var builder: CityBuilder
var sky: Sky3D
var ui: GameUI
var sound: Sound
var player: Player
var rig: CameraRig
var traffic: Traffic
var peds: Pedestrians
var missions: Missions

var state := "loading"
var vehicle: Vehicle = null
var vehicles: Array[Vehicle] = []
var save := ConfigFile.new()
var city_id := "fall-river"
var money := 0
var owned: Array = ["model_y", "hatch"]
var found := {}
var stats := {"jobs": 0, "best_trial": 0.0, "distance": 0.0}
var waypoint := Vector2.INF
var waypoint_label := ""
var route := PackedVector2Array()
var route_mesh: MeshInstance3D
var auto_drive := false
var lights_override := -1
var look_sensitivity := 1.0
var invert_y := false
var place_markers: Array[Node3D] = []
var lamp_lights: Array[OmniLight3D] = []
var demo := false
var _slow_tick := 0.0
var _route_tick := 0.0
var _save_tick := 0.0
var _lamp_tick := 0.0
var _flip_time := 0.0
var _crash_cooldown := 0.0
var _last_pos := Vector2.ZERO
var _spawn_dir := Vector2.DOWN
var _fps_samples: Array[float] = []
var _auto_stuck := 0.0


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	demo = OS.get_cmdline_user_args().has("--demo") or OS.get_cmdline_user_args().has("--selftest")
	_setup_input()
	_load_save()
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--city="):
			city_id = arg.substr(7)
	if not data.load_city(city_id):
		return
	world = Node3D.new()
	world.process_mode = Node.PROCESS_MODE_PAUSABLE
	add_child(world)
	sky = Sky3D.new()
	sky.quality = str(save.get_value("settings", "quality", "high"))
	add_child(sky)
	sky.hour = float(save.get_value("progress", "hour", 9.5))
	rig = CameraRig.new()
	add_child(rig)
	sound = Sound.new()
	add_child(sound)
	ui = GameUI.new()
	add_child(ui)
	ui.build(data)
	ui.show_state("loading")
	ui.set_quality(sky.quality)
	ui.volume_slider.set_value_no_signal(float(save.get_value("settings", "volume", 0.8)))
	sound.set_volume(ui.volume_slider.value)
	look_sensitivity = float(save.get_value("settings", "sensitivity", 1.0))
	invert_y = bool(save.get_value("settings", "invert_y", false))
	ui.sensitivity_slider.set_value_no_signal(look_sensitivity)
	ui.set_invert_y(invert_y)
	_apply_quality(sky.quality)
	ui.play_pressed.connect(_on_play)
	ui.resume_pressed.connect(func() -> void: set_state("playing"))
	ui.quality_changed.connect(_on_quality)
	ui.volume_changed.connect(func(v: float) -> void:
		sound.set_volume(v)
		save.set_value("settings", "volume", v))
	ui.sensitivity_changed.connect(func(v: float) -> void:
		look_sensitivity = v
		save.set_value("settings", "sensitivity", v))
	ui.invert_y_changed.connect(func(inv: bool) -> void:
		invert_y = inv
		save.set_value("settings", "invert_y", inv))
	ui.city_chosen.connect(_switch_city)
	ui.car_requested.connect(_on_car_requested)
	ui.waypoint_set.connect(func(pos: Vector2, label: String) -> void:
		set_waypoint(pos, label)
		ui.bigmap.route = route
		ui.bigmap.queue_redraw())
	ui.fast_travel.connect(_fast_travel)
	ui.shortcut.connect(_shortcut)
	ui.time_skip.connect(func() -> void: sky.hour = fposmod(sky.hour + 6.0, 24.0))
	ui.quit_pressed.connect(_quit)
	var spawn: Vector2 = data.safe_point(data.config["spawn"])
	if str(data.config["spawn_place"]) != "":
		for p in data.places:
			if p["name"] == data.config["spawn_place"]:
				spawn = p["pos"]
	var road := data.nearest_road(spawn, true)
	var road_point: Vector2 = road["p"]
	_spawn_dir = road["dir"]
	var road_width: float = data.roads[road["road"]]["width"]
	var right := Vector2(-_spawn_dir.y, _spawn_dir.x)
	rig.cam.global_position = Vector3(road_point.x, 30.0, road_point.y)
	sky.update(0.0, rig.cam.global_position)
	await get_tree().process_frame
	builder = CityBuilder.new()
	world.add_child(builder)
	await builder.build(data, func(f: float, label: String) -> void: ui.set_loading(f * 0.9, label))
	ui.set_loading(0.92, "Drawing the map")
	await get_tree().process_frame
	ui.bigmap.bake()
	ui.set_loading(0.96, "Waking the city")
	await get_tree().process_frame
	player = Player.new()
	world.add_child(player)
	var start: Vector2 = data.safe_point(road_point + right * (road_width * 0.5 + 1.4))
	if save.has_section_key("city_" + city_id, "pos"):
		var saved_pos: Vector2 = save.get_value("city_" + city_id, "pos")
		if not data.blocked(saved_pos):
			start = saved_pos
	player.teleport(start)
	player.face(_spawn_dir)
	rig.face(_spawn_dir)
	var starter := _spawn_vehicle("model_y", Color(0.93, 0.93, 0.9), road_point + right * (road_width * 0.5 - 1.2) + _spawn_dir * 5.0, _spawn_dir)
	starter.set_meta("owned", true)
	if start.distance_to(starter.map_pos()) > 60.0:
		_deliver(starter, start)
	traffic = Traffic.new()
	world.add_child(traffic)
	traffic.setup(data)
	traffic.populate(start)
	peds = Pedestrians.new()
	world.add_child(peds)
	peds.setup(data)
	peds.populate(start)
	missions = Missions.new()
	world.add_child(missions)
	missions.setup(self, data)
	for p in data.places:
		var marker := Missions.beacon(GameUI.GOLD, p["name"], 1.5)
		world.add_child(marker)
		marker.position = Vector3(p["pos"].x, 0, p["pos"].y)
		place_markers.append(marker)
	for i in 8:
		var lamp := OmniLight3D.new()
		lamp.omni_range = 17.0
		lamp.light_color = Color(1.0, 0.8, 0.52)
		lamp.shadow_enabled = false
		lamp.visible = false
		add_child(lamp)
		lamp_lights.append(lamp)
	route_mesh = MeshInstance3D.new()
	route_mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(route_mesh)
	ui.set_places(data.places, found)
	ui.set_money(money)
	_last_pos = start
	rig.update(0.016, player, null)
	state = "menu"
	ui.show_state("menu")
	ui.set_ready()
	if OS.get_cmdline_user_args().has("--selftest"):
		_run_selftest()
	elif demo:
		_run_demo()


func _exit_tree() -> void:
	CarVisual.clear_cache()


func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT and state == "playing" and not demo:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


# ---------------------------------------------------------------- input

func _act(action: String, keys: Array, buttons: Array = [], axes: Array = [], deadzone := 0.2) -> void:
	if InputMap.has_action(action):
		InputMap.erase_action(action)
	InputMap.add_action(action, deadzone)
	for k: int in keys:
		var e := InputEventKey.new()
		e.physical_keycode = k as Key
		InputMap.action_add_event(action, e)
	for b: int in buttons:
		var e := InputEventJoypadButton.new()
		e.button_index = b as JoyButton
		InputMap.action_add_event(action, e)
	for a: Array in axes:
		var e := InputEventJoypadMotion.new()
		e.axis = a[0] as JoyAxis
		e.axis_value = a[1]
		InputMap.action_add_event(action, e)


func _setup_input() -> void:
	_act("move_forward", [KEY_W, KEY_UP], [], [[JOY_AXIS_LEFT_Y, -1.0]], 0.12)
	_act("move_back", [KEY_S, KEY_DOWN], [], [[JOY_AXIS_LEFT_Y, 1.0]], 0.12)
	_act("move_left", [KEY_A, KEY_LEFT], [], [[JOY_AXIS_LEFT_X, -1.0]], 0.12)
	_act("move_right", [KEY_D, KEY_RIGHT], [], [[JOY_AXIS_LEFT_X, 1.0]], 0.12)
	_act("look_left", [], [], [[JOY_AXIS_RIGHT_X, -1.0]], 0.14)
	_act("look_right", [], [], [[JOY_AXIS_RIGHT_X, 1.0]], 0.14)
	_act("look_up", [], [], [[JOY_AXIS_RIGHT_Y, -1.0]], 0.14)
	_act("look_down", [], [], [[JOY_AXIS_RIGHT_Y, 1.0]], 0.14)
	_act("gas", [KEY_W, KEY_UP], [], [[JOY_AXIS_TRIGGER_RIGHT, 1.0]], 0.06)
	_act("reverse", [KEY_S, KEY_DOWN], [], [[JOY_AXIS_TRIGGER_LEFT, 1.0]], 0.06)
	_act("sprint", [KEY_SHIFT], [JOY_BUTTON_LEFT_STICK])
	_act("handbrake", [KEY_SPACE], [JOY_BUTTON_B])
	_act("interact", [KEY_E], [JOY_BUTTON_A])
	_act("view", [KEY_V], [JOY_BUTTON_X])
	_act("map", [KEY_M], [JOY_BUTTON_Y])
	_act("pause", [KEY_ESCAPE], [JOY_BUTTON_START])
	_act("horn", [KEY_H], [JOY_BUTTON_RIGHT_SHOULDER])
	_act("lights", [KEY_L], [JOY_BUTTON_DPAD_UP])
	_act("reset_car", [KEY_R], [JOY_BUTTON_DPAD_DOWN])
	_act("auto_drive", [KEY_F], [JOY_BUTTON_LEFT_SHOULDER])
	_act("cinematic", [KEY_C])


func _unhandled_input(event: InputEvent) -> void:
	if state != "playing":
		return
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		var mm := event as InputEventMouseMotion
		var y_sign := -1.0 if invert_y else 1.0
		rig.look(mm.relative.x * 0.003 * look_sensitivity, mm.relative.y * 0.0024 * look_sensitivity * y_sign)
	elif event is InputEventMouseButton:
		var mb := event as InputEventMouseButton
		if mb.pressed and mb.button_index == MOUSE_BUTTON_WHEEL_UP:
			rig.distance = maxf(2.6, rig.distance - 0.5)
		elif mb.pressed and mb.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			rig.distance = minf(13.0, rig.distance + 0.5)
		elif mb.pressed and mb.button_index == MOUSE_BUTTON_LEFT and not demo:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


# ---------------------------------------------------------------- state

func set_state(next: String) -> void:
	state = next
	get_tree().paused = next != "playing"
	ui.show_state(next)
	if next == "playing":
		if not demo:
			Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
	else:
		Input.mouse_mode = Input.MOUSE_MODE_VISIBLE
		sound.set_horn(false)
	sound.set_paused(next != "playing")
	if next == "paused":
		ui.set_garage(owned, money)
		ui.stats_label.text = "Jobs done %d · Places found %d of %d · %.1f miles travelled" % [stats["jobs"], found.size(), data.places.size(), float(stats["distance"]) / 1609.0]
		_write_save()
	elif next == "map":
		_refresh_markers()
		ui.bigmap.player = current_pos()
		ui.bigmap.heading = current_heading()
		ui.bigmap.route = route


func _on_play() -> void:
	set_state("playing")
	toast("Welcome to %s · find the %d landmarks, or take a job at a coloured beacon" % [data.config["name"], data.places.size()])


func _on_quality(q: String) -> void:
	sky.set_quality(q)
	_apply_quality(q)
	save.set_value("settings", "quality", q)


func _apply_quality(q: String) -> void:
	var vp := get_viewport()
	vp.scaling_3d_scale = 1.0 if q == "high" else 0.72
	vp.msaa_3d = Viewport.MSAA_2X if q == "high" else Viewport.MSAA_DISABLED


func _switch_city(id: String) -> void:
	_write_save()
	save.set_value("settings", "city", id)
	save.save(SAVE_PATH)
	get_tree().paused = false
	get_tree().reload_current_scene()


func _quit() -> void:
	_write_save()
	get_tree().quit()


func toast(text: String) -> void:
	ui.toast(text)


# ---------------------------------------------------------------- saves

func _load_save() -> void:
	save.load(SAVE_PATH)
	city_id = str(save.get_value("settings", "city", "fall-river"))
	money = int(save.get_value("progress", "money", 0))
	owned = save.get_value("progress", "owned", ["model_y", "hatch"])
	stats = save.get_value("progress", "stats", stats)
	for name: String in save.get_value("city_" + city_id, "found", []):
		found[name] = true


func _write_save() -> void:
	if player == null:
		return
	save.set_value("settings", "city", city_id)
	save.set_value("progress", "money", money)
	save.set_value("progress", "owned", owned)
	save.set_value("progress", "stats", stats)
	save.set_value("progress", "hour", sky.hour)
	save.set_value("city_" + city_id, "found", found.keys())
	save.set_value("city_" + city_id, "pos", current_pos())
	if not demo:
		save.save(SAVE_PATH)


func add_money(amount: int, note: String) -> void:
	money += amount
	ui.set_money(money)
	toast("%s · +$%d" % [note, amount])
	_write_save()


func job_done(_kind: String) -> void:
	stats["jobs"] = int(stats["jobs"]) + 1


func record_trial(time: float) -> void:
	if float(stats["best_trial"]) <= 0.0 or time < float(stats["best_trial"]):
		stats["best_trial"] = time


# ---------------------------------------------------------------- helpers

func current_pos() -> Vector2:
	return vehicle.map_pos() if vehicle != null else player.map_pos()


func current_heading() -> Vector2:
	if vehicle != null:
		return vehicle.heading_dir()
	var f := rig.forward_dir()
	return Vector2(f.x, f.z)


func _spawn_vehicle(type: String, color: Color, pos: Vector2, dir: Vector2) -> Vehicle:
	var v := Vehicle.create(type, color)
	world.add_child(v)
	v.place(pos, dir)
	v.crashed.connect(_on_crash.bind(v))
	vehicles.append(v)
	return v


func _deliver(v: Vehicle, near: Vector2) -> void:
	var road := data.nearest_road(near, true)
	if road["road"] < 0:
		return
	var dir: Vector2 = road["dir"]
	var right := Vector2(-dir.y, dir.x)
	var width: float = data.roads[road["road"]]["width"]
	var spot: Vector2 = road["p"] + right * (width * 0.5 - 1.2)
	if spot.distance_to(near) < 3.0:
		spot += dir * 6.0
	v.place(spot, dir)


func _on_car_requested(type: String) -> void:
	var spec: Dictionary = CarVisual.SPECS[type]
	if not owned.has(type):
		if money < int(spec["price"]):
			return
		money -= int(spec["price"])
		owned.append(type)
		ui.set_money(money)
	var car: Vehicle = null
	for v in vehicles:
		if v.type == type and v.has_meta("owned") and v != vehicle:
			car = v
	if car == null:
		var color: Color = Color(0.93, 0.93, 0.9) if type == "model_y" else CarVisual.PAINTS[randi() % CarVisual.PAINTS.size()]
		car = _spawn_vehicle(type, color, current_pos(), current_heading())
		car.set_meta("owned", true)
	_deliver(car, current_pos())
	_write_save()
	set_state("playing")
	toast("%s delivered · look for it at the curb" % spec["name"])


func _fast_travel(pos: Vector2, label: String) -> void:
	auto_drive = false
	var road := data.nearest_road(pos, true)
	var spot: Vector2 = data.safe_point(road["p"] if road["road"] >= 0 else pos)
	if vehicle != null:
		vehicle.place(spot, road["dir"])
	else:
		player.teleport(spot)
	rig.face(road["dir"])
	rig.snap()
	traffic.populate(spot)
	peds.populate(spot)
	set_state("playing")
	toast("Fast travel · " + label)


func _shortcut(kind: String) -> void:
	if kind == "home":
		_fast_travel(data.safe_point(data.config["spawn"]), "Back downtown")
		return
	# Highway access: put the player in a car on the mapped highway.
	for r in data.roads:
		if r["type"] == "motorway" and r["length"] > 150.0 and not r["tunnel"] and not r["bridge"]:
			var p: PackedVector2Array = r["p"]
			var i: int = p.size() / 2
			var dir := (p[mini(i + 1, p.size() - 1)] - p[maxi(i - 1, 0)]).normalized()
			if vehicle == null:
				var car: Vehicle = null
				for v in vehicles:
					if v.has_meta("owned"):
						car = v
				if car == null:
					car = vehicles[0]
				_enter(car)
			vehicle.place(p[i], dir)
			rig.face(dir)
			rig.snap()
			traffic.populate(p[i])
			set_state("playing")
			toast("%s · in your car" % data.config["highway_label"])
			return
	toast("No mapped highway access in this extract.")


func set_waypoint(pos: Vector2, label: String) -> void:
	waypoint = pos
	waypoint_label = label
	if pos == Vector2.INF:
		auto_drive = false
	_reroute()


func _reroute() -> void:
	if waypoint == Vector2.INF:
		route = PackedVector2Array()
		route_mesh.mesh = null
		ui.gps_label.text = ""
		return
	route = data.find_route(current_pos(), waypoint)
	var mesh := ArrayMesh.new()
	if route.size() > 1:
		var buf := CityBuilder.Buf.new()
		builder._ribbon(buf, route, 0.55, 0.012)
		var mat := StandardMaterial3D.new()
		mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mat.albedo_color = Color(0.77, 0.96, 0.47, 0.42)
		buf.commit(mesh, mat)
	route_mesh.mesh = mesh
	var meters := CityData.path_length(route) if route.size() > 1 else current_pos().distance_to(waypoint)
	ui.gps_label.text = "GPS · %s · %.1f mi" % [waypoint_label, meters / 1609.0]


func _refresh_markers() -> void:
	var markers: Array = []
	for p in data.places:
		markers.append({"pos": p["pos"], "color": GameUI.LIME if found.has(p["name"]) else GameUI.GOLD, "label": p["name"]})
	if missions.job.is_empty():
		for o in missions.offers:
			markers.append({"pos": o["pos"], "color": Missions.KINDS[o["kind"]]["color"], "label": Missions.KINDS[o["kind"]]["title"]})
	if waypoint != Vector2.INF:
		markers.append({"pos": waypoint, "color": Color.WHITE, "label": waypoint_label})
	ui.bigmap.markers = markers
	var mini: Array = []
	for m: Dictionary in markers:
		mini.append({"pos": m["pos"], "color": m["color"]})
	ui.minimap.markers = mini


# ---------------------------------------------------------------- vehicles

func _enter(v: Vehicle) -> void:
	vehicle = v
	v.driver = "player"
	v.freeze = false
	player.set_active(false)
	rig.face(v.heading_dir())
	sound.play("door_open")
	toast("%s · W/S drive · A/D steer · Space handbrake · E exit" % v.spec["name"])


func _exit_vehicle() -> void:
	if absf(vehicle.forward_speed) > 4.0:
		toast("Slow down before stepping out.")
		return
	var b := vehicle.global_transform.basis
	var here := vehicle.map_pos()
	var spot := Vector2.INF
	for side: float in [1.0, -1.0]:
		var q := here + Vector2(b.x.x, b.x.z).normalized() * side * 1.9
		if not data.blocked(q) and traffic.nearest(q, 2.2).is_empty():
			spot = q
			break
	if spot == Vector2.INF:
		toast("Find a clear space to step out.")
		return
	auto_drive = false
	vehicle.driver = ""
	vehicle.throttle = 0.0
	vehicle.steer_input = 0.0
	vehicle.handbrake = false
	vehicle = null
	player.set_active(true)
	player.teleport(spot)
	sound.play("door_close")
	sound.set_horn(false)


func _take_traffic_car(car: Dictionary) -> void:
	var body: Node3D = car["body"]
	var t := body.global_transform
	var d: Vector2 = car["dir"]
	var v := _spawn_vehicle(car["type"], car["color"], Vector2(t.origin.x, t.origin.z), d)
	traffic.remove(car)
	_enter(v)
	# Keep the world tidy: drop the oldest abandoned car that is not the player's own.
	var extras: Array[Vehicle] = []
	for other in vehicles:
		if other != v and not other.has_meta("owned"):
			extras.append(other)
	while extras.size() > 3:
		var old: Vehicle = extras.pop_front()
		vehicles.erase(old)
		old.queue_free()


func _interact() -> void:
	if vehicle != null:
		_exit_vehicle()
		return
	var pos := player.map_pos()
	var best: Vehicle = null
	var best_d := 4.4
	for v in vehicles:
		var d := v.map_pos().distance_to(pos)
		if d < best_d:
			best_d = d
			best = v
	if best != null:
		_enter(best)
		return
	var car := traffic.nearest(pos, 4.6, 2.5)
	if not car.is_empty():
		_take_traffic_car(car)
		return
	var offer := missions.offer_at(pos)
	if not offer.is_empty():
		missions.start(offer)
		return
	for p in data.places:
		if (p["pos"] as Vector2).distance_to(pos) < 22.0:
			toast("%s — %s" % [p["name"], p["desc"]])
			return
	toast("Follow a beacon or open the map (M) to choose a destination.")


func _on_crash(speed: float, v: Vehicle) -> void:
	if v != vehicle or _crash_cooldown > 0.0:
		return
	_crash_cooldown = 0.35
	sound.play("crash", clampf(1.25 - speed * 0.02, 0.7, 1.25), clampf(speed / 16.0, 0.25, 1.0))
	rig.add_shake(clampf(speed * 0.02, 0.05, 0.5))
	missions.on_crash(speed)
	if speed > 12.0:
		toast("Hard hit · %d MPH" % int(speed * 2.237))


func _reset_vehicle() -> void:
	var road := data.nearest_road(vehicle.map_pos(), true)
	if road["road"] < 0:
		return
	var dir: Vector2 = road["dir"]
	if dir.dot(vehicle.heading_dir()) < 0.0 and not data.roads[road["road"]]["oneway"]:
		dir = -dir
	vehicle.place(road["p"], dir)
	rig.snap()
	toast("Car reset onto %s" % (data.roads[road["road"]]["name"] if data.roads[road["road"]]["name"] != "" else "the road"))


func left_to_go(pos: Vector2) -> float:
	return pos.distance_to(route[route.size() - 1]) if route.size() > 0 else 0.0


func _drive_auto() -> void:
	if route.size() < 2:
		auto_drive = false
		return
	var pos := vehicle.map_pos()
	var speed := absf(vehicle.forward_speed)
	# Closest point on the route, then a target a little further along it.
	var best := 0
	var best_d := INF
	for i in mini(route.size(), 400):
		var d := route[i].distance_squared_to(pos)
		if d < best_d:
			best_d = d
			best = i
	var look := 7.0 + speed * 0.75
	var target := route[route.size() - 1]
	var walked := 0.0
	var turn := 0.0
	var first_dir := Vector2.ZERO
	for i in range(best, route.size() - 1):
		var seg := route[i + 1] - route[i]
		if first_dir == Vector2.ZERO and seg.length() > 0.5:
			first_dir = seg.normalized()
		elif seg.length() > 0.5 and walked < 12.0 + speed * 2.0:
			turn = maxf(turn, absf(first_dir.angle_to(seg.normalized())))
		walked += seg.length()
		if walked >= look and target == route[route.size() - 1]:
			target = route[i + 1]
		if walked > 60.0:
			break
	var near := data.nearest_road(pos, true, false, 1)
	# Keep to the right-hand lane on two-way streets, like the traffic does.
	var lane := data.nearest_road(target, true, false, 1)
	if lane["road"] >= 0 and not data.roads[lane["road"]]["oneway"] and left_to_go(pos) > 18.0:
		var along: Vector2 = lane["dir"]
		if along.dot(vehicle.heading_dir()) < 0.0:
			along = -along
		target += Vector2(-along.y, along.x) * float(data.roads[lane["road"]]["width"]) * 0.21
	var want := data.speed_limit(near["road"]) * clampf(1.0 - turn * 0.75, 0.28, 1.0)
	var gap := traffic.gap_ahead(pos, vehicle.heading_dir(), 9.0 + speed * 1.8)
	if gap < INF:
		want = minf(want, maxf(0.0, (gap - 7.5) * 0.7))
	var left := pos.distance_to(route[route.size() - 1])
	if left < 30.0:
		want = minf(want, 2.0 + left * 0.3)
	vehicle.drive_toward(target, want)
	# Wedged against something: back up briefly, then try again.
	if speed < 0.4 and want > 1.0:
		_auto_stuck += get_process_delta_time()
	elif speed > 1.5:
		_auto_stuck = 0.0
	if _auto_stuck > 3.0 and _auto_stuck < 5.2:
		vehicle.throttle = -0.7
		vehicle.brake_input = 0.0
		vehicle.steer_input = -vehicle.steer_input
		_auto_stuck += get_process_delta_time()
	elif _auto_stuck >= 5.2 and _auto_stuck < 14.0:
		pass
	elif _auto_stuck >= 14.0:
		_auto_stuck = 0.0
		auto_drive = false
		vehicle.throttle = 0.0
		toast("Auto drive stopped · the way is blocked")
		return
	if left < 9.0:
		auto_drive = false
		vehicle.throttle = 0.0
		vehicle.brake_input = 1.0
		toast("Arrived · " + waypoint_label)


# ---------------------------------------------------------------- play loop

func _process(delta: float) -> void:
	if state == "loading" or player == null:
		return
	if state == "playing":
		_play(delta)
	elif Input.is_action_just_pressed("pause") or Input.is_action_just_pressed("ui_cancel") or (state == "map" and Input.is_action_just_pressed("map")):
		if state == "paused" or state == "map":
			set_state("playing")
	if state == "map":
		var pan_vec := Input.get_vector("look_left", "look_right", "look_up", "look_down")
		if pan_vec.length() > 0.05:
			ui.bigmap.pan_by(pan_vec * 520.0 * delta)
		var zoom_in := Input.get_action_strength("gas") if Input.get_connected_joypads().size() > 0 and not Input.is_key_pressed(KEY_W) and not Input.is_key_pressed(KEY_UP) else 0.0
		var zoom_out := Input.get_action_strength("reverse") if Input.get_connected_joypads().size() > 0 and not Input.is_key_pressed(KEY_S) and not Input.is_key_pressed(KEY_DOWN) else 0.0
		if zoom_in > 0.1 or zoom_out > 0.1:
			ui.bigmap.zoom_by(1.0 + (zoom_in - zoom_out) * 1.4 * delta)
		ui.bigmap.queue_redraw()


func _play(delta: float) -> void:
	if Input.is_action_just_pressed("pause"):
		set_state("paused")
		return
	if Input.is_action_just_pressed("map"):
		set_state("map")
		return
	if Input.is_action_just_pressed("view"):
		rig.first_person = not rig.first_person
		rig.snap()
		toast("First-person view" if rig.first_person else "Third-person view")
	if Input.is_action_just_pressed("cinematic"):
		ui.hud.visible = not ui.hud.visible
	if Input.is_action_just_pressed("interact"):
		_interact()
	var look := Input.get_vector("look_left", "look_right", "look_up", "look_down")
	if look.length() > 0.01:
		var curved := look.normalized() * pow(minf(look.length(), 1.0), 1.5)
		var y_sign := -1.0 if invert_y else 1.0
		rig.look(curved.x * 2.8 * look_sensitivity * delta, curved.y * 1.8 * look_sensitivity * y_sign * delta)
	_crash_cooldown = maxf(0.0, _crash_cooldown - delta)
	if vehicle != null:
		var gas := Input.get_action_strength("gas")
		var rev := Input.get_action_strength("reverse")
		var raw_steer := Input.get_action_strength("move_left") - Input.get_action_strength("move_right")
		var steer := signf(raw_steer) * pow(absf(raw_steer), 1.45)
		var hand := Input.is_action_pressed("handbrake")
		if Input.is_action_just_pressed("auto_drive"):
			if auto_drive:
				auto_drive = false
				toast("Auto drive cancelled")
			elif waypoint == Vector2.INF:
				toast("Set a GPS destination on the map (M) first.")
			else:
				auto_drive = true
				toast("Auto drive to %s · steer or brake to take over" % waypoint_label)
		if auto_drive and (gas > 0.15 or rev > 0.15 or absf(steer) > 0.2 or hand):
			auto_drive = false
			toast("Auto drive cancelled · manual control")
		if auto_drive:
			_drive_auto()
		else:
			if rev > 0.05 and vehicle.forward_speed > 0.5:
				vehicle.throttle = 0.0
				vehicle.brake_input = rev
			else:
				vehicle.throttle = gas - rev
				vehicle.brake_input = 0.0
			vehicle.steer_input = steer
			vehicle.handbrake = hand
		vehicle.wetness = sky.wetness
		if Input.is_action_just_pressed("lights"):
			lights_override = 0 if vehicle.lights_on else 1
		vehicle.lights_on = lights_override == 1 or (lights_override == -1 and (sky.night > 0.35 or sky.weather == "rain"))
		sound.set_horn(Input.is_action_pressed("horn"))
		if Input.is_action_just_pressed("reset_car"):
			_reset_vehicle()
		_flip_time = _flip_time + delta if vehicle.is_upside_down() else 0.0
		if _flip_time > 2.5:
			_flip_time = 0.0
			_reset_vehicle()
	else:
		var v := Input.get_vector("move_left", "move_right", "move_forward", "move_back")
		player.input_dir = rig.forward_dir() * -v.y + rig.right_dir() * v.x
		player.want_run = Input.is_action_pressed("sprint")
		if Input.is_action_just_pressed("handbrake"):
			player.want_jump = true
		player.model.visible = not rig.first_person
	var pos := current_pos()
	stats["distance"] = float(stats["distance"]) + pos.distance_to(_last_pos)
	_last_pos = pos
	var view := rig.forward_dir()
	var obstacles: Array = []
	var threats: Array = []
	if vehicle == null:
		obstacles.append({"pos": pos, "radius": 0.5})
	for v in vehicles:
		obstacles.append({"pos": v.map_pos(), "radius": 2.3})
		if v.linear_velocity.length() > 2.5:
			threats.append({"pos": v.map_pos(), "vel": Vector2(v.linear_velocity.x, v.linear_velocity.z)})
	traffic.night = sky.night > 0.35
	traffic.update(delta, pos, Vector2(view.x, view.z), obstacles)
	peds.update(delta, pos, threats)
	var speed := absf(vehicle.forward_speed) if vehicle != null else 0.0
	missions.update(delta, pos, speed, vehicle != null)
	rig.update(delta, player, vehicle)
	sky.update(delta, rig.cam.global_position)
	var near_car := traffic.nearest(pos, 30.0)
	sound.update(delta, vehicle, player, sky.wetness, sky.weather == "rain", (near_car["pos"] as Vector2).distance_to(pos) if not near_car.is_empty() else 99.0, rig.first_person)
	_update_hud(delta, pos, speed)
	_slow_tick -= delta
	if _slow_tick <= 0.0:
		_slow_tick = 0.25
		_slow_update(pos)
	_route_tick -= delta
	if _route_tick <= 0.0 and waypoint != Vector2.INF:
		_route_tick = 1.5
		if pos.distance_to(waypoint) < 12.0 and missions.job.is_empty():
			toast("Arrived · " + waypoint_label)
			set_waypoint(Vector2.INF, "")
		else:
			_reroute()
	_save_tick -= delta
	if _save_tick <= 0.0:
		_save_tick = 20.0
		_write_save()
	_lamp_tick -= delta
	if _lamp_tick <= 0.0:
		_lamp_tick = 0.5
		_update_lamps()
	for i in place_markers.size():
		place_markers[i].rotation.y += delta * 0.6


func _slow_update(pos: Vector2) -> void:
	if data.in_water(pos):
		var road := data.nearest_road(pos, true, false, 60)
		var spot: Vector2 = data.safe_point(road["p"])
		if road["road"] < 0 or data.in_water(spot):
			spot = data.safe_point(data.config["spawn"])
		sound.play("splash")
		if vehicle != null:
			vehicle.place(spot, road["dir"])
		else:
			player.teleport(spot)
		rig.snap()
		toast("Fished out of the water and set back on dry land.")
		return
	var named := data.nearest_road(pos, false, true, 2)
	ui.street_label.text = data.roads[named["road"]]["name"] if named["road"] >= 0 and named["d"] < 60.0 else str(data.config["name"])
	for i in data.places.size():
		var p := data.places[i]
		if not found.has(p["name"]) and (p["pos"] as Vector2).distance_to(pos) < 20.0:
			found[p["name"]] = true
			ui.set_places(data.places, found)
			sound.play("chime", 0.9)
			if found.size() == data.places.size():
				add_money(PLACE_REWARD * 4, "Every landmark discovered")
			else:
				add_money(PLACE_REWARD, "%s discovered · %d / %d" % [p["name"], found.size(), data.places.size()])
	var prompt := ""
	if vehicle != null:
		prompt = "E · Step out" if absf(vehicle.forward_speed) < 4.0 else ""
	else:
		for v in vehicles:
			if v.map_pos().distance_to(pos) < 4.4:
				prompt = "E · Drive the %s" % v.spec["name"]
		if prompt == "" and not traffic.nearest(pos, 4.6, 2.5).is_empty():
			prompt = "E · Take this car"
		var offer := missions.offer_at(pos)
		if prompt == "" and not offer.is_empty():
			prompt = "E · Start %s" % Missions.KINDS[offer["kind"]]["title"].to_lower()
		if prompt == "":
			for p in data.places:
				if (p["pos"] as Vector2).distance_to(pos) < 22.0:
					prompt = "E · " + str(p["name"])
	ui.set_prompt(prompt)
	_refresh_markers()
	var cars: Array = []
	for c in traffic.cars:
		cars.append(c["pos"])
	ui.minimap.cars = cars


func _update_hud(_delta: float, pos: Vector2, speed: float) -> void:
	ui.minimap.center = pos
	ui.minimap.heading = current_heading()
	ui.minimap.route = route
	ui.minimap.span = 260.0 + clampf(speed * 6.0, 0.0, 260.0)
	ui.minimap.queue_redraw()
	if vehicle != null:
		ui.speed_label.text = str(int(round(speed * 2.237)))
		ui.unit_label.text = "MPH · AUTO" if auto_drive else "MPH"
		ui.mode_label.text = "DRIVING · " + str(vehicle.spec["name"]).to_upper()
	else:
		ui.speed_label.text = ""
		ui.unit_label.text = "RUNNING" if player.running else ("WALKING" if player.moving else "EXPLORING")
		ui.mode_label.text = "FIRST PERSON" if rig.first_person else "ON FOOT"
	ui.clock_label.text = sky.clock_text()
	ui.weather_label.text = sky.weather.to_upper()
	ui.set_job(missions.objective())


func _update_lamps() -> void:
	var on := sky.night > 0.3
	if not on:
		for lamp in lamp_lights:
			lamp.visible = false
		return
	var cam := rig.cam.global_position + rig.forward_dir() * 14.0
	var picks: Array = []
	for p in builder.lamp_positions:
		var d := Vector2(p.x - cam.x, p.z - cam.z).length_squared()
		if d < 4900.0:
			picks.append([d, p])
	picks.sort_custom(func(a: Array, b: Array) -> bool: return a[0] < b[0])
	for i in lamp_lights.size():
		var lamp := lamp_lights[i]
		lamp.visible = i < picks.size()
		if lamp.visible:
			lamp.global_position = picks[i][1] + Vector3(0, -0.4, 0)
			lamp.light_energy = sky.night * 3.0


# ---------------------------------------------------------------- demo / smoke test

func _wait(seconds: float) -> void:
	await get_tree().create_timer(seconds, true, false, true).timeout


func _shot(name: String) -> void:
	await get_tree().process_frame
	await get_tree().process_frame
	get_viewport().get_texture().get_image().save_png("user://demo_%s.png" % name)
	print("shot %s fps=%d pos=%s speed=%.1f state=%s" % [name, Engine.get_frames_per_second(), current_pos(), vehicle.forward_speed if vehicle != null else 0.0, state])


## `--demo`: plays through the main features unattended, saving screenshots.
func _run_demo() -> void:
	await _wait(0.5)
	_on_play()
	player.input_dir = Vector3(_spawn_dir.x, 0, _spawn_dir.y)
	await _wait(2.5)
	await _shot("01_foot")
	player.input_dir = Vector3.ZERO
	_enter(vehicles[0])
	await _wait(1.5)
	await _shot("02_car")
	set_waypoint(data.places[2]["pos"], data.places[2]["name"])
	print("route points ", route.size(), " length ", CityData.path_length(route))
	auto_drive = true
	await _wait(14.0)
	await _shot("03_drive")
	rig.first_person = true
	await _wait(1.0)
	await _shot("04_first_person")
	rig.first_person = false
	sky.hour = 21.5
	await _wait(5.0)
	await _shot("05_night")
	sky.hour = 14.0
	sky.set_weather("rain")
	sky.wetness = 1.0
	await _wait(4.0)
	await _shot("06_rain")
	sky.set_weather("clear")
	sky.wetness = 0.0
	auto_drive = false
	vehicle.throttle = 0.0
	vehicle.brake_input = 1.0
	await _wait(3.0)
	if not missions.offers.is_empty():
		missions.start(missions.offers[0])
		await _wait(1.0)
		await _shot("07_job")
	set_state("map")
	await _wait(0.5)
	await _shot("08_map")
	set_state("paused")
	await _wait(0.5)
	await _shot("09_pause")
	print("traffic ", traffic.cars.size(), " peds ", peds.people.size(), " vehicles ", vehicles.size(), " money ", money)
	get_tree().quit()


# ---------------------------------------------------------------- self test

var _fails := 0

func _check(label: String, ok: bool, detail := "") -> void:
	print(("PASS  " if ok else "FAIL  ") + label + ("  " + detail if detail != "" else ""))
	if not ok:
		_fails += 1


## `--selftest`: exercises the main gameplay paths without a human and prints
## PASS / FAIL lines. Runs headless: godot --headless --fixed-fps 60 --path . -- --selftest
func _run_selftest() -> void:
	await _wait(0.3)
	_on_play()
	_check("city loaded", data.roads.size() > 500 and data.buildings.size() > 1000, "%d roads, %d buildings" % [data.roads.size(), data.buildings.size()])
	_check("landmarks resolved", data.places.size() == 7, str(data.places.size()))
	_check("traffic and pedestrians spawned", traffic.cars.size() > 20 and peds.people.size() > 8, "%d cars, %d people" % [traffic.cars.size(), peds.people.size()])
	var p0 := player.map_pos()
	rig.face(_spawn_dir)
	Input.action_press("move_forward")
	Input.action_press("sprint")
	await _wait(3.0)
	Input.action_release("move_forward")
	Input.action_release("sprint")
	_check("running on foot moves the player", player.map_pos().distance_to(p0) > 8.0, "%.1f m in 3 s" % player.map_pos().distance_to(p0))
	var starter := vehicles[0]
	player.teleport(starter.map_pos() + Vector2(2.6, 0.0))
	await _wait(0.4)
	_interact()
	_check("E enters the nearby car", vehicle == starter)
	var dest: Vector2 = data.places[3]["pos"]
	var dest_name: String = data.places[3]["name"]
	for p in data.places:
		var d := (p["pos"] as Vector2).distance_to(vehicle.map_pos())
		if d > 250.0 and d < 700.0:
			dest = p["pos"]
			dest_name = p["name"]
	set_waypoint(dest, dest_name)
	var length := CityData.path_length(route)
	_check("GPS route found", route.size() > 2, "%.0f m, %d points" % [length, route.size()])
	auto_drive = true
	var t := 0.0
	var top := 0.0
	var stuck := 0.0
	while auto_drive and t < 260.0:
		await _wait(0.5)
		t += 0.5
		top = maxf(top, vehicle.forward_speed)
		if int(t * 2.0) % 60 == 0:
			print("  t=%.0f pos=%s speed=%.1f left=%.0f route=%d dest=%s" % [t, vehicle.map_pos(), vehicle.forward_speed, left_to_go(vehicle.map_pos()), route.size(), dest_name])
		stuck = stuck + 0.5 if absf(vehicle.forward_speed) < 0.3 else 0.0
		if stuck > 25.0:
			var np := traffic.nearest(vehicle.map_pos(), 30.0)
			print("  stuck at ", vehicle.map_pos(), " heading ", vehicle.heading_dir(), " throttle ", vehicle.throttle, " brake ", vehicle.brake_input,
				" gap ", traffic.gap_ahead(vehicle.map_pos(), vehicle.heading_dir(), 12.0), " nearest car ", (np["pos"] if not np.is_empty() else "none"),
				" cardir ", (np["dir"] if not np.is_empty() else ""), " parked ", (np["parked"] if not np.is_empty() else ""), " carspeed ", (np["speed"] if not np.is_empty() else ""),
				" blocked ", data.blocked(vehicle.map_pos() + vehicle.heading_dir() * 3.5), " bld ", data.building_at(vehicle.map_pos() + vehicle.heading_dir() * 3.0))
			break
	_check("auto drive reaches the destination", not auto_drive and vehicle.map_pos().distance_to(route[route.size() - 1] if route.size() > 0 else dest) < 25.0 or waypoint == Vector2.INF,
		"%.0f s, top %.0f mph, %.0f m from goal, upright %.2f" % [t, top * 2.237, vehicle.map_pos().distance_to(dest), vehicle.global_transform.basis.y.y])
	auto_drive = false
	await _wait(3.0)
	_interact()
	_check("E exits the car when stopped", vehicle == null and player.active)
	_check("exit spot is on dry, open ground", not data.blocked(player.map_pos()))
	var car := {}
	for c in traffic.cars:
		var clear := true
		for v in vehicles:
			clear = clear and v.map_pos().distance_to(c["pos"]) > 14.0
		if clear and not c["parked"]:
			car = c
			break
	if not car.is_empty():
		car["speed"] = 0.0
		car["cruise"] = 0.0
		var side := Vector2(-(car["dir"] as Vector2).y, (car["dir"] as Vector2).x)
		player.teleport((car["pos"] as Vector2) - side * 2.6)
		await _wait(0.3)
		var want_type: String = car["type"]
		_interact()
		_check("taking a traffic car", vehicle != null and vehicle.type == want_type, want_type)
	var before := money
	if missions.offers.is_empty():
		missions.update(3.0, current_pos(), 0.0, vehicle != null)
	var offer := {}
	for o in missions.offers:
		if o["kind"] == "courier":
			offer = o
	_check("job offers exist", not missions.offers.is_empty(), str(missions.offers.size()))
	if not offer.is_empty() and vehicle != null:
		missions.start(offer)
		_check("courier job started", not missions.job.is_empty())
		var guard := 0
		while not missions.job.is_empty() and guard < 6:
			guard += 1
			var stop: Vector2 = missions.job["stops"][missions.job["index"]]
			var road := data.nearest_road(stop, true)
			vehicle.place(stop, road["dir"])
			await _wait(1.0)
		_check("courier job pays out", missions.job.is_empty() and money > before, "+$%d" % (money - before))
	var wet := Vector2.INF
	for w in data.waters:
		var c: Vector2 = (w["rect"] as Rect2).get_center()
		if data.in_water(c):
			wet = c
			break
	if wet != Vector2.INF and vehicle != null:
		vehicle.place(wet, Vector2.DOWN)
		await _wait(1.0)
		_check("water rescue", not data.in_water(current_pos()))
	money = 10000
	_on_car_requested("coupe")
	var have := false
	for v in vehicles:
		have = have or v.type == "coupe"
	_check("garage purchase delivers a car", owned.has("coupe") and have and money == 10000 - 7500)
	_shortcut("highway")
	await _wait(0.5)
	var hw := data.nearest_road(current_pos(), true)
	_check("highway shortcut", vehicle != null and hw["road"] >= 0 and data.roads[hw["road"]]["fast"])
	sky.hour = 22.0
	sky.set_weather("rain")
	await _wait(1.0)
	_check("night and rain", sky.night > 0.9 and sky.weather == "rain" and vehicle.lights_on)
	set_state("map")
	await _wait(0.3)
	set_state("paused")
	await _wait(0.3)
	set_state("playing")
	_check("map and pause round trip", state == "playing" and not get_tree().paused)
	await _wait(0.5)
	print("SELFTEST %s (%d failed)" % ["OK" if _fails == 0 else "FAILED", _fails])
	get_tree().quit(1 if _fails > 0 else 0)
