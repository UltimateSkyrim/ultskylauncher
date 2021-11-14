export const enum IPCEvents {
  CHECK_FOR_UPDATE = "check-for-update",
  UPDATE_AVAILABLE = "update-available",
  UPDATE_NOT_AVAILABLE = "update-not-available",
  UPDATE_DOWNLOADED = "update-downloaded",
  UPDATE_APP = "update-app",
  DOWNLOAD_PROGRESS = "download-progress",

  CLOSE = "close",
  MINIMIZE = "MINIMIZE",

  LAUNCH_MO2 = "LAUNCH_MO2",
  LAUNCH_GAME = "LAUNCH_GAME",

  SHOW_OPEN_DIALOG = "SHOW_OPEN_DIALOG",
  ERROR = "ERROR",
  MESSAGE = "MESSAGE",
  CONFIRMATION = "CONFIRMATION",

  GET_PRESETS = "GET_PRESETS",
  CHECK_MOD_DIRECTORY = "CHECK_MOD_DIRECTORY",
  CHECK_SKYRIM_DIRECTORY = "CHECK_SKYRIM_DIRECTORY",

  COPY_GAME_FILES = "COPY_GAME_FILES",
  DELETE_GAME_FILES = "DELETE_GAME_FILES",
  COPY_ENB_FILES = "COPY_ENB_FILES",
  DELETE_ENB_FILES = "DELETE_ENB_FILES",

  CHECK_IF_FILE_EXISTS = "CHECK_IF_FILE_EXISTS",
}
