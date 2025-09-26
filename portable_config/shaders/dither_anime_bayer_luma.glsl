//!HOOK MAIN
//!BIND HOOKED
//!DESC Bayer-based Anime Dither — Luma-only, midtone-adaptive, drop-in for your setup

// Minimal modification of your working Bayer shader.
// Keeps the same HOOK style and API usage so it won't trigger libplacebo macro/UBO issues.

vec4 hook() {
    vec4 color = HOOKED_texOff(0);

    // 8x8 Bayer matrix (0..63)
    float bayer8x8[64] = float[64](
         0,32, 8,40, 2,34,10,42,
        48,16,56,24,50,18,58,26,
        12,44, 4,36,14,46, 6,38,
        60,28,52,20,62,30,54,22,
         3,35,11,43, 1,33, 9,41,
        51,19,59,27,49,17,57,25,
        15,47, 7,39,13,45, 5,37,
        63,31,55,23,61,29,53,21
    );

    // Get screen position and tile index like your working shader
    ivec2 pos = ivec2(gl_FragCoord.xy) % 8;
    int index = pos.y * 8 + pos.x;
    float dither = bayer8x8[index] / 64.0; // 0..1

    // Compute luma (BT.709-ish)
    float L = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));

    // Tunables (match your scale idiom). These are conservative defaults:
    float BASE_STRENGTH = 2.0;   // start with the value you used before (2.0)
    float MID_TWEAK     = 1.5;   // boost in midtones (where anime gradients live)

    // Adaptive strength: boost midtones
    float adaptive = BASE_STRENGTH;
    if (L > 0.2 && L < 0.8) adaptive *= MID_TWEAK;

    // Map dither from [0..1] -> [-0.5..+0.5] and scale to match your original division by 255
    float d = (dither - 0.5) * adaptive / 255.0;

    // Apply dither to luma only: preserve chroma from original (no hue shift)
    float orig_cb = (color.b - L) * 0.5389 + 0.5;
    float orig_cr = (color.r - L) * 0.6350 + 0.5;

    float newL = clamp(L + d, 0.0, 1.0);

    // reconstruct RGB from new luma + original chroma (same method I used earlier)
    float cb = (orig_cb - 0.5) / 0.5389;
    float cr = (orig_cr - 0.5) / 0.6350;
    float R = newL + cr;
    float B = newL + cb;
    float G = (newL - 0.2126 * R - 0.0722 * B) / 0.7152;

    color.rgb = clamp(vec3(R, G, B), 0.0, 1.0);

    return color;
}
