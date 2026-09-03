#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

const SEMVER_REGEX = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$/;

function printUsage() {
  console.log(`
Usage:
  pnpm bump <patch|minor|major|<new-version>>

Examples:
  pnpm bump patch    # 0.1.8 -> 0.1.9
  pnpm bump minor    # 0.1.8 -> 0.2.0
  pnpm bump major    # 0.1.8 -> 1.0.0
  pnpm bump 0.2.5    # set exact version 0.2.5
`);
}

function parseSemver(versionStr) {
  const match = versionStr.trim().match(SEMVER_REGEX);
  if (!match) {
    return null;
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || '',
    build: match[5] || '',
  };
}

function calculateNewVersion(currentVersion, bumpTypeOrVersion) {
  const parsedCurrent = parseSemver(currentVersion);
  if (!parsedCurrent) {
    throw new Error(`Current version "${currentVersion}" is not a valid semver string.`);
  }

  const target = bumpTypeOrVersion.trim().toLowerCase();

  if (target === 'patch') {
    return `${parsedCurrent.major}.${parsedCurrent.minor}.${parsedCurrent.patch + 1}`;
  }
  if (target === 'minor') {
    return `${parsedCurrent.major}.${parsedCurrent.minor + 1}.0`;
  }
  if (target === 'major') {
    return `${parsedCurrent.major + 1}.0.0`;
  }

  // Explicit version provided
  const parsedTarget = parseSemver(bumpTypeOrVersion);
  if (!parsedTarget) {
    throw new Error(
      `Invalid version target "${bumpTypeOrVersion}". Expected "patch", "minor", "major", or a semver string (e.g. "0.2.0").`
    );
  }

  return bumpTypeOrVersion.trim().replace(/^v/, '');
}

function updateJsonVersion(content, newVersion) {
  const versionRegex = /^(\s*"version"\s*:\s*)"[^"]*"/m;
  if (!versionRegex.test(content)) {
    throw new Error('Could not find "version" field in JSON file');
  }
  return content.replace(versionRegex, `$1"${newVersion}"`);
}

function updateCargoToml(content, newVersion) {
  const packageMatch = content.match(/^\[package\]([\s\S]*?)(?=^\[|\z)/m);
  if (!packageMatch) {
    throw new Error('Could not find [package] section in Cargo.toml');
  }
  const packageSection = packageMatch[0];
  const updatedSection = packageSection.replace(
    /^(\s*version\s*=\s*)"[^"]*"/m,
    `$1"${newVersion}"`
  );
  if (packageSection === updatedSection) {
    throw new Error('Failed to replace version in [package] section of Cargo.toml');
  }
  return content.replace(packageSection, updatedSection);
}

function updateCargoLock(content, newVersion) {
  const gptWrapPackageRegex = /(\[\[package\]\][\r\n]+name\s*=\s*"gpt-wrap"[\r\n]+version\s*=\s*)"[^"]*"/;
  if (!gptWrapPackageRegex.test(content)) {
    return content;
  }
  return content.replace(gptWrapPackageRegex, `$1"${newVersion}"`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === '-h' || args[0] === '--help') {
    printUsage();
    process.exit(args.length === 0 ? 1 : 0);
  }

  try {
    const bumpArg = args[0];

    const packageJsonPath = resolve(rootDir, 'package.json');
    const tauriConfPath = resolve(rootDir, 'src-tauri/tauri.conf.json');
    const cargoTomlPath = resolve(rootDir, 'src-tauri/Cargo.toml');
    const cargoLockPath = resolve(rootDir, 'src-tauri/Cargo.lock');

    // 1. Read package.json
    const packageJsonContent = readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(packageJsonContent);
    const currentVersion = packageJson.version;
    const newVersion = calculateNewVersion(currentVersion, bumpArg);

    if (newVersion === currentVersion) {
      console.log(`Version is already ${currentVersion}. Nothing to update.`);
      process.exit(0);
    }

    console.log(`Bumping version: ${currentVersion} -> ${newVersion}\n`);

    // 2. Update package.json
    const updatedPackageJson = updateJsonVersion(packageJsonContent, newVersion);
    writeFileSync(packageJsonPath, updatedPackageJson, 'utf8');
    console.log(`  ✓ Updated package.json`);

    // 3. Update src-tauri/tauri.conf.json
    const tauriConfContent = readFileSync(tauriConfPath, 'utf8');
    const updatedTauriConf = updateJsonVersion(tauriConfContent, newVersion);
    writeFileSync(tauriConfPath, updatedTauriConf, 'utf8');
    console.log(`  ✓ Updated src-tauri/tauri.conf.json`);

    // 4. Update src-tauri/Cargo.toml
    const cargoTomlContent = readFileSync(cargoTomlPath, 'utf8');
    const updatedCargoToml = updateCargoToml(cargoTomlContent, newVersion);
    writeFileSync(cargoTomlPath, updatedCargoToml, 'utf8');
    console.log(`  ✓ Updated src-tauri/Cargo.toml`);

    // 5. Update src-tauri/Cargo.lock
    try {
      const cargoLockContent = readFileSync(cargoLockPath, 'utf8');
      const updatedCargoLock = updateCargoLock(cargoLockContent, newVersion);
      writeFileSync(cargoLockPath, updatedCargoLock, 'utf8');

      // Run cargo check to ensure lockfile is fully synchronized
      try {
        execSync('cargo check --manifest-path src-tauri/Cargo.toml --quiet', {
          cwd: rootDir,
          stdio: 'ignore',
        });
      } catch (_) {
        // Ignore if cargo check has non-fatal issues
      }
      console.log(`  ✓ Updated src-tauri/Cargo.lock`);
    } catch (err) {
      console.warn(`  ! Note: Could not update src-tauri/Cargo.lock: ${err.message}`);
    }

    console.log(`\nSuccessfully bumped version to v${newVersion}!`);
    console.log(`\nNext steps:`);
    console.log(`  git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock`);
    console.log(`  git commit -m "chore: release v${newVersion}"`);
    console.log(`  git tag v${newVersion}`);
    console.log(`  git push origin main --tags`);
  } catch (err) {
    console.error(`\nError: ${err.message}\n`);
    printUsage();
    process.exit(1);
  }
}

main();
