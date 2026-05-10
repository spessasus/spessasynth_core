# Managing the console output

SpessaSynth can print out additional info to the console or print nothing at all.
Here's how you can set it:

## SpessaLog

A class for managing the console output.

!!! Tip

    You can log information _as `spessasynth_core` by calling the console-like methods,
    such as `.info`, `.warn`, `.group`, etc.

### setLogLevel

```ts
SpessaLog.setLogLevel(enableInfo, enableWarning, enableGroup);
```

All the input variables are booleans corresponding to the things SpessaSynth logs.

- Info - all general info such as parsing sound banks, MIDI files, RPN changes, etc.
- Warnings - all messages unrecognized by the synthesizer, other warnings
- group - the groups for parsing the sound banks and MIDI files.

### infoEnabled

The most verbose log level, prints out a lot of small details.

### warnEnabled

The default log level, prints out warnings for unexpected and erroneous behavior.

### groupEnabled

If grouping of the log messages is allowed. Recommended for the `info` verbosity level.
