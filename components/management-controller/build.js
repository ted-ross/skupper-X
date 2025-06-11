const fs = require('fs').promises;
const fs_sync = require('fs');
const path = require('path');

// Define directory paths
const currentDir = __dirname;

const srcDir = path.join(currentDir, 'src');
const appDir = path.join(currentDir, 'app');
const appSrcDir = path.join(appDir, 'src');
const appCommonSrcDir = path.join(appSrcDir, 'common');
const appConsoleSrcDir = path.join(appSrcDir, 'console');
const commonSourceDir = path.join(currentDir, '../common');
const consoleBuildSourceDir = path.join(currentDir, '../console/build');
const entryPoint = path.join(currentDir, 'index.js');
const appEntryPoint = path.join(appDir, 'index.js');

// List of modules to copy to the application directory
const modules = [
  'api-admin',
  'api-user',
  'backbone-links',
  'site-templates',
  'site-deployment-state',
  'certs',
  'claim-server',
  'compose',
  'config',
  'crd-templates',
  'db',
  'gotemplate',
  'ident',
  'mc-apiserver',
  'mc-main',
  'prune',
  'sync-application',
  'sync-management',
];

// List of common modules to copy to the application directory
const commonModules = ['amqp', 'common', 'kube', 'log', 'protocol', 'router', 'state-sync', 'util'];

// Function to clean up previous build, if present
async function cleanupPreviousBuild() {
  try {
    // Remove 'app' directory and its contents recursively
    await fs.rm(appDir, { recursive: true });
  } catch (err) {
    // If the directory doesn't exist, do nothing
    if (err.code !== 'ENOENT') {
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

async function copyTop() {
    let files = ['index.js'];
    const extras = ['keycloak.json'];

    for (const extra of extras) {
        if (fs_sync.existsSync(extra)) {
            files.push(extra);
        }
    }

    await copyFiles(
        files,
        currentDir,
        appDir
    );
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

// Function to copy the build from the console directory to the application directory
async function copyConsoleBuild() {
  // Check if console build exists, if not build it first
  try {
    await fs.access(consoleBuildSourceDir);
    console.log('Console build found, proceeding with copy...');
  } catch (error) {
    console.log('Console build not found, building console first...');
    const { execSync } = require('child_process');
    try {
      execSync('cd ../console && yarn build', { stdio: 'inherit', cwd: currentDir });
      console.log('Console build completed successfully.');
    } catch (buildError) {
      throw new Error(`Failed to build console: ${buildError.message}`);
    }
  }
  
  // Create the destination directory if it doesn't exist
  await fs.mkdir(appConsoleSrcDir, { recursive: true });

  // Recursive function to copy all files and subdirectories
  async function copyRecursive(source, destination) {
    const files = await fs.readdir(source);

    for (const file of files) {
      const sourcePath = path.join(source, file);
      const destinationPath = path.join(destination, file);
      const stat = await fs.stat(sourcePath);

      if (stat.isDirectory()) {
        // If it's a directory, recursively copy its contents
        await fs.mkdir(destinationPath, { recursive: true });
        await copyRecursive(sourcePath, destinationPath);
      } else {
        await fs.copyFile(sourcePath, destinationPath);
      }
    }
  }

  // Start copying recursively from source to destination
  await copyRecursive(consoleBuildSourceDir, appConsoleSrcDir);

  console.log('Console build copied successfully.');
}

// Main function that runs the entire build process
async function build() {
  try {
    await cleanupPreviousBuild();
    await createDirectories();

    await Promise.all([copyModules(), copyCommonModules(), copyTop()]);

    await copyConsoleBuild();
  } catch (error) {
    cleanupPreviousBuild();
    console.error('An error occurred:', error);
  }
}

// Start the build process
build();
