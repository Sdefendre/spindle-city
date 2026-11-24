class_name Vehicle
extends VehicleBody3D
## A physically simulated car. Local +Z is the front. Whoever is driving sets
## `throttle` (-1..1), `steer_input` (-1 right .. 1 left), `brake_input` (0..1)
## and `handbrake` each frame.

signal crashed(speed: float)

const RIDE := 0.5   # body origin height above the ground at rest

var type := "model_y"
var color := Color.WHITE
var spec: Dictionary
var throttle := 0.0
var steer_input := 0.0
var brake_input := 0.0
var handbrake := false
var driver := ""            # "", "player" or "auto"
var lights_on := false
var forward_speed := 0.0    # m/s along the nose
var skid := 0.0             # 0 grip .. 1 sliding
var wetness := 0.0          # 0 dry .. 1 soaked road
var parts: Dictionary
var wheels := {}
var headlights: Array[SpotLight3D] = []
var _steer := 0.0
var _reverse_hold := 0.0
var _last_velocity := Vector3.ZERO
var _brake_glow := 0.0
var idle_time := 0.0


static func create(car_type: String, car_color: Color) -> Vehicle:
	var v := Vehicle.new()
	v.type = car_type
	v.color = car_color
	v._setup()
	return v


func _setup() -> void:
	spec = CarVisual.SPECS[type]
	mass = spec["mass"]
	center_of_mass_mode = RigidBody3D.CENTER_OF_MASS_MODE_CUSTOM
	center_of_mass = Vector3(0, -0.18, 0.05)
	collision_layer = 2
	collision_mask = 1 | 2 | 4
	contact_monitor = true
	max_contacts_reported = 4
	linear_damp_mode = RigidBody3D.DAMP_MODE_REPLACE
	angular_damp_mode = RigidBody3D.DAMP_MODE_REPLACE
	linear_damp = 0.0
	angular_damp = 0.35
	continuous_cd = true
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	var h: float = spec["height"]
	box.size = Vector3(spec["width"] - 0.1, h - 0.42, spec["length"] - 0.1)
	shape.shape = box
	shape.position = Vector3(0, (h + 0.42) * 0.5 - RIDE, 0)
	add_child(shape)
	parts = CarVisual.build(type, color)
	var visual: Node3D = parts["root"]
	visual.position.y = -RIDE
	add_child(visual)
	var r: float = spec["wheel_r"]
	var rest := 0.16
	var stiffness := 46.0
	var settle := 9.8 / (4.0 * stiffness) + 0.037
	for key: String in parts["wheels"]:
		var holder: Node3D = parts["wheels"][key]
		var wheel := VehicleWheel3D.new()
		var front := holder.position.z > 0.0
		wheel.position = Vector3(holder.position.x, r - RIDE + rest - settle, holder.position.z)
		wheel.wheel_radius = r
		wheel.wheel_rest_length = rest
		wheel.suspension_travel = 0.2
		wheel.suspension_stiffness = stiffness
		wheel.suspension_max_force = 60000.0
		wheel.damping_compression = 2.4
		wheel.damping_relaxation = 3.9
		wheel.wheel_friction_slip = spec["grip"] * (1.0 if front else 0.96)
		wheel.wheel_roll_influence = 0.07
		wheel.use_as_steering = front
		wheel.use_as_traction = spec["awd"] or not front
		add_child(wheel)
		visual.remove_child(holder)
		wheel.add_child(holder)
		holder.position = Vector3.ZERO
		wheels[key] = wheel
	for side: float in [-1.0, 1.0]:
		var lamp := SpotLight3D.new()
		lamp.position = Vector3(side * spec["width"] * 0.32, 0.72 - RIDE, spec["length"] * 0.5 - 0.1)
		lamp.rotation = Vector3(deg_to_rad(-7.0), PI, 0)
		lamp.spot_range = 46.0
		lamp.spot_angle = 34.0
		lamp.light_energy = 0.0
		lamp.light_color = Color(1.0, 0.95, 0.86)
		lamp.shadow_enabled = false
		lamp.visible = false
		add_child(lamp)
		headlights.append(lamp)
	body_entered.connect(_on_body_entered)


func traction_wheels() -> int:
	return 4 if spec["awd"] else 2


func _physics_process(delta: float) -> void:
	var forward := global_transform.basis.z
	forward_speed = linear_velocity.dot(forward)
	var speed := absf(forward_speed)
	var top: float = spec["top"]
	var force := 0.0
	var brake_amount := brake_input
	if forward_speed > 1.2:
		_reverse_hold = 0.22
	if throttle > 0.01:
		_reverse_hold = 0.0
		if forward_speed < -0.8:
			brake_amount = maxf(brake_amount, throttle)
		else:
			force = throttle * mass * spec["accel"] * clampf(1.0 - pow(speed / top, 2.0), 0.0, 1.0)
	elif throttle < -0.01:
		if forward_speed > 0.6:
			brake_amount = maxf(brake_amount, -throttle)
		elif _reverse_hold > 0.0 and driver == "player":
			_reverse_hold = maxf(0.0, _reverse_hold - delta)
			brake_amount = maxf(brake_amount, -throttle)
		elif forward_speed > -9.0:
			force = throttle * mass * 3.0
	else:
		_reverse_hold = 0.0
		if driver == "":
			brake_amount = maxf(brake_amount, 0.5)
	# Ease off the power when the driven wheels are sliding.
	force *= lerpf(1.0, 0.35, clampf(skid * 1.4, 0.0, 1.0)) if not handbrake else 0.5
	engine_force = force / traction_wheels()
	# Brake is an impulse per physics step, so scale it by mass and tick rate.
	var ticks := float(Engine.physics_ticks_per_second)
	var wet_brake := lerpf(1.0, 0.86, wetness)
	var per_wheel := mass * 9.5 * wet_brake / 4.0 / ticks
	var rolling := mass * (0.35 + 0.9 * float(absf(throttle) < 0.01)) / 4.0 / ticks
	var base_brake := maxf(brake_amount * per_wheel, rolling if force == 0.0 else 0.0)
	brake = base_brake
	# Speed-sensitive steering: nimble around city blocks, planted on the highway.
	var wheelbase: float = spec["front"] - spec["rear"]
	var grip: float = float(spec["grip"]) * lerpf(1.0, 0.78, wetness)
	var limit := minf(0.62, atan(grip * 2.9 * wheelbase / maxf(speed * speed * 0.9, 1.0)))
	var target := steer_input * limit
	var fast_return := absf(target) < absf(_steer) or target * _steer < 0.0
	_steer = move_toward(_steer, target, delta * (4.8 if fast_return else 2.8))
	steering = _steer
	var slide := 0.0
	for key: String in wheels:
		var wheel: VehicleWheel3D = wheels[key]
		var front := wheel.use_as_steering
		wheel.wheel_friction_slip = grip * (1.0 if front else (0.34 if handbrake else 0.96))
		wheel.brake = maxf(base_brake, per_wheel * 1.6) if (not front and handbrake) else base_brake
		if wheel.is_in_contact():
			slide = maxf(slide, 1.0 - wheel.get_skidinfo())
	skid = move_toward(skid, slide if speed > 4.0 else 0.0, delta * 5.0)
	var braking := brake_amount > 0.05 or (throttle < -0.01 and forward_speed <= 0.8) or handbrake
	_brake_glow = move_toward(_brake_glow, 1.0 if braking else 0.0, delta * 12.0)
	(parts["brake"] as StandardMaterial3D).emission_energy_multiplier = lerpf(1.4 if lights_on else 0.35, 6.0, _brake_glow)
	(parts["head"] as StandardMaterial3D).emission_energy_multiplier = 5.0 if lights_on else 0.35
	for lamp in headlights:
		lamp.visible = lights_on
		lamp.light_energy = 9.0 if lights_on else 0.0
	if driver == "" and speed < 0.3:
		idle_time += delta
	else:
		idle_time = 0.0
	_last_velocity = linear_velocity


func _on_body_entered(_other: Node) -> void:
	var hit := (_last_velocity - linear_velocity).length()
	if hit > 2.0:
		crashed.emit(hit)


func is_upside_down() -> bool:
	return global_transform.basis.y.y < 0.25


## Put the car on the ground at a map position, facing along `heading_dir`.
func place(pos: Vector2, heading_dir: Vector2) -> void:
	var fwd := Vector3(heading_dir.x, 0, heading_dir.y).normalized()
	if fwd == Vector3.ZERO:
		fwd = Vector3.BACK
	var b := Basis(Vector3.UP.cross(fwd).normalized(), Vector3.UP, fwd)
	global_transform = Transform3D(b, Vector3(pos.x, RIDE + 0.04, pos.y))
	linear_velocity = Vector3.ZERO
	angular_velocity = Vector3.ZERO
	_steer = 0.0


func map_pos() -> Vector2:
	return Vector2(global_position.x, global_position.z)


func heading_dir() -> Vector2:
	var f := global_transform.basis.z
	return Vector2(f.x, f.z).normalized()


## Simple driver used by auto drive: steer toward a map point at a target speed.
func drive_toward(target: Vector2, want_speed: float) -> void:
	var to := target - map_pos()
	var fwd := heading_dir()
	var angle := fwd.angle_to(to)
	steer_input = clampf(-angle * 1.4, -1.0, 1.0)
	var want := want_speed * clampf(1.0 - absf(angle) * 0.9, 0.3, 1.0)
	var err := want - forward_speed
	throttle = clampf(err * 0.5, -0.2, 0.75)
	brake_input = clampf(-err * 0.25, 0.0, 1.0) if err < -1.5 else 0.0
	handbrake = false
