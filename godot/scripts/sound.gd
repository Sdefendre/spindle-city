class_name Sound
extends Node
## All game audio. Engine, road, wind, rain and UI tones are synthesised at
## start-up; doors, tyre skid and traffic pass-by use the recorded clips.

const RATE := 22050

var engine: AudioStreamPlayer
var gas_engine: AudioStreamPlayer
var road: AudioStreamPlayer
var wind: AudioStreamPlayer
var skid: AudioStreamPlayer
var ambience: AudioStreamPlayer
var rain: AudioStreamPlayer
var horn: AudioStreamPlayer
var pass_by: AudioStreamPlayer
var _one_shots := {}
var _one_shot_base_db := {}
var _gains := {}
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
	# Electric motor: clean inverter shimmer with gentle harmonics over 110 Hz.
	var ev := _tone(0.4, func(t: float) -> float:
		return 0.55 * sin(TAU * 110.0 * t) + 0.24 * sin(TAU * 220.0 * t + 0.4) + 0.10 * sin(TAU * 330.0 * t + 0.9) + 0.05 * sin(TAU * 440.0 * t))
	engine = _player(_wave(ev, true), -80.0, true)
	# Combustion engine: warm low-mid fundamental with soft-clipped harmonics and subtle pulse.
	var ice := _tone(0.4, func(t: float) -> float:
		var pulse := 0.85 + 0.15 * sin(TAU * 27.5 * t)
		var raw := 0.65 * sin(TAU * 55.0 * t) + 0.42 * sin(TAU * 110.0 * t + 0.3) + 0.26 * sin(TAU * 165.0 * t + 1.0) + 0.14 * sin(TAU * 220.0 * t + 0.7)
		return tanh(raw * 1.45) * 0.72 * pulse)
	gas_engine = _player(_wave(ice, true), -80.0, true)
	road = _player(_wave(_noise(2.0, 0.12, 1), true), -80.0, true)
	wind = _player(_wave(_noise(2.4, 0.22, 5), true), -80.0, true)
	ambience = _player(_wave(_noise(3.0, 0.035, 2), true), -28.0, true)
	rain = _player(_wave(_noise(2.0, 0.32, 3), true), -80.0, true)
	var skid_stream: AudioStreamWAV = load("res://assets/audio/tire-skid.wav")
	skid_stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
	skid_stream.loop_end = int(skid_stream.get_length() * skid_stream.mix_rate) - 1
	skid = _player(skid_stream, -80.0, true)
	# Warm dual-tone car horn (soft-clipped brassy harmonics instead of raw square wave).
	horn = _player(_wave(_tone(0.25, func(t: float) -> float:
		var a := sin(TAU * 416.0 * t) + 0.45 * sin(TAU * 832.0 * t) + 0.22 * sin(TAU * 1248.0 * t)
		var b := sin(TAU * 520.0 * t) + 0.45 * sin(TAU * 1040.0 * t) + 0.22 * sin(TAU * 1560.0 * t)
		return tanh((a + b) * 0.65) * 0.55), true), -14.0)
	pass_by = _player(load("res://assets/audio/traffic-pass.wav"), -16.0)
	_add_one_shot("door_open", load("res://assets/audio/door-open.wav"), -8.0)
	_add_one_shot("door_close", load("res://assets/audio/door-close.wav"), -8.0)
	_add_one_shot("crash", _wave(_tone(0.5, func(t: float) -> float:
		return (sin(TAU * 62.0 * t) * 0.7 + sin(t * 9100.0 + sin(t * 3700.0) * 4.0) * 0.45) * exp(-t * 9.0)), false), -5.0)
	_add_one_shot("chime", _wave(_tone(0.6, func(t: float) -> float:
		var f := 660.0 if t < 0.12 else (880.0 if t < 0.24 else 1320.0)
		return sin(TAU * f * t) * exp(-fmod(t, 0.12) * 6.0) * 0.5 * exp(-t * 1.5)), false), -11.0)
	_add_one_shot("fail", _wave(_tone(0.45, func(t: float) -> float:
		var f := 330.0 if t < 0.18 else 247.0
		return (sin(TAU * f * t) * 0.75 + sin(TAU * f * 2.0 * t) * 0.2) * exp(-fmod(t, 0.22) * 5.0) * 0.45 * exp(-t * 2.0)), false), -12.0)
	_add_one_shot("step", _wave(_tone(0.085, func(t: float) -> float:
		var thud := sin(TAU * (125.0 - t * 420.0) * t) * exp(-t * 42.0) * 0.75
		var grit := sin(t * 3100.0 + sin(t * 1400.0) * 3.0) * exp(-t * 95.0) * 0.22
		return thud + grit), false), -18.0)
	_add_one_shot("splash", _wave(_noise(0.9, 0.45, 9), false), -9.0)


func _add_one_shot(name: String, stream: AudioStream, volume_db: float) -> void:
	_one_shots[name] = _player(stream, volume_db)
	_one_shot_base_db[name] = volume_db


func play(name: String, pitch := 1.0, volume_scale := 1.0) -> void:
	if _one_shots.has(name):
		var p: AudioStreamPlayer = _one_shots[name]
		p.pitch_scale = pitch
		p.volume_db = float(_one_shot_base_db[name]) + linear_to_db(clampf(volume_scale, 0.05, 1.5))
		p.play()


func set_horn(on: bool) -> void:
	if on and not horn.playing:
		horn.play()
	elif not on and horn.playing:
		horn.stop()


func set_paused(paused: bool) -> void:
	for p: AudioStreamPlayer in [engine, gas_engine, road, wind, skid, rain, pass_by, ambience]:
		p.stream_paused = paused


func set_volume(linear: float) -> void:
	AudioServer.set_bus_volume_db(0, linear_to_db(maxf(linear, 0.0001)))
	AudioServer.set_bus_mute(0, linear <= 0.001)


func _smooth_gain(key: String, player: AudioStreamPlayer, target: float, rate: float, delta: float) -> void:
	var cur: float = float(_gains.get(key, 0.0))
	cur = lerpf(cur, maxf(target, 0.0), 1.0 - exp(-rate * delta))
	_gains[key] = cur
	player.volume_db = -80.0 if cur < 0.0005 else linear_to_db(cur)


func update(delta: float, vehicle: Vehicle, player: Player, wetness: float, raining: bool, traffic_near: float, inside := false) -> void:
	_pass_cooldown = maxf(0.0, _pass_cooldown - delta)
	var cabin := 0.68 if (vehicle != null and inside) else 1.0
	if vehicle != null:
		var speed := absf(vehicle.forward_speed)
		var load_amount := absf(vehicle.throttle)
		var top: float = float(vehicle.spec["top"])
		var frac := clampf(speed / maxf(top, 1.0), 0.0, 1.0)
		var electric := vehicle.type == "model_y"
		if electric:
			engine.pitch_scale = clampf(0.62 + frac * 2.15 + load_amount * 0.14, 0.5, 3.2)
			var ev_gain := (0.004 + clampf(speed / 16.0, 0.0, 1.0) * 0.055 + load_amount * 0.045) * cabin
			_smooth_gain("ev", engine, ev_gain if speed > 0.15 or load_amount > 0.05 else 0.002, 8.0, delta)
			_smooth_gain("gas", gas_engine, 0.0, 10.0, delta)
		else:
			# Simulate a smooth 5-speed automatic so combustion cars shift instead of climbing endlessly.
			var gear_pos := frac * 4.2
			var gear_band := fmod(gear_pos, 1.0)
			var rpm := 0.22 + gear_band * 0.62 + clampf(floorf(gear_pos) * 0.06, 0.0, 0.24) + load_amount * 0.14
			gas_engine.pitch_scale = clampf(0.68 + rpm * 1.45, 0.55, 2.5)
			var gas_gain := (0.055 + frac * 0.11 + load_amount * 0.09) * cabin
			_smooth_gain("gas", gas_engine, gas_gain, 8.0, delta)
			_smooth_gain("ev", engine, 0.0, 10.0, delta)
		road.pitch_scale = clampf(0.65 + speed / 38.0, 0.65, 1.75)
		_smooth_gain("road", road, clampf(speed / 44.0, 0.0, 0.42) * (1.0 + wetness * 0.55) * cabin, 6.0, delta)
		wind.pitch_scale = clampf(0.75 + speed / 55.0, 0.75, 1.6)
		_smooth_gain("wind", wind, clampf((speed - 11.0) / 36.0, 0.0, 0.18) * cabin, 4.0, delta)
		_smooth_gain("skid", skid, clampf(vehicle.skid * 0.42, 0.0, 0.42) * cabin, 12.0, delta)
		if traffic_near < 7.0 and speed > 8.0 and _pass_cooldown <= 0.0 and not pass_by.playing:
			pass_by.volume_db = -16.0 + linear_to_db(cabin)
			pass_by.play()
			_pass_cooldown = 9.0
	else:
		_smooth_gain("ev", engine, 0.0, 9.0, delta)
		_smooth_gain("gas", gas_engine, 0.0, 9.0, delta)
		_smooth_gain("road", road, 0.0, 8.0, delta)
		_smooth_gain("wind", wind, 0.0, 6.0, delta)
		_smooth_gain("skid", skid, 0.0, 12.0, delta)
		if player.moving and player.is_on_floor():
			if floorf(player.step_phase) != floorf(_step_phase):
				play("step", randf_range(0.88, 1.12), 1.15 if player.running else 0.78)
		_step_phase = player.step_phase
	_smooth_gain("rain", rain, (0.14 * cabin) if raining else 0.0, 1.8, delta)
