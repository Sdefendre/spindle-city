class_name Traffic
extends Node3D
## Ambient traffic and parked cars in a bubble around the player. Cars are
## kinematic: they follow the road graph, keep right, slow for corners and
## brake for whatever is ahead of them in their lane.

const MOVING := 26
const PARKED := 12
const NEAR := 120.0
const FAR := 330.0

var data: CityData
var cars: Array[Dictionary] = []
var _rng := RandomNumberGenerator.new()
var _spawn_timer := 0.0
var night := false
var pass_events := 0


func setup(city: CityData) -> void:
	data = city
	_rng.seed = 77123


static func _right(d: Vector2) -> Vector2:
	return Vector2(-d.y, d.x)


func _lane_offset(road: Dictionary) -> float:
	if road["oneway"]:
		return 0.0 if road["width"] < 9.0 else (road["width"] * 0.22 * (1.0 if _rng.randf() < 0.5 else -1.0))
	return road["width"] * 0.21


func _make_body(type: String, color: Color) -> Dictionary:
	var body := AnimatableBody3D.new()
	body.sync_to_physics = false
	body.collision_layer = 2
	body.collision_mask = 0
	var spec: Dictionary = CarVisual.SPECS[type]
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(spec["width"], spec["height"] - 0.3, spec["length"])
	shape.shape = box
	shape.position.y = (spec["height"] + 0.3) * 0.5
	body.add_child(shape)
	var parts := CarVisual.build(type, color)
	body.add_child(parts["root"])
	add_child(body)
	return {"body": body, "parts": parts, "type": type, "color": color, "spec": spec}


func _pick_next(from: int, at: int) -> Array:
	var options: Array = data.drive_adj[at]
	if options.size() == 0:
		return []
	var incoming := (data.node_pos[at] - data.node_pos[from]).normalized()
	var best: Array = []
	var total := 0.0
	var weights: Array[float] = []
	for o: Array in options:
		var w := 0.0
		if o[0] != from:
			var out := (data.node_pos[o[0]] - data.node_pos[at]).normalized()
			var road: Dictionary = data.roads[o[1]]
			w = 0.15 + maxf(0.0, incoming.dot(out)) * 3.0
			if road["type"] == "service":
				w *= 0.08
		weights.append(w)
		total += w
	if total <= 0.0:
		# Dead end: turn around if the road is two-way.
		for o: Array in options:
			if o[0] == from:
				return o
		return []
	var roll := _rng.randf() * total
	for i in options.size():
		roll -= weights[i]
		if roll <= 0.0:
			best = options[i]
			break
	return best if best.size() > 0 else options[options.size() - 1]


func _spawn_moving(focus: Vector2, min_d: float, max_d: float) -> bool:
	var hit := data.random_drive_point(_rng, focus, min_d, max_d, true)
	if hit.is_empty():
		return false
	var road: Dictionary = data.roads[hit["road"]]
	var p: PackedVector2Array = road["p"]
	var s: int = hit["seg"]
	var a := data._node(p[s])
	var b := data._node(p[s + 1])
	if a == b:
		return false
	if not road["oneway"] and _rng.randf() < 0.5:
		var swap := a
		a = b
		b = swap
	var pos: Vector2 = data.node_pos[a]
	for c in cars:
		if (c["pos"] as Vector2).distance_to(pos) < 14.0:
			return false
	var type: String = CarVisual.TRAFFIC_TYPES[_rng.randi() % CarVisual.TRAFFIC_TYPES.size()]
	var car := _make_body(type, CarVisual.PAINTS[_rng.randi() % CarVisual.PAINTS.size()])
	var dir := (data.node_pos[b] - pos).normalized()
	car.merge({"from": a, "to": b, "road": hit["road"], "t": 0.0, "next": _pick_next(a, b), "offset": _lane_offset(road),
		"speed": 0.0, "cruise": data.speed_limit(hit["road"]) * _rng.randf_range(0.8, 1.05), "dir": dir,
		"pos": pos + _right(dir) * _lane_offset(road), "parked": false, "waiting": 0.0, "ghost": 0.0, "passed": false})
	cars.append(car)
	_apply(car)
	return true


func _spawn_parked(focus: Vector2, min_d: float, max_d: float) -> bool:
	var hit := data.random_drive_point(_rng, focus, min_d, max_d)
	if hit.is_empty():
		return false
	var road: Dictionary = data.roads[hit["road"]]
	if road["type"] != "residential" and road["type"] != "tertiary":
		return false
	var dir: Vector2 = hit["dir"]
	if _rng.randf() < 0.5 and not road["oneway"]:
		dir = -dir
	var pos: Vector2 = hit["p"] + _right(dir) * (road["width"] * 0.5 - 0.95)
	if data.blocked(pos):
		return false
	for c in cars:
		if (c["pos"] as Vector2).distance_to(pos) < 7.0:
			return false
	var type: String = CarVisual.TRAFFIC_TYPES[_rng.randi() % CarVisual.TRAFFIC_TYPES.size()]
	var car := _make_body(type, CarVisual.PAINTS[_rng.randi() % CarVisual.PAINTS.size()])
	car.merge({"pos": pos, "dir": dir, "speed": 0.0, "parked": true, "waiting": 0.0})
	cars.append(car)
	_apply(car)
	return true


func _apply(car: Dictionary) -> void:
	var d: Vector2 = car["dir"]
	var fwd := Vector3(d.x, 0, d.y)
	var basis := Basis(Vector3.UP.cross(fwd).normalized(), Vector3.UP, fwd)
	var p: Vector2 = car["pos"]
	(car["body"] as Node3D).global_transform = Transform3D(basis, Vector3(p.x, 0.0, p.y))


func remove(car: Dictionary) -> void:
	cars.erase(car)
	(car["body"] as Node).queue_free()


func populate(focus: Vector2) -> void:
	for i in 80:
		if _count(false) < MOVING:
			_spawn_moving(focus, 25.0, FAR * 0.8)
		if _count(true) < PARKED:
			_spawn_parked(focus, 12.0, FAR * 0.7)


func _count(parked: bool) -> int:
	var n := 0
	for c in cars:
		if c["parked"] == parked:
			n += 1
	return n


## obstacles: Array of {pos: Vector2, radius: float} for the player and any
## physical vehicles. `view_dir` is the camera's ground direction.
func update(delta: float, focus: Vector2, view_dir: Vector2, obstacles: Array) -> void:
	_spawn_timer -= delta
	if _spawn_timer <= 0.0:
		_spawn_timer = 0.35
		for c in cars.duplicate():
			if (c["pos"] as Vector2).distance_to(focus) > FAR or c.get("dead", false):
				remove(c)
		var ahead := focus + view_dir * 70.0
		if _count(false) < MOVING:
			_spawn_moving(ahead, NEAR, FAR * 0.85)
		if _count(true) < PARKED:
			_spawn_parked(ahead, NEAR * 0.7, FAR * 0.8)
	for car in cars:
		if car["parked"]:
			continue
		_drive(car, delta, obstacles)
		_apply(car)
		var parts: Dictionary = car["parts"]
		(parts["head"] as StandardMaterial3D).emission_energy_multiplier = 4.0 if night else 0.35


func _drive(car: Dictionary, delta: float, obstacles: Array) -> void:
	var pos: Vector2 = car["pos"]
	var dir: Vector2 = car["dir"]
	var a: Vector2 = data.node_pos[car["from"]]
	var b: Vector2 = data.node_pos[car["to"]]
	var seg := b - a
	var length := seg.length()
	var seg_dir := seg / maxf(length, 0.01)
	var next: Array = car["next"]
	var want: float = car["cruise"]
	# Slow for the corner at the end of this edge.
	var remaining: float = length - car["t"]
	if next.size() > 0:
		var out := (data.node_pos[next[0]] - b).normalized()
		var sharp := 1.0 - maxf(0.0, seg_dir.dot(out))
		if sharp > 0.08:
			want = minf(want, lerpf(want, 3.2, clampf(sharp * 1.6, 0.0, 1.0)) + remaining * 0.35)
	else:
		want = minf(want, remaining * 0.5)
	var blocked := false
	var right := _right(dir)
	var gap: float = 5.0 + car["speed"] * 1.5
	var half_len: float = car["spec"]["length"] * 0.5
	car["ghost"] = maxf(0.0, car["ghost"] - delta)
	for o: Dictionary in obstacles:
		var rel: Vector2 = o["pos"] - pos
		var f: float = rel.dot(dir) - half_len - o["radius"]
		if f > -1.0 and f < gap and absf(rel.dot(right)) < 1.25 + o["radius"]:
			want = minf(want, maxf(0.0, (f - 1.6) * 0.9))
			blocked = true
	if car["ghost"] <= 0.0:
		for other in cars:
			if other == car:
				continue
			var rel2: Vector2 = other["pos"] - pos
			if absf(rel2.x) > 40.0 or absf(rel2.y) > 40.0:
				continue
			var f2 := rel2.dot(dir) - half_len - 2.4
			if f2 > -1.0 and f2 < gap and absf(rel2.dot(right)) < (1.45 if other["parked"] else 2.1):
				if other["parked"] or (other["dir"] as Vector2).dot(dir) > -0.3 or f2 < 4.0:
					want = minf(want, maxf(0.0, (f2 - 1.8) * 0.9))
					blocked = true
	var speed: float = car["speed"]
	speed = move_toward(speed, want, delta * (6.5 if want < speed else 2.4))
	car["speed"] = speed
	if speed < 0.2 and blocked:
		car["waiting"] += delta
		if car["waiting"] > 7.0:
			car["ghost"] = 3.0
			car["waiting"] = 0.0
	else:
		car["waiting"] = 0.0
	(car["parts"]["brake"] as StandardMaterial3D).emission_energy_multiplier = 5.0 if want < speed - 0.3 or speed < 0.3 else (1.2 if night else 0.35)
	car["t"] += speed * delta
	if car["t"] >= length:
		if next.size() == 0:
			# Dead end: leave the world rather than block the street.
			car["speed"] = 0.0
			car["t"] = length
			car["dead"] = true
			return
		car["t"] -= length
		car["from"] = car["to"]
		car["to"] = next[0]
		car["road"] = next[1]
		car["offset"] = _lane_offset(data.roads[next[1]]) if absf(car["offset"]) < 0.01 or not data.roads[next[1]]["oneway"] else car["offset"]
		car["cruise"] = data.speed_limit(next[1]) * _rng.randf_range(0.82, 1.05)
		car["next"] = _pick_next(car["from"], car["to"])
		a = data.node_pos[car["from"]]
		b = data.node_pos[car["to"]]
		seg = b - a
		length = seg.length()
		seg_dir = seg / maxf(length, 0.01)
	# Pure pursuit toward a point a little further along the lane.
	var look := 4.0 + speed * 0.55
	var t: float = car["t"] + look
	var target: Vector2
	if t <= length or (car["next"] as Array).size() == 0:
		target = a + seg_dir * minf(t, length) + _right(seg_dir) * car["offset"]
	else:
		var nb: Vector2 = data.node_pos[car["next"][0]]
		var nd := (nb - b).normalized()
		target = b + nd * (t - length) + _right(nd) * car["offset"]
	var to := target - pos
	if to.length() > 0.2 and speed > 0.05:
		var ang := dir.angle_to(to)
		var max_turn := delta * (1.2 + 9.0 / maxf(speed, 2.0))
		dir = dir.rotated(clampf(ang, -max_turn, max_turn))
		car["dir"] = dir
	car["pos"] = pos + dir * speed * delta


func nearest(pos: Vector2, max_d: float, max_speed := 99.0) -> Dictionary:
	var best := {}
	var best_d := max_d
	for c in cars:
		var d := (c["pos"] as Vector2).distance_to(pos)
		if d < best_d and c["speed"] <= max_speed:
			best_d = d
			best = c
	return best


## Distance to the closest car ahead in a lane-wide corridor, or INF.
func gap_ahead(pos: Vector2, dir: Vector2, reach: float) -> float:
	var best := INF
	var right := _right(dir)
	for c in cars:
		var rel: Vector2 = c["pos"] - pos
		var f := rel.dot(dir)
		var oncoming: bool = not c["parked"] and (c["dir"] as Vector2).dot(dir) < -0.3
		if f > 1.0 and f < reach and absf(rel.dot(right)) < (1.1 if oncoming else 2.0):
			best = minf(best, f)
	return best
