extends SceneTree
# Headless physics check: godot --headless --path . -s tests/vehicle_test.gd
func _initialize() -> void:
	var root3 := Node3D.new(); root.add_child(root3)
	var ground := StaticBody3D.new(); var cs := CollisionShape3D.new(); var gb := BoxShape3D.new(); gb.size = Vector3(20000, 10, 20000); cs.shape = gb; cs.position.y = -5.0; ground.add_child(cs); root3.add_child(ground)
	var types: Array = OS.get_cmdline_user_args() if OS.get_cmdline_user_args().size() > 0 else ["model_y"]
	for car_type: String in types:
		var v := Vehicle.create(car_type, Color.WHITE); root3.add_child(v); v.driver = "player"
		v.place(Vector2(0, 0), Vector2(0, 1))
		for i in 120: await physics_frame
		print(car_type, " settle y=%.3f wheel contact=%s" % [v.global_position.y, v.wheels["FL"].is_in_contact()])
		v.throttle = 1.0
		var t60 := -1.0; var t := 0.0
		while t < 25.0:
			await physics_frame; t += 1.0 / 120.0
			if t60 < 0 and v.forward_speed >= 26.8: t60 = t
		print("  0-60mph %.1fs  top %.1f m/s (%.0f mph)  z=%.0f x=%.1f tilt=%.2f" % [t60, v.forward_speed, v.forward_speed * 2.237, v.global_position.z, v.global_position.x, v.global_transform.basis.y.y])
		v.throttle = 0.0; v.brake_input = 1.0
		var v0 := v.forward_speed; var z0 := v.global_position.z; t = 0.0
		while v.forward_speed > 0.3 and t < 20.0:
			await physics_frame; t += 1.0 / 120.0
		print("  brake from %.0f: %.1fs dist %.0fm decel %.1f" % [v0, t, v.global_position.z - z0, v0 / maxf(t, 0.01)])
		v.brake_input = 0.0; v.throttle = 0.6; v.steer_input = 0.0
		t = 0.0
		while v.forward_speed < 14.0 and t < 10.0:
			await physics_frame; t += 1.0 / 120.0
		v.steer_input = 1.0; var h0 := v.heading_dir(); var x0 := v.global_position.x; t = 0.0; var min_up := 1.0
		while t < 4.0:
			await physics_frame; t += 1.0 / 120.0; min_up = minf(min_up, v.global_transform.basis.y.y)
		print("  steer+1 at 14m/s: heading change %.2f rad, dx=%.1f (x+ is left), speed %.1f, min upright %.2f, skid %.2f" % [h0.angle_to(v.heading_dir()), v.global_position.x - x0, v.forward_speed, min_up, v.skid])
		v.steer_input = 0.0; v.throttle = -1.0; t = 0.0
		while t < 6.0:
			await physics_frame; t += 1.0 / 120.0
		print("  reverse speed %.1f" % v.forward_speed)
		v.throttle = 0.0; v.handbrake = true; t = 0.0
		while t < 1.0:
			await physics_frame; t += 1.0 / 120.0
		v.handbrake = false; v.throttle = 1.0; var v_before := v.forward_speed; t = 0.0
		while t < 2.0:
			await physics_frame; t += 1.0 / 120.0
		print("  handbrake release: rear_brake=%.3f speed %.1f -> %.1f" % [v.wheels["RL"].brake, v_before, v.forward_speed])
		v.queue_free()
		await physics_frame
	CarVisual.clear_cache()
	quit()
