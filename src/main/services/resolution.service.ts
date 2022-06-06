import * as os from "os";
import { promisify } from "util";
import childProcess from "child_process";
import {
  ConfigService,
  isDevelopment,
  userPreferences,
} from "@/main/services/config.service";
import { parse, stringify } from "js-ini";
import fs from "fs";
import { IIniObjectSection } from "js-ini/src/interfaces/ini-object-section";
import { screen } from "electron";
import { USER_PREFERENCE_KEYS } from "@/shared/enums/userPreferenceKeys";
import { Resolution } from "@/Resolution";
import { logger } from "@/main/logger";
import { BindingScope, injectable } from "@loopback/context";
import { service } from "@loopback/core";
import { name as modpackName } from "@/modpack.json";
import { InstructionService } from "@/main/services/instruction.service";

@injectable({
  scope: BindingScope.SINGLETON,
})
export class ResolutionService {
  private resolutionsCache!: Resolution[];

  constructor(
    @service(ConfigService) private configService: ConfigService,
    @service(InstructionService)
    private modpackInstructionsService: InstructionService
  ) {}

  getResourcePath() {
    return isDevelopment
      ? `${process.cwd()}/src/assets`
      : process.resourcesPath;
  }

  isUltraWidescreen({ width, height }: Resolution) {
    // Anything above this is an ultra widescreen resolution.
    // Most 16:9 resolutions are 1.7777777777777777.
    // There are some legacy resolutions that aren't quite 16:9.
    return width / height > 1.78;
  }

  private shouldDisableUltraWidescreen() {
    const instructions = this.modpackInstructionsService
      .getInstructions()
      .filter((x) => x.action === "disable-ultra-widescreen");
    return this.modpackInstructionsService.execute(instructions);
  }

  async isUnsupportedResolution(resolution: Resolution) {
    return (
      (await this.shouldDisableUltraWidescreen()) &&
      this.isUltraWidescreen(resolution)
    );
  }

  getCurrentResolution(): Resolution {
    const {
      size: { height, width },
      scaleFactor,
    } = screen.getPrimaryDisplay();
    return {
      width: width * scaleFactor,
      height: height * scaleFactor,
    };
  }

  getResolutionPreference() {
    return this.configService.getPreference<Resolution>(
      USER_PREFERENCE_KEYS.RESOLUTION
    );
  }

  hasResolutionPreference() {
    return this.configService.hasPreference(USER_PREFERENCE_KEYS.RESOLUTION);
  }

  async setResolution(resolution: Resolution) {
    this.configService.setPreference(
      USER_PREFERENCE_KEYS.RESOLUTION,
      resolution
    );
    return this.setResolutionInGraphicsSettings();
  }

  async getSupportedResolutions() {
    const { stdout: resolutionOutput, stderr } = await promisify(
      childProcess.exec
    )(`"${this.getResourcePath()}/tools/QRes.exe" /L`);
    if (stderr) {
      logger.error(`Error getting resolutions ${stderr}`);
      throw new Error(stderr);
    }

    return (
      resolutionOutput
        /**
         * QRes.exe outputs resolutions in the format:
         * 640x480, 32 bits @ 60 Hz.
         * 720x480, 32 bits @ 60 Hz.
         */
        .split(/\r*\n/)
        // The first 2 items in the array will contain copyright and version information
        .slice(2)
        // Remove empty entries
        .filter((resolution) => resolution !== "")
        // Only save the resolution
        .map((resolution) => resolution.split(",")[0])
    );
  }

  sortResolutions(resolution: Resolution, previousResolution: Resolution) {
    return (
      previousResolution.width - resolution.width ||
      previousResolution.height - resolution.height
    );
  }

  resolutionsContain(resolutions: Resolution[], resolution: Resolution) {
    return resolutions.some(
      ({ width, height }) =>
        resolution.height === height && resolution.width === width
    );
  }

  async getResolutions(): Promise<Resolution[]> {
    logger.info("Getting resolutions");

    if (this.resolutionsCache) {
      logger.debug(
        `Resolutions cached ${JSON.stringify(this.resolutionsCache)}`
      );
      return this.resolutionsCache;
    }

    const currentResolution = this.getCurrentResolution();

    // The application is only supported on Windows machines.
    // However, development is supported on other OSs so just return the current resolution
    // Also, return an ultrawide resolution for testing
    if (os.platform() !== "win32") {
      return [
        { width: 7680, height: 4320 },
        currentResolution,
        { width: 3440, height: 1440 }, // Ultra widescreen
        { width: 1920, height: 1080 },
      ];
    } else {
      const resolutions = [...new Set(await this.getSupportedResolutions())]
        // Format the QRes output
        .map((resolution) => ({
          width: Number(resolution.split("x")[0]),
          height: Number(resolution.split("x")[1]),
        }));

      logger.debug(`Supported resolutions: ${JSON.stringify(resolutions)}`);

      // Sometimes, QRes.exe cannot recognise some resolutions.
      // As a safety measure, add the users current resolution if it wasn't detected.
      if (!this.resolutionsContain(resolutions, currentResolution)) {
        logger.debug(
          `Native resolution (${JSON.stringify(
            currentResolution
          )}) not found. Adding to the list.`
        );
        resolutions.push(currentResolution);
      }

      // If a user has manually edited the preferences, add that resolution too
      if (
        this.hasResolutionPreference() &&
        !this.resolutionsContain(resolutions, this.getResolutionPreference())
      ) {
        resolutions.push(this.getResolutionPreference());
      }

      const sortedResolutions = resolutions.sort(this.sortResolutions);

      logger.debug(
        `Resolutions: ${sortedResolutions.map(
          ({ width, height }) => `${width}x${height}`
        )}`
      );

      // Add resolutions to a cache to computing them later
      this.resolutionsCache = sortedResolutions;

      return sortedResolutions;
    }
  }

  skyrimGraphicsSettingsPath() {
    return `${this.configService.getPreference(
      USER_PREFERENCE_KEYS.MOD_DIRECTORY
    )}/mods/${modpackName}/SKSE/Plugins/SSEDisplayTweaks.ini`;
  }

  async setResolutionInGraphicsSettings() {
    const { width: widthPreference, height: heightPreference } =
      userPreferences.get(USER_PREFERENCE_KEYS.RESOLUTION) as Resolution;

    logger.info(
      `Setting resolution in ${this.skyrimGraphicsSettingsPath()} to ${widthPreference} x ${heightPreference}`
    );
    const SkyrimGraphicSettings = parse(
      await fs.promises.readFile(this.skyrimGraphicsSettingsPath(), "utf-8"),
      { comment: "#" }
    ) as IIniObjectSection;

    (
      SkyrimGraphicSettings.Render as IIniObjectSection
    ).Resolution = `${widthPreference}x${heightPreference}`;

    const { scaleFactor } = screen.getPrimaryDisplay();
    const { width, height } = this.getCurrentResolution();

    // If the user has an ultra-widescreen monitor,
    // disable borderlessUpscale so the game doesn't get stretched.
    const borderlessUpscale = !this.isUltraWidescreen({ width, height });

    logger.debug(
      `Setting borderless upscale for ${width * scaleFactor}x${
        height * scaleFactor
      }: ${borderlessUpscale}`
    );

    // If the selected resolution is ultra-widescreen, don't upscale the image otherwise it gets stretched
    (SkyrimGraphicSettings.Render as IIniObjectSection).BorderlessUpscale =
      borderlessUpscale;

    await fs.promises.writeFile(
      this.skyrimGraphicsSettingsPath(),
      stringify(SkyrimGraphicSettings)
    );
  }
}
