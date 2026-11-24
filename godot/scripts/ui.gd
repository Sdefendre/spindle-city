class_name GameUI
extends CanvasLayer
## HUD, start screen, pause menu, garage and the full map. Built in code so
## the whole interface lives in one readable file.

signal play_pressed
signal resume_pressed
signal quality_changed(quality: String)
signal volume_changed(value: float)
signal sensitivity_changed(value: float)
signal invert_y_changed(inverted: bool)
signal city_chosen(city_id: String)
signal car_requested(car_type: String)
signal waypoint_set(pos: Vector2, label: String)
signal fast_travel(pos: Vector2, label: String)
signal time_skip
signal shortcut(kind: String)
signal quit_pressed

const INK := Color("14221f")
const PANEL := Color(0.09, 0.15, 0.135, 0.9)
const LIME := Color("c4f678")
const CREAM := Color("f1f4e9")
const GOLD := Color("e5be6b")
const MUTED := Color("a9b7a6")

class MiniMap:
	extends Control
	var data: CityData
	var center := Vector2.ZERO
	var heading := Vector2.DOWN
	var route := PackedVector2Array()
	var markers: Array = []   # [{pos, color}]
	var cars: Array = []      # [Vector2]
	var span := 260.0

	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, size), Color(0.13, 0.26, 0.22))
		if data == null:
			return
		var scale := size.x / span
		var half := size * 0.5
		var view := Rect2(center - half / scale, size / scale)
		for a in data.areas:
			if view.intersects(a["rect"]):
				_poly(a["p"], Color(0.2, 0.36, 0.2), scale, half)
		for w in data.waters:
			if view.intersects(w["rect"]):
				_poly(w["p"], Color(0.14, 0.34, 0.4), scale, half)
		var c0 := Vector2i(floori(view.position.x / CityData.CELL), floori(view.position.y / CityData.CELL))
		var c1 := Vector2i(floori(view.end.x / CityData.CELL), floori(view.end.y / CityData.CELL))
		var seen := {}
		for cx in range(c0.x, c1.x + 1):
			for cy in range(c0.y, c1.y + 1):
				var key := Vector2i(cx, cy)
				if not data._seg_grid.has(key):
					continue
				for code: int in data._seg_grid[key]:
					if seen.has(code):
						continue
					seen[code] = true
					@warning_ignore("integer_division")
					var r: Dictionary = data.roads[code / 4096]
					var p: PackedVector2Array = r["p"]
					var s := code % 4096
					var col := Color(0.42, 0.47, 0.45) if r["drive"] else Color(0.6, 0.57, 0.46, 0.6)
					if r["fast"]:
						col = Color(0.7, 0.62, 0.42)
					draw_line((p[s] - center) * scale + half, (p[s + 1] - center) * scale + half, col, maxf(1.5, r["width"] * scale * 0.8))
		if route.size() > 1:
			var pts := PackedVector2Array()
			for q in route:
				pts.append((q - center) * scale + half)
			draw_polyline(pts, LIME, 3.0)
		for car: Vector2 in cars:
			var q := (car - center) * scale + half
			if Rect2(Vector2.ZERO, size).has_point(q):
				draw_rect(Rect2(q - Vector2(1.5, 1.5), Vector2(3, 3)), Color(0.85, 0.87, 0.82, 0.8))
		for m: Dictionary in markers:
			var q: Vector2 = ((m["pos"] as Vector2) - center) * scale + half
			var edge := q.clamp(Vector2(7, 7), size - Vector2(7, 7))
			draw_circle(edge, 5.0 if edge == q else 3.5, m["color"])
		var fwd := heading.normalized()
		var side := Vector2(-fwd.y, fwd.x)
		draw_colored_polygon(PackedVector2Array([half + fwd * 9.0, half - fwd * 6.0 + side * 6.0, half - fwd * 6.0 - side * 6.0]), Color.WHITE)
		draw_rect(Rect2(Vector2.ZERO, size), Color(1, 1, 1, 0.18), false, 1.0)

	func _poly(p: PackedVector2Array, color: Color, scale: float, half: Vector2) -> void:
		if p.size() > 400:
			# Too large to triangulate every frame; an outline is enough here.
			var line := PackedVector2Array()
			for q in p:
				line.append((q - center) * scale + half)
			draw_polyline(line, color.lightened(0.2), 2.0)
			return
		var pts := PackedVector2Array()
		for q in p:
			pts.append((q - center) * scale + half)
		if Geometry2D.triangulate_polygon(pts).size() > 0:
			draw_colored_polygon(pts, color)


class BigMap:
	extends Control
	signal picked(pos: Vector2)
	var data: CityData
	var image: ImageTexture
	var zoom := 1.0
	var pan := Vector2.ZERO
	var player := Vector2.ZERO
	var heading := Vector2.DOWN
	var route := PackedVector2Array()
	var markers: Array = []
	var _dragging := false
	var _moved := 0.0

	func _base_scale() -> float:
		return minf(size.x / data.width, size.y / data.height)

	func to_screen(p: Vector2) -> Vector2:
		var s := _base_scale() * zoom
		return size * 0.5 + (p - Vector2(data.width, data.height) * 0.5 - pan) * s

	func to_map(q: Vector2) -> Vector2:
		var s := _base_scale() * zoom
		return (q - size * 0.5) / s + Vector2(data.width, data.height) * 0.5 + pan

	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, size), Color(0.1, 0.2, 0.17))
		if data == null:
			return
		var s := _base_scale() * zoom
		if image != null:
			draw_texture_rect(image, Rect2(to_screen(Vector2.ZERO), Vector2(data.width, data.height) * s), false)
		if route.size() > 1:
			var pts := PackedVector2Array()
			for q in route:
				pts.append(to_screen(q))
			draw_polyline(pts, LIME, 4.0)
		var font := get_theme_default_font()
		var placed: Array[Rect2] = []
		for m: Dictionary in markers:
			var q := to_screen(m["pos"])
			draw_circle(q, 7.0, Color(0, 0, 0, 0.55))
			draw_circle(q, 5.5, m["color"])
			placed.append(Rect2(q.x - 8, q.y - 8, 16, 16))
		for m: Dictionary in markers:
			var q := to_screen(m["pos"])
			if m.has("label"):
				var text: String = str(m["label"])
				var sz := font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, 14)
				var pos := q + Vector2(10, 5)
				var candidates := [Vector2(10, 5), Vector2(-sz.x - 10, 5), Vector2(10, -13), Vector2(10, 21), Vector2(-sz.x - 10, -13), Vector2(-sz.x - 10, 21)]
				for off: Vector2 in candidates:
					var cand := q + off
					var rect := Rect2(cand.x - 2, cand.y - 13, sz.x + 6, 17)
					var hit := false
					for prev in placed:
						if prev.intersects(rect):
							hit = true
							break
					if not hit:
						pos = cand
						break
				placed.append(Rect2(pos.x - 2, pos.y - 13, sz.x + 6, 17))
				draw_string_outline(font, pos, text, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, 4, Color(0, 0, 0, 0.85))
				draw_string(font, pos, text, HORIZONTAL_ALIGNMENT_LEFT, -1, 14, CREAM)
		var c := to_screen(player)
		var fwd := heading.normalized()
		var side := Vector2(-fwd.y, fwd.x)
		draw_colored_polygon(PackedVector2Array([c + fwd * 12.0, c - fwd * 8.0 + side * 8.0, c - fwd * 8.0 - side * 8.0]), Color.WHITE)

	func pan_by(delta_screen: Vector2) -> void:
		pan += delta_screen / (_base_scale() * zoom)
		queue_redraw()

	func zoom_by(factor: float) -> void:
		zoom = clampf(zoom * factor, 1.0, 12.0)
		queue_redraw()

	func _gui_input(event: InputEvent) -> void:
		if event is InputEventMouseButton:
			var mb := event as InputEventMouseButton
			if mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed:
				zoom = minf(zoom * 1.2, 12.0)
				queue_redraw()
			elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed:
				zoom = maxf(zoom / 1.2, 1.0)
				queue_redraw()
			elif mb.button_index == MOUSE_BUTTON_LEFT:
				if mb.pressed:
					_dragging = true
					_moved = 0.0
				else:
					_dragging = false
					if _moved < 6.0:
						picked.emit(to_map(mb.position))
		elif event is InputEventMouseMotion and _dragging:
			var mm := event as InputEventMouseMotion
			_moved += mm.relative.length()
			pan -= mm.relative / (_base_scale() * zoom)
			queue_redraw()

	## Render the whole city once into a texture.
	func bake() -> void:
		var w := 1024
		var h := int(1024.0 * data.height / data.width)
		var img := Image.create(w, h, false, Image.FORMAT_RGB8)
		img.fill(Color(0.3, 0.36, 0.3))
		var s := float(w) / data.width
		for a in data.areas:
			_fill(img, a["p"], s, Color(0.24, 0.42, 0.24))
		for water in data.waters:
			_fill(img, water["p"], s, Color(0.16, 0.36, 0.42))
		for b in data.buildings:
			var rect: Rect2 = b["rect"]
			img.fill_rect(Rect2i(Vector2i(rect.position * s), Vector2i((rect.size * s).ceil())), Color(0.52, 0.46, 0.4))
		for r in data.roads:
			var p: PackedVector2Array = r["p"]
			var col := Color(0.2, 0.24, 0.24) if r["drive"] else Color(0.66, 0.62, 0.5)
			if r["fast"]:
				col = Color(0.78, 0.66, 0.4)
			var thick := maxi(1, int(r["width"] * s * 0.5))
			for i in range(p.size() - 1):
				_line(img, p[i] * s, p[i + 1] * s, col, thick)
		image = ImageTexture.create_from_image(img)

	func _fill(img: Image, p: PackedVector2Array, s: float, color: Color) -> void:
		# Scanline fill; fine for a one-off bake.
		var rect := CityData.poly_rect(p)
		var y0 := maxi(0, int(rect.position.y * s))
		var y1 := mini(img.get_height() - 1, int(rect.end.y * s))
		for y in range(y0, y1 + 1):
			var my := (float(y) + 0.5) / s
			var xs: Array[float] = []
			for i in p.size():
				var a := p[i]
				var b := p[(i + 1) % p.size()]
				if (a.y > my) != (b.y > my):
					xs.append(a.x + (my - a.y) / (b.y - a.y) * (b.x - a.x))
			xs.sort()
			for k in range(0, xs.size() - 1, 2):
				var x0 := maxi(0, int(xs[k] * s))
				var x1 := mini(img.get_width() - 1, int(xs[k + 1] * s))
				if x1 >= x0:
					img.fill_rect(Rect2i(x0, y, x1 - x0 + 1, 1), color)

	func _line(img: Image, a: Vector2, b: Vector2, color: Color, thick: int) -> void:
		var steps := maxi(1, int(a.distance_to(b)))
		for i in steps + 1:
			var q := a.lerp(b, float(i) / steps)
			img.fill_rect(Rect2i(int(q.x) - thick / 2, int(q.y) - thick / 2, thick, thick), color)


var data: CityData
var minimap: MiniMap
var bigmap: BigMap
var hud: Control
var start_panel: Control
var pause_panel: Control
var map_panel: Control
var garage_box: VBoxContainer
var place_box: VBoxContainer
var street_label: Label
var city_label: Label
var brand_label: Label
var money_label: Label
var speed_label: Label
var unit_label: Label
var clock_label: Label
var weather_label: Label
var mode_label: Label
var prompt_label: Label
var toast_label: Label
var job_panel: PanelContainer
var job_title: Label
var job_line: Label
var job_clock: Label
var progress_label: Label
var load_bar: ProgressBar
var load_label: Label
var play_button: Button
var quality_button: Button
var volume_slider: HSlider
var sensitivity_slider: HSlider
var invert_button: Button
var travel_button: Button
var gps_label: Label
var stats_label: Label
var _toast_time := 0.0
var _quality := "high"
var _invert_y := false
var _selected_place := -1
var places: Array = []
var found := {}


static func _box(color: Color, radius := 8, border := Color.TRANSPARENT) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = color
	sb.set_corner_radius_all(radius)
	sb.set_content_margin_all(14)
	if border.a > 0.0:
		sb.border_color = border
		sb.set_border_width_all(1)
	return sb


func _label(text: String, size: int, color := CREAM, bold := false, hud_shadow := false) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	if bold:
		l.add_theme_constant_override("outline_size", 2)
		l.add_theme_color_override("font_outline_color", Color(0.03, 0.06, 0.05, 0.85) if hud_shadow else color)
	if hud_shadow:
		l.add_theme_color_override("font_shadow_color", Color(0.02, 0.04, 0.04, 0.88))
		l.add_theme_constant_override("shadow_offset_x", 1)
		l.add_theme_constant_override("shadow_offset_y", 2)
		l.add_theme_constant_override("shadow_outline_size", 4)
	return l


func _button(text: String, primary := false) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(0, 44)
	b.add_theme_font_size_override("font_size", 17)
	b.add_theme_stylebox_override("normal", _box(LIME if primary else Color(1, 1, 1, 0.07), 6, Color(1, 1, 1, 0.14)))
	b.add_theme_stylebox_override("hover", _box(LIME.lightened(0.2) if primary else Color(1, 1, 1, 0.16), 6, LIME))
	b.add_theme_stylebox_override("pressed", _box(LIME.darkened(0.15) if primary else Color(1, 1, 1, 0.22), 6, LIME))
	b.add_theme_stylebox_override("focus", _box(Color(0, 0, 0, 0), 6, LIME))
	b.add_theme_stylebox_override("disabled", _box(Color(1, 1, 1, 0.04), 6))
	var fg := INK if primary else CREAM
	for key in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]:
		b.add_theme_color_override(key, fg)
	return b


func _panel(color := PANEL) -> PanelContainer:
	var p := PanelContainer.new()
	p.add_theme_stylebox_override("panel", _box(color, 10, Color(1, 1, 1, 0.12)))
	return p


func _anchor(c: Control, preset: Control.LayoutPreset, margin := 22) -> void:
	c.set_anchors_and_offsets_preset(preset, Control.PRESET_MODE_MINSIZE, margin)


func build(city: CityData) -> void:
	data = city
	layer = 10
	hud = Control.new()
	hud.set_anchors_preset(Control.PRESET_FULL_RECT)
	hud.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(hud)
	_build_hud()
	_build_map()
	_build_pause()
	_build_start()
	hud.visible = false


func _build_hud() -> void:
	var margin := MarginContainer.new()
	margin.set_anchors_preset(Control.PRESET_FULL_RECT)
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for side in ["left", "top", "right", "bottom"]:
		margin.add_theme_constant_override("margin_" + side, 22)
	hud.add_child(margin)
	var column := VBoxContainer.new()
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_child(column)
	var top_row := HBoxContainer.new()
	top_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(top_row)
	var spacer := Control.new()
	spacer.size_flags_vertical = Control.SIZE_EXPAND_FILL
	spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(spacer)
	var bottom_row := HBoxContainer.new()
	bottom_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.add_child(bottom_row)

	var top := VBoxContainer.new()
	top.add_theme_constant_override("separation", 0)
	top.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top_row.add_child(top)
	brand_label = _label(str(data.config["brand"]), 15, LIME, true, true)
	street_label = _label("", 30, CREAM, true, true)
	city_label = _label(str(data.config["name"]).to_upper() + ", MASSACHUSETTS", 12, CREAM.lerp(MUTED, 0.45), false, true)
	top.add_child(brand_label)
	top.add_child(street_label)
	top.add_child(city_label)

	var right := VBoxContainer.new()
	right.add_theme_constant_override("separation", 10)
	right.custom_minimum_size = Vector2(300, 0)
	top_row.add_child(right)
	var cash := _panel()
	var cash_row := HBoxContainer.new()
	cash.add_child(cash_row)
	money_label = _label("$0", 24, LIME, true)
	progress_label = _label("0 / 7 places", 13, MUTED)
	progress_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	progress_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	progress_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	cash_row.add_child(money_label)
	cash_row.add_child(progress_label)
	right.add_child(cash)
	job_panel = _panel()
	var job_box := VBoxContainer.new()
	job_panel.add_child(job_box)
	job_title = _label("", 13, LIME, true)
	job_line = _label("", 17)
	job_clock = _label("", 26, CREAM, true)
	job_box.add_child(job_title)
	job_box.add_child(job_line)
	job_box.add_child(job_clock)
	job_panel.visible = false
	right.add_child(job_panel)
	gps_label = _label("", 14, GOLD, false, true)
	gps_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	right.add_child(gps_label)

	var map_box := VBoxContainer.new()
	map_box.add_theme_constant_override("separation", 4)
	bottom_row.add_child(map_box)
	minimap = MiniMap.new()
	minimap.data = data
	minimap.custom_minimum_size = Vector2(250, 200)
	minimap.clip_contents = true
	map_box.add_child(minimap)
	mode_label = _label("ON FOOT", 12, LIME, true, true)
	map_box.add_child(mode_label)
	var gap := Control.new()
	gap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	gap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bottom_row.add_child(gap)

	var gauge := VBoxContainer.new()
	gauge.add_theme_constant_override("separation", -4)
	gauge.alignment = BoxContainer.ALIGNMENT_END
	gauge.custom_minimum_size = Vector2(240, 0)
	bottom_row.add_child(gauge)
	unit_label = _label("EXPLORING", 12, LIME, true, true)
	unit_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	speed_label = _label("", 54, CREAM, true, true)
	speed_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	clock_label = _label("09:30", 26, CREAM, false, true)
	clock_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	weather_label = _label("CLEAR", 12, CREAM.lerp(MUTED, 0.35), false, true)
	weather_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	gauge.add_child(unit_label)
	gauge.add_child(speed_label)
	gauge.add_child(clock_label)
	gauge.add_child(weather_label)

	prompt_label = _label("", 18, CREAM)
	prompt_label.add_theme_stylebox_override("normal", _box(PANEL, 6, Color(1, 1, 1, 0.15)))
	prompt_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hud.add_child(prompt_label)
	prompt_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM, Control.PRESET_MODE_MINSIZE, 120)
	prompt_label.grow_horizontal = Control.GROW_DIRECTION_BOTH
	prompt_label.visible = false

	toast_label = _label("", 18, CREAM)
	toast_label.add_theme_stylebox_override("normal", _box(PANEL, 6, LIME))
	toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(toast_label)
	toast_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP, Control.PRESET_MODE_MINSIZE, 26)
	toast_label.grow_horizontal = Control.GROW_DIRECTION_BOTH
	toast_label.visible = false


func _overlay() -> ColorRect:
	var bg := ColorRect.new()
	bg.color = Color(0.03, 0.07, 0.06, 0.78)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	return bg


func _build_start() -> void:
	start_panel = _overlay()
	(start_panel as ColorRect).color = Color(0.05, 0.1, 0.09, 1.0)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 14)
	box.custom_minimum_size = Vector2(460, 0)
	start_panel.add_child(box)
	box.set_anchors_and_offsets_preset(Control.PRESET_CENTER_LEFT, Control.PRESET_MODE_MINSIZE, 90)
	box.add_child(_label("WELCOME TO " + str(data.config["name"]).to_upper(), 14, LIME, true))
	var title := _label("See it from\nthe street.", 64, CREAM, true)
	box.add_child(title)
	var copy := _label("Real %s streets, rebuilt as an open world.\nWalk, drive, take jobs and find every landmark." % data.config["name"], 17, MUTED)
	box.add_child(copy)
	load_bar = ProgressBar.new()
	load_bar.custom_minimum_size = Vector2(0, 10)
	load_bar.show_percentage = false
	load_bar.add_theme_stylebox_override("background", _box(Color(1, 1, 1, 0.08), 4))
	load_bar.add_theme_stylebox_override("fill", _box(LIME, 4))
	box.add_child(load_bar)
	load_label = _label("Loading map data…", 14, MUTED)
	box.add_child(load_label)
	play_button = _button("Building the city…", true)
	play_button.disabled = true
	play_button.pressed.connect(func() -> void: play_pressed.emit())
	box.add_child(play_button)
	var other: String = "new-bedford" if data.config["id"] == "fall-river" else "fall-river"
	var switch := _button("Go to %s instead" % CityData.CITIES[other]["name"])
	switch.pressed.connect(func() -> void: city_chosen.emit(other))
	box.add_child(switch)
	var quit := _button("Quit")
	quit.pressed.connect(func() -> void: quit_pressed.emit())
	box.add_child(quit)
	box.add_child(_label("WASD move · Mouse look · Shift run · E enter / interact · V view · M map\nSpace handbrake · F auto drive · H horn · L lights · R reset car · Esc pause\nController: sticks, RT gas, LT brake, A interact, B handbrake, X view, Y map", 13, MUTED))


func _build_pause() -> void:
	pause_panel = _overlay()
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 20)
	pause_panel.add_child(row)
	row.set_anchors_and_offsets_preset(Control.PRESET_CENTER, Control.PRESET_MODE_MINSIZE)
	row.grow_horizontal = Control.GROW_DIRECTION_BOTH
	row.grow_vertical = Control.GROW_DIRECTION_BOTH
	var left := _panel()
	left.custom_minimum_size = Vector2(380, 0)
	row.add_child(left)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 10)
	left.add_child(box)
	box.add_child(_label("TAKE A BREATHER", 13, LIME, true))
	box.add_child(_label("City on pause.", 38, CREAM, true))
	var resume := _button("Back to the streets", true)
	resume.name = "Resume"
	resume.pressed.connect(func() -> void: resume_pressed.emit())
	box.add_child(resume)
	quality_button = _button("Graphics: High")
	quality_button.pressed.connect(func() -> void:
		_quality = "balanced" if _quality == "high" else "high"
		set_quality(_quality)
		quality_changed.emit(_quality))
	box.add_child(quality_button)
	box.add_child(_label("Volume", 13, MUTED))
	volume_slider = HSlider.new()
	volume_slider.min_value = 0.0
	volume_slider.max_value = 1.0
	volume_slider.step = 0.05
	volume_slider.value = 0.8
	volume_slider.custom_minimum_size = Vector2(0, 24)
	volume_slider.value_changed.connect(func(v: float) -> void: volume_changed.emit(v))
	box.add_child(volume_slider)
	box.add_child(_label("Look sensitivity", 13, MUTED))
	sensitivity_slider = HSlider.new()
	sensitivity_slider.min_value = 0.4
	sensitivity_slider.max_value = 2.0
	sensitivity_slider.step = 0.05
	sensitivity_slider.value = 1.0
	sensitivity_slider.custom_minimum_size = Vector2(0, 24)
	sensitivity_slider.value_changed.connect(func(v: float) -> void: sensitivity_changed.emit(v))
	box.add_child(sensitivity_slider)
	invert_button = _button("Invert look Y: Off")
	invert_button.pressed.connect(func() -> void:
		set_invert_y(not _invert_y)
		invert_y_changed.emit(_invert_y))
	box.add_child(invert_button)
	var skip := _button("Skip ahead six hours")
	skip.pressed.connect(func() -> void: time_skip.emit())
	box.add_child(skip)
	var other: String = "new-bedford" if data.config["id"] == "fall-river" else "fall-river"
	var switch := _button("Travel to %s" % CityData.CITIES[other]["name"])
	switch.pressed.connect(func() -> void: city_chosen.emit(other))
	box.add_child(switch)
	var quit := _button("Quit to desktop")
	quit.pressed.connect(func() -> void: quit_pressed.emit())
	box.add_child(quit)
	stats_label = _label("", 13, MUTED)
	box.add_child(stats_label)

	var right := _panel()
	right.custom_minimum_size = Vector2(380, 0)
	row.add_child(right)
	garage_box = VBoxContainer.new()
	garage_box.add_theme_constant_override("separation", 8)
	right.add_child(garage_box)
	pause_panel.visible = false


func set_garage(owned: Array, money: int) -> void:
	for child in garage_box.get_children():
		child.queue_free()
	garage_box.add_child(_label("GARAGE", 13, LIME, true))
	garage_box.add_child(_label("Have a car delivered to you.", 16, MUTED))
	for type: String in CarVisual.SPECS:
		var spec: Dictionary = CarVisual.SPECS[type]
		var have := owned.has(type)
		var text := "%s · %s" % [spec["name"], "deliver" if have else "$%s" % _commas(spec["price"])]
		var b := _button(text)
		b.disabled = not have and money < int(spec["price"])
		b.pressed.connect(func() -> void: car_requested.emit(type))
		garage_box.add_child(b)
		garage_box.add_child(_label("   0–60 in about %.1f s · top %d mph" % [26.8 / float(spec["accel"]) * 1.05, int(float(spec["top"]) * 2.237)], 12, MUTED))


func _build_map() -> void:
	map_panel = _overlay()
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 16)
	row.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT, Control.PRESET_MODE_MINSIZE, 28)
	map_panel.add_child(row)
	bigmap = BigMap.new()
	bigmap.data = data
	bigmap.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bigmap.size_flags_vertical = Control.SIZE_EXPAND_FILL
	bigmap.clip_contents = true
	bigmap.picked.connect(func(pos: Vector2) -> void: waypoint_set.emit(pos, "Map pin"))
	row.add_child(bigmap)
	var side := _panel()
	side.custom_minimum_size = Vector2(340, 0)
	row.add_child(side)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 8)
	side.add_child(box)
	box.add_child(_label(str(data.config["name"]).to_upper() + " / EXPLORER'S MAP", 13, LIME, true))
	box.add_child(_label("Find your next corner.", 28, CREAM, true))
	box.add_child(_label("Click the map to drop a GPS pin. Scroll to zoom, drag to pan.\nPick a place below to route there.", 13, MUTED))
	place_box = VBoxContainer.new()
	place_box.add_theme_constant_override("separation", 6)
	box.add_child(place_box)
	travel_button = _button("Fast travel (discover first)")
	travel_button.name = "Travel"
	travel_button.disabled = true
	travel_button.pressed.connect(func() -> void:
		if _selected_place >= 0 and found.has(places[_selected_place]["name"]):
			fast_travel.emit(places[_selected_place]["pos"], places[_selected_place]["name"]))
	box.add_child(travel_button)
	var highway := _button("Jump to %s" % data.config["highway_label"])
	highway.pressed.connect(func() -> void: shortcut.emit("highway"))
	box.add_child(highway)
	var home := _button("Back downtown")
	home.pressed.connect(func() -> void: shortcut.emit("home"))
	box.add_child(home)
	var clear := _button("Clear GPS")
	clear.pressed.connect(func() -> void: waypoint_set.emit(Vector2.INF, ""))
	box.add_child(clear)
	var close := _button("Close map", true)
	close.name = "Close"
	close.pressed.connect(func() -> void: resume_pressed.emit())
	box.add_child(close)
	map_panel.visible = false


func set_places(list: Array, found_set: Dictionary) -> void:
	places = list
	found = found_set
	for child in place_box.get_children():
		child.queue_free()
	for i in places.size():
		var p: Dictionary = places[i]
		var have := found.has(p["name"])
		var b := _button(("✓  " if have else "◇  ") + str(p["name"]))
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.tooltip_text = p["desc"]
		b.pressed.connect(func() -> void:
			_selected_place = i
			_update_travel_button()
			waypoint_set.emit(p["pos"], p["name"]))
		place_box.add_child(b)
	progress_label.text = "%d / %d places" % [found.size(), places.size()]
	_update_travel_button()


func _update_travel_button() -> void:
	if travel_button == null:
		return
	var can_travel := _selected_place >= 0 and _selected_place < places.size() and found.has(places[_selected_place]["name"])
	travel_button.disabled = not can_travel
	if can_travel:
		travel_button.text = "Fast travel · " + str(places[_selected_place]["name"])
	elif _selected_place >= 0 and _selected_place < places.size():
		travel_button.text = "Discover %s to fast travel" % places[_selected_place]["name"]
	else:
		travel_button.text = "Fast travel (discover first)"


static func _commas(n: int) -> String:
	var s := str(absi(n))
	var out := ""
	while s.length() > 3:
		out = "," + s.substr(s.length() - 3) + out
		s = s.substr(0, s.length() - 3)
	return ("-" if n < 0 else "") + s + out


func set_loading(fraction: float, text: String) -> void:
	load_bar.value = fraction * 100.0
	load_label.text = text


func set_ready() -> void:
	load_bar.visible = false
	load_label.text = "Ready."
	play_button.disabled = false
	play_button.text = "Step into %s  ↗" % data.config["name"]
	play_button.grab_focus()


func set_quality(q: String) -> void:
	_quality = q
	quality_button.text = "Graphics: " + ("High" if q == "high" else "Balanced")


func set_invert_y(inverted: bool) -> void:
	_invert_y = inverted
	if invert_button != null:
		invert_button.text = "Invert look Y: " + ("On" if inverted else "Off")


func show_state(state: String) -> void:
	start_panel.visible = state == "menu" or state == "loading"
	pause_panel.visible = state == "paused"
	map_panel.visible = state == "map"
	hud.visible = state == "playing"
	toast_label.visible = state == "playing" and _toast_time > 0.0
	if state == "paused":
		(pause_panel.find_child("Resume", true, false) as Button).grab_focus()
	elif state == "map":
		bigmap.queue_redraw()
		(map_panel.find_child("Close", true, false) as Button).grab_focus()


func toast(text: String) -> void:
	toast_label.text = text
	toast_label.visible = true
	toast_label.reset_size()
	_toast_time = 4.5


func set_prompt(text: String) -> void:
	prompt_label.visible = text != ""
	if prompt_label.text != text:
		prompt_label.text = text
		prompt_label.reset_size()


func set_money(amount: int) -> void:
	money_label.text = "$" + _commas(amount)


func set_job(info: Dictionary) -> void:
	job_panel.visible = not info.is_empty()
	if info.is_empty():
		return
	job_title.text = str(info["title"]).to_upper()
	job_title.add_theme_color_override("font_color", info["color"])
	job_line.text = info["line"]
	job_clock.text = info["clock"]


func _process(delta: float) -> void:
	if _toast_time > 0.0:
		_toast_time -= delta
		toast_label.modulate.a = clampf(_toast_time * 2.0, 0.0, 1.0)
		if _toast_time <= 0.0:
			toast_label.visible = false
