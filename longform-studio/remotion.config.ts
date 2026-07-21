import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setCodec("h264");
Config.setPixelFormat("yuv420p");

// GPU: route Chromium's WebGL (the Depth3D Three.js beats) through the Radeon Pro 5300M
// via ANGLE/Metal instead of the CPU SwiftShader software renderer.
Config.setChromiumOpenGlRenderer("angle");

// Hardware H.264 encoding via macOS VideoToolbox (replaces the old, invalid
// Config.setFfmpegOverride call, which is not a function in this Remotion version
// and was throwing on every render).
Config.setHardwareAcceleration("if-possible");

// Use most cores for the per-frame Chromium rendering (the real bottleneck).
// Reduced to 4 and added a higher timeout to avoid TimeoutError on heavy 3D scenes.
Config.setConcurrency(4);
Config.setDelayRenderTimeoutInMilliseconds(120000);
