class_name GamepadPrompts
extends RefCounted
## Controller family detection, action glyphs, and input-aware help copy for
## Xbox Wireless/Series, DualSense/PlayStation, keyboard/mouse, and touch.

const DEADZONE_MOVE := 0.12
const DEADZONE_LOOK := 0.14
const DEADZONE_TRIGGER := 0.06
const DEADZONE_BUTTON := 0.2
const DEADZONE_UI := 0.5

const PLAYSTATION_TOKENS := [
	"dualsense",
	"dualshock",
	"ps5",
	"ps4",
	"playstation",
	"sony",
	"wireless controller",
]

const XBOX_TOKENS := [
	"xbox",
	"xinput",
	"microsoft",
]

const GLYPHS := {
	"keyboard": {
		"interact": "E",
		"handbrake": "Space",
		"view": "V",
		"map": "M",
		"pause": "Esc",
		"gas": "W",
		"reverse": "S",
		"move": "WASD",
		"look": "Mouse",
		"sprint": "Shift",
		"auto_drive": "F",
		"horn": "H",
		"lights": "L",
		"reset_car": "R",
		"cinematic": "C",
		"confirm": "Enter",
		"back": "Esc",
		"nav": "Arrows",
		"column": "Tab",
	},
	"touch": {
		"interact": "Tap",
		"handbrake": "Brake",
		"view": "View",
		"map": "Map",
		"pause": "Pause",
		"gas": "Stick ↑",
		"reverse": "Stick ↓",
		"move": "Stick",
		"look": "Drag",
		"sprint": "Stick",
		"auto_drive": "Auto",
		"horn": "Horn",
		"lights": "Lights",
		"reset_car": "Reset",
		"cinematic": "HUD",
		"confirm": "Tap",
		"back": "Back",
		"nav": "Tap",
		"column": "Tap",
	},
	"xbox": {
		"interact": "A",
		"handbrake": "B",
		"view": "X",
		"map": "Y",
		"pause": "Menu",
		"gas": "RT",
		"reverse": "LT",
		"move": "LS",
		"look": "RS",
		"sprint": "L3",
		"auto_drive": "LB",
		"horn": "RB",
		"lights": "D-Up",
		"reset_car": "D-Down",
		"cinematic": "R3",
		"confirm": "A",
		"back": "B",
		"nav": "D-Pad / LS",
		"column": "LB / RB",
	},
	"playstation": {
		"interact": "×",
		"handbrake": "○",
		"view": "□",
		"map": "△",
		"pause": "Options",
		"gas": "R2",
		"reverse": "L2",
		"move": "L-Stick",
		"look": "R-Stick",
		"sprint": "L3",
		"auto_drive": "L1",
		"horn": "R1",
		"lights": "D-Up",
		"reset_car": "D-Down",
		"cinematic": "R3",
		"confirm": "×",
		"back": "○",
		"nav": "D-Pad / L-Stick",
		"column": "L1 / R1",
	},
}


## Classify a connected joypad name into "xbox", "playstation", or "" (none).
## Check Xbox before "wireless controller" because Apple's GameController
## framework reports Xbox pads as "Xbox Wireless Controller".
static func family_for_name(joy_name: String) -> String:
	var lower := joy_name.strip_edges().to_lower()
	if lower == "":
		return ""
	for token: String in XBOX_TOKENS:
		if lower.contains(token):
			return "xbox"
	for token: String in PLAYSTATION_TOKENS:
		if lower.contains(token):
			return "playstation"
	return "xbox"


static func mode_for_device(input_device: String, joy_name := "") -> String:
	if input_device == "gamepad":
		var family := family_for_name(joy_name)
		return family if family != "" else "xbox"
	if input_device == "touch":
		return "touch"
	return "keyboard"


static func is_gamepad_mode(mode: String) -> bool:
	return mode == "xbox" or mode == "playstation"


static func glyph(action: String, mode: String) -> String:
	var table: Dictionary = GLYPHS.get(mode, GLYPHS["keyboard"])
	return str(table.get(action, GLYPHS["keyboard"].get(action, action)))


static func prompt(action: String, label: String, mode: String) -> String:
	return "%s · %s" % [glyph(action, mode), label]


static func pad_title(mode: String, joy_name := "") -> String:
	if joy_name.strip_edges() != "":
		return joy_name.strip_edges()
	return "DualSense Controller" if mode == "playstation" else "Xbox Controller"


static func drive_toast(car_name: String, mode: String) -> String:
	if mode == "touch":
		return "%s · Stick drive & steer · Brake to drift · Tap Step out to exit" % car_name
	if mode == "keyboard":
		return "%s · W/S drive · A/D steer · Space handbrake · E exit" % car_name
	return "%s · %s/%s drive · %s steer · %s handbrake · %s exit" % [
		car_name,
		glyph("gas", mode),
		glyph("reverse", mode),
		glyph("move", mode),
		glyph("handbrake", mode),
		glyph("interact", mode),
	]


static func start_help(mode: String) -> String:
	if mode == "xbox":
		return "Xbox Controller · LS move/steer · RS look · RT gas · LT brake/reverse · L3 run\nA interact · B handbrake/jump · X view · Y map · LB auto drive · RB horn\nD-Up lights · D-Down reset car · R3 hide HUD · Menu pause"
	if mode == "playstation":
		return "DualSense Controller · L-Stick move/steer · R-Stick look · R2 gas · L2 brake/reverse · L3 run\n× interact · ○ handbrake/jump · □ view · △ map · L1 auto drive · R1 horn\nD-Up lights · D-Down reset car · R3 hide HUD · Options pause"
	if mode == "touch":
		return "Touch Controls · Left stick walk or drive · Drag screen to look\nTap Act to enter cars or start jobs · Map for GPS & fast travel · Pause for garage\nPair an Xbox or DualSense controller anytime to switch automatically"
	return "WASD move · Mouse look · Shift run · E enter / interact · V view · M map\nSpace handbrake · F auto drive · H horn · L lights · R reset car · C HUD · Esc pause\nController ready: Xbox & DualSense switch prompts automatically on connect"


static func map_help(mode: String) -> String:
	if is_gamepad_mode(mode):
		return "%s pan · %s/%s zoom · %s pick a place\n%s route or fast travel · %s close map" % [
			glyph("look", mode),
			glyph("gas", mode),
			glyph("reverse", mode),
			glyph("nav", mode),
			glyph("confirm", mode),
			glyph("back", mode),
		]
	if mode == "touch":
		return "Tap the map to drop a GPS pin. Drag to pan.\nPick a place below to route or fast travel."
	return "Click the map to drop a GPS pin. Scroll to zoom, drag to pan.\nPick a place below to route or fast travel."


static func pause_help(mode: String) -> String:
	if is_gamepad_mode(mode):
		return "%s navigate · %s select · %s switch column · %s / %s resume" % [
			glyph("nav", mode),
			glyph("confirm", mode),
			glyph("column", mode),
			glyph("back", mode),
			glyph("pause", mode),
		]
	if mode == "touch":
		return "Tap any setting or car to deliver it curbside."
	return "Esc resume · Arrows or Tab navigate"
