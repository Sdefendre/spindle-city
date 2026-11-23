shader_type spatial;
render_mode unshaded;
// Emissive surface that only lights up at night (street lamp heads).
uniform vec3 color : source_color = vec3(1.0, 0.82, 0.55);
uniform float day_level = 0.25;
uniform float night_level = 4.0;
global uniform float night_amount;
void fragment() {
	ALBEDO = color * mix(day_level, night_level, night_amount);
}
