//!HOOK MAIN
//!BIND HOOKED
//!DESC Anime Dither (Aggressive)

// More aggressive anime dither shader - you'll definitely see this one!

vec4 hook() {
    vec4 color = HOOKED_texOff(0);
    
    // Larger 8x8 Bayer matrix for more visible dithering
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
    
    // Get screen position
    ivec2 pos = ivec2(gl_FragCoord.xy) % 8;
    int index = pos.y * 8 + pos.x;
    float dither = bayer8x8[index] / 64.0;
    
    // Calculate brightness
    float brightness = dot(color.rgb, vec3(0.299, 0.587, 0.114));
    
    // Much stronger base dither strength
    float base_strength = 2.0;
    
    // Adaptive strength based on brightness
    float adaptive_strength = base_strength;
    
    // Boost dithering in mid-tones (where anime gradients usually are)
    if (brightness > 0.2 && brightness < 0.8) {
        adaptive_strength *= 1.5;
    }
    
    // Apply strong dithering
    vec3 dither_amount = vec3(dither - 0.5) * adaptive_strength / 255.0;
    
    // Anime-specific channel adjustments
    dither_amount.r *= 1.0;
    dither_amount.g *= 1.2;  // More green dithering for better visibility
    dither_amount.b *= 1.1;
    
    color.rgb = clamp(color.rgb + dither_amount, 0.0, 1.0);
    
    return color;
}