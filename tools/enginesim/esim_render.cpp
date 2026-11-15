// Headless recorder for AngeTheGreat's Engine Simulator (MIT): compile one engine script, drive it
// through a timed plan (starter, ignition, speed control, dynamometer) and write what the exhaust
// synthesizer makes as 32-bit float WAV takes with a telemetry log beside each one. No window and
// no audio device: the synthesizer is drained on this thread after every frame, before its
// automatic leveller, so takes keep their true loudness relative to each other.
//
//   esim_render --es-root <dir with es/> --engine <engine.mr> --plan <plan.txt> --out <dir> [--input-cutoff <Hz>]
//
// Plan: one command per line, '#' starts a comment.
//   sim <s>                     run the simulation for s seconds
//   take <name> / end           record everything between the two into <out>/<name>.wav (+ .csv)
//   starter on|off              starter motor
//   ignition on|off             spark
//   throttle <x> [<per s>]      speed control 0..1 (direct linkage: throttle; governor: target speed),
//                               optionally slewed at <per s>
//   dyno off                    dynamometer released
//   dyno hold <rpm>             dynamometer holds the crank at rpm (absorbs or drives)
//   dyno grab                   dynamometer holds the crank at its current speed
//   dyno ramp <rpm> <s>         move the held speed to rpm over s seconds (runs the simulation)
//   waitrpm <rpm> <max s>       run until the engine turns at least rpm (or max s pass)
//   status                      print rpm / torque / throttle
#include "../scripting/include/compiler.h"
#include "../include/simulator.h"
#include "../include/engine.h"
#include "../include/units.h"

#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

namespace fs = std::filesystem;

namespace {

struct Args {
    std::string esRoot, engine, plan, out;
    // low-pass on the exhaust pulses before the impulse response (upstream: 1900 Hz, chosen for
    // 10 kHz simulations); 0 = upstream value
    double inputCutoff = 0;
};

bool readWavPcm16(const std::string &file, std::vector<int16_t> *samples) {
    std::ifstream in(file, std::ios::binary);
    if (!in) return false;
    std::vector<char> d((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
    if (d.size() < 44 || std::memcmp(d.data(), "RIFF", 4) || std::memcmp(d.data() + 8, "WAVE", 4)) return false;
    size_t i = 12;
    int channels = 1, bits = 16;
    while (i + 8 <= d.size()) {
        uint32_t size;
        std::memcpy(&size, d.data() + i + 4, 4);
        if (!std::memcmp(d.data() + i, "fmt ", 4)) {
            uint16_t ch, bps;
            std::memcpy(&ch, d.data() + i + 10, 2);
            std::memcpy(&bps, d.data() + i + 22, 2);
            channels = ch;
            bits = bps;
        }
        else if (!std::memcmp(d.data() + i, "data", 4)) {
            if (bits != 16) return false;
            const size_t frames = size / (2 * channels);
            samples->resize(frames);
            for (size_t k = 0; k < frames; ++k) {
                std::memcpy(&(*samples)[k], d.data() + i + 8 + k * 2 * channels, 2);
            }
            return true;
        }
        i += 8 + size + (size & 1);
    }
    return false;
}

void writeWavFloat(const std::string &file, const std::vector<float> &s, int rate) {
    std::ofstream o(file, std::ios::binary);
    const uint32_t dataBytes = static_cast<uint32_t>(s.size() * 4);
    auto u32 = [&](uint32_t v) { o.write(reinterpret_cast<const char *>(&v), 4); };
    auto u16 = [&](uint16_t v) { o.write(reinterpret_cast<const char *>(&v), 2); };
    o.write("RIFF", 4); u32(36 + dataBytes); o.write("WAVE", 4);
    o.write("fmt ", 4); u32(16); u16(3); u16(1); u32(rate); u32(rate * 4); u16(4); u16(32);
    o.write("data", 4); u32(dataBytes);
    o.write(reinterpret_cast<const char *>(s.data()), dataBytes);
}

// Synthesizer::renderAudio(int) up to (not including) the leveller, for every pending input sample.
void drainSynthesizer(Synthesizer &s, std::vector<float> *out) {
    const int n = static_cast<int>(s.m_inputChannels[0].data.size());
    if (n <= 0) return;
    for (int i = 0; i < s.m_inputChannelCount; ++i) {
        s.m_inputChannels[i].data.read(n, s.m_inputChannels[i].transferBuffer);
        s.m_inputChannels[i].data.removeBeginning(n);
    }
    s.m_inputSamplesRead = 0;

    const Synthesizer::AudioParameters ap = s.m_audioParameters;
    for (int i = 0; i < s.m_inputChannelCount; ++i) {
        s.m_filters[i].airNoiseLowPass.setCutoffFrequency(ap.airNoiseFrequencyCutoff, s.m_audioSampleRate);
        s.m_filters[i].jitterFilter.setJitterScale(ap.inputSampleNoise);
    }

    for (int k = 0; k < n; ++k) {
        float signal = 0;
        for (int i = 0; i < s.m_inputChannelCount; ++i) {
            // the upstream sample loop draws one unused random number first: keep the sequence
            (void)rand();
            const float f_in = s.m_filters[i].jitterFilter.fast_f(s.m_inputChannels[i].transferBuffer[k]);
            const float f_dc = s.m_filters[i].inputDcFilter.fast_f(f_in);
            const float f = f_in - f_dc;
            const float f_p = s.m_filters[i].derivative.f(f_in);
            const float noise = static_cast<float>(2.0 * ((double)rand() / RAND_MAX) - 1.0);
            // (upstream reads the first channel's noise filter for every channel)
            const float r = s.m_filters->airNoiseLowPass.fast_f(noise);
            const float r_mixed = ap.airNoise * r + (1 - ap.airNoise);
            float v_in = f_p * ap.dF_F_mix + f * r_mixed * (1 - ap.dF_F_mix);
            if (std::fpclassify(v_in) == FP_SUBNORMAL) v_in = 0;
            signal += ap.convolution * s.m_filters[i].convolution.f(v_in) + (1 - ap.convolution) * v_in;
        }
        signal = s.m_antialiasing.fast_f(signal);
        out->push_back(signal * ap.volume);
    }
}

struct Take {
    std::string name;
    std::vector<float> audio;
    std::ostringstream log;
    size_t start = 0;
};

class Recorder {
public:
    Simulator *sim = nullptr;
    Engine *engine = nullptr;
    std::string out;
    double t = 0;              // simulated seconds
    double speedTarget = 0, speedControl = 0, speedRate = 0;
    double dynoRpm = 0;
    bool dynoOn = false;
    Take *take = nullptr;
    std::vector<float> scratch;

    // one control frame: about 5 ms of simulation
    void frame() {
        if (speedRate > 0) {
            const double step = speedRate * 0.005;
            if (speedControl < speedTarget) speedControl = std::min(speedTarget, speedControl + step);
            else speedControl = std::max(speedTarget, speedControl - step);
        }
        else {
            speedControl = speedTarget;
        }
        engine->setSpeedControl(speedControl);
        sim->m_dyno.m_enabled = dynoOn;
        sim->m_dyno.m_hold = dynoOn;
        sim->m_dyno.m_rotationSpeed = units::rpm(dynoRpm);

        sim->startFrame(0.005);
        const int steps = sim->simulationSteps();
        while (sim->simulateStep()) {
        }
        scratch.clear();
        drainSynthesizer(sim->synthesizer(), &scratch);
        sim->endFrame();
        t += steps * sim->getTimestep();

        if (take != nullptr) {
            take->audio.insert(take->audio.end(), scratch.begin(), scratch.end());
            take->log << t << ',' << engine->getRpm() << ',' << speedControl << ',' << engine->getThrottle() << ','
                      << sim->getFilteredDynoTorque() << ',' << units::convert(engine->getManifoldPressure(), units::kPa) << ','
                      << take->audio.size() << '\n';
        }
    }

    void run(double seconds) {
        const double end = t + seconds;
        while (t < end) frame();
    }

    void status(const std::string &what) {
        std::printf("[%8.3f s] %-14s rpm %7.1f  torque %8.2f N*m  speed %.3f  throttle %.3f\n", t, what.c_str(),
                    engine->getRpm(), sim->getFilteredDynoTorque(), speedControl, engine->getThrottle());
        std::fflush(stdout);
    }

    void endTake() {
        if (take == nullptr) return;
        writeWavFloat((fs::path(out) / (take->name + ".wav")).string(), take->audio, 44100);
        std::ofstream csv((fs::path(out) / (take->name + ".csv")).string());
        csv << "t,rpm,speed_control,throttle,dyno_torque_nm,manifold_kpa,sample\n" << take->log.str();
        status("end " + take->name);
        delete take;
        take = nullptr;
    }
};

bool parseArgs(int argc, char **argv, Args *a) {
    for (int i = 1; i + 1 < argc; i += 2) {
        const std::string k = argv[i];
        const std::string v = argv[i + 1];
        if (k == "--es-root") a->esRoot = v;
        else if (k == "--engine") a->engine = v;
        else if (k == "--plan") a->plan = v;
        else if (k == "--out") a->out = v;
        else if (k == "--input-cutoff") a->inputCutoff = std::atof(v.c_str());
        else return false;
    }
    return !a->esRoot.empty() && !a->engine.empty() && !a->plan.empty() && !a->out.empty();
}

} // namespace

int main(int argc, char **argv) {
    Args args;
    if (!parseArgs(argc, argv, &args)) {
        std::fprintf(stderr, "usage: esim_render --es-root <dir> --engine <engine.mr> --plan <plan.txt> --out <dir>\n");
        return 2;
    }
    const std::string engineFile = fs::absolute(args.engine).string();
    const std::string planFile = fs::absolute(args.plan).string();
    const std::string outDir = fs::absolute(args.out).string();
    fs::create_directories(outDir);
    // the script compiler looks for its library under es/ relative to the working directory
    fs::current_path(args.esRoot);
    std::srand(1);

    // engine files define `main` (set_engine / set_vehicle / set_transmission); a two-line wrapper runs it
    std::string importPath = engineFile;
    for (char &c : importPath) if (c == '\\') c = '/';
    const std::string wrapper = (fs::path(outDir) / "_main.mr").string();
    {
        std::ofstream w(wrapper);
        w << "import \"engine_sim.mr\"\nimport \"" << importPath << "\"\n\nmain()\n";
    }

    es_script::Compiler compiler;
    compiler.initialize();
    if (!compiler.compile(wrapper)) {
        std::ifstream log("error_log.log");
        std::cerr << "compile failed:\n" << log.rdbuf() << std::endl;
        return 1;
    }
    const es_script::Compiler::Output output = compiler.execute();
    compiler.destroy();

    Engine *engine = output.engine;
    Vehicle *vehicle = output.vehicle;
    Transmission *transmission = output.transmission;
    if (engine == nullptr) {
        std::cerr << "the script made no engine" << std::endl;
        return 1;
    }
    if (vehicle == nullptr) {
        Vehicle::Parameters vp;
        vp.mass = units::mass(1000, units::kg);
        vp.diffRatio = 3.42;
        vp.tireRadius = units::distance(10, units::inch);
        vp.dragCoefficient = 0.25;
        vp.crossSectionArea = units::distance(6.0, units::foot) * units::distance(6.0, units::foot);
        vp.rollingResistance = 2000.0;
        vehicle = new Vehicle;
        vehicle->initialize(vp);
    }
    if (transmission == nullptr) {
        static const double ratios[] = { 2.97, 2.07, 1.43, 1.00 };
        Transmission::Parameters tp;
        tp.GearCount = 4;
        tp.GearRatios = ratios;
        tp.MaxClutchTorque = units::torque(1000.0, units::ft_lb);
        transmission = new Transmission;
        transmission->initialize(tp);
    }

    engine->calculateDisplacement();
    Simulator *sim = engine->createSimulator(vehicle, transmission);
    sim->setSimulationFrequency(static_cast<int>(engine->getSimulationFrequency()));
    Synthesizer::AudioParameters ap = sim->synthesizer().getAudioParameters();
    ap.inputSampleNoise = static_cast<float>(engine->getInitialJitter());
    ap.airNoise = static_cast<float>(engine->getInitialNoise());
    ap.dF_F_mix = static_cast<float>(engine->getInitialHighFrequencyGain());
    sim->synthesizer().setAudioParameters(ap);
    for (int i = 0; i < engine->getExhaustSystemCount(); ++i) {
        ImpulseResponse *ir = engine->getExhaustSystem(i)->getImpulseResponse();
        std::vector<int16_t> s;
        if (!readWavPcm16(ir->getFilename(), &s)) {
            std::cerr << "cannot read impulse response " << ir->getFilename() << std::endl;
            return 1;
        }
        sim->synthesizer().initializeImpulseResponse(s.data(), static_cast<unsigned int>(s.size()), static_cast<float>(ir->getVolume()), i);
    }
    if (args.inputCutoff > 0) {
        // the pulses are simulated well above 10 kHz here: let more of their edges through
        for (int i = 0; i < sim->synthesizer().m_inputChannelCount; ++i) {
            sim->synthesizer().m_filters[i].antialiasing.setCutoffFrequency(args.inputCutoff, 44100.0);
        }
    }
    std::printf("engine \"%s\": %d cylinders, %.0f cc, redline %.0f rpm, sim %.0f Hz, %d exhaust(s)\n",
                engine->getName().c_str(), engine->getCylinderCount(), units::convert(engine->getDisplacement(), units::cc),
                units::toRpm(engine->getRedline()), engine->getSimulationFrequency(), engine->getExhaustSystemCount());

    Recorder rec;
    rec.sim = sim;
    rec.engine = engine;
    rec.out = outDir;

    std::ifstream plan(planFile);
    if (!plan) {
        std::cerr << "cannot read plan " << planFile << std::endl;
        return 1;
    }
    std::string line;
    int lineNo = 0;
    while (std::getline(plan, line)) {
        ++lineNo;
        const size_t hash = line.find('#');
        if (hash != std::string::npos) line.resize(hash);
        std::istringstream in(line);
        std::string cmd;
        if (!(in >> cmd)) continue;
        if (cmd == "sim") {
            double s = 0;
            in >> s;
            rec.run(s);
        }
        else if (cmd == "take") {
            rec.endTake();
            rec.take = new Take;
            in >> rec.take->name;
        }
        else if (cmd == "end") rec.endTake();
        else if (cmd == "starter") {
            std::string v;
            in >> v;
            sim->m_starterMotor.m_enabled = (v == "on");
        }
        else if (cmd == "ignition") {
            std::string v;
            in >> v;
            engine->getIgnitionModule()->m_enabled = (v == "on");
        }
        else if (cmd == "throttle") {
            rec.speedRate = 0;
            in >> rec.speedTarget >> rec.speedRate;
        }
        else if (cmd == "dyno") {
            std::string v;
            in >> v;
            if (v == "off") rec.dynoOn = false;
            else if (v == "grab") {
                // take hold at whatever the crank is doing now
                rec.dynoRpm = engine->getRpm();
                rec.dynoOn = true;
            }
            else if (v == "hold") {
                in >> rec.dynoRpm;
                rec.dynoOn = true;
            }
            else if (v == "ramp") {
                double rpm = 0, s = 0;
                in >> rpm >> s;
                rec.dynoOn = true;
                const double r0 = rec.dynoRpm;
                const double t0 = rec.t;
                while (rec.t < t0 + s) {
                    rec.dynoRpm = r0 + (rpm - r0) * std::min(1.0, (rec.t - t0) / s);
                    rec.frame();
                }
                rec.dynoRpm = rpm;
            }
        }
        else if (cmd == "waitrpm") {
            double rpm = 0, s = 0;
            in >> rpm >> s;
            const double t0 = rec.t;
            while (rec.t < t0 + s && engine->getRpm() < rpm) rec.frame();
        }
        else if (cmd == "status") {
            std::string what;
            in >> what;
            rec.status(what);
        }
        else {
            std::fprintf(stderr, "%s:%d: unknown command %s\n", planFile.c_str(), lineNo, cmd.c_str());
            return 1;
        }
    }
    rec.endTake();
    rec.status("done");
    // (the process exits here; the simulation objects die with it)
    std::fflush(stdout);
    std::_Exit(0);
}
