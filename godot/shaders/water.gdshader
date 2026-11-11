shader_type spatial;
uniform sampler2D waves : hint_normal, filter_linear_mipmap, repeat_enable;
uniform vec3 deep : source_color = vec3(0.03, 0.12, 0.16);
uniform vec3 shallow : source_color = vec3(0.08, 0.26, 0.29);
global uniform float night_amount;
varying vec2 world_uv;

void vertex() {
	world_uv = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz;
}

void fragment() {
	vec2 a = world_uv * 0.035 + vec2(TIME * 0.012, TIME * 0.007);
	vec2 b = world_uv * 0.011 - vec2(TIME * 0.006, TIME * 0.009);
	vec3 n = mix(texture(waves, a).rgb, texture(waves, b).rgb, 0.5);
	float fres = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 3.0);
	ALBEDO = mix(deep, shallow, fres) * (1.0 - 0.6 * night_amount);
	ROUGHNESS = 0.06;
	METALLIC = 0.25;
	SPECULAR = 0.7;
	NORMAL_MAP = n;
	NORMAL_MAP_DEPTH = 0.55;
}
