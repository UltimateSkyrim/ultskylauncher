import fs from "fs";
import {
  WabbajackInstallSettings,
  WabbajackModpackMetadata,
  WabbajackV2SettingsFile,
} from "@/wabbajack";
import { logger } from "@/main/logger";
import { SystemService } from "@/main/services/system.service";
import { service } from "@loopback/core";
import { BindingScope, injectable } from "@loopback/context";
import { ModpackService } from "@/main/services/modpack.service";

@injectable({
  scope: BindingScope.SINGLETON,
})
export class WabbajackService {
  private installedModpacksFilename = "installed_modlists.json";
  private wabbajackV2InstalledModpacksPath = `${SystemService.getLocalAppData()}/Wabbajack/${
    this.installedModpacksFilename
  }`;
  private wabbajackV3InstalledModpacksPath = `${SystemService.getLocalAppData()}/Wabbajack/saved_settings`;

  constructor(
    @service(SystemService) private systemService: SystemService,
    @service(ModpackService) private modpackService: ModpackService
  ) {}

  async getInstalledModpacks(): Promise<WabbajackModpackMetadata | null> {
    let v2Modpacks = {};
    let v3Modpacks = {};
    if (fs.existsSync(this.wabbajackV2InstalledModpacksPath)) {
      v2Modpacks = await this.getInstalledModpacksFromWabbajackV2();
    } else {
      logger.warn(`${this.wabbajackV2InstalledModpacksPath} does not exist.`);
    }

    if (fs.existsSync(this.wabbajackV3InstalledModpacksPath)) {
      v3Modpacks = await this.getInstalledModpacksFromWabbajackV3();
    } else {
      logger.warn(`${this.wabbajackV3InstalledModpacksPath} does not exist.`);
    }

    const combined = {
      ...v2Modpacks,
      ...v3Modpacks,
    };

    return Object.keys(combined).length > 0 ? combined : null;
  }

  async getInstalledModpacksFromWabbajackV2(): Promise<WabbajackModpackMetadata> {
    const modpackMeta = JSON.parse(
      await fs.promises.readFile(this.wabbajackV2InstalledModpacksPath, "utf-8")
    ) as WabbajackV2SettingsFile;
    return Object.keys(modpackMeta)
      .filter((key) => key !== "$type")
      .reduce(
        (accumulator, current) => ({
          ...accumulator,
          [modpackMeta[current].InstallationPath]: {
            title: modpackMeta[current].ModList.Name,
            installPath: modpackMeta[current].InstallationPath,
            version: modpackMeta[current].ModList.Version,
          },
        }),
        {}
      );
  }

  async getInstalledModpacksFromWabbajackV3(): Promise<WabbajackModpackMetadata> {
    const files = (
      await fs.promises.readdir(this.wabbajackV3InstalledModpacksPath)
    ).filter((file) => file.startsWith("install-settings"));

    const modlists = [];
    for (const file of files) {
      const path = `${this.wabbajackV3InstalledModpacksPath}/${file}`;
      modlists.push({
        contents: JSON.parse(
          await fs.promises.readFile(path, "utf-8")
        ) as WabbajackInstallSettings,
        lastUpdated: (await fs.promises.lstat(path)).mtime,
      });
    }

    return modlists.reduce<WabbajackModpackMetadata>(
      (accumulator, current): WabbajackModpackMetadata => {
        const currentInAccumulator =
          accumulator[current.contents.InstallLocation];
        // Wabbajack saves modpack installs with files with random hashes
        // This means a later install might appear before a previous one,
        // we need to find the latest install and remove the others
        if (
          currentInAccumulator &&
          currentInAccumulator.lastUpdated &&
          currentInAccumulator.lastUpdated > current.lastUpdated
        ) {
          return accumulator;
        }

        return {
          ...accumulator,
          [current.contents.InstallLocation]: {
            title: current.contents.Metadata?.title,
            installPath: current.contents.InstallLocation,
            version: current.contents.Metadata?.version,
            lastUpdated: current.lastUpdated,
          },
        };
      },
      {}
    );
  }

  async getInstalledCurrentModpackPaths() {
    const { name: modpackName } = this.modpackService.getModpackMetadata();
    const modpacks = await this.getInstalledModpacks();
    const wildlanderModpacks =
      modpacks !== null
        ? Object.keys(modpacks).filter(
            (modpack) =>
              modpack !== "$type" && modpacks[modpack].title === modpackName
          )
        : [];
    logger.info(
      `Discovered ${wildlanderModpacks.length} ${modpackName} modpack installations in ${this.installedModpacksFilename}`
    );
    logger.debug(wildlanderModpacks);
    return wildlanderModpacks;
  }

  async getModpackMetadata(path: string) {
    const modpacks = await this.getInstalledModpacks();
    return modpacks && modpacks[path] ? modpacks[path] : null;
  }

  async getCurrentModpackMetadata() {
    return this.getModpackMetadata(this.modpackService.getModpackDirectory());
  }

  async getModpackVersion() {
    return (await this.getCurrentModpackMetadata())?.version ?? "unknown";
  }
}
