shader_type spatial;
// Procedural building facade. UV = (metres along wall, metres above ground),
// UV2 = (building height, wall length). COLOR.rgb tints the wall; COLOR.a
// packs style (>= 0.5 means clapboard siding) and a per-building seed.
uniform sampler2D brick : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D brick_normal : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
global uniform float night_amount;
global uniform float wetness;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void fragment() {
	float style = step(0.5, COLOR.a);
	float seed = fract(COLOR.a * 2.0);
	vec2 uv = UV;
	float top = UV2.x;
	float len = UV2.y;
	float bay = mix(3.4, 2.6, style);
	float floor_h = mix(3.5, 2.9, style);
	float bays = max(1.0, floor(len / bay));
	float start = (len - bays * bay) * 0.5;
	vec2 cell = vec2((uv.x - start) / bay, uv.y / floor_h);
	vec2 id = floor(cell);
	vec2 f = fract(cell);
	float inside = step(0.0, cell.x) * step(cell.x, bays) * step(uv.y, top - 0.9) * step(1.8, len);
	float ground = step(id.y, 0.5);
	float shop = ground * step(0.62, seed) * (1.0 - style);
	vec2 lo = mix(vec2(0.30, 0.34), vec2(0.08, 0.10), shop);
	vec2 hi = mix(vec2(0.70, 0.80), vec2(0.92, 0.74), shop);
	float door = ground * style * step(abs(id.x - floor(bays * 0.5)), 0.5);
	lo = mix(lo, vec2(0.30, 0.0), door);
	hi = mix(hi, vec2(0.70, 0.72), door);
	vec2 w = step(lo, f) * step(f, hi);
	float win = w.x * w.y * inside;
	vec2 fw = step(lo - 0.045, f) * step(f, hi + 0.045);
	float frame = fw.x * fw.y * inside * (1.0 - win);
	float mull = win * (step(abs(f.x - (lo.x + hi.x) * 0.5), 0.012) + step(abs(f.y - (lo.y + hi.y) * 0.5), 0.012) * (1.0 - shop));

	vec3 tex = texture(brick, uv * vec2(0.62, 0.62)).rgb;
	vec3 brick_col = (0.35 + tex * 1.5) * COLOR.rgb;
	float board = 0.88 + 0.12 * smoothstep(0.0, 0.12, fract(uv.y / 0.16));
	vec3 siding_col = COLOR.rgb * board * (0.94 + 0.06 * tex.r);
	vec3 wall = mix(brick_col, siding_col, style);
	float band = step(top - 0.45, uv.y) + (1.0 - style) * step(abs(fract(uv.y / floor_h + 0.03) - 0.03), 0.018) * step(floor_h, uv.y);
	wall = mix(wall, wall * 0.62 + vec3(0.2), clamp(band, 0.0, 1.0) * 0.55);
	wall = mix(wall, vec3(0.86, 0.85, 0.8) * mix(0.75, 1.0, style), frame);

	float lit_roll = hash(id + vec2(seed * 91.0, seed * 37.0));
	float lit = step(lit_roll, 0.26 * night_amount) * win * (1.0 - door);
	vec3 glass = mix(vec3(0.06, 0.09, 0.11), vec3(0.16, 0.2, 0.22), f.y) ;
	glass = mix(glass, vec3(0.12, 0.09, 0.07), door);
	glass = mix(glass, vec3(0.05), clamp(mull, 0.0, 1.0));
	ALBEDO = mix(wall, glass, win) * (1.0 - 0.18 * wetness * (1.0 - win));
	ROUGHNESS = mix(mix(0.88, 0.55, wetness * 0.5), 0.07, win * (1.0 - door));
	METALLIC = win * 0.55 * (1.0 - door);
	SPECULAR = 0.5;
	NORMAL_MAP = mix(texture(brick_normal, uv * vec2(0.62, 0.62)).rgb, vec3(0.5, 0.5, 1.0), max(win, max(style, frame)));
	NORMAL_MAP_DEPTH = 0.8;
	vec3 warm = mix(vec3(1.0, 0.72, 0.38), vec3(0.85, 0.9, 1.0), step(0.8, hash(id.yx + seed)));
	EMISSION = warm * lit * (0.7 + 0.9 * hash(id * 3.1 + seed));
}
