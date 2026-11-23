class_name Player
extends CharacterBody3D
## The on-foot character: capsule body plus the rigged player model.

const WALK := 2.3
const RUN := 6.2
const JUMP := 4.6

var model: Node3D
var anim: AnimationPlayer
var moving := false
var running := false
var _facing := 0.0
var _current := ""
var step_phase := 0.0
var input_dir := Vector3.ZERO
var want_run := false
var want_jump := false
var active := true
var _shape: CollisionShape3D


func _ready() -> void:
	collision_layer = 4
	collision_mask = 1 | 2
	floor_snap_length = 0.3
	var shape := CollisionShape3D.new()
	_shape = shape
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.34
	capsule.height = 1.8
	shape.shape = capsule
	shape.position.y = 0.9
	add_child(shape)
	var scene: PackedScene = load("res://assets/models/fall-river-player.glb")
	model = scene.instantiate()
	add_child(model)
	anim = model.find_child("AnimationPlayer", true, false) as AnimationPlayer
	if anim != null:
		for clip in anim.get_animation_list():
			anim.get_animation(clip).loop_mode = Animation.LOOP_LINEAR
		_play("Idle")


func _physics_process(delta: float) -> void:
	if active:
		walk(input_dir, want_run, want_jump, delta)
		want_jump = false


func set_active(on: bool) -> void:
	active = on
	visible = on
	_shape.set_deferred("disabled", not on)
	if not on:
		velocity = Vector3.ZERO
		input_dir = Vector3.ZERO


func _play(clip: String, speed := 1.0) -> void:
	if anim == null or not anim.has_animation(clip):
		return
	anim.speed_scale = speed
	if _current != clip:
		_current = clip
		anim.play(clip, 0.22)


## `dir` is the desired world-space move direction on the ground (length 0..1).
func walk(dir: Vector3, run: bool, jump: bool, delta: float) -> void:
	var amount := minf(dir.length(), 1.0)
	moving = amount > 0.08
	running = run and moving
	var speed := (RUN if running else WALK) * amount
	var flat := dir.normalized() * speed if moving else Vector3.ZERO
	velocity.x = move_toward(velocity.x, flat.x, delta * 30.0)
	velocity.z = move_toward(velocity.z, flat.z, delta * 30.0)
	if is_on_floor():
		velocity.y = JUMP if jump else -0.5
	else:
		velocity.y -= 14.0 * delta
	move_and_slide()
	if moving:
		_facing = lerp_angle(_facing, atan2(dir.x, dir.z), 1.0 - exp(-12.0 * delta))
		model.rotation.y = _facing
		step_phase += delta * (3.1 if running else 1.9)
	if not is_on_floor():
		_play("Run" if running else "Walk", 0.5)
	elif running:
		_play("Run", 1.0)
	elif moving:
		_play("Walk", clampf(amount * 1.15, 0.6, 1.3))
	else:
		_play("Idle")


func face(dir: Vector2) -> void:
	_facing = atan2(dir.x, dir.y)
	model.rotation.y = _facing


func teleport(pos: Vector2) -> void:
	global_position = Vector3(pos.x, 0.05, pos.y)
	velocity = Vector3.ZERO


func map_pos() -> Vector2:
	return Vector2(global_position.x, global_position.z)
