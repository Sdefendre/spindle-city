class_name CityData
extends RefCounted
## Map geometry and geographic queries for one city. Units are metres; a map
## point (x, y) sits at world (x, 0, y). North is -Z.

const CITIES := {
	"fall-river": {
		"id": "fall-river", "name": "Fall River", "brand": "SPINDLE CITY", "file": "res://data/fall_river.json",
		"spawn": Vector2(1310.7, 2753.3), "spawn_place": "", "highway": "195", "highway_label": "I-195",
		"places": [
			["Battleship Cove", "Museum ships beside the waterfront."],
			["Bicentennial Park", "The riverfront park along Davol Street."],
			["Fall River City Hall", "Government Center, above Interstate 195."],
			["Lizzie Borden House", "The historic house on Second Street."],
			["Fall River Heritage State Park", "Green space beside the waterfront."],
			["Quequechan Rail Trail", "Follow the river through the city."],
			["Kennedy Park", "The South End's historic park."]],
	},
	"new-bedford": {
		"id": "new-bedford", "name": "New Bedford", "brand": "HARBOR CITY", "file": "res://data/new_bedford.json",
		"spawn": Vector2(1520.0, 893.3), "spawn_place": "New Bedford City Hall", "highway": "Kennedy Highway", "highway_label": "Route 18",
		"places": [
			["New Bedford Whaling Museum", "The historic whaling district beside Johnny Cake Hill."],
			["Seamen's Bethel", "The sailors' chapel above the waterfront."],
			["U.S. Custom House", "Greek Revival landmark on North Second Street."],
			["New Bedford City Hall", "The civic center in the downtown street grid."],
			["New Bedford Fishing Heritage Center", "Working-waterfront history on the harbor."],
			["State Pier", "A real mapped harbor landmark and port access."],
			["Custom House Square Park", "A green pause in the historic district."]],
	},
}

const WIDTHS := {
	"motorway": 13.0, "motorway_link": 7.5, "trunk": 13.0, "trunk_link": 7.5, "primary": 12.5, "secondary": 11.5,
	"secondary_link": 7.5, "tertiary": 10.5, "residential": 9.0, "unclassified": 9.0, "living_street": 7.0,
	"service": 5.5, "track": 4.0, "pedestrian": 6.0, "footway": 2.4, "path": 2.0, "cycleway": 3.0, "steps": 2.4,
}
const NO_DRIVE := ["footway", "path", "cycleway", "steps", "pedestrian", "track"]
const FAST := ["motorway", "motorway_link", "trunk", "trunk_link"]
const CELL := 60.0

var config: Dictionary
var width := 0.0
var height := 0.0
var roads: Array[Dictionary] = []
var buildings: Array[Dictionary] = []
var areas: Array[Dictionary] = []
var waters: Array[Dictionary] = []
var streams: Array[Dictionary] = []
var pois: Array = []
var places: Array[Dictionary] = []

var _seg_grid := {}      # Vector2i -> PackedInt32Array of road_index * 4096 + segment
var _bld_grid := {}      # Vector2i -> PackedInt32Array of building indices
var astar := AStar2D.new()
var node_pos: PackedVector2Array = PackedVector2Array()
var drive_adj: Array = []   # node id -> Array of [next id, road index]
var walk_adj: Array = []
var _node_ids := {}
var drive_nodes: PackedInt32Array = PackedInt32Array()
var walk_nodes: PackedInt32Array = PackedInt32Array()


static func poly_rect(p: PackedVector2Array) -> Rect2:
	var r := Rect2(p[0], Vector2.ZERO)
	for v in p:
		r = r.expand(v)
	return r


static func to_poly(raw: Array, closed: bool) -> PackedVector2Array:
	var p := PackedVector2Array()
	for v in raw:
		var pt := Vector2(v[0], v[1])
		if p.size() == 0 or p[p.size() - 1].distance_squared_to(pt) > 0.0004:
			p.append(pt)
	if closed and p.size() > 2 and p[0].distance_squared_to(p[p.size() - 1]) < 0.0004:
		p.remove_at(p.size() - 1)
	return p


func load_city(city_id: String) -> bool:
	config = CITIES.get(city_id, CITIES["fall-river"])
	var text := FileAccess.get_file_as_string(config["file"])
	if text.is_empty():
		push_error("Map data missing: " + str(config["file"]))
		return false
	var d: Dictionary = JSON.parse_string(text)
	width = d["width"]
	height = d["height"]
	pois = d["pois"]
	for r: Dictionary in d["roads"]:
		var type: String = r["type"]
		if not WIDTHS.has(type):
			continue
		var p := to_poly(r["p"], false)
		if p.size() < 2:
			continue
		var total := 0.0
		for i in range(1, p.size()):
			total += p[i - 1].distance_to(p[i])
		roads.append({
			"p": p, "type": type, "name": str(r["name"]), "width": float(WIDTHS[type]),
			"drive": not NO_DRIVE.has(type), "fast": FAST.has(type), "oneway": str(r["oneway"]) == "yes",
			"bridge": bool(r["bridge"]), "tunnel": bool(r["tunnel"]), "layer": int(r["layer"]),
			"rect": poly_rect(p), "length": total,
		})
	for i in roads.size():
		var p: PackedVector2Array = roads[i]["p"]
		for s in range(p.size() - 1):
			var a := p[s]
			var b := p[s + 1]
			var c0 := Vector2i(floori(minf(a.x, b.x) / CELL), floori(minf(a.y, b.y) / CELL))
			var c1 := Vector2i(floori(maxf(a.x, b.x) / CELL), floori(maxf(a.y, b.y) / CELL))
			for cx in range(c0.x, c1.x + 1):
				for cy in range(c0.y, c1.y + 1):
					var key := Vector2i(cx, cy)
					if not _seg_grid.has(key):
						_seg_grid[key] = PackedInt32Array()
					_seg_grid[key].append(i * 4096 + s)
	var seed_value := 7
	for b: Dictionary in d["buildings"]:
		var p := to_poly(b["p"], true)
		if p.size() < 3:
			continue
		var rect := poly_rect(p)
		var area := absf(_signed_area(p))
		if area < 6.0:
			continue
		seed_value = (seed_value * 1103515245 + 12345) & 0x7fffffff
		var rnd := float(seed_value % 1000) / 1000.0
		var h := clampf(4.2 + sqrt(area) * 0.17 + rnd * 3.2, 5.0, 19.0)
		var levels := str(b["levels"]).to_float()
		if str(b["meters"]).to_float() > 0.0:
			h = str(b["meters"]).to_float()
		elif levels > 2.5:
			h = levels * 3.3
		var type := str(b["type"])
		if type == "ship":
			h = 14.0
		elif type == "shed" or type == "garage" or type == "roof":
			h = 3.6
		var index := buildings.size()
		buildings.append({"p": p, "name": str(b["name"]), "type": type, "h": h, "rect": rect, "area": area, "rnd": rnd})
		var c0 := Vector2i(floori(rect.position.x / CELL), floori(rect.position.y / CELL))
		var c1 := Vector2i(floori(rect.end.x / CELL), floori(rect.end.y / CELL))
		for cx in range(c0.x, c1.x + 1):
			for cy in range(c0.y, c1.y + 1):
				var key := Vector2i(cx, cy)
				if not _bld_grid.has(key):
					_bld_grid[key] = PackedInt32Array()
				_bld_grid[key].append(index)
	for a: Dictionary in d["areas"]:
		var p := to_poly(a["p"], true)
		if p.size() >= 3:
			areas.append({"p": p, "name": str(a["name"]), "type": str(a["type"]), "rect": poly_rect(p)})
	for w: Dictionary in d["water"]:
		var p := to_poly(w["p"], true)
		if p.size() >= 3:
			waters.append({"p": p, "rect": poly_rect(p)})
	_add_coast(d["coast"])
	for s: Dictionary in d["streams"]:
		var p := to_poly(s["p"], false)
		if p.size() >= 2 and not bool(s["tunnel"]):
			streams.append({"p": p, "type": str(s["type"])})
	_build_graph()
	_resolve_places()
	return true


static func _signed_area(p: PackedVector2Array) -> float:
	var a := 0.0
	for i in p.size():
		var j := (i + 1) % p.size()
		a += p[i].x * p[j].y - p[j].x * p[i].y
	return a * 0.5


## The coastline arrives as open segments with water to the west. Join them
## and close each one far off the western edge, as the web version does.
func _add_coast(raw: Array) -> void:
	var lines: Array = []
	for c in raw:
		var p := to_poly(c, false)
		if p.size() > 1:
			lines.append(p)
	var joined := true
	while joined and lines.size() > 1:
		joined = false
		for i in lines.size():
			for j in range(i + 1, lines.size()):
				var a: PackedVector2Array = lines[i]
				var b: PackedVector2Array = lines[j]
				var merged := PackedVector2Array()
				if a[a.size() - 1].distance_to(b[0]) < 0.7:
					merged = a + b.slice(1)
				elif b[b.size() - 1].distance_to(a[0]) < 0.7:
					merged = b + a.slice(1)
				elif a[a.size() - 1].distance_to(b[b.size() - 1]) < 0.7:
					var rb := b.duplicate()
					rb.reverse()
					merged = a + rb.slice(1)
				elif a[0].distance_to(b[0]) < 0.7:
					var rb2 := b.duplicate()
					rb2.reverse()
					merged = rb2 + a.slice(1)
				if merged.size() > 0:
					lines[i] = merged
					lines.remove_at(j)
					joined = true
					break
			if joined:
				break
	for line: PackedVector2Array in lines:
		var p := line.duplicate()
		if p[0].y > p[p.size() - 1].y:
			p.reverse()
		p.append(Vector2(-4700.0, p[p.size() - 1].y))
		p.append(Vector2(-4700.0, p[0].y))
		waters.append({"p": p, "rect": poly_rect(p)})


func _node(pt: Vector2) -> int:
	var key := Vector2i(roundi(pt.x * 2.0), roundi(pt.y * 2.0))
	if _node_ids.has(key):
		return _node_ids[key]
	var id := node_pos.size()
	_node_ids[key] = id
	node_pos.append(pt)
	drive_adj.append([])
	walk_adj.append([])
	astar.add_point(id, pt)
	return id


func _build_graph() -> void:
	for i in roads.size():
		var r := roads[i]
		var p: PackedVector2Array = r["p"]
		var drive: bool = r["drive"]
		var walk: bool = not r["fast"] and r["type"] != "service"
		var prev := _node(p[0])
		for s in range(1, p.size()):
			var cur := _node(p[s])
			if cur == prev:
				continue
			if drive:
				drive_adj[prev].append([cur, i])
				if not r["oneway"]:
					drive_adj[cur].append([prev, i])
				astar.connect_points(prev, cur, not r["oneway"])
			if walk:
				walk_adj[prev].append([cur, i])
				walk_adj[cur].append([prev, i])
			prev = cur
	for id in node_pos.size():
		if drive_adj[id].size() > 0:
			drive_nodes.append(id)
		else:
			astar.set_point_disabled(id, true)
		if walk_adj[id].size() > 0:
			walk_nodes.append(id)


func _resolve_places() -> void:
	for spec: Array in config["places"]:
		var name: String = spec[0]
		var found := false
		var at := Vector2.ZERO
		var best_tourism := false
		for poi: Dictionary in pois:
			if str(poi["name"]) != name:
				continue
			var p := Vector2(poi["p"][0], poi["p"][1])
			if p.x <= 0 or p.y <= 0 or p.x >= width or p.y >= height:
				continue
			if not found or (bool(poi["tourism"]) and not best_tourism):
				at = p
				best_tourism = bool(poi["tourism"])
				found = true
		if not found:
			for b in buildings:
				if b["name"] == name:
					at = (b["rect"] as Rect2).get_center()
					found = true
					break
		if not found:
			for r in roads:
				if r["name"] == name:
					var p: PackedVector2Array = r["p"]
					at = p[p.size() / 2]
					found = true
					break
		if found:
			places.append({"name": name, "desc": spec[1], "pos": safe_point(at)})


func _near_cells(pos: Vector2, ring: int) -> Array[Vector2i]:
	var c := Vector2i(floori(pos.x / CELL), floori(pos.y / CELL))
	var out: Array[Vector2i] = []
	if ring == 0:
		out.append(c)
		return out
	for dx in range(-ring, ring + 1):
		out.append(c + Vector2i(dx, -ring))
		out.append(c + Vector2i(dx, ring))
	for dy in range(-ring + 1, ring):
		out.append(c + Vector2i(-ring, dy))
		out.append(c + Vector2i(ring, dy))
	return out


## Closest point on any road. Returns {d, p, dir, road, seg}; road is -1 if none.
func nearest_road(pos: Vector2, drive_only := false, named_only := false, max_rings := 8) -> Dictionary:
	var best := {"d": INF, "p": pos, "dir": Vector2.RIGHT, "road": -1, "seg": 0}
	for ring in range(0, max_rings + 1):
		for key in _near_cells(pos, ring):
			if not _seg_grid.has(key):
				continue
			for code: int in _seg_grid[key]:
				@warning_ignore("integer_division")
				var ri := code / 4096
				var r := roads[ri]
				if (drive_only and not r["drive"]) or (named_only and r["name"] == ""):
					continue
				var p: PackedVector2Array = r["p"]
				var s := code % 4096
				var q := Geometry2D.get_closest_point_to_segment(pos, p[s], p[s + 1])
				var dist := pos.distance_to(q)
				if dist < best["d"]:
					best = {"d": dist, "p": q, "dir": (p[s + 1] - p[s]).normalized(), "road": ri, "seg": s}
		if best["d"] <= ring * CELL:
			break
	return best


func _on_road_kind(pos: Vector2, key: String, margin: float) -> bool:
	for ring in 2:
		for cell in _near_cells(pos, ring):
			if not _seg_grid.has(cell):
				continue
			for code: int in _seg_grid[cell]:
				@warning_ignore("integer_division")
				var r := roads[code / 4096]
				if not r[key]:
					continue
				var p: PackedVector2Array = r["p"]
				var s := code % 4096
				if pos.distance_to(Geometry2D.get_closest_point_to_segment(pos, p[s], p[s + 1])) < r["width"] * 0.5 + margin:
					return true
	return false


func in_water(pos: Vector2) -> bool:
	for w in waters:
		if (w["rect"] as Rect2).has_point(pos) and Geometry2D.is_point_in_polygon(pos, w["p"]):
			return not _on_road_kind(pos, "bridge", 2.5)
	return false


func building_at(pos: Vector2) -> int:
	var key := Vector2i(floori(pos.x / CELL), floori(pos.y / CELL))
	if not _bld_grid.has(key):
		return -1
	for bi: int in _bld_grid[key]:
		var b := buildings[bi]
		if (b["rect"] as Rect2).has_point(pos) and Geometry2D.is_point_in_polygon(pos, b["p"]):
			return bi
	return -1


func buildings_near(pos: Vector2) -> PackedInt32Array:
	var key := Vector2i(floori(pos.x / CELL), floori(pos.y / CELL))
	return _bld_grid.get(key, PackedInt32Array())


func blocked(pos: Vector2) -> bool:
	if pos.x < 14 or pos.y < 14 or pos.x > width - 14 or pos.y > height - 14:
		return true
	if building_at(pos) >= 0 and not _on_road_kind(pos, "tunnel", 0.0):
		return true
	return in_water(pos)


func safe_point(pos: Vector2) -> Vector2:
	if not blocked(pos):
		return pos
	var near := nearest_road(pos)
	if near["road"] >= 0 and not blocked(near["p"]):
		return near["p"]
	var rad := 7.0
	while rad < 140.0:
		var a := 0.0
		while a < TAU:
			var q := pos + Vector2(cos(a), sin(a)) * rad
			if not blocked(q):
				return q
			a += 0.4
		rad += 7.0
	return pos


func nearest_drive_node(pos: Vector2) -> int:
	var near := nearest_road(pos, true)
	if near["road"] < 0:
		return -1
	var p: PackedVector2Array = roads[near["road"]]["p"]
	var s: int = near["seg"]
	var a := _node(p[s])
	var b := _node(p[s + 1])
	return a if pos.distance_squared_to(p[s]) < pos.distance_squared_to(p[s + 1]) else b


## Driving route along mapped roads, respecting one-way streets.
func find_route(from: Vector2, to: Vector2) -> PackedVector2Array:
	var a := nearest_drive_node(from)
	var b := nearest_drive_node(to)
	if a < 0 or b < 0:
		return PackedVector2Array()
	var path := astar.get_point_path(a, b, true)
	if path.size() == 0:
		return path
	var end := nearest_road(to, true)
	if end["road"] >= 0 and path[path.size() - 1].distance_to(end["p"]) > 2.0:
		path.append(end["p"])
	return path


static func path_length(path: PackedVector2Array) -> float:
	var total := 0.0
	for i in range(1, path.size()):
		total += path[i - 1].distance_to(path[i])
	return total


func speed_limit(road_index: int) -> float:
	if road_index < 0:
		return 9.0
	match roads[road_index]["type"]:
		"motorway", "trunk":
			return 27.0
		"motorway_link", "trunk_link":
			return 16.0
		"primary", "secondary":
			return 13.5
		"tertiary":
			return 12.0
		"service":
			return 6.0
	return 10.5


func random_drive_point(rng: RandomNumberGenerator, near: Vector2, min_d: float, max_d: float, allow_fast := false) -> Dictionary:
	for attempt in 24:
		var q := near + Vector2.from_angle(rng.randf() * TAU) * rng.randf_range(min_d, max_d)
		var hit := nearest_road(q, true, false, 3)
		if hit["road"] < 0:
			continue
		var r := roads[hit["road"]]
		if r["type"] == "service" or (r["fast"] and not allow_fast) or r["tunnel"]:
			continue
		var d := near.distance_to(hit["p"])
		if d >= min_d * 0.8 and d <= max_d * 1.3:
			return hit
	return {}
