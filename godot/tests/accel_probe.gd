extends SceneTree
func _initialize() -> void:
	var root3 := Node3D.new(); root.add_child(root3)
	var ground := StaticBody3D.new(); var cs := CollisionShape3D.new(); cs.shape = WorldBoundaryShape3D.new(); ground.add_child(cs); root3.add_child(ground)
	var v := Vehicle.create("model_y", Color.WHITE); root3.add_child(v); v.driver = "player"
	v.place(Vector2(0, 0), Vector2(0, 1))
	for i in 120: await physics_frame
	v.throttle = 1.0
	for s in 12:
		for i in 240: await physics_frame
		var w: VehicleWheel3D = v.wheels["FL"]; var w2: VehicleWheel3D = v.wheels["RL"]
		print("t=%d v=%.1f engine=%.0f brake=%.2f skidF=%.2f skidR=%.2f rpm=%.0f pitch=%.3f y=%.3f linvel=%.1f damp=%.3f" % [(s+1)*2, v.forward_speed, v.engine_force, v.brake, w.get_skidinfo(), w2.get_skidinfo(), w.get_rpm(), v.global_transform.basis.z.y, v.global_position.y, v.linear_velocity.length(), v.linear_damp])
	quit()
