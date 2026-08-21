# This is the MIDI file test folder.

The code here is responsible for generating various test MIDI files.

Run `npm run test:midi` to generate the files. They will appear in the `generated` directory.

Run `npm run test:midi:render` to render them with SpessaSynth and, if
Falcosoft MIDI Player (via wine or native) is available, the SCVA/SYXG50 VSTi
references. They will appear in the `rendered` directory.

Only changed MIDI files are re-rendered with the VSTi references.
