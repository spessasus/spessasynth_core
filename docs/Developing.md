# Contributing to spessasynth_core

I welcome new contributors that want to help develop spessasynth_core!


## Developing spessasynth_core with the SpessaSynth app
I recommend developing the libraries with using the web app as the test environment as it allows testing the changes extensively.
It also enforces the requirement of **spessasynth_core being able to run in the AudioWorklet scope.**

### Preparation
1. If you are on Windows, [obtain WSL](https://learn.microsoft.com/en-us/windows/wsl/install).
2. Install esbuild `npm install -g esbuild`
3. Create a directory where you want to develop.
4. Clone your fork of `spessasynth_core` into the directory.
5. Clone `spessasynth_lib` into the directory.
6. Clone `SpessaSynth` into the directory.
7. You now should have the following structure:
   - your_folder
     - spessasynth_core (your fork of it)
     - spessasynth_lib
     - SpessaSynth

8. Execute `chmod +x *.sh` in `spessasynth_lib` and `SpessaSynth`
9. Execute `npm run debug` in `SpessaSynth` and `spessasynth_lib`

### Start coding
To test your changes, run `npm run build` in `SpessaSynth` again and hard-reload the page via `Ctrl + Shift + R`.

> [!CAUTION]
> Source maps in audioWorklet don't seem to work on Firefox.
> You must use a Chromium-based browser instead.

### Create a pull request
After everything works as planned, open the pull request.

*Note: consider running `npm run release` in both `spessasynth_lib` and `SpessaSynth` to disable the development mode once you are done.*
