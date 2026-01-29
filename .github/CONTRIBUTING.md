## Contributing to SpessaSynth

First, I want to thank you for wanting to help develop spessasynth_core.
I really appreciate your contribution :-)

Here are some tips about contributing:

### Reporting a bug

Use the GitHub issue forms and please avoid using the "Blank" template unless absolutely necessary.

### Contributing a patch/enhancement

Please see [Developing](https://spessasus.github.io/spessasynth_core/extra/developer-docs/)

Also, please note that all of spessasynth*core code \_must* be able to run in the `AudioWorkletGlobalScope`,
otherwise the pull request will not be accepted.
This means that WebWorkers, TextDecoders, etc. are _not allowed._ Or a fallback function must be provided if they are used.
