import logging
import os
import multiprocessing
import math
import sys
from fractions import Fraction
from subprocess import call
import vapoursynth as vs

# SVP4 script with automatic MVTools fallback
# Tries SVP first, falls back to MVTools if SVP fails or isn't available
# Enhanced for Anime4K + variable framerate targeting

core = vs.core
core.num_threads = 0

clip = video_in
src_fps = container_fps if container_fps > 0.1 else 23.976

# More robust FPS detection
if abs(src_fps - 23.810) < 0.01:
    src_fps = 23.976

###########-=SVP PROCESSING FUNCTIONS=-###########

def calculate_optimal_block_size(width):
    """Calculate optimal block size based on resolution"""
    base_size = width // 80
    block_size = 2 ** round(math.log2(max(8, min(32, base_size))))
    return block_size

def get_svp_params(clip):
    """Get optimized SVP parameters based on clip resolution"""
    width = clip.width
    
    if width >= 3840:  # 4K+ content
        return {
            'super': "{pel:1,scale:{up:0},gpu:1,full:false,rc:false}",
            'analyse': "{block:{overlap:0},main:{search:{coarse:{distance:0,bad:{sad:2000}},distance:0}},refine:[{thsad:150}]}",
            'algo': 1,
            'format': vs.YUV420P8,
            'resize_kernel': 'Bicubic'
        }
    elif width >= 2560:  # 1440p+ (likely Anime4K upscaled)
        return {
            'super': "{pel:1,scale:{up:0},gpu:1,full:false,rc:false}",
            'analyse': "{block:{overlap:0},main:{search:{coarse:{distance:-6,bad:{sad:2000}},distance:-6}},refine:[{thsad:200}]}",
            'algo': 21,
            'format': vs.YUV420P8,
            'resize_kernel': 'Bicubic'
        }
    else:  # 1080p and below
        block_size = calculate_optimal_block_size(width)
        return {
            'super': "{pel:1,scale:{up:2},gpu:1,full:false,rc:true}",
            'analyse': "{block:{w:" + str(block_size) + ",overlap:1},main:{search:{coarse:{distance:-12,bad:{sad:2000}},type:2,distance:-12}},refine:[{thsad:250}]}",
            'algo': 13,
            'format': vs.YUV420P8,
            'resize_kernel': 'Spline36'
        }

def prepare_clip_svp(clip, params):
    """Prepare clip for SVP processing with robust colorspace handling"""
    if clip.format != params['format']:
        # Get current colorspace info
        matrix_in = clip.get_frame(0).props.get('_Matrix', 1)  # Default to BT709
        range_in = clip.get_frame(0).props.get('_ColorRange', 1)  # Default to limited
        
        # Map matrix values to strings
        matrix_map = {1: "709", 5: "470bg", 6: "smpte170m", 9: "2020ncl", 10: "2020cl"}
        matrix_str = matrix_map.get(matrix_in, "709")
        
        if params['resize_kernel'] == 'Bicubic':
            clip = core.resize.Bicubic(
                clip, 
                format=params['format'],
                matrix_in=matrix_in,
                matrix_s="709",
                range_in=range_in,
                range_s="limited",
                chromaloc_in_s="left",
                chromaloc_s="left"
            )
        else:
            clip = core.resize.Spline36(
                clip,
                format=params['format'],
                matrix_in=matrix_in,
                matrix_s="709", 
                range_in=range_in,
                range_s="limited",
                chromaloc_in_s="left",
                chromaloc_s="left"
            )
    
    # Ensure proper frame properties
    clip = core.std.SetFrameProp(clip, prop="_ColorRange", intval=1)
    clip = core.std.SetFrameProp(clip, prop="_Matrix", intval=1)
    return clip

def interpolate_svp(clip, params, target_fps):
    """SVP interpolation with error handling"""
    fps_num = int(target_fps * 10000)
    fps_den = 10000
    
    smoothfps_params = (
        "{rate:{num:" + str(fps_num) + ",den:" + str(fps_den) + ",abs:true},"
        "algo:" + str(params['algo']) + ","
        "mask:{area:100,cover:80},"
        "scene:{mode:3,blend:true,limits:{m1:1800,m2:3600,scene:5400,zero:150,blocks:45}},"
        "block:false}"
    )
    
    # Try SVP processing
    super_clip = core.svp1.Super(clip, params['super'])
    vectors = core.svp1.Analyse(
        super_clip["clip"], 
        super_clip["data"], 
        clip, 
        params['analyse']
    )
    smooth = core.svp2.SmoothFps(
        clip, 
        super_clip["clip"], 
        super_clip["data"], 
        vectors["clip"], 
        vectors["data"], 
        smoothfps_params, 
        src=clip, 
        fps=src_fps
    )
    
    smooth = core.std.AssumeFPS(smooth, fpsnum=fps_num, fpsden=fps_den)
    smooth = core.std.SetFrameProp(smooth, prop="_InterpolationMethod", data="SVP4")
    return smooth

###########-=MVTOOLS FALLBACK FUNCTIONS=-###########

def get_mvtools_params(clip):
    """Get optimal MVTools parameters based on resolution"""
    width, height = clip.width, clip.height
    mpix = (width * height) / 1000000.0
    
    if mpix > 8:  # 4K+
        return {
            'blksize': 32,
            'overlap': 8,
            'search': 2,
            'pel': 1,
            'truemotion': False,
            'mode': 0,
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
            'mode': 2,
            'thscd1': 140,
            'thscd2': 70
        }
    else:  # 1080p and below
        return {
            'blksize': 8,
            'overlap': 4,
            'search': 3,
            'pel': 2,
            'truemotion': True,
            'mode': 3,
            'thscd1': 120,
            'thscd2': 60
        }

###########-=MAIN PROCESSING=-###########

def get_target_fps():
    """Calculate target FPS using same logic as before"""
    target_fps = min(display_fps, 60)
    
    # For 24fps content, prefer 48fps
    if 23.5 <= src_fps <= 24.5:
        target_fps = min(target_fps, 48)
    
    return target_fps

def process_interpolation(clip):
    """Main function that tries SVP first, then falls back to MVTools"""
    target_fps = get_target_fps()
    
    # Skip if already high framerate
    if src_fps >= target_fps * 0.9:
        return clip
    
    # Skip extremely high resolution
    mpix = (clip.width * clip.height) / 1000000.0
    if mpix > 12:
        return clip
    
    # Try SVP first
    try:
        svp_params = get_svp_params(clip)
        processed_clip = prepare_clip_svp(clip, svp_params)
        result = interpolate_svp(processed_clip, svp_params, target_fps)
        return result
        
    except Exception as e:
                return clip

# Process and output
smooth = process_interpolation(clip)

# Add debug info
smooth = core.std.SetFrameProp(smooth, prop="_SourceFPS", floatval=src_fps)
smooth = core.std.SetFrameProp(smooth, prop="_TargetFPS", floatval=get_target_fps())

smooth.set_output()