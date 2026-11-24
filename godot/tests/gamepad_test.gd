extends SceneTree
# Headless gamepad, glyph, analog brake-to-reverse, and menu focus checks:
# godot --headless --fixed-fps 120 --path godot -s tests/gamepad_test.gd

var _fails := 0


func _check(label: String, ok: bool, detail := "") -> void:
	print(("PASS  " if ok else "FAIL  ") + label + ("  " + detail if detail != "" else ""))
	if not ok:
		_fails += 1


func _initialize() -> void:
	_test_input_map()
	_test_prompt_glyphs()
	await _test_analog_brake_to_reverse()
	await _test_ui_and_touch()
	print("GAMEPAD_TEST %s (%d failed)" % ["OK" if _fails == 0 else "FAILED", _fails])
	quit(1 if _fails > 0 else 0)


func _test_input_map() -> void:
	var game_script: GDScript = load("res://scripts/game.gd")
	var game: Node3D = game_script.new()
	game._setup_input()

	var gameplay_actions := [
		"move_forward", "move_back", "move_left", "move_right",
		"look_left", "look_right", "look_up", "look_down",
		"gas", "reverse", "sprint", "handbrake", "interact",
		"view", "map", "pause", "horn", "lights", "reset_car",
		"auto_drive", "cinematic",
	]
	var ui_actions := [
		"ui_accept", "ui_cancel", "ui_up", "ui_down",
		"ui_left", "ui_right", "ui_focus_next", "ui_focus_prev",
	]
	var missing: Array[String] = []
	for act_name: String in gameplay_actions + ui_actions:
		if not InputMap.has_action(act_name):
			missing.append(act_name + "(missing)")
			continue
		var has_joy := false
		for ev in InputMap.action_get_events(act_name):
			if ev is InputEventJoypadButton or ev is InputEventJoypadMotion:
				has_joy = true
				break
		if not has_joy:
			missing.append(act_name + "(no_joy)")
	_check("all gameplay and ui_* actions have joypad bindings", missing.is_empty(), ", ".join(missing))

	var dz_ok := (
		is_equal_approx(InputMap.action_get_deadzone("move_left"), GamepadPrompts.DEADZONE_MOVE)
		and is_equal_approx(InputMap.action_get_deadzone("look_left"), GamepadPrompts.DEADZONE_LOOK)
		and is_equal_approx(InputMap.action_get_deadzone("gas"), GamepadPrompts.DEADZONE_TRIGGER)
		and is_equal_approx(InputMap.action_get_deadzone("reverse"), GamepadPrompts.DEADZONE_TRIGGER)
		and is_equal_approx(InputMap.action_get_deadzone("ui_up"), GamepadPrompts.DEADZONE_UI)
	)
	_check("input deadzones match documented values", dz_ok,
		"move=%.2f look=%.2f trig=%.2f ui=%.2f" % [
			InputMap.action_get_deadzone("move_left"),
			InputMap.action_get_deadzone("look_left"),
			InputMap.action_get_deadzone("gas"),
			InputMap.action_get_deadzone("ui_up"),
		])

	# Verify trigger axes are mapped on gas (RT) and reverse (LT).
	var has_rt := false
	for ev in InputMap.action_get_events("gas"):
		if ev is InputEventJoypadMotion and (ev as InputEventJoypadMotion).axis == JOY_AXIS_TRIGGER_RIGHT:
			has_rt = true
	var has_lt := false
	for ev in InputMap.action_get_events("reverse"):
		if ev is InputEventJoypadMotion and (ev as InputEventJoypadMotion).axis == JOY_AXIS_TRIGGER_LEFT:
			has_lt = true
	_check("analog triggers bound to gas (RT) and reverse (LT)", has_rt and has_lt)
	game.free()


func _test_prompt_glyphs() -> void:
	var xbox_names := [
		"Xbox Wireless Controller",
		"Xbox Series X Controller",
		"Xbox One S Controller",
		"XInput Gamepad",
		"Generic MFi Controller",
	]
	var xbox_ok := true
	for name: String in xbox_names:
		if GamepadPrompts.family_for_name(name) != "xbox":
			xbox_ok = false
	_check("Xbox and generic pad names resolve to xbox family", xbox_ok)

	var ps_names := [
		"DualSense Wireless Controller",
		"DualSense Edge Wireless Controller",
		"DualShock 4 Wireless Controller",
		"PS5 Controller",
		"PlayStation 5 Controller",
		"Wireless Controller",
		"Sony Interactive Entertainment Wireless Controller",
	]
	var ps_ok := true
	for name: String in ps_names:
		if GamepadPrompts.family_for_name(name) != "playstation":
			ps_ok = false
	_check("DualSense and PlayStation pad names resolve to playstation family", ps_ok)

	_check("empty pad name resolves to none and keyboard fallback",
		GamepadPrompts.family_for_name("") == ""
		and GamepadPrompts.mode_for_device("keyboard", "") == "keyboard"
		and GamepadPrompts.mode_for_device("touch", "") == "touch"
		and GamepadPrompts.mode_for_device("gamepad", "") == "xbox")

	var xbox_glyphs := (
		GamepadPrompts.glyph("interact", "xbox") == "A"
		and GamepadPrompts.glyph("handbrake", "xbox") == "B"
		and GamepadPrompts.glyph("view", "xbox") == "X"
		and GamepadPrompts.glyph("map", "xbox") == "Y"
		and GamepadPrompts.glyph("pause", "xbox") == "Menu"
		and GamepadPrompts.glyph("gas", "xbox") == "RT"
		and GamepadPrompts.glyph("reverse", "xbox") == "LT"
		and GamepadPrompts.prompt("interact", "Step out", "xbox") == "A · Step out"
	)
	_check("Xbox prompt glyphs match A/B/X/Y/Menu/LT/RT", xbox_glyphs)

	var ps_glyphs := (
		GamepadPrompts.glyph("interact", "playstation") == "×"
		and GamepadPrompts.glyph("handbrake", "playstation") == "○"
		and GamepadPrompts.glyph("view", "playstation") == "□"
		and GamepadPrompts.glyph("map", "playstation") == "△"
		and GamepadPrompts.glyph("pause", "playstation") == "Options"
		and GamepadPrompts.glyph("gas", "playstation") == "R2"
		and GamepadPrompts.glyph("reverse", "playstation") == "L2"
		and GamepadPrompts.prompt("interact", "Step out", "playstation") == "× · Step out"
	)
	_check("DualSense prompt glyphs match ×/○/□/△/Options/L2/R2", ps_glyphs)

	var kb_glyphs := (
		GamepadPrompts.prompt("interact", "Step out", "keyboard") == "E · Step out"
		and GamepadPrompts.glyph("pause", "keyboard") == "Esc"
		and GamepadPrompts.glyph("map", "keyboard") == "M"
	)
	_check("keyboard prompt glyphs preserved when no pad is active", kb_glyphs)

	var help_ok := (
		GamepadPrompts.start_help("xbox").contains("Menu pause")
		and GamepadPrompts.start_help("playstation").contains("Options pause")
		and GamepadPrompts.start_help("touch").contains("Touch Controls")
		and GamepadPrompts.start_help("keyboard").contains("WASD move")
	)
	_check("start screen help copy adapts to active input mode", help_ok)


func _test_analog_brake_to_reverse() -> void:
	var root3 := Node3D.new()
	root.add_child(root3)
	var ground := StaticBody3D.new()
	var cs := CollisionShape3D.new()
	var gb := BoxShape3D.new()
	gb.size = Vector3(2000, 10, 2000)
	cs.shape = gb
	cs.position.y = -5.0
	ground.add_child(cs)
	root3.add_child(ground)

	var v := Vehicle.create("model_y", Color.WHITE)
	root3.add_child(v)
	v.driver = "player"
	v.place(Vector2.ZERO, Vector2(0, 1))
	for i in 60:
		await physics_frame

	# Partial analog throttle (RT = 0.65) builds forward speed.
	v.throttle = 0.65
	v.brake_input = 0.0
	for i in 180:
		await physics_frame
	var fwd := v.forward_speed

	# Partial analog trigger reverse/brake (LT = 0.65) brakes to stop then reverses.
	var rev_axis := 0.65
	var stopped := false
	for i in 480:
		if rev_axis > 0.05 and v.forward_speed > 0.5:
			v.throttle = 0.0
			v.brake_input = rev_axis
		else:
			stopped = true
			v.throttle = -rev_axis
			v.brake_input = 0.0
		await physics_frame
	var rev_speed := v.forward_speed
	_check("analog trigger brake-to-reverse decelerates then reverses",
		fwd > 5.0 and stopped and rev_speed < -1.0,
		"fwd=%.1f m/s -> rev=%.1f m/s" % [fwd, rev_speed])

	root3.queue_free()
	await physics_frame
	CarVisual.clear_cache()


func _test_ui_and_touch() -> void:
	var data := CityData.new()
	data.config = CityData.CITIES["fall-river"]
	data.width = 1000.0
	data.height = 1000.0
	data.places = [
		{"name": "Battleship Cove", "pos": Vector2(100, 100), "desc": "Ships"},
		{"name": "Lizzie Borden House", "pos": Vector2(200, 200), "desc": "Historic house"},
	]
	var ui := GameUI.new()
	root.add_child(ui)
	ui.build(data)
	ui.set_places(data.places, {})
	ui.set_garage(["model_y", "hatch"], 0)
	await process_frame

	# Touch overlay hide/show, full-rect layout, & state reset.
	ui.show_state("playing")
	ui.touch_controls.set_active_visible(true)
	ui.touch_controls.stick.value = Vector2(0.8, -0.5)
	ui.touch_controls.set_driving(true)
	await process_frame
	var layout_ok := ui.touch_controls.size.x >= 100.0 and ui.touch_controls.size.y >= 100.0 and ui.touch_controls.stick.get_global_rect().position.y > 0.0
	var shown_ok := ui.touch_controls.visible and ui.touch_controls.brake_button.visible and layout_ok
	ui.touch_controls.set_active_visible(false)
	var hidden_ok := not ui.touch_controls.visible and ui.touch_controls.stick_vec() == Vector2.ZERO
	_check("touch overlay shows with full-rect layout, toggles brake when driving, and resets on hide", shown_ok and hidden_ok,
		"tc_size=%s stick_pos=%s" % [ui.touch_controls.size, ui.touch_controls.stick.get_global_rect().position])

	# Prompt mode switching updates UI labels.
	ui.set_prompt_mode("playstation")
	var ps_ui := ui.start_help_label.text.contains("Options pause") and ui.map_help_label.text.contains("R2/L2")
	ui.set_prompt_mode("xbox")
	var xb_ui := ui.start_help_label.text.contains("Menu pause") and ui.map_help_label.text.contains("RT/LT")
	_check("GameUI updates start/map/pause help for Xbox and DualSense", ps_ui and xb_ui)

	# Pause menu focus neighbors link settings column to garage column.
	ui.show_state("paused")
	var pause_focus_ok := (
		not ui.resume_button.focus_neighbor_bottom.is_empty()
		and not ui.resume_button.focus_neighbor_right.is_empty()
		and not ui.sensitivity_slider.focus_neighbor_top.is_empty()
		and not ui.sensitivity_slider.focus_neighbor_bottom.is_empty()
	)
	_check("pause menu focus neighbors link settings, sliders, and garage", pause_focus_ok)

	# Explorer's map: undiscovered landmark keeps Fast travel disabled with hint;
	# discovered landmark enables Fast travel and moves focus onto it.
	ui.show_state("map")
	var first_place: Button = ui.place_box.get_child(0) as Button
	first_place.pressed.emit()
	var locked_ok := ui.travel_button.disabled and ui.travel_button.text.contains("discover") and ui.travel_hint_label.text.contains("unlock Fast travel")

	ui.set_places(data.places, {"Battleship Cove": true})
	var discovered_place: Button = ui.place_box.get_child(0) as Button
	discovered_place.pressed.emit()
	var unlocked_ok := not ui.travel_button.disabled and ui.travel_button.text.contains("Battleship Cove") and not ui.travel_button.focus_neighbor_bottom.is_empty()
	_check("map Fast travel shows disabled hint when locked and enables when discovered", locked_ok and unlocked_ok)

	ui.queue_free()
	await process_frame
