class_name TouchControls
extends Control
## Compact on-screen touch overlay for iPhone play without a gamepad:
## a left virtual thumbstick (move / steer + throttle) and right-side action
## buttons (interact, brake while driving, map, view, pause). Hidden while a
## controller or desktop keyboard is active.

signal interact_pressed
signal map_pressed
signal pause_pressed
signal view_pressed
signal handbrake_changed(pressed: bool)

const DEADZONE := 0.12

class VirtualStick:
	extends Control
	var value := Vector2.ZERO
	var driving := false
	var touch_index := -1
	var _knob := Vector2.ZERO
	var _mouse_active := false

	func reset() -> void:
		touch_index = -1
		_mouse_active = false
		_knob = Vector2.ZERO
		value = Vector2.ZERO
		queue_redraw()

	func _radius() -> float:
		return minf(size.x, size.y) * 0.5 - 6.0

	func _update_knob(local_pos: Vector2) -> void:
		var center := size * 0.5
		var max_r := maxf(24.0, _radius() - 22.0)
		var delta := local_pos - center
		var dist := delta.length()
		if dist > max_r:
			delta = delta / dist * max_r
		_knob = delta
		var raw := delta / max_r
		var mag := raw.length()
		if mag <= DEADZONE:
			value = Vector2.ZERO
		else:
			value = raw.normalized() * clampf((mag - DEADZONE) / (1.0 - DEADZONE), 0.0, 1.0)
		queue_redraw()

	func _gui_input(event: InputEvent) -> void:
		if event is InputEventScreenTouch:
			var st := event as InputEventScreenTouch
			if st.pressed and touch_index == -1:
				touch_index = st.index
				_update_knob(st.position)
				accept_event()
			elif not st.pressed and st.index == touch_index:
				reset()
				accept_event()
		elif event is InputEventScreenDrag:
			var sd := event as InputEventScreenDrag
			if sd.index == touch_index:
				_update_knob(sd.position)
				accept_event()
		elif event is InputEventMouseButton and event.device != InputEvent.DEVICE_ID_EMULATION:
			var mb := event as InputEventMouseButton
			if mb.button_index == MOUSE_BUTTON_LEFT:
				if mb.pressed:
					_mouse_active = true
					_update_knob(mb.position)
					accept_event()
				elif _mouse_active:
					reset()
					accept_event()
		elif event is InputEventMouseMotion and _mouse_active and event.device != InputEvent.DEVICE_ID_EMULATION:
			_update_knob((event as InputEventMouseMotion).position)
			accept_event()

	func _draw() -> void:
		var center := size * 0.5
		var r := _radius()
		draw_circle(center, r, Color(0.09, 0.15, 0.135, 0.72))
		draw_arc(center, r, 0.0, TAU, 48, Color(0.95, 0.96, 0.91, 0.24), 1.5, true)
		var active := touch_index != -1 or _mouse_active
		var tick_col := Color(0.77, 0.96, 0.47, 0.5) if active else Color(0.95, 0.96, 0.91, 0.25)
		for dir: Vector2 in [Vector2.UP, Vector2.DOWN, Vector2.LEFT, Vector2.RIGHT]:
			draw_line(center + dir * (r - 12.0), center + dir * (r - 5.0), tick_col, 2.0, true)
		var knob_pos := center + _knob
		var knob_fill := GameUI.LIME if active else Color(0.95, 0.96, 0.91, 0.22)
		var knob_border := GameUI.LIME if active else Color(0.95, 0.96, 0.91, 0.48)
		draw_circle(knob_pos, 26.0, knob_fill)
		draw_arc(knob_pos, 26.0, 0.0, TAU, 32, knob_border, 2.0, true)
		var font := get_theme_default_font()
		var caption := "STEER" if driving else "MOVE"
		var sz := font.get_string_size(caption, HORIZONTAL_ALIGNMENT_CENTER, -1, 11)
		draw_string(font, Vector2(center.x - sz.x * 0.5, size.y - 10.0), caption, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, GameUI.MUTED)


var stick: VirtualStick
var interact_button: Button
var brake_button: Button
var map_button: Button
var view_button: Button
var pause_button: Button
var _driving := false
var _interact_highlighted := false


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_build()


func _pill_style(bg: Color, border: Color, border_width := 1) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.set_corner_radius_all(10)
	sb.set_content_margin_all(10)
	sb.border_color = border
	sb.set_border_width_all(border_width)
	return sb


func _touch_button(text: String, min_size: Vector2, accent := false) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = min_size
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_size_override("font_size", 15)
	_apply_button_style(b, accent)
	return b


func _apply_button_style(b: Button, accent: bool) -> void:
	var bg := Color(0.77, 0.96, 0.47, 0.92) if accent else Color(0.09, 0.15, 0.135, 0.78)
	var border := GameUI.LIME if accent else Color(1, 1, 1, 0.22)
	var fg := GameUI.INK if accent else GameUI.CREAM
	b.add_theme_stylebox_override("normal", _pill_style(bg, border, 2 if accent else 1))
	b.add_theme_stylebox_override("hover", _pill_style(bg.lightened(0.08), GameUI.LIME, 2))
	b.add_theme_stylebox_override("pressed", _pill_style(GameUI.LIME, GameUI.LIME, 2))
	for key in ["font_color", "font_hover_color", "font_focus_color"]:
		b.add_theme_color_override(key, fg)
	b.add_theme_color_override("font_pressed_color", GameUI.INK)


func _build() -> void:
	# Left virtual stick sits cleanly to the right of the bottom-left minimap.
	stick = VirtualStick.new()
	stick.name = "VirtualStick"
	stick.custom_minimum_size = Vector2(146, 146)
	stick.anchor_left = 0.0
	stick.anchor_right = 0.0
	stick.anchor_top = 1.0
	stick.anchor_bottom = 1.0
	stick.offset_left = 294.0
	stick.offset_right = 440.0
	stick.offset_top = -176.0
	stick.offset_bottom = -30.0
	add_child(stick)

	# Right-side action cluster sits neatly above the bottom-right speedometer.
	var cluster := VBoxContainer.new()
	cluster.name = "TouchActions"
	cluster.add_theme_constant_override("separation", 10)
	cluster.alignment = BoxContainer.ALIGNMENT_END
	cluster.anchor_left = 1.0
	cluster.anchor_right = 1.0
	cluster.anchor_top = 1.0
	cluster.anchor_bottom = 1.0
	cluster.offset_left = -258.0
	cluster.offset_right = -22.0
	cluster.offset_top = -286.0
	cluster.offset_bottom = -168.0
	add_child(cluster)

	var util_row := HBoxContainer.new()
	util_row.add_theme_constant_override("separation", 8)
	util_row.alignment = BoxContainer.ALIGNMENT_END
	cluster.add_child(util_row)

	map_button = _touch_button("Map", Vector2(72, 42))
	map_button.name = "TouchMap"
	map_button.pressed.connect(func() -> void: map_pressed.emit())
	util_row.add_child(map_button)

	view_button = _touch_button("View", Vector2(72, 42))
	view_button.name = "TouchView"
	view_button.pressed.connect(func() -> void: view_pressed.emit())
	util_row.add_child(view_button)

	pause_button = _touch_button("Pause", Vector2(76, 42))
	pause_button.name = "TouchPause"
	pause_button.pressed.connect(func() -> void: pause_pressed.emit())
	util_row.add_child(pause_button)

	var action_row := HBoxContainer.new()
	action_row.add_theme_constant_override("separation", 8)
	action_row.alignment = BoxContainer.ALIGNMENT_END
	cluster.add_child(action_row)

	brake_button = _touch_button("Brake", Vector2(86, 54))
	brake_button.name = "TouchBrake"
	brake_button.visible = false
	brake_button.button_down.connect(func() -> void: handbrake_changed.emit(true))
	brake_button.button_up.connect(func() -> void: handbrake_changed.emit(false))
	action_row.add_child(brake_button)

	interact_button = _touch_button("Interact", Vector2(142, 54))
	interact_button.name = "TouchInteract"
	interact_button.pressed.connect(func() -> void: interact_pressed.emit())
	action_row.add_child(interact_button)


func stick_vec() -> Vector2:
	return stick.value if visible and stick != null else Vector2.ZERO


func stick_touch_index() -> int:
	return stick.touch_index if stick != null else -1


func set_active_visible(show_overlay: bool) -> void:
	visible = show_overlay
	if not show_overlay:
		if stick != null:
			stick.reset()
		handbrake_changed.emit(false)


func set_driving(driving: bool) -> void:
	if _driving == driving:
		return
	_driving = driving
	if stick != null:
		stick.driving = driving
		stick.queue_redraw()
	if brake_button != null:
		brake_button.visible = driving
	if not driving:
		handbrake_changed.emit(false)


func set_interact_hint(label: String, highlighted: bool) -> void:
	if interact_button == null:
		return
	var next_text := label if label != "" else "Interact"
	if interact_button.text != next_text:
		interact_button.text = next_text
	if _interact_highlighted != highlighted:
		_interact_highlighted = highlighted
		_apply_button_style(interact_button, highlighted)
