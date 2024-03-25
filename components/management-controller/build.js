const fs = require('fs').promises;
const path = require('path');
const uglify = require('uglify-js');

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
  'config',
  'db',
  'manage-sync',
  'mc-apiserver',
  'mc-main',
  'prune',
];

// List of common modules to copy to the application directory
const commonModules = ['amqp', 'kube', 'log', 'protocol', 'util'];

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

// Function to minify a single file
async function minifyFile(inputFile, outputFile) {
  const code = await fs.readFile(inputFile, 'utf8');
  const minifiedCode = uglify.minify(code, {
    compress: true,
    mangle: true,
  }).code;

  await fs.writeFile(outputFile, minifiedCode, 'utf8');
}

// Function to minify all module files concurrently
async function minifyFiles() {
  const moduleTasks = modules.map((module) =>
    minifyFile(`${srcDir}/${module}.js`, `${appSrcDir}/${module}.js`)
  );

  const commonModuleTasks = commonModules.map((module) =>
    minifyFile(
      `${commonSourceDir}/${module}.js`,
      `${appCommonSrcDir}/${module}.js`
    )
  );
  await Promise.all([...moduleTasks, ...commonModuleTasks]);
}

// Function to minify index.js and move it to the application directory
async function minifyIndex() {
  const code = await fs.readFile(entryPoint, 'utf8');
  const minifiedCode = uglify.minify(code, {
    compress: true,
    mangle: true,
  }).code;

  await fs.writeFile(appEntryPoint, minifiedCode, 'utf8');
}

// Function to copy files from source directory to destination directory concurrently
async function copyFiles(files, sourceDir, destinationDir) {
  await Promise.all(
    files.map((file) =>
      fs.copyFile(path.join(sourceDir, file), path.join(destinationDir, file))
    )
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
  // Check if the source directory exists
  await fs.access(consoleBuildSourceDir);
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

    await Promise.all([copyModules(), copyCommonModules()]);
    await Promise.all([minifyIndex(), minifyFiles()]);

    await copyConsoleBuild();
  } catch (error) {
    cleanupPreviousBuild();
    console.error('An error occurred:', error);
  }
}

// Start the build process
build();
