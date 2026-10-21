import { fileURLToPath } from "node:url";
export const repositoryRoot = fileURLToPath(
  new URL("../../../", import.meta.url),
);
export const defaultDataDirectory = fileURLToPath(
  new URL("../../../.playtest/", import.meta.url),
);
export const clientDirectory = fileURLToPath(
  new URL("../dist/", import.meta.url),
);
