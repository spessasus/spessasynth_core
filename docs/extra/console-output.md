# Managing the console output

SpessaSynth can print out additional info to the console or print nothing at all.
Here's how you can set it:

## SpessaSynthLogging

```ts
SpessaSynthLogging(enableInfo, enableWarning, enableGroup);
```

All the input variables are booleans corresponding to the things SpessaSynth logs.

- Info - all general info such as parsing sound banks, midi files, RPN changes, etc.
- Warnings - all messages unrecognized by the synthesizer, other warnings
- group - the groups for parsing the sound banks and midi files.

Same arguments as above.
