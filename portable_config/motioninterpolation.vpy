# motioninterpolation_optimized.vpy
# Enhanced MVTools motion interpolation for VapourSynth R57+
# Optimized as SVP4 fallback with better quality and reliability
# Drop into MPV config: --vf=vapoursynth="path/to/motioninterpolation_optimized.vpy"

import vapoursynth as vs
import math

core = vs.core

# If mvtools isn't autoloaded, uncomment and adjust:
# core.std.LoadPlugin(path=r"path\to\libmvtools.dll")

# ----------------- ENHANCED CONFIGURATION -----------------

def get_target_fps():
    """Smart FPS targeting matching your SVP script logic"""
    display = globals().get("display_fps", 48)
    
    # Cap at 60 FPS maximum
    target = min(display, 60)
    
    # For 24fps sources, prefer 48fps (same as your SVP script)
    if "video_in" in globals():
        src_fps = globals().get("container_fps", 23.976)
        if 23.5 <= src_fps <= 24.5:
            target = min(target, 48)
    
    return target

dst_fps = get_target_fps()

# Adaptive quality settings based on resolution
def get_quality_params(clip):
    """Get optimal parameters based on resolution"""
    width, height = clip.width, clip.height
    mpix = (width * height) / 1000000.0
    
    if mpix > 8:  # 4K+
        return {
            'blksize': 32,
            'overlap': 8,
            'search': 2,  # Reduced search for performance
            'pel': 1,     # No subpel for 4K
            'truemotion': False,  # Faster
            'mode': 0,    # Simple mode
            'thscd1': 200,
            'thscd2': 90
        }
    elif mpix > 2:  # 1440p+
        return {
            'blksize': 16,
            'overlap': 4,
            'search': 3,
            'pel': 2,
            'truemotion': True,
            'mode': 2,    # Better quality
            'thscd1': 140,
            'thscd2': 70
        }
    else:  # 1080p and below
        return {
            'blksize': 8,   # Smaller blocks for better vectors
            'overlap': 4,
            'search': 3,    # Full search
            'pel': 2,       # Half-pixel precision
            'truemotion': True,
            'mode': 3,      # Best quality mode
            'thscd1': 120,  # More sensitive scene detection
            'thscd2': 60
        }

# Scene change detection improvements
scene_change_percentage = 12  # Slightly more conservative than your original

# -----------------------------------------------

# Input handling with better error checking
if "video_in" in globals():
    clip = video_in
    src_fps = globals().get("container_fps", 23.976)
    
    # Fix common FPS detection issues
    if abs(src_fps - 23.810) < 0.01:
        src_fps = 23.976
    
    # Set proper FPS
    src_fps_num = int(src_fps * 1e6)
    src_fps_den = int(1e6)
    clip = core.std.AssumeFPS(clip, fpsnum=src_fps_num, fpsden=src_fps_den)
else:
    if 'in_filename' not in globals():
        raise RuntimeError("Running under vspipe requires --arg in_filename=... and --arg display_fps=...")
    clip = core.ffms2.Source(source=in_filename)
    src_fps = clip.fps_num / clip.fps_den

# Smart early exit conditions (improved from original)
mpix = clip.width * clip.height / 1000000.0
current_fps = clip.fps_num / clip.fps_den

# Skip if already high FPS or if target is too close to source
if current_fps >= dst_fps * 0.9:
    clip.set_output()
    raise SystemExit("Source FPS already sufficient")

# Skip extremely high resolution content
if mpix > 12:  # Above 4K
    clip.set_output()  
    raise SystemExit("Resolution too high for real-time processing")

# Get adaptive parameters
params = get_quality_params(clip)

# Compute rational FPS
dst_fps_num = int(dst_fps * 1e4)
dst_fps_den = int(1e4)

# ---------- ENHANCED MOTION ANALYSIS ----------

# Preprocessing for better vectors (optional denoising for noisy sources)
def preprocess_clip(clip):
    """Light preprocessing to improve vector quality"""
    # Only apply to very noisy or low quality sources
    if clip.width <= 1920 and clip.height <= 1080:
        # Very light temporal denoise to help vector search
        try:
            clip = core.ttempsmooth.TTempSmooth(clip, maxr=1, thresh=[1,2,3], mdiff=[1,2,3], strength=1)
        except:
            pass  # TTempSmooth not available, continue without
    return clip

# Optionally preprocess (comment out if causing issues)
# clip = preprocess_clip(clip)

# Create super clip with adaptive settings
sup = core.mv.Super(clip, pel=params['pel'], sharp=2, rfilter=4)

# Enhanced motion vector analysis
analyze_params = {
    'blksize': params['blksize'],
    'overlap': params['overlap'], 
    'search': params['search'],
    'truemotion': params['truemotion'],
    'lambda_': 1000,  # Helps vector quality
    'pnew': 50,       # Penalty for new vectors
    'plevel': 1,      # Pyramid levels for better vectors
    'global_': True,  # Global motion compensation
    'dct': 0,         # DCT mode for better quality
}

# Generate motion vectors
try:
    bvec = core.mv.Analyse(sup, isb=True, **analyze_params)
    fvec = core.mv.Analyse(sup, isb=False, **analyze_params)
except vs.Error as e:
    # Fallback with reduced parameters
    analyze_params.update({'search': 2, 'truemotion': False})
    bvec = core.mv.Analyse(sup, isb=True, **analyze_params)
    fvec = core.mv.Analyse(sup, isb=False, **analyze_params)

# Enhanced interpolation with better error handling
interpolation_params = {
    'num': dst_fps_num,
    'den': dst_fps_den,
    'mode': params['mode'],
    'thscd1': params['thscd1'],
    'thscd2': int(scene_change_percentage * 255 / 100),
    'blend': True,  # Blend scene changes instead of skipping
}

# Choose interpolation method based on quality preference
USE_FLOWFPS = mpix < 2.5  # Use FlowFPS for smaller resolutions (better quality)

try:
    if USE_FLOWFPS:
        # FlowFPS for better quality on smaller resolutions
        out = core.mv.FlowFPS(clip, sup, bvec, fvec, **interpolation_params)
    else:
        # BlockFPS for larger resolutions (more stable)
        out = core.mv.BlockFPS(clip, sup, bvec, fvec, **interpolation_params)
        
except vs.Error as e:
    # Fallback to simpler BlockFPS if FlowFPS fails
    interpolation_params['mode'] = 0  # Simplest mode
    out = core.mv.BlockFPS(clip, sup, bvec, fvec, **interpolation_params)

# Optional post-processing for quality improvement
def postprocess(clip):
    """Light post-processing to clean up artifacts"""
    # Very light temporal smoothing to reduce interpolation artifacts
    try:
        # Only for smaller resolutions where we can afford the processing
        if clip.width <= 1920:
            clip = core.ttempsmooth.TTempSmooth(clip, maxr=1, thresh=[2,3,4], 
                                               mdiff=[1,2,3], strength=1)
    except:
        pass  # Plugin not available
    return clip

# Apply post-processing only if enabled
ENABLE_POSTPROCESS = False  # Set to True if you want post-processing
if ENABLE_POSTPROCESS:
    out = postprocess(out)

# Mark as processed for debugging
out = core.std.SetFrameProp(out, prop="_MVToolsProcessed", data=f"FPS_{dst_fps}")

out.set_output()