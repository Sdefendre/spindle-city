shader_type spatial;
// World-space tiled ground surface (asphalt, sidewalks, paths) that darkens
// and turns glossy as the global wetness rises.
uniform sampler2D albedo_tex : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D normal_tex : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D rough_tex : hint_default_white, filter_linear_mipmap_anisotropic, repeat_enable;
uniform vec3 tint : source_color = vec3(1.0);
uniform float tile = 0.22;
uniform float brightness = 1.0;
global uniform float wetness;
varying vec2 world_uv;

void vertex() {
	world_uv = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz * tile;
}

void fragment() {
	vec3 col = texture(albedo_tex, world_uv).rgb * tint * brightness;
	float far_mix = texture(albedo_tex, world_uv * 0.13).r;
	col *= 0.86 + 0.28 * far_mix;
	float rough = texture(rough_tex, world_uv).r;
	float puddle = smoothstep(0.42, 0.62, texture(rough_tex, world_uv * 0.07 + 0.31).r) * wetness;
	ALBEDO = col * (1.0 - 0.38 * wetness);
	ROUGHNESS = mix(clamp(rough * 1.05, 0.55, 1.0), 0.06, clamp(wetness * 0.55 + puddle * 0.6, 0.0, 1.0));
	SPECULAR = 0.5;
	NORMAL_MAP = mix(texture(normal_tex, world_uv).rgb, vec3(0.5, 0.5, 1.0), puddle);
	NORMAL_MAP_DEPTH = 0.9;
}
