class_name CameraRig
extends Node3D
## Third- and first-person camera for walking and driving.

var cam: Camera3D
var yaw := 0.0
var pitch := 0.12
var distance := 4.9
var first_person := false
var look_hold := 0.0
var shake := 0.0
var base_fov := 62.0
var reduced_motion := false
var _snap := true
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	cam = Camera3D.new()
	cam.near = 0.12
	cam.far = 3200.0
	cam.fov = base_fov
	add_child(cam)
	cam.make_current()


func snap() -> void:
	_snap = true


func face(dir: Vector2) -> void:
	yaw = atan2(-dir.x, -dir.y)


func forward_dir() -> Vector3:
	return Vector3(-sin(yaw), 0, -cos(yaw))


func right_dir() -> Vector3:
	return Vector3(cos(yaw), 0, -sin(yaw))


func look(delta_yaw: float, delta_pitch: float) -> void:
	yaw -= delta_yaw
	pitch = clampf(pitch + delta_pitch, -0.55, 1.1)
	look_hold = 1.6


func add_shake(amount: float) -> void:
	if not reduced_motion:
		shake = minf(shake + amount, 0.6)


func update(delta: float, player: Player, vehicle: Vehicle) -> void:
	look_hold = maxf(0.0, look_hold - delta)
	var speed := 0.0
	var focus: Vector3
	if vehicle != null:
		speed = absf(vehicle.forward_speed)
		focus = vehicle.global_position + Vector3(0, 1.0, 0)
		if look_hold <= 0.0:
			var want := atan2(-vehicle.heading_dir().x, -vehicle.heading_dir().y)
			if vehicle.forward_speed < -1.5:
				want += PI
			yaw = lerp_angle(yaw, want, 1.0 - exp(-(1.4 + speed * 0.08) * delta))
			pitch = lerpf(pitch, 0.2, 1.0 - exp(-1.5 * delta))
	else:
		focus = player.global_position + Vector3(0, 1.5, 0)
	var fov := base_fov
	var offset := Vector3.ZERO
	if shake > 0.001:
		offset = Vector3(_rng.randf_range(-1, 1), _rng.randf_range(-1, 1), _rng.randf_range(-1, 1)) * shake * 0.35
		shake = move_toward(shake, 0.0, delta * 1.6)
	var dir := Vector3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch))
	if first_person:
		var eye: Vector3
		if vehicle != null:
			var b := vehicle.global_transform.basis
			eye = vehicle.global_position + b.x * 0.36 + b.y * 0.62 + b.z * 0.05
		else:
			eye = player.global_position + Vector3(0, 1.68, 0)
		cam.global_position = eye + offset * 0.4
		cam.look_at(cam.global_position - dir, Vector3.UP)
		if not reduced_motion:
			fov += clampf(speed / 50.0, 0.0, 1.0) * 6.0
	else:
		var dist := distance
		var height := 0.5
		if vehicle != null:
			dist = maxf(7.2, distance + 2.4) + clampf(speed / 45.0, 0.0, 1.0) * 2.2
			height = 0.7
			if not reduced_motion:
				fov += clampf(speed / 50.0, 0.0, 1.0) * 11.0
		var shoulder := right_dir() * (0.0 if vehicle != null else 0.42)
		var desired := focus + dir * dist + Vector3(0, height, 0) + shoulder
		var space := get_world_3d().direct_space_state
		var query := PhysicsRayQueryParameters3D.create(focus, desired, 1)
		var hit := space.intersect_ray(query)
		if hit.size() > 0:
			var d := focus.distance_to(hit["position"])
			desired = focus + (desired - focus).normalized() * maxf(0.6, d - 0.3)
		desired.y = maxf(desired.y, 0.35)
		if _snap:
			cam.global_position = desired
		else:
			cam.global_position = cam.global_position.lerp(desired, 1.0 - exp(-14.0 * delta))
		cam.global_position += offset
		cam.look_at(focus + Vector3(0, 0.25, 0), Vector3.UP)
	_snap = false
	cam.fov = lerpf(cam.fov, fov, 1.0 - exp(-4.0 * delta))
