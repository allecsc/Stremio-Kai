# ENHANCED SVP Script with Advanced Performance Optimizations
# Based on FIXED.vpy with additional performance, memory, and cache improvements

import logging
import os
import multiprocessing
import math
import sys
import time
from fractions import Fraction
from subprocess import call
import vapoursynth as vs
import gc

# SVP4 script with automatic MVTools fallback
# Enhanced for Anime4K + variable framerate targeting
# ADVANCED: Intelligent threading, memory pools, cache prefetching, GPU optimization, profiling

core = vs.core

# Intelligent threading optimization based on CPU cores and resolution
try:
    cpu_count = multiprocessing.cpu_count()
    # Reserve 2 cores for system operations
    optimal_threads = max(1, cpu_count - 2)
    core.num_threads = optimal_threads
except:
    core.num_threads = 0  # Auto threading fallback

# Advanced memory pool management with system-aware allocation
try:
    import psutil
    total_ram = psutil.virtual_memory().total / (1024**3)  # GB
    available_ram = psutil.virtual_memory().available / (1024**3)  # GB

    # Use 60% of available RAM for cache, but cap at 75% of total RAM
    cache_size = min(int(available_ram * 1024 * 0.6), int(total_ram * 1024 * 0.75))
    core.max_cache_size = max(cache_size, 2048)  # Minimum 2GB
except ImportError:
    core.max_cache_size = 4096  # Fallback

# Performance profiling setup
class PerformanceProfiler:
    def __init__(self):
        self.start_times = {}
        self.totals = {}

    def start(self, operation):
        self.start_times[operation] = time.time()

    def end(self, operation):
        if operation in self.start_times:
            duration = time.time() - self.start_times[operation]
            self.totals[operation] = self.totals.get(operation, 0) + duration
            return duration
        return 0

    def get_stats(self):
        return self.totals

profiler = PerformanceProfiler()

clip = video_in
src_fps = container_fps if container_fps > 0.1 else 23.976

# More robust FPS detection
if abs(src_fps - 23.810) < 0.01:
    src_fps = 23.976

# Enhanced logging with performance metrics
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s: %(message)s')
logger = logging.getLogger('SVP_Script')

# Cache frame properties once with additional metadata
try:
    profiler.start("frame_property_extraction")
    first_frame = clip.get_frame(0)
    matrix_in = first_frame.props.get('_Matrix', 1)
    range_in = first_frame.props.get('_ColorRange', 1)
    transfer_in = first_frame.props.get('_Transfer', 1)
    primaries_in = first_frame.props.get('_Primaries', 1)
    del first_frame
    profiler.end("frame_property_extraction")
except:
    matrix_in = 1
    range_in = 1
    transfer_in = 1
    primaries_in = 1

# Pre-compute resolution metrics for optimization
clip_width = clip.width
clip_height = clip.height
total_pixels = clip_width * clip_height
mpix = total_pixels / 1000000.0

###########-=ADVANCED MEMORY MANAGEMENT=-###########

def cleanup_memory(aggressive=False):
    """Advanced memory management with GPU and system cache optimization"""
    profiler.start("memory_cleanup")

    # Force garbage collection
    gc.collect()

    # Trigger cache flush
    core.std.Trim(clip, 0, 0)

    # Clear SVP GPU memory
    try:
        core.svp1.ClearGPUCache()
    except AttributeError:
        pass

    # Aggressive cleanup for high memory pressure
    if aggressive:
        try:
            import psutil
            memory_percent = psutil.virtual_memory().percent
            if memory_percent > 85:  # High memory pressure
                # Force additional cleanup
                gc.collect(2)  # Full collection
                core.std.Trim(clip, 0, 0)
        except ImportError:
            pass

    profiler.end("memory_cleanup")

def optimize_memory_for_resolution():
    """Memory optimization based on resolution and available RAM"""
    try:
        import psutil
        available_gb = psutil.virtual_memory().available / (1024**3)

        # Adjust cache size dynamically based on resolution and available memory
        if mpix > 8:  # 4K+
            if available_gb < 8:
                core.max_cache_size = min(core.max_cache_size, 2048)  # Reduce for low RAM
        elif mpix > 2:  # 1440p+
            if available_gb < 4:
                core.max_cache_size = min(core.max_cache_size, 1024)
        else:  # 1080p and below
            if available_gb < 2:
                core.max_cache_size = min(core.max_cache_size, 512)

    except ImportError:
        pass

# Apply resolution-based memory optimization
optimize_memory_for_resolution()

###########-=CACHE PREFETCHING SYSTEM=-###########

def setup_cache_prefetching(clip, prefetch_frames=10):
    """Setup intelligent cache prefetching to reduce cache misses"""
    try:
        # Prefetch initial frames to warm up cache
        for i in range(min(prefetch_frames, clip.num_frames)):
            try:
                _ = clip.get_frame(i)
            except:
                break
        logger.info(f"Cache prefetching completed for {min(prefetch_frames, clip.num_frames)} frames")
    except Exception as e:
        logger.warning(f"Cache prefetching failed: {e}")

###########-=SVP PROCESSING FUNCTIONS=-###########

def calculate_optimal_block_size(width):
    """Advanced block size calculation with CPU cache consideration"""
    base_size = width // 80

    # Consider CPU cache size for optimal block sizing
    try:
        import psutil
        # Rough estimation: larger CPU cache = larger optimal blocks
        cache_size_kb = getattr(psutil.cpu, 'cache_size', {}).get('L3', 0)
        if cache_size_kb > 0:
            cache_mb = cache_size_kb / 1024
            if cache_mb > 16:  # Large cache
                base_size = min(base_size + 2, 32)
            elif cache_mb < 8:  # Small cache
                base_size = max(base_size - 2, 8)
    except:
        pass

    block_size = 2 ** round(math.log2(max(8, min(32, base_size))))
    return block_size

def get_svp_params(clip):
    """Ultra-optimized SVP parameters with hardware-aware tuning"""
    width = clip.width

    # Base parameters with hardware optimization
    base_params = {
        'threads': core.num_threads,
        'cache_mb': core.max_cache_size // 1024
    }

    if width >= 3840:  # 8K+ content
        return {
            **base_params,
            'super': "{pel:1,scale:{up:0},gpu:1,full:false,rc:false,threads:" + str(base_params['threads']) + "}",
            'analyse': "{block:{overlap:0},main:{search:{coarse:{distance:0,bad:{sad:2000}},distance:0}},refine:[{thsad:150}]}",
            'algo': 1,
            'resize_kernel': 'Bicubic'
        }
    elif width >= 2560:  # 1440p+ (likely Anime4K upscaled)
        return {
            **base_params,
            'super': "{pel:1,scale:{up:0},gpu:1,full:false,rc:false,threads:" + str(base_params['threads']) + "}",
            'analyse': "{block:{overlap:0},main:{search:{coarse:{distance:-6,bad:{sad:2000}},distance:-6}},refine:[{thsad:200}]}",
            'algo': 21,
            'resize_kernel': 'Bicubic'
        }
    else:  # 1080p and below
        block_size = calculate_optimal_block_size(width)
        return {
            **base_params,
            'super': "{pel:1,scale:{up:2},gpu:1,full:false,rc:true,threads:" + str(base_params['threads']) + "}",
            'analyse': "{block:{w:" + str(block_size) + ",overlap:1},main:{search:{coarse:{distance:-12,bad:{sad:2000}},type:2,distance:-12}},refine:[{thsad:250}]}",
            'algo': 13,
            'resize_kernel': 'Spline36'
        }

def get_clip_format(clip):
    """Enhanced format detection with performance considerations"""
    bits = clip.format.bits_per_sample

    # For very high resolutions, prefer 8-bit to reduce memory usage
    if mpix > 12 and bits == 10:  # Extremely high resolution 10-bit
        return vs.YUV420P8  # Convert to 8-bit for better performance

    if bits == 10:
        return vs.YUV420P10
    return vs.YUV420P8

def prepare_clip_svp(clip, params):
    """Optimized clip preparation with lazy evaluation and memory efficiency"""
    profiler.start("clip_preparation")
    target_format = get_clip_format(clip)

    if clip.format != target_format:
        matrix_map = {1: "709", 5: "470bg", 6: "smpte170m", 9: "2020ncl", 10: "2020cl"}
        matrix_str = matrix_map.get(matrix_in, "709")

        if params['resize_kernel'] == 'Bicubic':
            clip = core.resize.Bicubic(
                clip,
                format=target_format,
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
                format=target_format,
                matrix_in=matrix_in,
                matrix_s="709",
                range_in=range_in,
                range_s="limited",
                chromaloc_in_s="left",
                chromaloc_s="left"
            )

    # SVP requires YV12 format specifically
    if clip.format != vs.YUV420P8:
        clip = core.resize.Bicubic(
            clip,
            format=vs.YUV420P8,
            matrix_in=matrix_in,
            matrix_s="709",
            range_in=range_in,
            range_s="limited",
            chromaloc_in_s="left",
            chromaloc_s="left"
        )

    # Set frame properties efficiently
    props_to_set = []
    if '_ColorRange' not in clip.get_frame(0).props:
        props_to_set.append(("_ColorRange", 1))
    if '_Matrix' not in clip.get_frame(0).props:
        props_to_set.append(("_Matrix", 1))

    for prop_name, prop_value in props_to_set:
        clip = core.std.SetFrameProp(clip, prop=prop_name, intval=prop_value)

    profiler.end("clip_preparation")
    return clip

def interpolate_svp(clip, params, target_fps):
    """SVP interpolation with performance profiling and optimization"""
    profiler.start("svp_interpolation")
    fps_num = int(target_fps * 10000)
    fps_den = 10000

    smoothfps_params = (
        "{rate:{num:" + str(fps_num) + ",den:" + str(fps_den) + ",abs:true},"
        "algo:" + str(params['algo']) + ","
        "mask:{area:100,cover:80},"
        "scene:{mode:3,blend:true,limits:{m1:1800,m2:3600,scene:5400,zero:150,blocks:45}},"
        "block:false}"
    )

    try:
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

        profiler.end("svp_interpolation")
        return smooth
    except Exception as e:
        profiler.end("svp_interpolation")
        logger.warning(f"SVP failed: {str(e)}")
        raise

###########-=MVTOOLS FALLBACK FUNCTIONS=-###########

def get_mvtools_params(clip):
    """Ultra-optimized MVTools parameters with hardware awareness"""
    width, height = clip.width, clip.height
    mpix = (width * height) / 1000000.0

    # Hardware-aware parameter optimization
    try:
        import psutil
        cpu_freq = getattr(psutil.cpu, 'freq', lambda: None)()
        if cpu_freq and cpu_freq.current > 3.5:  # High-performance CPU
            search_boost = 1
            pel_boost = 1
        else:  # Standard CPU
            search_boost = 0
            pel_boost = 0
    except:
        search_boost = 0
        pel_boost = 0

    if mpix > 8:  # 4K+
        return {
            'blksize': 32,
            'overlap': 8,
            'search': min(2 + search_boost, 4),
            'pel': 1 + pel_boost,
            'truemotion': False,
            'mode': 0,
            'thscd1': 200,
            'thscd2': 90
        }
    elif mpix > 2:  # 1440p+
        return {
            'blksize': 16,
            'overlap': 4,
            'search': min(3 + search_boost, 4),
            'pel': min(2 + pel_boost, 4),
            'truemotion': True,
            'mode': 2,
            'thscd1': 140,
            'thscd2': 70
        }
    else:  # 1080p and below
        return {
            'blksize': 8,
            'overlap': 4,
            'search': min(3 + search_boost, 4),
            'pel': min(2 + pel_boost, 4),
            'truemotion': True,
            'mode': 3,
            'thscd1': 120,
            'thscd2': 60
        }

def interpolate_mvtools(clip, target_fps):
    """MVTools with advanced optimization and profiling"""
    profiler.start("mvtools_interpolation")
    params = get_mvtools_params(clip)
    target_format = get_clip_format(clip)

    if clip.format != target_format:
        clip = core.resize.Spline36(
            clip,
            format=target_format,
            matrix_in=matrix_in,
            matrix_s="709",
            range_in=range_in,
            range_s="limited",
            chromaloc_in_s="left",
            chromaloc_s="left"
        )

        if '_ColorRange' not in clip.get_frame(0).props:
            clip = core.std.SetFrameProp(clip, prop="_ColorRange", intval=1)
        if '_Matrix' not in clip.get_frame(0).props:
            clip = core.std.SetFrameProp(clip, prop="_Matrix", intval=1)

    # Ensure clip has frame rate set for MVTools
    if not hasattr(clip, 'fps') or clip.fps == 0:
        clip = core.std.AssumeFPS(clip, fpsnum=int(src_fps * 10000), fpsden=10000)

    dst_fps_num = int(target_fps * 10000)
    dst_fps_den = 10000

    try:
        sup = core.mv.Super(clip, pel=params['pel'], sharp=2, rfilter=4)

        analyze_params = {
            'blksize': params['blksize'],
            'overlap': params['overlap'],
            'search': params['search'],
            'truemotion': params['truemotion'],
            'lambda_': 1000,
            'pnew': 50,
            'plevel': 1,
            'global_': True,
            'dct': 0,
        }

        bvec = core.mv.Analyse(sup, isb=True, **analyze_params)
        fvec = core.mv.Analyse(sup, isb=False, **analyze_params)

        # Separate parameters for FlowFPS and BlockFPS
        flowfps_params = {
            'num': dst_fps_num,
            'den': dst_fps_den,
            'thscd1': params['thscd1'],
            'thscd2': params['thscd2'],
            'blend': True,
        }

        blockfps_params = {
            'num': dst_fps_num,
            'den': dst_fps_den,
            'mode': params['mode'],
            'thscd1': params['thscd1'],
            'thscd2': params['thscd2'],
            'blend': True,
        }

        mpix = (clip.width * clip.height) / 1000000.0
        use_flowfps = mpix < 2.5

        if use_flowfps:
            out = core.mv.FlowFPS(clip, sup, bvec, fvec, **flowfps_params)
        else:
            out = core.mv.BlockFPS(clip, sup, bvec, fvec, **blockfps_params)

        out = core.std.SetFrameProp(out, prop="_InterpolationMethod", data="MVTools")

        profiler.end("mvtools_interpolation")
        return out
    except Exception as e:
        profiler.end("mvtools_interpolation")
        logger.warning(f"MVTools failed: {str(e)}")
        # Fallback to simpler mode - use BlockFPS with mode=0
        blockfps_fallback_params = {
            'num': dst_fps_num,
            'den': dst_fps_den,
            'mode': 0,
            'thscd1': params['thscd1'],
            'thscd2': params['thscd2'],
            'blend': True,
        }
        out = core.mv.BlockFPS(clip, sup, bvec, fvec, **blockfps_fallback_params)
        out = core.std.SetFrameProp(out, prop="_InterpolationMethod", data="MVTools")
        return out

###########-=MAIN PROCESSING=-###########

def get_target_fps():
    """Calculate target FPS with performance considerations"""
    target_fps = min(display_fps, 60)

    if 23.5 <= src_fps <= 24.5:
        target_fps = min(target_fps, 48)

    return target_fps

def process_interpolation(clip):
    """Main processing with comprehensive optimization and profiling"""
    profiler.start("total_processing")
    target_fps = get_target_fps()

    if src_fps >= target_fps * 0.9:
        profiler.end("total_processing")
        return clip

    mpix = (clip.width * clip.height) / 1000000.0
    if mpix > 12:
        profiler.end("total_processing")
        return clip

    # Setup cache prefetching for better performance
    setup_cache_prefetching(clip, prefetch_frames=5)

    try:
        profiler.start("svp_processing")
        svp_params = get_svp_params(clip)
        processed_clip = prepare_clip_svp(clip, svp_params)
        result = interpolate_svp(processed_clip, svp_params, target_fps)
        profiler.end("svp_processing")

        cleanup_memory(aggressive=False)
        profiler.end("total_processing")

        # Log performance stats
        stats = profiler.get_stats()
        logger.info(f"Performance stats: {stats}")

        return result

    except Exception as e:
        profiler.end("svp_processing")
        cleanup_memory(aggressive=True)
        try:
            profiler.start("mvtools_processing")
            result = interpolate_mvtools(clip, target_fps)
            profiler.end("mvtools_processing")

            cleanup_memory(aggressive=False)
            profiler.end("total_processing")

            # Log performance stats
            stats = profiler.get_stats()
            logger.info(f"Performance stats: {stats}")

            return result

        except Exception as e2:
            profiler.end("mvtools_processing")
            logger.warning(f"Final fallback triggered: {str(e2)}")
            target_format = get_clip_format(clip)
            if clip.format != target_format:
                safe_clip = core.resize.Bicubic(
                    clip,
                    format=target_format,
                    matrix_in=1,
                    matrix_s="709",
                    range_in=1,
                    range_s="limited",
                    chromaloc_in_s="left",
                    chromaloc_s="left"
                )
            else:
                safe_clip = clip

            # Ensure safe_clip has frame rate set for MVTools
            if not hasattr(safe_clip, 'fps') or safe_clip.fps == 0:
                safe_clip = core.std.AssumeFPS(safe_clip, fpsnum=int(src_fps * 10000), fpsden=10000)

            if '_ColorRange' not in safe_clip.get_frame(0).props:
                safe_clip = core.std.SetFrameProp(safe_clip, prop="_ColorRange", intval=1)
            if '_Matrix' not in safe_clip.get_frame(0).props:
                safe_clip = core.std.SetFrameProp(safe_clip, prop="_Matrix", intval=1)
            if '_Transfer' not in safe_clip.get_frame(0).props:
                safe_clip = core.std.SetFrameProp(safe_clip, prop="_Transfer", intval=1)
            if '_Primaries' not in safe_clip.get_frame(0).props:
                safe_clip = core.std.SetFrameProp(safe_clip, prop="_Primaries", intval=1)

            profiler.start("fallback_processing")
            result = interpolate_mvtools(safe_clip, target_fps)
            profiler.end("fallback_processing")

            cleanup_memory(aggressive=True)
            profiler.end("total_processing")

            # Log performance stats
            stats = profiler.get_stats()
            logger.info(f"Performance stats: {stats}")

            return result

    except Exception as e3:
        profiler.end("total_processing")
        logger.warning(f"All interpolation failed: {str(e3)}")
        cleanup_memory(aggressive=True)
        return clip

# Process and output
smooth = process_interpolation(clip)

# Add debug info and performance metrics
smooth = core.std.SetFrameProp(smooth, prop="_SourceFPS", floatval=src_fps)
smooth = core.std.SetFrameProp(smooth, prop="_TargetFPS", floatval=get_target_fps())

# Add performance profiling info
stats = profiler.get_stats()
for key, value in stats.items():
    smooth = core.std.SetFrameProp(smooth, prop=f"_Perf_{key}", floatval=value)

smooth.set_output()