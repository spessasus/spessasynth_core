# DLS parser

The DLS parser works like this:

1. The DLS file gets read into the `DownloadableSounds` class, which is the representation of the entire DLS file structure.
2. The structure contains the code to convert itself into a BasicSoundBank.
3. The sound bank can now be synthesizer and saved like an SF2 file.

The writing works similarly:
1. The BasicSoundBank gets converted by `DownloadableSounds` class into the DLS structure.
2. The DLS structure gets written as the DLS file.