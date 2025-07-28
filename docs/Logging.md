# Logging
By default, SpessaSynth prints out a lot of stuff to console.
Here's how you can disable it:

### Main thread
#### SpessaSynthLogging
```js
SpessaSynthLogging(enableInfo, enableWarning, enableGroup, enableTable);
```
All the input variables are booleans corresponding to the things SpessaSynth logs.
- Info - all general info such as parsing soundfonts, midi files, RPN changes, etc.
- Warnings - all messages unrecognized by the synthesizer, other warnings
- group - the groups for parsing the soundfont and midi files.
- table - the debug table when `enableDebugging` is set to `true` for `synth.noteOn`

### Synthetizer
```js
synth.setLogLevel(enableInfo, enableWarning, enableGroup, enableTable);
```
Same arguments as above.