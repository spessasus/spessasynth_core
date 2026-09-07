#include <cstdio>
#include <cstdint>
#include <cstring>
#include <vector>
#include <algorithm>
#include <string>

#include "bass.h"
#include "bass_vst.h"

#if defined(_MSC_VER)
#pragma comment(lib, "bass.lib")
#pragma comment(lib, "bass_vst.lib")
#endif

#define SAMPLE_RATE 48000
#define NUM_CHANNELS 2
#define MAX_BUFFER_SIZE 2048
#define TAIL_SECONDS 2.0

#pragma pack(push, 1)
typedef struct {
    char riff[4];
    uint32_t size;
    char wave[4];
    char fmt[4];
    uint32_t fmtLength;
    uint16_t audioFormat;
    uint16_t numChannels;
    uint32_t sampleRate;
    uint32_t byteRate;
    uint16_t blockAlign;
    uint16_t bitsPerSample;
    char data[4];
    uint32_t dataSize;
} WAVHeader;
#pragma pack(pop)

static void writeWavHeader(FILE* f, const uint32_t dataSize) {
    WAVHeader header;
    memcpy(header.riff, "RIFF", 4);
    header.size = 36 + dataSize;
    memcpy(header.wave, "WAVE", 4);
    memcpy(header.fmt, "fmt ", 4);
    header.fmtLength = 16;
    header.audioFormat = 3; // IEEE float
    header.numChannels = NUM_CHANNELS;
    header.sampleRate = SAMPLE_RATE;
    header.bitsPerSample = 32;
    header.blockAlign = (NUM_CHANNELS * header.bitsPerSample) / 8;
    header.byteRate = SAMPLE_RATE * header.blockAlign;
    memcpy(header.data, "data", 4);
    header.dataSize = dataSize;

    fseek(f, 0, SEEK_SET);
    fwrite(&header, sizeof(WAVHeader), 1, f);
}

namespace {
    struct TrackEvent {
        uint64_t tick{};
        uint32_t track{};
        uint32_t order{};
        std::vector<uint8_t> bytes;
        bool tempo{};
        uint32_t tempoUSec{};
    };
}

static bool readBE16(const std::vector<uint8_t>& d, size_t& p, uint16_t& v) {
    if (p + 2 > d.size()) return false;
    v = (static_cast<uint16_t>(d[p]) << 8) | static_cast<uint16_t>(d[p + 1]);
    p += 2;
    return true;
}

static bool readBE32(const std::vector<uint8_t>& d, size_t& p, uint32_t& v) {
    if (p + 4 > d.size()) return false;
    v = (static_cast<uint32_t>(d[p]) << 24) | (static_cast<uint32_t>(d[p + 1]) << 16) |
        (static_cast<uint32_t>(d[p + 2]) << 8) | static_cast<uint32_t>(d[p + 3]);
    p += 4;
    return true;
}

static bool readVLQ(const std::vector<uint8_t>& d, size_t& p, uint32_t& v) {
    v = 0;
    for (int i = 0; i < 4; ++i) {
        if (p >= d.size()) return false;
        const uint8_t b = d[p++];
        v = (v << 7) | (b & 0x7f);
        if (!(b & 0x80)) return true;
    }
    return false; // invalid VLQ (> 4 bytes)
}

static bool readFile(const char* path, std::vector<uint8_t>& data) {
    FILE* f = fopen(path, "rb");
    if (!f) return false;

    if (fseek(f, 0, SEEK_END) != 0) {
        fclose(f);
        return false;
    }
    const long n = ftell(f);
    if (n < 0) {
        fclose(f);
        return false;
    }
    rewind(f);

    data.resize(static_cast<size_t>(n));
    if (!data.empty() && fread(data.data(), 1, data.size(), f) != data.size()) {
        fclose(f);
        return false;
    }
    fclose(f);
    return true;
}

/*
 * BASSMIDI's filter callback exposes BASS_MIDI_EVENT where sysEx is not available.
 *
 * BASS_VST_ProcessEventRaw() accepts a pointer + byte
 * length for a real SysEx message, use that here.
 */
static bool parseMIDIFile(
    const char* path,
    std::vector<TrackEvent>& outEvents,
    uint16_t& division,
    double& endTick) {
    std::vector<uint8_t> file;
    if (!readFile(path, file)) {
        printf("Could not read MIDI file: %s\n", path);
        return false;
    }

    size_t p = 0;
    if (file.size() < 14 || memcmp(file.data(), "MThd", 4) != 0) {
        printf("Not a MIDI File (missing MThd)!\n");
        return false;
    }

    p = 4;
    uint32_t headerLen = 0;
    if (!readBE32(file, p, headerLen) || headerLen < 6 || p + headerLen > file.size()) {
        printf("Invalid MIDI header!\n");
        return false;
    }

    uint16_t format = 0, tracks = 0;
    if (!readBE16(file, p, format) ||
        !readBE16(file, p, tracks) ||
        !readBE16(file, p, division)) {
        printf("Invalid MIDI header fields!\n");
        return false;
    }
    p = 8 + headerLen;

    if (format > 2) {
        printf("Unsupported MIDI format %u!\n", static_cast<unsigned>(format));
        return false;
    }
    if (division == 0) {
        printf("MIDI PPQN division is zero!\n");
        return false;
    }

    endTick = 0;

    for (uint16_t trackNo = 0; trackNo < tracks; ++trackNo) {
        if (p + 8 > file.size() || memcmp(file.data() + p, "MTrk", 4) != 0) {
            printf("Invalid MTrk chunk %u!\n", static_cast<unsigned>(trackNo));
            return false;
        }

        p += 4;
        uint32_t trackLen = 0;
        if (!readBE32(file, p, trackLen) || p + trackLen > file.size()) {
            printf("Invalid MTrk length: %u!\n", static_cast<unsigned>(trackLen));
            return false;
        }

        size_t q = p;
        size_t trackEnd = p + trackLen;
        uint64_t tick = 0;
        uint8_t runningStatus = 0;
        uint32_t trackOrder = 0;

        while (q < trackEnd) {
            uint32_t delta = 0;
            if (!readVLQ(file, q, delta)) {
                printf("Invalid MIDI delta-time in track %u.!\n", static_cast<unsigned>(trackNo));
                return false;
            }
            tick += delta;
            if (static_cast<double>(tick) > endTick) endTick = static_cast<double>(tick);

            if (q >= trackEnd) {
                printf("Truncated MIDI event!\n");
                return false;
            }

            uint8_t status = file[q++];
            if (status < 0x80) {
                if (runningStatus == 0) {
                    printf("Running status used before a status byte!\n");
                    return false;
                }
                --q; // data byte belongs to the running status
                status = runningStatus;
            }
            else if (status < 0xF0) {
                runningStatus = status;
            }
            else if (status == 0xF8 || status == 0xFA || status == 0xFB ||
                status == 0xFC || status == 0xFE || status == 0xFF) {
                // Realtime messages do not cancel running status
            }
            else {
                // System common messages cancel running status
                runningStatus = 0;
            }

            if (status == 0xFF) {
                // Meta event
                if (q >= trackEnd) return false;
                uint8_t metaType = file[q++];
                uint32_t len = 0;
                if (!readVLQ(file, q, len) || q + len > trackEnd) {
                    printf("Invalid MIDI meta event!\n");
                    return false;
                }

                if (metaType == 0x51 && len == 3) {
                    uint32_t tempo =
                        (static_cast<uint32_t>(file[q]) << 16) |
                        (static_cast<uint32_t>(file[q + 1]) << 8) |
                        static_cast<uint32_t>(file[q + 2]);

                    TrackEvent e;
                    e.tick = tick;
                    e.track = trackNo;
                    e.order = trackOrder++;
                    e.tempo = true;
                    e.tempoUSec = tempo;
                    outEvents.push_back(std::move(e));
                }

                q += len;

                if (metaType == 0x2F) {
                    // End of track
                    break;
                }
                continue;
            }

            if (status == 0xF0 || status == 0xF7) {
                uint32_t len = 0;
                if (!readVLQ(file, q, len) || q + len > trackEnd) {
                    printf("Invalid SysEx event!\n");
                    return false;
                }

                std::vector<uint8_t> sysex;
                sysex.reserve(static_cast<size_t>(len) + 2);

                // F0 is sysEx
                if (status == 0xF0) {
                    sysex.push_back(0xF0);
                    sysex.insert(sysex.end(), file.begin() + q, file.begin() + q + len);
                    if (sysex.empty() || sysex.back() != 0xF7)
                        sysex.push_back(0xF7);
                }
                else {
                    // F7 is the SMF "escaped SysEx" event
                    sysex.insert(sysex.end(), file.begin() + q, file.begin() + q + len);
                    if (sysex.empty() || sysex.front() != 0xF0) {
                        sysex.insert(sysex.begin(), 0xF0);
                    }
                    if (sysex.back() != 0xF7)
                        sysex.push_back(0xF7);
                }

                TrackEvent e;
                e.tick = tick;
                e.track = trackNo;
                e.order = trackOrder++;
                e.bytes = std::move(sysex);
                e.tempo = false;
                e.tempoUSec = 0;
                outEvents.push_back(std::move(e));

                q += len;
                continue;
            }

            if (status >= 0x80 && status <= 0xEF) {
                int dataBytes = ((status & 0xE0) == 0xC0 || (status & 0xE0) == 0xD0) ? 1 : 2;
                std::vector<uint8_t> msg;
                msg.reserve(3);
                msg.push_back(status);

                for (int i = 0; i < dataBytes; ++i) {
                    if (q >= trackEnd) {
                        printf("Truncated MIDI channel event!\n");
                        return false;
                    }
                    msg.push_back(file[q++]);
                }

                TrackEvent e;
                e.tick = tick;
                e.track = trackNo;
                e.order = trackOrder++;
                e.bytes = std::move(msg);
                e.tempo = false;
                e.tempoUSec = 0;
                outEvents.push_back(std::move(e));
                continue;
            }

            // Handle other messages
            int dataBytes = 0;
            switch (status) {
            case 0xF1:
                dataBytes = 1;
                break;
            case 0xF2:
                dataBytes = 2;
                break;
            case 0xF3:
                dataBytes = 1;
                break;
            case 0xF6:
            case 0xF8:
            case 0xF9:
            case 0xFA:
            case 0xFB:
            case 0xFC:
            case 0xFD:
            case 0xFE:
            case 0xFF:
                dataBytes = 0;
                break;
            default:
                printf("Unsupported MIDI status 0x%02X!\n", status);
                return false;
            }

            std::vector<uint8_t> msg;
            msg.reserve(3);
            msg.push_back(status);
            for (int i = 0; i < dataBytes; ++i) {
                if (q >= trackEnd) return false;
                msg.push_back(file[q++]);
            }

            TrackEvent e;
            e.tick = tick;
            e.track = trackNo;
            e.order = trackOrder++;
            e.bytes = std::move(msg);
            e.tempo = false;
            e.tempoUSec = 0;
            outEvents.push_back(std::move(e));
        }

        p = trackEnd;
    }

    // MIDI format 1 has independent tracks but one shared tempo map
    // Sorting by tick then track/order to preserve the deterministic order
    std::stable_sort(outEvents.begin(), outEvents.end(),
                     [](const TrackEvent& a, const TrackEvent& b) {
                         if (a.tick != b.tick) return a.tick < b.tick;
                         if (a.track != b.track) return a.track < b.track;
                         return a.order < b.order;
                     });

    return true;
}

static double tickToSeconds(
    const uint64_t tick,
    const uint16_t division,
    const std::vector<TrackEvent>& events) {
    const uint32_t ppqn = division;
    uint64_t prevTick = 0;
    uint32_t tempoUSec = 500000; // 120 BPM
    double seconds = 0.0;

    for (const TrackEvent& e : events) {
        if (e.tick > tick) break;

        if (e.tick > prevTick) {
            seconds += static_cast<double>(e.tick - prevTick) *
                (static_cast<double>(tempoUSec) / 1000000.0) /
                static_cast<double>(ppqn);
            prevTick = e.tick;
        }

        if (e.tempo && e.tempoUSec != 0)
            tempoUSec = e.tempoUSec;
    }

    if (tick > prevTick) {
        seconds += static_cast<double>(tick - prevTick) *
            (static_cast<double>(tempoUSec) / 1000000.0) /
            static_cast<double>(ppqn);
    }

    return seconds;
}

namespace {
    struct TimedEvent {
        uint64_t sample{};
        uint32_t track{};
        uint32_t order{};
        std::vector<uint8_t> bytes;
    };
}

static bool buildTimedEvents(
    const std::vector<TrackEvent>& source,
    const uint16_t division,
    std::vector<TimedEvent>& timed,
    uint64_t& endSample) {
    timed.clear();
    endSample = 0;

    for (const TrackEvent& e : source) {
        if (e.bytes.empty()) continue; // tempo/meta event

        double seconds = tickToSeconds(e.tick, division, source);
        if (seconds < 0.0) seconds = 0.0;

        const auto sample = static_cast<uint64_t>(seconds * SAMPLE_RATE + 0.5);

        TimedEvent te;
        te.sample = sample;
        te.track = e.track;
        te.order = e.order;
        te.bytes = e.bytes;
        timed.push_back(std::move(te));

        if (sample > endSample) endSample = sample;
    }

    std::stable_sort(timed.begin(), timed.end(),
                     [](const TimedEvent& a, const TimedEvent& b) {
                         if (a.sample != b.sample) return a.sample < b.sample;
                         if (a.track != b.track) return a.track < b.track;
                         return a.order < b.order;
                     });

    return true;
}

static bool sendVstMidi(const HSTREAM hVST, const std::vector<uint8_t>& msg) {
    if (msg.empty()) return true;

    if (msg[0] == 0xF0 || msg[0] == 0xF7) {
        // BASS_VST_ProcessEventRaw uses length > 0 to mean a SysEx message
        const BOOL ok = BASS_VST_ProcessEventRaw(
            hVST, msg.data(), static_cast<DWORD>(msg.size()));

        if (!ok) {
            printf("\nBASS_VST_ProcessEventRaw(SysEx) failed! Code: %d\n",
                   BASS_ErrorGetCode());
            return false;
        }
        return true;
    }

    // BASS_VST_ProcessEventRaw uses length == 0 for short MIDI messages:
    // The packed form is 0x00SSDD1DD2, status in bits 16..23
    uintptr_t packed = static_cast<uintptr_t>(msg[0]) << 16;
    if (msg.size() > 1) packed |= static_cast<uintptr_t>(msg[1]) << 8;
    if (msg.size() > 2) packed |= static_cast<uintptr_t>(msg[2]);

    const BOOL ok = BASS_VST_ProcessEventRaw(
        hVST, reinterpret_cast<void*>(packed), 0);

    if (!ok) {
        printf("\nBASS_VST_ProcessEventRaw(MIDI 0x%02X) failed! Code: %d\n",
               msg[0], BASS_ErrorGetCode());
        return false;
    }
    return true;
}

int main(const int argc, char* argv[]) {
    if (argc < 4) {
        printf("Usage: %s <vst_path> <midi_path> <wav_output_path>\n", argv[0]);
        return 1;
    }

    const char* vstPath = argv[1];
    const char* midiPath = argv[2];
    const char* wavPath = argv[3];

    std::vector<TrackEvent> midiEvents;
    uint16_t division = 0;

    if (double midiEndTick = 0; !parseMIDIFile(midiPath, midiEvents, division, midiEndTick))
        return 1;

    std::vector<TimedEvent> timedEvents;
    uint64_t lastMidiSample = 0;
    buildTimedEvents(midiEvents, division, timedEvents, lastMidiSample);

    printf("Parsed MIDI: %zu timed MIDI events, %zu total parsed events.\n",
           timedEvents.size(), midiEvents.size());


    if (!BASS_Init(0, SAMPLE_RATE, 0, nullptr, nullptr)) {
        printf("Failed to initialize BASS! Code: %d\n", BASS_ErrorGetCode());
        return 1;
    }

    const HSTREAM hVST = BASS_VST_ChannelCreate(
        SAMPLE_RATE, NUM_CHANNELS, vstPath,
        BASS_STREAM_DECODE | BASS_SAMPLE_FLOAT);

    if (!hVST) {
        printf("Failed to load VST plugin: %s (Code: %d)!\n",
               vstPath, BASS_ErrorGetCode());
        BASS_Free();
        return 1;
    }

    FILE* wavFile = fopen(wavPath, "wb");
    if (!wavFile) {
        printf("Failed to open output file: %s\n", wavPath);
        BASS_StreamFree(hVST);
        BASS_Free();
        return 1;
    }

    writeWavHeader(wavFile, 0);

    constexpr auto tailSamples = static_cast<uint64_t>(SAMPLE_RATE * TAIL_SECONDS);
    const uint64_t renderSamples = lastMidiSample + tailSamples;

    float vstAudioBuf[MAX_BUFFER_SIZE * NUM_CHANNELS];
    uint64_t currentSample = 0;
    size_t nextEvent = 0;
    uint64_t totalDataBytes = 0;

    printf("Rendering MIDI through VST...\n");

    while (currentSample < renderSamples) {
        // Events are sent immediately before the audio
        // quantum beginning at that sample is rendered
        while (nextEvent < timedEvents.size() &&
            timedEvents[nextEvent].sample <= currentSample) {
            if (!sendVstMidi(hVST, timedEvents[nextEvent].bytes)) {
                fclose(wavFile);
                BASS_StreamFree(hVST);
                BASS_Free();
                return 1;
            }
            ++nextEvent;
        }

        const uint64_t remaining = renderSamples - currentSample;
        uint64_t blockSamples = remaining;
        if (blockSamples > MAX_BUFFER_SIZE)
            blockSamples = MAX_BUFFER_SIZE;

        // Split at the next MIDI event so that an event is never delayed by
        // render block
        if (nextEvent < timedEvents.size()) {
            if (const uint64_t eventSample = timedEvents[nextEvent].sample;
                eventSample > currentSample &&
                eventSample - currentSample < blockSamples) {
                blockSamples = eventSample - currentSample;
            }
        }

        if (blockSamples == 0) continue;

        const auto bytes = static_cast<DWORD>(blockSamples * NUM_CHANNELS * sizeof(float));
        const DWORD got = BASS_ChannelGetData(hVST, vstAudioBuf, bytes);

        if (got == static_cast<DWORD>(-1) || got == 0) {
            printf("\nVST render failed/end-of-stream at sample %llu! Code: %d\n",
                   static_cast<unsigned long long>(currentSample), BASS_ErrorGetCode());
            break;
        }

        fwrite(vstAudioBuf, 1, got, wavFile);
        totalDataBytes += got;
        currentSample += got / (NUM_CHANNELS * sizeof(float));

        if (renderSamples > 0) {
            int percent = static_cast<int>((currentSample * 100) / renderSamples);
            if (percent > 100) percent = 100;
            printf("\rProgress: %d%%", percent);
            fflush(stdout);
        }
    }

    // Stop any notes that may still be held
    for (int ch = 0; ch < 16; ++ch) {
        const uintptr_t allNotesOff = static_cast<uintptr_t>(0xB0 | ch) << 16 | static_cast<uintptr_t>(123) << 8;
        BASS_VST_ProcessEventRaw(
            hVST, reinterpret_cast<void*>(allNotesOff), 0);
    }

    writeWavHeader(wavFile, static_cast<uint32_t>(totalDataBytes));
    fclose(wavFile);

    BASS_StreamFree(hVST);
    BASS_Free();

    printf("\nSuccessfully rendered to %s! \n", wavPath);
    return 0;
}
