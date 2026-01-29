# Contributing to spessasynth_core

I welcome new contributors that want to help develop spessasynth_core!

## Developing spessasynth_core with the SpessaSynth app

I recommend developing the libraries with using the web app as the test environment as it allows testing the changes
extensively.
It also enforces the requirement of **spessasynth_core being able to run in the AudioWorklet scope.**

### Preparation

1. If you are on Windows, [obtain WSL](https://learn.microsoft.com/en-us/windows/wsl/install).
2. Install esbuild `npm install -g esbuild`
3. Create a directory where you want to develop.
4. Clone your fork of `spessasynth_core` into the directory.
5. Clone `spessasynth_lib` (or your fork of it) into the directory.
6. Clone `SpessaSynth` into the directory.
7. You now should have the following structure:
    - your directory
        - spessasynth_core (your fork of it)
        - spessasynth_lib
        - SpessaSynth

### Start coding

To test your changes, run the `packed_libs.sh` file from `SpessaSynth`. This does three things:

1. It builds your copy of `spessasynth_core`
2. It builds your copy of `spessasynth_lib`, using your copy of `core`.
3. It builds `SpessaSynth` using your copies of both the libraries.

You can keep the `npm start` script running during this. Once it's done, simply perform a hard reload in your browser (`Ctrl + Shift + R`)

!!! Danger

    Source maps in audioWorklet don't seem to work on Firefox.
    You must use a Chromium-based browser instead.

### Create a pull request

After everything works as planned, open the pull request.
