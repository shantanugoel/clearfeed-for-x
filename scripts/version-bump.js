// scripts/version-bump.js
import fs from 'fs';
import path from 'path';

// --- Configuration ---
const packageJsonPath = path.resolve(process.cwd(), 'package.json');
const manifestPath = path.resolve(process.cwd(), 'public/manifest.json');
const changelogPath = path.resolve(process.cwd(), 'CHANGELOG.md');
// ---

// --- Get New Version ---
const newVersion = process.argv[2];
if (!newVersion) {
    console.error('Error: Please provide the new version number as an argument.');
    console.log('Usage: bun run version <new_version>');
    process.exit(1);
}
// Basic validation (can be improved)
if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
    console.warn(`Warning: Version "${newVersion}" doesn't strictly follow semver (x.y.z). Proceeding anyway.`);
}
console.log(`Bumping version to: ${newVersion}`);
// ---

// --- Helper Functions ---
function updateJsonVersion(filePath, version) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const data = JSON.parse(content);
        data.version = version;
        // Use null, 2 for pretty printing with 2 spaces, matching common formats
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
        console.log(`✅ Updated version in ${path.basename(filePath)}`);
    } catch (error) {
        console.error(`❌ Error updating ${path.basename(filePath)}:`, error);
        process.exit(1);
    }
}

function updateChangelog(filePath, version) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        const todayDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        const newSectionHeader = `## [${version}] - ${todayDate}`;
        const unreleasedHeader = '## [Unreleased]';

        const unreleasedIndex = lines.findIndex(line => line.startsWith(unreleasedHeader));

        if (unreleasedIndex === -1) {
            console.error(`❌ Error: Could not find "${unreleasedHeader}" section in ${path.basename(filePath)}.`);
            process.exit(1);
        }

        // Find where to insert: right after the [Unreleased] header line
        const insertIndex = unreleasedIndex + 1;

        // Prepare the new section content
        const newSectionLines = [
            '', // Add a blank line after [Unreleased]
            newSectionHeader,
            '', // Add a blank line after the new header
            '### Added',
            '',
            '### Changed',
            '',
            '### Fixed',
            '', // Add a blank line before the next version
        ];

        // Insert the new section lines
        lines.splice(insertIndex, 0, ...newSectionLines);

        fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
        console.log(`✅ Added version section to ${path.basename(filePath)}`);

    } catch (error) {
        console.error(`❌ Error updating ${path.basename(filePath)}:`, error);
        process.exit(1);
    }
}
// ---

// --- Run Updates ---
updateJsonVersion(packageJsonPath, newVersion);
updateJsonVersion(manifestPath, newVersion);
updateChangelog(changelogPath, newVersion);
// ---

console.log('\nVersion bump complete!');