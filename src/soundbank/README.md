## This is the SoundFont and DLS parsing library.

The code here is responsible for parsing the SoundFont2/DLS file and
providing an easy way to get the data out.

- `sound_bank_loader.ts` is the entry point to loading sound bank files.

- `basic_soundbank` folder contains the classes that represent a sound bank file.

- `soundfont` folder contains the code for reading and writing a `.sf2` file.

- `dls` folder contains the code for reading and writing a `.dls` file (and converting in into a BasicSoundBank representation).
