// dither_blue_noise.glsl - tiny final dither (cheap pseudo-blue-noise)
// Usage: add as last shader in mpv: --glsl-shader=/path/to/dither_blue_noise.glsl

uniform vec2 iResolution;
uniform float iTime;
vec2 rand2(vec2 p){
    // simple low-correlated noise - cheap
    float a = fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    float b = fract(sin(dot(p, vec2(269.5,183.3))) * 43758.5453123);
    return vec2(a,b);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord){
    vec2 uv = fragCoord.xy / iResolution.xy;
    vec4 c = texture(iChannel0, uv);

    // scale according to resolution so noise magnitude is consistent
    float scale = 1.0 / 1024.0; // tweak: 1/512 stronger, 1/2048 weaker
    vec2 r = rand2(floor(fragCoord.xy));
    float d = (r.x - 0.5) * scale;

    // apply dither mostly to luma to avoid color shifting
    float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
    l += d;
    // reconstruct approx rgb keeping chroma stable
    vec3 chroma = c.rgb - vec3(l);
    fragColor = vec4(clamp(vec3(l) + chroma, 0.0, 1.0), c.a);
}
