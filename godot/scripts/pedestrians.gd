class_name Pedestrians
extends Node3D
## Walkers in a bubble around the player. They follow sidewalks and paths
## along the walk graph and step out of the way of approaching cars.

const COUNT := 18
const NEAR := 30.0
const FAR := 130.0
const MODELS := ["res://assets/models/npcs/npc_woman_casual.glb", "res://assets/models/npcs/npc_man_workwear.glb", "res://assets/models/npcs/npc_man_jacket.glb"]

var data: CityData
var people: Array[Dictionary] = []
var _scenes: Array[PackedScene] = []
var _rng := RandomNumberGenerator.new()
var _timer := 0.0


func setup(city: CityData) -> void:
	data = city
	_rng.seed = 4242
	for path: String in MODELS:
		_scenes.append(load(path))


static func _right(d: Vector2) -> Vector2:
	return Vector2(-d.y, d.x)


func _side(road: Dictionary) -> float:
	return (road["width"] * 0.5 + 1.25) if road["drive"] else 0.45


func _pick_next(from: int, at: int) -> Array:
	var options: Array = data.walk_adj[at]
	var choices: Array = []
	for o: Array in options:
		if o[0] != from:
			choices.append(o)
	if choices.size() == 0:
		return options[0] if options.size() > 0 else []
	return choices[_rng.randi() % choices.size()]


func _spawn(focus: Vector2, min_d: float, max_d: float) -> bool:
	var q := focus + Vector2.from_angle(_rng.randf() * TAU) * _rng.randf_range(min_d, max_d)
	var hit := data.nearest_road(q, false, false, 2)
	if hit["road"] < 0:
		return false
	var road: Dictionary = data.roads[hit["road"]]
	if road["fast"] or road["type"] == "service" or road["tunnel"] or road["bridge"]:
		return false
	var p: PackedVector2Array = road["p"]
	var s: int = hit["seg"]
	var a := data._node(p[s])
	var b := data._node(p[s + 1])
	if a == b:
		return false
	if _rng.randf() < 0.5:
		var swap := a
		a = b
		b = swap
	var dir := (data.node_pos[b] - data.node_pos[a]).normalized()
	var pos: Vector2 = hit["p"] + _right(dir) * _side(road)
	if data.blocked(pos) or pos.distance_to(focus) < min_d * 0.7:
		return false
	var index := _rng.randi() % _scenes.size()
	var node: Node3D = _scenes[index].instantiate()
	var scale := _rng.randf_range(0.94, 1.06)
	node.scale = Vector3(scale, scale, scale)
	add_child(node)
	var anim := node.find_child("AnimationPlayer", true, false) as AnimationPlayer
	if anim != null:
		for clip in anim.get_animation_list():
			anim.get_animation(clip).loop_mode = Animation.LOOP_LINEAR
		anim.play("Walk")
		anim.seek(_rng.randf() * 1.0)
	var t := (hit["p"] as Vector2).distance_to(data.node_pos[a])
	people.append({"node": node, "anim": anim, "from": a, "to": b, "road": hit["road"], "t": t, "pos": pos, "dir": dir,
		"speed": _rng.randf_range(1.15, 1.6), "dodge": 0.0, "dodge_dir": Vector2.ZERO, "pause": 0.0})
	return true


func populate(focus: Vector2) -> void:
	for i in 60:
		if people.size() < COUNT:
			_spawn(focus, 8.0, FAR * 0.7)


## threats: Array of {pos: Vector2, vel: Vector2} for moving cars near the player.
func update(delta: float, focus: Vector2, threats: Array) -> void:
	_timer -= delta
	if _timer <= 0.0:
		_timer = 0.4
		for person in people.duplicate():
			if (person["pos"] as Vector2).distance_to(focus) > FAR:
				people.erase(person)
				(person["node"] as Node).queue_free()
		if people.size() < COUNT:
			_spawn(focus, NEAR, FAR * 0.85)
	for person in people:
		var pos: Vector2 = person["pos"]
		var anim: AnimationPlayer = person["anim"]
		for threat: Dictionary in threats:
			var rel: Vector2 = pos - threat["pos"]
			var vel: Vector2 = threat["vel"]
			var speed := vel.length()
			if speed < 2.5 or rel.length() > 6.0 + speed * 0.9:
				continue
			var along := rel.dot(vel / speed)
			var side := rel.dot(_right(vel / speed))
			if along > -1.0 and absf(side) < 2.4:
				person["dodge"] = 0.9
				person["dodge_dir"] = _right(vel / speed) * (1.0 if side >= 0.0 else -1.0)
		if person["dodge"] > 0.0:
			person["dodge"] -= delta
			var step: Vector2 = person["dodge_dir"] * 5.5 * delta
			if not data.blocked(pos + step):
				pos += step
			person["pos"] = pos
			person["dir"] = (person["dir"] as Vector2).lerp(person["dodge_dir"], 0.2).normalized()
			if anim != null:
				anim.speed_scale = 2.4
		else:
			if person["pause"] > 0.0:
				person["pause"] -= delta
				if anim != null and anim.current_animation != "Idle" and anim.has_animation("Idle"):
					anim.play("Idle", 0.3)
			else:
				if anim != null:
					anim.speed_scale = person["speed"] / 1.35
					if anim.current_animation != "Walk":
						anim.play("Walk", 0.3)
				_walk(person, delta)
		var d: Vector2 = person["dir"]
		var node: Node3D = person["node"]
		var p: Vector2 = person["pos"]
		node.global_position = Vector3(p.x, 0.0, p.y)
		node.rotation.y = lerp_angle(node.rotation.y, atan2(d.x, d.y), 1.0 - exp(-8.0 * delta))


func _walk(person: Dictionary, delta: float) -> void:
	var a: Vector2 = data.node_pos[person["from"]]
	var b: Vector2 = data.node_pos[person["to"]]
	var length := a.distance_to(b)
	person["t"] += person["speed"] * delta
	if person["t"] >= length:
		var next := _pick_next(person["from"], person["to"])
		if next.size() == 0:
			var swap: int = person["from"]
			person["from"] = person["to"]
			person["to"] = swap
		else:
			person["from"] = person["to"]
			person["to"] = next[0]
			person["road"] = next[1]
		person["t"] = 0.0
		if _rng.randf() < 0.12:
			person["pause"] = _rng.randf_range(1.5, 5.0)
		a = data.node_pos[person["from"]]
		b = data.node_pos[person["to"]]
		length = a.distance_to(b)
	var seg_dir := (b - a) / maxf(length, 0.01)
	var target: Vector2 = a + seg_dir * person["t"] + _right(seg_dir) * _side(data.roads[person["road"]])
	var pos: Vector2 = person["pos"]
	var to := target - pos
	var step: float = person["speed"] * 1.6 * delta
	if to.length() > step:
		pos += to.normalized() * step
		person["dir"] = (person["dir"] as Vector2).lerp(to.normalized(), 1.0 - exp(-6.0 * delta)).normalized()
	else:
		pos = target
		person["dir"] = (person["dir"] as Vector2).lerp(seg_dir, 1.0 - exp(-6.0 * delta)).normalized()
	person["pos"] = pos
