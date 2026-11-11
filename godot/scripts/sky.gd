class_name Sky3D
extends Node3D
## Sun, moon, sky, fog, weather and the day-night clock. Drives the global
## shader parameters `night_amount` and `wetness`.

signal weather_changed(kind: String)

const DAY_SECONDS := 1440.0   # one in-game day per 24 real minutes

var hour := 9.5
var time_scale := 1.0
var weather := "clear"
var wetness := 0.0
var night := 0.0
var sun: DirectionalLight3D
var moon: DirectionalLight3D
var env: Environment
var sky_mat: ProceduralSkyMaterial
var rain: GPUParticles3D
var _weather_timer := 240.0
var _overcast := 0.0
var _rng := RandomNumberGenerator.new()
var quality := "high"


func _ready() -> void:
	_rng.randomize()
	sun = DirectionalLight3D.new()
	sun.shadow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	sun.directional_shadow_max_distance = 260.0
	sun.directional_shadow_blend_splits = true
	sun.shadow_bias = 0.04
	sun.shadow_normal_bias = 1.4
	add_child(sun)
	moon = DirectionalLight3D.new()
	moon.light_color = Color(0.55, 0.65, 0.9)
	moon.shadow_enabled = false
	moon.rotation_degrees = Vector3(-55, 40, 0)
	add_child(moon)
	sky_mat = ProceduralSkyMaterial.new()
	var sky := Sky.new()
	sky.sky_material = sky_mat
	sky.radiance_size = Sky.RADIANCE_SIZE_128
	sky.process_mode = Sky.PROCESS_MODE_INCREMENTAL
	env = Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_white = 6.0
	env.glow_enabled = true
	env.glow_intensity = 0.5
	env.glow_bloom = 0.08
	env.glow_hdr_threshold = 1.1
	env.fog_enabled = true
	env.fog_sun_scatter = 0.25
	env.fog_aerial_perspective = 0.6
	env.ssao_enabled = true
	env.ssao_radius = 1.6
	env.ssao_intensity = 1.6
	env.ssr_enabled = false
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)
	rain = GPUParticles3D.new()
	rain.amount = 5000
	rain.lifetime = 0.9
	rain.emitting = false
	rain.visibility_aabb = AABB(Vector3(-40, -30, -40), Vector3(80, 60, 80))
	var pm := ParticleProcessMaterial.new()
	pm.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	pm.emission_box_extents = Vector3(28, 1, 28)
	pm.direction = Vector3(0.12, -1, 0.05)
	pm.spread = 2.0
	pm.initial_velocity_min = 24.0
	pm.initial_velocity_max = 30.0
	pm.gravity = Vector3(0, -12, 0)
	rain.process_material = pm
	var drop := QuadMesh.new()
	drop.size = Vector2(0.025, 0.7)
	var dm := StandardMaterial3D.new()
	dm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	dm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	dm.albedo_color = Color(0.75, 0.82, 0.9, 0.32)
	dm.billboard_mode = BaseMaterial3D.BILLBOARD_FIXED_Y
	dm.cull_mode = BaseMaterial3D.CULL_DISABLED
	drop.material = dm
	rain.draw_pass_1 = drop
	rain.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(rain)
	set_quality(quality)
	_apply()


func set_quality(q: String) -> void:
	quality = q
	if env == null:
		return
	var high := q == "high"
	env.ssao_enabled = high
	env.glow_enabled = true
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS if high else DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun.directional_shadow_max_distance = 260.0 if high else 140.0
	rain.amount = 5000 if high else 2200


func set_weather(kind: String) -> void:
	if kind == weather:
		return
	weather = kind
	weather_changed.emit(kind)


func clock_text() -> String:
	var h := int(hour) % 24
	var m := int((hour - floorf(hour)) * 60.0)
	return "%02d:%02d" % [h, m]


func is_night() -> bool:
	return night > 0.5


func update(delta: float, focus: Vector3) -> void:
	hour = fposmod(hour + delta * time_scale * 24.0 / DAY_SECONDS, 24.0)
	_weather_timer -= delta * time_scale
	if _weather_timer <= 0.0:
		_weather_timer = _rng.randf_range(180.0, 420.0)
		var roll := _rng.randf()
		set_weather("rain" if roll < 0.22 else ("overcast" if roll < 0.45 else "clear"))
	var wet_target := 1.0 if weather == "rain" else 0.0
	wetness = move_toward(wetness, wet_target, delta * (0.08 if wet_target > wetness else 0.012))
	_overcast = move_toward(_overcast, 0.0 if weather == "clear" else 1.0, delta * 0.12)
	rain.emitting = weather == "rain"
	rain.global_position = focus + Vector3(0, 16, 0)
	_apply()


func _apply() -> void:
	# Sun rises at 6:00 in the east (+X), peaks at noon, sets at 18:00.
	var day_angle := (hour - 6.0) / 12.0 * PI
	var elevation := sin(day_angle)
	var dir := Vector3(cos(day_angle), maxf(elevation, -0.35), -0.42).normalized()
	sun.look_at_from_position(Vector3.ZERO, -dir, Vector3.UP)
	var daylight := smoothstep(-0.06, 0.22, elevation)
	night = 1.0 - smoothstep(-0.12, 0.14, elevation)
	var golden := 1.0 - smoothstep(0.0, 0.42, absf(elevation))
	var cloud := _overcast
	sun.light_energy = daylight * lerpf(1.25, 0.28, cloud)
	sun.light_color = Color(1.0, 0.96, 0.9).lerp(Color(1.0, 0.62, 0.36), golden * (1.0 - cloud))
	sun.visible = daylight > 0.01
	sun.shadow_enabled = daylight > 0.05
	moon.light_energy = night * 0.32
	moon.visible = night > 0.02
	var top_day := Color(0.22, 0.42, 0.74).lerp(Color(0.4, 0.44, 0.5), cloud)
	var hor_day := Color(0.66, 0.76, 0.86).lerp(Color(0.6, 0.62, 0.65), cloud)
	var top_dusk := Color(0.2, 0.24, 0.45)
	var hor_dusk := Color(0.95, 0.56, 0.32).lerp(Color(0.5, 0.48, 0.5), cloud)
	var top_night := Color(0.03, 0.045, 0.1)
	var hor_night := Color(0.11, 0.13, 0.2)
	var top := top_day.lerp(top_dusk, golden).lerp(top_night, night)
	var hor := hor_day.lerp(hor_dusk, golden).lerp(hor_night, night)
	sky_mat.sky_top_color = top
	sky_mat.sky_horizon_color = hor
	sky_mat.ground_bottom_color = hor.darkened(0.55)
	sky_mat.ground_horizon_color = hor
	sky_mat.sun_angle_max = 28.0
	sky_mat.sky_energy_multiplier = lerpf(1.0, 0.75, cloud)
	env.ambient_light_energy = lerpf(1.0, 1.6, night)
	env.fog_light_color = hor.lerp(top, 0.25)
	env.fog_density = lerpf(0.00042, 0.0024, maxf(cloud * 0.6, wetness)) + night * 0.0002
	RenderingServer.global_shader_parameter_set("night_amount", night)
	RenderingServer.global_shader_parameter_set("wetness", wetness)
