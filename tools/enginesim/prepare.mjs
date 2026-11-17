// Lay out a headless build of AngeTheGreat's Engine Simulator (MIT, github.com/ange-yaghi/engine-sim)
// for recording the ModCar engine banks: no window, no audio device, no SDL / Boost.
//
//   node tools/enginesim/prepare.mjs --src <engine-sim clone> --out <dir> [--build] [--flex <win_flex.exe>] [--bison <win_bison.exe>]
//
// The clone is read only. <out>/patched gets a copy of the simulation, scripting and script library
// sources with three small patches (a stub for the renderer header the synthesizer includes,
// std::filesystem in place of Boost in piranha's path class, and room for more than eight cylinders
// in the synthesizer feed) plus our recorder; --build compiles it with MSVC + Ninja into
// <out>/build/esim_render.exe.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
// the commit the banks were recorded with
export const ENGINE_SIM_COMMIT = '85f7c3b959a908ed5232ede4f1a4ac7eafe6b630';

function arg(name, def) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
}
const src = path.resolve(arg('--src', ''));
const out = path.resolve(arg('--out', ''));
if (!arg('--src') || !arg('--out')) {
  console.error('usage: node prepare.mjs --src <engine-sim clone> --out <dir> [--build]');
  process.exit(2);
}
const patched = path.join(out, 'patched');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const e of fs.readdirSync(from, { withFileTypes: true })) {
    if (e.name === '.git') continue;
    const a = path.join(from, e.name);
    const b = path.join(to, e.name);
    if (e.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

fs.rmSync(patched, { recursive: true, force: true });
for (const d of ['include', 'src', 'scripting', 'es', 'dependencies/submodules/piranha', 'dependencies/submodules/simple-2d-constraint-solver', 'dependencies/submodules/csv-io']) {
  copyDir(path.join(src, d), path.join(patched, d));
}
fs.copyFileSync(path.join(src, 'LICENSE'), path.join(patched, 'LICENSE'));

// 1. the synthesizer includes the renderer's umbrella header but uses nothing from it
fs.writeFileSync(path.join(patched, 'include/delta.h'), '// headless build: the delta-studio renderer is not part of the recorder\n#pragma once\n');

// 2. piranha keeps its paths in Boost.Filesystem; std::filesystem does the same job
fs.writeFileSync(path.join(patched, 'dependencies/submodules/piranha/src/path.cpp'), `// headless build: std::filesystem in place of Boost.Filesystem
#include <filesystem>
#include <system_error>

namespace boost {
    namespace filesystem {
        class path : public std::filesystem::path {
        public:
            using std::filesystem::path::path;
            path() = default;
            path(const std::filesystem::path &p) : std::filesystem::path(p) {}
            bool is_complete() const { return is_absolute(); }
        };
    } /* namespace filesystem */
} /* namespace boost */

#include "../include/path.h"
#include "../include/memory_tracker.h"

piranha::Path::Path(const std::string &path) { m_path = nullptr; setPath(path); }
piranha::Path::Path(const char *path) { m_path = nullptr; setPath(std::string(path)); }
piranha::Path::Path(const Path &path) { m_path = TRACK(new boost::filesystem::path); *m_path = path.getBoostPath(); }
piranha::Path::Path() { m_path = nullptr; }
piranha::Path::Path(const boost::filesystem::path &path) { m_path = TRACK(new boost::filesystem::path); *m_path = path; }
piranha::Path::~Path() { if (m_path != nullptr) delete FTRACK(m_path); }
std::string piranha::Path::toString() const { return m_path->string(); }
void piranha::Path::setPath(const std::string &path) {
    if (m_path != nullptr) delete FTRACK(m_path);
    m_path = TRACK(new boost::filesystem::path(path));
}
bool piranha::Path::operator==(const Path &path) const {
    std::error_code ec;
    const bool same = std::filesystem::equivalent(getBoostPath(), path.getBoostPath(), ec);
    return !ec && same;
}
piranha::Path piranha::Path::append(const Path &path) const {
    return Path(boost::filesystem::path(getBoostPath() / path.getBoostPath()));
}
void piranha::Path::getParentPath(Path *path) const {
    path->m_path = TRACK(new boost::filesystem::path);
    *path->m_path = boost::filesystem::path(m_path->parent_path());
}
const piranha::Path &piranha::Path::operator=(const Path &b) {
    if (m_path != nullptr) delete FTRACK(m_path);
    m_path = TRACK(new boost::filesystem::path);
    *m_path = b.getBoostPath();
    return *this;
}
std::string piranha::Path::getExtension() const { return m_path->extension().string(); }
std::string piranha::Path::getStem() const { return m_path->stem().string(); }
bool piranha::Path::isAbsolute() const { return m_path->is_complete(); }
bool piranha::Path::exists() const { std::error_code ec; return std::filesystem::exists(*m_path, ec); }
`);

// 3. the synthesizer feed keeps each cylinder's last exhaust valve lift in a static array of eight
// (written, never read): an engine with more than eight cylinders (the V12) would write past its end
{
  const file = path.join(patched, 'src/piston_engine_simulator.cpp');
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace('static double lastValveLift[8] = { 0, 0, 0, 0, 0, 0, 0, 0 };', 'static double lastValveLift[64] = { 0 };');
  if (after === before) throw new Error(`${file}: the lastValveLift array was not found`);
  fs.writeFileSync(file, after);
}

// 4. our recorder and its build
fs.mkdirSync(path.join(patched, 'headless'), { recursive: true });
for (const f of ['CMakeLists.txt', 'esim_render.cpp']) fs.copyFileSync(path.join(HERE, f), path.join(patched, 'headless', f));
console.log(`patched sources in ${patched}`);

if (process.argv.includes('--build')) {
  const vsw = 'C:/Program Files (x86)/Microsoft Visual Studio/Installer/vswhere.exe';
  const vs = execFileSync(vsw, ['-latest', '-products', '*', '-requires', 'Microsoft.VisualStudio.Component.VC.Tools.x86.x64', '-property', 'installationPath'], { encoding: 'utf8' }).trim();
  const vcvars = path.join(vs, 'VC/Auxiliary/Build/vcvars64.bat');
  const cmake = path.join(vs, 'Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe');
  const ninja = path.join(vs, 'Common7/IDE/CommonExtensions/Microsoft/CMake/Ninja/ninja.exe');
  const build = path.join(out, 'build');
  const flex = path.resolve(arg('--flex', 'win_flex'));
  const bison = path.resolve(arg('--bison', 'win_bison'));
  const bat = path.join(out, 'build.bat');
  fs.writeFileSync(bat, [
    '@echo off',
    `call "${vcvars}" >nul || exit /b 1`,
    `"${cmake}" -S "${path.join(patched, 'headless')}" -B "${build}" -G Ninja -DCMAKE_MAKE_PROGRAM="${ninja}" -DCMAKE_BUILD_TYPE=Release -DFLEX_EXE="${flex}" -DBISON_EXE="${bison}" || exit /b 1`,
    `"${cmake}" --build "${build}" --parallel || exit /b 1`,
    '',
  ].join('\r\n'));
  execFileSync('cmd.exe', ['/d', '/c', bat], { stdio: 'inherit', cwd: out });
  console.log(`built ${path.join(build, 'esim_render.exe')}`);
}
