const fs = require("fs").promises;
const fs_sync = require("fs");
const path = require("path");

// Define directory paths
const currentDir = __dirname;

const srcDir = path.join(currentDir, "src");
const appDir = path.join(currentDir, "app");
const appSrcDir = path.join(appDir, "src");
const appCommonSrcDir = path.join(appSrcDir, "common");
const commonSourceDir = path.join(currentDir, "../common");

// List of modules to copy to the application directory
const modules = [
  "api-member",
  "claim",
  "hash",
  "ingress",
  "links",
  "pod-connector",
  "router-port",
  "sc-apiserver",
  "sc-main",
  "sync-site-kube",
];

// List of common modules to copy to the application directory
const commonModules = [
  "amqp",
  "common",
  "kube",
  "log",
  "protocol",
  "router",
  "state-sync",
  "util",
];

// Function to clean up previous build, if present
async function cleanupPreviousBuild() {
  try {
    // Remove 'app' directory and its contents recursively
    await fs.rm(appDir, { recursive: true });
  } catch (err) {
    // If the directory doesn't exist, do nothing
    if (err.code !== "ENOENT") {
      throw err;
    }
  }
}

// Function to create necessary directories for the build
async function createDirectories() {
  await fs.mkdir(appDir);
  await fs.mkdir(appSrcDir);
  await fs.mkdir(appCommonSrcDir);
}

// Function to copy files from source directory to destination directory concurrently
async function copyFiles(files, sourceDir, destinationDir) {
  await Promise.all(
    files.map((file) =>
      fs.copyFile(path.join(sourceDir, file), path.join(destinationDir, file))
    )
  );
}

// Function to copy top-level files
async function copyTop() {
  const files = ["index.js"];
  await copyFiles(files, currentDir, appDir);
}

// Function to copy modules to the application directory
async function copyModules() {
  await copyFiles(
    modules.map((module) => `${module}.js`),
    srcDir,
    appSrcDir
  );
}

// Function to copy common modules to the application directory
async function copyCommonModules() {
  await copyFiles(
    commonModules.map((module) => `${module}.js`),
    commonSourceDir,
    appCommonSrcDir
  );
}

// Main function that runs the entire build process
async function build() {
  try {
    await cleanupPreviousBuild();
    await createDirectories();

    await Promise.all([copyModules(), copyCommonModules(), copyTop()]);

    console.log("Site controller build completed successfully.");
  } catch (error) {
    await cleanupPreviousBuild();
    console.error("An error occurred:", error);
    process.exit(1);
  }
}

// Start the build process
build();
