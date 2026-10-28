---
title: Contributing to spessasynth_core
---

# Contributing to spessasynth_core

I welcome new contributors that want to help develop spessasynth_core!

Below are the guidelines for contributing.

## Developing spessasynth_core with the SpessaSynth app

I recommend developing the libraries using the web app as the test environment, as it allows testing the changes
extensively.
It also enforces the requirement of **spessasynth_core being able to run in the AudioWorklet scope.**

> **Warning**
>
> All of `spessasynth_core`'s code _must_ be able to run in the `AudioWorkletGlobalScope`,
> otherwise the pull request will not be accepted.
> This means that `TextDecoder`, `TextEncoder`, etc. are _not allowed in the audio playback code_, unless a fallback function is provided.
> Code that is not related to audio (e.g. decoding MIDI text metadata) is allowed to use these.

> **Warning**
>
> No Web-only or Node-only APIs can be used in the library code. All source code must be able to run on both the Web and in Node.js.
>
> Examples and tests are intended for the Node.js environment _only_, they may use Node.js APIs.

### Preparation

1. If you are on Windows, [consider installing WSL](https://learn.microsoft.com/en-us/windows/wsl/install).
2. Create a directory where you want to develop.
3. Clone your fork of `spessasynth_core` into the directory.
4. Install the dependencies with `npm install`.
5. Clone `spessasynth_lib` (or your fork of it) into the directory and install dependencies.
6. Clone `SpessaSynth` into the directory and install dependencies.
7. You now should have the following structure:
    - your directory
        - `spessasynth_core/` (your fork of it)
        - `spessasynth_lib/`
        - `SpessaSynth/`

### Start coding

To test your changes, run the `npm run dev` script in `SpessaSynth`. This does three things:

1. It builds your copy of `spessasynth_core`
2. It builds your copy of `spessasynth_lib`, using your copy of `core`.
3. It builds `SpessaSynth` using your copies of both the libraries.

You can keep the `npm start` script (the local web server) running in another terminal during this.
Once the build is done, perform a hard reload in your browser (`Ctrl + Shift + R`).

Before opening a pull request, run `npm run build` in `spessasynth_core` and make sure that it passes,
as it lints and type-checks the code.

> **Danger**
>
> Source maps in the `AudioWorklet` don't seem to work on Firefox.
> You must use a Chromium-based browser instead.

### Create a pull request

After everything works as planned, open the pull request.
Thank you for your contribution!

## Tooling

`npm run build` must fully pass. No errors or warnings.

`npm run docs` must fully pass. No errors or warnings.

Both are included as pull request checks, so they are checked automatically every time you update your pull request.

## Code style

Below is my preferred style of writing code for `spessasynth_core`.

It is _highly recommended_ to follow it. If you are using a coding agent, it _must_ follow it.

Code must be formatted according to ESLint and Prettier before commits.
These two dictate most of the formatting. Do not override them.

Rules listed here not covered by ESLint/TypeScript or Prettier.
There are more rules, but they are automatically enforced.

### Code naming

1. Classes - PascalCase
2. Variables - camelCase
3. Constants - SCREAMING_SNAKE_CASE
4. Enums (defined as `as const` objects with `keyof typeof` types) - PascalCase

Important note: acronyms such as `MIDI` have to be written in all caps, unless they are first in camelCase. So:

#### OK

- `const midiFile`
- `class MIDIBuilder`
- `const gsEffect`

#### NOT OK

- `class MidiBuilder`

### Enum

`erasableSyntaxOnly` is enabled so regular TypeScript enums are disabled.

Use a `const` object + singular union type of its values:

```ts
const SampleTypes = {
    a: 1,
    b: 2,
    c: 3
} as const;
type SampleType = (typeof SampleTypes)[keyof typeof SampleTypes];
```

### JSDoc comments

Do not use single-line JSDoc comments.

### Avoid duplicates

- Avoid duplicate code when a shared base class or utility already provides
  the behavior. Use `super`.
- Avoid duplicated code across classes in an inheritance hierarchy.
  Move to the base class if inheriting classes use it.

### Avoid small helpers

Inline small functions that are only used once instead of extracting them.
If the function is very large, then it may be extracted.

### No meaningless fallback

If every child class overrides a base method, getter, or setter, declare it abstract in the
base class rather than providing a meaningless fallback or error implementation.

### No return types

Do not explicitly specify return types for functions/methods unless the build fails without it.

Do not specify class's member types if they can be inferred in the constructor, except defined
types. For example when an interface is defined and a raw object is assigned in the constructor,
the type may be explicitly set to the interface.

#### OK

```ts
function add(a: number, b: number) {
    return a + b;
}
```

```ts
class Foo {
    public a;

    public constructor(a: number) {
        this.a = a;
    }
}
```

#### NOT OK

```ts
function add(a: number, b: number): number {
    return a + b;
}
```

```ts
class Foo {
    public a: number;

    public constructor(a: number) {
        this.a = a;
    }
}
```

### Array construction

Prefer `const array = new Array<T>()` over `const array: T[] = []`.

Regular declaration uses `T[]`, not `Array<T>`. The above only applies to construction.

Use `Array.from` with length to inline construction
in the property declaration instead of splitting up into a `for` loop.

#### OK

```ts
const arr = new Array<number>();
```

```ts
class Foo {
    public readonly elements = Array.from({ length: 16 }, (_, i) =>
        createElement(i)
    );
}
```

#### NOT OK

```ts
const arr: number[] = [];
```

```ts
class Foo {
    public readonly channels = new Array<Element>();

    public constructor() {
        for (let i = 0; i < 16; i++) {
            this.channels.push(createElement(i));
        }
    }
}
```

### Try avoiding the method splitting pattern

Unfortunately most classes are very large, so a splitting code pattern has emerged:

- `export function name(this: Class, ...)`
- `protected readonly name = name.bind(this);`

Avoid this if possible, but follow it when extending the existing large classes.
A PR cleaning this up would be welcome too.

### Use the internal tag

Use `@internal` when a function should not be publicly available and not included in the documentation.
