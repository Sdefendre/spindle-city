class_name Sound
extends Node
## All game audio. Engine, road, wind, rain and UI tones are synthesised at
## start-up; doors, tyre skid and traffic pass-by use the recorded clips.

const RATE := 22050

var engine: AudioStreamPlayer
var road: AudioStreamPlayer
var skid: AudioStreamPlayer
var ambience: AudioStreamPlayer
var rain: AudioStreamPlayer
var horn: AudioStreamPlayer
var pass_by: AudioStreamPlayer
var _one_shots := {}
var _pass_cooldown := 0.0
var _step_phase := 0.0


static func _wave(samples: PackedFloat32Array, loop: bool) -> AudioStreamWAV:
	var bytes := PackedByteArray()
	bytes.resize(samples.size() * 2)
	for i in samples.size():
		bytes.encode_s16(i * 2, int(clampf(samples[i], -1.0, 1.0) * 32000.0))
	var wav := AudioStreamWAV.new()
	wav.format = AudioStreamWAV.FORMAT_16_BITS
	wav.mix_rate = RATE
	wav.stereo = false
	wav.data = bytes
	if loop:
		wav.loop_mode = AudioStreamWAV.LOOP_FORWARD
		wav.loop_begin = 0
		wav.loop_end = samples.size()
	return wav


static func _tone(seconds: float, fn: Callable) -> PackedFloat32Array:
	var out := PackedFloat32Array()
	out.resize(int(seconds * RATE))
	for i in out.size():
		out[i] = fn.call(float(i) / RATE)
	return out


static func _noise(seconds: float, smooth: float, seed_value: int) -> PackedFloat32Array:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed_value
	var out := PackedFloat32Array()
	out.resize(int(seconds * RATE))
	var v := 0.0
	var peak := 0.001
	for i in out.size():
		v = (v + rng.randf_range(-1.0, 1.0) * smooth) / (1.0 + smooth)
		out[i] = v
		peak = maxf(peak, absf(v))
	# Crossfade the ends so the loop has no click.
	var fade := mini(2048, out.size() / 4)
	for i in fade:
		var k := float(i) / fade
		out[i] = out[i] * k + out[out.size() - fade + i] * (1.0 - k)
	out.resize(out.size() - fade)
	for i in out.size():
		out[i] /= peak
	return out


func _player(stream: AudioStream, volume_db: float, autoplay := false) -> AudioStreamPlayer:
	var p := AudioStreamPlayer.new()
	p.stream = stream
	p.volume_db = volume_db
	add_child(p)
	if autoplay:
		p.play()
	return p


func _ready() -> void:
	# Electric motor: a whine with a few harmonics over one loop of 110 Hz.
	var motor := _tone(0.4, func(t: float) -> float:
		return 0.5 * sin(TAU * 110.0 * t) + 0.25 * sin(TAU * 220.0 * t + 0.6) + 0.14 * sin(TAU * 440.0 * t) + 0.08 * sin(TAU * 660.0 * t + 1.1))
	engine = _player(_wave(motor, true), -80.0, true)
	road = _player(_wave(_noise(2.0, 0.12, 1), true), -80.0, true)
	ambience = _player(_wave(_noise(3.0, 0.035, 2), true), -26.0, true)
	rain = _player(_wave(_noise(2.0, 0.9, 3), true), -80.0, true)
	var skid_stream: AudioStreamWAV = load("res://assets/audio/tire-skid.wav")
	skid_stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
	skid_stream.loop_end = int(skid_stream.get_length() * skid_stream.mix_rate) - 1
	skid = _player(skid_stream, -80.0, true)
	horn = _player(_wave(_tone(0.25, func(t: float) -> float:
		return 0.4 * signf(sin(TAU * 420.0 * t)) * 0.5 + 0.4 * signf(sin(TAU * 524.0 * t)) * 0.5), true), -12.0)
	pass_by = _player(load("res://assets/audio/traffic-pass.wav"), -14.0)
	_one_shots["door_open"] = _player(load("res://assets/audio/door-open.wav"), -6.0)
	_one_shots["door_close"] = _player(load("res://assets/audio/door-close.wav"), -6.0)
	_one_shots["crash"] = _player(_wave(_tone(0.5, func(t: float) -> float:
		return (sin(TAU * 62.0 * t) * 0.7 + sin(t * 9100.0 + sin(t * 3700.0) * 4.0) * 0.5) * exp(-t * 9.0)), false), -4.0)
	_one_shots["chime"] = _player(_wave(_tone(0.6, func(t: float) -> float:
		var f := 660.0 if t < 0.12 else (880.0 if t < 0.24 else 1320.0)
		return sin(TAU * f * t) * exp(-fmod(t, 0.12) * 6.0) * 0.5 * exp(-t * 1.5)), false), -10.0)
	_one_shots["fail"] = _player(_wave(_tone(0.45, func(t: float) -> float:
		return signf(sin(TAU * (220.0 - t * 180.0) * t)) * 0.3 * exp(-t * 4.0)), false), -12.0)
	_one_shots["step"] = _player(_wave(_tone(0.09, func(t: float) -> float:
		return sin(t * 5200.0 + sin(t * 2100.0) * 5.0) * exp(-t * 55.0) * 0.6), false), -20.0)
	_one_shots["splash"] = _player(_wave(_noise(0.9, 0.5, 9), false), -8.0)


func play(name: String, pitch := 1.0) -> void:
	if _one_shots.has(name):
		var p: AudioStreamPlayer = _one_shots[name]
		p.pitch_scale = pitch
		p.play()


func set_horn(on: bool) -> void:
	if on and not horn.playing:
		horn.play()
	elif not on and horn.playing:
		horn.stop()


func set_volume(linear: float) -> void:
	AudioServer.set_bus_volume_db(0, linear_to_db(maxf(linear, 0.0001)))
	AudioServer.set_bus_mute(0, linear <= 0.001)


func update(delta: float, vehicle: Vehicle, player: Player, wetness: float, raining: bool, traffic_near: float) -> void:
	_pass_cooldown = maxf(0.0, _pass_cooldown - delta)
	if vehicle != null:
		var speed := absf(vehicle.forward_speed)
		var load_amount := absf(vehicle.throttle)
		var electric := vehicle.type == "model_y"
		engine.pitch_scale = clampf((0.55 if electric else 0.32) + speed / float(vehicle.spec["top"]) * (2.6 if electric else 1.5) + load_amount * 0.12, 0.2, 4.0)
		engine.volume_db = lerpf(engine.volume_db, linear_to_db(clampf(0.03 + speed * 0.004 + load_amount * 0.1, 0.0, 0.3) * (0.7 if electric else 1.5)), 1.0 - exp(-8.0 * delta))
		road.pitch_scale = clampf(0.6 + speed / 40.0, 0.6, 1.8)
		road.volume_db = lerpf(road.volume_db, linear_to_db(clampf(speed / 45.0, 0.0001, 0.7) * (1.0 + wetness * 0.6)), 1.0 - exp(-6.0 * delta))
		skid.volume_db = lerpf(skid.volume_db, linear_to_db(clampf(vehicle.skid * 0.6, 0.0001, 0.6)), 1.0 - exp(-12.0 * delta))
		if traffic_near < 7.0 and speed > 8.0 and _pass_cooldown <= 0.0 and not pass_by.playing:
			pass_by.play()
			_pass_cooldown = 9.0
	else:
		engine.volume_db = lerpf(engine.volume_db, -80.0, 1.0 - exp(-8.0 * delta))
		road.volume_db = lerpf(road.volume_db, -80.0, 1.0 - exp(-8.0 * delta))
		skid.volume_db = lerpf(skid.volume_db, -80.0, 1.0 - exp(-12.0 * delta))
		if player.moving and player.is_on_floor():
			if floorf(player.step_phase) != floorf(_step_phase):
				play("step", randf_range(0.85, 1.15))
		_step_phase = player.step_phase
	rain.volume_db = lerpf(rain.volume_db, -15.0 if raining else -80.0, 1.0 - exp(-1.5 * delta))
