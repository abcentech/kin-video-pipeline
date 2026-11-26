/**
 * Used by `remotion studio` / `remotion render` (the pipeline's own stages call the Node API and pass
 * their options directly). No tailwind: nothing in src/December imports CSS.
 */

import { Config } from "@remotion/cli/config";

Config.setRspack(true);
Config.setChromiumOpenGlRenderer("angle");
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
