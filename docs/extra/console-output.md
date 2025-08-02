# Managing the console output

By default, SpessaSynth prints out a lot of stuff to console.
Here's how you can disable it:

### Main thread

#### SpessaSynthLogging

```ts
SpessaSynthLogging(enableInfo, enableWarning, enableGroup, enableTable);
```

All the input variables are booleans corresponding to the things SpessaSynth logs.

- Info - all general info such as parsing sound banks, midi files, RPN changes, etc.
- Warnings - all messages unrecognized by the synthesizer, other warnings
- group - the groups for parsing the sound banks and midi files.
- table - the debug table when `enableDebugging` is set to `true` for `synth.noteOn`

### Synthetizer

```ts
synth.setLogLevel(enableInfo, enableWarning, enableGroup, enableTable);
```

Same arguments as above.